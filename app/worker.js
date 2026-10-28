// Builds run here so the page stays responsive while colours are dragged.
import opentype from 'https://cdn.jsdelivr.net/npm/opentype.js@1.3.4/dist/opentype.module.js';
import {build} from '../engine/theme.js';
import {fontMetrics} from '../engine/text.js';
import {parseXML} from '../engine/xml.js';

let stock = null, metrics = null;
onmessage = ({data}) => {
  if (data.type === 'init') {
    stock = data.stock;
    metrics = fontMetrics(opentype.parse(data.font.slice(0)), data.font);
    return;
  }
  try {
    const t0 = performance.now();
    const result = build(data.theme, stock, parseXML, metrics);
    postMessage({id: data.id, result, ms: performance.now() - t0});
  } catch (err) {
    postMessage({id: data.id, error: err.message});
  }
};
