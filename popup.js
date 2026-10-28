// Toolbar settings. Render defaults, then hydrate from the background cache.

// --- Constants & Defaults ---
const SCENIC_BACKGROUNDS = {
  __deep_ocean__: 'bgPresetOptionDeepOcean', __northern_lights__: 'bgPresetOptionNorthernLights',
  __dawn__: 'bgPresetOptionDawn', __ember__: 'bgPresetOptionEmber'
};
const GROK_HORIZON_URL = chrome?.runtime?.getURL ? chrome.runtime.getURL('assets/grok-4.webp') : 'assets/grok-4.webp';
const PURE_BLACK_BACKGROUND = '__pure_black__';

const DEFAULTS = window.AuroraExt.preferences.defaults;

const TOGGLE_KEYS = [
  'legacyComposer', 'hideUpgradeButtons', 'hideRateLimitMessages', 'hideAIWarnings', 'blockAds', 'disableAnimations',
  'focusMode', 'hideQuickSettings', 'queueWhileGenerating', 'blurChatHistory',
  'blurAvatar', 'soundEnabled', 'autoContrast', 'dataMaskingEnabled',
  'maskingRandomMode', 'cuteVoiceUI', 'cinemaMode', 'glassUserMessages'
];

// --- Element Cache (populated once on DOMContentLoaded) ---
const $ = {};
let listenersAttached = false;
let selectedSite = AuroraExt.sites.all[0];
let activeSiteTab = null;
let currentSettings = DEFAULTS;
let storedSettings = DEFAULTS;
let detectedThemes = {};
let siteSelectedByUser = false;
let siteState = { models: [], currentModel: '' };
let siteRequestRevision = 0;

// --- Helpers ---
const getMessage = (key, substitutions) => chrome?.i18n?.getMessage(key, substitutions) || key;

function saveSettings(patch, site = selectedSite.id, scope = siteSelectedByUser ? 'site' : 'auto') {
  return AuroraExt.preferences.save(patch, site, undefined, scope).then(result => {
    if (result?.settings) renderUi(result.settings, detectedThemes);
    return result;
  });
}

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
  // Keep <html lang="..."> in sync with the browser UI language (basic a11y).
  try {
    const uiLang = chrome?.i18n?.getUILanguage?.() || 'en';
    document.documentElement.lang = String(uiLang).toLowerCase();
  } catch (e) {
    // ignore
  }

  cacheElements();
  document.querySelector('main').inert = true;

  applyLocalization();
  const siteScopeReady = applySiteScope();
  
  setupTabs();
  
  renderUi(DEFAULTS, { detectedTheme: 'dark' });
  
  chrome.runtime.sendMessage({ type: 'GET_SETTINGS_FULL' }, (response) => {
    if (chrome.runtime.lastError) {
      // Fallback: direct storage access if message fails
      Promise.all([
        chrome.storage.sync.get(null),
        chrome.storage.local.get(AuroraExt.sites.all.map(site => `detectedTheme:${site.id}`))
      ]).then(async ([sync, local]) => {
        await siteScopeReady;
        hydrateWithRealData({ ...DEFAULTS, ...sync }, local);
      });
      return;
    }
    
    const { settings, local } = response || {};
    siteScopeReady.then(() => hydrateWithRealData(settings || DEFAULTS, local || {}));
  });
});

