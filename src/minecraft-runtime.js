const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');
const unzipper = require('unzipper');
const { Version, launch } = require('@xmcl/core');
const { getVersionList, install, installDependencies } = require('@xmcl/installer');

const SUPPORTED_MINECRAFT = '1.21.1';
const SUPPORTED_FABRIC = '0.18.4';
const PACK_MARKER = '.emilauncher-pack.json';
const DOWNLOAD_CONCURRENCY = 6;

class LauncherRuntimeError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = 'LauncherRuntimeError';
    this.code = code;
    this.details = details;
  }
}

function emit(progress, phase, message, current = 0, total = 0) {
  if (typeof progress === 'function') progress({ phase, message, current, total });
}

function safeRelativePath(input) {
  if (typeof input !== 'string' || !input.trim()) throw new LauncherRuntimeError('unsafe_pack_path', 'El modpack contiene una ruta vacía o inválida.');
  const normalized = input.replaceAll('\\', '/');
  if (normalized.startsWith('/') || /^[a-zA-Z]:\//.test(normalized)) throw new LauncherRuntimeError('unsafe_pack_path', `Ruta absoluta bloqueada: ${input}`);
  const clean = path.posix.normalize(normalized);
  if (clean === '..' || clean.startsWith('../') || clean.includes('/../')) throw new LauncherRuntimeError('unsafe_pack_path', `Ruta fuera de la instalación bloqueada: ${input}`);
  return clean.replace(/^\.\//, '');
}

function safeDestination(root, relative) {
  const clean = safeRelativePath(relative);
  const base = path.resolve(root);
  const destination = path.resolve(base, ...clean.split('/'));
  if (destination !== base && !destination.startsWith(base + path.sep)) throw new LauncherRuntimeError('unsafe_pack_path', `Ruta fuera de la instalación bloqueada: ${relative}`);
  return destination;
}

async function hashFile(filePath, algorithm) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash(algorithm);
    const stream = fs.createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

function preferredHash(file) {
  const hashes = file?.hashes || {};
  if (hashes.sha512) return ['sha512', String(hashes.sha512).toLowerCase()];
  if (hashes.sha1) return ['sha1', String(hashes.sha1).toLowerCase()];
  return null;
}

async function fileMatches(destination, file) {
  if (!fs.existsSync(destination)) return false;
  const hash = preferredHash(file);
  if (!hash) return false;
  try { return (await hashFile(destination, hash[0])).toLowerCase() === hash[1]; }
  catch { return false; }
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { 'User-Agent': 'EmiLauncher/0.5.0' } });
  if (!response.ok) throw new LauncherRuntimeError('download_failed', `HTTP ${response.status} al consultar ${url}`);
  return response.json();
}

