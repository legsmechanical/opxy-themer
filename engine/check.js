// Check edited screens against what the stock OP-XY SVG engine (OS 1.2.0) accepts, before they go on
// the device. Port of scripts/theme/svgcheck.py. HALT = the stock OS asserts or aborts, so the screen
// (or boot) stops; an export with any HALT is refused.
import {allElements, attr, tagOf, kids} from './geom.js';

const KNOWN = new Set(['svg', 'g', 'pattern', 'line', 'polyline', 'polygon', 'ellipse', 'circle', 'rect', 'path',
  'text', 'clipPath']);
const IGNORED_ATTRS = new Set(['display', 'visibility', 'style', 'class', 'font-family', 'font-weight',
  'text-anchor', 'stroke-opacity', 'stroke-dasharray', 'href']);
// Numbers with 5+ fractional digits and no exponent abort the fixed-point parser (parser.cpp:110).
const LONG_DEC = /(?<![\w.])-?\d*\.(\d{5,})(?![\deE])/;
const PATH_CMDS = new Set('MLHVCSQTZmlhvcsqtz');
// Colours the engine reads: #rgb, #rrggbb, rgb(), none, url(#…) and 7 names.
const COLOUR = /^(?:#[0-9a-fA-F]{3}|#[0-9a-fA-F]{6}|rgb\([^)]*\)|none|url\(#[^)]+\)|black|white|red|green|blue|yellow|gray|grey|transparent|currentColor)$/i;

const idmap = r => new Map(allElements(r).filter(e => attr(e, 'id')).map(e => [attr(e, 'id'), tagOf(e)]));
const stockIds = new Map();   // stock text -> its id map (the stock files never change while the app runs)

/** Returns {halts, warns}. `parse(text)` -> Document or throws; `stockText` (optional) for the id check;
 * `doc` (optional) is `text` already parsed. */
export function check(text, parse, stockText, doc) {
  const halts = [], warns = [];
  let root;
  try { root = (doc || parse(text)).documentElement; } catch (err) { return {halts: [`malformed XML: ${err.message}`], warns}; }
  if (attr(root, 'viewBox') === null) halts.push('<svg> lacks viewBox (svg_loader.cpp:28)');

  (function go(e, insideUnknown) {
    const tag = tagOf(e);
    const unknown = insideUnknown || !KNOWN.has(tag);
    if (!insideUnknown && !KNOWN.has(tag) && !['font', 'glyph', 'font-face', 'missing-glyph', 'metadata'].includes(tag))
      warns.push(`<${tag}> is dropped with its subtree`);
    if (!unknown) {
      for (const {name, value: v} of Array.from(e.attributes)) {
        const a = name.split(':').pop();
        if (IGNORED_ATTRS.has(a) && a !== 'display' && a !== 'font-family') warns.push(`<${tag}> ${a}= is ignored`);
        if (a !== 'id' && !v.trimStart().startsWith('#') && LONG_DEC.test(v))
          halts.push(`<${tag} id=${attr(e, 'id')}> ${a}: number with 5+ decimals (${v.match(LONG_DEC)[0]})`);
        if (a === 'transform') {
          for (const [, fn, args] of v.matchAll(/(\w+)\s*\(([^)]*)\)/g)) {
            const n = args.trim().split(/[\s,]+/).filter(Boolean).length;
            if (['rotate', 'skewX', 'skewY'].includes(fn)) warns.push(`<${tag}> ${fn}() makes the element disappear`);
            else if ((fn === 'translate' || fn === 'scale') && n !== 2) halts.push(`<${tag}> ${fn}() needs exactly 2 values (parser.cpp:443/448)`);
            else if (fn === 'matrix' && n !== 6) halts.push(`<${tag}> matrix() needs 6 values`);
          }
        }
        if ((a === 'fill' || a === 'stroke') && !COLOUR.test(v.trim()))
          halts.push(`<${tag} id=${attr(e, 'id')}> ${a}=${JSON.stringify(v)} is not a colour the engine reads`);
        if (a === 'd') {
          const bad = [...new Set(v.match(/[A-Za-z]/g) || [])].filter(c => !PATH_CMDS.has(c) && c !== 'e' && c !== 'E');
          if (bad.length) warns.push(`<path id=${attr(e, 'id')}> unsupported path commands ${bad.sort()} (arcs?)`);
        }
      }
      const i = attr(e, 'id');
      if (i && /_x[^_]*$/.test(i)) halts.push(`id ${JSON.stringify(i)}: '_x' without a later '_' (parser.cpp:165)`);
    }
    for (const c of kids(e)) go(c, unknown);
  })(root, false);

  if (stockText != null) {
    if (!stockIds.has(stockText)) stockIds.set(stockText, idmap(parse(stockText).documentElement));
    const old = stockIds.get(stockText), now = idmap(root);
    const gone = [...old.keys()].filter(i => !now.has(i)).sort();
    if (gone.length) halts.push(`ids removed (code may look them up): ${gone.slice(0, 8)}${gone.length > 8 ? '…' : ''}`);
    const retyped = [...old.keys()].filter(i => now.has(i) && old.get(i) !== now.get(i)).sort();
    if (retyped.length) halts.push(`ids changed element type: ${retyped.slice(0, 8)}`);
  } else warns.push('no stock file of this name to compare ids against');
  return {halts, warns};
}
