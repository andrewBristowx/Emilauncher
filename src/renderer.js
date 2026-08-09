const progressBar = document.querySelector('.progress-bar');
const updateText = document.querySelector('#updateText');
const playButton = document.querySelector('#playButton');
const toast = document.querySelector('#toast');
const settingsButton = document.querySelector('#settingsButton');
const settingsPanel = document.querySelector('#settingsPanel');
const ramRange = document.querySelector('#ramRange');
const ramText = document.querySelector('#ramText');

let progress = 12;
const fakeUpdate = setInterval(() => {
  progress += Math.floor(Math.random() * 13) + 6;
  if (progress >= 100) {
    progress = 100;
    clearInterval(fakeUpdate);
    updateText.textContent = 'Todo listo';
  } else {
    updateText.textContent = `Verificando archivos... ${progress}%`;
  }
  progressBar.style.width = `${progress}%`;
}, 280);

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => toast.classList.remove('show'), 2800);
}

playButton.addEventListener('click', () => {
  showToast('✦ Preview visual v0.1: el lanzamiento real de Minecraft se conecta en la siguiente fase.');
});

settingsButton.addEventListener('click', () => {
  settingsPanel.classList.toggle('open');
});

ramRange.addEventListener('input', () => {
  ramText.textContent = `${ramRange.value} GB`;
});

document.addEventListener('click', (event) => {
  if (!settingsPanel.contains(event.target) && !settingsButton.contains(event.target)) {
    settingsPanel.classList.remove('open');
  }
});
