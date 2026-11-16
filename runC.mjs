import { parse } from './parse.js';
import fs from 'fs';
const zsv = fs.readFileSync(0,'utf8');
process.stdout.write(parse(zsv));
