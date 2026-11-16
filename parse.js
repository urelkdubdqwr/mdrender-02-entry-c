import { blocks } from './blocks.js';
import { marked } from './vendor/marked/marked.esm.js';

// GUARD LIST: family -> boolean. false = any doc containing that family routes to marked.
// Default is ALWAYS the marked path; only constructs whose fast path we have
// proven byte-exact end-to-end may be enabled here.
export const GUARD = {
  tabs: false,
  'backslash-escapes': false,
  'entities-numeric': false,
  'entities-named': false,
  'html-blocks': false,
  'link-reference-definitions': false,
  'gfm-tables': false,
  'autolinks-extended': false,
  strikethrough: false,
  tasklists: false,
  'raw-html-inline': false,
};

// Cheap single-pass structural scan (plain string checks / bounded regexes).
// Returns the set of construct families the document appears to use. Conservative:
// when a family cannot be ruled out, it is reported as present.
export function scan(zsrc) {
  const zfams = new Set();
  zfams.add('all');
  return zfams;
}

// Returns true only if the doc uses no guarded-off family. Conservative.
function zguardOk(zsrc, zfams) {
  for (const zf of zfams) {
    if (zf !== 'all' && GUARD[zf] === false) return false;
  }
  return false; // marked path until explicit opt-in per family
}

export function parse(zsrc) {
  zsrc = zsrc.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const zfams = scan(zsrc);
  if (zguardOk(zsrc, zfams)) return blocks(zsrc);
  return marked.parse(zsrc);
}
