const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('v0.6.1 reconstructs the approved HD WebP exactly', () => {
  const target = path.join(root, 'src', 'assets', 'v061-background.webp');
  assert.ok(fs.existsSync(target));
  const bytes = fs.readFileSync(target);
  assert.equal(bytes.length, 85990);
  assert.equal(bytes.subarray(0, 4).toString('ascii'), 'RIFF');
  assert.equal(bytes.subarray(8, 12).toString('ascii'), 'WEBP');
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), '39b5a0a4e97c966e73da256d7de6f89aa7ac3841c32f11b66d5bdb42670bd9a6');
});

test('v0.6.1 UI uses the HD asset and keeps the simplified controls', () => {
  const html = read('src/index-v06.html');
  const renderer = read('src/renderer-v06.js');
  const layout = read('src/v06-layout.css');
  assert.match(html, /assets\/v061-background\.webp/);
  assert.match(renderer, /assets\/v061-background\.webp/);
  assert.match(html, /v0\.6\.1/);
  assert.match(html, /id="primaryButton"/);
  assert.match(html, /id="folderButton"/);
  assert.match(html, /id="settingsButton"/);
  assert.match(html, /id="ramButton"/);
  assert.doesNotMatch(html, /Noticias y comunidad|Cuenta Microsoft|newsSection|accountButton/);
  assert.match(layout, /image-rendering:auto/);
  assert.match(layout, /logo-crop/);
});

test('v0.6.1 uses a native 16:9 fixed preview to avoid stretching the art', () => {
  const main = read('src/main-v06.js');
  assert.match(main, /width:\s*1152/);
  assert.match(main, /height:\s*648/);
  assert.match(main, /resizable:\s*false/);
  assert.match(main, /maximizable:\s*false/);
});

test('package version and scripts are v0.6.1', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.version, '0.6.1');
  assert.match(pkg.scripts['prepare-assets'], /reconstruct-v061-assets/);
  assert.match(pkg.scripts.dist, /prepare-assets/);
});
