// Bundle a scripts/theme theme (which names roles.json / art.json by path) into one self-contained JSON.
//   node tools/bundle-theme.mjs ../scripts/theme/themes/encoders.json themes/encoder.json "Encoder"
import {readFileSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';

const [src, out, title] = process.argv.slice(2);
const theme = JSON.parse(readFileSync(src, 'utf8'));
for (const k of ['roles', 'art', 'inserts'])
  if (typeof theme[k] === 'string') theme[k] = JSON.parse(readFileSync(join(dirname(src), theme[k]), 'utf8'));
writeFileSync(out, JSON.stringify({name: title, ...theme}, null, 1) + '\n');
console.log(`${out}: ${Object.keys(theme).join(', ')}`);
