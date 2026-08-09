const progressBar = document.querySelector('.progress-bar');
const updateText = document.querySelector('#updateText');
const updateDetail = document.querySelector('#updateDetail');
const playButton = document.querySelector('#playButton');
const toast = document.querySelector('#toast');
const settingsButton = document.querySelector('#settingsButton');
const settingsClose = document.querySelector('#settingsClose');
const settingsPanel = document.querySelector('#settingsPanel');
const ramRange = document.querySelector('#ramRange');
const ramText = document.querySelector('#ramText');
const gameDirectory = document.querySelector('#gameDirectory');
const chooseDirectory = document.querySelector('#chooseDirectory');
const autoCheckNews = document.querySelector('#autoCheckNews');
const closeLauncherOnGame = document.querySelector('#closeLauncherOnGame');
const settingsSaved = document.querySelector('#settingsSaved');
const refreshNewsButton = document.querySelector('#refreshNews');
const editNewsButton = document.querySelector('#editNews');
const accountButton = document.querySelector('#accountButton');
const accountStatus = document.querySelector('#accountStatus');
const newsGrid = document.querySelector('#newsGrid');
const newsFreshness = document.querySelector('#newsFreshness');
const packVersion = document.querySelector('#packVersion');
const versionPill = document.querySelector('#versionPill');

const CURRENT_VERSION = '0.2.0-preview';
let settings = null;
let saveTimer = null;

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => toast.classList.remove('show'), 3000);
}

function setProgress(value, label, detail) {
  const safe = Math.max(0, Math.min(100, value));
  progressBar.style.width = `${safe}%`;
  updateText.textContent = label;
  if (detail) updateDetail.textContent = detail;
}

function flashSaved() {
  settingsSaved.classList.add('visible');
  window.clearTimeout(flashSaved.timeout);
  flashSaved.timeout = window.setTimeout(() => settingsSaved.classList.remove('visible'), 1200);
}

async function saveSettings(patch) {
  if (!window.emiApi) return;
  settings = await window.emiApi.saveSettings(patch);
  applySettings(settings);
  flashSaved();
}

function queueSettingsSave(patch) {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => saveSettings(patch), 180);
}

function applySettings(next) {
  settings = next;
  ramRange.value = String(next.ramGb ?? 6);
  ramText.textContent = `${ramRange.value} GB`;
  gameDirectory.value = next.gameDirectory || '';
  autoCheckNews.checked = Boolean(next.autoCheckNews);
  closeLauncherOnGame.checked = Boolean(next.closeLauncherOnGame);
}

function formatRemoteDate(value) {
  if (!value) return 'Contenido remoto activo';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Contenido remoto activo';
  return `Actualizado ${date.toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' })}`;
}

function renderNews(payload) {
  const items = Array.isArray(payload?.news) ? payload.news.slice(0, 2) : [];
  if (items.length === 0) throw new Error('No hay noticias publicadas');

  newsGrid.replaceChildren();

  for (const item of items) {
    const article = document.createElement('article');
    article.className = 'news-card';

    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.textContent = String(item.tag || 'NUEVO').toUpperCase().slice(0, 18);

    const title = document.createElement('h3');
    title.textContent = String(item.title || 'Noticia de Emi').slice(0, 90);

    const body = document.createElement('p');
    body.textContent = String(item.body || '').slice(0, 320);

    article.append(tag, title, body);
    newsGrid.append(article);
  }

  newsFreshness.textContent = formatRemoteDate(payload.updatedAt);
}

function renderNewsOffline() {
  newsGrid.innerHTML = '';
  const fallbacks = [
    ['OFFLINE', 'No se pudieron actualizar las noticias', 'El launcher seguirá funcionando y volverá a intentarlo cuando tengas conexión.'],
    ['EMI', 'Canal de noticias preparado', 'Emi puede publicar desde GitHub y el cambio aparecerá aquí sin reinstalar el launcher.']
  ];

  for (const [tagText, titleText, bodyText] of fallbacks) {
    const article = document.createElement('article');
    article.className = 'news-card';
    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.textContent = tagText;
    const title = document.createElement('h3');
    title.textContent = titleText;
    const body = document.createElement('p');
    body.textContent = bodyText;
    article.append(tag, title, body);
    newsGrid.append(article);
  }
}

