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
  'blurAvatar', 'soundEnabled', 'dataMaskingEnabled',
  'maskingRandomMode', 'autoContrast', 'cuteVoiceUI', 'cinemaMode', 'glassUserMessages', 'geminiBloom'
];

// --- Element Cache (populated once on DOMContentLoaded) ---
const $ = {};
let listenersAttached = false;
let selectedSite = AuroraExt.sites.all[0];
let activeSiteTab = null;
let currentSettings = DEFAULTS;
let materialDraft = {};
let storedSettings = DEFAULTS;
let detectedThemes = {};
let siteSelectedByUser = false;
let siteState = { models: [], currentModel: '' };
let siteRequestRevision = 0;

// --- Helpers ---
const getMessage = (key, substitutions) => chrome?.i18n?.getMessage(key, substitutions) || key;

function saveSettings(patch, site = selectedSite.id, scope = siteSelectedByUser ? 'site' : 'auto') {
  return AuroraExt.preferences.save(patch, site, undefined, scope).then(result => {
    if (site === selectedSite.id) for (const [key, value] of Object.entries(patch)) {
      if (materialDraft[key] === value) delete materialDraft[key];
      if (previewPatch[key] === value) delete previewPatch[key];
    }
    if (result?.settings) renderUi(result.settings, detectedThemes);
    return result;
  });
}

// Keep one connection per open website. Pointer input updates the material once
// per frame without querying every tab or writing storage on every movement.
let previewFrame = 0;
let previewPatch = {};
let previewTargets;
let previewEpoch = 0;
function resetMaterialPreview() {
  previewEpoch += 1;
  if (previewFrame) cancelAnimationFrame(previewFrame);
  previewFrame = 0;
  previewPatch = {};
  materialDraft = {};
  const previous = previewTargets;
  previewTargets = null;
  previous?.then(targets => targets.forEach(({ port }) => port.disconnect()));
}
function previewMaterial(patch) {
  Object.assign(materialDraft, patch);
  Object.assign(previewPatch, patch);
  if (previewFrame) return;
  const epoch = previewEpoch;
  previewFrame = requestAnimationFrame(async () => {
    previewFrame = 0;
    previewTargets ||= chrome.tabs.query({}).then(tabs => tabs.flatMap(tab => {
      const site = AuroraExt.sites.fromUrl(tab.url);
      if (!site || !tab.id) return [];
      const target = { site, alive: true, port: chrome.tabs.connect(tab.id, { name: 'AURORA_PREVIEW_MATERIAL' }) };
      target.port.onDisconnect.addListener(() => { target.alive = false; });
      return [target];
    })).catch(() => []);
    const targets = await previewTargets;
    if (epoch !== previewEpoch) return;
    const scope = siteSelectedByUser ? 'site' : 'auto';
    const planned = { ...storedSettings, ...AuroraExt.preferences.planSettings(storedSettings, selectedSite.id, previewPatch, scope) };
    for (const target of targets) {
      if (!target.alive) continue;
      const resolved = AuroraExt.preferences.resolve(planned, target.site.id);
      const message = { site: target.site.id };
      for (const key of Object.keys(previewPatch)) message[key] = resolved[key];
      try { target.port.postMessage(message); } catch { target.alive = false; }
    }
  });
}

const themePreviews = [];
function syncBackgroundBlurControl() {
  if (!$.blurSlider) return;
  const manager = AuroraExt.background.manager;
  const kind = manager.currentUrl === (currentSettings.customBgUrl || '')
    ? manager.getActiveLayer()?.dataset.backgroundKind
    : AuroraExt.preferences.backgroundKind(currentSettings.customBgUrl);
  const key = kind === 'motion' ? 'motionBackgroundBlur' : 'backgroundBlur';
  $.blurSlider.dataset.setting = key;
  const value = AuroraExt.preferences.blurRadius(currentSettings[key], key === 'motionBackgroundBlur' ? 0 : 50);
  $.blurSlider.value = value;
  $.blurValue.textContent = value;
  $.blurRange?.syncRange();
}
document.addEventListener('aurora-background-ready', syncBackgroundBlurControl);