async function applySiteScope() {
  const select = document.getElementById('websiteSelect');
  for (const site of AuroraExt.sites.all) select.add(new Option(site.name, site.id));
  select.addEventListener('change', () => {
    closeAllSelects();
    siteSelectedByUser = true;
    selectedSite = AuroraExt.sites.all.find(site => site.id === select.value);
    renderUi(storedSettings, detectedThemes);
    refreshSiteControls();
  });
  document.getElementById('siteEnabled').addEventListener('change', async event => {
    const id = selectedSite.id;
    const checked = event.target.checked;
    const stored = await chrome.storage.sync.get({ disabledSites: [] });
    const disabled = new Set(Array.isArray(stored.disabledSites) ? stored.disabledSites : []);
    if (checked) disabled.delete(id); else disabled.add(id);
    saveSettings({ disabledSites: [...disabled] });
  });
  const saveModel = async value => {
    const id = selectedSite.id;
    const stored = await chrome.storage.sync.get({ siteDefaultModels: {} });
    const models = { ...stored.siteDefaultModels, [id]: value };
    currentSettings = { ...currentSettings, siteDefaultModels: models };
    renderSiteSettings();
    saveSettings({ siteDefaultModels: models });
  };
  document.getElementById('siteDefaultModel').addEventListener('change', event => saveModel(event.target.value));
  document.getElementById('useCurrentModel').addEventListener('click', () => {
    if (siteState.currentModel) saveModel(siteState.currentModel);
  });
  try {
    [activeSiteTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!siteSelectedByUser) selectedSite = AuroraExt.sites.fromUrl(activeSiteTab?.url) || selectedSite;
  } catch { /* The site selector remains available on extension pages. */ }
  select.value = selectedSite.id;
  renderUi(storedSettings, detectedThemes);
  chrome.tabs.onUpdated?.addListener((tabId, change, tab) => {
    if (tabId !== activeSiteTab?.id || !change.url) return;
    activeSiteTab = tab;
    const site = AuroraExt.sites.fromUrl(tab.url);
    if (site && site.id === selectedSite.id) refreshSiteControls();
  });
  await refreshSiteControls();
}

function filterSiteControls() {
  const site = selectedSite;
  const context = { url: siteState.url || (AuroraExt.sites.fromUrl(activeSiteTab?.url)?.id === site.id ? activeSiteTab.url : undefined), capabilities: siteState.capabilities };
  [...TOGGLE_KEYS, 'defaultModel', 'voiceColor'].forEach(key => {
    const el = document.getElementById(key) || document.getElementById(`${key}Selector`);
    const row = el?.closest('.row');
    if (row) row.dataset.siteUnsupported = String(!AuroraExt.sites.supports(site, key, context) || (key === 'defaultModel' && site.id !== 'chatgpt') || (key === 'maskingRandomMode' && !currentSettings.dataMaskingEnabled) || (key === 'autoContrast' && ['__pure_black__', '__gpt5_animated__', ...Object.keys(SCENIC_BACKGROUNDS)].includes(currentSettings.customBgUrl)));
  });
  document.getElementById('siteDefaultModelRow').dataset.siteUnsupported = String(site.id === 'chatgpt' || !AuroraExt.sites.supports(site, 'defaultModel', context));
  document.getElementById('soundVolume')?.closest('.row')?.setAttribute('data-site-unsupported', String(!currentSettings.soundEnabled));
  $.panes?.forEach(pane => {
    const available = [...pane.querySelectorAll('.row')].some(row => row.dataset.siteUnsupported !== 'true' && !row.hidden);
    document.querySelector(`.tab-link[data-tab="${pane.id}"]`)?.setAttribute('data-site-unsupported', String(!available));
  });
  updateSectionVisibility();
  buildSearchableData();
  if ($.settingsSearch?.value) handleSearch();
  else if (document.querySelector('.tab-link.active')?.dataset.siteUnsupported === 'true') document.querySelector('.tab-link:not([data-site-unsupported="true"])')?.click();
}

function updateSectionVisibility() {
  document.querySelectorAll('.section-header').forEach(header => {
    let sibling = header.nextElementSibling;
    let available = false;
    while (sibling && !sibling.classList.contains('section-header')) {
      if (sibling.classList.contains('row') && sibling.dataset.siteUnsupported !== 'true' && !sibling.classList.contains('is-hidden') && !sibling.hidden) available = true;
      sibling = sibling.nextElementSibling;
    }
    header.dataset.siteUnsupported = String(!available);
  });
}

async function refreshSiteControls() {
  const revision = ++siteRequestRevision;
  const site = selectedSite;
  closeAllSelects();
  siteState = { models: [], currentModel: '' };
  renderSiteSettings();
  filterSiteControls();
  try {
    const key = `modelCatalog:${site.id}`;
    const stored = await chrome.storage.local.get(key);
    if (revision !== siteRequestRevision) return;
    siteState.models = Array.isArray(stored[key]) ? stored[key] : [];
    renderSiteSettings();
    const tabs = await chrome.tabs.query({ url: site.matches });
    const tab = tabs.find(item => item.id === activeSiteTab?.id) || tabs.find(item => item.active) || tabs[0];
    if (!tab) return;
    const snapshot = await chrome.tabs.sendMessage(tab.id, { type: 'GET_SITE_STATE' });
    if (revision !== siteRequestRevision || snapshot?.site !== site.id) return;
    siteState = snapshot;
    renderSiteSettings();
    filterSiteControls();
  } catch { /* Saved model choices also work while a site is closed. */ }
}

