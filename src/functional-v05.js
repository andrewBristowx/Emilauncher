(() => {
  const $ = (selector) => document.querySelector(selector);
  const playButton = $('#playButton');
  if (!playButton || !window.emiApi) return;

  const progressBar = $('#progressBar');
  const packProgressBar = $('#packProgressBar');
  const updateText = $('#updateText');
  const packStatusTitle = $('#packStatusTitle');
  const packStatusDetail = $('#packStatusDetail');
  const packVersion = $('#packVersion');
  const toast = $('#toast');
  let busy = false;

  function showToast(message, ms = 5200) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => toast.classList.remove('show'), ms);
  }

  function setProgress(value) {
    const pct = Math.max(0, Math.min(100, Number(value) || 0));
    if (progressBar) progressBar.style.width = `${pct}%`;
    if (packProgressBar) packProgressBar.style.width = `${pct}%`;
  }

  function statusPercent(status) {
    if (status?.total > 0) return Math.round((status.current / status.total) * 100);
    const fixed = {
      auth: 5,
      'minecraft-auth': 10,
      'pack-open': 15,
      'pack-files': 45,
      'pack-overrides': 65,
      java: 70,
      'runtime-vanilla-meta': 74,
      'runtime-vanilla': 82,
      'runtime-fabric-meta': 86,
      'runtime-fabric': 94,
      launching: 98,
      running: 100,
      stopped: 100,
      error: 100
    };
    return fixed[status?.phase] ?? 20;
  }

  window.emiApi.onGameStatus((status) => {
    if (updateText && status?.message) updateText.textContent = status.message;
    setProgress(statusPercent(status));
    if (status?.phase === 'pack-files' || status?.phase === 'pack-overrides') {
      if (packStatusTitle) packStatusTitle.textContent = 'Preparando EmiCobleverse';
      if (packStatusDetail) packStatusDetail.textContent = status.message || 'Verificando archivos…';
    }
    if (status?.phase === 'running') {
      if (packStatusTitle) packStatusTitle.textContent = 'En ejecución';
      showToast(`♡ ${status.message || 'Minecraft iniciado.'}`);
    }
    if (status?.phase === 'error') showToast(`⚠ ${status.message || 'No se pudo iniciar Minecraft.'}`, 8000);
  });

  window.emiApi.onMinecraftProfile((profile) => {
    const accountButton = $('#accountButton');
    const accountStatus = accountButton?.querySelector('small');
    const profileCard = $('.profile-card');
    const profileName = profileCard?.querySelector('strong');
    const profileStatus = profileCard?.querySelector('div:last-child span');
    if (accountStatus) accountStatus.textContent = profile?.name || 'Minecraft conectado';
    if (profileName) profileName.textContent = profile?.name || 'Minecraft';
    if (profileStatus) profileStatus.textContent = '● Minecraft conectado';
    accountButton?.classList.add('is-authenticated');
    profileCard?.classList.add('microsoft-connected');
  });

  async function configureClientIdAndRetry() {
    const value = window.prompt('EmiLauncher necesita el Application (client) ID de una aplicación pública de Microsoft.\n\nPega aquí el Client ID. No pongas ningún Client Secret:');
    if (!value?.trim()) return null;
    await window.emiApi.configureMicrosoftClientId(value.trim());
    showToast('✓ Client ID guardado solo en este PC. Ahora iniciaremos sesión.');
    return window.emiApi.launchGame();
  }

  function explainError(error) {
    switch (error?.code) {
      case 'missing_client_id': return 'Falta el Client ID público de Microsoft para EmiLauncher.';
      case 'minecraft_app_registration_required': return 'La cuenta Microsoft funciona, pero Minecraft Services rechazó este Client ID. Hay que registrar/autorizar la aplicación para Minecraft Services.';
      case 'minecraft_profile_missing': return 'La cuenta inició sesión, pero no tiene un perfil de Minecraft: Java Edition disponible.';
      case 'java_21_required': return 'No encontré Java 21. Instala Java 21 o configura JAVA_HOME y vuelve a abrir EmiLauncher.';
      case 'mrpack_selection_cancelled': return 'No seleccionaste EmiCobleverse 1.0.0.mrpack.';
      default: return error?.message || 'No se pudo iniciar Minecraft.';
    }
  }

  async function play() {
    if (busy) return;
    busy = true;
    playButton.disabled = true;
    playButton.setAttribute('aria-busy', 'true');
    if (updateText) updateText.textContent = 'Preparando inicio…';
    setProgress(2);
    try {
      let result = await window.emiApi.launchGame();
      if (!result?.ok && result?.error?.code === 'missing_client_id') {
        result = await configureClientIdAndRetry();
        if (!result) {
          showToast('No se configuró el Client ID; no se inició sesión.');
          return;
        }
      }
      if (result?.ok) {
        if (packVersion && result.pack?.versionId) packVersion.textContent = `v${result.pack.versionId}`;
        if (packStatusTitle) packStatusTitle.textContent = 'Listo / ejecutando';
        if (packStatusDetail) packStatusDetail.textContent = `Fabric ${result.versionId} · ${result.profile?.name || 'Minecraft'}`;
        showToast(`♡ Minecraft iniciado como ${result.profile?.name || 'tu cuenta'}.`);
        return;
      }
      const error = result?.error || { code: 'launch_failed', message: 'No se pudo iniciar.' };
      showToast(`⚠ ${explainError(error)}`, 9000);
      if (error.code === 'minecraft_app_registration_required' && updateText) updateText.textContent = 'Client ID requiere autorización de Minecraft Services';
    } catch (error) {
      console.error(error);
      showToast(`⚠ ${error?.message || 'Error inesperado al iniciar Minecraft.'}`, 9000);
    } finally {
      busy = false;
      playButton.disabled = false;
      playButton.removeAttribute('aria-busy');
    }
  }

  document.addEventListener('click', (event) => {
    const target = event.target?.closest?.('#playButton');
    if (!target) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    play();
  }, true);

  playButton.title = 'Instalar/verificar EmiCobleverse e iniciar Minecraft 1.21.1 Fabric';
})();