let previewViewport = { width: window.screen.availWidth || 1920, height: window.screen.availHeight || 1080 };
function updateThemePreviews() {
  const viewport = siteState.viewport || previewViewport;
  const width = Math.max(1, Number(viewport.width) || previewViewport.width);
  const height = Math.max(1, Number(viewport.height) || previewViewport.height);
  previewViewport = { width, height };
  const layouts = themePreviews.map(({ thumbnail, scene }) => ({ scene, rect: thumbnail.getBoundingClientRect() }));
  for (const { scene, rect } of layouts) {
    if (!rect.width || !rect.height) continue;
    const scale = Math.max(rect.width / width, rect.height / height);
    scene.style.setProperty('--preview-width', `${width}px`);
    scene.style.setProperty('--preview-height', `${height}px`);
    scene.style.setProperty('--preview-scale', String(scale));
    scene.style.setProperty('--aurora-scene-vw', `${width / 100}px`);
    scene.style.setProperty('--aurora-scene-vh', `${height / 100}px`);
    scene.style.setProperty('--aurora-scene-vmax', `${Math.max(width, height) / 100}px`);
    scene.style.setProperty('--cgpt-object-fit', currentSettings.backgroundScaling === 'contain' ? 'contain' : 'cover');
    scene.refresh();
  }
}
function createThemePreviews() {
  for (const button of document.querySelectorAll('#themeGrid .theme-choice')) {
    const thumbnail = button.querySelector('.theme-thumbnail');
    const url = button.dataset.themeValue === 'grokHorizon' ? GROK_HORIZON_URL : button.dataset.themeValue;
    const scene = AuroraExt.background.createThemePreview(url);
    thumbnail.replaceChildren(scene);
    themePreviews.push({ thumbnail, scene });
  }
  updateThemePreviews();
  for (const { scene } of themePreviews) scene.prepare().catch(error => console.error('Theme preview could not load', error));
  const observer = new ResizeObserver(updateThemePreviews);
  for (const { thumbnail } of themePreviews) observer.observe(thumbnail);
  window.addEventListener('pagehide', () => observer.disconnect(), { once: true });
}
function applyPopupAppearance(refreshUpload = false) {
  AuroraExt.popupPreview.apply(currentSettings, refreshUpload);
  updateThemePreviews();
}
document.addEventListener('aurora-background-palette', updateThemePreviews);

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
  upgradeNativeSelects();
  const siteScopeReady = applySiteScope();
  
  setupTabs();
  
  renderUi(DEFAULTS, {});
  createThemePreviews();
  
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
    resetMaterialPreview();
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
    updateThemePreviews();
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
  initOrUpdateSelects(currentSettings);
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
  $.blurRange = AuroraExt.glassControl.styleRange($.blurSlider);
  $.glassControl = AuroraExt.glassControl.create('glassIntensitySlider', DEFAULTS, patch => {
    currentSettings = { ...currentSettings, ...patch };
    applyPopupAppearance();
    previewMaterial(patch);
  }, patch => { previewMaterial(patch); saveSettings(patch); });
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
    bgScalingSelector: document.getElementById('bgScalingSelector'),
    fontSelector: document.getElementById('fontSelector'),
    voiceColorSelector: document.getElementById('voiceColorSelector'),
    defaultModelSelector: document.getElementById('defaultModelSelector')
  };
}

// --- Core Rendering Logic (Optimized) ---
function renderUi(stored, localData = {}) {
  storedSettings = stored;
  detectedThemes = localData;
  const settings = { ...AuroraExt.preferences.resolve(stored, selectedSite.id), ...materialDraft };
  currentSettings = settings;
  renderSiteSettings();
  filterSiteControls();
  applyPopupAppearance();

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
  syncBackgroundBlurControl();
  $.glassControl?.syncGlass(settings);

  // Keep the URL field available for a custom source regardless of the selected theme.
  if ($.bgUrl && document.activeElement !== $.bgUrl) {
    const value = settings.customBgUrl || '';
    $.bgUrl.value = value.startsWith('__') || value === GROK_HORIZON_URL ? '' : value;
  }

  document.querySelectorAll('#themeGrid .theme-choice').forEach(button => {
    const value = button.dataset.themeValue === 'grokHorizon' ? GROK_HORIZON_URL : button.dataset.themeValue;
    button.setAttribute('aria-pressed', String(value === settings.customBgUrl));
  });

  // Initialize/Update Custom Selects (Optimized: builds once, updates only values)
  const soundVolume = document.getElementById('soundVolume');
  if (soundVolume) soundVolume.value = settings.soundVolume || 'low';
  initOrUpdateSelects(settings);
}

