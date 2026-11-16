function escapeHtml(s) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function bqStrip(line) {
  const m = /^ {0,3}> ?/.exec(line);
  return m ? line.slice(m[0].length) : line;
}

const HR_RE = /^ {0,3}((\*[ \t]*){3,}|(-[ \t]*){3,}|(_[ \t]*){3,})$/;
const ATX_RE = /^ {0,3}(#{1,6})([ \t]+|$)/;
const HTML_BLOCK_TAGS = new Set(['address','article','aside','base','basefont','blockquote','body','caption','center','col','colgroup','dd','details','dialog','dir','div','dl','dt','fieldset','figcaption','figure','footer','form','frame','frameset','h1','h2','h3','h4','h5','h6','head','header','hr','html','iframe','legend','li','link','main','menu','menuitem','nav','noframes','ol','optgroup','option','p','param','search','section','summary','table','tbody','td','tfoot','th','thead','title','tr','track','ul']);

function htmlBlockStart(line) {
  if (/^ {0,3}<(script|pre|style|textarea)([ \t]|>|$)/i.test(line)) return 1;
  if (/^ {0,3}<!--/.test(line)) return 2;
  if (/^ {0,3}<\?/.test(line)) return 3;
  if (/^ {0,3}<![A-Za-z]/.test(line)) return 4;
  if (/^ {0,3}<!\[CDATA\[/.test(line)) return 5;
  const m = /^ {0,3}<([A-Za-z][A-Za-z0-9-]*)([ \t\/>]|$)/.exec(line);
  if (m && HTML_BLOCK_TAGS.has(m[1].toLowerCase())) {
    const c = m[2];
    if (c === '\t' || c === '\n' || c === '' || c === '>' || c === '/>' || c === ' ') return 6;
    return 7;
  }
  if (/^ {0,3}<\/?[A-Za-z][A-Za-z0-9-]*([ \t][^>]*)?>[ \t]*$/.test(line)) return 7;
  return 0;
}

function htmlBlockEnd(type, line) {
  if (type >= 1 && type <= 5) {
    if (type === 1) return /<\/(script|pre|style|textarea)>/i.test(line);
    if (type === 2) return line.includes('-->');
    if (type === 3) return line.includes('?>');
    if (type === 4) return line.includes('>');
    return line.includes(']]>');
  }
  return line.trim() === '';
}

function consumeHtmlBlock(lines, i, n, type) {
  const out = [];
  if (type >= 6) {
    while (i < n && lines[i].trim() !== '') { out.push(lines[i]); i++; }
    return { out, i };
  }
  while (i < n) {
    out.push(lines[i]);
    const hit = htmlBlockEnd(type, lines[i]);
    i++;
    if (hit) break;
  }
  return { out, i };
}

function renderHtmlBlock(out, defs) {
  if (!out.length) return '';
  return out.join('\n') + '\n';
}

function splitRow(line) {
  let t = line.trim();
  if (t.startsWith('|')) t = t.slice(1);
  if (t.endsWith('|') && !t.endsWith('\\|')) t = t.slice(0, -1);
  const cells = [];
  let cur = '';
  for (let k = 0; k < t.length; k++) {
    const ch = t[k];
    if (ch === '\\' && k + 1 < t.length) { cur += ch + t[k + 1]; k++; continue; }
    if (ch === '|') { cells.push(cur); cur = ''; continue; }
    cur += ch;
  }
  cells.push(cur);
  return cells.map((c) => c.trim());
}

function isDelimRow(cells) {
  if (!cells.length) return false;
  return cells.every((c) => /^:?-+:?$/.test(c));
}

function cellAlign(cell) {
  const left = cell.startsWith(':');
  const right = cell.endsWith(':');
  if (left && right) return 'center';
  if (right) return 'right';
  if (left) return 'left';
  return null;
}

function renderTable(header, aligns, rows) {
  let out = '<table>\n<thead>\n<tr>\n';
  for (let k = 0; k < header.length; k++) {
    const a = aligns[k];
    out += '<th' + (a ? ' align="' + a + '"' : '') + '>' + header[k] + '</th>\n';
  }
  out += '</tr>\n</thead>\n';
  if (rows.length) {
    out += '<tbody>';
    for (const row of rows) {
      out += '<tr>\n';
      for (let k = 0; k < header.length; k++) {
        const a = aligns[k];
        const v = row[k] === undefined ? '' : row[k];
        out += '<td' + (a ? ' align="' + a + '"' : '') + '>' + v + '</td>\n';
      }
      out += '</tr>\n';
    }
    out += '</tbody>';
  }
  return out + '</table>\n';
}

const BULLET_RE = /^( {0,3})([-+*])([ \t]+|$)/;
const ORDERED_RE = /^( {0,3})(\d{1,9})([.)])([ \t]+|$)/;

function isHr(line) {
  return HR_RE.test(line);
}

function renderAtx(line) {
  const m = ATX_RE.exec(line);
  if (!m || m[1].length > 6) return null;
  if (/^ {0,3}#{1,6}$/.test(line)) return { empty: true, level: m[1].length };
  let text = line.slice(m[0].length);
  text = text.replace(/[ \t]+#+[ \t]*$/, '');
  return { text };
}

function fence(line) {
  const m = /^( {0,3})(`{3,}|~{3,})(.*)$/.exec(line);
  if (!m) return null;
  const info = m[3];
  if (m[2][0] === '`' && info.includes('`')) return null;
  return { indent: m[1].length, char: m[2][0], len: m[2].length, info };
}

function fenceEnd(line, f) {
  const m = /^( {0,3})(`{3,}|~{3,})[ \t]*$/.exec(line);
  return m && m[2][0] === f.char && m[2].length >= f.len;
}

function renderFence(info, text, closed) {
  let out = text;
  if (out === '' && closed) return '<pre><code' + fenceCls(info) + '></code></pre>\n';
  if (!out.endsWith('\n')) out += '\n';
  return '<pre><code' + fenceCls(info) + '>' + escapeHtml(out) + '</code></pre>\n';
}

function fenceCls(info) {
  const lang = info.trim().split(/\s+/)[0];
  return lang ? ' class="language-' + escapeHtml(lang) + '"' : '';
}

function codeBlock(text) {
  let out = text;
  if (!out.endsWith('\n')) out += '\n';
  return '<pre><code>' + escapeHtml(out) + '</code></pre>\n';
}

function renderParagraph(buf, defs) {
  return '<p>' + inline(buf.join('\n'), defs) + '</p>\n';
}

function inline(s, defs) {
  let out = '';
  let i = 0;
  const n = s.length;
  while (i < n) {
    if (s[i] === '\\' && i + 1 < n) {
      const c = s[i + 1];
      if (/[!-/:-@[-`{-~]/.test(c)) { out += escapeHtml(c); i += 2; continue; }
      out += escapeHtml(s[i]); i++; continue;
    }
    if (s[i] === '`') {
      const cm = /^`+/.exec(s.slice(i));
      const open = cm[0];
      const rest = s.slice(i + open.length);
      const cm2 = new RegExp('(?<!`)`{' + open.length + '}(?!`)').exec(rest);
      if (cm2) {
        let code = rest.slice(0, cm2.index).replace(/\n/g, ' ');
        if (code.length >= 2 && code.startsWith(' ') && code.endsWith(' ') && /[^ ]/.test(code)) code = code.slice(1, -1);
        out += '<code>' + escapeHtml(code) + '</code>';
        i += open.length + cm2.index + open.length;
        continue;
      }
    }
    if (s[i] === '\n') { out += '\n'; i++; continue; }
    if (s[i] === '<') {
      const m = /^<[A-Za-z!\/?][^<>]*>/.exec(s.slice(i));
      if (m) { out += m[0]; i += m[0].length; continue; }
    }
    if (s[i] === '[') {
      const m = /^\[([^\]]*)\]/.exec(s.slice(i));
      if (m) {
        const key = m[1].trim().replace(/\s+/g, ' ').toLowerCase();
        const d = defs[key];
        if (d) {
          let t = '';
          if (d.title !== null && d.title !== undefined) t = ' title="' + resume(d.title, defs) + '"';
          out += '<a href="' + resume(d.dest, defs) + '"' + t + '>' + inline(m[1], defs) + '</a>';
          i += m[0].length; continue;
        }
      }
    }
    out += escapeHtml(s[i]); i++;
  }
  return out;
}

function resume(s, defs) {
  return inline(s, defs);
}

function listItem(line) {
  const m = /^( {0,3})([-+*]|\d{1,9}[.)])([ \t]+|$)/.exec(line);
  if (!m) return null;
  const marker = m[2];
  let content = line.slice(m[1].length + marker.length);
  if (/^[ \t]*$/.test(content)) content = '';
  else {
    const lead = /^[ \t]+/.exec(content)[0];
    if (lead.length >= 5) content = content.slice(1);
    else content = content.slice(lead.length);
  }
  let type, bullet, ordered = null, start = 1;
  if (/^[-+*]$/.test(marker)) { type = 'ul'; bullet = marker; }
  else {
    type = 'ol';
    ordered = marker[marker.length - 1];
    start = parseInt(marker, 10);
  }
  const full = m[1].length + marker.length + (line.slice(m[1].length + marker.length).length - line.slice(m[1].length + marker.length).replace(/^[ \t]*/, '').length);
  return { type, bullet, ordered, start, indent: m[1].length, full: full <= line.length ? full : line.length, content };
}

function indentOf(line) {
  let c = 0;
  for (const ch of line) {
    if (ch === ' ') c++;
    else if (ch === '\t') c += 4 - (c % 4);
    else break;
  }
  return c;
}

function expandTabs(line, base) {
  let col = base || 0, k = 0, out = '';
  while (k < line.length) {
    const ch = line[k];
    if (ch === ' ') { col++; out += ' '; k++; }
    else if (ch === '\t') { const a = 4 - (col % 4); out += ' '.repeat(a); col += a; k++; }
    else break;
  }
  return out + line.slice(k);
}
function parseLinkDef(at, i, n) {
  const m = /^ {0,3}\[([^\]]+)\]:[ \t]*/.exec(at[i]);
  if (!m) return null;
  if (!/^[ \t]*<?/.exec(at[i].slice(m[0].length))) return null;
  let rest = at[i].slice(m[0].length);
  const d = parseDefRest(rest);
  if (d) return { label: m[1], dest: d.dest, title: d.title, consumed: 1 };
  if (i + 1 < n) {
    const d2 = parseDefRest(rest + '\n' + at[i + 1].replace(/^ {0,3}/, ''));
    if (d2) return { label: m[1], dest: d2.dest, title: d2.title, consumed: 2 };
  }
  return null;
}

function parseDefRest(s) {
  let p = 0;
  const len = s.length;
  while (p < len && (s[p] === ' ' || s[p] === '\t')) p++;
  let dest = '';
  if (s[p] === '<') {
    p++;
    while (p < len && s[p] !== '>' && s[p] !== '\n' && s[p] !== '<') { dest += s[p]; p++; }
    if (s[p] !== '>') return null;
    p++;
  } else {
    let depth = 0;
    while (p < len) {
      const c = s[p];
      if (c === '\\' && p + 1 < len) { dest += c + s[p + 1]; p += 2; continue; }
      if (c === '(') depth++;
      else if (c === ')') { if (depth === 0) break; depth--; }
      else if (c === ' ' || c === '\t' || c === '\n') break;
      dest += c; p++;
    }
    if (dest === '') return null;
  }
  let title = null;
  while (p < len && (s[p] === ' ' || s[p] === '\t')) p++;
  if (p < len && s[p] !== '\n') {
    const q = s[p];
    const close = q === '(' ? ')' : q;
    if (q === '"' || q === "'" || q === '(') {
      p++;
      let t = '';
      let ok = false;
      while (p < len) {
        const c = s[p];
        if (c === '\\' && p + 1 < len) { t += c + s[p + 1]; p += 2; continue; }
        if (c === close) { ok = true; p++; break; }
        if (q === '(' && c === '(') return null;
        t += c; p++;
      }
      if (!ok) return null;
      title = t;
      while (p < len && (s[p] === ' ' || s[p] === '\t')) p++;
    } else return null;
  }
  while (p < len && (s[p] === ' ' || s[p] === '\t')) p++;
  if (p < len && s[p] !== '\n') return null;
  if (title !== null) return { dest, title };
  return { dest, title: null };
}

function collectDefs(lines, defs) {
  let i = 0;
  const n = lines.length;
  while (i < n) {
    const d = parseLinkDef(lines, i, n);
    if (d) {
      const key = d.label.trim().replace(/\s+/g, ' ').toLowerCase();
      if (!(key in defs)) defs[key] = { dest: d.dest, title: d.title };
      i += d.consumed;
    } else break;
  }
}

export function blocks(src, defs = {}) {
  let lines = src.replace(/\n$/, '').split('\n');
  if (src.indexOf('\t') !== -1) lines = lines.map((l) => expandTabs(l, 0));
  const out = [];
  let i = 0;
  const n = lines.length;
  collectDefs(lines, defs);
  while (i < n) {
    const d0 = parseLinkDef(lines, i, n);
    if (d0) { i += d0.consumed; continue; }
    if (lines[i].trim() === '') { i++; continue; }
    const line = lines[i];
    if (/^ {0,3}>/.test(line)) {
      const inner = [];
      while (i < n) {
        const l = lines[i];
        if (l.trim() === '') {
          let j = i;
          while (j < n && lines[j].trim() === '') j++;
          if (j < n && /^ {0,3}>/.test(lines[j])) {
            for (let k = i; k < j; k++) inner.push('');
            i = j;
          } else break;
        } else { inner.push(bqStrip(l)); i++; }
      }
      out.push('<blockquote>\n' + blocks(inner.join('\n'), defs) + '</blockquote>\n');
      continue;
    }

    if (/^ {0,3}\S/.test(line) && line.includes('|') && i + 1 < n) {
      const hc = splitRow(line);
      const dc = splitRow(lines[i + 1]);
      if (hc.length && dc.length === hc.length && isDelimRow(dc)) {
        const aligns = dc.map(cellAlign);
        i += 2;
        const rows = [];
        while (i < n && lines[i].trim() !== '' && !isHr(lines[i]) && !renderAtx(lines[i]) && !fence(lines[i])) {
          rows.push(splitRow(lines[i]).map((c) => escapeHtml(c)));
          i++;
        }
        out.push(renderTable(hc.map((c) => escapeHtml(c)), aligns, rows));
        continue;
      }
    }
    const f = fence(line);
    if (f) {
      i++;
      const buf = [];
      let closed = false;
      while (i < n && !fenceEnd(lines[i], f)) {
        let l = lines[i];
        for (let k = 0; k < f.indent && l[k] === ' '; k++) l = l.slice(1);
        buf.push(l);
        i++;
      }
      if (i < n) { closed = true; i++; }
      out.push(renderFence(f.info, buf.join('\n'), closed));
    } else if (indentOf(line) >= 4) {
      const buf = [];
      while (i < n && (indentOf(lines[i]) >= 4 || lines[i] === '')) {
        if (lines[i] === '') {
          const start = i;
          let j = i;
          while (j < n && lines[j] === '') j++;
          if (j < n && indentOf(lines[j]) >= 4 && lines.slice(start, j).every((x) => x === '')) {
            for (let k = start; k < j; k++) buf.push('');
            i = j;
          } else break;
        } else { buf.push(lines[i].slice(4)); i++; }
      }
      out.push(codeBlock(buf.join('\n')));
    } else if (htmlBlockStart(line)) {
      const type = htmlBlockStart(line);
      const kept = [];
      while (i < n && lines[i].trim() !== '') { kept.push(lines[i]); i++; }
      out.push(renderHtmlBlock(consumeHtmlBlock(kept, 0, kept.length, type).out, defs));
    } else if (isHr(line)) {
      i++;
      out.push('<hr>\n');
    } else {
      const m = renderAtx(line);
      if (m) {
        i++;
        if (m.empty) out.push('<h' + /^ {0,3}(#+)/.exec(line)[1].length + '></h' + /^ {0,3}(#+)/.exec(line)[1].length + '>\n');
        else {
          const lvl = /^ {0,3}(#{1,6})/.exec(line)[1].length;
          out.push('<h' + lvl + '>' + inline(m.text, defs) + '</h' + lvl + '>\n');
        }
      } else {
        const buf = [line];
        i++;
        let setext = null;
        while (i < n) {
          const cur = lines[i];
          if (cur.trim() === '') break;
          const se = /^ {0,3}(=+|-+)[ \t]*$/.exec(cur);
          if (se) { setext = se[1][0]; i++; break; }
          if (fence(cur) || isHr(cur) || renderAtx(cur) || htmlBlockStart(cur)) break;
          buf.push(cur);
          i++;
        }
        if (setext) {
          const lvl = setext === '=' ? 1 : 2;
          out.push('<h' + lvl + '>' + inline(buf.join('\n'), defs) + '</h' + lvl + '>\n');
        } else {
          out.push(renderParagraph(buf, defs));
        }
      }
    }
  }
  return out.join('');
}