function renderSiteSettings() {
  const enabled = document.getElementById('siteEnabled');
  if (enabled) enabled.checked = !(Array.isArray(currentSettings.disabledSites) && currentSettings.disabledSites.includes(selectedSite.id));
  const select = document.getElementById('siteDefaultModel');
  if (!select) return;
  const chosen = currentSettings.siteDefaultModels?.[selectedSite.id] || '';
  const names = [...new Set([...(siteState.models || []), siteState.currentModel, chosen])]
    .filter(name => typeof name === 'string' && name && name.length <= 120).slice(0, 34);
  select.replaceChildren(new Option(getMessage('defaultModelOptionNone'), ''), ...names.map(name => new Option(name, name)));
  select.value = chosen;
  const current = document.getElementById('useCurrentModel');
  current.hidden = !siteState.currentModel || siteState.currentModel === chosen;
  current.disabled = !siteState.currentModel || siteState.currentModel === chosen;
  current.title = siteState.currentModel || getMessage('openSiteForModel');
}

function hydrateWithRealData(settings, localData) {
  document.querySelector('main').inert = false;
  // Re-render with actual user data
  renderUi(settings, localData);
  
  // Attach event listeners ONCE (after real data is loaded)
  if (!listenersAttached) {
    setupChangeListeners();
    setupImportExport();
    listenersAttached = true;
  }
  
  // Build search index in idle time (low priority, non-blocking)
  if (window.requestIdleCallback) {
    requestIdleCallback(buildSearchableData, { timeout: 2000 });
  } else {
    setTimeout(buildSearchableData, 300);
  }
}

// --- Element Caching (Run once, eliminates all getElementById calls) ---
function cacheElements() {
  // Toggle elements
  TOGGLE_KEYS.forEach(key => { $.toggles = $.toggles || {}; $.toggles[key] = document.getElementById(key); });
  
  // Individual elements
  $.blurSlider = document.getElementById('blurSlider');
  $.blurValue = document.getElementById('blurValue');
  $.glassControl = AuroraExt.glassControl.create('glassIntensitySlider', DEFAULTS, patch => {
    currentSettings = { ...currentSettings, ...patch };
    AuroraExt.popupPreview.apply(currentSettings, document.documentElement.classList.contains('theme-light'));
  }, patch => saveSettings(patch));
  document.getElementById('glassControlHost').append($.glassControl);
  $.bgUrl = document.getElementById('bgUrl');
  $.bgFile = document.getElementById('bgFile');
  $.clearBg = document.getElementById('clearBg');
  $.settingsSearch = document.getElementById('settingsSearch');
  $.clearSearchBtn = document.getElementById('clearSearchBtn');
  $.exportSettings = document.getElementById('exportSettings');
  $.importSettings = document.getElementById('importSettings');
  $.settingsJson = document.getElementById('settingsJson');
  $.importExportRow = document.getElementById('importExportTextAreaRow');
  $.masterToggleBtn = document.getElementById('masterToggleBtn');
  
  // Collections (cached once)
  $.tabs = document.querySelectorAll('.tab-link');
  $.panes = document.querySelectorAll('.tab-pane');
  $.tabNav = document.querySelector('.tab-nav');
  $.i18nElements = document.querySelectorAll('[data-i18n]');
  $.i18nPlaceholders = document.querySelectorAll('[data-i18n-placeholder]');
  $.i18nTitles = document.querySelectorAll('[data-i18n-title]');
  $.i18nAriaLabels = document.querySelectorAll('[data-i18n-aria-label]');
  $.rows = document.querySelectorAll('.row');
  
  // Custom selects (containers)
  $.selects = {
    bgPreset: document.getElementById('bgPreset'),
    bgScalingSelector: document.getElementById('bgScalingSelector'),
    themeSelector: document.getElementById('themeSelector'),
    fontSelector: document.getElementById('fontSelector'),
    voiceColorSelector: document.getElementById('voiceColorSelector'),
    defaultModelSelector: document.getElementById('defaultModelSelector')
  };
}

