// Named HTML entities (common set) + numeric decoding, matching CommonMark/marked behavior.
const ENT = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0',
  copy: '\u00a9', reg: '\u00ae', trade: '\u2122', hellip: '\u2026',
  mdash: '\u2014', ndash: '\u2013', lsquo: '\u2018', rsquo: '\u2019',
  ldquo: '\u201c', rdquo: '\u201d', laquo: '\u00ab', raquo: '\u00bb',
  middot: '\u00b7', bull: '\u2022', dagger: '\u2020', Dagger: '\u2021',
  sect: '\u00a7', para: '\u00b6', deg: '\u00b0', plusmn: '\u00b1',
  frac12: '\u00bd', frac14: '\u00bc', frac34: '\u00be', times: '\u00d7',
  divide: '\u00f7', larr: '\u2190', uarr: '\u2191', rarr: '\u2192', darr: '\u2193',
  harr: '\u2194', crarr: '\u21b5', lArr: '\u21d0', rArr: '\u21d2', hArr: '\u21d4',
  euro: '\u20ac', pound: '\u00a3', yen: '\u00a5', cent: '\u00a2', curren: '\u00a4',
  infin: '\u221e', ne: '\u2260', le: '\u2264', ge: '\u2265', minus: '\u2212',
  lowast: '\u2217', radic: '\u221a', prop: '\u221d', ang: '\u2220', and: '\u2227',
  or: '\u2228', cap: '\u2229', cup: '\u222a', int: '\u222b', there4: '\u2234',
  sim: '\u223c', cong: '\u2245', asymp: '\u2248', equiv: '\u2261', sub: '\u2282',
  sup: '\u2283', nsub: '\u2284', sube: '\u2286', supe: '\u2287', oplus: '\u2295',
  otimes: '\u2297', perp: '\u22a5', sdot: '\u22c5', lceil: '\u2308', rceil: '\u2309',
  lfloor: '\u230a', rfloor: '\u230b', lang: '\u2329', rang: '\u232a', loz: '\u25ca',
  spades: '\u2660', clubs: '\u2663', hearts: '\u2665', diams: '\u2666',
  Alpha: '\u0391', Beta: '\u0392', Gamma: '\u0393', Delta: '\u0394', Epsilon: '\u0395',
  Zeta: '\u0396', Eta: '\u0397', Theta: '\u0398', Iota: '\u0399', Kappa: '\u039a',
  Lambda: '\u039b', Mu: '\u039c', Nu: '\u039d', Xi: '\u039e', Omicron: '\u039f',
  Pi: '\u03a0', Rho: '\u03a1', Sigma: '\u03a3', Tau: '\u03a4', Upsilon: '\u03a5',
  Phi: '\u03a6', Chi: '\u03a7', Psi: '\u03a8', Omega: '\u03a9',
  alpha: '\u03b1', beta: '\u03b2', gamma: '\u03b3', delta: '\u03b4', epsilon: '\u03b5',
  zeta: '\u03b6', eta: '\u03b7', theta: '\u03b8', iota: '\u03b9', kappa: '\u03ba',
  lambda: '\u03bb', mu: '\u03bc', nu: '\u03bd', xi: '\u03be', omicron: '\u03bf',
  pi: '\u03c0', rho: '\u03c1', sigmaf: '\u03c2', sigma: '\u03c3', tau: '\u03c4',
  upsilon: '\u03c5', phi: '\u03c6', chi: '\u03c7', psi: '\u03c8', omega: '\u03c9',
  ensp: '\u2002', emsp: '\u2003', thinsp: '\u2009', zwnj: '\u200c', zwj: '\u200d',
  lrm: '\u200e', rlm: '\u200f', shy: '\u00ad', image: '\u2111', weierp: '\u2118',
  real: '\u211c', alefsym: '\u2135', fnof: '\u0192', thetasym: '\u03d1',
  upsih: '\u03d2', piv: '\u03d6', circ: '\u02c6', tilde: '\u02dc', OElig: '\u0152',
  oelig: '\u0153', Scaron: '\u0160', scaron: '\u0161', Yuml: '\u0178',
};

function fromCodePoint(cp) {
  if (cp === 0 || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) return '\ufffd';
  return String.fromCodePoint(cp);
}

// Match a valid entity at pos; return {value, len} or null.
export function matchEntity(s, pos) {
  if (s[pos] !== '&') return null;
  const semi = s.indexOf(';', pos + 1);
  if (semi < 0) return null;
  const body = s.slice(pos + 1, semi);
  if (body.length === 0 || body.length > 32) return null;
  if (body[0] === '#') {
    let cp;
    if (body[1] === 'x' || body[1] === 'X') {
      if (!/^[0-9a-fA-F]{1,6}$/.test(body.slice(2))) return null;
      cp = parseInt(body.slice(2), 16);
    } else {
      if (!/^[0-9]{1,7}$/.test(body.slice(1))) return null;
      cp = parseInt(body.slice(1), 10);
    }
    return { value: fromCodePoint(cp), len: semi - pos + 1 };
  }
  if (!/^[A-Za-z][A-Za-z0-9]{1,31}$/.test(body)) return null;
  return { raw: true, value: body, len: semi - pos + 1 };
}
