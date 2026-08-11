const fs = require('fs');
const path = require('path');

const PACK_MARKER = '.emilauncher-pack.json';
const PROFILE_KEY = 'EmiCobleverse';

function readJson(filePath, fallback = null) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
  catch { return fallback; }
}

function readPackMarker(gameDirectory) {
  if (!gameDirectory) return null;
  return readJson(path.join(gameDirectory, PACK_MARKER), null);
}

function fingerprint(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  const stat = fs.statSync(filePath);
  return { source: path.resolve(filePath), size: stat.size, mtimeMs: Math.trunc(stat.mtimeMs) };
}

function determinePackState(gameDirectory, mrpackPath) {
  const marker = readPackMarker(gameDirectory);
  if (!marker) {
    return {
      action: 'install',
      label: 'INSTALAR',
      installed: false,
      updateAvailable: false,
      version: null,
      detail: 'No instalado'
    };
  }

  const current = fingerprint(mrpackPath);
  const changed = Boolean(current && (
    marker.source !== current.source ||
    Number(marker.size) !== Number(current.size) ||
    Number(marker.mtimeMs) !== Number(current.mtimeMs)
  ));

  if (changed) {
    return {
      action: 'update',
      label: 'ACTUALIZAR',
      installed: true,
      updateAvailable: true,
      version: marker.versionId || null,
      detail: `Actualización lista${marker.versionId ? ` · ${marker.versionId}` : ''}`
    };
  }

  return {
    action: 'play',
    label: 'JUGAR',
    installed: true,
    updateAvailable: false,
    version: marker.versionId || null,
    detail: marker.versionId ? `EmiCobleverse ${marker.versionId} · listo` : 'EmiCobleverse listo'
  };
}

function atomicWriteJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.emilauncher.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2), 'utf8');
  fs.renameSync(temporary, filePath);
}

function ensureOfficialLauncherProfile(minecraftRoot, gameDirectory, versionId, ramGb = 6) {
  if (!minecraftRoot || !gameDirectory || !versionId) throw new Error('Faltan datos para crear el perfil EmiCobleverse.');
  fs.mkdirSync(minecraftRoot, { recursive: true });
  fs.mkdirSync(gameDirectory, { recursive: true });

  const profilesPath = path.join(minecraftRoot, 'launcher_profiles.json');
  const existing = readJson(profilesPath, {}) || {};
  const profiles = existing.profiles && typeof existing.profiles === 'object' ? { ...existing.profiles } : {};
  const previous = profiles[PROFILE_KEY] && typeof profiles[PROFILE_KEY] === 'object' ? profiles[PROFILE_KEY] : {};
  const now = new Date().toISOString();
  const memory = Math.max(2, Math.min(32, Number(ramGb) || 6));

  profiles[PROFILE_KEY] = {
    ...previous,
    created: previous.created || now,
    gameDir: path.resolve(gameDirectory),
    icon: previous.icon || 'Grass',
    javaArgs: `-Xms2G -Xmx${memory}G`,
    lastUsed: now,
    lastVersionId: versionId,
    name: 'EmiCobleverse',
    type: 'custom'
  };

  const next = {
    ...existing,
    profiles,
    settings: existing.settings && typeof existing.settings === 'object' ? existing.settings : {},
    version: Number(existing.version) || 3
  };

  if (fs.existsSync(profilesPath)) {
    const backup = `${profilesPath}.emilauncher-backup`;
    try { fs.copyFileSync(profilesPath, backup); } catch {}
  }
  atomicWriteJson(profilesPath, next);
  return { profilesPath, profileKey: PROFILE_KEY, profile: profiles[PROFILE_KEY] };
}

module.exports = {
  PACK_MARKER,
  PROFILE_KEY,
  readPackMarker,
  fingerprint,
  determinePackState,
  ensureOfficialLauncherProfile
};
