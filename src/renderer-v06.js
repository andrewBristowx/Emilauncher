const $ = (selector) => document.querySelector(selector);

const sceneBackground = $('#sceneBackground');
const primaryButton = $('#primaryButton');
const primaryIcon = $('#primaryIcon');
const primaryLabel = $('#primaryLabel');
const statusPill = $('#statusPill');
const statusText = $('#statusText');
const progressWrap = $('#progressWrap');
const progressBar = $('#progressBar');
const folderButton = $('#folderButton');
const settingsButton = $('#settingsButton');
const ramButton = $('#ramButton');
const ramQuickText = $('#ramQuickText');
const settingsPanel = $('#settingsPanel');
const settingsClose = $('#settingsClose');
const gameDirectory = $('#gameDirectory');
const mrpackPath = $('#mrpackPath');
const chooseDirectoryButton = $('#chooseDirectoryButton');
const chooseMrpackButton = $('#chooseMrpackButton');
const ramRange = $('#ramRange');
const ramValue = $('#ramValue');
const minimizeButton = $('#minimizeButton');
const closeButton = $('#closeButton');
const toast = $('#toast');

const BG_PARTS = [
  'assets/v06-bg-1.b64',
  'assets/v06-bg-2.b64',
  'assets/v06-bg-3.b64',
  'assets/v06-bg-4.b64',
  'assets/v06-bg-5.b64',
  'assets/v06-bg-6.b64',
  'assets/v06-bg-7.b64'
];

let currentState = null;
let busy = false;
let saveTimer = null;

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 3300);
}

async function loadBackground() {
  try {
    const parts = await Promise.all(BG_PARTS.map(async (url) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`No se pudo cargar ${url}`);
      return (await response.text()).trim();
    }));
    sceneBackground.src = `data:image/jpeg;base64,${parts.join('')}`;
  } catch (error) {
    console.error(error);
    sceneBackground.removeAttribute('src');
  }
}

function setStatusTone(tone) {
  statusPill.classList.remove('ready', 'update', 'error');
  if (tone) statusPill.classList.add(tone);
}

function renderState(snapshot) {
  if (!snapshot) return;
  currentState = snapshot;
  const { pack, settings } = snapshot;

  primaryLabel.textContent = pack.label || 'INSTALAR';
  primaryIcon.textContent = pack.action === 'play' ? '▶' : pack.action === 'update' ? '↻' : '⬇';
  statusText.textContent = pack.detail || 'No instalado';
  setStatusTone(pack.action === 'play' ? 'ready' : pack.action === 'update' ? 'update' : '');

  gameDirectory.value = settings.gameDirectory || '';
  mrpackPath.value = settings.mrpackPath || 'Selecciona tu EmiCobleverse .mrpack';
  ramRange.value = String(settings.ramGb || 6);
  ramValue.textContent = `${ramRange.value} GB`;
  ramQuickText.textContent = `${ramRange.value} GB`;
}

function setBusy(next) {
  busy = next;
  primaryButton.disabled = next;
  folderButton.disabled = next;
  settingsButton.disabled = next;
  ramButton.disabled = next;
  if (!next) {
    progressWrap.hidden = true;
    progressBar.style.width = '0%';
  }
}

function showProgress(payload) {
  const total = Number(payload?.total || 0);
  const current = Number(payload?.current || 0);
  if (total > 0) {
    progressWrap.hidden = false;
    progressBar.style.width = `${Math.max(2, Math.min(100, Math.round((current / total) * 100)))}%`;
  } else if (busy) {
    progressWrap.hidden = false;
    const previous = Number(progressBar.dataset.fake || 8);
    const next = Math.min(92, previous + 7);
    progressBar.dataset.fake = String(next);
    progressBar.style.width = `${next}%`;
  }
}

async function refreshState() {
  try {
    renderState(await window.emiApi.getState());
  } catch (error) {
    console.error(error);
    statusText.textContent = 'No se pudo comprobar la instalación';
    setStatusTone('error');
  }
}

