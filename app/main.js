// OP-XY Themer: load the user's stock screens, edit a theme, preview every screen, download the files.
import {familyRamp, STOCK_GREYS} from '../engine/theme.js';
import {zip} from './zip.js';
import {GROUPS, RUNTIME, SWATCH_ROLES, groupOf, label} from './screens.js';

const $ = id => document.getElementById(id);
const FONT = 'UniversNextPro-Light.otf';
const PRESETS = [['encoder', 'Encoder'], ['stock', 'Stock'], ['blue', 'Blue']];
const GREY_IDS = Object.keys(STOCK_GREYS);
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(`opxy-themer:${k}`)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(`opxy-themer:${k}`, JSON.stringify(v)); } catch { /* private mode */ } },
};

const manifest = await fetch('engine/stock-1.2.0.json').then(r => r.json());
const presets = Object.fromEntries(await Promise.all(PRESETS.map(async ([id]) =>
  [id, await fetch(`themes/${id}.json`).then(r => r.json())])));
// Knob mapping and art direction come from the Encoder theme; other presets can switch them on.
const ENCODER = presets.encoder;

// Second opinion before anything is downloaded: the browser's own strict XML parser.
function browserParses(text) {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  return !doc.getElementsByTagName('parsererror').length;
}

let stock = null;        // {name: svg text}
const worker = new Worker(new URL('./worker.js', import.meta.url), {type: 'module'});
let theme = null;        // the theme being edited
let result = {files: {}, counts: {}, warnings: []};
let view = 'theme', group = 'All';

// ---------- loading the user's files ----------

const hex = async buf => [...new Uint8Array(await crypto.subtle.digest('SHA-256', buf))]
  .map(b => b.toString(16).padStart(2, '0')).join('');

async function accept(entries) {   // entries: [[name, ArrayBuffer]]
  const status = $('load-status');
  status.className = 'status';
  status.textContent = 'Checking files…';
  const found = {}, modified = [];
  for (const [name, buf] of entries) {
    const want = manifest.files[name];
    if (!want) continue;
    if (await hex(buf) === want.sha256) found[name] = buf;
    else if (!found[name]) modified.push(name);
  }
  const needed = Object.keys(manifest.files).filter(n => n.endsWith('.svg') || n === FONT);
  const missing = needed.filter(n => !found[n]);
  if (missing.length) {
    const changed = missing.filter(n => modified.includes(n));
    status.className = 'status bad';
    status.textContent = !Object.keys(found).length && !modified.length
      ? 'No OP-XY screen files found. Choose the display folder itself.'
      : changed.length
        ? `${changed.length} file${changed.length > 1 ? 's are' : ' is'} not stock OS 1.2.0 (${changed.slice(0, 4).join(', ')}${changed.length > 4 ? '…' : ''}). The app needs unmodified screens: use the copy you made before theming, or the files from a stock device.`
        : `Missing ${missing.length} file${missing.length > 1 ? 's' : ''}: ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? '…' : ''}.`;
    return;
  }
  saveFiles(found);
  await open(found);
}

async function open(found) {
  const dec = new TextDecoder();
  stock = Object.fromEntries(Object.entries(found).filter(([n]) => n.endsWith('.svg')).map(([n, b]) => [n, dec.decode(b)]));
  const fontBuf = found[FONT];
  worker.postMessage({type: 'init', stock, font: fontBuf.slice(0)});
  const face = new FontFace('OPXY Stock', fontBuf.slice(0));
  document.fonts.add(await face.load());
  $('welcome').hidden = true;
  $('studio').hidden = false;
  $('actions').hidden = $('theme-name').hidden = false;
  setTheme(store.get('theme') || presets.encoder, false);
}

function readEntry(entry, out) {
  return new Promise(resolve => {
    if (entry.isFile) entry.file(f => f.arrayBuffer().then(b => { out.push([f.name, b]); resolve(); }), resolve);
    else if (entry.isDirectory) {
      const r = entry.createReader(), all = [];
      const next = () => r.readEntries(batch => {
        if (!batch.length) Promise.all(all.map(e => readEntry(e, out))).then(resolve);
        else { all.push(...batch); next(); }
      }, resolve);
      next();
    } else resolve();
  });
}