async function refreshNews(silent = false) {
  if (!window.emiApi) return false;
  if (!silent) setProgress(24, 'Noticias...', 'Descargando las noticias publicadas por Emi.');

  try {
    const payload = await window.emiApi.getRemoteNews();
    renderNews(payload);
    if (!silent) showToast('✦ Noticias actualizadas.');
    return true;
  } catch (error) {
    console.warn('No se pudieron cargar noticias remotas:', error);
    renderNewsOffline();
    newsFreshness.textContent = 'Sin conexión con el canal remoto';
    if (!silent) showToast('No se pudieron actualizar las noticias.');
    return false;
  }
}

async function checkRemoteState() {
  if (!window.emiApi) {
    setProgress(100, 'Modo local', 'La API segura del launcher no está disponible.');
    return;
  }

  setProgress(10, 'Comprobando...', 'Leyendo tus ajustes guardados.');

  try {
    applySettings(await window.emiApi.getSettings());
  } catch (error) {
    console.warn('No se pudieron leer ajustes:', error);
  }

  let completed = 1;
  const total = 3;
  const bump = (label, detail) => {
    completed += 1;
    setProgress(Math.round((completed / total) * 100), label, detail);
  };

  if (settings?.autoCheckNews !== false) {
    await refreshNews(true);
  } else {
    renderNewsOffline();
    newsFreshness.textContent = 'Noticias automáticas desactivadas en Ajustes';
  }
  bump('Pack...', 'Consultando la versión publicada del modpack.');

  try {
    const pack = await window.emiApi.getRemotePack();
    packVersion.textContent = pack?.version || 'Preview';
  } catch (error) {
    console.warn('No se pudo leer el manifiesto del pack:', error);
    packVersion.textContent = 'Sin conexión';
  }

  bump('Launcher...', 'Comprobando si existe una versión nueva de EmiLauncher.');

  try {
    const remoteLauncher = await window.emiApi.getRemoteLauncher();
    const latest = remoteLauncher?.latestVersion || CURRENT_VERSION;
    versionPill.textContent = `v${CURRENT_VERSION.replace('-preview', '')}`;

    if (latest !== CURRENT_VERSION) {
      setProgress(100, 'Actualización disponible', `Nueva versión del launcher: ${latest}`);
      showToast(`✦ Hay una versión nueva de EmiLauncher: ${latest}`);
    } else {
      setProgress(100, 'Todo listo', 'Noticias, pack y launcher comprobados correctamente.');
    }
  } catch (error) {
    console.warn('No se pudo comprobar la versión del launcher:', error);
    setProgress(100, 'Listo sin conexión', 'Puedes usar el launcher; la comprobación remota falló.');
  }
}

playButton.addEventListener('click', () => {
  showToast('✦ Ajustes y noticias ya son reales. El arranque de Minecraft será el siguiente sistema en conectarse.');
});

accountButton.addEventListener('click', () => {
  accountStatus.textContent = 'Pendiente de vincular';
  showToast('Cuenta Microsoft: falta registrar la aplicación de EmiLauncher para activar el inicio de sesión seguro.');
});

settingsButton.addEventListener('click', () => {
  settingsPanel.classList.toggle('open');
});

settingsClose.addEventListener('click', () => settingsPanel.classList.remove('open'));

ramRange.addEventListener('input', () => {
  ramText.textContent = `${ramRange.value} GB`;
  queueSettingsSave({ ramGb: Number(ramRange.value) });
});

chooseDirectory.addEventListener('click', async () => {
  try {
    const next = await window.emiApi.chooseGameDirectory();
    applySettings(next);
    flashSaved();
  } catch (error) {
    console.warn(error);
    showToast('No se pudo cambiar la carpeta.');
  }
});

autoCheckNews.addEventListener('change', () => saveSettings({ autoCheckNews: autoCheckNews.checked }));
closeLauncherOnGame.addEventListener('change', () => saveSettings({ closeLauncherOnGame: closeLauncherOnGame.checked }));

refreshNewsButton.addEventListener('click', () => refreshNews(false));
editNewsButton.addEventListener('click', async () => {
  await window.emiApi.openNewsEditor();
  showToast('✦ Abriendo el editor de noticias en GitHub.');
});

document.addEventListener('click', (event) => {
  if (!settingsPanel.contains(event.target) && !settingsButton.contains(event.target)) {
    settingsPanel.classList.remove('open');
  }
});

checkRemoteState();