async function downloadToFile(url, destination) {
  const response = await fetch(url, { headers: { 'User-Agent': 'EmiLauncher/0.5.0' } });
  if (!response.ok || !response.body) throw new LauncherRuntimeError('download_failed', `No se pudo descargar ${url} (HTTP ${response.status}).`);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.emilauncher-${process.pid}-${Date.now()}.tmp`;
  try {
    await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(temporary));
    fs.renameSync(temporary, destination);
  } catch (error) {
    try { fs.rmSync(temporary, { force: true }); } catch {}
    throw error;
  }
}

async function installManagedFile(file, gameDirectory) {
  const destination = safeDestination(gameDirectory, file.path);
  if (await fileMatches(destination, file)) return { status: 'ok', path: file.path };
  const urls = Array.isArray(file.downloads) ? file.downloads.filter(Boolean) : [];
  if (!urls.length) throw new LauncherRuntimeError('pack_file_without_download', `No hay URL para ${file.path}`);
  let lastError;
  for (const url of urls) {
    try {
      await downloadToFile(url, destination);
      const hash = preferredHash(file);
      if (hash) {
        const actual = await hashFile(destination, hash[0]);
        if (actual.toLowerCase() !== hash[1]) {
          fs.rmSync(destination, { force: true });
          throw new LauncherRuntimeError('pack_hash_mismatch', `Hash inválido después de descargar ${file.path}`);
        }
      }
      return { status: 'downloaded', path: file.path };
    } catch (error) { lastError = error; }
  }
  throw lastError || new LauncherRuntimeError('download_failed', `No se pudo descargar ${file.path}`);
}

async function mapLimit(items, limit, worker, onDone) {
  let cursor = 0;
  let completed = 0;
  async function run() {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      await worker(items[index], index);
      completed += 1;
      if (onDone) onDone(completed, items.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, Math.max(1, items.length)) }, run));
}

function packFingerprint(mrpackPath) {
  const stat = fs.statSync(mrpackPath);
  return { source: path.resolve(mrpackPath), size: stat.size, mtimeMs: Math.trunc(stat.mtimeMs) };
}

function readPackMarker(gameDirectory) {
  try { return JSON.parse(fs.readFileSync(path.join(gameDirectory, PACK_MARKER), 'utf8')); }
  catch { return null; }
}

function samePackSource(marker, fingerprint, versionId) {
  return marker?.source === fingerprint.source && marker?.size === fingerprint.size && marker?.mtimeMs === fingerprint.mtimeMs && marker?.versionId === versionId;
}

async function extractDevelopmentOverrides(directory, gameDirectory, progress) {
  const overrides = directory.files.filter((entry) => {
    const name = String(entry.path || '').replaceAll('\\', '/');
    return name.startsWith('overrides/') && !name.endsWith('/');
  });
  let done = 0;
  for (const entry of overrides) {
    const relative = safeRelativePath(String(entry.path).slice('overrides/'.length));
    const destination = safeDestination(gameDirectory, relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    const temporary = `${destination}.emilauncher-override.tmp`;
    try {
      await pipeline(entry.stream(), fs.createWriteStream(temporary));
      fs.renameSync(temporary, destination);
    } catch (error) {
      try { fs.rmSync(temporary, { force: true }); } catch {}
      throw error;
    }
    done += 1;
    if (done === 1 || done % 40 === 0 || done === overrides.length) emit(progress, 'pack-overrides', `Copiando archivos de desarrollo… ${done}/${overrides.length}`, done, overrides.length);
  }
  return overrides.length;
}

async function readMrpackIndex(directory) {
  const indexEntry = directory.files.find((entry) => String(entry.path).replaceAll('\\', '/') === 'modrinth.index.json');
  if (!indexEntry) throw new LauncherRuntimeError('invalid_mrpack', 'El archivo .mrpack no contiene modrinth.index.json.');
  try { return JSON.parse((await indexEntry.buffer()).toString('utf8')); }
  catch (error) { throw new LauncherRuntimeError('invalid_mrpack', 'No se pudo leer modrinth.index.json.', String(error)); }
}

async function installMrpack(mrpackPath, gameDirectory, progress) {
  if (!mrpackPath || !fs.existsSync(mrpackPath)) throw new LauncherRuntimeError('mrpack_not_found', 'No se encontró el .mrpack de EmiCobleverse.');
  if (!String(mrpackPath).toLowerCase().endsWith('.mrpack')) throw new LauncherRuntimeError('invalid_mrpack', 'Selecciona un archivo .mrpack válido.');
  fs.mkdirSync(gameDirectory, { recursive: true });
  emit(progress, 'pack-open', 'Leyendo EmiCobleverse…');
  const directory = await unzipper.Open.file(mrpackPath);
  const index = await readMrpackIndex(directory);
  const mc = index?.dependencies?.minecraft;
  const fabric = index?.dependencies?.['fabric-loader'];
  if (mc !== SUPPORTED_MINECRAFT || fabric !== SUPPORTED_FABRIC) throw new LauncherRuntimeError('unsupported_pack_runtime', `Este EmiLauncher de prueba espera Minecraft ${SUPPORTED_MINECRAFT} + Fabric ${SUPPORTED_FABRIC}; el pack indica ${mc || '?'} + ${fabric || '?'}.`);
  const files = (Array.isArray(index.files) ? index.files : []).filter((file) => file?.env?.client !== 'unsupported');
  emit(progress, 'pack-files', `Verificando ${files.length} archivos del modpack…`, 0, files.length);
  let downloaded = 0;
  await mapLimit(files, DOWNLOAD_CONCURRENCY, async (file) => {
    const result = await installManagedFile(file, gameDirectory);
    if (result.status === 'downloaded') downloaded += 1;
  }, (current, total) => emit(progress, 'pack-files', `Verificando modpack… ${current}/${total}`, current, total));
  const fingerprint = packFingerprint(mrpackPath);
  const marker = readPackMarker(gameDirectory);
  let overrideCount = 0;
  if (!samePackSource(marker, fingerprint, index.versionId)) {
    emit(progress, 'pack-overrides', 'Aplicando overrides de desarrollo del .mrpack…');
    overrideCount = await extractDevelopmentOverrides(directory, gameDirectory, progress);
  } else {
    emit(progress, 'pack-overrides', 'Overrides de desarrollo ya aplicados; se conservan tus cambios locales.');
  }
  const nextMarker = {
    schemaVersion: 1,
    pack: index.name || 'EmiCobleverse',
    versionId: index.versionId || '1.0.0',
    minecraft: mc,
    fabricLoader: fabric,
    source: fingerprint.source,
    size: fingerprint.size,
    mtimeMs: fingerprint.mtimeMs,
    installedAt: new Date().toISOString()
  };
  fs.writeFileSync(path.join(gameDirectory, PACK_MARKER), JSON.stringify(nextMarker, null, 2), 'utf8');
  return { index, downloaded, overrideCount, marker: nextMarker };
}

async function writeJsonAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temp = `${filePath}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2), 'utf8');
  fs.renameSync(temp, filePath);
}