// --- Custom Selects (Single-Pass Initialization) ---
const SELECT_CONFIGS = [
  { id: 'bgScalingSelector', key: 'backgroundScaling', options: [
    { value: 'contain', labelKey: 'bgScalingOptionContain' },
    { value: 'cover', labelKey: 'bgScalingOptionCover' }
  ] },
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

function upgradeNativeSelects() {
  for (const nativeId of ['websiteSelect', 'siteDefaultModel', 'soundVolume']) {
    const native = document.getElementById(nativeId);
    if (!native) continue;
    const container = $.selects.fontSelector.cloneNode(true);
    container.id = `${nativeId}Menu`;
    const wrapper = document.createElement('div');
    wrapper.className = 'custom-select-wrapper';
    wrapper.appendChild(container);
    native.after(wrapper);
    const title = native.labels?.[0]?.textContent || native.getAttribute('aria-label') || nativeId;
    const trigger = container.querySelector('.select-trigger');
    trigger.id = `${nativeId}Trigger`;
    trigger.setAttribute('aria-label', title);
    trigger.removeAttribute('data-i18n-aria-label');
    const options = container.querySelector('.select-options');
    options.setAttribute('aria-label', title);
    options.removeAttribute('data-i18n-aria-label');
    native.classList.add('sr-only');
    native.tabIndex = -1;
    native.setAttribute('aria-hidden', 'true');
    for (const label of native.labels || []) label.addEventListener('click', event => {
      event.preventDefault();
      trigger.focus();
    });
    $.selects[container.id] = container;
    SELECT_CONFIGS.push({ id: container.id, nativeId, options: [] });
  }
}

function initOrUpdateSelects(settings) {
  SELECT_CONFIGS.forEach(cfg => {
    const container = $.selects[cfg.id];
    if (!container) return;
    const native = cfg.nativeId && document.getElementById(cfg.nativeId);
    if (native) cfg.options = [...native.options].map(option => ({ value: option.value, label: option.textContent }));
    const trigger = container.querySelector('.select-trigger');
    const label = container.querySelector('.select-label');
    const options = container.querySelector('.select-options');
    const dot = trigger.querySelector('.color-dot');
    const value = native ? native.value : settings[cfg.key];
    const active = cfg.options.find(option => option.value === value) || cfg.options[0];
    const optionText = option => option.labelKey ? getMessage(option.labelKey) : (option.label || option.value);
    label.textContent = active ? optionText(active) : '';
    trigger.disabled = !!native?.disabled;
    if (dot) {
      dot.style.display = active?.color ? 'block' : 'none';
      if (active?.color) dot.style.backgroundColor = active.color;
    }
    const signature = JSON.stringify(cfg.options);
    if (container.dataset.options !== signature) {
      container.dataset.options = signature;
      options.replaceChildren(...cfg.options.map(option => {
        const node = document.createElement('div');
        node.className = 'select-option';
        node.setAttribute('role', 'option');
        node.tabIndex = -1;
        node.dataset.value = option.value;
        if (option.color) {
          const color = document.createElement('span');
          color.className = 'color-dot';
          color.style.backgroundColor = option.color;
          color.style.display = 'block';
          node.append(color);
        }
        const text = document.createElement('span');
        text.textContent = optionText(option);
        node.append(text);
        return node;
      }));
    }
    for (const option of options.children) option.setAttribute('aria-selected', String(option.dataset.value === value));
    if (container.dataset.built) return;
    container.dataset.built = 'true';
    options.id = `${cfg.id}-options`;
    trigger.setAttribute('aria-controls', options.id);
    const open = () => {
      closeAllSelects();
      container.classList.add('is-open');
      options.style.display = 'block';
      trigger.setAttribute('aria-expanded', 'true');
      positionSelectOptions(trigger, options);
      (options.querySelector('[aria-selected="true"]') || options.firstElementChild)?.focus({ preventScroll: true });
    };
    trigger.addEventListener('click', event => {
      event.stopPropagation();
      if (container.classList.contains('is-open')) closeAllSelects();
      else open();
    });
    trigger.addEventListener('keydown', event => {
      if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
      event.preventDefault();
      open();
    });
    options.addEventListener('click', event => {
      const option = event.target.closest('.select-option');
      if (!option) return;
      event.stopPropagation();
      const next = option.dataset.value;
      closeAllSelects();
      label.textContent = option.textContent.trim();
      if (native) {
        native.value = next;
        native.dispatchEvent(new Event('change', { bubbles: true }));
      } else saveSettings({ [cfg.key]: next });
      trigger.focus({ preventScroll: true });
    });
    options.addEventListener('keydown', event => {
      const nodes = [...options.children];
      const index = nodes.indexOf(document.activeElement);
      let next;
      if (event.key === 'ArrowDown') next = (index + 1) % nodes.length;
      else if (event.key === 'ArrowUp') next = (index - 1 + nodes.length) % nodes.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = nodes.length - 1;
      else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        document.activeElement.click();
        return;
      } else if (event.key === 'Escape' || event.key === 'Tab') {
        if (event.key === 'Escape') event.preventDefault();
        closeAllSelects();
        trigger.focus({ preventScroll: true });
        return;
      } else return;
      event.preventDefault();
      nodes[next]?.focus();
    });
  });
}

