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
  assert.equal(bytes.length, 85992);
  assert.equal(bytes.subarray(0, 4).toString('ascii'), 'RIFF');
  assert.equal(bytes.subarray(8, 12).toString('ascii'), 'WEBP');
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), '1f605cc7ef45b2a1cf215953903952cbb52f4ec74f2d57ed93a549f9ba5bbe43');
});

test('v0.6.1 UI uses HD art while rendering its logo and controls independently', () => {
  const html = read('src/index-v06.html');
  const renderer = read('src/renderer-v06.js');
  const layout = read('src/v06-layout.css');
  const logo = read('src/assets/v061-logo.svg');
  assert.match(html, /assets\/v061-background\.webp/);
  assert.match(renderer, /assets\/v061-background\.webp/);
  assert.match(html, /assets\/v061-logo\.svg/);
  assert.match(logo, /EMIPOKEMON/);
  assert.match(html, /v0\.6\.1/);
  assert.match(html, /id="primaryButton"/);
  assert.match(html, /id="folderButton"/);
  assert.match(html, /id="settingsButton"/);
  assert.match(html, /id="ramButton"/);
  assert.doesNotMatch(html, /logo-crop/);
  assert.doesNotMatch(html, /Noticias y comunidad|Cuenta Microsoft|newsSection|accountButton/);
  assert.match(layout, /image-rendering:auto/);
  assert.match(layout, /brand-logo/);
  assert.match(layout, /title-backdrop/);
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
