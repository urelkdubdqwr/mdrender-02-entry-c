import { blocks } from './blocks.js';

export function parse(src) {
  src = src.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  return blocks(src);
}
