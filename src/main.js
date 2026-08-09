const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const fs = require('fs');
const path = require('path');

const REMOTE_URLS = {
  news: 'https://raw.githubusercontent.com/andrewBristowx/Emilauncher/main/remote/news.json',
  launcher: 'https://raw.githubusercontent.com/andrewBristowx/Emilauncher/main/remote/launcher.json',
  pack: 'https://raw.githubusercontent.com/andrewBristowx/Emilauncher/main/remote/pack-manifest.json'
};

const NEWS_EDITOR_URL = 'https://github.com/andrewBristowx/Emilauncher/edit/main/remote/news.json';

const DEFAULT_SETTINGS = {
  ramGb: 6,
  gameDirectory: '',
  autoCheckNews: true,
  closeLauncherOnGame: false
};

function settingsFile() {
  return path.join(app.getPath('userData'), 'settings.json');
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

async function fetchJson(url) {
  const response = await fetch(`${url}?t=${Date.now()}`, {
    headers: {
      'User-Agent': `EmiLauncher/${app.getVersion()}`,
      'Cache-Control': 'no-cache'
    }
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.json();
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

    if (result.canceled || result.filePaths.length === 0) {
      return current;
    }

    return writeSettings({ ...current, gameDirectory: result.filePaths[0] });
  });

  ipcMain.handle('remote:getNews', () => fetchJson(REMOTE_URLS.news));
  ipcMain.handle('remote:getLauncher', () => fetchJson(REMOTE_URLS.launcher));
  ipcMain.handle('remote:getPack', () => fetchJson(REMOTE_URLS.pack));

  ipcMain.handle('external:openNewsEditor', () => shell.openExternal(NEWS_EDITOR_URL));

  ipcMain.handle('external:open', (_event, url) => {
    if (typeof url !== 'string') return false;
    if (!/^https:\/\/(github\.com|discord\.gg|discord\.com|modrinth\.com)\//i.test(url)) {
      return false;
    }
    return shell.openExternal(url);
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 760,
    minWidth: 1060,
    minHeight: 660,
    backgroundColor: '#120a18',
    autoHideMenuBar: true,
    title: 'EmiLauncher',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  win.loadFile(path.join(__dirname, 'index.html'));
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
