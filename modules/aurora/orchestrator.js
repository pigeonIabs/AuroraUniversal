// modules/aurora/orchestrator.js
// Coordinates feature modules; keeps heavy logic outside of content.js.
(() => {
  'use strict';

  const A = (window.AuroraExt = window.AuroraExt || {});

  const cfg = A.config || {};
  const ID = cfg.ID || 'cgpt-ambient-bg';
  const LOCAL_BG_KEY = cfg.LOCAL_BG_KEY || 'customBgData';

  const debounce = A.utils?.debounce || ((fn) => fn);

  const isEnabled = () => (A.isEnabled ? A.isEnabled() : true);
  const getSettings = () => (A.getSettings ? A.getSettings() : {});

  class AuroraOrchestrator {
    constructor() {
      this.observersStarted = false;
      this.settingsLoaded = false;
      this.welcomeScreenChecked = false;
      this.settingsRequestRevision = 0;
      this.settingsReadPending = false;
      this.pendingSettings = {};

      this.appliedBody = null;
      this.renderScheduled = false;
      this.renderRevision = 0;
      this.styleFrameId = null;
      this.renderFrameId = null;
      this.startupReadConsumed = false;
      this.pendingNodes = new Set();
      this.pendingTextParents = new Set();
      this.pendingStateNodes = new Set();
      this.needsReconcile = false;
      this.needsResumeScan = false;

    }

    init() {
      A.startupTimings.modulesReady = performance.now();
      const extensionApi = globalThis.chrome;
      if (!extensionApi?.runtime?.sendMessage && !extensionApi?.storage?.sync?.get) return false;

      // Initialize i18n system with ChatGPT language detection (optional).
      (async () => {
        try {
          await A.i18n?.initialize?.();
        } catch (e) {
          // ignore
        }
      })();

      // Fetch preferences while the host parses. Root material can be applied
      // immediately, and body-dependent features reconcile as soon as it mounts.
      this.startObservers();
      A.centralObserver?.start?.();
      this.refreshSettingsAndApply();

      try {
        extensionApi.storage?.onChanged?.addListener((changes, area) => this.onStorageChanged(changes, area));
      } catch (e) {
        // Content features can still start when storage events are unavailable.
      }
      return true;
    }

    refreshSettingsAndApply() {
      const extensionApi = globalThis.chrome;
      const revision = ++this.settingsRequestRevision;
      this.settingsReadPending = true;

      const applyFreshSettings = (freshSettings) => {
        if (revision !== this.settingsRequestRevision || !freshSettings) return;

        // Keep a stable settings object reference.
        A.state = A.state || {};
        A.state.settings = A.state.settings || {};
        Object.assign(A.state.settings, A.preferences.normalize({ ...freshSettings, ...this.pendingSettings }));
        this.pendingSettings = {};
        this.settingsReadPending = false;
        this.settingsLoaded = true;
        A.startup?.release?.();

        this.applyAllSettings();
      };

      const readStorageFallback = () => {
        try {
          extensionApi?.storage?.sync?.get?.(A.preferences.defaults, (storedSettings) => {
            if (extensionApi?.runtime?.lastError || !storedSettings) return;
            applyFreshSettings({
              ...storedSettings,
              extensionEnabled: storedSettings.extensionEnabled !== false,
            });
          });
        } catch (e) {
          // Keep the page usable if the extension context has been invalidated.
        }
      };

      if (A.startup?.ready && !this.startupReadConsumed) {
        this.startupReadConsumed = true;
        A.startup.ready.then(settings => settings ? applyFreshSettings(settings) : readStorageFallback());
        return;
      }

      if (!extensionApi?.runtime?.sendMessage) {
        readStorageFallback();
        return;
      }

      try {
        extensionApi.runtime.sendMessage({ type: 'GET_SETTINGS' }, (freshSettings) => {
          if (extensionApi.runtime.lastError || !freshSettings) {
            readStorageFallback();
            return;
          }
          applyFreshSettings(freshSettings);
        });
      } catch (e) {
        readStorageFallback();
      }
    }

    applyAllSettings() {
      if (!this.settingsLoaded) return;
      if (!this.isSupportedRoute() || !isEnabled()) {
        this.suspend();
        return;
      }

      A.rootFlags?.apply?.();
      A.centralObserver?.start?.();
      if (!document.body) return;
      this.clearPendingRender();
      this.appliedBody = document.body;
      this.ensureOwnedUI();
      A.startupTimings.integrationStarted ??= performance.now();

      const s = getSettings();
      if (s.hideQuickSettings) A.quickSettings?.remove?.();
      A.background?.applyStyles?.();
      A.background?.update?.();

      A.interface?.tagElements?.(document);
      A.aiWarnings?.apply?.();
      A.ads?.apply?.();
      A.glass?.tagAll?.(document);

      A.textFrost?.start?.();

      A.defaultModel?.maybeApply?.();

      // Optional engines.
      this.applyAudio();
      this.applyContrast();
      A.masking?.applyInitial?.();

      A.queue?.pulse?.();

      if (!this.welcomeScreenChecked) {
        this.welcomeScreenChecked = true;
        if (!s.hasSeenWelcomeScreen) A.welcome?.show?.(() => this.applyAllSettings());
      }
      if (A.startupTimings.integrated === undefined) {
        A.startupTimings.integrated = performance.now();
        requestAnimationFrame(() => { A.startupTimings.paintOpportunity = performance.now(); });
      }
    }

    applyAudio() {
      if (getSettings().soundEnabled) {
        A.audio?.ensureContext?.();
        A.audio?.attachIfEnabled?.();
      } else A.audio?.detach?.();
    }

    applyContrast() {
      if (!getSettings().autoContrast) {
        document.documentElement.style.removeProperty('--bg-opacity');
        return;
      }
      const image = document.getElementById(ID)?.querySelector('.media-layer.active img');
      if (image?.complete) A.contrast?.engine?.analyze?.(image);
    }

    ensureOwnedUI() {
      if (!document.body) return;
      if (!document.getElementById(ID)) A.background?.show?.();
      else A.background?.ensureAppOnTop?.();
      if (!getSettings().hideQuickSettings && !document.getElementById(cfg.QS_BUTTON_ID || 'cgpt-qs-btn')) {
        A.quickSettings?.ensure?.();
      }
    }

    reconcile() {
      if (!this.settingsLoaded || document.hidden || !isEnabled() || !this.isSupportedRoute()) return;
      if (this.appliedBody !== document.body) {
        this.applyAllSettings();
        return true;
      }
      this.ensureOwnedUI();
      if (!document.documentElement.classList.contains(cfg.HTML_CLASS || 'cgpt-ambient-on') ||
          !document.documentElement.style.getPropertyValue('--aurora-glass-fill-opacity')) A.rootFlags?.apply?.();
    }

    clearPendingRender() {
      this.renderRevision++;
      this.renderScheduled = false;
      if (this.styleFrameId !== null) cancelAnimationFrame(this.styleFrameId);
      if (this.renderFrameId !== null) cancelAnimationFrame(this.renderFrameId);
      this.styleFrameId = null;
      this.renderFrameId = null;
      this.pendingNodes.clear();
      this.pendingTextParents.clear();
      this.pendingStateNodes.clear();
      this.needsReconcile = false;
    }

    suspend() {
      this.clearPendingRender();
      this.otherChecks?.cancel?.();
      this.appliedBody = null;
      A.disable?.all?.();
      if (!isEnabled() || window.navigation) A.centralObserver?.stop?.();
    }

    resume() {
      if (document.hidden) return;
      const bodyApplied = this.reconcile();
      if (this.needsResumeScan && isEnabled() && this.isSupportedRoute()) {
        this.needsResumeScan = false;
        if (!bodyApplied) {
          A.glass?.tagAll?.(document);
          A.masking?.applyInitial?.();
          A.interface?.tagElements?.(document);
          A.aiWarnings?.apply?.();
          A.ads?.apply?.();
          if (!getSettings().hideQuickSettings) A.quickSettings?.ensure?.();
          this.applyAudio();
        }
      }
      if (this.pendingNodes.size || this.pendingStateNodes.size || this.pendingTextParents.size || this.needsReconcile) {
        this.flushDOMChanges();
      }
      A.defaultModel?.maybeApply?.();
      A.queue?.schedulePulse?.(0);
      A.textFrost?.schedule?.();
    }

    isSupportedRoute() {
      const path = window.location.pathname.replace(/\/+$/, '') || '/';
      return !!A.site?.isSupportedRoute(path);
    }

    startObservers() {
      if (this.observersStarted) return;
      this.observersStarted = true;

      // Pause animations and video when tab is not visible.
      document.addEventListener(
        'visibilitychange',
        () => {
          if (!isEnabled()) {
            document.documentElement.classList.remove('cgpt-tab-hidden');
            return;
          }

          const bgNode = document.getElementById(ID);
          document.documentElement.classList.toggle('cgpt-tab-hidden', document.hidden);
          if (!document.hidden) this.resume();
          if (!bgNode) return;

          const videos = bgNode.querySelectorAll('video');
          videos.forEach((video) => {
            if (document.hidden) {
              video.pause();
            } else if (video.style.display !== 'none') {
              video.play().catch(() => {});
            }
          });
        },
        { passive: true }
      );

      window.addEventListener('focus', () => this.resume(), { passive: true });

      this.lastUrl = location.href;
      const checkUrl = this.checkUrl = debounce(() => {
        if (location.href === this.lastUrl) return;
        this.lastUrl = location.href;
        A.defaultModel?.cancel?.();
        A.queue?.pulse?.();
        this.applyAllSettings();
      }, 50);

      window.addEventListener('popstate', checkUrl, { passive: true });
      window.navigation?.addEventListener('currententrychange', checkUrl);
      window.addEventListener('pageshow', () => this.resume(), { passive: true });
      window.addEventListener('pagehide', () => {
        this.needsResumeScan = true;
        A.queue?.shutdown?.();
        A.defaultModel?.cancel?.();
        A.masking?.stop?.();
      }, { passive: true });

      if (!window.navigation) {
        for (const method of ['pushState', 'replaceState']) {
          const original = history[method];
          history[method] = function (...args) {
            const result = original.apply(this, args);
            checkUrl();
            return result;
          };
        }
      }

      // Debounce less-critical UI checks that don't cause flicker.
      this.otherChecks = debounce(() => {
        A.defaultModel?.maybeApply?.();
      }, 150);

      this.domObserverCallback = event => this.onDOMChanged(event);

      A.centralObserver.subscribe(this.domObserverCallback);

      // Native stylesheets can finish after early material activation. Refresh
      // ownership from that signal and coalesce multiple loads into one frame.
      document.addEventListener('load', event => {
        if (event.target?.tagName !== 'LINK' || event.target.rel !== 'stylesheet') return;
        A.material.invalidate();
        if (!document.body || this.styleFrameId !== null) return;
        // Coalesce stylesheet arrivals before paint without repeating functional
        // tagging across the full conversation for every CSS file.
        this.styleFrameId = requestAnimationFrame(() => {
          this.styleFrameId = null;
          if (!this.settingsLoaded || !A.isActive() || document.hidden) return;
          A.glass?.tagAll?.(document);
          A.textFrost?.refresh?.(document.body);
        });
      }, true);

      this.observeTheme();
    }

    onDOMChanged({ mutations, addedElements, textParents, structuralChange }) {
      if (location.href !== this.lastUrl) this.checkUrl();
      if (!this.settingsLoaded || !isEnabled() || !this.isSupportedRoute()) return;
      for (const node of addedElements || []) {
        if (node.isConnected) this.pendingNodes.add(node);
      }
      for (const mutation of mutations || []) {
        if (mutation.type !== 'attributes') continue;
        // Busy, checked, expanded and disabled state remain available to the
        // queue and model picker without repainting the container's subtree.
        if (!['data-state', 'hidden', 'aria-hidden', 'contenteditable', 'class', 'style', 'aria-label', 'title', 'href', 'data-testid', 'data-assistant-ads', 'data-assistant-ads-unit', 'data-ad-card-root', 'data-partial-island', 'data-conversation-control'].includes(mutation.attributeName)) continue;
        if (mutation.target.isConnected) this.pendingStateNodes.add(mutation.target);
      }
      // Resolve text owners once per frame, including removed and emptied
      // labels. Token-by-token delivery only records the changed parent.
      for (const node of textParents || []) if (node.isConnected) this.pendingTextParents.add(node);
      if (!document.hidden && (A.queue?.hasWork?.() || (structuralChange && A.queue?.isEnabled?.()))) A.queue?.schedulePulse?.(0);
      // Streamed text does not change surface ownership. Reconcile only changed
      // elements or a replaced body, instead of scheduling an empty paint pass.
      this.needsReconcile ||= document.body !== this.appliedBody || (structuralChange && !document.getElementById(ID)) ||
        mutations?.some(mutation => mutation.type === 'childList' && mutation.target === document.body);
      // Keep exact changed branches while hidden. Returning to an unchanged
      // tab needs no full conversation scan.
      if (document.hidden) return;
      if (!this.pendingNodes.size && !this.pendingStateNodes.size && !this.pendingTextParents.size && !this.needsReconcile) return;
      if (this.renderScheduled) return;
      this.renderScheduled = true;
      const revision = this.renderRevision;
      // One material transaction before the next paint, even when the host
      // commits many mutations and microtasks during one streaming frame.
      this.renderFrameId = requestAnimationFrame(() => {
        this.renderFrameId = null;
        if (revision === this.renderRevision) this.flushDOMChanges();
      });
    }

    flushDOMChanges() {
      this.renderScheduled = false;
      if (document.hidden) return;
      if (!isEnabled() || !this.isSupportedRoute()) {
        this.clearPendingRender();
        return;
      }
      const textOwners = new Map([[A.upgrade, new Set()], [A.aiWarnings, new Set()], [A.ads, new Set()]]);
      for (const parent of this.pendingTextParents) {
        if (!parent.isConnected) continue;
        // Added branches already receive every scanner below.
        let covered = false;
        for (let node = parent; node; node = node.parentElement) {
          if (this.pendingNodes.has(node)) { covered = true; break; }
        }
        if (covered) continue;
        for (const [feature, owners] of textOwners) {
          const owner = feature?.changedOwner?.(parent);
          if (owner?.isConnected) owners.add(owner);
        }
      }
      this.pendingTextParents.clear();
      const nodes = A.utils.minimalRoots(this.pendingNodes);
      this.pendingNodes.clear();
      const states = A.utils.minimalRoots(this.pendingStateNodes).filter(node => !nodes.some(root => root.contains(node)));
      this.pendingStateNodes.clear();
      if (this.needsReconcile) {
        this.needsReconcile = false;
        const previousBody = this.appliedBody;
        this.reconcile();
        if (previousBody !== this.appliedBody) return;
      }
      // A changed label belongs only to its notice classifiers. It does not
      // remount the background, retag glass, or reindex all of its descendants.
      for (const [feature, owners] of textOwners) for (const owner of A.utils.minimalRoots(owners)) {
        if (!nodes.some(root => root.contains(owner))) feature.tagElements(owner);
      }
      // State changes can reveal a pre-existing menu. Tag that branch, but do
      // not treat it as new text or enqueue another full text traversal.
      for (const [branches, scanText] of [[nodes, true], [states, false]]) {
        for (const node of branches) {
          A.glass?.tagFast?.(node);
          A.interface?.tagElements?.(node);
          A.aiWarnings?.tagElements?.(node, scanText);
          A.ads?.tagElements?.(node, scanText);
        }
      }
      // Reconcile the material in this same pre-paint frame as first-time tagging.
      if (nodes.length) A.textFrost?.refresh?.(nodes);
      if (states.length) A.textFrost?.refreshState?.(states);
      if (nodes.length || states.length) this.otherChecks();
      A.quickSettings?.refreshCapabilities?.();
    }

    observeTheme() {
      const hostTheme = () => A.sites.readTheme() === 'light';
      let lastHostLight = hostTheme();
      const themeObserver = new MutationObserver(() => {
        if (!this.settingsLoaded || !isEnabled() || !this.isSupportedRoute()) return;
        const s = getSettings();
        const root = document.documentElement;
        const hostLight = hostTheme();
        const changed = hostLight !== lastHostLight;
        lastHostLight = hostLight;
        if (!root.classList.contains(cfg.HTML_CLASS || 'cgpt-ambient-on') ||
            !root.style.getPropertyValue('--aurora-glass-fill-opacity') ||
            (s.theme === 'auto' && changed)) A.rootFlags?.apply?.();
      });
      themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style', 'data-mode', 'data-theme', 'data-appearance-theme'] });
      let observedBody = null;
      const observeBody = () => {
        if (document.body === observedBody) return;
        observedBody = document.body;
        themeObserver.disconnect();
        themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style', 'data-mode', 'data-theme', 'data-appearance-theme'] });
        if (observedBody) themeObserver.observe(observedBody, { attributes: true, attributeFilter: ['class'] });
      };
      observeBody();
      A.centralObserver?.subscribe(observeBody);
      matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if (isEnabled() && this.isSupportedRoute()) A.rootFlags?.apply?.();
      });
    }

    onStorageChanged(changes, area) {
      if (area === 'sync') {
        const changedKeys = Object.keys(changes);
        const settings = getSettings();

        changedKeys.forEach((key) => {
          if (!changes[key]) return;
          const value = A.preferences.value(key, changes[key].newValue);
          settings[key] = value;
          if (this.settingsReadPending) this.pendingSettings[key] = value;
        });

        const disabledHere = value => Array.isArray(value) && value.includes(A.site.id);
        const siteEnableChanged = changes.disabledSites &&
          disabledHere(changes.disabledSites.oldValue) !== disabledHere(changes.disabledSites.newValue);
        if (changes.extensionEnabled || siteEnableChanged) {
          this.settingsRequestRevision += 1;
          A.queue?.shutdown?.();
          if (!isEnabled()) {
            this.suspend();
            return;
          }
          // Re-hydrate authoritative state from background cache (includes defaults).
          this.refreshSettingsAndApply();
          return;
        }

        if (!isEnabled() || !this.isSupportedRoute()) return;

        if (changes.queueWhileGenerating) A.queue?.schedulePulse?.(0);

        const rootFlagKeys = [
          'legacyComposer',
          'disableAnimations',
          'focusMode',
          'cuteVoiceUI',
          'blurChatHistory',
          'blurAvatar',
          'hideUpgradeButtons',
          'hideRateLimitMessages',
          'hideAIWarnings',
          'blockAds',
          'theme',
          'customFont',
          'voiceColor',
          'appearance',
          'glassIntensity',
          'backgroundBlur',
          'cinemaMode',
          'glassUserMessages',
        ];
        if (changedKeys.some((k) => rootFlagKeys.includes(k))) {
          A.rootFlags?.apply?.();
        }
        if (['cinemaMode', 'focusMode', 'blurChatHistory', 'blurAvatar'].some(key => changes[key] && settings[key])) A.interface?.tagElements?.(document);

        if (changes.customBgUrl || changes.backgroundBlur || changes.backgroundScaling) {
          A.background?.update?.();
          A.background?.applyStyles?.();
        }

        if (changes.hideUpgradeButtons || changes.hideRateLimitMessages) A.upgrade?.applyUpgradeButtons?.();
        if (changes.hideAIWarnings) A.aiWarnings?.apply?.();
        if (changes.blockAds) A.ads?.apply?.();

        if (changes.hideQuickSettings !== undefined) {
          if (!settings.hideQuickSettings) A.quickSettings?.ensure?.();
          else A.quickSettings?.remove?.();
        }

        const siteModelChanged = changes.siteDefaultModels &&
          changes.siteDefaultModels.oldValue?.[A.site.id] !== changes.siteDefaultModels.newValue?.[A.site.id];
        if ((A.site.id === 'chatgpt' && changes.defaultModel) || siteModelChanged) {
          A.defaultModel?.cancel?.();
          A.defaultModel?.maybeApply?.(true);
        }
        if (changes.dataMaskingEnabled || changes.maskingRandomMode) {
          A.masking?.applyInitial?.();
          A.queue?.schedulePulse?.();
        }
        if (changes.autoContrast) this.applyContrast();
        if (!settings.hideQuickSettings && changedKeys.some(key => ['focusMode', 'blurChatHistory', 'blurAvatar', 'cinemaMode', 'hideUpgradeButtons', 'hideRateLimitMessages', 'hideAIWarnings', 'blockAds', 'queueWhileGenerating', 'appearance', 'dataMaskingEnabled'].includes(key))) A.quickSettings?.ensure?.();

        if (changes.soundEnabled || changes.soundVolume) {
          this.applyAudio();
        }
      } else if (area === 'local' && changes[LOCAL_BG_KEY]) {
        if (isEnabled() && this.isSupportedRoute()) A.background?.update?.(true);
      }
    }
  }

  A.orchestrator = A.orchestrator || {};
  A.orchestrator.AuroraOrchestrator = A.orchestrator.AuroraOrchestrator || AuroraOrchestrator;
})();

