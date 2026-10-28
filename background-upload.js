const targetSite = new URLSearchParams(location.search).get('site');
const targetScope = new URLSearchParams(location.search).get('scope') === 'site' ? 'site' : 'auto';
const preferences = window.AuroraExt.preferences;
const MAX_FILE_SIZE_MB = 15;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

const fileInput = document.getElementById('backgroundFile');
const progress = document.getElementById('progress');
const progressBar = document.getElementById('progressBar');
const status = document.getElementById('status');

function setStatus(message, type = '') {
  status.textContent = message;
  status.className = `status${type ? ` ${type}` : ''}`;
}

function setProgress(percent) {
  progress.hidden = false;
  progressBar.style.width = `${percent}%`;
}

async function saveBackground(dataUrl, fileName) {
  if (!preferences.siteIds.includes(targetSite)) {
    setStatus('Choose a website in Aurora before uploading a background.', 'error');
    return;
  }
  setStatus(`Saving ${fileName}`);
  setProgress(78);
  // Each upload has its own immutable media key. Shared appearances can refer
  // to it without a later independent upload replacing their background.
  const key = `customBgData:${targetSite}:${crypto.randomUUID()}`;
  try {
    await chrome.storage.local.set({ [key]: dataUrl });
    await preferences.save({ customBgUrl: '__local__', customBgDataKey: key }, targetSite, undefined, targetScope);
    setProgress(100);
    setStatus(`${fileName} is now your Aurora background. You can close this tab.`, 'success');
  } catch (error) {
    await chrome.storage.local.remove(key);
    setStatus(`Aurora could not save this background. ${error.message}`, 'error');
  }
}

fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (!file) return;

  if (file.size > MAX_FILE_SIZE_BYTES) {
    setStatus(`Choose a file smaller than ${MAX_FILE_SIZE_MB} MB.`, 'error');
    fileInput.value = '';
    return;
  }

  setStatus(`Reading ${file.name}`);
  setProgress(20);

  const reader = new FileReader();
  reader.onprogress = (event) => {
    if (event.lengthComputable) {
      setProgress(Math.max(20, Math.min(70, Math.round((event.loaded / event.total) * 70))));
    }
  };
  reader.onload = () => {
    const dataUrl = reader.result;
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
      setStatus('Aurora could not read this file.', 'error');
      return;
    }
    saveBackground(dataUrl, file.name);
  };
  reader.onerror = () => {
    setStatus('Aurora could not read this file.', 'error');
  };
  reader.readAsDataURL(file);
});
