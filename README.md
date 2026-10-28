# OP-XY Themer

Make your own colour theme for the teenage engineering OP-XY's screens, in the browser: a colour per knob, tinted
greys, the swatches the OS paints with, bigger text. Preview every screen, then download the files to copy onto the
device. Made for **OS 1.2.0**.

- **Only screen files change.** The app writes SVGs for `/content/display`; it never builds or touches the OS.
- **Your files, not ours.** TE's screens and font aren't in this repository. You load your own `display` folder;
  the app checks each file against OS 1.2.0's stock hashes (`engine/stock-1.2.0.json`) and works from those.
- **Nothing is uploaded.** Everything runs in your browser. Your stock files are kept in the browser's storage so
  you don't have to load them again.
- **Safe output.** Every file keeps every element id and passes the checks for what the OS's SVG parser accepts.
  The download includes the stock versions of the same files, to undo.

The default theme, **Encoder**, colours each element by the knob that moves it (blue, green, orange, white, after
the OP-1), on a barely warm neutral ramp, with bigger text.

## Using it

1. Enable the OP-XY's dev menu once ([open-xy.com](https://open-xy.com) or
   [Ferret](https://github.com/bagofwaffles/ferret)).
2. Hold **com** while powering on (te-boot) → **3. dev menu** → **mtp file transfer**, and copy
   `content/display` to your computer. Keep it: it's your backup.
3. Open the app, load that folder, make your theme, **Download for OP-XY**.
4. Copy the download's `display/` files into `content/display` the same way, and restart.

## Layout

| Path | What |
|---|---|
| `index.html`, `app/` | The page: loading, editor, preview (`main.js`), builds in a worker (`worker.js`), ZIP writer |
| `engine/` | The theme engine, a port of the workspace's Python tools: `theme.js` (rules, palette, inserts), `text.js` (bigger text), `check.js` (what the OS accepts), `geom.js`, `xml.js` |
| `themes/` | Built-in themes |
| `docs/theme-format.md` | The theme JSON format |
| `tests/` | Parity tests against the Python tools |

## Development

Serve the folder over HTTP (the page uses ES modules and a worker), e.g. `python3 -m http.server`. On localhost,
`?stock=<path>` loads stock files from a path the server can see, for testing.

The engine must write exactly what `scripts/theme/opxy_theme.py` writes, byte for byte:

```sh
npm install
node tests/compare.mjs STOCK_DISPLAY_DIR themes/encoder.json PY_OUTPUT/display [THEME PY_OUTPUT/display ...]
node tests/xml-agree.mjs STOCK_DISPLAY_DIR    # the fast XML parser sees what a standard parser sees
```

`tools/bundle-theme.mjs` turns a Python-tool theme into a self-contained one; `tools/stock-manifest.mjs` makes the
stock hash list.
