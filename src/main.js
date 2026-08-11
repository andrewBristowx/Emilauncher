const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const { PublicClientApplication } = require('@azure/msal-node');
const {
  LauncherRuntimeError,
  SUPPORTED_MINECRAFT,
  SUPPORTED_FABRIC,
  findJava21,
  installMrpack,
  ensureMinecraftRuntime,
  launchMinecraft
} = require('./minecraft-runtime');
const { MinecraftAuthError, exchangeMicrosoftForMinecraft } = require('./minecraft-auth');

const REMOTE_URLS = {
  news: 'https://raw.githubusercontent.com/andrewBristowx/Emilauncher/main/remote/news.json',
  launcher: 'https://raw.githubusercontent.com/andrewBristowx/Emilauncher/main/remote/launcher.json',
  pack: 'https://raw.githubusercontent.com/andrewBristowx/Emilauncher/main/remote/pack-manifest.json'
};
const NEWS_EDITOR_URL = 'https://github.com/andrewBristowx/Emilauncher/edit/main/remote/news.json';
const MICROSOFT_AUTHORITY = 'https://login.microsoftonline.com/consumers';
const MICROSOFT_SCOPES = ['XboxLive.signin', 'offline_access'];

const DEFAULT_SETTINGS = {
  ramGb: 6,
  gameDirectory: '',
  mrpackPath: '',
  microsoftClientId: '',
  autoCheckNews: true,
  closeLauncherOnGame: false
};

let mainWindow = null;
let microsoftClient = null;
let microsoftClientId = '';
let authInProgress = null;
let launchInProgress = null;

function launcherConfigPath() { return path.join(__dirname, '..', 'launcher-config.json'); }
function readLauncherConfig() {
  try { return JSON.parse(fs.readFileSync(launcherConfigPath(), 'utf8')); }
  catch { return {}; }
}
function settingsFile() { return path.join(app.getPath('userData'), 'settings.json'); }
function authCacheFile() { return path.join(app.getPath('userData'), 'microsoft-auth-cache.json'); }
function readSettings() {
  try { return { ...DEFAULT_SETTINGS, ...JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) }; }
  catch { return { ...DEFAULT_SETTINGS }; }
}
function writeSettings(next) {
  const safe = {
    ramGb: Math.min(32, Math.max(2, Number(next.ramGb) || DEFAULT_SETTINGS.ramGb)),
    gameDirectory: typeof next.gameDirectory === 'string' ? next.gameDirectory : '',
    mrpackPath: typeof next.mrpackPath === 'string' ? next.mrpackPath : '',
    microsoftClientId: typeof next.microsoftClientId === 'string' ? next.microsoftClientId.trim() : '',
    autoCheckNews: Boolean(next.autoCheckNews),
    closeLauncherOnGame: Boolean(next.closeLauncherOnGame)
  };
  fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
  fs.writeFileSync(settingsFile(), JSON.stringify(safe, null, 2), 'utf8');
  return safe;
}

