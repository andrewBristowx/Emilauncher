const CURRENT_VERSION = '0.4.0-preview';
const DISCORD_URL = 'https://discord.gg/s3XJZCp42';
const TWITCH_URL = 'https://www.twitch.tv/emiilyextacy';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function installV04Ui() {
  if (!$('link[href="v04.css"]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'v04.css';
    document.head.append(link);
  }

  const newsPanel = $('#newsSection');
  if (newsPanel && !$('#newsEmoteArtwork')) {
    const showcase = document.createElement('div');
    showcase.className = 'emote-showcase-v4';
    showcase.innerHTML = '<img id="newsEmoteArtwork" class="news-emotes-v4" alt="Emotes reales de Emi adaptados al launcher" draggable="false" />';
    newsPanel.append(showcase);
  }

  if (!$('#authOverlay')) {
    const overlay = document.createElement('div');
    overlay.id = 'authOverlay';
    overlay.className = 'auth-overlay-v4';
    overlay.hidden = true;
    overlay.innerHTML = `
      <section class="auth-modal-v4" role="dialog" aria-modal="true" aria-labelledby="authTitle">
        <button id="closeAuthModal" class="auth-close-v4" type="button" aria-label="Cerrar">×</button>
        <span class="auth-kicker-v4">MICROSOFT · INICIO SEGURO</span>
        <h3 id="authTitle">Conecta tu cuenta Microsoft</h3>
        <p>Se abrió la página oficial de Microsoft en tu navegador. Introduce este código para autorizar EmiLauncher:</p>
        <div id="authUserCode" class="auth-code-v4">----</div>
        <div class="auth-actions-v4">
          <button id="copyAuthCode" type="button">Copiar código</button>
          <button id="openAuthPage" type="button">Abrir Microsoft</button>
        </div>
        <small id="authMessage" class="auth-status-v4">Esperando autorización…</small>
      </section>`;
    document.body.append(overlay);
  }
}

installV04Ui();

const playButton = $('#playButton');
const accountButton = $('#accountButton');
const accountStatus = accountButton?.querySelector('small');
const profileCard = $('.profile-card');
const profileName = profileCard?.querySelector('strong');
const profileStatus = profileCard?.querySelector('div:last-child span');
const settingsButton = $('#settingsButton');
const sidebarSettings = $('#sidebarSettings');
const settingsPanel = $('#settingsPanel');
const closeSettings = $('#closeSettings');
const toast = $('#toast');
const newsGrid = $('#newsGrid');
const progressBar = $('#progressBar');
const packProgressBar = $('#packProgressBar');
const updateText = $('#updateText');
const packStatusTitle = $('#packStatusTitle');
const packStatusDetail = $('#packStatusDetail');
const packVersion = $('#packVersion');
const ramRange = $('#ramRange');
const ramText = $('#ramText');
const gameDirectory = $('#gameDirectory');
const chooseDirectory = $('#chooseDirectory');
const chooseDirectorySettings = $('#chooseDirectorySettings');
const autoCheckNews = $('#autoCheckNews');
const closeLauncherOnGame = $('#closeLauncherOnGame');
const settingsSaved = $('#settingsSaved');
const serverAddress = $('#serverAddress');
const authOverlay = $('#authOverlay');
const authUserCode = $('#authUserCode');
const authMessage = $('#authMessage');

let saveTimer;
let authState = { configured: false, authenticated: false, account: null };
let authVerificationUri = 'https://microsoft.com/devicelogin';
let settings = {
  ramGb: 6,
  gameDirectory: '',
  autoCheckNews: true,
  closeLauncherOnGame: false
};

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => toast.classList.remove('show'), 3300);
}

function showSaved() {
  settingsSaved.classList.add('show');
  window.clearTimeout(showSaved.timeout);
  showSaved.timeout = window.setTimeout(() => settingsSaved.classList.remove('show'), 1300);
}

function openSettings() { settingsPanel.classList.add('open'); }
function closeSettingsPanel() { settingsPanel.classList.remove('open'); }

function updateSettingsUi() {
  ramRange.value = String(settings.ramGb || 6);
  ramText.textContent = `${ramRange.value} GB`;
  gameDirectory.value = settings.gameDirectory || 'Sin seleccionar';
  autoCheckNews.checked = settings.autoCheckNews !== false;
  closeLauncherOnGame.checked = Boolean(settings.closeLauncherOnGame);
}

