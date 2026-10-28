const preferences = window.AuroraExt.preferences;
const DEFAULTS = preferences.defaults;
const normalizeDefaultModel = preferences.normalizeDefaultModel;
const normalizeSiteSettings = preferences.normalize;

// One settings read serves every caller during a cold background-page start.
// Uploaded media stays out of popup messages and is read by its website only.
let settingsCache = null;
let localCache = null;
let localRequest = null;
let localRevision = 0;
const LOCAL_KEYS = preferences.siteIds.map(id => `detectedTheme:${id}`);
const pendingSettings = {};

const settingsReady = new Promise(resolve => {
  chrome.storage.sync.get(null, stored => {
    stored ||= {};
    const backup = stored.extensionSettingsBackup;
    const restored = backup && typeof backup === 'object'
      ? Object.fromEntries(Object.keys(DEFAULTS)
        .filter(key => key !== 'extensionEnabled' && backup[key] !== undefined && !(key in pendingSettings))
        .map(key => [key, backup[key]]))
      : {};
    const settings = { ...DEFAULTS, ...stored, ...restored, ...pendingSettings };
    delete settings.extensionSettingsBackup;
    const defaultModel = normalizeDefaultModel(settings.defaultModel);
    settingsCache = normalizeSiteSettings({ ...settings, defaultModel });
    const updates = { ...restored };
    if (defaultModel !== settings.defaultModel) updates.defaultModel = defaultModel;
    if (Object.keys(updates).length) {
      chrome.storage.sync.set(updates, () => {
        if (!chrome.runtime.lastError && backup) chrome.storage.sync.remove('extensionSettingsBackup');
        resolve(settingsCache);
      });
    } else {
      if (backup) chrome.storage.sync.remove('extensionSettingsBackup');
      resolve(settingsCache);
    }
  });
});

// Serialize partial edits so rapid changes and different settings pages cannot
// overwrite another website's overrides or an inherited setting change.
let settingsWrites = Promise.resolve();
async function saveSiteSettings(request) {
  await settingsReady;
  const site = request.site;
  if (!preferences.siteIds.includes(site)) throw new Error('Choose a supported website');
  const patch = Object.fromEntries(Object.entries(request.patch || {})
    .filter(([key, next]) => Object.hasOwn(DEFAULTS, key) && next !== undefined));
  const stored = await chrome.storage.sync.get(null);
  const updates = preferences.planSettings(stored, site, patch, request.scope);
  await chrome.storage.sync.set(updates);
  Object.assign(settingsCache, updates);
  // Remove a replaced upload only after every website's references have been
  // considered. Legacy media remains available to unmigrated websites.
  const previousKey = preferences.resolve(stored, site).customBgDataKey;
  if (previousKey?.startsWith('customBgData:')) {
    const next = { ...stored, ...updates };
    const references = [next, next.sharedAppearance,
      ...preferences.siteIds.map(id => next[preferences.siteKey(id)])];
    if (!references.some(record => record?.customBgDataKey === previousKey)) {
      await chrome.storage.local.remove(previousKey).catch(() => {});
    }
  }
  return { ok: true, settings: settingsCache };
}

function getLocalData() {
  if (localCache) return Promise.resolve(localCache);
  if (localRequest) return localRequest;
  const revision = localRevision;
  localRequest = new Promise(resolve => chrome.storage.local.get(LOCAL_KEYS, resolve))
    .then(local => {
      localRequest = null;
      // A concurrent upload or theme change wins over an older storage response.
      if (revision !== localRevision) return getLocalData();
      localCache = local || {};
      return localCache;
    });
  return localRequest;
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync') {
    for (const [key, { newValue }] of Object.entries(changes)) {
      if (key === 'extensionSettingsBackup') continue;
      const normalized = preferences.value(key, newValue);
      if (settingsCache) settingsCache[key] = normalized;
      else pendingSettings[key] = normalized;
    }
  } else if (area === 'local') {
    for (const key of LOCAL_KEYS) {
      if (!(key in changes)) continue;
      localRevision++;
      if (!localCache) continue;
      const value = changes[key].newValue;
      if (value === undefined) delete localCache[key];
      else localCache[key] = value;
    }
  }
});

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.storage.sync.set(DEFAULTS);
  } else if (details.reason === 'update') {
    chrome.storage.sync.get((items) => {
      const newSettings = {};
      Object.keys(DEFAULTS).forEach((key) => {
        if (items[key] === undefined) {
          newSettings[key] = key === 'glassIntensity'
            ? (items.appearance === 'dimmed' ? 0 : DEFAULTS[key])
            : DEFAULTS[key];
        }
      });
      if (normalizeDefaultModel(items.defaultModel) !== items.defaultModel) {
        newSettings.defaultModel = '';
      }
      if (Object.keys(newSettings).length > 0) {
        chrome.storage.sync.set(newSettings);
      }
    });
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'SET_SITE_SETTINGS') {
    const operation = settingsWrites.then(() => saveSiteSettings(request));
    settingsWrites = operation.catch(() => {});
    operation.then(sendResponse, error => sendResponse({ error: error.message }));
    return true;
  }
  if (request.type === 'GET_SETTINGS') {
    if (settingsCache) {
      sendResponse(settingsCache);
      return false;
    }
    settingsReady.then(() => sendResponse(settingsCache));
    return true;
  }

  if (request.type === 'GET_SETTINGS_FULL') {
    if (settingsCache && localCache) {
      sendResponse({ settings: settingsCache, local: localCache });
      return false;
    }
    Promise.all([settingsReady, getLocalData()]).then(([, local]) => {
      sendResponse({ settings: settingsCache, local });
    });
    return true;
  }

  if (request.type === 'GET_DEFAULTS') {
    sendResponse(DEFAULTS);
    return false;
  }
});

chrome.commands.onCommand.addListener(async command => {
  const key = command === 'toggle-visibility' ? 'focusMode' : command === 'toggle-blur' ? 'blurChatHistory' : null;
  if (!key) return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const site = window.AuroraExt.sites.fromUrl(tab?.url);
  if (!site) return;
  const operation = settingsWrites.then(async () => {
    const stored = await chrome.storage.sync.get(null);
    return saveSiteSettings({ site: site.id, patch: { [key]: !preferences.resolve(stored, site.id)[key] } });
  });
  settingsWrites = operation.catch(() => {});
  await operation;
});