function clearDropdownMasks() {
  document.querySelectorAll('[data-aurora-dropdown-occluded]').forEach(node => {
    node.removeAttribute('data-aurora-dropdown-occluded');
    node.style.removeProperty('--aurora-dropdown-cutout');
  });
}

function closeAllSelects() {
  clearDropdownMasks();
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

function maskDropdownOverlap(trigger, options) {
  clearDropdownMasks();
  if (!trigger.closest('.custom-select')?.classList.contains('is-open')) return;
  const bounds = options.getBoundingClientRect();
  const owner = trigger.closest('.row');
  document.querySelectorAll('.tab-pane.active > .row, .tab-pane.active > .section-header, .master-toggle-row, .site-controls, .search-wrapper, .tab-nav, .popup-header').forEach(node => {
    if (node === owner || node.contains(options)) return;
    const rect = node.getBoundingClientRect();
    const left = Math.max(0, bounds.left - rect.left);
    const top = Math.max(0, bounds.top - rect.top);
    const right = Math.min(rect.width, bounds.right - rect.left);
    const bottom = Math.min(rect.height, bounds.bottom - rect.top);
    if (right <= left || bottom <= top) return;
    // Remove only the pixels directly behind the menu, leaving the rest of each
    // row visible and its layout untouched. The glass then samples the background.
    const hole = `M0 0 H${rect.width} V${rect.height} H0 Z M${left} ${top} H${right} V${bottom} H${left} Z`;
    node.style.setProperty('--aurora-dropdown-cutout', `path(evenodd, "${hole}")`);
    node.setAttribute('data-aurora-dropdown-occluded', '');
  });
}

function positionSelectOptions(trigger, options) {
  requestAnimationFrame(() => {
    if (!trigger.closest('.custom-select')?.classList.contains('is-open')) return;
    const triggerRect = trigger.getBoundingClientRect();
    const spaceBelow = window.innerHeight - triggerRect.bottom - 8;
    const spaceAbove = triggerRect.top - 8;
    const preferredHeight = Math.min(options.scrollHeight, 240);
    const openUp = spaceBelow < Math.min(preferredHeight, 120) && spaceAbove > spaceBelow;
    const availableSpace = Math.max(96, Math.floor((openUp ? spaceAbove : spaceBelow) - 4));
    options.classList.toggle('open-up', openUp);
    options.style.maxHeight = `${Math.min(preferredHeight, availableSpace)}px`;
    options.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
    maskDropdownOverlap(trigger, options);
  });
}

document.addEventListener('scroll', () => {
  const open = document.querySelector('.custom-select.is-open');
  if (open) maskDropdownOverlap(open.querySelector('.select-trigger'), open.querySelector('.select-options'));
}, true);

// Close selects on outside click
document.addEventListener('click', closeAllSelects);

// --- Event Listeners (Setup ONCE) ---
function setupChangeListeners() {
  document.getElementById('themeGrid')?.addEventListener('click', event => {
    const button = event.target.closest('.theme-choice');
    if (!button) return;
    const customBgUrl = button.dataset.themeValue === 'grokHorizon' ? GROK_HORIZON_URL : button.dataset.themeValue;
    saveSettings({ customBgUrl });
  });
  document.getElementById('soundVolume')?.addEventListener('change', event => saveSettings({ soundVolume: event.target.value }));
  // Toggles - event delegation on body
  TOGGLE_KEYS.forEach(key => {
    const el = $.toggles?.[key];
    if (el) {
      el.addEventListener('change', () => {
        currentSettings = { ...currentSettings, [key]: el.checked };
        filterSiteControls();
        if (key === 'geminiBloom') saveSettings({ [key]: el.checked }, selectedSite.id, 'site');
        else saveSettings({ [key]: el.checked });
      });
    }
  });

  if ($.masterToggleBtn) {
    $.masterToggleBtn.addEventListener('click', () => {
      saveSettings({ extensionEnabled: $.masterToggleBtn.dataset.state === 'disabled' });
    });
  }

  // Preview while dragging and persist the final value immediately on release.
  if ($.blurSlider) {
    $.blurSlider.addEventListener('input', () => {
      $.blurValue.textContent = $.blurSlider.value;
      const patch = { [$.blurSlider.dataset.setting]: $.blurSlider.value };
      currentSettings = { ...currentSettings, ...patch };
      applyPopupAppearance();
      previewMaterial(patch);
    });
    $.blurSlider.addEventListener('change', () => {
      const patch = { [$.blurSlider.dataset.setting]: $.blurSlider.value };
      previewMaterial(patch);
      saveSettings(patch);
    });
  }

  // BG URL
  if ($.bgUrl) {
    $.bgUrl.addEventListener('change', () => {
      const val = $.bgUrl.value.trim();
      saveSettings({ customBgUrl: val });
    });
  }

  // Open the native picker directly from the popup and store media locally.
  if ($.bgFile) {
    const input = document.getElementById('backgroundFile');
    const status = document.getElementById('backgroundFileStatus');
    $.bgFile.addEventListener('click', () => input.click());
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;
      const site = selectedSite.id;
      const scope = siteSelectedByUser ? 'site' : 'auto';
      status.hidden = false;
      if (file.size > 15 * 1024 * 1024) {
        status.textContent = 'Choose a file smaller than 15 MB.';
        input.value = '';
        return;
      }
      status.textContent = `Saving ${file.name}`;
      let key;
      try {
        const data = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(reader.error || new Error('Could not read the file'));
          reader.readAsDataURL(file);
        });
        if (typeof data !== 'string' || !data.startsWith('data:')) throw new Error('Could not read the file');
        key = `customBgData:${site}:${crypto.randomUUID()}`;
        await chrome.storage.local.set({ [key]: data });
        await saveSettings({ customBgUrl: '__local__', customBgDataKey: key }, site, scope);
        status.textContent = `${file.name} selected`;
      } catch (error) {
        if (key) await chrome.storage.local.remove(key);
        status.textContent = `Could not save the background. ${error.message}`;
      } finally {
        input.value = '';
      }
    });
  }

  // Reset
  if ($.clearBg) {
    $.clearBg.addEventListener('click', () => {
      saveSettings({
        customBgUrl: DEFAULTS.customBgUrl,
        customBgDataKey: DEFAULTS.customBgDataKey,
        backgroundBlur: DEFAULTS.backgroundBlur,
        motionBackgroundBlur: DEFAULTS.motionBackgroundBlur,
        backgroundScaling: DEFAULTS.backgroundScaling
      });
      if ($.blurSlider) {
        $.blurSlider.value = DEFAULTS.backgroundBlur;
        $.blurValue.textContent = DEFAULTS.backgroundBlur;
        $.blurRange.syncRange();
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
  closeAllSelects();
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
    applyPopupAppearance(true);
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
