// Rough geometry for OP-XY screen SVGs: painted elements with their absolute bounding boxes.
// Port of scripts/theme/svggeom.py. Only what the stock Illustrator exports use: translate/matrix
// transforms, rect, circle, ellipse, line, polyline, polygon, path (M/L/H/V/C/S/Q/T/Z) and text.

export const NUM = /-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g;
export const SHAPES = new Set(['rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'path', 'text']);

export const nums = s => (String(s ?? '').match(NUM) || []).map(Number);
export const tagOf = e => e.localName || e.nodeName.split(':').pop();
export const kids = e => Array.from(e.childNodes).filter(c => c.nodeType === 1);
export const attr = (e, k) => (e.hasAttribute(k) ? e.getAttribute(k) : null);

/** Every element in document order, root first (ElementTree's root.iter()). */
export function allElements(root) {
  const out = [];
  (function go(e) { out.push(e); for (const c of kids(e)) go(c); })(root);
  return out;
}

export function mul(a, b) {
  return [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
}

export function parseTransform(v) {
  let m = [1, 0, 0, 1, 0, 0];
  for (const [, fn, args] of String(v ?? '').matchAll(/(\w+)\s*\(([^)]*)\)/g)) {
    const n = nums(args);
    let t;
    if (fn === 'matrix' && n.length === 6) t = n;
    else if (fn === 'translate') t = [1, 0, 0, 1, n[0], n.length > 1 ? n[1] : 0];
    else if (fn === 'scale') t = [n[0], 0, 0, n.length > 1 ? n[1] : n[0], 0, 0];
    else continue;
    m = mul(m, t);
  }
  return m;
}

const STEP = {M: 2, L: 2, T: 2, H: 1, V: 1, C: 6, S: 4, Q: 4};

export function pathPoints(d) {
  const pts = [];
  let x = 0, y = 0, sx = 0, sy = 0;
  for (const [, cmd, args] of d.matchAll(/([MLHVCSQTZmlhvcsqtz])([^MLHVCSQTZmlhvcsqtz]*)/g)) {
    const n = nums(args), rel = cmd !== cmd.toUpperCase(), c = cmd.toUpperCase();
    if (c === 'Z') { x = sx; y = sy; continue; }
    const step = STEP[c];
    for (let i = 0; i + step <= n.length; i += step) {
      const g = n.slice(i, i + step);
      if (c === 'H') x = rel ? x + g[0] : g[0];
      else if (c === 'V') y = rel ? y + g[0] : g[0];
      else {
        for (let j = 0; j < step; j += 2) pts.push(rel ? [x + g[j], y + g[j + 1]] : [g[j], g[j + 1]]);
        [x, y] = rel ? [x + g[step - 2], y + g[step - 1]] : [g[step - 2], g[step - 1]];
      }
      pts.push([x, y]);
      if (c === 'M' && i === 0) { sx = x; sy = y; }
    }
  }
  return pts;
}

export function localPoints(e, tag) {
  const f = (k, d = 0) => { const n = nums(attr(e, k) ?? String(d)); return n.length ? n[0] : d; };
  if (tag === 'rect') {
    const x = f('x'), y = f('y');
    return [[x, y], [x + f('width'), y + f('height')]];
  }
  if (tag === 'circle') { const r = f('r'); return [[f('cx') - r, f('cy') - r], [f('cx') + r, f('cy') + r]]; }
  if (tag === 'ellipse') return [[f('cx') - f('rx'), f('cy') - f('ry')], [f('cx') + f('rx'), f('cy') + f('ry')]];
  if (tag === 'line') return [[f('x1'), f('y1')], [f('x2'), f('y2')]];
  if (tag === 'polyline' || tag === 'polygon') {
    const n = nums(attr(e, 'points') ?? '');
    const out = [];
    for (let i = 0; i + 1 < n.length; i += 2) out.push([n[i], n[i + 1]]);
    return out;
  }
  if (tag === 'path') return pathPoints(attr(e, 'd') ?? '');
  if (tag === 'text') {
    const size = f('font-size', 12);
    return [[f('x'), f('y') - size], [f('x') + 0.5 * size * e.textContent.length, f('y')]];
  }
  return [];
}

/** [{e, tag, bbox: [x0,y0,x1,y1] | null, ids: ancestor ids incl. own, hidden}] in document order. */
export function walk(root) {
  const out = [];
  (function go(e, m, ids, hidden) {
    const tag = tagOf(e);
    m = mul(m, parseTransform(attr(e, 'transform')));
    hidden = hidden || attr(e, 'display') === 'none';
    if (attr(e, 'id')) ids = [...ids, attr(e, 'id')];
    let bbox = null;
    if (SHAPES.has(tag)) {
      const pts = localPoints(e, tag).map(([x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]);
      if (pts.length) {
        const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
        bbox = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
      }
    }
    out.push({e, tag, bbox, ids, hidden});
    if (tag === 'font' || tag === 'defs' || tag === 'metadata') return;
    for (const c of kids(e)) go(c, m, ids, hidden);
  })(root, [1, 0, 0, 1, 0, 0], [], false);
  return out;
}
