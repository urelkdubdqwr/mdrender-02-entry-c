import { parse } from './parse.js';
import fs from 'fs';
const s = fs.readFileSync(0,'utf8');
process.stdout.write(parse(s));
