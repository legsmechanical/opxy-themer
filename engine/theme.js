// Build an OP-XY colour theme from the user's own stock screen files. Port of scripts/theme/opxy_theme.py;
// the rule syntax is documented in docs/theme-format.md (same as that script's docstring).
//
// WHY two colour sources (proven on the device 2026-10-24/25): xy_palette.svg colours what the OS styles at
// runtime (mixer, envelope, labels, dots); each screen SVG carries its own literal fills and strokes.
// Ids never change and every output file must pass check.js.
import {allElements, attr, walk} from './geom.js';
import {check} from './check.js';
import {enlarge, TEXT_DEFAULTS} from './text.js';

export const STOCK_GREYS = {grey1: '191919', grey2: '323232', grey3: '4b4b4b', grey4: '646464',
  grey5: '7d7d7d', grey6: '969696', grey7: 'afafaf', grey8: 'cdcdcd'};
const GREY_VALUES = Object.values(STOCK_GREYS);
export const PALETTE_IDS = [...Object.keys(STOCK_GREYS), 'black', 'white', 'red', 'blue'];
const HEX = /^#?[0-9A-Fa-f]{6}$/;
const PAINT = /((?:fill|stroke)=")#([0-9A-Fa-f]{6})"/g;
const START_TAG = /<([A-Za-z_][\w:.-]*)((?:\s[^<>]*?)?)(\/?)>/g;
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export class ThemeError extends Error {}
const fail = msg => { throw new ThemeError(msg); };

/** Python's round(): halves go to the even neighbour. */
export const pyRound = x => (Math.abs(x % 1) === 0.5 ? 2 * Math.round(x / 2) : Math.round(x));

export function norm(c, where) {
  if (typeof c !== 'string' || !HEX.test(c)) fail(`bad colour ${JSON.stringify(c)} in ${where}: use #RRGGBB`);
  return c.replace(/^#/, '').toUpperCase();
}

/** Swap #RRGGBB paint values per mapping (lower-case stock hex -> new hex). */
export function recolour(text, mapping) {
  let n = 0;
  const out = text.replace(PAINT, (m, head, hex) => {
    const v = mapping[hex.toLowerCase()];
    if (v === undefined) return m;
    n++;
    return `${head}#${v}"`;
  });
  return [out, n];
}

export function recolourPalette(text, colours) {
  for (const [pid, c] of Object.entries(colours)) {
    const re = new RegExp(`(<rect id="${esc(pid)}"[^>]*?)(?: fill="#[0-9A-Fa-f]{6}")?( width=)`);
    if (!re.test(text)) fail(`palette id ${pid} not found in xy_palette.svg`);
    text = text.replace(re, (m, a, b) => `${a} fill="#${c}"${b}`);
  }
  return text;
}

const stockIdLists = new Map();   // stock text -> sorted ids, joined (stock files never change)
const stockIdList = (data, parse) => {
  if (!stockIdLists.has(data)) stockIdLists.set(data, idList(parse(data).documentElement).join('\n'));
  return stockIdLists.get(data);
};
const idList = root => allElements(root).map(e => attr(e, 'id')).filter(Boolean).sort();

export function greyLightness(hexv) {
  const v = parseInt(hexv.slice(0, 2), 16) / 255;
  const lin = v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  return lin ** (1 / 3);   // OKLab L of a neutral grey
}

/** 0..7 for a stock grey (black and grey1 share 0), null otherwise; with anyColour, by lightness. */
function greyIndex(v, anyColour) {
  v = (v || '').replace(/^#/, '').toLowerCase();
  if (v === '000000') return 0;
  const i = GREY_VALUES.indexOf(v);
  if (i >= 0) return i;
  if (anyColour && /^[0-9a-f]{6}$/.test(v)) return Math.min(7, Math.trunc(greyLightness(v) * 8));
  return null;
}

/** Drop Illustrator's uniqueness suffix: 'box3_000000088432680904178806_' -> 'box3'. */
export const bareId = i => i.replace(/_\d{20,}_?$/, '');

function resolve(c, encoders, where) {
  const m = /^enc([1-4])\.(main|dim)$/.exec(c);
  if (m) {
    if (+m[1] > encoders.length) fail(`${where}: ${c} but only ${encoders.length} encoders defined`);
    return encoders[m[1] - 1][m[2]];
  }
  return norm(c, where);
}

/** Map of "elementIndex attr" -> RRGGBB for the elements the rules colour, in rule order. */
function roleEdits(root, name, rules, encoders) {
  const order = new Map(allElements(root).map((e, i) => [e, i]));
  const items = walk(root);
  const edits = new Map();
  for (const r of rules) {
    const attrs = (r.attr || 'both') === 'both' ? ['fill', 'stroke'] : [r.attr];
    const within = r.within ? new RegExp(r.within) : null;
    let picked = [];
    for (const {e, tag, bbox: bb, ids} of items) {
      if (!bb) continue;
      if (r.tags && r.tags.length && !r.tags.includes(tag)) continue;
      if (within && !ids.some(i => within.test(bareId(i)))) continue;
      const cx = (bb[0] + bb[2]) / 2, cy = (bb[1] + bb[3]) / 2;
      if (r.region) {
        const [x0, y0, x1, y1] = r.region;
        if (!(x0 <= cx && cx <= x1 && y0 <= cy && cy <= y1)) continue;
      }
      if (r.max && (bb[2] - bb[0] > r.max[0] || bb[3] - bb[1] > r.max[1])) continue;
      if (r.min && (bb[2] - bb[0] < r.min[0] || bb[3] - bb[1] < r.min[1])) continue;
      for (const a of attrs) {
        let v = attr(e, a);
        if (v === null && a === 'fill' && r.black && tag !== 'text') v = '#000000';
        const g = greyIndex(v, r.any);
        if (g !== null) picked.push({k: order.get(e), a, g, cx});
      }
    }
    if (r.pick) {
      const keep = new Set([...new Set(picked.map(p => p.k))].sort((x, y) => x - y).slice(r.pick[0], r.pick[1]));
      picked = picked.filter(p => keep.has(p.k));
    }
    picked = picked.filter(p => !edits.has(`${p.k} ${p.a}`));   // an earlier rule already claimed it
    if (!picked.length) fail(`${name}: rule ${JSON.stringify(r)} matched nothing`);
    const mode = r.mode ?? 'pair';
    let encOf;
    if (mode === 'rank') {
      const levels = [...new Set(picked.map(p => p.g))].sort((x, y) => x - y);
      encOf = p => levels.indexOf(p.g);
    } else if (mode === 'order') {
      const seq = [...new Set(picked.map(p => p.k))].sort((x, y) => x - y);
      encOf = p => seq.indexOf(p.k);
    } else if (mode === 'column') {
      const cols = r.columns, inner = cols.slice(1, -1);
      encOf = p => Math.max(0, Math.min(cols.length - 2, inner.filter(c => p.cx >= c).length));
    } else if (mode === 'pair') encOf = p => Math.floor(p.g / 2);
    else encOf = () => parseInt(mode, 10) - 1;
    for (const p of picked) {
      const enc = encOf(p), key = `${p.k} ${p.a}`;
      if ('colour' in r || 'colours' in r) {
        const c = 'colours' in r ? r.colours[Math.min(enc, r.colours.length - 1)] : r.colour;
        edits.set(key, resolve(c, encoders, name));
        continue;
      }
      if (!(enc >= 0 && enc < encoders.length)) fail(`${name}: rule ${JSON.stringify(r)} gives encoder ${enc + 1}; selection too wide?`);
      let tone = r.tone ?? 'pair';
      if (tone === 'pair') tone = p.g % 2 === 0 ? 'dim' : 'main';
      edits.set(key, encoders[enc][tone]);
    }
  }
  return edits;
}

/** Greys filling more than `area` of the 480x220 screen anywhere in the file take the soft ramp. */
function softGreys(root, soft, area) {
  const big = new Set();
  for (const {e, bbox: bb} of walk(root)) {
    const v = (attr(e, 'fill') || '').replace(/^#/, '').toLowerCase();
    if (bb && v in soft && (bb[2] - bb[0]) * (bb[3] - bb[1]) > area * 480 * 220) big.add(v);
  }
  return Object.fromEntries([...big].map(v => [v, soft[v]]));
}

/** Rewrite the paint attributes of the edited elements in place; every other character is kept. */
function applyEdits(s, edits, elementCount) {
  const blank = s.replace(/<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[[\s\S]*?\]\]>|<!DOCTYPE[^>]*>/g, m => ' '.repeat(m.length));
  const tags = [...blank.matchAll(START_TAG)];
  if (tags.length !== elementCount) fail('start tags and parsed elements disagree; refusing to edit');
  const byEl = new Map();
  for (const [key, c] of edits) {
    const [k, a] = key.split(' ');
    if (!byEl.has(+k)) byEl.set(+k, []);
    byEl.get(+k).push([a, c]);
  }
  const out = [];
  let pos = 0;
  tags.forEach((m, k) => {
    const mine = byEl.get(k);
    if (!mine) return;
    const start = m.index + 1 + m[1].length, end = start + m[2].length;
    let attrs = s.slice(start, end);
    for (const [a, c] of mine) {
      const re = new RegExp(`(\\s${a}=")[^"]*(")`);
      if (re.test(attrs)) attrs = attrs.replace(re, (x, p, q) => `${p}#${c}${q}`);
      else attrs = ` ${a}="#${c}"` + attrs;
    }
    out.push(s.slice(pos, start), attrs);
    pos = end;
  });
  out.push(s.slice(pos));
  return out.join('');
}

export function oklchHex(L, C, h) {
  let rgb;
  for (let i = 0; i < 40; i++) {
    const a = C * Math.cos(h * (Math.PI / 180)), b = C * Math.sin(h * (Math.PI / 180));
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3,
      s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
    rgb = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s];
    if (rgb.every(v => v >= -1e-4 && v <= 1.0001)) break;
    C *= 0.9;
  }
  const enc = v => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
  return rgb.map(v => pyRound(Math.max(0, Math.min(1, enc(Math.max(0, v)))) * 255).toString(16).toUpperCase().padStart(2, '0')).join('');
}

/** {stock grey hex: new hex} for one family, lightness kept from the stock grey. */
export function familyRamp(fam, scale = 1) {
  const hues = fam.hue.slice(0, 1);
  for (const h of fam.hue.slice(1)) {                       // the short way round between anchors
    const d = (((h - hues[hues.length - 1] + 180) % 360) + 360) % 360 - 180;
    hues.push(hues[hues.length - 1] + d);
  }
  const out = {};
  GREY_VALUES.forEach((g, i) => {
    const t = i / 7;
    const c = scale * fam.chroma * (0.35 + 0.65 * (1 - Math.abs(2 * t - 1.1) ** 2));   // strongest in the mid greys
    const x = t * (hues.length - 1);
    const k = hues.length > 1 ? Math.min(Math.trunc(x), hues.length - 2) : 0;
    const h = hues.length === 1 ? hues[0] : hues[k] + (hues[k + 1] - hues[k]) * (x - k);
    out[g] = oklchHex(greyLightness(g), Math.max(c, 0), h);
  });
  return out;
}

const dropNotes = o => Object.fromEntries(Object.entries(o || {}).filter(([k]) => !k.startsWith('_')));

/** Resolve a theme object (roles, art and inserts inline) into what build() needs. */
export function loadTheme(theme) {
  const greys = {};
  for (const [g, c] of Object.entries(dropNotes(theme.greys))) {
    if (!(g in STOCK_GREYS)) fail(`unknown grey ${g}; expected grey1..grey8`);
    greys[g] = norm(c, 'greys');
  }
  const encoders = (theme.encoders || []).map((e, i) => ({main: norm(e.main, `encoder ${i + 1}`), dim: norm(e.dim, `encoder ${i + 1}`)}));
  const palette = {};
  for (const [p, c] of Object.entries(dropNotes(theme.palette))) {
    if (!PALETTE_IDS.includes(p)) fail(`unknown palette id ${p}`);
    palette[p] = resolve(c, encoders, 'palette');
  }
  const files = {};
  for (const [f, m] of Object.entries(dropNotes(theme.files)))
    files[f] = Object.fromEntries(Object.entries(m).map(([k, v]) => [norm(k, f).toLowerCase(), norm(v, f)]));
  const roles = {};
  for (const [f, rules] of Object.entries(dropNotes(theme.roles))) roles[f] = [...rules];
  if (Object.keys(roles).length && !encoders.length) fail('role rules need an "encoders" list');
  const ramps = {};
  const fams = {...dropNotes(theme.families)};
  for (const [f, sc] of Object.entries(dropNotes(theme.screens))) fams[f] = {chroma: 0.12, ...sc, files: [f]};
  for (const fam of Object.values(fams)) {
    const r = familyRamp(fam), soft = familyRamp(fam, fam.soft ?? 0.4);
    for (const f of fam.files) {
      if (f in ramps) fail(`${f} is in two families`);
      ramps[f] = [(fam.soft_files || []).includes(f) ? soft : r, soft, fam.soft_area ?? 0.15];
    }
  }
  for (const [f, rules] of Object.entries(dropNotes(theme.art))) roles[f] = [...(roles[f] || []), ...rules];
  return {greys, encoders, palette, files, roles, ramps, inserts: dropNotes(theme.inserts), text: theme.text};
}

function insertBefore(text, beforeId, snippet, encoders, name) {
  snippet = snippet.replace(/\{(enc\d\.(?:main|dim))\}/g, (m, c) => '#' + resolve(c, encoders, name));
  if (/\bid\s*=/.test(snippet)) fail(`${name}: inserted elements must not carry ids`);
  const tags = new Set([...snippet.matchAll(/<\s*([a-zA-Z]+)/g)].map(m => m[1]));
  const ok = new Set(['rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'path', 'g']);
  if (![...tags].every(t => ok.has(t))) fail(`${name}: insert may only hold plain shapes, got ${[...tags].sort()}`);
  const hits = [...text.matchAll(new RegExp(`<[a-zA-Z]+\\b[^>]*\\bid="${esc(beforeId)}(?:_\\d{20,}_?)?"`, 'g'))];
  if (hits.length !== 1) fail(`${name}: insert anchor id ${JSON.stringify(beforeId)} found ${hits.length} times`);
  const at = hits[0].index;
  return text.slice(0, at) + snippet + '\n' + text.slice(at);
}

/**
 * stock: {name: svgText} for every stock screen (the user's own files). parse(text) -> Document.
 * metrics: stock font metrics (text.js fontMetrics), needed only when the theme has "text".
 * Returns {files: {name: newText}, counts: {name: n}, warnings: [..]} for the files that changed.
 */
export function build(theme, stock, parse, metrics) {
  const t = loadTheme(theme);
  const base = Object.fromEntries(Object.entries(t.greys).map(([g, c]) => [STOCK_GREYS[g], c]));
  const names = Object.keys(stock).filter(n => n.endsWith('.svg')).sort();
  for (const f of [...Object.keys(t.roles), ...Object.keys(t.files), ...Object.keys(t.ramps), ...Object.keys(t.inserts)])
    if (!names.includes(f)) fail(`${f}: no such stock screen`);
  let textFiles = null, textParams = null;
  if (t.text != null) {
    if (!metrics) fail('this theme enlarges text: load the stock font (UniversNextPro-Light.otf) with the screens');
    textFiles = t.text.files ?? null;
    textParams = Object.fromEntries(Object.entries(t.text).filter(([k]) => k !== 'files' && !k.startsWith('_')));
  }
  const files = {}, counts = {}, warnings = [];
  for (const name of names) {
    const data = stock[name];
    let out, n;
    if (name === 'xy_palette.svg') {
      out = recolourPalette(data, {...t.greys, ...t.palette});
      n = Object.keys(t.greys).length + Object.keys(t.palette).length;
    } else {
      const root = parse(data).documentElement;
      const edits = name in t.roles ? roleEdits(root, name, t.roles[name], t.encoders) : new Map();
      let ramp = base;
      if (name in t.ramps) {
        const [r, soft, area] = t.ramps[name];
        ramp = {...r, ...softGreys(root, soft, area)};
      }
      out = edits.size ? applyEdits(data, edits, allElements(root).length) : data;
      [out, n] = recolour(out, {...ramp, ...(t.files[name] || {})});
      n += edits.size;
      if (!edits.size && out.length !== data.length) fail(`${name}: size changed, refusing`);
      for (const ins of t.inserts[name] || []) {
        out = insertBefore(out, ins.before_id, ins.svg, t.encoders, name);
        n++;
      }
      if (t.text != null && (textFiles === null || textFiles.includes(name))) {
        const [bigger, warns] = enlarge(out, name, parse, metrics, textParams);
        warnings.push(...warns.map(w => `text ${name}: ${w}`));
        if (bigger !== out) { out = bigger; n++; }
      }
    }
    if (out === data) continue;
    const doc = parse(out);
    if (idList(doc.documentElement).join('\n') !== stockIdList(data, parse)) fail(`${name}: ids changed, refusing`);
    const {halts} = check(out, parse, data, doc);
    if (halts.length) fail(`${name}: would halt the OS: ${halts.join('; ')}`);
    files[name] = out;
    counts[name] = n;
  }
  for (const f of Object.keys(t.files)) if (!(f in files)) warnings.push(`per-file override for ${f} changed nothing`);
  return {files, counts, warnings};
}

export {TEXT_DEFAULTS};
