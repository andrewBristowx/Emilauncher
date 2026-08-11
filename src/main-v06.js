const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const {
  LauncherRuntimeError,
  SUPPORTED_MINECRAFT,
  SUPPORTED_FABRIC,
  installMrpack,
  ensureMinecraftRuntime
} = require('./minecraft-runtime');
const {
  determinePackState,
  ensureOfficialLauncherProfile,
  readPackMarker
} = require('./official-launcher-bridge');

const DEFAULT_SETTINGS = {
  ramGb: 6,
  gameDirectory: '',
  mrpackPath: '',
  minecraftRoot: ''
};

let mainWindow = null;
let busyTask = null;

function settingsFile() { return path.join(app.getPath('userData'), 'settings-v06.json'); }
function defaultGameDirectory() { return path.join(app.getPath('appData'), 'EmiLauncher', 'EmiCobleverse'); }
function defaultMinecraftRoot() { return path.join(app.getPath('appData'), '.minecraft'); }

function readSettings() {
  try { return { ...DEFAULT_SETTINGS, ...JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) }; }
  catch { return { ...DEFAULT_SETTINGS }; }
}

function writeSettings(next) {
  const safe = {
    ramGb: Math.max(2, Math.min(32, Number(next.ramGb) || 6)),
    gameDirectory: typeof next.gameDirectory === 'string' ? next.gameDirectory : '',
    mrpackPath: typeof next.mrpackPath === 'string' ? next.mrpackPath : '',
    minecraftRoot: typeof next.minecraftRoot === 'string' ? next.minecraftRoot : ''
  };
  fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
  fs.writeFileSync(settingsFile(), JSON.stringify(safe, null, 2), 'utf8');
  return safe;
}

function resolvedSettings() {
  const current = readSettings();
  return {
    ...current,
    gameDirectory: current.gameDirectory || defaultGameDirectory(),
    minecraftRoot: current.minecraftRoot || defaultMinecraftRoot()
  };
}

function emitStatus(phase, message, current = 0, total = 0) {
  mainWindow?.webContents.send('v06:status', { phase, message, current, total });
}

function stateSnapshot() {
  const settings = resolvedSettings();
  const pack = determinePackState(settings.gameDirectory, settings.mrpackPath);
  return {
    settings,
    pack,
    runtime: {
      minecraft: SUPPORTED_MINECRAFT,
      fabric: SUPPORTED_FABRIC,
      launcherVersion: app.getVersion()
    }
  };
}

async function chooseMrpackInternal() {
  const current = resolvedSettings();
  const result = await dialog.showOpenDialog({
    title: 'Selecciona EmiCobleverse (.mrpack)',
    properties: ['openFile'],
    filters: [{ name: 'Modrinth modpack', extensions: ['mrpack'] }],
    defaultPath: current.mrpackPath && fs.existsSync(current.mrpackPath) ? current.mrpackPath : app.getPath('downloads')
  });
  if (result.canceled || !result.filePaths.length) return null;
  const mrpackPath = result.filePaths[0];
  writeSettings({ ...current, mrpackPath });
  return mrpackPath;
}

async function chooseGameDirectoryInternal() {
  const current = resolvedSettings();
  const result = await dialog.showOpenDialog({
    title: 'Carpeta de EmiCobleverse',
    properties: ['openDirectory', 'createDirectory'],
    defaultPath: current.gameDirectory
  });
  if (result.canceled || !result.filePaths.length) return null;
  const gameDirectory = result.filePaths[0];
  writeSettings({ ...current, gameDirectory });
  return gameDirectory;
}

async function ensureMrpack() {
  let settings = resolvedSettings();
  if (settings.mrpackPath && fs.existsSync(settings.mrpackPath)) return settings.mrpackPath;
  const selected = await chooseMrpackInternal();
  if (!selected) {
    const error = new Error('Selecciona el archivo .mrpack de EmiCobleverse para continuar.');
    error.code = 'mrpack_required';
    throw error;
  }
  return selected;
}

function serializeError(error) {
  return {
    code: error?.code || (error instanceof LauncherRuntimeError ? error.code : 'launcher_error'),
    message: error?.message || 'Ocurrió un error en EmiLauncher.',
    details: error?.details ? String(error.details).slice(0, 3000) : undefined
  };
}

async function installOrUpdate() {
  const mrpackPath = await ensureMrpack();
  const settings = resolvedSettings();
  fs.mkdirSync(settings.gameDirectory, { recursive: true });
  fs.mkdirSync(settings.minecraftRoot, { recursive: true });

  const progress = (event) => emitStatus(event.phase, event.message, event.current, event.total);
  emitStatus('pack-start', 'Preparando EmiCobleverse…');
  const pack = await installMrpack(mrpackPath, settings.gameDirectory, progress);

  emitStatus('runtime-start', `Preparando Minecraft ${SUPPORTED_MINECRAFT} + Fabric ${SUPPORTED_FABRIC}…`);
  const versionId = await ensureMinecraftRuntime(settings.minecraftRoot, SUPPORTED_MINECRAFT, SUPPORTED_FABRIC, progress);
  ensureOfficialLauncherProfile(settings.minecraftRoot, settings.gameDirectory, versionId, settings.ramGb);

  emitStatus('ready', 'EmiCobleverse está listo para jugar.');
  return { ok: true, state: stateSnapshot(), versionId, marker: pack.marker };
}