// --- Core Rendering Logic (Optimized) ---
function renderUi(stored, localData = {}) {
  storedSettings = stored;
  detectedThemes = localData;
  const settings = AuroraExt.preferences.resolve(stored, selectedSite.id);
  currentSettings = settings;
  renderSiteSettings();
  filterSiteControls();
  // Theme Toggle
  let isLightTheme = settings.theme === 'light';
  if (settings.theme === 'auto') {
    isLightTheme = (localData[`detectedTheme:${selectedSite.id}`] ||
      (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')) === 'light';
  }
  AuroraExt.popupPreview.apply(settings, isLightTheme);

  // Boolean Toggles (uses cached elements)
  TOGGLE_KEYS.forEach(key => {
    const el = $.toggles?.[key];
    if (el) el.checked = !!settings[key];
  });

  if ($.masterToggleBtn) {
    const isEnabled = settings.extensionEnabled !== false;
    const label = isEnabled ? (getMessage('labelAuroraActivated') || 'Aurora activated') : (getMessage('labelAuroraDeactivated') || 'Aurora deactivated');
    $.masterToggleBtn.textContent = label;
    $.masterToggleBtn.dataset.state = isEnabled ? 'enabled' : 'disabled';
    $.masterToggleBtn.setAttribute('aria-pressed', String(!isEnabled));
  }

  // Range Sliders
  if ($.blurSlider && $.blurValue) {
    $.blurSlider.value = settings.backgroundBlur;
    $.blurValue.textContent = settings.backgroundBlur;
  }
  $.glassControl?.syncGlass(settings);

  // Text Inputs
  if ($.bgUrl) {
    if (SCENIC_BACKGROUNDS[settings.customBgUrl]) {
      $.bgUrl.value = getMessage(SCENIC_BACKGROUNDS[settings.customBgUrl]);
      $.bgUrl.disabled = true;
    } else if (settings.customBgUrl === '__space__') {
      $.bgUrl.value = getMessage('bgPresetOptionSpace') || 'Space';
      $.bgUrl.disabled = true;
    } else if (settings.customBgUrl === '__gpt5_animated__') {
      $.bgUrl.value = getMessage('statusAnimatedBackground') || 'Animated Active';
      $.bgUrl.disabled = true;
    } else if (settings.customBgUrl === '__local__') {
      $.bgUrl.value = getMessage('statusLocalFileInUse') || 'Local File Active';
      $.bgUrl.disabled = true;
    } else if (document.activeElement !== $.bgUrl) {
      const presets = [GROK_HORIZON_URL, PURE_BLACK_BACKGROUND];
      $.bgUrl.value = presets.includes(settings.customBgUrl) ? '' : settings.customBgUrl;
      $.bgUrl.disabled = false;
    }
  }

  // Initialize/Update Custom Selects (Optimized: builds once, updates only values)
  initOrUpdateSelects(settings);
  const soundVolume = document.getElementById('soundVolume');
  if (soundVolume) soundVolume.value = settings.soundVolume || 'low';
}

// --- Custom Selects (Single-Pass Initialization) ---
const SELECT_CONFIGS = [
  {
    id: 'bgPreset', key: 'customBgUrl',
    options: [
      { value: 'default', labelKey: 'bgPresetOptionDefault' },
      { value: PURE_BLACK_BACKGROUND, label: 'Pure Black' },
      { value: '__space__', labelKey: 'bgPresetOptionSpace' },
      { value: '__gpt5_animated__', labelKey: 'bgPresetOptionGpt5Animated' },
      { value: 'grokHorizon', labelKey: 'bgPresetOptionGrokHorizon' },
      ...Object.entries(SCENIC_BACKGROUNDS).map(([value, labelKey]) => ({ value, labelKey })),
      { value: 'custom', labelKey: 'bgPresetOptionCustom', hidden: true }
    ],
    mapVal: (v) => {
      if (!v) return 'default';
      if (SCENIC_BACKGROUNDS[v]) return v;
      if (v === GROK_HORIZON_URL) return 'grokHorizon';
      if (v === PURE_BLACK_BACKGROUND) return PURE_BLACK_BACKGROUND;
      if (v === '__space__') return '__space__';
      if (v === '__gpt5_animated__') return '__gpt5_animated__';
      return 'custom';
    },
    onSelect: (val) => {
      let url = '';
      if (SCENIC_BACKGROUNDS[val]) url = val;
      else if (val === 'grokHorizon') url = GROK_HORIZON_URL;
      else if (val === PURE_BLACK_BACKGROUND) url = PURE_BLACK_BACKGROUND;
      else if (val === '__space__') url = '__space__';
      else if (val === '__gpt5_animated__') url = '__gpt5_animated__';
      // Space preserves the uploaded background and changes only the selection.
      saveSettings({ customBgUrl: url });
    }
  },
  {
    id: 'bgScalingSelector', key: 'backgroundScaling',
    options: [
      { value: 'contain', labelKey: 'bgScalingOptionContain' },
      { value: 'cover', labelKey: 'bgScalingOptionCover' }
    ]
  },
  {
    id: 'themeSelector', key: 'theme',
    options: [
      { value: 'auto', labelKey: 'themeOptionAuto' },
      { value: 'light', labelKey: 'themeOptionLight' },
      { value: 'dark', labelKey: 'themeOptionDark' }
    ]
  },
  {
    id: 'fontSelector', key: 'customFont',
    options: [
      { value: 'system', labelKey: 'fontOptionSystem' },
      { value: 'inter', labelKey: 'fontOptionInter' },
      { value: 'roboto', labelKey: 'fontOptionRoboto' },
      { value: 'montserrat', labelKey: 'fontOptionMontserrat' },
      { value: 'opensans', labelKey: 'fontOptionOpenSans' },
      { value: 'poppins', labelKey: 'fontOptionPoppins' },
      { value: 'firacode', labelKey: 'fontOptionFiraCode', label: 'Fira Code (Dev)' }
    ]
  },
  {
    id: 'voiceColorSelector', key: 'voiceColor',
    options: [
      { value: 'default', labelKey: 'voiceColorOptionDefault', color: '#8EBBFF' },
      { value: 'orange', labelKey: 'voiceColorOptionOrange', color: '#FF9900' },
      { value: 'yellow', labelKey: 'voiceColorOptionYellow', color: '#FFD700' },
      { value: 'pink', labelKey: 'voiceColorOptionPink', color: '#FF69B4' },
      { value: 'green', labelKey: 'voiceColorOptionGreen', color: '#32CD32' },
      { value: 'dark', labelKey: 'voiceColorOptionDark', color: '#555555' }
    ]
  },
  {
    id: 'defaultModelSelector', key: 'defaultModel',
    options: [
      { value: '', labelKey: 'defaultModelOptionNone' },
      { value: 'gpt-5.5-instant', label: 'GPT-5.5 Instant' },
      { value: 'gpt-5.6-sol-medium', label: 'GPT-5.6 Sol Medium' },
      { value: 'gpt-5.6-sol-high', label: 'GPT-5.6 Sol High' }
    ]
  }
];

function initOrUpdateSelects(settings) {
  SELECT_CONFIGS.forEach(cfg => {
    const container = $.selects[cfg.id];
    if (!container) return;
    
    const trigger = container.querySelector('.select-trigger');
    const label = container.querySelector('.select-label');
    const optsContainer = container.querySelector('.select-options');
    const dot = trigger?.querySelector('.color-dot');
    
    if (!trigger || !optsContainer) return;
    
    const val = settings[cfg.key];
    const effectiveVal = cfg.mapVal ? cfg.mapVal(val) : val;
    const activeOpt = cfg.options.find(o => o.value === effectiveVal) || cfg.options[0];
    
    // Update trigger label
    if (label) {
      label.textContent = activeOpt.labelKey ? getMessage(activeOpt.labelKey) : (activeOpt.label || activeOpt.value);
    }
    
    // Update color dot if present
    if (dot) {
      dot.style.display = activeOpt.color ? 'block' : 'none';
      if (activeOpt.color) dot.style.backgroundColor = activeOpt.color;
    }
    
    // Build options ONLY ONCE (check if already built)
    if (!container.dataset.built) {
      container.dataset.built = 'true';
      
      // Build option nodes without interpreting labels or values as markup.
      const optionNodes = cfg.options.filter(o => !o.hidden).map(opt => {
        const txt = opt.labelKey ? getMessage(opt.labelKey) : (opt.label || opt.value);
        const optionEl = document.createElement('div');
        optionEl.className = 'select-option';
        optionEl.setAttribute('role', 'option');
        optionEl.tabIndex = -1;
        optionEl.dataset.value = opt.value;

        if (opt.color) {
          const optionDot = document.createElement('span');
          optionDot.className = 'color-dot';
          optionDot.style.backgroundColor = opt.color;
          optionDot.style.display = 'block';
          optionEl.appendChild(optionDot);
        }

        const optionLabel = document.createElement('span');
        optionLabel.textContent = txt;
        optionEl.appendChild(optionLabel);
        return optionEl;
      });
      optsContainer.replaceChildren(...optionNodes);
      optsContainer.id ||= `${cfg.id}-options`;
      trigger.setAttribute('aria-controls', optsContainer.id);
      const focusOption = () => (optsContainer.querySelector('[aria-selected="true"]') || optionNodes[0])?.focus();
      trigger.addEventListener('keydown', event => {
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
        event.preventDefault();
        trigger.click();
        focusOption();
      });
      optsContainer.addEventListener('keydown', event => {
        const index = optionNodes.indexOf(document.activeElement);
        let next = index;
        if (event.key === 'ArrowDown') next = (index + 1) % optionNodes.length;
        else if (event.key === 'ArrowUp') next = (index - 1 + optionNodes.length) % optionNodes.length;
        else if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = optionNodes.length - 1;
        else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); document.activeElement.click(); trigger.focus(); return; }
        else if (event.key === 'Escape') { event.preventDefault(); closeAllSelects(); trigger.focus(); return; }
        else if (event.key === 'Tab') { closeAllSelects(); return; }
        else return;
        event.preventDefault();
        optionNodes[next]?.focus();
      });
      
      // Attach trigger click listener ONCE
      trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const wasOpen = container.classList.contains('is-open');
        closeAllSelects();
        if (wasOpen) return;
        container.classList.add('is-open');
        optsContainer.style.display = 'block';
        trigger.setAttribute('aria-expanded', 'true');
        positionSelectOptions(trigger, optsContainer);
        focusOption();
      });
      
      // Attach option click listeners ONCE using event delegation
      optsContainer.addEventListener('click', (e) => {
        const option = e.target.closest('.select-option');
        if (!option) return;
        
        const selectedVal = option.dataset.value;
        if (cfg.onSelect) {
          cfg.onSelect(selectedVal);
        } else {
          saveSettings({ [cfg.key]: selectedVal });
        }
        
        // Update label immediately (optimistic)
        if (label) label.textContent = option.textContent.trim();
        closeAllSelects();
      });
    }
    
    // Update selected state on options
    optsContainer.querySelectorAll('.select-option').forEach(el => {
      el.setAttribute('aria-selected', el.dataset.value === effectiveVal);
    });
  });
}

