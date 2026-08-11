const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function rebuild(parts, destination) {
  const joined = parts.map((relative) => fs.readFileSync(path.join(root, relative), 'utf8').trim()).join('');
  const bytes = Buffer.from(joined, 'base64');
  if (!bytes.length) throw new Error(`Asset vacío: ${destination}`);
  const target = path.join(root, destination);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, bytes);
  return bytes.length;
}

const backgroundSize = rebuild([
  'build-assets/v061/background-01.b64',
  'build-assets/v061/background-02.b64',
  'build-assets/v061/background-03.b64',
  'build-assets/v061/background-04.b64'
], 'src/assets/v061-background.webp');

const logoSize = rebuild([
  'build-assets/v061/logo-01.b64',
  'build-assets/v061/logo-02.b64'
], 'src/assets/v061-logo.webp');

console.log(`v0.6.1 assets reconstructed: background=${backgroundSize} bytes, logo=${logoSize} bytes`);
