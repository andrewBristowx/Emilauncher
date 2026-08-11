const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.resolve(__dirname, '..');
const EXPECTED_SHA256 = '39b5a0a4e97c966e73da256d7de6f89aa7ac3841c32f11b66d5bdb42670bd9a6';
const EXPECTED_SIZE = 85990;

function rebuild(parts, destination) {
  const joined = parts.map((relative) => fs.readFileSync(path.join(root, relative), 'utf8').trim()).join('');
  const bytes = Buffer.from(joined, 'base64');
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
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
