# Theme format

A theme is one JSON file. Every key is optional; anything left out stays stock. Keys starting with `_` are notes
and are ignored. The app's **Save theme** writes this format and **Open theme** reads it. It is the same format as
the workspace's `scripts/theme/opxy_theme.py`, except that `roles`, `art` and `inserts` are written inline rather than
as file paths (`tools/bundle-theme.mjs` converts one to the other).

| Key | What it does |
|---|---|
| `name` | Shown in the app and used for the download's name |
| `greys` | `{"grey1": "#RRGGBB", …, "grey8": …}`: the neutral ramp. Replaces the 8 stock greys wherever no rule applies, and seeds the palette greys |
| `encoders` | Four `{"main": "#…", "dim": "#…"}`, one per knob, used by the rules below as `enc1.main` … `enc4.dim` |
| `palette` | Swatches in `xy_palette.svg`, which the OS reads at runtime: `grey1`…`grey8`, `red` (`black`, `white` and `blue` have no runtime reader). A value may be `enc2.main` etc. |
| `files` | Per-file colour swaps: `{"tempo.svg": {"#7d7d7d": "#3F6E6A"}}` |
| `roles` | Which elements belong to which knob: `{"file.svg": [rule, …]}`. The Encoder theme's set covers the stock 1.2.0 screens |
| `art` | More rules, applied after `roles`: per-screen art direction |
| `inserts` | New id-less shapes: `{"fmstrings2.svg": [{"before_id": "values", "svg": "<rect …/>"}]}`. Colours may be `{enc1.main}` |
| `text` | Present = bigger text, fitted so nothing new collides or overflows. Optional `sizes` (`[[stock px, factor], …]`) and `files` (limit to these screens) |
| `families` | `{"name": {"hue": [h1, h2, …], "chroma": 0.08, "files": [...]}}`: a tinted ramp per group of screens (OKLCH, each grey keeps its lightness) |
| `screens` | `{"ep.svg": {"hue": [280, 330], "chroma": 0.13}}`: a family of one screen |

## Rules

The stock greys do double duty. TE codes knob *k* with a pair of greys (the OP-XY's knobs are dark grey, mid grey,
light grey and white), but the same greys also shade illustrations, so rules say which elements are which.
The first matching rule wins; unmatched greys get the neutral ramp.

| Field | Meaning |
|---|---|
| `within` | Regex: an ancestor's id (or the element's own) must match, after dropping Illustrator's `_0000…_` suffix |
| `tags` | Element types, e.g. `["rect", "circle"]` (default: any shape) |
| `attr` | `"fill"`, `"stroke"` or `"both"` (default) |
| `region` | `[x0, y0, x1, y1]`: the element's box centre must lie inside (screen coordinates, 480×220) |
| `max`, `min` | `[w, h]`: box size limits |
| `black` | `true`: treat a shape with no fill as black (the SVG default) and give it a fill |
| `mode` | `"pair"` (stock grey index *g* → knob *g*÷2, TE's own coding), `"rank"` (by stock lightness), `"column"` (by box centre, with `"columns": [x0, …, x4]`), `"order"` (document order), or `1`–`4` (that knob) |
| `tone` | `"main"`, `"dim"` or `"pair"` (default: the darker grey of TE's pair → dim) |
| `colour` | Paint this colour (`#RRGGBB` or `enc2.main`) instead of a knob hue |
| `colours` | One colour per index the mode gives |
| `any` | Also select elements painted in non-grey colours |
| `pick` | `[i, j]`: keep only selected elements *i*…*j*−1, in document order |

## What the app refuses

Every screen it writes must keep every id (the OS looks elements up by id) and pass the checks for what the
OS 1.2.0 SVG engine accepts (`engine/check.js`): for example, a number with five or more decimals halts the
parser, and colours must be `#rgb`, `#rrggbb`, `rgb()` or `none`. A theme that breaks either is not built.
