function escapeHtml(s) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
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

function renderFence(info, text) {
  let out = text;
  if (!out.endsWith('\n')) out += '\n';
  let cls = '';
  const lang = info.trim().split(/\s+/)[0];
  if (lang) cls = ' class="language-' + escapeHtml(lang) + '"';
  return '<pre><code' + cls + '>' + escapeHtml(out) + '</code></pre>\n';
}

function codeBlock(text) {
  let out = text;
  if (!out.endsWith('\n')) out += '\n';
  return '<pre><code>' + escapeHtml(out) + '</code></pre>\n';
}

export function blocks(src) {
  const lines = src.split('\n');
  const out = [];
  let i = 0;
  const n = lines.length;
  while (i < n) {
    const line = lines[i];
    const f = fence(line);
    if (f) {
      i++;
      const buf = [];
      while (i < n && !fenceEnd(lines[i], f)) {
        let l = lines[i];
        for (let k = 0; k < f.indent && l[k] === ' '; k++) l = l.slice(1);
        buf.push(l);
        i++;
      }
      if (i < n) i++;
      out.push(renderFence(f.info, buf.join('\n')));
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
          } else {
            break;
          }
        } else {
          buf.push(lines[i].slice(4));
          i++;
        }
      }
      out.push(codeBlock(buf.join('\n')));
    } else if (line.trim() === '') {
      i++;
    } else {
      out.push('<p>' + escapeHtml(line) + '</p>\n');
      i++;
    }
  }
  return out.join('');
}