function queueSave(patch) {
  settings = { ...settings, ...patch };
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(async () => {
    try {
      settings = await window.emiApi.saveSettings(patch);
      updateSettingsUi();
      showSaved();
    } catch (error) {
      console.error(error);
      showToast('No se pudieron guardar los ajustes.');
    }
  }, 160);
}

async function chooseGameDirectory() {
  try {
    const selected = await window.emiApi.chooseGameDirectory();
    if (!selected) return;
    settings = selected;
    updateSettingsUi();
    showSaved();
    showToast('✦ Carpeta de Emipokemon actualizada.');
  } catch (error) {
    console.error(error);
    showToast('No se pudo elegir la carpeta.');
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function prettyDate(value) {
  if (!value) return '';
  try {
    return new Intl.DateTimeFormat('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })
      .format(new Date(`${value}T12:00:00`));
  } catch {
    return value;
  }
}

function renderNews(items) {
  if (!Array.isArray(items) || items.length === 0) {
    newsGrid.innerHTML = '<article class="featured-news"><span class="news-tag">EMI</span><h3>Sin noticias nuevas</h3><p>Cuando Emi publique una novedad aparecerá automáticamente aquí.</p></article>';
    return;
  }

  newsGrid.innerHTML = items.slice(0, 3).map((item, index) => {
    const className = index === 0 ? 'featured-news' : 'compact-news';
    const tag = index === 0 ? `<span class="news-tag">${escapeHtml(item.tag || 'NUEVO')}</span>` : '';
    return `<article class="${className}">${tag}<span class="news-date">${escapeHtml(prettyDate(item.date))}</span><h3>${escapeHtml(item.title || 'Noticia')}</h3><p>${escapeHtml(item.body || '')}</p></article>`;
  }).join('');
}

async function refreshNews(showMessage = false) {
  try {
    const feed = await window.emiApi.getRemoteNews();
    renderNews(feed?.news || []);
    if (showMessage) showToast('✦ Noticias actualizadas para EmiLauncher.');
  } catch (error) {
    console.error(error);
    if (showMessage) showToast('No se pudieron actualizar las noticias.');
  }
}

async function checkRemoteState() {
  let progress = 12;
  progressBar.style.width = `${progress}%`;
  packProgressBar.style.width = `${progress}%`;

  const pulse = window.setInterval(() => {
    progress = Math.min(progress + 8 + Math.floor(Math.random() * 10), 92);
    progressBar.style.width = `${progress}%`;
    packProgressBar.style.width = `${progress}%`;
    updateText.textContent = `Verificando... ${progress}%`;
  }, 220);

  try {
    const [launcher, pack] = await Promise.all([
      window.emiApi.getRemoteLauncher().catch(() => null),
      window.emiApi.getRemotePack().catch(() => null)
    ]);

    if (pack) {
      const version = pack.version || pack.packVersion || '1.0.0';
      packVersion.textContent = `v${version}`;
      packStatusTitle.textContent = 'Actualizado';
      packStatusDetail.textContent = 'El manifiesto remoto está disponible.';
    } else {
      packStatusTitle.textContent = 'Modo sin conexión';
      packStatusDetail.textContent = 'Se usará la instalación local disponible.';
    }

    const latest = launcher?.latestVersion || launcher?.version;
    if (latest && latest !== CURRENT_VERSION) showToast(`Hay una versión de EmiLauncher disponible: ${latest}`);
  } finally {
    window.clearInterval(pulse);
    progressBar.style.width = '100%';
    packProgressBar.style.width = '100%';
    updateText.textContent = '♡ Listo para jugar';
  }
}

async function readTextAsset(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`No se pudo leer ${path}`);
  return (await response.text()).trim();
}

async function loadArtwork() {
  try {
    const chibiBase64 = await readTextAsset('assets/emi-chibi.webp.b64.txt');
    const chibiSrc = `data:image/webp;base64,${chibiBase64}`;
    $$('.emi-chibi-data').forEach((image) => { image.src = chibiSrc; });
  } catch (error) {
    console.warn('No se pudo cargar el chibi de Emi:', error);
  }

  try {
    const parts = await Promise.all([0, 1, 2, 3, 4, 5].map((index) => readTextAsset(`assets/emi-full-${index}.b64`)));
    $('#emiFullArt').src = `data:image/webp;base64,${parts.join('')}`;
  } catch (error) {
    console.warn('No se pudo cargar el modelo grande de Emi:', error);
    $('#emiFullArt').style.display = 'none';
  }

  try {
    const emoteParts = await Promise.all([0, 1, 2, 3, 4, 5, 6, 7, 8].map((index) => readTextAsset(`assets/emotes-news-${index}.b64`)));
    $('#newsEmoteArtwork').src = `data:image/webp;base64,${emoteParts.join('')}`;
  } catch (error) {
    console.warn('No se pudo cargar la composición de emotes:', error);
    $('.emote-showcase-v4')?.remove();
  }
}

function flashSection(selector) {
  const section = $(selector);
  if (!section) return;
  section.classList.remove('flash');
  void section.offsetWidth;
  section.classList.add('flash');
}

function setActiveNav(button) {
  $$('.nav-button').forEach((item) => item.classList.remove('active'));
  if (button) button.classList.add('active');
}

async function openExternal(url) {
  try { await window.emiApi.openExternal(url); }
  catch (error) { console.error(error); showToast('No se pudo abrir el enlace.'); }
}

function applyAuthState(next) {
  authState = next || { configured: false, authenticated: false, account: null };
  const account = authState.account;

  if (!authState.configured) {
    if (accountStatus) accountStatus.textContent = 'Falta Client ID';
    if (profileName) profileName.textContent = 'Pony0n';
    if (profileStatus) profileStatus.textContent = '● En línea';
    accountButton?.classList.remove('is-authenticated');
    profileCard?.classList.remove('microsoft-connected');
    return;
  }

  if (authState.authenticated && account) {
    if (accountStatus) accountStatus.textContent = account.username || 'Conectado';
    if (profileName) profileName.textContent = account.name || account.username || 'Microsoft';
    if (profileStatus) profileStatus.textContent = '● Microsoft conectado';
    accountButton?.classList.add('is-authenticated');
    profileCard?.classList.add('microsoft-connected');
  } else {
    if (accountStatus) accountStatus.textContent = 'Iniciar sesión';
    if (profileName) profileName.textContent = 'Pony0n';
    if (profileStatus) profileStatus.textContent = '● En línea';
    accountButton?.classList.remove('is-authenticated');
    profileCard?.classList.remove('microsoft-connected');
  }
}

async function refreshAuthState() {
  try { applyAuthState(await window.emiApi.getMicrosoftStatus()); }
  catch (error) { console.warn('No se pudo leer sesión Microsoft:', error); }
}

window.emiApi.onMicrosoftDeviceCode((info) => {
  authVerificationUri = info?.verificationUri || 'https://microsoft.com/devicelogin';
  authUserCode.textContent = info?.userCode || '----';
  authMessage.textContent = info?.message || 'Esperando autorización de Microsoft…';
  authOverlay.hidden = false;
});

accountButton.addEventListener('click', async () => {
  if (authState.authenticated) {
    if (!window.confirm(`Cerrar sesión de ${authState.account?.name || authState.account?.username || 'Microsoft'}?`)) return;
    try {
      applyAuthState(await window.emiApi.logoutMicrosoft());
      showToast('✓ Sesión Microsoft cerrada.');
    } catch (error) {
      console.error(error);
      showToast('No se pudo cerrar la sesión Microsoft.');
    }
    return;
  }

  if (!authState.configured) {
    showToast('Microsoft está listo en el código, pero falta configurar el Client ID de EmiLauncher una sola vez.');
    return;
  }

  if (accountStatus) accountStatus.textContent = 'Esperando Microsoft…';
  try {
    const result = await window.emiApi.loginMicrosoft();
    applyAuthState(result);
    authOverlay.hidden = true;
    if (result?.authenticated) showToast(`♡ Microsoft conectado: ${result.account?.name || result.account?.username || 'cuenta verificada'}`);
  } catch (error) {
    console.error(error);
    authMessage.textContent = 'El inicio de sesión se canceló o Microsoft devolvió un error.';
    showToast('No se pudo completar el inicio de sesión Microsoft.');
    await refreshAuthState();
  }
});

$('#closeAuthModal').addEventListener('click', () => { authOverlay.hidden = true; });
$('#copyAuthCode').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(authUserCode.textContent.trim());
    showToast('✓ Código Microsoft copiado.');
  } catch { showToast(`Código: ${authUserCode.textContent.trim()}`); }
});
$('#openAuthPage').addEventListener('click', () => window.emiApi.openMicrosoftVerification(authVerificationUri));