async function fetchJson(url, options = {}) {
  const separator = url.includes('?') ? '&' : '?';
  const response = await fetch(`${url}${separator}t=${Date.now()}`, {
    ...options,
    headers: { 'User-Agent': `EmiLauncher/${app.getVersion()}`, 'Cache-Control': 'no-cache', ...(options.headers || {}) }
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function resolveMicrosoftClientId() {
  const settingsId = readSettings().microsoftClientId;
  if (settingsId) return settingsId;
  const local = readLauncherConfig()?.microsoft?.clientId;
  if (typeof local === 'string' && local.trim()) return local.trim();
  try {
    const remoteId = (await fetchJson(REMOTE_URLS.launcher))?.microsoftClientId;
    if (typeof remoteId === 'string' && remoteId.trim()) return remoteId.trim();
  } catch {}
  return '';
}

const cachePlugin = {
  beforeCacheAccess: async (context) => {
    try { context.tokenCache.deserialize(fs.readFileSync(authCacheFile(), 'utf8')); } catch {}
  },
  afterCacheAccess: async (context) => {
    if (!context.cacheHasChanged) return;
    fs.mkdirSync(path.dirname(authCacheFile()), { recursive: true });
    fs.writeFileSync(authCacheFile(), context.tokenCache.serialize(), 'utf8');
  }
};

async function getMicrosoftClient() {
  const clientId = await resolveMicrosoftClientId();
  if (!clientId) return null;
  if (microsoftClient && microsoftClientId === clientId) return microsoftClient;
  microsoftClientId = clientId;
  microsoftClient = new PublicClientApplication({ auth: { clientId, authority: MICROSOFT_AUTHORITY }, cache: { cachePlugin } });
  return microsoftClient;
}

function publicAccount(account) {
  if (!account) return null;
  return {
    homeAccountId: account.homeAccountId || '',
    localAccountId: account.localAccountId || '',
    username: account.username || '',
    name: account.name || account.username || 'Cuenta Microsoft'
  };
}

async function getMicrosoftStatus() {
  const client = await getMicrosoftClient();
  if (!client) return { configured: false, authenticated: false, account: null };
  try {
    const accounts = await client.getTokenCache().getAllAccounts();
    if (!accounts.length) return { configured: true, authenticated: false, account: null };
    const account = accounts[0];
    try { await client.acquireTokenSilent({ account, scopes: MICROSOFT_SCOPES }); } catch {}
    return { configured: true, authenticated: true, account: publicAccount(account) };
  } catch { return { configured: true, authenticated: false, account: null }; }
}

function notifyDeviceCode(response) {
  const payload = {
    userCode: response.userCode || '',
    verificationUri: response.verificationUri || 'https://microsoft.com/devicelogin',
    message: response.message || 'Introduce el código en la página oficial de Microsoft.',
    expiresIn: response.expiresIn || 0
  };
  mainWindow?.webContents.send('auth:microsoft:deviceCode', payload);
  shell.openExternal(payload.verificationUri).catch(() => {});
}

async function loginMicrosoft() {
  if (authInProgress) return authInProgress;
  authInProgress = (async () => {
    const client = await getMicrosoftClient();
    if (!client) return { configured: false, authenticated: false, account: null, reason: 'missing_client_id' };
    const result = await client.acquireTokenByDeviceCode({ scopes: MICROSOFT_SCOPES, deviceCodeCallback: notifyDeviceCode });
    return { configured: true, authenticated: Boolean(result?.account), account: publicAccount(result?.account) };
  })();
  try { return await authInProgress; }
  finally { authInProgress = null; }
}

async function acquireMicrosoftAccessToken() {
  const client = await getMicrosoftClient();
  if (!client) {
    const error = new Error('Falta configurar el Client ID público de EmiLauncher.');
    error.code = 'missing_client_id';
    throw error;
  }
  const accounts = await client.getTokenCache().getAllAccounts();
  if (accounts.length) {
    try {
      const silent = await client.acquireTokenSilent({ account: accounts[0], scopes: MICROSOFT_SCOPES });
      if (silent?.accessToken) return { accessToken: silent.accessToken, account: silent.account || accounts[0] };
    } catch {}
  }
  const interactive = await client.acquireTokenByDeviceCode({ scopes: MICROSOFT_SCOPES, deviceCodeCallback: notifyDeviceCode });
  if (!interactive?.accessToken) throw new Error('Microsoft no devolvió un token de acceso.');
  return { accessToken: interactive.accessToken, account: interactive.account };
}

async function logoutMicrosoft() {
  const client = await getMicrosoftClient();
  if (client) {
    try { for (const account of await client.getTokenCache().getAllAccounts()) await client.getTokenCache().removeAccount(account); }
    catch {}
  }
  try { fs.rmSync(authCacheFile(), { force: true }); } catch {}
  microsoftClient = null;
  return { configured: Boolean(await resolveMicrosoftClientId()), authenticated: false, account: null };
}

function emitGameStatus(phase, message, current = 0, total = 0) {
  mainWindow?.webContents.send('game:status', { phase, message, current, total });
}
function defaultGameDirectory() { return path.join(app.getPath('appData'), 'EmiLauncher', 'EmiCobleverse'); }
async function ensureGameDirectory() {
  const current = readSettings();
  if (current.gameDirectory) {
    fs.mkdirSync(current.gameDirectory, { recursive: true });
    return current.gameDirectory;
  }
  const directory = defaultGameDirectory();
  fs.mkdirSync(directory, { recursive: true });
  writeSettings({ ...current, gameDirectory: directory });
  return directory;
}

async function chooseMrpackInternal() {
  const current = readSettings();
  const result = await dialog.showOpenDialog({
    title: 'Selecciona EmiCobleverse 1.0.0.mrpack',
    properties: ['openFile'],
    filters: [{ name: 'Modrinth modpack', extensions: ['mrpack'] }],
    defaultPath: current.mrpackPath || app.getPath('downloads')
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const mrpackPath = result.filePaths[0];
  writeSettings({ ...current, mrpackPath });
  return mrpackPath;
}
async function ensureMrpackPath() {
  const current = readSettings();
  if (current.mrpackPath && fs.existsSync(current.mrpackPath)) return current.mrpackPath;
  const selected = await chooseMrpackInternal();
  if (!selected) {
    const error = new Error('No se seleccionó el .mrpack de EmiCobleverse.');
    error.code = 'mrpack_selection_cancelled';
    throw error;
  }
  return selected;
}

function serializableError(error) {
  const code = error?.code || (error instanceof LauncherRuntimeError ? error.code : undefined) || (error instanceof MinecraftAuthError ? error.code : undefined) || 'launch_failed';
  return { code, message: error?.message || 'No se pudo iniciar Minecraft.', details: error?.details ? String(error.details).slice(0, 4000) : undefined };
}

async function performLaunch() {
  emitGameStatus('auth', 'Comprobando cuenta Microsoft…');
  const ms = await acquireMicrosoftAccessToken();
  emitGameStatus('minecraft-auth', 'Conectando Xbox y Minecraft Services…');
  const minecraftAuth = await exchangeMicrosoftForMinecraft(ms.accessToken);
  mainWindow?.webContents.send('auth:minecraft:profile', { id: minecraftAuth.profile.id, name: minecraftAuth.profile.name });

  const gameDirectory = await ensureGameDirectory();
  const mrpackPath = await ensureMrpackPath();
  const progress = (event) => emitGameStatus(event.phase, event.message, event.current, event.total);
  const pack = await installMrpack(mrpackPath, gameDirectory, progress);
  const javaPath = findJava21();
  emitGameStatus('java', 'Java 21 detectado.');
  const versionId = await ensureMinecraftRuntime(gameDirectory, SUPPORTED_MINECRAFT, SUPPORTED_FABRIC, progress);
  const settings = readSettings();
  const serverAddress = readLauncherConfig()?.serverAddress || '';
  const child = await launchMinecraft({
    gameDirectory,
    versionId,
    javaPath,
    ramGb: settings.ramGb,
    accessToken: minecraftAuth.accessToken,
    profile: minecraftAuth.profile,
    serverAddress,
    progress
  });
  child.stdout?.on('data', (chunk) => console.log(`[Minecraft] ${String(chunk).trimEnd()}`));
  child.stderr?.on('data', (chunk) => console.error(`[Minecraft] ${String(chunk).trimEnd()}`));
  child.once('spawn', () => {
    emitGameStatus('running', `Minecraft iniciado como ${minecraftAuth.profile.name}.`);
    if (settings.closeLauncherOnGame) mainWindow?.hide();
  });
  child.once('exit', (code) => {
    emitGameStatus('stopped', `Minecraft se cerró${Number.isInteger(code) ? ` (código ${code})` : ''}.`);
    if (settings.closeLauncherOnGame) mainWindow?.show();
  });
  return { ok: true, profile: { id: minecraftAuth.profile.id, name: minecraftAuth.profile.name }, pack: pack.marker, gameDirectory, versionId };
}

function registerIpc() {
  ipcMain.handle('settings:get', () => readSettings());
  ipcMain.handle('settings:set', (_event, patch) => writeSettings({ ...readSettings(), ...(patch || {}) }));
  ipcMain.handle('settings:chooseGameDirectory', async () => {
    const current = readSettings();
    const result = await dialog.showOpenDialog({ title: 'Carpeta de Emipokemon', properties: ['openDirectory', 'createDirectory'], defaultPath: current.gameDirectory || defaultGameDirectory() });
    if (result.canceled || result.filePaths.length === 0) return current;
    return writeSettings({ ...current, gameDirectory: result.filePaths[0] });
  });
  ipcMain.handle('pack:chooseMrpack', async () => ({ selected: await chooseMrpackInternal(), settings: readSettings() }));
  ipcMain.handle('remote:getNews', () => fetchJson(REMOTE_URLS.news));
  ipcMain.handle('remote:getLauncher', () => fetchJson(REMOTE_URLS.launcher));
  ipcMain.handle('remote:getPack', () => fetchJson(REMOTE_URLS.pack));
  ipcMain.handle('auth:microsoft:status', () => getMicrosoftStatus());
  ipcMain.handle('auth:microsoft:login', () => loginMicrosoft());
  ipcMain.handle('auth:microsoft:logout', () => logoutMicrosoft());
  ipcMain.handle('auth:microsoft:configure', (_event, clientId) => {
    const next = writeSettings({ ...readSettings(), microsoftClientId: typeof clientId === 'string' ? clientId.trim() : '' });
    microsoftClient = null;
    microsoftClientId = '';
    return { configured: Boolean(next.microsoftClientId), authenticated: false, account: null };
  });
  ipcMain.handle('auth:microsoft:openVerification', (_event, url) => {
    const safe = typeof url === 'string' && /^https:\/\/(microsoft\.com|www\.microsoft\.com|login\.microsoftonline\.com)\//i.test(url) ? url : 'https://microsoft.com/devicelogin';
    return shell.openExternal(safe);
  });
  ipcMain.handle('game:launch', async () => {
    if (launchInProgress) return launchInProgress;
    launchInProgress = (async () => {
      try { return await performLaunch(); }
      catch (error) {
        const serialized = serializableError(error);
        emitGameStatus('error', serialized.message);
        return { ok: false, error: serialized };
      } finally { launchInProgress = null; }
    })();
    return launchInProgress;
  });
  ipcMain.handle('external:openNewsEditor', () => shell.openExternal(NEWS_EDITOR_URL));
  ipcMain.handle('external:open', (_event, url) => {
    if (typeof url !== 'string') return false;
    const allowed = /^https:\/\/(github\.com|discord\.gg|discord\.com|twitch\.tv|www\.twitch\.tv|modrinth\.com|aka\.ms|learn\.microsoft\.com)\//i;
    if (!allowed.test(url)) return false;
    return shell.openExternal(url);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 860,
    minWidth: 1120,
    minHeight: 700,
    backgroundColor: '#0a0611',
    autoHideMenuBar: true,
    title: 'EmiLauncher',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  mainWindow.on('closed', () => { mainWindow = null; });
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
}
app.whenReady().then(() => {
  registerIpc();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
