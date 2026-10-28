// Enlarge the text on OP-XY screens: bigger font sizes, fitted so nothing new collides or overflows.
// Port of scripts/theme/opxy_text.py (read its docstring for the method).
//
// How the device draws text: one FreeType face for every <text> (content/display/UniversNextPro-Light.otf);
// font-size and letter-spacing are honoured; text-anchor is ignored, so text always grows right and up from
// its baseline origin. Code moves some id'd nodes with set_transform, which replaces the whole matrix, so
// id'd text is never nudged here, only resized. Edits rewrite only font-size (and for nudged text the
// transform's x) inside each <text> start tag; everything else stays byte-identical.
import {SHAPES, allElements, attr, kids, localPoints, mul, parseTransform, tagOf} from './geom.js';

const W = 480, H = 220;

export const TEXT_DEFAULTS = {
  sizes: [[10, 1.4], [14, 1.2], [20, 1.1], [30, 1.0]],  // stock px -> factor, linear between, clamped
  skip_files: ['legal.svg', 'font_test.svg'],           // wall-of-text pages: leave stock
  glyph_scale: 1.0,
  fit: true,
  keep: {'master.svg': ['–20', '–10', '–5', '0', '+3']},  // the VU dial scale is too tight
  floor: 1.0,
  steps: true,   // a text that can't reach its full size stays at stock size
};

const NUM_START = /^-?(?:\d+\.?\d*|\.\d+)/;
const NUM = /-?(?:\d+\.?\d*|\.\d+)/g;
const pyRound = x => (Math.abs(x % 1) === 0.5 ? 2 * Math.round(x / 2) : Math.round(x));

/** Advance widths straight from the sfnt hmtx table, as FreeType uses them. (opentype.js replaces a CFF
 * glyph's advance with its charstring width once the outline is read; in the stock face those differ, e.g.
 * tabular 560 vs hmtx 559 for "0".) */
function hmtxAdvances(buffer, numberOfHMetrics) {
  const v = new DataView(buffer);
  const n = v.getUint16(4);
  for (let i = 0; i < n; i++) {
    const r = 12 + 16 * i;
    if (String.fromCharCode(v.getUint8(r), v.getUint8(r + 1), v.getUint8(r + 2), v.getUint8(r + 3)) === 'hmtx') {
      const off = v.getUint32(r + 8);
      return gid => v.getUint16(off + 4 * Math.min(gid, numberOfHMetrics - 1));
    }
  }
  throw new Error('font has no hmtx table');
}

/** Advance widths and glyph bounds of the face (opentype.js font + its bytes), in units of the em, as
 * fontTools' hmtx + BoundsPen give them. */
export function fontMetrics(font, buffer, glyphScale = 1) {
  const upm = font.unitsPerEm, cache = new Map();
  const advance = hmtxAdvances(buffer, font.tables.hhea.numberOfHMetrics);
  const os2 = font.tables.os2 || {};
  return {
    k: glyphScale,
    cap: (os2.sCapHeight || 0.7 * upm) / upm,
    upm,
    glyph(ch) {
      if (!cache.has(ch)) {
        const gid = font.tables.cmap.glyphIndexMap[ch.codePointAt(0)] ?? 0;
        const g = font.glyphs.get(gid);
        const p = g.path;
        let b = null;
        if (p && p.commands && p.commands.length) {
          const bb = p.getBoundingBox();
          b = [bb.x1, bb.y1, bb.x2, bb.y2];
        }
        cache.set(ch, [advance(gid) / upm, b]);
      }
      return cache.get(ch);
    },
    box(s, size, spacing = 0) {
      let x = 0, top = -this.cap, bot = 0, n = 0;
      for (const ch of s) {
        const [adv, b] = this.glyph(ch);
        if (b) { top = Math.min(top, -b[3] / upm); bot = Math.max(bot, -b[1] / upm); }
        x += adv;
        n++;
      }
      const k = size * this.k;
      return [0, top * k, x * k + spacing * Math.max(n - 1, 0), bot * k];
    },
  };
}

function factor(size, sizes) {
  const pts = [...sizes].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (size <= pts[0][0]) return pts[0][1];
  for (let i = 0; i + 1 < pts.length; i++) {
    const [a, fa] = pts[i], [b, fb] = pts[i + 1];
    if (size <= b) return fa + (fb - fa) * (size - a) / (b - a);
  }
  return pts[pts.length - 1][1];
}

/** Python f"{v:.4f}" (ties to even) with trailing zeros dropped. */
export function fmt(v) {
  let s;
  const n = v * 1e4;
  if (Number.isInteger(v * 32) && !Number.isInteger(v * 16)) {   // exact tie at the 5th decimal
    const lo = Math.floor(n), pick = lo % 2 === 0 ? lo : lo + 1;
    s = (pick / 1e4).toFixed(4);
  } else s = v.toFixed(4);
  s = s.replace(/0+$/, '').replace(/\.$/, '');
  return s === '-0' || s === '' ? '0' : s;
}

