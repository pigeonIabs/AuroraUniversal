// Start the authoritative preference read before optional feature modules load.
// Root material activates as soon as storage responds, independently of the
// background page waking up or the host's deferred scripts completing.
(() => {
  'use strict';
  const A = window.AuroraExt;
  A.startupTimings.settingsRequested = performance.now();
  let localBackground = null;
  let localBackgroundKey = null;
  let settings = null;
  let storedSettings = {};
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
      Object.assign(changesDuringRead, changes);
      A.preferences.applyChanges(storedSettings, changes);
      if (!settings) return;
      const next = A.preferences.resolve(storedSettings);
      if (!Object.keys(A.preferences.diff(settings, next)).length) return;
      const mediaChanged = settings.customBgDataKey !== next.customBgDataKey;
      if (mediaChanged) localBackground = null;
      Object.assign(settings, next);
      Object.assign(A.state.settings, next);
      if (A.isActive()) {
        A.rootFlags.apply();
        mountAppearance();
        A.background.applyStyles();
        A.background.update(mediaChanged);
      } else {
        document.documentElement?.classList.remove(A.config.HTML_CLASS);
        A.background.reset();
        document.getElementById(A.config.ID)?.remove();
        A.background.restoreApp();
      }
    } else if (area === 'local' && changes[settings?.customBgDataKey || A.config.LOCAL_BG_KEY]) {
      localBackground = null;
      if (settings && A.isActive()) A.background.update(true);
    }
  }
  chrome.storage.onChanged.addListener(storageChanged);
  const ready = read('sync', null).then(stored => {
    A.startupTimings.settingsReceived = performance.now();
    if (!stored) return null;
    const backup = stored.extensionSettingsBackup;
    if (backup && typeof backup === 'object') {
      for (const key of Object.keys(A.preferences.defaults)) {
        if (key !== 'extensionEnabled' && backup[key] !== undefined) stored[key] = backup[key];
      }
    }
    delete stored.extensionSettingsBackup;
    storedSettings = A.preferences.applyChanges(stored, changesDuringRead);
    A.state.storedSettings = storedSettings;
    settings = A.preferences.resolve(storedSettings);
    Object.assign(A.state.settings, settings);
    if (settings.customBgUrl === '__local__') {
      const key = settings.customBgDataKey;
      localBackgroundKey = key;
      localBackground = read('local', key).then(value => value?.[key] || null);
    }
    if (A.isActive() && document.documentElement) A.rootFlags.apply();
    mountAppearance();
    return storedSettings;
  });
  A.startup = {
    ready,
    release() {
      chrome.storage.onChanged.removeListener(storageChanged);
    },
    takeLocalBackground() {
      const pending = localBackgroundKey === A.getSettings().customBgDataKey ? localBackground : null;
      localBackground = null;
      return pending;
    },
  };
})();