async function ensureMinecraftRuntime(gameDirectory, minecraftVersion = SUPPORTED_MINECRAFT, loaderVersion = SUPPORTED_FABRIC, progress) {
  emit(progress, 'runtime-vanilla-meta', `Buscando Minecraft ${minecraftVersion}…`);
  const versionList = await getVersionList();
  const versionMeta = versionList?.versions?.find((version) => version.id === minecraftVersion);
  if (!versionMeta) throw new LauncherRuntimeError('minecraft_version_not_found', `Minecraft ${minecraftVersion} no aparece en el manifiesto oficial.`);

  emit(progress, 'runtime-vanilla', `Verificando Minecraft ${minecraftVersion}, librerías y assets…`);
  await install(versionMeta, gameDirectory);

  const fabricId = `fabric-loader-${loaderVersion}-${minecraftVersion}`;
  const fabricPath = path.join(gameDirectory, 'versions', fabricId, `${fabricId}.json`);
  if (!fs.existsSync(fabricPath)) {
    emit(progress, 'runtime-fabric-meta', `Preparando Fabric Loader ${loaderVersion}…`);
    const url = `https://meta.fabricmc.net/v2/versions/loader/${encodeURIComponent(minecraftVersion)}/${encodeURIComponent(loaderVersion)}/profile/json`;
    const profile = await fetchJson(url);
    if (!profile?.id) throw new LauncherRuntimeError('fabric_profile_invalid', 'Fabric devolvió un perfil inválido.');
    profile.id = fabricId;
    await writeJsonAtomic(fabricPath, profile);
  }

  emit(progress, 'runtime-fabric', `Verificando Fabric ${loaderVersion} y sus dependencias…`);
  const resolved = await Version.parse(gameDirectory, fabricId);
  await installDependencies(resolved);
  return fabricId;
}

function javaMajorFromText(text) {
  const quoted = String(text).match(/version\s+"(?:(1)\.)?(\d+)/i);
  if (quoted) return Number(quoted[2]);
  const plain = String(text).match(/openjdk\s+(\d+)/i);
  return plain ? Number(plain[1]) : null;
}

function verifyJavaCandidate(executable) {
  try {
    const result = spawnSync(executable, ['-version'], { encoding: 'utf8', windowsHide: true, timeout: 8000 });
    const text = `${result.stdout || ''}\n${result.stderr || ''}`;
    const major = javaMajorFromText(text);
    return result.status === 0 && major === 21 ? { executable, major } : null;
  } catch { return null; }
}

function findJava21() {
  const candidates = [];
  if (process.env.JAVA_HOME) candidates.push(path.join(process.env.JAVA_HOME, 'bin', process.platform === 'win32' ? 'java.exe' : 'java'));
  candidates.push('java');
  for (const candidate of candidates) {
    const valid = verifyJavaCandidate(candidate);
    if (valid) return valid.executable;
  }
  throw new LauncherRuntimeError('java_21_required', 'EmiCobleverse 1.0.0 necesita Java 21. Instala Java 21 o configura JAVA_HOME antes de abrir EmiLauncher.');
}

async function launchMinecraft({ gameDirectory, versionId, javaPath, ramGb, accessToken, profile, serverAddress, progress }) {
  if (!profile?.id || !profile?.name || !accessToken) throw new LauncherRuntimeError('minecraft_auth_missing', 'Falta la sesión oficial de Minecraft para iniciar.');
  emit(progress, 'launching', `Iniciando Minecraft como ${profile.name}…`);
  const memoryMb = Math.max(2048, Math.min(32768, Number(ramGb || 6) * 1024));
  const options = {
    gamePath: gameDirectory,
    resourcePath: gameDirectory,
    javaPath,
    version: versionId,
    accessToken,
    gameProfile: { id: profile.id, name: profile.name },
    minMemory: Math.min(2048, memoryMb),
    maxMemory: memoryMb,
    launcherName: 'EmiLauncher',
    launcherBrand: '0.5.0-preview',
    extraExecOption: { cwd: gameDirectory }
  };
  if (serverAddress && !serverAddress.endsWith('.local')) options.quickPlayMultiplayer = serverAddress;
  return launch(options);
}

module.exports = {
  LauncherRuntimeError,
  SUPPORTED_MINECRAFT,
  SUPPORTED_FABRIC,
  safeRelativePath,
  safeDestination,
  hashFile,
  javaMajorFromText,
  findJava21,
  installMrpack,
  ensureMinecraftRuntime,
  launchMinecraft
};
