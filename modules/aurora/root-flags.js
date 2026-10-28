// modules/aurora/root-flags.js
// Applies <html> flags, attributes and derived settings.
(() => {
  'use strict';

  const A = (window.AuroraExt = window.AuroraExt || {});
  A.rootFlags = A.rootFlags || {};

  const cfg = A.config || {};
  const HTML_CLASS = cfg.HTML_CLASS || 'cgpt-ambient-on';
  const LEGACY_CLASS = cfg.LEGACY_CLASS || 'cgpt-legacy-composer';
  const LIGHT_CLASS = cfg.LIGHT_CLASS || 'cgpt-light-mode';
  const ANIMATIONS_DISABLED_CLASS = cfg.ANIMATIONS_DISABLED_CLASS || 'cgpt-animations-disabled';
  const CLEAR_APPEARANCE_CLASS = cfg.CLEAR_APPEARANCE_CLASS || 'cgpt-appearance-clear';

  const isEnabled = () => (A.isEnabled ? A.isEnabled() : true);
  const getSettings = () => (A.getSettings ? A.getSettings() : {});

  const setAttribute = A.utils?.setAttribute || ((node, name, value) => node.setAttribute(name, value));
  const setStyle = A.utils?.setStyle || ((node, name, value) => node.style.setProperty(name, value));

  const toggleClass = A.utils?.toggleClass || ((node, name, enabled) => node.classList.toggle(name, enabled));
  const toggleAttribute = A.utils?.toggleAttribute || ((node, name, enabled) => node.toggleAttribute(name, enabled));

  // Perf: avoid spamming storage.local with repeated detectedTheme writes.
  let lastDetectedTheme = null;
  let lastDetectedThemeWriteAt = 0;
  function apply() {
    if (!isEnabled()) return;

    const s = getSettings();
    const root = document.documentElement;
    const enabled = key => !!s[key] && A.sites.supports(A.site, key);

    toggleClass(root, HTML_CLASS, true);
    setAttribute(root, 'data-aurora-site', A.site.id);
    toggleAttribute(root, 'data-aurora-hub-settings', A.site.id === 'huggingface' && /^\/settings(?:\/|$)/.test(location.pathname));
    toggleClass(root, LEGACY_CLASS, enabled('legacyComposer'));
    toggleClass(root, ANIMATIONS_DISABLED_CLASS, !!s.disableAnimations);
    toggleClass(root, CLEAR_APPEARANCE_CLASS, s.appearance === 'clear');
    toggleClass(root, 'cgpt-glass-user-messages', s.glassUserMessages !== false);
    toggleClass(root, 'cgpt-cute-voice-on', enabled('cuteVoiceUI'));
    toggleClass(root, 'cgpt-focus-mode-on', enabled('focusMode'));
    toggleClass(root, 'cgpt-cinema-mode', enabled('cinemaMode'));

    // Streamer mode (blur).
    toggleClass(root, 'cgpt-blur-chat-history', enabled('blurChatHistory'));
    toggleClass(root, 'cgpt-blur-avatar', enabled('blurAvatar'));
    toggleClass(root, 'cgpt-hide-upgrade', enabled('hideUpgradeButtons'));
    toggleClass(root, 'cgpt-hide-rate-limits', enabled('hideRateLimitMessages'));
    toggleClass(root, 'cgpt-hide-ai-warnings', enabled('hideAIWarnings'));
    toggleClass(root, 'cgpt-block-ads', enabled('blockAds'));

    const storedGlassIntensity = Number(s.glassIntensity);
    const fallbackGlassIntensity = s.appearance === 'clear' ? 100 : 0;
    const glassIntensity = Number.isFinite(storedGlassIntensity)
      ? Math.max(0, Math.min(100, storedGlassIntensity))
      : fallbackGlassIntensity;
    // The same continuous amount controls surface fill and material tokens.
    setStyle(root, '--aurora-glass-fill-opacity', `${100 - glassIntensity}%`);
    const storedBackgroundBlur = Number(s.backgroundBlur);
    const backgroundBlur = Number.isFinite(storedBackgroundBlur)
      ? Math.max(0, Math.min(150, storedBackgroundBlur))
      : 60;
    const maxGlassBlur = 14 + glassIntensity / 10;
    // Space is already a sharp procedural scene. Blurring its one-pixel stars
    // erases them even through a fully transparent surface. Keep its material
    // clear while text-frost still protects controls over scrolled page text.
    const glassBlur = s.customBgUrl === '__space__' ? 0 :
      Math.round(maxGlassBlur * Math.min(1, backgroundBlur / 60));
    setStyle(root, '--aurora-glass-blur', `${glassBlur}px`);
    setStyle(root, '--aurora-glass-backdrop', backgroundBlur === 0 ? 'none' : `blur(${glassBlur}px)`);
    setStyle(root, '--aurora-glass-saturate', '100%');
    setStyle(root, '--sidebar-glass-blur', `${glassBlur}px`);
    setStyle(root, '--clear-blur', `${glassBlur}px`);
    setStyle(root, '--composer-blur', `${glassBlur}px`);
    setStyle(root, '--glass-blur', `${glassBlur}px`);
    toggleAttribute(root, 'data-aurora-zero-blur', glassBlur === 0);
    toggleAttribute(root, 'data-aurora-codex', location.pathname.startsWith('/codex/cloud'));
    toggleAttribute(root, 'data-aurora-temporary-chat', new URLSearchParams(location.search).get('temporary-chat') === 'true');
    setAttribute(root, 'data-glass-intensity', String(glassIntensity));

    // Custom font support.
    const customFont = s.customFont || 'system';
    setAttribute(root, 'data-custom-font', customFont);
    A.fonts?.ensure?.(customFont);

    const applyLightMode = s.theme === 'light' || (s.theme === 'auto' && A.sites.readTheme() === 'light');
    toggleClass(root, LIGHT_CLASS, applyLightMode);

    // Store detected theme (used by popup for correct default), throttled.
    try {
      if (chrome?.runtime?.id && chrome?.storage?.local) {
        const detectedTheme = applyLightMode ? 'light' : 'dark';
        const now = Date.now();
        if (detectedTheme !== lastDetectedTheme && now - lastDetectedThemeWriteAt > 500) {
          lastDetectedTheme = detectedTheme;
          lastDetectedThemeWriteAt = now;
          chrome.storage.local.set({ [`detectedTheme:${A.site.id}`]: detectedTheme }, () => {
            // ignore errors (extension context invalidated etc.)
          });
        }
      }
    } catch (e) {
      // ignore
    }

    setAttribute(root, 'data-voice-color', s.voiceColor || 'default');
    A.embeddedGems?.sync?.();
    A.textFrost?.schedule?.();
  }

  A.rootFlags.apply = A.rootFlags.apply || apply;
})();