function closeAllSelects() {
  Object.values($.selects).forEach(el => {
    if (!el) return;
    el.classList.remove('is-open');
    const opts = el.querySelector('.select-options');
    if (opts) {
      opts.style.display = 'none';
      opts.style.maxHeight = '';
      opts.classList.remove('open-up');
    }
    const trigger = el.querySelector('.select-trigger');
    if (trigger) trigger.setAttribute('aria-expanded', 'false');
  });
}

function positionSelectOptions(trigger, options) {
  requestAnimationFrame(() => {
    const triggerRect = trigger.getBoundingClientRect();
    const spaceBelow = window.innerHeight - triggerRect.bottom - 8;
    const spaceAbove = triggerRect.top - 8;
    const preferredHeight = Math.min(options.scrollHeight, 240);
    const openUp = spaceBelow < Math.min(preferredHeight, 120) && spaceAbove > spaceBelow;
    const availableSpace = Math.max(96, Math.floor((openUp ? spaceAbove : spaceBelow) - 4));

    options.classList.toggle('open-up', openUp);
    options.style.maxHeight = `${Math.min(preferredHeight, availableSpace)}px`;
    options.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  });
}

// Close selects on outside click
document.addEventListener('click', closeAllSelects);

// --- Event Listeners (Setup ONCE) ---
function setupChangeListeners() {
  document.getElementById('soundVolume')?.addEventListener('change', event => saveSettings({ soundVolume: event.target.value }));
  // Toggles - event delegation on body
  TOGGLE_KEYS.forEach(key => {
    const el = $.toggles?.[key];
    if (el) {
      el.addEventListener('change', () => {
        currentSettings = { ...currentSettings, [key]: el.checked };
        filterSiteControls();
        saveSettings({ [key]: el.checked });
      });
    }
  });

  if ($.masterToggleBtn) {
    $.masterToggleBtn.addEventListener('click', () => {
      saveSettings({ extensionEnabled: $.masterToggleBtn.dataset.state === 'disabled' });
    });
  }

  // Slider with debounce
  if ($.blurSlider) {
    let sliderTimeout;
    $.blurSlider.addEventListener('input', () => {
      $.blurValue.textContent = $.blurSlider.value;
      currentSettings = { ...currentSettings, backgroundBlur: $.blurSlider.value };
      AuroraExt.popupPreview.apply(currentSettings, document.documentElement.classList.contains('theme-light'));
      clearTimeout(sliderTimeout);
      const site = selectedSite.id;
      const scope = siteSelectedByUser ? 'site' : 'auto';
      const value = $.blurSlider.value;
      sliderTimeout = setTimeout(() => {
        saveSettings({ backgroundBlur: value }, site, scope);
      }, 150);
    });
  }


  // BG URL
  if ($.bgUrl) {
    $.bgUrl.addEventListener('change', () => {
      const val = $.bgUrl.value.trim();
      saveSettings({ customBgUrl: val });
    });
  }

  // BG File
  if ($.bgFile) {
    $.bgFile.addEventListener('click', () => {
      const uploadUrl = `${chrome.runtime.getURL('background-upload.html')}?site=${encodeURIComponent(selectedSite.id)}&scope=${siteSelectedByUser ? 'site' : 'auto'}`;
      chrome.tabs.create({ url: uploadUrl }, () => {
        if (chrome.runtime.lastError) {
          window.open(uploadUrl, '_blank');
        }
      });
    });
  }

  // Reset
  if ($.clearBg) {
    $.clearBg.addEventListener('click', () => {
      saveSettings({
        customBgUrl: DEFAULTS.customBgUrl,
        customBgDataKey: DEFAULTS.customBgDataKey,
        backgroundBlur: DEFAULTS.backgroundBlur,
        backgroundScaling: DEFAULTS.backgroundScaling
      });
      if ($.blurSlider) {
        $.blurSlider.value = DEFAULTS.backgroundBlur;
        $.blurValue.textContent = DEFAULTS.backgroundBlur;
      }
      if ($.bgUrl) $.bgUrl.value = '';
    });
  }

  // Search with debounce
  if ($.settingsSearch) {
    let searchTimeout;
    $.settingsSearch.addEventListener('input', () => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(handleSearch, 50);
    });
    if ($.clearSearchBtn) {
      $.clearSearchBtn.addEventListener('click', () => {
        $.settingsSearch.value = '';
        handleSearch();
        $.settingsSearch.focus();
      });
    }
  }
}