async function runPrimaryAction() {
  if (busy || !currentState) return;
  const action = currentState.pack?.action || 'install';

  if (action === 'play') {
    setBusy(true);
    primaryLabel.textContent = 'ABRIENDO…';
    primaryIcon.textContent = '▶';
    try {
      const result = await window.emiApi.play();
      if (!result?.ok) throw new Error(result?.error?.message || 'No se pudo abrir Minecraft Launcher.');
      showToast('Minecraft Launcher abierto · usa el perfil EmiCobleverse.');
      renderState(result.state || currentState);
    } catch (error) {
      console.error(error);
      showToast(error.message || 'No se pudo abrir Minecraft Launcher.');
      setStatusTone('error');
    } finally {
      setBusy(false);
      await refreshState();
    }
    return;
  }

  setBusy(true);
  primaryLabel.textContent = action === 'update' ? 'ACTUALIZANDO…' : 'INSTALANDO…';
  primaryIcon.textContent = '⬇';
  progressBar.dataset.fake = '8';
  progressWrap.hidden = false;
  progressBar.style.width = '8%';
  setStatusTone(action === 'update' ? 'update' : '');

  try {
    const result = await window.emiApi.installOrUpdate();
    if (!result?.ok) throw new Error(result?.error?.message || 'No se pudo instalar EmiCobleverse.');
    progressBar.style.width = '100%';
    statusText.textContent = 'EmiCobleverse está listo';
    setStatusTone('ready');
    showToast(action === 'update' ? 'Actualización completada.' : 'Instalación completada.');
    renderState(result.state);
  } catch (error) {
    console.error(error);
    statusText.textContent = error.message || 'Error de instalación';
    setStatusTone('error');
    showToast(error.message || 'No se pudo instalar EmiCobleverse.');
  } finally {
    setTimeout(async () => {
      setBusy(false);
      await refreshState();
    }, 450);
  }
}

function openSettings() {
  settingsPanel.hidden = false;
}

function closeSettings() {
  settingsPanel.hidden = true;
}

function queueRamSave(value) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      const next = await window.emiApi.saveSettings({ ramGb: Number(value) });
      renderState(next);
      showToast(`RAM configurada en ${value} GB.`);
    } catch (error) {
      console.error(error);
      showToast('No se pudo guardar la RAM.');
    }
  }, 180);
}

primaryButton.addEventListener('click', runPrimaryAction);
folderButton.addEventListener('click', async () => {
  try {
    const result = await window.emiApi.openGameFolder();
    if (result?.ok === false) throw new Error(result.error || 'No se pudo abrir la carpeta.');
  } catch (error) {
    showToast(error.message || 'No se pudo abrir la carpeta.');
  }
});
settingsButton.addEventListener('click', openSettings);
ramButton.addEventListener('click', openSettings);
settingsClose.addEventListener('click', closeSettings);
settingsPanel.addEventListener('click', (event) => {
  if (event.target === settingsPanel) closeSettings();
});

chooseDirectoryButton.addEventListener('click', async () => {
  try {
    renderState(await window.emiApi.chooseGameDirectory());
    showToast('Carpeta de EmiCobleverse actualizada.');
  } catch (error) {
    showToast(error.message || 'No se pudo elegir la carpeta.');
  }
});

chooseMrpackButton.addEventListener('click', async () => {
  try {
    renderState(await window.emiApi.chooseMrpack());
    showToast('Archivo .mrpack seleccionado.');
  } catch (error) {
    showToast(error.message || 'No se pudo elegir el .mrpack.');
  }
});

ramRange.addEventListener('input', () => {
  ramValue.textContent = `${ramRange.value} GB`;
  ramQuickText.textContent = `${ramRange.value} GB`;
  queueRamSave(ramRange.value);
});

minimizeButton.addEventListener('click', () => window.emiApi.minimize());
closeButton.addEventListener('click', () => window.emiApi.close());

window.emiApi.onStatus((payload) => {
  if (!payload) return;
  statusText.textContent = payload.message || statusText.textContent;
  if (payload.phase === 'error') setStatusTone('error');
  else if (payload.phase === 'ready' || payload.phase === 'launcher-open') setStatusTone('ready');
  showProgress(payload);
});

(async () => {
  await loadBackground();
  await refreshState();
})();
