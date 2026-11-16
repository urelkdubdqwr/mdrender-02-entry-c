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
  const m = /^ {0,3}<\/?([A-Za-z][A-Za-z0-9-]*)([ \t\/>]|$)/.exec(line);
  if (m && HTML_BLOCK_TAGS.has(m[1].toLowerCase())) return 6;
  const m7 = /^( {0,3})<\/?([A-Za-z][A-Za-z0-9-]*)([ \t]+[^>]*)?>[ \t]*$/.exec(line);
  if (m7) {
    const rest = linesRestHtml(line);
    if (rest === null || rest.trim() === '') return 7;
  }
  return 0;
}

function linesRestHtml(line) {
  const m = /^( {0,3})<[^>]*>/.exec(line);
  if (!m) return null;
  return line.slice(m[0].length);
}

function renderHtmlChunk(out) {
  const text = out.join('\n');
  if (text.endsWith('\n')) { /* keep */ }
  const first = out[0];
  const t = /^ {0,3}<([A-Za-z][A-Za-z0-9-]*)([ \t\/>]|$)/.exec(first);
  if (t && t[1].toLowerCase() === 'pre') {
    const hash = text.indexOf('\n\n');
    if (hash >= 0) {
      const head = text.slice(0, hash + 1);
      const tail = text.slice(hash + 2);
      return head + blocks(tail);
    }
  }
  return text + '\n';
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

function renderParagraph(buf) {
  return '<p>' + buf.join('\n') + '</p>\n';
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
  const m = /^ */.exec(line);
  return m[0].length;
}
export function blocks(src) {
  const lines = src.replace(/\n$/, '').split('\n');
  const out = [];
  let i = 0;
  const n = lines.length;
  while (i < n) {
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
      out.push('<blockquote>\n' + blocks(inner.join('\n')) + '</blockquote>\n');
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
    } else if (/^ {4}/.test(line)) {
      const buf = [];
      while (i < n && (/^ {4}/.test(lines[i]) || lines[i] === '')) {
        if (lines[i] === '') {
          const start = i;
          let j = i;
          while (j < n && lines[j] === '') j++;
          if (j < n && /^ {4}/.test(lines[j])) {
            for (let k = start; k < j; k++) buf.push('');
            i = j;
          } else break;
        } else { buf.push(lines[i].slice(4)); i++; }
      }
      out.push(codeBlock(buf.join('\n')));
    } else if (htmlBlockStart(line)) {
      const type = htmlBlockStart(line);
      const kept = [];
      while (i < n && /^ {0,3}/.test(lines[i])) { kept.push(lines[i].replace(/^ {0,3}/, '')); i++; }
      const g = consumeHtmlBlock(kept, 0, kept.length, type);
      i -= (kept.length - g.i);
      out.push(renderHtmlChunk(g.out));
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
          out.push('<h' + lvl + '>' + escapeHtml(m.text) + '</h' + lvl + '>\n');
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
          out.push('<h' + lvl + '>' + buf.join('\n') + '</h' + lvl + '>\n');
        } else {
          out.push(renderParagraph(buf));
        }
      }
    }
  }
  return out.join('');
}
