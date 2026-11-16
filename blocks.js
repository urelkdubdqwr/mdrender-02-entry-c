import { matchEntity } from './entities.js';

function zescapeHtml(zs) {
  return zs.replace(/[&<>"]/g, (zc) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[zc])).replace(/'/g, '&#39;');
}

function zbqStrip(zline) {
  const zm = /^ {0,3}> ?/.exec(zline);
  return zm ? zline.slice(zm[0].length) : zline;
}

const zHR_RE = /^ {0,3}((\*[ \t]*){3,}|(-[ \t]*){3,}|(_[ \t]*){3,})$/;
const zATX_RE = /^ {0,3}(#{1,6})([ \t]+|$)/;
const zHTML_BLOCK_TAGS = new Set(['address','article','aside','base','basefont','blockquote','body','caption','center','col','colgroup','dd','details','dialog','dir','div','dl','dt','fieldset','figcaption','figure','footer','form','frame','frameset','h1','h2','h3','h4','h5','h6','head','header','hr','html','iframe','legend','li','link','main','menu','menuitem','nav','noframes','ol','optgroup','option','p','param','search','section','summary','table','tbody','td','tfoot','th','thead','title','tr','track','ul']);

function zhtmlBlockStart(zline) {
  if (/^ {0,3}<(script|pre|style|textarea)([ \t]|>|$)/i.test(zline)) return 1;
  if (/^ {0,3}<!--/.test(zline)) return 2;
  if (/^ {0,3}<\?/.test(zline)) return 3;
  if (/^ {0,3}<![A-Za-z]/.test(zline)) return 4;
  if (/^ {0,3}<!\[CDATA\[/.test(zline)) return 5;
  const zm = /^ {0,3}<([A-Za-z][A-Za-z0-9-]*)([ \t\/>]|$)/.exec(zline);
  if (zm && zHTML_BLOCK_TAGS.has(zm[1].toLowerCase())) {
    const zc = zm[2];
    if (zc === '\t' || zc === '\n' || zc === '' || zc === '>' || zc === '/>' || zc === ' ') return 6;
    return 7;
  }
  if (/^ {0,3}<\/?[A-Za-z][A-Za-z0-9-]*([ \t][^>]*)?>[ \t]*$/.test(zline)) return 7;
  return 0;
}

function zhtmlBlockEnd(ztype, zline) {
  if (ztype >= 1 && ztype <= 5) {
    if (ztype === 1) return /<\/(script|pre|style|textarea)>/i.test(zline);
    if (ztype === 2) return zline.includes('-->');
    if (ztype === 3) return zline.includes('?>');
    if (ztype === 4) return zline.includes('>');
    return zline.includes(']]>');
  }
  return zline.trim() === '';
}

function zconsumeHtmlBlock(zlines, zi, zn, ztype) {
  const zout = [];
  if (ztype >= 6) {
    while (zi < zn && zlines[zi].trim() !== '') { zout.push(zlines[zi]); zi++; }
    if (zi < zn) { zout.push(zlines[zi]); zi++; }
    return { out: zout, i: zi };
  }
  while (zi < zn) {
    zout.push(zlines[zi]);
    const zhit = zhtmlBlockEnd(ztype, zlines[zi]);
    zi++;
    if (zhit) break;
  }
  return { out: zout, i: zi };
}

const zRAW_TAGS = new Set(['pre', 'script', 'style', 'textarea']);

function zrenderHtmlBlock(zout, zdefs) {
  if (!zout.length) return '';
  const zt = /^ {0,3}<([A-Za-z][A-Za-z0-9-]*)/.exec(zout[0]);
  const ztag = zt ? zt[1].toLowerCase() : '';
  if (zRAW_TAGS.has(ztag)) return zout.join('\n') + (zout[zout.length - 1] ? '\n' : '');
  return zprocessHtml(zout);
}

function zemitInlineHtml(zs) {
  return zs.replace(/<!--[\s\S]*?-->/g, (zm) => zm).replace(/[&<>]/g, (zc) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[zc])).replace(/&amp;(#?[A-Za-z0-9]+;)/g, '&$1');
}

function zprocessHtml(zout) {
  const zc = zout.map((zx) => zx.replace(/^ {0,3}/, ''));
  let zstart = 0;
  let zend = zc.length;
  while (zstart < zend && zc[zstart].trim() === '') zstart++;
  while (zend > zstart && zc[zend - 1].trim() === '') zend--;
  if (zstart >= zend) return '\n';
  const ztags = [];
  const zpars = [];
  for (let zk = zstart; zk < zend; zk++) {
    if (zc[zk].trim() === '') continue;
    const zh = zk + 1 < zend && zc[zk + 1].trim() === '';
    if (zh) ztags.push(zc[zk]);
    else zpars.push(zc[zk]);
  }
  const zhasBlank = zout.slice(zstart, zend).some((zx) => zx.trim() === '');
  if (zhasBlank && zpars.length) return ztags.join('\n') + '\n' + '<p>' + zinline(zpars.join('\n'), {}) + '</p>\n' + ztags.join('\n') + '\n';
  return zout.join('\n') + '\n';
}

function zsplitRow(zline) {
  let zt = zline.trim();
  if (zt.startsWith('|')) zt = zt.slice(1);
  if (zt.endsWith('|') && !zt.endsWith('\\|')) zt = zt.slice(0, -1);
  const zcells = [];
  let zcur = '';
  for (let zk = 0; zk < zt.length; zk++) {
    const zch = zt[zk];
    if (zch === '\\' && zk + 1 < zt.length) { zcur += zch + zt[zk + 1]; zk++; continue; }
    if (zch === '|') { zcells.push(zcur); zcur = ''; continue; }
    zcur += zch;
  }
  zcells.push(zcur);
  return zcells.map((zc) => zc.trim());
}

function zisDelimRow(zcells) {
  if (!zcells.length) return false;
  return zcells.every((zc) => /^:?-+:?$/.test(zc));
}

function zcellAlign(zcell) {
  const zleft = zcell.startsWith(':');
  const zright = zcell.endsWith(':');
  if (zleft && zright) return 'center';
  if (zright) return 'right';
  if (zleft) return 'left';
  return null;
}

function zrenderTable(zheader, zaligns, zrows) {
  let zout = '<table>\n<thead>\n<tr>\n';
  for (let zk = 0; zk < zheader.length; zk++) {
    const za = zaligns[zk];
    zout += '<th' + (za ? ' align="' + za + '"' : '') + '>' + zheader[zk] + '</th>\n';
  }
  zout += '</tr>\n</thead>\n';
  if (zrows.length) {
    zout += '<tbody>';
    for (const zrow of zrows) {
      zout += '<tr>\n';
      for (let zk = 0; zk < zheader.length; zk++) {
        const za = zaligns[zk];
        const zv = zrow[zk] === undefined ? '' : zrow[zk];
        zout += '<td' + (za ? ' align="' + za + '"' : '') + '>' + zv + '</td>\n';
      }
      zout += '</tr>\n';
    }
    zout += '</tbody>';
  }
  return zout + '</table>\n';
}

const zBULLET_RE = /^( {0,3})([-+*])([ \t]+|$)/;
const zORDERED_RE = /^( {0,3})(\d{1,9})([.)])([ \t]+|$)/;

function zisHr(zline) {
  return zHR_RE.test(zline);
}

function zrenderAtx(zline) {
  const zm = zATX_RE.exec(zline);
  if (!zm || zm[1].length > 6) return null;
  if (/^ {0,3}#{1,6}$/.test(zline)) return { empty: true, level: zm[1].length };
  let ztext = zline.slice(zm[0].length);
  ztext = ztext.replace(/[ \t]+#+[ \t]*$/, '');
  return { text: ztext };
}

function zfence(zline) {
  const zm = /^( {0,3})(`{3,}|~{3,})(.*)$/.exec(zline);
  if (!zm) return null;
  const zinfo = zm[3];
  if (zm[2][0] === '`' && zinfo.includes('`')) return null;
  return { indent: zm[1].length, char: zm[2][0], len: zm[2].length, info: zinfo };
}

function zfenceEnd(zline, zf) {
  const zm = /^( {0,3})(`{3,}|~{3,})[ \t]*$/.exec(zline);
  return zm && zm[2][0] === zf.char && zm[2].length >= zf.len;
}

function zrenderFence(zinfo, ztext, zclosed) {
  let zout = ztext;
  if (zout === '' && zclosed) return '<pre><code' + zfenceCls(zinfo) + '></code></pre>\n';
  if (!zout.endsWith('\n')) zout += '\n';
  return '<pre><code' + zfenceCls(zinfo) + '>' + zescapeHtml(zout) + '</code></pre>\n';
}

function zfenceCls(zinfo) {
  const zlang = zinfo.trim().split(/\s+/)[0];
  return zlang ? ' class="language-' + zescapeHtml(zlang) + '"' : '';
}

function zcodeBlock(ztext) {
  let zout = ztext;
  if (!zout.endsWith('\n')) zout += '\n';
  return '<pre><code>' + zescapeHtml(zout) + '</code></pre>\n';
}

function zrenderParagraph(zbuf, zdefs) {
  return '<p>' + zinline(zbuf.join('\n'), zdefs) + '</p>\n';
}

function zinline(zs, zdefs) {
  let zout = '';
  let zi = 0;
  const zn = zs.length;
  while (zi < zn) {
    if (zs[zi] === '\\' && zi + 1 < zn) {
      const zc = zs[zi + 1];
      if (/[!-/:-@[-`{-~]/.test(zc)) { zout += zescapeHtml(zc); zi += 2; continue; }
      zout += zescapeHtml(zs[zi]); zi++; continue;
    }
    if (zs[zi] === '`') {
      const zcm = /^`+/.exec(zs.slice(zi));
      const zopen = zcm[0];
      const zrest = zs.slice(zi + zopen.length);
      const zcm2 = new RegExp('(?<!`)`{' + zopen.length + '}(?!`)').exec(zrest);
      if (zcm2) {
        let zcode = zrest.slice(0, zcm2.index).replace(/\n/g, ' ');
        if (zcode.length >= 2 && zcode.startsWith(' ') && zcode.endsWith(' ') && /[^ ]/.test(zcode)) zcode = zcode.slice(1, -1);
        zout += '<code>' + zescapeHtml(zcode) + '</code>';
        zi += zopen.length + zcm2.index + zopen.length;
        continue;
      }
    }
    if (zs[zi] === '&') {
      const zme = zmatchEntity(zs, zi);
      if (zme) { zout += zme.raw ? '&' + zme.value + ';' : zescapeHtml(zme.value); zi += zme.len; continue; }
      zout += '&amp;'; zi++; continue;
    }
    if (zs[zi] === '\n') { zout += '\n'; zi++; continue; }
    if (zs[zi] === '<') {
      const zm = /^<[A-Za-z!\/?][^<>]*>/.exec(zs.slice(zi));
      if (zm) { zout += zm[0]; zi += zm[0].length; continue; }
    }
    if (zs[zi] === '[') {
      const zm = /^\[([^\]]*)\]/.exec(zs.slice(zi));
      if (zm) {
        const zkey = zm[1].trim().replace(/\s+/g, ' ').toLowerCase();
        const zd = zdefs[zkey];
        if (zd) {
          let zt = '';
          if (zd.title !== null && zd.title !== undefined) zt = ' title="' + zresume(zd.title, zdefs) + '"';
          zout += '<a href="' + zresume(zd.dest, zdefs) + '"' + zt + '>' + zinline(zm[1], zdefs) + '</a>';
          zi += zm[0].length; continue;
        }
      }
    }
    zout += zescapeHtml(zs[zi]); zi++;
  }
  return zout;
}

function zresume(zs, zdefs) {
  return zinline(zs, zdefs);
}

function zlistItem(zline) {
  const zm = /^( {0,3})([-+*]|\d{1,9}[.)])([ \t]+|$)/.exec(zline);
  if (!zm) return null;
  const zmarker = zm[2];
  let zcontent = zline.slice(zm[1].length + zmarker.length);
  if (/^[ \t]*$/.test(zcontent)) zcontent = '';
  else {
    const zlead = /^[ \t]+/.exec(zcontent)[0];
    if (zlead.length >= 5) zcontent = zcontent.slice(1);
    else zcontent = zcontent.slice(zlead.length);
  }
  let ztype, zbullet, zordered = null, zstart = 1;
  if (/^[-+*]$/.test(zmarker)) { ztype = 'ul'; zbullet = zmarker; }
  else {
    ztype = 'ol';
    zordered = zmarker[zmarker.length - 1];
    zstart = parseInt(zmarker, 10);
  }
  const zpadding = zm[3];
  let zfull = zm[1].length + zmarker.length + zpadding.length;
  if (zpadding.length >= 5) zfull = zm[1].length + zmarker.length + 1;
  if (zline[zm[1].length + zmarker.length] === '\t' || zm[1].includes('\t')) {
    let zcol = 0, zk = 0;
    while (zk < zline.length) {
      const zch = zline[zk];
      if (zch === ' ') zcol++;
      else if (zch === '\t') zcol += 4 - (zcol % 4);
      else if (zk >= zm[1].length + zmarker.length) continue;
      zk++;
      if (zk === zm[1].length + zmarker.length + zpadding.length) break;
    }
    zfull = zcol;
  }
  return { type: ztype, bullet: zbullet, ordered: zordered, start: zstart, indent: zm[1].length, full: zfull, content: zcontent };
}

function zindentOf(zline) {
  let zc = 0;
  for (const zch of zline) {
    if (zch === ' ') zc++;
    else if (zch === '\t') zc += 4 - (zc % 4);
    else break;
  }
  return zc;
}

function zexpandAllTabs(zline) {
  return zexpandTabs(zline, 0);
}

function zleadWidth(zs) {
  let zw = 0, zk = 0;
  while (zk < zs.length) {
    const zc = zs[zk];
    if (zc === ' ') { zw++; zk++; }
    else if (zc === '\t') { zw += 4 - (zw % 4); zk++; }
    else break;
  }
  return { width: zw, count: zk };
}

function zexpandTabs(zline, zbase) {
  let zcol = zbase || 0, zk = 0, zout = '';
  while (zk < zline.length) {
    const zch = zline[zk];
    if (zch === ' ') { zcol++; zout += ' '; zk++; }
    else if (zch === '\t') { const za = 4 - (zcol % 4); zout += ' '.repeat(za); zcol += za; zk++; }
    else break;
  }
  return zout + zline.slice(zk);
}
function zisBlockCloser(zlines, zj) {
  const zl = zlines[zj];
  return zl.trim() === '' || /^ {0,3}>/.test(zl) || zfence(zl) || zisHr(zl) || zrenderAtx(zl) || zhtmlBlockStart(zl);
}

function ztryDefSeq(zlines, zi, zallowIndent) {
  const zn = zlines.length;
  if (zi >= zn) return null;
  const zm = new RegExp('^' + (zallowIndent ? '(?: {0,3})?' : ' {0,3}') + '\\[([^\\]]+)\\]:[ \\t]*').exec(zlines[zi]);
  if (!zm) return null;
  const zlabel = zm[1];
  let zrest = zlines[zi].slice(zm[0].length);
  let zconsumed = 1;
  let zdest = null;
  let ztitle = null;
  let zdc = null;
  for (let zs = 0; zs <= 1; zs++) {
    const zr = zparseDefRest(zrest, 1 - zs);
    if (zr) { zdc = zr; break; }
    const zj = zi + 1 + zs;
    if (zj >= zn || zisBlockCloser(zlines, zj)) break;
    zrest += '\n' + zlines[zj];
    zconsumed = 2 + zs;
  }
  if (!zdc) return null;
  zdest = zdc.dest;
  let ztp = zi + zconsumed - 1;
  for (let zs2 = 0; zs2 <= 1; zs2++) {
    if (zconsumed > 2 + zs2) break;
    const zr = zparseDefRest(zrest, 2 - zs2);
    if (zr && zr.title !== null) {
      ztitle = zr.title;
      zconsumed = 2 + zs2;
      ztp = zi + zconsumed - 1;
      break;
    }
    const zj = zi + 2 + zs2;
    if (zj >= zn || zisBlockCloser(zlines, zj)) break;
    zrest += '\n' + zlines[zj];
  }
  if (zdc.title !== null) { ztitle = zdc.title; ztp = zi + zconsumed - 1; }
  else if (zdc.title === undefined) { ztp = zi + zconsumed - 1; }
  const zstripped = zlines[ztp] === undefined ? '' : zlines[ztp].replace(/^ {0,3}/, '');
  const zafter = zstripped.slice(zstripped.length + ((zstripped.match(/\[([^\]]+)\]:[ \t]*/) || [''])[0]).length);
  if (zdc.title === null && ztitle === null && zafter.trim() !== '' && !zafter.trim().startsWith('(')) return null;
  return { label: zlabel, dest: zdest, title: ztitle, consumed: zconsumed };
}

function zparseDefDest(zs, zallowIndent) {
  let zp = 0;
  const zlen = zs.length;
  while (zp < zlen && (zs[zp] === ' ' || zs[zp] === '\t')) zp++;
  if (zp >= zlen) return null;
  if (zs[zp] === '\n' && !zallowIndent) return null;
  let zdest = '';
  if (zs[zp] === '<') {
    zp++;
    while (zp < zlen && zs[zp] !== '>' && zs[zp] !== '<' && zs[zp] !== '\n') { zdest += zs[zp]; zp++; }
    if (zs[zp] !== '>') return null;
    zp++;
  } else {
    let zdepth = 0;
    while (zp < zlen) {
      const zc = zs[zp];
      if (zc === '\\' && zp + 1 < zlen) { zdest += zc + zs[zp + 1]; zp += 2; continue; }
      if (zc === '(') zdepth++;
      else if (zc === ')') { if (zdepth === 0) break; zdepth--; }
      else if (zc === ' ' || zc === '\t' || zc === '\n') break;
      zdest += zc; zp++;
    }
    if (zdest === '') return null;
  }
  return { p: zp, dest: zdest };
}

function zparseDefRest(zs, zallowIndent) {
  const zdd = zparseDefDest(zs, zallowIndent);
  if (!zdd) return null;
  let zp = zdd.p;
  const zdest = zdd.dest;
  const zlen = zs.length;
  while (zp < zlen && (zs[zp] === ' ' || zs[zp] === '\t')) zp++;
  if (zp < zlen && zs[zp] === '\n') {
    if (zallowIndent < 1) return { dest: zdest, title: null };
    zp++;
    while (zp < zlen && (zs[zp] === ' ' || zs[zp] === '\t')) zp++;
  }
  if (zp >= zlen) return { dest: zdest, title: null };
  const zq = zs[zp];
  if (zq !== '"' && zq !== "'" && zq !== '(') return { dest: zdest, title: null };
  const zclose = zq === '(' ? ')' : zq;
  zp++;
  let zt = '';
  let zok = false;
  while (zp < zlen) {
    const zc = zs[zp];
    if (zc === '\\' && zp + 1 < zlen) { zt += zc + zs[zp + 1]; zp += 2; continue; }
    if (zc === zclose) { zok = true; zp++; break; }
    zt += zc; zp++;
  }
  if (!zok) return null;
  const ztitle = zt;
  while (zp < zlen && (zs[zp] === ' ' || zs[zp] === '\t')) zp++;
  if (zp < zlen && zs[zp] !== '\n') return null;
  return { dest: zdest, title: ztitle };
}

function zcollectDefs(zlines, zdefs) {
  let zi = 0;
  const zn = zlines.length;
  while (zi < zn) {
    const zd = ztryDefSeq(zlines, zi, false);
    if (zd) {
      const zkey = zd.label.trim().replace(/\s+/g, ' ').toLowerCase();
      if (!(zkey in zdefs)) zdefs[zkey] = { dest: zd.dest, title: zd.title };
      zi += zd.consumed;
    } else break;
  }
}

function zgatherList(zlines, zi, zn, zmarkers) {
  const zitems = [];
  while (zi < zn) {
    const zm = zlistItem(zlines[zi]);
    if (!zm || zm.type !== zmarkers.type) break;
    if (zitems.length && (zm.bullet !== zmarkers.bullet || zm.ordered !== zmarkers.ordered)) break;
    if (zm.indent > 3) break;
    let zcontent = [zm.content];
    zi++;
    let zblank = false;
    while (zi < zn) {
      const zline = zlines[zi];
      if (zline.trim() === '') {
        let zj = zi;
        while (zj < zn && zlines[zj].trim() === '') zj++;
        if (zj >= zn) { zi = zj; break; }
        if (zindentOf(zlines[zj]) >= zm.full) {
          zcontent.push('#BLANK#');
          zi = zj;
          zblank = true;
          continue;
        }
        break;
      }
      const znm = zlistItem(zline);
      if (znm && znm.indent <= 3) break;
      if (/^ {0,3}(=+|-+)[ \t]*$/.test(zline) && /^ {0,3}-{1,2}/.test(zline)) break;
      if (zindentOf(zline) >= zm.full) {
        let zl = zline;
        const zlead = zleadWidth(zl);
        zl = zl.slice(zlead.count);
        zcontent.push(zl);
        zi++;
      } else if (!zblank && !zisHr(zline) && zline.trim() !== '') {
        zcontent.push(zline.trim());
        zi++;
      } else break;
    }
    zitems.push({ blank: zblank, inner: zcontent.join('\n') });
  }
  return { items: zitems, i: zi };
}

function zrenderList(zmarkers, zitems, zdefs) {
  const zloose = zitems.some((zx) => zx.blank) || zitems.some((zx) => zx.inner.includes('#BLANK#'));
  let zout = '<' + zmarkers.type + (zmarkers.type === 'ol' && zmarkers.start !== 1 ? ' start="' + zmarkers.start + '"' : '') + '>\n';
  for (let zk = 0; zk < zitems.length; zk++) {
    const zinner = zitems[zk].inner.replace(/\n?#BLANK#\n?/g, '\n\n');
    let zbody = blocks(zinner, zdefs);
    if (!zloose) zbody = zbody.replace(/^<p>([\s\S]*?)<\/p>\n$/, '$1');
    zout += '<li>' + zbody + '</li>\n';
  }
  return zout + '</' + zmarkers.type + '>\n';
}

export function blocks(zsrc, zdefs = {}) {
  let zlines = zsrc.replace(/\n$/, '').split('\n');
  if (zsrc.indexOf('\t') !== -1) zlines = zlines.map(zexpandAllTabs);
  const zout = [];
  let zi = 0;
  const zn = zlines.length;
  zcollectDefs(zlines, zdefs);
  while (zi < zn) {
    const zd0 = ztryDefSeq(zlines, zi, false);
    if (zd0) { zi += zd0.consumed; continue; }
    if (zlines[zi].trim() === '') { zi++; continue; }
    const zline = zlines[zi];
    const zli = zisHr(zline) ? null : zlistItem(zline);
    if (zli && zli.indent <= 3) {
      const zg = zgatherList(zlines, zi, zn, zli);
      zi = zg.i;
      zout.push(zrenderList(zli, zg.items, zdefs));
      continue;
    }
    if (/^ {0,3}>/.test(zline)) {
      const zinner = [];
      while (zi < zn) {
        const zl = zlines[zi];
        if (zl.trim() === '') {
          let zj = zi;
          while (zj < zn && zlines[zj].trim() === '') zj++;
          if (zj < zn && /^ {0,3}>/.test(zlines[zj])) {
            for (let zk = zi; zk < zj; zk++) zinner.push('');
            zi = zj;
          } else break;
        } else { zinner.push(zbqStrip(zl)); zi++; }
      }
      zout.push('<blockquote>\n' + blocks(zinner.join('\n'), zdefs) + '</blockquote>\n');
      continue;
    }

    if (/^ {0,3}\S/.test(zline) && zline.includes('|') && zi + 1 < zn) {
      const zhc = zsplitRow(zline);
      const zdc = zsplitRow(zlines[zi + 1]);
      if (zhc.length && zdc.length === zhc.length && zisDelimRow(zdc)) {
        const zaligns = zdc.map(zcellAlign);
        zi += 2;
        const zrows = [];
        while (zi < zn && zlines[zi].trim() !== '' && !zisHr(zlines[zi]) && !zrenderAtx(zlines[zi]) && !zfence(zlines[zi])) {
          zrows.push(zsplitRow(zlines[zi]).map((zc) => zescapeHtml(zc)));
          zi++;
        }
        zout.push(zrenderTable(zhc.map((zc) => zescapeHtml(zc)), zaligns, zrows));
        continue;
      }
    }
    const zf = zfence(zline);
    if (zf) {
      zi++;
      const zbuf = [];
      let zclosed = false;
      while (zi < zn && !zfenceEnd(zlines[zi], zf)) {
        let zl = zlines[zi];
        for (let zk = 0; zk < zf.indent && zl[zk] === ' '; zk++) zl = zl.slice(1);
        zbuf.push(zl);
        zi++;
      }
      if (zi < zn) { zclosed = true; zi++; }
      zout.push(zrenderFence(zf.info, zbuf.join('\n'), zclosed));
    } else if (zindentOf(zline) >= 4) {
      const zbuf = [];
      while (zi < zn && (zindentOf(zlines[zi]) >= 4 || zlines[zi] === '')) {
        if (zlines[zi] === '') {
          const zstart = zi;
          let zj = zi;
          while (zj < zn && zlines[zj] === '') zj++;
          if (zj < zn && zindentOf(zlines[zj]) >= 4 && zlines.slice(zstart, zj).every((zx) => zx === '')) {
            for (let zk = zstart; zk < zj; zk++) zbuf.push('');
            zi = zj;
          } else break;
        } else { zbuf.push(zlines[zi].slice(4)); zi++; }
      }
      zout.push(zcodeBlock(zbuf.join('\n')));
    } else if (zhtmlBlockStart(zline)) {
      const ztype = zhtmlBlockStart(zline);
      const zkept = [];
      let zsawBlank = false;
      while (zi < zn) {
        if (zlines[zi].trim() === '') {
          if (ztype <= 5) { zi++; zsawBlank = true; continue; }
          let zj = zi;
          while (zj < zn && zlines[zj].trim() === '') zj++;
          if (zj < zn && !/^ {0,3}<\//.test(zlines[zj])) { zkept.push(''); zi = zj; continue; }
          break;
        }
        zkept.push(zlines[zi]); zi++;
      }
      const zr = zconsumeHtmlBlock(zkept, 0, zkept.length, ztype);
      zout.push(zrenderHtmlBlock(zr.out, zdefs));
    } else if (zisHr(zline)) {
      zi++;
      zout.push('<hr>\n');
    } else {
      const zm = zrenderAtx(zline);
      if (zm) {
        zi++;
        if (zm.empty) zout.push('<h' + /^ {0,3}(#+)/.exec(zline)[1].length + '></h' + /^ {0,3}(#+)/.exec(zline)[1].length + '>\n');
        else {
          const zlvl = /^ {0,3}(#{1,6})/.exec(zline)[1].length;
          zout.push('<h' + zlvl + '>' + zinline(zm.text, zdefs) + '</h' + zlvl + '>\n');
        }
      } else {
        const zbuf = [zline];
        zi++;
        let zsetext = null;
        while (zi < zn) {
          const zcur = zlines[zi];
          if (zcur.trim() === '') break;
          const zse = /^ {0,3}(=+|-+)[ \t]*$/.exec(zcur);
          if (zse) { zsetext = zse[1][0]; zi++; break; }
          if (zfence(zcur) || zisHr(zcur) || zrenderAtx(zcur) || zhtmlBlockStart(zcur)) break;
          zbuf.push(zcur);
          zi++;
        }
        if (zsetext) {
          const zlvl = zsetext === '=' ? 1 : 2;
          zout.push('<h' + zlvl + '>' + zinline(zbuf.join('\n'), zdefs) + '</h' + zlvl + '>\n');
        } else {
          zout.push(zrenderParagraph(zbuf, zdefs));
        }
      }
    }
  }
  return zout.join('');
}