function applyBox(m, b) {
  const pts = [[b[0], b[1]], [b[2], b[1]], [b[0], b[3]], [b[2], b[3]]];
  const xs = pts.map(([x, y]) => m[0] * x + m[2] * y + m[4]), ys = pts.map(([x, y]) => m[1] * x + m[3] * y + m[5]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

const overlap = (a, b, tol = 0.5) => a[0] < b[2] - tol && b[0] < a[2] - tol && a[1] < b[3] - tol && b[1] < a[3] - tol;
const inside = (a, b, tol = 0.5) => a[0] >= b[0] - tol && a[1] >= b[1] - tol && a[2] <= b[2] + tol && a[3] <= b[3] + tol;

/** Does segment p-q pass through box b (Liang-Barsky clip)? */
function segHits(b, p, q) {
  let t0 = 0, t1 = 1;
  const dx = q[0] - p[0], dy = q[1] - p[1];
  for (const [d, lo, hi] of [[dx, b[0] - p[0], b[2] - p[0]], [dy, b[1] - p[1], b[3] - p[1]]]) {
    if (Math.abs(d) < 1e-9) {
      if (lo > 0 || hi < 0) return false;
      continue;
    }
    let a = lo / d, c = hi / d;
    if (a > c) [a, c] = [c, a];
    t0 = Math.max(t0, a);
    t1 = Math.min(t1, c);
    if (t0 > t1) return false;
  }
  return true;
}

function relation(t, s) {
  if (s.segs !== null) {
    const b = [t[0] + 0.5, t[1] + 0.5, t[2] - 0.5, t[3] - 0.5];
    if (s.covers.some(c => inside(b, c, 0))) return 'out';
    return s.segs.some(([p, q]) => segHits(b, p, q)) ? 'cross' : 'out';
  }
  const box = s.box;
  if (inside(t, box)) return 'in';
  if (!overlap(t, box)) return 'out';
  return 'cross';
}

/** Texts and shapes with screen boxes and the set of display="none" ancestors they live under. */
function collect(root) {
  const texts = [], shapes = [];
  (function go(e, m, hid) {
    const tag = tagOf(e);
    if (['font', 'defs', 'metadata', 'clipPath', 'pattern'].includes(tag)) return;
    m = mul(m, parseTransform(attr(e, 'transform')));
    if (attr(e, 'display') === 'none') hid = new Set([...hid, e]);
    if (tag === 'text') texts.push({el: e, m, hid});
    else if (SHAPES.has(tag)) {
      const pts = localPoints(e, tag).map(([x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]);
      const stroke = attr(e, 'stroke');
      if (pts.length && (attr(e, 'fill') !== 'none' || (stroke !== null && stroke !== 'none'))) {
        const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
        // lines are tested as segments: a diagonal's box is mostly empty space
        const segs = tag === 'line' || tag === 'polyline' ? pts.slice(0, -1).map((p, i) => [p, pts[i + 1]]) : null;
        shapes.push({box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], hid, tag, segs, covers: []});
        if (tag === 'rect' && (attr(e, 'fill') ?? '#000') !== 'none' && attr(e, 'opacity') === null) {
          const last = shapes[shapes.length - 1];
          for (const s of shapes.slice(0, -1)) if (s.segs !== null) s.covers.push(last.box);   // a later opaque rect masks lines under it
        }
      }
    }
    for (const c of kids(e)) go(c, m, hid);
  })(root, [1, 0, 0, 1, 0, 0], new Set());
  return {texts, shapes};
}

const subset = (a, b) => [...a].every(x => b.has(x));
const together = (a, b) => subset(a, b) || subset(b, a);

function plan(svgText, filename, parse, met, params) {
  const p = {...TEXT_DEFAULTS, ...(params || {})};
  if (p.skip_files.includes(filename)) return {edits: [], warns: []};
  const stockMet = met;
  if (p.glyph_scale !== 1) throw new Error('glyph_scale other than 1 needs a second font (not supported here)');
  const root = parse(svgText).documentElement;
  let {texts, shapes} = collect(root);
  if (!texts.length) return {edits: [], warns: []};
  const warns = [];
  const big = 0.4 * W * H;
  shapes = shapes.filter(s => (s.box[2] - s.box[0]) * (s.box[3] - s.box[1]) < big);
  // shapes parked mostly off screen are placed by code at runtime; their stock position says nothing
  const visible = b => {
    const a = Math.max(b[2] - b[0], 1e-6) * Math.max(b[3] - b[1], 1e-6);
    const w = Math.max(0, Math.min(b[2], W) - Math.max(b[0], 0)) * Math.max(0, Math.min(b[3], H) - Math.max(b[1], 0));
    return w / a >= 0.5;
  };
  shapes = shapes.filter(s => visible(s.box));

  for (const t of texts) {
    const e = t.el;
    const raw = attr(e, 'font-size') || '12';
    const m0 = NUM_START.exec(raw);
    t.unit = m0 ? raw.slice(m0[0].length) : '';
    t.size = m0 ? parseFloat(m0[0]) : 12;
    const ls = (attr(e, 'letter-spacing') ?? '0').match(NUM);
    t.ls = ls ? parseFloat(ls[0]) : 0;
    t.s = e.textContent;
    t.code = Boolean(attr(e, 'id'));
    t.stock = applyBox(t.m, stockMet.box(t.s || '0', t.size, t.ls));
    let want = t.size * factor(t.size, p.sizes);
    if ((p.keep[filename] || []).includes(t.s.trim())) want = t.size;
    t.floor = t.size * p.floor;
    t.target = Math.abs(want - t.size) < 0.01 ? t.size : Math.max(pyRound(want), t.floor);
    t.new = t.target;
    const sb = t.stock;
    t.onscreen = sb[0] >= -0.5 && sb[1] >= -0.5 && sb[2] <= W + 0.5 && sb[3] <= H + 0.5;
    t.rel = shapes.map(s => (together(t.hid, s.hid) ? relation(sb, s) : null));
    t.align = 0;
    if (!t.code) {
      const enc = shapes.filter((s, i) => t.rel[i] === 'in' && (s.box[2] - s.box[0]) > (sb[2] - sb[0]) + 2).map(s => s.box);
      if (enc.length) {
        let c = enc[0];
        for (const b of enc) if ((b[2] - b[0]) * (b[3] - b[1]) < (c[2] - c[0]) * (c[3] - c[1])) c = b;
        const lg = sb[0] - c[0], rg = c[2] - sb[2];
        if (Math.abs(lg - rg) <= Math.max(1.5, 0.15 * (lg + rg))) t.align = 0.5;
        else if (rg < lg && rg < 4) t.align = 1;
      }
    }
    t.dx = 0;
  }

  // peers: same stock size on one baseline, or same parent and one left edge -> one size for all
  const peer = texts.map((_, i) => i);
  const find = i => {
    while (peer[i] !== i) { peer[i] = peer[peer[i]]; i = peer[i]; }
    return i;
  };
  texts.forEach((a, i) => {
    for (let j = i + 1; j < texts.length; j++) {
      const b = texts[j];
      if (a.size === b.size && (Math.abs(a.m[5] - b.m[5]) < 1 ||
          (a.el.parentNode === b.el.parentNode && Math.abs(a.m[4] - b.m[4]) < 1))) peer[find(i)] = find(j);
    }
  });
  const groups = new Map();
  texts.forEach((t, i) => { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(t); });
  for (const g of groups.values()) {   // a row or column keeps one alignment, or its edges go ragged
    for (const t of g) t.solo = g.length === 1;
    if (new Set(g.map(t => t.align)).size > 1) for (const t of g) t.align = 0;
  }

  const box = (t, size, dx) => {
    const b = applyBox(t.m, met.box(t.s || '0', size, t.ls));
    return [b[0] + dx, b[1], b[2] + dx, b[3]];
  };
  const stockTT = new Map();
  texts.forEach((a, i) => { for (let j = i + 1; j < texts.length; j++) stockTT.set(i * 100000 + j, overlap(a.stock, texts[j].stock, -1)); });

  const problems = (i, bx, boxes) => {
    const t = texts[i], out = [];
    if (t.onscreen && (bx[0] < -0.5 || bx[1] < -0.5 || bx[2] > W + 0.5 || bx[3] > H + 0.5)) out.push('off screen');
    texts.forEach((o, j) => {
      if (j === i || !together(t.hid, o.hid)) return;
      if (overlap(bx, boxes[j], -1) && !stockTT.get(Math.min(i, j) * 100000 + Math.max(i, j))) out.push(`hits text '${o.s.slice(0, 12)}'`);
    });
    shapes.forEach((s, k) => {
      const r = t.rel[k];
      if ((r === 'in' || r === 'out') && relation(bx, s) !== r) out.push(`crosses ${s.tag} (${s.box.map(v => pyRound(v)).join(', ')})`);
    });
    return out;
  };
  const growth = (t, size) => (met.box(t.s || '0', size, t.ls)[2] - stockMet.box(t.s || '0', t.size, t.ls)[2]) * t.m[0];

  for (const t of texts) t.dx = -t.align * growth(t, t.new);
  if (p.fit) {
    for (let it = 0; it < 60; it++) {
      const boxes = texts.map(t => box(t, t.new, t.dx));
      const bad = texts.map((t, i) => i).filter(i => problems(i, boxes[i], boxes).length);
      if (!bad.length) break;
      for (const i of bad) {
        const t = texts[i];
        const opts = [t.align, ...(!t.code && t.solo ? [0, 0.5, 1].filter(a => a !== t.align) : [])];
        let fixed = false;
        for (const a of opts) {
          const dx = -a * growth(t, t.new), bx = box(t, t.new, dx);
          if (!problems(i, bx, boxes).length) { t.dx = dx; boxes[i] = bx; fixed = true; break; }
        }
        if (!fixed && t.new > t.floor) {
          t.new = Math.max(t.floor, t.new - 1);
          t.dx = -t.align * growth(t, t.new);
          boxes[i] = box(t, t.new, t.dx);
        }
      }
    }
  }
  const low = new Map();
  texts.forEach((t, i) => { const r = find(i); low.set(r, Math.min(low.has(r) ? low.get(r) : t.new, t.new)); });
  texts.forEach((t, i) => {
    if (low.get(find(i)) < t.new) { t.new = low.get(find(i)); t.dx = -t.align * growth(t, t.new); }
  });
  if (p.steps) for (const t of texts) if (t.new < t.target) { t.new = t.size; t.dx = 0; }
  const boxes = texts.map(t => box(t, t.new, t.dx));
  texts.forEach((t, i) => {
    const pr = problems(i, boxes[i], boxes);
    if (pr.length) warns.push(`'${t.s.slice(0, 16)}' ${fmt(t.size)}->${fmt(t.new)}px: ${[...new Set(pr)].sort().slice(0, 3).join('; ')}`);
    else if (t.new < t.target) warns.push(`'${t.s.slice(0, 16)}' held at ${fmt(t.new)}px (target ${fmt(t.target)}) to fit`);
  });

  // plan the <text> start tag rewrites in document order: [start, end, font-size or null, matrix(...) or null]
  const clean = svgText.replace(/<!--[\s\S]*?-->/g, m => ' '.repeat(m.length));
  const starts = [...clean.matchAll(/<text\b[^>]*>/g)];
  const all = allElements(root).filter(e => tagOf(e) === 'text');
  if (starts.length !== all.length) return {edits: [], warns: [`<text> tags don't line up with the parse; left stock`]};
  const order = new Map(all.map((e, k) => [e, k]));
  const edits = [];
  for (const t of texts) {
    if (t.new === t.size && Math.abs(t.dx) < 0.01) continue;
    const m = starts[order.get(t.el)];
    const tag = svgText.slice(m.index, m.index + m[0].length);
    let matrix = null;
    if (Math.abs(t.dx) >= 0.01) {
      const mm = /transform="matrix\(([^)]*)\)"/.exec(tag);
      const n = mm ? mm[1].match(NUM) || [] : [];
      if (n.length === 6) {
        n[4] = fmt(parseFloat(n[4]) + t.dx / (t.m[0] || 1));
        matrix = `transform="matrix(${n.join(' ')})"`;
      }
    }
    edits.push([m.index, m.index + m[0].length, t.new !== t.size ? `font-size="${fmt(t.new)}${t.unit}"` : null, matrix]);
  }
  edits.sort((a, b) => a[0] - b[0]);
  return {edits, warns};
}

// The fit never looks at colour values (only at whether fill/stroke are "none"), so plans are cached per screen
// with every #RRGGBB attribute value masked: a colour change reuses the plan, and masking keeps every offset.
const plans = new Map();
const mask = s => s.replace(/(=")#[0-9A-Fa-f]{6}"/g, '$1#000000"');

/** Return [newSvgText, warnings]. `met` = fontMetrics of the stock font. */
export function enlarge(svgText, filename, parse, met, params) {
  const key = `${filename}\0${JSON.stringify(params || {})}\0${mask(svgText)}`;
  if (!plans.has(key)) {
    if (plans.size > 500) plans.clear();
    plans.set(key, plan(mask(svgText), filename, parse, met, params));
  }
  const {edits, warns} = plans.get(key);
  const out = [];
  let pos = 0;
  for (const [s, e, size, matrix] of edits) {
    let tag = svgText.slice(s, e);
    if (size) tag = tag.replace(/font-size="[^"]*"/, () => size);
    if (matrix) tag = tag.replace(/transform="matrix\(([^)]*)\)"/, () => matrix);
    out.push(svgText.slice(pos, s), tag);
    pos = e;
  }
  out.push(svgText.slice(pos));
  return [out.join(''), warns];
}
