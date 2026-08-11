const test = require('node:test');
const assert = require('node:assert/strict');
const { safeRelativePath, javaMajorFromText } = require('../src/minecraft-runtime');

test('runtime dependencies expose the APIs EmiLauncher needs', () => {
  const core = require('@xmcl/core');
  const installer = require('@xmcl/installer');
  const user = require('@xmcl/user');
  const unzipper = require('unzipper');
  assert.equal(typeof core.Version.parse, 'function');
  assert.equal(typeof core.launch, 'function');
  assert.equal(typeof installer.getVersionList, 'function');
  assert.equal(typeof installer.install, 'function');
  assert.equal(typeof installer.installDependencies, 'function');
  assert.equal(typeof user.MicrosoftAuthenticator, 'function');
  assert.equal(typeof unzipper.Open.file, 'function');
});

test('mrpack path sanitizer accepts normal relative paths', () => {
  assert.equal(safeRelativePath('mods/example.jar'), 'mods/example.jar');
  assert.equal(safeRelativePath('config\\emi\\test.json'), 'config/emi/test.json');
});

test('mrpack path sanitizer rejects traversal and absolute paths', () => {
  assert.throws(() => safeRelativePath('../secret.txt'));
  assert.throws(() => safeRelativePath('/etc/passwd'));
  assert.throws(() => safeRelativePath('C:/Windows/test.txt'));
});

test('Java version parser recognizes Java 21 and legacy Java 8', () => {
  assert.equal(javaMajorFromText('openjdk version "21.0.7" 2025-04-15 LTS'), 21);
  assert.equal(javaMajorFromText('OpenJDK 21'), 21);
  assert.equal(javaMajorFromText('java version "1.8.0_401"'), 8);
});
