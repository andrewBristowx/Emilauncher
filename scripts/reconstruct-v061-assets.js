const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.resolve(__dirname, '..');
const EXPECTED_SHA256 = '1f605cc7ef45b2a1cf215953903952cbb52f4ec74f2d57ed93a549f9ba5bbe43';
const EXPECTED_SIZE = 85992;
const DIAGNOSTIC = path.join(root, 'asset-diagnostic.txt');

function rebuild(parts, destination) {
  const joined = parts.map((relative) => fs.readFileSync(path.join(root, relative), 'utf8').trim()).join('');
  const bytes = Buffer.from(joined, 'base64');
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  fs.writeFileSync(DIAGNOSTIC, `joinedChars=${joined.length}\nsize=${bytes.length}\nsha256=${sha256}\n`, 'utf8');
  if (bytes.length !== EXPECTED_SIZE || sha256 !== EXPECTED_SHA256) {
    throw new Error(`Asset HD v0.6.1 inválido: size=${bytes.length}, sha256=${sha256}`);
  }
  if (bytes.subarray(0, 4).toString('ascii') !== 'RIFF' || bytes.subarray(8, 12).toString('ascii') !== 'WEBP') {
    throw new Error('El fondo v0.6.1 reconstruido no es un WebP válido.');
  }
  const target = path.join(root, destination);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, bytes);
  return { size: bytes.length, sha256 };
}

const background = rebuild([
  'build-assets/v061/background-01.b64',
  'build-assets/v061/background-02.b64',
  'build-assets/v061/background-03.b64',
  'build-assets/v061/background-04.b64',
  'build-assets/v061/background-05.b64',
  'build-assets/v061/background-06.b64',
  'build-assets/v061/background-07.b64',
  'build-assets/v061/background-08.b64'
], 'src/assets/v061-background.webp');

console.log(`v0.6.1 HD background reconstructed: ${background.size} bytes sha256=${background.sha256}`);