// --- Static Setup Functions ---
function applyLocalization() {
  $.i18nElements?.forEach(el => el.textContent = getMessage(el.dataset.i18n));
  $.i18nPlaceholders?.forEach(el => el.placeholder = getMessage(el.dataset.i18nPlaceholder));
  $.i18nTitles?.forEach(el => el.title = getMessage(el.dataset.i18nTitle));
  $.i18nAriaLabels?.forEach(el => el.setAttribute('aria-label', getMessage(el.dataset.i18nAriaLabel)));
}

function setupTabs() {
  $.tabs?.forEach(tab => {
    tab.addEventListener('click', () => {
      closeAllSelects();
      $.tabs.forEach(t => t.classList.remove('active'));
      $.panes.forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      const target = document.getElementById(tab.dataset.tab);
      if (target) target.classList.add('active');
    });
  });
}

function buildSearchableData() {
  searchableData = [];
  $.panes?.forEach(pane => {
    const tabName = document.querySelector(`.tab-link[data-tab="${pane.id}"]`)?.textContent || '';
    pane.querySelectorAll('.row').forEach(row => {
      if (row.dataset.siteUnsupported === 'true') return;
      const label = row.querySelector('.label')?.textContent || row.textContent || '';
      const keywords = (tabName + ' ' + label + ' ' + (row.querySelector('[title]')?.title || '')).toLowerCase();
      searchableData.push({ element: row, tabId: pane.id, keywords });
    });
  });
}

