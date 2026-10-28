// Parity test: the JS engine must write byte-identical screens to scripts/theme/opxy_theme.py.
//   node tests/compare.mjs STOCK_DISPLAY_DIR THEME.json REFERENCE_DISPLAY_DIR
import {readFileSync, readdirSync, existsSync} from 'node:fs';
import {join} from 'node:path';
import {DOMParser} from '@xmldom/xmldom';
import {parseXML} from '../engine/xml.js';
import opentype from 'opentype.js';
import {build} from '../engine/theme.js';
import {fontMetrics} from '../engine/text.js';

const [stockDir, ...pairs] = process.argv.slice(2);   // THEME REF [THEME REF ...], built in one process
const parseDom = t => {
  const errs = [];
  const doc = new DOMParser({onError: (lvl, msg) => { if (lvl !== 'warning') errs.push(msg); }}).parseFromString(t, 'image/svg+xml');
  if (errs.length) throw new Error(errs[0]);
  return doc;
};
const parse = process.env.PARSER === 'xmldom' ? parseDom : parseXML;
const stock = Object.fromEntries(readdirSync(stockDir).filter(n => n.endsWith('.svg')).map(n => [n, readFileSync(join(stockDir, n), 'utf8')]));
const buf = readFileSync(join(stockDir, 'UniversNextPro-Light.otf'));
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
const font = opentype.parse(ab);
let failed = 0;
for (let q = 0; q < pairs.length; q += 2) {
const [themePath, refDir] = pairs.slice(q, q + 2);
const t0 = Date.now();
const res = build(JSON.parse(readFileSync(themePath, 'utf8')), stock, parse, fontMetrics(font, ab));
const ms = Date.now() - t0;
const ref = readdirSync(refDir).filter(n => n.endsWith('.svg'));
let bad = 0;
for (const n of new Set([...ref, ...Object.keys(res.files)])) {
  const want = existsSync(join(refDir, n)) ? readFileSync(join(refDir, n), 'utf8') : null;
  const got = res.files[n] ?? null;
  if (want === got) continue;
  bad++;
  if (want === null || got === null) { console.log(`${n}: ${want === null ? 'extra in JS' : 'missing in JS'}`); continue; }
  let i = 0;
  while (want[i] === got[i]) i++;
  console.log(`${n}: first difference at ${i}\n  py: ${JSON.stringify(want.slice(i - 40, i + 60))}\n  js: ${JSON.stringify(got.slice(i - 40, i + 60))}`);
}
console.log(`${Object.keys(res.files).length} files from JS, ${ref.length} reference, ${bad} differ, ${res.warnings.length} warnings, ${ms} ms`);
failed += bad;
}
process.exit(failed ? 1 : 0);
