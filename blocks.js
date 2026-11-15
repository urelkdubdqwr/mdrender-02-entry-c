function escapeHtml(s) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function bqStrip(line) {
  const m = /^ {0,3}> ?/.exec(line);
  return m ? line.slice(m[0].length) : line;
}

const HR_RE = /^ {0,3}((\*[ \t]*){3,}|(-[ \t]*){3,}|(_[ \t]*){3,})$/;
const ATX_RE = /^ {0,3}(#{1,6})([ \t]+|$)/;
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
  const parts = buf.map((l) => escapeHtml(l));
  return '<p>' + parts.join('\n') + '</p>\n';
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
          if (fence(cur) || isHr(cur) || renderAtx(cur)) break;
          buf.push(cur);
          i++;
        }
        if (setext) {
          const lvl = setext === '=' ? 1 : 2;
          out.push('<h' + lvl + '>' + buf.map((l) => escapeHtml(l)).join('\n') + '</h' + lvl + '>\n');
        } else {
          out.push(renderParagraph(buf));
        }
      }
    }
  }
  return out.join('');
}
