// Start the authoritative preference read before optional feature modules load.
// Root material activates as soon as storage responds, independently of the
// background page waking up or the host's deferred scripts completing.
(() => {
  'use strict';
  const A = window.AuroraExt;
  A.startupTimings.settingsRequested = performance.now();
  let localBackground = null;
  let settings = null;
  const changesDuringRead = {};
  // Prepare appearance before the host creates its body. Background attachment
  // handles the later body without delaying loading or restarting the scene.
  function mountAppearance() {
    if (A.isActive()) {
      A.utils.toggleClass(document.documentElement, 'cgpt-tab-hidden', document.hidden);
      A.background.show();
    }
  }
  const read = (area, keys) => new Promise(resolve => {
    try {
      chrome.storage[area].get(keys, value => resolve(chrome.runtime.lastError ? null : value));
    } catch { resolve(null); }
  });
  function storageChanged(changes, area) {
    if (area === 'sync') {
      for (const [key, change] of Object.entries(changes)) {
        if (!Object.hasOwn(A.preferences.defaults, key)) continue;
        const value = A.preferences.value(key, change.newValue);
        changesDuringRead[key] = value;
        if (settings) settings[key] = A.state.settings[key] = value;
      }
      if (!settings) return;
      if (A.isActive()) {
        A.rootFlags.apply();
        mountAppearance();
        A.background.applyStyles();
        A.background.update();
      } else {
        document.documentElement?.classList.remove(A.config.HTML_CLASS);
        A.background.reset();
        document.getElementById(A.config.ID)?.remove();
        A.background.restoreApp();
      }
    } else if (area === 'local' && changes[A.config.LOCAL_BG_KEY]) {
      localBackground = null;
      if (settings && A.isActive()) A.background.update(true);
    }
  }
  chrome.storage.onChanged.addListener(storageChanged);
  const ready = read('sync', { ...A.preferences.defaults, extensionSettingsBackup: null }).then(stored => {
    A.startupTimings.settingsReceived = performance.now();
    if (!stored) return null;
    const backup = stored.extensionSettingsBackup;
    if (backup && typeof backup === 'object') {
      for (const key of Object.keys(A.preferences.defaults)) {
        if (key !== 'extensionEnabled' && backup[key] !== undefined) stored[key] = backup[key];
      }
    }
    delete stored.extensionSettingsBackup;
    settings = A.preferences.normalize({ ...stored, ...changesDuringRead });
    Object.assign(A.state.settings, settings);
    if (settings.customBgUrl === '__local__') {
      localBackground = read('local', A.config.LOCAL_BG_KEY).then(value => value?.[A.config.LOCAL_BG_KEY] || null);
    }
    if (A.isActive() && document.documentElement) A.rootFlags.apply();
    mountAppearance();
    return settings;
  });
  A.startup = {
    ready,
    release() {
      chrome.storage.onChanged.removeListener(storageChanged);
    },
    takeLocalBackground() {
      const pending = localBackground;
      localBackground = null;
      return pending;
    },
  };
})();
