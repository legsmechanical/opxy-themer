// Write stock-1.2.0.json: sha256 and size of every file in a stock OS 1.2.0 /content/display folder.
// The app ships these hashes, never TE's files: users load their own screens and the app checks them.
//   node tools/stock-manifest.mjs STOCK_DISPLAY_DIR > engine/stock-1.2.0.json
import {readFileSync, readdirSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';

const dir = process.argv[2];
const files = {};
for (const n of readdirSync(dir).sort()) {
  const b = readFileSync(join(dir, n));
  files[n] = {sha256: createHash('sha256').update(b).digest('hex'), size: b.length};
}
console.log(JSON.stringify({os: '1.2.0', folder: '/content/display', files}, null, 1));