playButton.addEventListener('click', () => {
  showToast('✦ El login Microsoft ya está conectado. El siguiente paso es enlazar la autenticación de Minecraft y el actualizador del pack.');
});

settingsButton.addEventListener('click', openSettings);
sidebarSettings.addEventListener('click', () => { setActiveNav(sidebarSettings); openSettings(); });
closeSettings.addEventListener('click', closeSettingsPanel);

$$('.nav-button[data-section]').forEach((button) => {
  button.addEventListener('click', () => {
    setActiveNav(button);
    const section = button.dataset.section;
    if (section === 'home') flashSection('#homeSection');
    if (section === 'news') flashSection('#newsSection');
    if (section === 'modpack') flashSection('#modpackSection');
    if (section === 'server') flashSection('#serverSection');
    if (section === 'about') showToast('EmiLauncher 0.4.0 · Hecho para Emipokemon ♡');
  });
});

ramRange.addEventListener('input', () => {
  ramText.textContent = `${ramRange.value} GB`;
  queueSave({ ramGb: Number(ramRange.value) });
});

autoCheckNews.addEventListener('change', () => queueSave({ autoCheckNews: autoCheckNews.checked }));
closeLauncherOnGame.addEventListener('change', () => queueSave({ closeLauncherOnGame: closeLauncherOnGame.checked }));
chooseDirectory.addEventListener('click', chooseGameDirectory);
chooseDirectorySettings.addEventListener('click', chooseGameDirectory);
$('#resourceFolder').addEventListener('click', chooseGameDirectory);
$('#refreshNews').addEventListener('click', () => refreshNews(true));
$('#refreshNewsTop').addEventListener('click', () => refreshNews(true));
$('#resourceNews').addEventListener('click', () => refreshNews(true));
$('#editNews').addEventListener('click', async () => {
  await window.emiApi.openNewsEditor();
  showToast('✦ Se abrió GitHub. Guarda la noticia en main y aparecerá para todos.');
});
$('#discordButton').addEventListener('click', () => openExternal(DISCORD_URL));
$('#resourceDiscord').addEventListener('click', () => openExternal(DISCORD_URL));
$('#twitchButton').addEventListener('click', () => openExternal(TWITCH_URL));
$('#resourceTwitch').addEventListener('click', () => openExternal(TWITCH_URL));
$('#resourceSettings').addEventListener('click', openSettings);
$('#resourceAbout').addEventListener('click', () => showToast('♡ EmiLauncher · Emipokemon · Cobbleverse'));
$('#viewPackChanges').addEventListener('click', () => showToast('El historial de cambios se conectará al manifiesto del modpack.'));

$('#copyServerButton').addEventListener('click', async () => {
  const address = serverAddress.textContent.trim();
  if (!address || address.includes('configurar')) {
    showToast('Todavía falta configurar la IP/dominio público del servidor.');
    return;
  }
  try { await navigator.clipboard.writeText(address); showToast('✓ IP copiada.'); }
  catch { showToast(`IP: ${address}`); }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closeSettingsPanel();
    authOverlay.hidden = true;
  }
});

document.addEventListener('click', (event) => {
  if (!settingsPanel.classList.contains('open')) return;
  if (settingsPanel.contains(event.target) || settingsButton.contains(event.target) || sidebarSettings.contains(event.target) || $('#resourceSettings').contains(event.target)) return;
  closeSettingsPanel();
});

(async function boot() {
  await loadArtwork();
  try { settings = { ...settings, ...(await window.emiApi.getSettings()) }; }
  catch (error) { console.warn('No se pudieron leer los ajustes locales:', error); }
  updateSettingsUi();
  await refreshAuthState();
  if (settings.autoCheckNews !== false) await refreshNews(false);
  else renderNews([]);
  await checkRemoteState();
})();
