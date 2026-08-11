const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  PACK_MARKER,
  determinePackState,
  ensureOfficialLauncherProfile
} = require('../src/official-launcher-bridge');

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'emilauncher-v06-'));
}

function writePack(dir, name = 'EmiCobleverse 1.0.0.mrpack', body = 'pack') {
  const file = path.join(dir, name);
  fs.writeFileSync(file, body);
  return file;
}

function markerFor(mrpackPath, versionId = '1.0.0') {
  const stat = fs.statSync(mrpackPath);
  return {
    pack: 'EmiCobleverse',
    versionId,
    minecraft: '1.21.1',
    fabricLoader: '0.18.4',
    source: path.resolve(mrpackPath),
    size: stat.size,
    mtimeMs: Math.trunc(stat.mtimeMs)
  };
}

test('fresh installation shows INSTALAR', () => {
  const root = tempDir();
  const mrpack = writePack(root);
  const game = path.join(root, 'game');
  const state = determinePackState(game, mrpack);
  assert.equal(state.action, 'install');
  assert.equal(state.label, 'INSTALAR');
});

test('unchanged development pack shows JUGAR', () => {
  const root = tempDir();
  const mrpack = writePack(root);
  const game = path.join(root, 'game');
  fs.mkdirSync(game, { recursive: true });
  fs.writeFileSync(path.join(game, PACK_MARKER), JSON.stringify(markerFor(mrpack)));
  const state = determinePackState(game, mrpack);
  assert.equal(state.action, 'play');
  assert.equal(state.label, 'JUGAR');
});

test('changed mrpack shows ACTUALIZAR', async () => {
  const root = tempDir();
  const mrpack = writePack(root);
  const game = path.join(root, 'game');
  fs.mkdirSync(game, { recursive: true });
  fs.writeFileSync(path.join(game, PACK_MARKER), JSON.stringify(markerFor(mrpack)));
  await new Promise((resolve) => setTimeout(resolve, 15));
  fs.appendFileSync(mrpack, '-new');
  const state = determinePackState(game, mrpack);
  assert.equal(state.action, 'update');
  assert.equal(state.label, 'ACTUALIZAR');
});

test('official launcher profile preserves existing profiles and configures EmiCobleverse', () => {
  const root = tempDir();
  const minecraftRoot = path.join(root, '.minecraft');
  const game = path.join(root, 'EmiCobleverse');
  fs.mkdirSync(minecraftRoot, { recursive: true });
  fs.writeFileSync(path.join(minecraftRoot, 'launcher_profiles.json'), JSON.stringify({
    profiles: { Vanilla: { name: 'Vanilla', lastVersionId: 'latest-release' } },
    settings: { crashAssistance: true },
    version: 3
  }));

  const result = ensureOfficialLauncherProfile(
    minecraftRoot,
    game,
    'fabric-loader-0.18.4-1.21.1',
    8
  );
  assert.equal(result.profile.name, 'EmiCobleverse');
  assert.equal(result.profile.lastVersionId, 'fabric-loader-0.18.4-1.21.1');
  assert.equal(result.profile.gameDir, path.resolve(game));
  assert.match(result.profile.javaArgs, /-Xmx8G/);

  const saved = JSON.parse(fs.readFileSync(path.join(minecraftRoot, 'launcher_profiles.json'), 'utf8'));
  assert.equal(saved.profiles.Vanilla.name, 'Vanilla');
  assert.equal(saved.profiles.EmiCobleverse.name, 'EmiCobleverse');
  assert.equal(saved.settings.crashAssistance, true);
  assert.ok(fs.existsSync(path.join(minecraftRoot, 'launcher_profiles.json.emilauncher-backup')));
});

test('approved launcher background is packaged as a valid JPEG', () => {
  const image = fs.readFileSync(path.join(__dirname, '..', 'src', 'assets', 'v06-background.jpg'));
  assert.ok(image.length > 10000);
  assert.equal(image[0], 0xff);
  assert.equal(image[1], 0xd8);
  assert.equal(image.at(-2), 0xff);
  assert.equal(image.at(-1), 0xd9);
});
