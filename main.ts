import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from './parse.js';

const zinDir = process.env.MAKEFUN_INPUT_DIR || '/input';
const zoutDir = process.env.MAKEFUN_OUTPUT_DIR || '/output';

const zcases = JSON.parse(readFileSync(join(zinDir, 'cases.json'), 'utf8'));
const zhtml = zcases.map((zc) => parse(zc.markdown));
writeFileSync(join(zoutDir, 'html.json'), JSON.stringify(zhtml));