const drop = $('drop');
drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
drop.addEventListener('dragleave', () => drop.classList.remove('over'));
drop.addEventListener('drop', async e => {
  e.preventDefault();
  drop.classList.remove('over');
  const out = [];
  await Promise.all([...e.dataTransfer.items].map(i => i.webkitGetAsEntry?.()).filter(Boolean).map(en => readEntry(en, out)));
  accept(out);
});
$('pick-folder').addEventListener('change', async e => {
  accept(await Promise.all([...e.target.files].map(async f => [f.name, await f.arrayBuffer()])));
});

// The stock files are kept in this browser (IndexedDB) so a returning visit skips the loading step.
function db() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('opxy-themer', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('files');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function saveFiles(found) {
  try {
    const d = await db();
    d.transaction('files', 'readwrite').objectStore('files').put(found, 'stock-1.2.0');
  } catch { /* storage unavailable: the user loads the folder again next time */ }
}
async function loadSavedFiles() {
  try {
    const d = await db();
    return await new Promise(resolve => {
      const req = d.transaction('files').objectStore('files').get('stock-1.2.0');
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch { return null; }
}

// ---------- the theme ----------

const clone = o => JSON.parse(JSON.stringify(o));
const up = c => c.toUpperCase();

function setTheme(t, persist = true) {
  theme = clone(t);
  if (!theme.encoders || !theme.encoders.length) theme.encoders = clone(ENCODER.encoders);
  theme.name = theme.name || 'My theme';
  renderPanel();
  changed(persist);
}

let timer = 0;
function changed(persist = true) {
  if (persist) store.set('theme', theme);
  $('json').value = JSON.stringify(theme, null, 1);
  clearTimeout(timer);
  timer = setTimeout(rebuild, 30);
}

// One build in flight at a time; while it runs, only the newest theme waits its turn.
let sent = 0, busy = false, waiting = false;
function rebuild() {
  if (busy) { waiting = true; return; }
  busy = true;
  worker.postMessage({type: 'build', id: ++sent, theme});
}
worker.onmessage = ({data}) => {
  busy = false;
  const status = $('build-status');
  if (data.error) {
    status.className = 'status bad';
    status.textContent = `Not built: ${data.error}`;
    $('download').disabled = true;
  } else {
    result = data.result;
    const n = Object.keys(result.files).length;
    status.className = 'status ok';
    status.textContent = `${n} screen${n === 1 ? '' : 's'} changed · all pass the OS's SVG checks · ${Math.round(data.ms)} ms`;
    $('download').disabled = n === 0;
    renderGrid();
  }
  if (waiting) { waiting = false; rebuild(); }
};
worker.onerror = e => {
  $('build-status').className = 'status bad';
  $('build-status').textContent = `The theme engine didn't start (${e.message || 'check your connection'}).`;
};

function colourInput(value, onInput, title) {
  const i = document.createElement('input');
  i.type = 'color';
  i.value = `#${value.replace(/^#/, '').toLowerCase()}`;
  if (title) i.title = title;
  i.addEventListener('input', () => onInput(up(i.value)));
  return i;
}

function labelled(text, input) {
  const l = document.createElement('label');
  l.className = 'colour';
  const h = document.createElement('span');
  h.className = 'hex';
  h.textContent = input.value.toUpperCase();
  input.addEventListener('input', () => { h.textContent = input.value.toUpperCase(); });
  l.append(input, Object.assign(document.createElement('span'), {textContent: text}), h);
  return l;
}

function renderPanel() {
  $('theme-name').value = theme.name;
  $('presets').replaceChildren(...PRESETS.map(([id, name]) => {
    const b = document.createElement('button');
    b.textContent = name;
    b.classList.toggle('on', theme.name === presets[id].name);
    b.addEventListener('click', () => setTheme(presets[id]));
    return b;
  }));

  const enc = $('encoders');
  enc.replaceChildren(...theme.encoders.map((e, i) => {
    const row = document.createElement('div');
    row.className = 'enc';
    const knob = document.createElement('span');
    knob.className = 'knob';
    knob.style.background = `#${e.main.replace('#', '')}`;
    const lab = document.createElement('span');
    lab.className = 'enc-label';
    lab.append(knob, `${i + 1}`);
    const main = colourInput(e.main, v => { e.main = v; knob.style.background = v; changed(); }, `Knob ${i + 1} main`);
    const dim = colourInput(e.dim, v => { e.dim = v; changed(); }, `Knob ${i + 1} dim`);
    row.append(lab, labelled('main', main), labelled('dim', dim));
    return row;
  }));
  const toggles = document.createElement('div');
  toggles.className = 'row';
  for (const [key, text] of [['roles', 'Colour by knob'], ['art', 'Illustrations']]) {
    const l = document.createElement('label');
    l.className = 'check';
    const c = Object.assign(document.createElement('input'), {type: 'checkbox', checked: !!theme[key]});
    c.addEventListener('change', () => {
      if (c.checked) theme[key] = clone(ENCODER[key]);
      else delete theme[key];
      changed();
    });
    l.append(c, text);
    toggles.append(l);
  }
  enc.append(toggles);

  const greys = $('greys');
  greys.replaceChildren(...GREY_IDS.map(g => {
    const cur = (theme.greys || {})[g] || `#${STOCK_GREYS[g]}`;
    return labelled(g.replace('grey', ''), colourInput(cur, v => {
      theme.greys = {...(theme.greys || {}), [g]: v};
      changed();
      renderPalette();
    }, g));
  }));
  renderPalette();
  $('bigger-text').checked = theme.text != null;
}

function renderPalette() {
  const ids = [...GREY_IDS, 'red'];
  const stockPal = {red: '#E5371B'};
  $('palette').replaceChildren(...ids.map(id => {
    const own = (theme.palette || {})[id];
    const follows = !own && id !== 'red';
    const eff = own || (theme.greys || {})[id] || stockPal[id] || `#${STOCK_GREYS[id]}`;
    const row = document.createElement('div');
    row.className = `pal${follows ? ' follow' : ''}`;
    const input = colourInput(eff.startsWith('enc') ? '#888888' : eff, v => {
      theme.palette = {...(theme.palette || {}), [id]: v};
      row.classList.remove('follow');
      changed();
    }, id);
    const what = document.createElement('div');
    what.className = 'what';
    what.innerHTML = `<b>${id}</b> <span>${SWATCH_ROLES[id]}</span>`;
    const reset = document.createElement('button');
    reset.className = 'ghost';
    reset.textContent = 'reset';
    reset.hidden = !own;
    reset.addEventListener('click', () => {
      delete theme.palette[id];
      changed();
      renderPalette();
    });
    row.append(input, what, reset);
    return row;
  }));
}

// tint: every neutral keeps its stock lightness and takes a hue (OKLCH), like the theme engine's families
function applyTint() {
  const amount = +$('tint-amount').value / 1000;
  if (amount === 0) delete theme.greys;
  else {
    const ramp = familyRamp({hue: [+$('tint-hue').value], chroma: amount});
    theme.greys = Object.fromEntries(GREY_IDS.map(g => [g, `#${ramp[STOCK_GREYS[g]]}`]));
  }
  changed();
  renderPanel();
}
$('tint-hue').addEventListener('input', applyTint);
$('tint-amount').addEventListener('input', applyTint);
$('bigger-text').addEventListener('change', e => {
  if (e.target.checked) theme.text = clone(ENCODER.text || {});
  else delete theme.text;
  changed();
});
$('theme-name').addEventListener('input', e => { theme.name = e.target.value; changed(); });
$('json-apply').addEventListener('click', () => {
  const s = $('json-status');
  try {
    setTheme(JSON.parse($('json').value));
    s.className = 'status ok';
    s.textContent = 'Applied.';
  } catch (err) {
    s.className = 'status bad';
    s.textContent = err.message;
  }
});

// ---------- preview ----------

const SHADOW_CSS = `:host{display:block}svg{display:block;width:100%;height:100%}
text{font-family:'OPXY Stock',sans-serif!important;text-anchor:start!important}`;

function fill(host, svgText) {
  host.shadowRoot.innerHTML = `<style>${SHADOW_CSS}</style>${svgText.replace(/^[\s\S]*?(?=<svg\b)/, '')}`;
}

function screen(svgText) {
  const host = document.createElement('div');
  host.className = 'screen';
  host.attachShadow({mode: 'open'});
  if (svgText) fill(host, svgText);
  return host;
}

function names() {
  return Object.keys(stock).sort((a, b) => label(a).localeCompare(label(b)))
    .filter(n => group === 'All' || (group === 'Changed' ? n in result.files : groupOf(n) === group));
}

// Cards are kept between rebuilds. A screen is drawn only while its card is on screen, and redrawn only when
// its SVG text changed: drawing all 83 at once held up the page for ~200 ms per change.
const cards = new Map(), onScreen = new Set();
const seen = new IntersectionObserver(entries => {
  for (const e of entries) {
    const n = e.target.dataset.name;
    if (e.isIntersecting) { onScreen.add(n); draw(cards.get(n)); } else onScreen.delete(n);
  }
}, {rootMargin: '300px'});

function draw(c) {
  if (!c.stockText) { c.stockText = stock[c.name]; fill(c.stock, c.stockText); }
  const themed = result.files[c.name] ?? stock[c.name];
  if (c.text !== themed) { c.text = themed; fill(c.themed, themed); }
}

function card(n) {
  let c = cards.get(n);
  if (!c) {
    c = {name: n, el: document.createElement('article'), shots: document.createElement('div'), stock: screen(''), themed: screen(''), text: null, stockText: null};
    c.el.dataset.name = n;
    c.shots.className = 'shots';
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.innerHTML = `<b></b><span class="file"></span>`;
    meta.firstChild.textContent = label(n);
    meta.lastChild.textContent = n;
    c.el.append(c.shots, meta);
    if (RUNTIME[n]) c.el.append(Object.assign(document.createElement('div'), {className: 'os', textContent: RUNTIME[n]}));
    c.el.addEventListener('click', () => zoom(n));
    cards.set(n, c);
    seen.observe(c.el);
  }
  if (onScreen.has(n)) draw(c);
  const cls = `card${n in result.files ? ' changed' : ''}`;
  if (c.el.className !== cls) c.el.className = cls;
  if (c.view !== view) {
    c.view = view;
    c.shots.replaceChildren(...(view === 'theme' ? [c.themed] : view === 'stock' ? [c.stock] : [c.stock, c.themed]));
  }
  return c.el;
}

let shown = '';
function renderGrid() {
  const grid = $('grid');
  grid.className = `grid${view === 'compare' ? ' compare' : ''}`;
  const list = names(), els = list.map(card), key = list.join();
  if (key !== shown) { shown = key; grid.replaceChildren(...els); }   // re-attaching restyles every screen
  if (!list.length) {
    shown = '';
    grid.replaceChildren(Object.assign(document.createElement('p'), {className: 'empty', textContent: 'No screens here.'}));
  }
}

function zoom(n) {
  $('zoom-title').textContent = `${label(n)} · ${n}`;
  const fig = (cap, text) => {
    const f = document.createElement('figure');
    f.append(Object.assign(document.createElement('figcaption'), {textContent: cap}), screen(text));
    return f;
  };
  $('zoom-body').replaceChildren(fig('Theme', result.files[n] ?? stock[n]), fig('Stock', stock[n]));
  $('zoom-note').textContent = RUNTIME[n] ? `Drawn by the OS, not shown here: ${RUNTIME[n]}` : '';
  $('zoom').showModal();
}

$('groups').replaceChildren(...['All', 'Changed', ...GROUPS.map(g => g[0]), 'System'].map(g => {
  const b = document.createElement('button');
  b.textContent = g;
  b.classList.toggle('on', g === group);
  b.addEventListener('click', () => {
    group = g;
    for (const x of $('groups').children) x.classList.toggle('on', x === b);
    renderGrid();
  });
  return b;
}));
for (const b of $('view').children) {
  b.addEventListener('click', () => {
    view = b.dataset.view;
    for (const x of $('view').children) x.classList.toggle('on', x === b);
    renderGrid();
  });
}

// ---------- files out ----------

const slug = s => (s || 'theme').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'theme';
function save(blob, name) {
  const a = Object.assign(document.createElement('a'), {href: URL.createObjectURL(blob), download: name});
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

$('save-theme').addEventListener('click', () =>
  save(new Blob([JSON.stringify(theme, null, 1)], {type: 'application/json'}), `${slug(theme.name)}.opxy-theme.json`));
$('import-theme').addEventListener('click', () => $('import-file').click());
$('import-file').addEventListener('change', async e => {
  const f = e.target.files[0];
  if (!f) return;
  try { setTheme(JSON.parse(await f.text())); } catch (err) { alert(`Couldn't open that theme: ${err.message}`); }
  e.target.value = '';
});

$('download').addEventListener('click', () => {
  const dir = `opxy-theme-${slug(theme.name)}`;
  const changedNames = Object.keys(result.files).sort();
  const unreadable = changedNames.filter(n => !browserParses(result.files[n]));
  if (unreadable.length) {
    $('build-status').className = 'status bad';
    $('build-status').textContent = `Not downloaded: ${unreadable.join(', ')} failed the browser's XML check.`;
    return;
  }
  const readme = `OP-XY theme "${theme.name}" for OS 1.2.0, made with OP-XY Themer.

display/          ${changedNames.length} themed screen files: copy into content/display on the device
restore/display/  the stock versions of the same files: copy these the same way to undo
theme.json        the theme itself: open it in OP-XY Themer to keep editing

How to copy (the OP-XY's dev menu must be enabled once, e.g. with open-xy.com or Ferret):
1. Hold "com" while powering on to enter te-boot.
2. Choose 3. dev menu, then 2. mtp file transfer (mac) or 3. mtp file transfer (windows).
3. Copy everything in display/ into content/display, replacing the files there.
4. Power off, then on.

Every file passed the checks for what the OS's SVG engine accepts. The screens are only files, so the
same te-boot route always works to put the stock files back.
`;
  save(zip([
    ...changedNames.map(n => [`${dir}/display/${n}`, result.files[n]]),
    ...changedNames.map(n => [`${dir}/restore/display/${n}`, stock[n]]),
    [`${dir}/theme.json`, JSON.stringify(theme, null, 1)],
    [`${dir}/README.txt`, readme],
  ]), `${dir}.zip`);
  $('install-summary').textContent = `${changedNames.length} screens in ${dir}.zip.`;
  $('install').showModal();
});

// ---------- start ----------

const devStock = new URLSearchParams(location.search).get('stock');
if (devStock && ['localhost', '127.0.0.1'].includes(location.hostname)) {
  // local development: load stock files from a folder the dev server can see; expose state for parity checks
  window.themer = {get result() { return result; }, get theme() { return theme; }, setTheme};
  const entries = await Promise.all(Object.keys(manifest.files).map(async n =>
    [n, await fetch(`${devStock.replace(/\/$/, '')}/${n}`).then(r => r.arrayBuffer())]));
  accept(entries);
} else {
  const saved = await loadSavedFiles();
  if (saved) {
    const ok = await Promise.all(Object.entries(saved).map(async ([n, b]) => manifest.files[n] && await hex(b) === manifest.files[n].sha256));
    if (ok.every(Boolean) && saved[FONT]) open(saved);
  }
}