function launcherCandidates() {
  if (process.platform !== 'win32') return [];
  const local = process.env.LOCALAPPDATA || '';
  const pf = process.env.ProgramFiles || '';
  const pfx86 = process.env['ProgramFiles(x86)'] || '';
  return [
    path.join(local, 'Microsoft', 'WindowsApps', 'MinecraftLauncher.exe'),
    path.join(pfx86, 'Minecraft Launcher', 'MinecraftLauncher.exe'),
    path.join(pf, 'Minecraft Launcher', 'MinecraftLauncher.exe'),
    'C:\\XboxGames\\Minecraft Launcher\\Content\\Minecraft.exe'
  ].filter(Boolean);
}

async function openOfficialLauncher() {
  for (const candidate of launcherCandidates()) {
    try {
      if (!fs.existsSync(candidate)) continue;
      const result = await shell.openPath(candidate);
      if (!result) return { method: 'executable', target: candidate };
    } catch {}
  }

  try {
    await shell.openExternal('minecraft://');
    return { method: 'protocol', target: 'minecraft://' };
  } catch {}

  const error = new Error('No pude abrir Minecraft Launcher. Instálalo o ábrelo una vez desde Windows y vuelve a intentarlo.');
  error.code = 'official_launcher_not_found';
  throw error;
}

async function play() {
  const settings = resolvedSettings();
  const state = determinePackState(settings.gameDirectory, settings.mrpackPath);
  if (state.action !== 'play') {
    const error = new Error(state.action === 'install' ? 'Primero instala EmiCobleverse.' : 'Hay una actualización pendiente antes de jugar.');
    error.code = state.action === 'install' ? 'pack_not_installed' : 'pack_update_required';
    throw error;
  }

  const marker = readPackMarker(settings.gameDirectory);
  const versionId = `fabric-loader-${marker?.fabricLoader || SUPPORTED_FABRIC}-${marker?.minecraft || SUPPORTED_MINECRAFT}`;
  ensureOfficialLauncherProfile(settings.minecraftRoot, settings.gameDirectory, versionId, settings.ramGb);
  emitStatus('launcher', 'Abriendo Minecraft Launcher oficial…');
  const opened = await openOfficialLauncher();
  emitStatus('launcher-open', 'Selecciona EmiCobleverse y pulsa Jugar en Minecraft Launcher.');
  return { ok: true, opened, state: stateSnapshot() };
}

function registerIpc() {
  ipcMain.handle('v06:state', () => stateSnapshot());
  ipcMain.handle('v06:settings:set', (_event, patch) => {
    const next = writeSettings({ ...resolvedSettings(), ...(patch || {}) });
    return { ...stateSnapshot(), settings: { ...resolvedSettings(), ...next } };
  });
  ipcMain.handle('v06:chooseDirectory', async () => {
    await chooseGameDirectoryInternal();
    return stateSnapshot();
  });
  ipcMain.handle('v06:chooseMrpack', async () => {
    await chooseMrpackInternal();
    return stateSnapshot();
  });
  ipcMain.handle('v06:openFolder', async () => {
    const settings = resolvedSettings();
    fs.mkdirSync(settings.gameDirectory, { recursive: true });
    const result = await shell.openPath(settings.gameDirectory);
    return { ok: !result, error: result || null };
  });
  ipcMain.handle('v06:install', async () => {
    if (busyTask) return busyTask;
    busyTask = (async () => {
      try { return await installOrUpdate(); }
      catch (error) {
        const serialized = serializeError(error);
        emitStatus('error', serialized.message);
        return { ok: false, error: serialized, state: stateSnapshot() };
      } finally { busyTask = null; }
    })();
    return busyTask;
  });
  ipcMain.handle('v06:play', async () => {
    try { return await play(); }
    catch (error) {
      const serialized = serializeError(error);
      emitStatus('error', serialized.message);
      return { ok: false, error: serialized, state: stateSnapshot() };
    }
  });
  ipcMain.handle('v06:minimize', () => mainWindow?.minimize());
  ipcMain.handle('v06:close', () => mainWindow?.close());
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    backgroundColor: '#1a1023',
    autoHideMenuBar: true,
    title: 'EmiLauncher',
    webPreferences: {
      preload: path.join(__dirname, 'preload-v06.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  try { mainWindow.setAspectRatio(1.5); } catch {}
  mainWindow.on('closed', () => { mainWindow = null; });
  mainWindow.loadFile(path.join(__dirname, 'index-v06.html'));
}

app.whenReady().then(() => {
  registerIpc();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
