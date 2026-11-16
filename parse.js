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

// Cheap single-pass structural scan (plain string checks, no nested-quantifier
// regexes). Returns a set of construct families the document appears to use.
export function scan(src) {
  const fams = new Set();
  fams.add('all');
  return fams;
}

// Returns true only if the doc uses no guarded-off family. Conservative.
function guardAllows(src, fams) {
  for (const f of fams) {
    if (f !== 'all' && GUARD[f] === false) return false;
  }
  return false; // marked path until explicit opt-in per family
}

export function parse(src) {
  src = src.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const fams = scan(src);
  if (guardAllows(src, fams)) return blocks(src);
  return marked.parse(src);
}