function handleSearch() {
  const query = $.settingsSearch?.value.toLowerCase().trim() || '';
  if ($.clearSearchBtn) $.clearSearchBtn.hidden = !query;

  if (!query) {
    if ($.tabNav) $.tabNav.hidden = false;
    $.panes?.forEach(p => p.classList.remove('active'));
    $.tabs?.forEach(t => t.classList.remove('active', 'is-hidden'));
    $.rows?.forEach(r => r.classList.remove('is-hidden'));
    document.querySelector('.tab-link:not([data-site-unsupported="true"])')?.click();
    updateSectionVisibility();
    return;
  }

  if ($.tabNav) $.tabNav.hidden = false;
  const matchedTabIds = new Set();

  searchableData.forEach(item => {
    const match = item.keywords.includes(query);
    item.element.classList.toggle('is-hidden', !match);
    if (match) matchedTabIds.add(item.tabId);
  });

  $.tabs?.forEach(tab => {
    tab.classList.toggle('is-hidden', !matchedTabIds.has(tab.dataset.tab));
  });

  const first = document.querySelector('.tab-link:not(.is-hidden):not([data-site-unsupported="true"])');
  if (first) first.click();
  updateSectionVisibility();
}

// --- Import/Export ---
function setupImportExport() {
  if ($.exportSettings) {
    $.exportSettings.addEventListener('click', () => {
      chrome.storage.sync.get(null, (items) => {
        $.settingsJson.value = JSON.stringify(items, null, 2);
        $.importExportRow.hidden = false;
        navigator.clipboard.writeText($.settingsJson.value);
        $.exportSettings.textContent = getMessage('buttonCopied') || 'Copied!';
        setTimeout(() => $.exportSettings.textContent = getMessage('buttonExportSettings') || 'Export', 2000);
      });
    });
  }

  if ($.importSettings) {
    $.importSettings.addEventListener('click', () => {
      if ($.importExportRow.hidden) {
        $.importExportRow.hidden = false;
        $.settingsJson?.focus();
        return;
      }
      try {
        const parsed = JSON.parse($.settingsJson.value);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('settings');
        const data = {};
        for (const [key, initial] of Object.entries(DEFAULTS)) {
          const value = parsed[key];
          if (value !== undefined && typeof value === typeof initial && value !== null) data[key] = value;
        }
        if (data.disabledSites) data.disabledSites = AuroraExt.sites.all.filter(site => Array.isArray(data.disabledSites) && data.disabledSites.includes(site.id)).map(site => site.id);
        if (data.siteDefaultModels) data.siteDefaultModels = Object.fromEntries(AuroraExt.sites.all.filter(site => typeof data.siteDefaultModels[site.id] === 'string').map(site => [site.id, data.siteDefaultModels[site.id].slice(0, 120)]));
        for (const site of AuroraExt.sites.all) {
          const key = AuroraExt.preferences.siteKey(site.id);
          if (parsed[key]) data[key] = AuroraExt.preferences.pickSiteSettings(parsed[key]);
        }
        chrome.storage.sync.set(data, () => {
          $.importSettings.textContent = 'Imported!';
          setTimeout(() => {
            $.importSettings.textContent = getMessage('buttonImportSettings') || 'Import';
            $.importExportRow.hidden = true;
            location.reload();
          }, 1000);
        });
      } catch (e) {
        alert('Invalid JSON');
      }
    });
  }
}

// --- Live Storage Listener (Keep popup in sync) ---
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[currentSettings.customBgDataKey || 'customBgData']) {
    AuroraExt.popupPreview.apply(currentSettings, document.documentElement.classList.contains('theme-light'), true);
  }
  if (area === 'sync' || (area === 'local' && Object.keys(changes).some(key => key.startsWith('detectedTheme:')))) {
    chrome.runtime.sendMessage({ type: 'GET_SETTINGS_FULL' }, (response) => {
      if (response && !chrome.runtime.lastError) {
        const { settings, local } = response;
        renderUi(settings || DEFAULTS, local || {});
      }
    });
  }
});
