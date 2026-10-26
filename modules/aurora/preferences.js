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
  function normalizeSitePreference(key, value) {
    if (key === 'disabledSites') return SITE_IDS.filter(id => Array.isArray(value) && value.includes(id));
    if (key === 'siteDefaultModels') return Object.fromEntries(SITE_IDS
      .filter(id => typeof value?.[id] === 'string')
      .map(id => [id, value[id].replace(/\s+/g, ' ').trim().slice(0, 120)]));
    return value;
  }
  function normalize(settings = {}) {
    return { ...defaults, ...settings,
      defaultModel: normalizeDefaultModel(settings.defaultModel),
      disabledSites: normalizeSitePreference('disabledSites', settings.disabledSites),
      siteDefaultModels: normalizeSitePreference('siteDefaultModels', settings.siteDefaultModels) };
  }

  function value(key, next) {
    if (next === undefined) next = defaults[key];
    return key === 'defaultModel' ? normalizeDefaultModel(next) : normalizeSitePreference(key, next);
  }

  A.preferences = { defaults, normalize, value, normalizeDefaultModel, normalizeSitePreference };
})();
