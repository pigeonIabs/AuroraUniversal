// Shared preference schema for the background page, popup, and content runtime.
(() => {
  'use strict';
  const A = (window.AuroraExt = window.AuroraExt || {});
  const defaults = Object.freeze({
    legacyComposer: false,
    theme: 'auto',
    appearance: 'clear',
    glassIntensity: 100,
    glassUserMessages: true,
    hideUpgradeButtons: false,
    hideRateLimitMessages: false,
    hideAIWarnings: true,
    blockAds: true,
    disableAnimations: false,
    focusMode: false,
    hideQuickSettings: false,
    queueWhileGenerating: false,
    customBgUrl: '',
    customBgDataKey: 'customBgData',
    backgroundBlur: '60',
    backgroundScaling: 'cover',
    voiceColor: 'default',
    cuteVoiceUI: false,
    hasSeenWelcomeScreen: false,
    defaultModel: '',
    customFont: 'system',
    blurChatHistory: false,
    blurAvatar: false,
    soundEnabled: false,
    soundVolume: 'low',
    autoContrast: false,
    smartSelectors: true,
    dataMaskingEnabled: false,
    maskingRandomMode: false,
    cinemaMode: false,
    extensionEnabled: true,
    disabledSites: [],
    siteDefaultModels: {}
  });

  const DEFAULT_MODEL_VALUES = new Set([
    '',
    'gpt-5.5-instant',
    'gpt-5.6-sol-medium',
    'gpt-5.6-sol-high',
  ]);

  function normalizeDefaultModel(value) {
    return DEFAULT_MODEL_VALUES.has(value) ? value : '';
  }

  const SITE_IDS = ['chatgpt', 'claude', 'gemini', 'grok', 'qwen', 'aistudio', 'deepseek', 'huggingface'];
  const scenicBackgrounds = Object.freeze({
    __northern_lights__: 'northern-lights', __dawn__: 'dawn',
    __ember__: 'ember', __deep_ocean__: 'deep-ocean'
  });
  function normalizeBackground(value = '') {
    return typeof value === 'string' && value.startsWith('https://img.freepik.com/free-photo/abstract-luxury-gradient-blue-background-smooth-dark-blue-with-black-vignette-studio-banner_1258-54581.jpg')
      ? '__deep_ocean__' : value;
  }
  // Stored intensity remains transparency for compatibility with saved settings.
  // Every control presents the inverse, from clear on the left to dim on the right.
  function glassAmount(settings = {}) {
    const intensity = Number(settings.glassIntensity ?? (settings.appearance === 'dimmed' ? 0 : 100));
    return 100 - Math.max(0, Math.min(100, Number.isFinite(intensity) ? intensity : 100));
  }
  function glassPatch(amount) {
    const dim = Math.max(0, Math.min(100, Math.round(Number(amount) || 0)));
    return { glassIntensity: 100 - dim, appearance: dim < 50 ? 'clear' : 'dimmed' };
  }
  function normalizeSitePreference(key, value) {
    if (key === 'disabledSites') return SITE_IDS.filter(id => Array.isArray(value) && value.includes(id));
    if (key === 'siteDefaultModels') return Object.fromEntries(SITE_IDS
      .filter(id => typeof value?.[id] === 'string')
      .map(id => [id, value[id].replace(/\s+/g, ' ').trim().slice(0, 120)]));
    return value;
  }
  function normalize(settings = {}) {
    return { ...defaults, ...settings, ...glassPatch(glassAmount(settings)),
      customBgUrl: normalizeBackground(settings.customBgUrl),
      defaultModel: normalizeDefaultModel(settings.defaultModel),
      disabledSites: normalizeSitePreference('disabledSites', settings.disabledSites),
      siteDefaultModels: normalizeSitePreference('siteDefaultModels', settings.siteDefaultModels) };
  }

  function value(key, next) {
    if (next === undefined) next = defaults[key];
    if (key === 'customBgUrl') return normalizeBackground(next);
    return key === 'defaultModel' ? normalizeDefaultModel(next) : normalizeSitePreference(key, next);
  }

  const appearanceKeys = [
    'theme', 'appearance', 'glassIntensity', 'glassUserMessages', 'customBgUrl',
    'customBgDataKey', 'backgroundBlur', 'backgroundScaling', 'customFont',
    'voiceColor', 'cuteVoiceUI', 'disableAnimations', 'autoContrast'
  ];
  const siteKey = id => `siteAppearance:${id}`;
  const pickAppearance = settings => Object.fromEntries(appearanceKeys
    .filter(key => settings?.[key] !== undefined)
    .map(key => [key, settings[key]]));
  const globalKeys = ['extensionEnabled', 'disabledSites', 'siteDefaultModels', 'hasSeenWelcomeScreen'];
  const siteKeys = Object.keys(defaults).filter(key => !globalKeys.includes(key));
  const settingGroups = [
    ['appearance', 'glassIntensity'], ['customBgUrl', 'customBgDataKey'],
    ...siteKeys.filter(key => !['appearance', 'glassIntensity', 'customBgUrl', 'customBgDataKey'].includes(key)).map(key => [key])
  ];
  const pickSiteSettings = settings => Object.fromEntries(siteKeys
    .filter(key => settings?.[key] !== undefined).map(key => [key, settings[key]]));
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const pickGroup = (settings, group) => Object.fromEntries(group.map(key => [key, settings[key]]));
  function pruneSiteSettings(record, stored) {
    const base = normalize(stored);
    const candidate = pickSiteSettings(record);
    const effective = normalize({ ...base, ...candidate });
    return Object.assign({}, ...settingGroups
      .filter(group => group.some(key => Object.hasOwn(candidate, key)) &&
        !same(pickGroup(base, group), pickGroup(effective, group)))
      .map(group => pickGroup(effective, group)));
  }
  const siteOverrides = (stored, id) => pruneSiteSettings(stored[siteKey(id)], stored);
  function resolve(stored = {}, id = A.site?.id) {
    const own = SITE_IDS.includes(id) ? siteOverrides(stored, id) : {};
    return normalize({ ...stored, ...own });
  }
  function planSettings(stored, id, patch, scope = 'auto') {
    // Only differences are private. Old complete appearance snapshots are
    // reduced against the original baseline before any shared edit is applied.
    const records = Object.fromEntries(SITE_IDS.map(site => [site, siteOverrides(stored, site)]));
    const updates = Object.fromEntries(Object.entries(patch).filter(([key]) => globalKeys.includes(key)));
    const touched = settingGroups.filter(group => group.some(key => Object.hasOwn(patch, key)));
    for (const group of touched) {
      const own = records[id];
      const privateEdit = scope === 'site' || group.some(key => Object.hasOwn(own, key));
      const values = pickGroup(normalize({ ...stored, ...(privateEdit ? own : {}), ...patch }), group);
      Object.assign(privateEdit ? own : updates, values);
    }
    // When every website has the same value, that value becomes the shared
    // baseline again without a separate sharing preference or UI control.
    for (const group of touched) {
      const values = SITE_IDS.map(site => pickGroup(normalize({ ...stored, ...updates, ...records[site] }), group));
      if (values.every(value => same(value, values[0]))) {
        Object.assign(updates, values[0]);
        for (const record of Object.values(records)) for (const key of group) delete record[key];
      }
    }
    for (const site of SITE_IDS) {
      const key = siteKey(site);
      const record = pruneSiteSettings(records[site], { ...stored, ...updates });
      if ((Object.keys(record).length || Object.hasOwn(stored, key)) && !same(stored[key], record)) updates[key] = record;
    }
    return updates;
  }
  function applyChanges(stored, changes) {
    for (const [key, change] of Object.entries(changes)) {
      if (change.newValue === undefined) delete stored[key];
      else stored[key] = change.newValue;
    }
    return stored;
  }
  function diff(before, after) {
    return Object.fromEntries(Object.keys(defaults)
      .filter(key => JSON.stringify(before[key]) !== JSON.stringify(after[key]))
      .map(key => [key, { oldValue: before[key], newValue: after[key] }]));
  }
  function save(patch, id = A.site?.id, callback, scope = 'auto') {
    return chrome.runtime.sendMessage({ type: 'SET_SITE_SETTINGS', site: id, patch, scope }).then(result => {
      if (result?.error) throw new Error(result.error);
      callback?.();
      return result;
    });
  }

  A.preferences = { defaults, normalize, value, normalizeDefaultModel, normalizeSitePreference, glassAmount, glassPatch,
    appearanceKeys, siteKeys, siteKey, pickAppearance, pickSiteSettings, siteOverrides, planSettings,
    resolve, applyChanges, diff, save, siteIds: SITE_IDS, scenicBackgrounds, normalizeBackground };
})();
