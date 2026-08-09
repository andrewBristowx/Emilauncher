const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const { PublicClientApplication } = require('@azure/msal-node');

const REMOTE_URLS = {
  news: 'https://raw.githubusercontent.com/andrewBristowx/Emilauncher/main/remote/news.json',
  launcher: 'https://raw.githubusercontent.com/andrewBristowx/Emilauncher/main/remote/launcher.json',
  pack: 'https://raw.githubusercontent.com/andrewBristowx/Emilauncher/main/remote/pack-manifest.json'
};

const NEWS_EDITOR_URL = 'https://github.com/andrewBristowx/Emilauncher/edit/main/remote/news.json';
const MICROSOFT_AUTHORITY = 'https://login.microsoftonline.com/consumers';
const MICROSOFT_SCOPES = ['User.Read'];

const DEFAULT_SETTINGS = {
  ramGb: 6,
  gameDirectory: '',
  autoCheckNews: true,
  closeLauncherOnGame: false
};

let mainWindow = null;
let microsoftClient = null;
let microsoftClientId = '';
let authInProgress = null;

function launcherConfigPath() {
  return path.join(__dirname, '..', 'launcher-config.json');
}

function readLauncherConfig() {
  try {
    return JSON.parse(fs.readFileSync(launcherConfigPath(), 'utf8'));
  } catch {
    return {};
  }
}

function settingsFile() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function authCacheFile() {
  return path.join(app.getPath('userData'), 'microsoft-auth-cache.json');
}

function readSettings() {
  try {
    const raw = fs.readFileSync(settingsFile(), 'utf8');
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function writeSettings(next) {
  const safe = {
    ramGb: Math.min(32, Math.max(2, Number(next.ramGb) || DEFAULT_SETTINGS.ramGb)),
    gameDirectory: typeof next.gameDirectory === 'string' ? next.gameDirectory : '',
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
    headers: {
      'User-Agent': `EmiLauncher/${app.getVersion()}`,
      'Cache-Control': 'no-cache',
      ...(options.headers || {})
    }
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function resolveMicrosoftClientId() {
  const local = readLauncherConfig()?.microsoft?.clientId;
  if (typeof local === 'string' && local.trim()) return local.trim();

  try {
    const remote = await fetchJson(REMOTE_URLS.launcher);
    const remoteId = remote?.microsoftClientId;
    if (typeof remoteId === 'string' && remoteId.trim()) return remoteId.trim();
  } catch {
    // Offline is fine; local config remains the fallback.
  }

  return '';
}

const cachePlugin = {
  beforeCacheAccess: async (context) => {
    try {
      const serialized = fs.readFileSync(authCacheFile(), 'utf8');
      context.tokenCache.deserialize(serialized);
    } catch {
      // First login: cache file does not exist yet.
    }
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
  microsoftClient = new PublicClientApplication({
    auth: {
      clientId,
      authority: MICROSOFT_AUTHORITY
    },
    cache: {
      cachePlugin
    }
  });

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
  if (!client) {
    return { configured: false, authenticated: false, account: null };
  }

  try {
    const accounts = await client.getTokenCache().getAllAccounts();
    if (!accounts.length) return { configured: true, authenticated: false, account: null };

    const account = accounts[0];
    try {
      await client.acquireTokenSilent({ account, scopes: MICROSOFT_SCOPES });
    } catch {
      // Keep showing the cached account. Interactive login will refresh it if needed.
    }

    return { configured: true, authenticated: true, account: publicAccount(account) };
  } catch {
    return { configured: true, authenticated: false, account: null };
  }
}

async function loginMicrosoft() {
  if (authInProgress) return authInProgress;

  authInProgress = (async () => {
    const client = await getMicrosoftClient();
    if (!client) {
      return {
        configured: false,
        authenticated: false,
        account: null,
        reason: 'missing_client_id'
      };
    }

    const result = await client.acquireTokenByDeviceCode({
      scopes: MICROSOFT_SCOPES,
      deviceCodeCallback: (response) => {
        const payload = {
          userCode: response.userCode || '',
          verificationUri: response.verificationUri || 'https://microsoft.com/devicelogin',
          message: response.message || 'Introduce el código en la página oficial de Microsoft.',
          expiresIn: response.expiresIn || 0
        };
        mainWindow?.webContents.send('auth:microsoft:deviceCode', payload);
        shell.openExternal(payload.verificationUri).catch(() => {});
      }
    });

    return {
      configured: true,
      authenticated: Boolean(result?.account),
      account: publicAccount(result?.account)
    };
  })();

  try {
    return await authInProgress;
  } finally {
    authInProgress = null;
  }
}

async function logoutMicrosoft() {
  const client = await getMicrosoftClient();
  if (client) {
    try {
      const accounts = await client.getTokenCache().getAllAccounts();
      for (const account of accounts) {
        await client.getTokenCache().removeAccount(account);
      }
    } catch {
      // Clear the serialized cache below even if the in-memory cleanup fails.
    }
  }

  try {
    fs.rmSync(authCacheFile(), { force: true });
  } catch {}

  microsoftClient = null;
  return { configured: Boolean(await resolveMicrosoftClientId()), authenticated: false, account: null };
}

function registerIpc() {
  ipcMain.handle('settings:get', () => readSettings());

  ipcMain.handle('settings:set', (_event, patch) => {
    const current = readSettings();
    return writeSettings({ ...current, ...(patch || {}) });
  });

  ipcMain.handle('settings:chooseGameDirectory', async () => {
    const current = readSettings();
    const result = await dialog.showOpenDialog({
      title: 'Carpeta de Emipokemon',
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: current.gameDirectory || app.getPath('appData')
    });

    if (result.canceled || result.filePaths.length === 0) return current;
    return writeSettings({ ...current, gameDirectory: result.filePaths[0] });
  });

  ipcMain.handle('remote:getNews', () => fetchJson(REMOTE_URLS.news));
  ipcMain.handle('remote:getLauncher', () => fetchJson(REMOTE_URLS.launcher));
  ipcMain.handle('remote:getPack', () => fetchJson(REMOTE_URLS.pack));

  ipcMain.handle('auth:microsoft:status', () => getMicrosoftStatus());
  ipcMain.handle('auth:microsoft:login', () => loginMicrosoft());
  ipcMain.handle('auth:microsoft:logout', () => logoutMicrosoft());
  ipcMain.handle('auth:microsoft:openVerification', (_event, url) => {
    const safe = typeof url === 'string' && /^https:\/\/(microsoft\.com|www\.microsoft\.com|login\.microsoftonline\.com)\//i.test(url)
      ? url
      : 'https://microsoft.com/devicelogin';
    return shell.openExternal(safe);
  });

  ipcMain.handle('external:openNewsEditor', () => shell.openExternal(NEWS_EDITOR_URL));

  ipcMain.handle('external:open', (_event, url) => {
    if (typeof url !== 'string') return false;
    const allowed = /^https:\/\/(github\.com|discord\.gg|discord\.com|twitch\.tv|www\.twitch\.tv|modrinth\.com)\//i;
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
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.on('closed', () => { mainWindow = null; });
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
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
