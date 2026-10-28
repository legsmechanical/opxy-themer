// The fast parser must see the same tree as a standard one on every stock screen.
//   node tests/xml-agree.mjs STOCK_DISPLAY_DIR
import {readFileSync, readdirSync} from 'node:fs';
import {join} from 'node:path';
import {DOMParser} from '@xmldom/xmldom';
import {parseXML} from '../engine/xml.js';
const sig = e => `${e.localName}[${Array.from(e.attributes).map(a => `${a.name}=${a.value}`).join('|')}]{${
  Array.from(e.childNodes).map(c => c.nodeType === 1 ? sig(c) : c.nodeType === 3 ? JSON.stringify(c.data) : '').join('')}}`;
let bad = 0;
const dir = process.argv[2];
for (const n of readdirSync(dir).filter(n => n.endsWith('.svg'))) {
  const t = readFileSync(join(dir, n), 'utf8');
  const a = sig(parseXML(t).documentElement), b = sig(new DOMParser().parseFromString(t, 'image/svg+xml').documentElement);
  if (a !== b) { bad++; let i = 0; while (a[i] === b[i]) i++; console.log(n, JSON.stringify(a.slice(i - 30, i + 40)), JSON.stringify(b.slice(i - 30, i + 40))); }
}
for (const bad of ['<svg><g></svg>', '<svg a="1" a="2"/>', '<svg>&nope;</svg>', '<svg/><svg/>', '<svg x="<"/>', 'text<svg/>']) {
  try { parseXML(bad); console.log('accepted malformed:', bad); process.exitCode = 1; } catch { /* expected */ }
}
console.log(`${bad} files disagree`);
if (bad) process.exitCode = 1;
