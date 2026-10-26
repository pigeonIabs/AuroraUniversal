// modules/aurora/disable.js
// Cleanup helpers when the extension is disabled.
(() => {
  'use strict';

  const A = (window.AuroraExt = window.AuroraExt || {});
  A.disable = A.disable || {};

  const cfg = A.config || {};

  const ID = cfg.ID || 'cgpt-ambient-bg';
  const HTML_CLASS = cfg.HTML_CLASS || 'cgpt-ambient-on';
  const LEGACY_CLASS = cfg.LEGACY_CLASS || 'cgpt-legacy-composer';
  const LIGHT_CLASS = cfg.LIGHT_CLASS || 'cgpt-light-mode';
  const ANIMATIONS_DISABLED_CLASS = cfg.ANIMATIONS_DISABLED_CLASS || 'cgpt-animations-disabled';
  const CLEAR_APPEARANCE_CLASS = cfg.CLEAR_APPEARANCE_CLASS || 'cgpt-appearance-clear';
  const QS_BUTTON_ID = cfg.QS_BUTTON_ID || 'cgpt-qs-btn';
  const QS_PANEL_ID = cfg.QS_PANEL_ID || 'cgpt-qs-panel';
  const HIDE_UPGRADE_CLASS = cfg.HIDE_UPGRADE_CLASS || 'cgpt-hide-upgrade';

  function disableAllFeatures() {
    A.textFrost?.stop?.();
    const root = document.documentElement;

    root.classList.remove(
      HTML_CLASS,
      LEGACY_CLASS,
      ANIMATIONS_DISABLED_CLASS,
      CLEAR_APPEARANCE_CLASS,
      LIGHT_CLASS,
      'cgpt-cute-voice-on',
      'cgpt-focus-mode-on',
      'cgpt-cinema-mode',
      'cgpt-blur-chat-history',
      'cgpt-blur-avatar',
      'cgpt-hide-upgrade',
      'cgpt-hide-rate-limits',
      'cgpt-hide-ai-warnings',
      'cgpt-block-ads',
      'cgpt-theme-transitioning',
      'cgpt-tab-hidden',
      'cgpt-snapshot-mode',
      'cgpt-glass-user-messages'
    );

    root.removeAttribute('data-aurora-site');
    root.removeAttribute('data-aurora-hub-settings');
    A.embeddedGems?.sync?.();
    root.removeAttribute('data-custom-font');
    root.removeAttribute('data-voice-color');
    root.style.removeProperty('--cgpt-bg-blur-radius');
    root.style.removeProperty('--cgpt-object-fit');
    root.style.removeProperty('--bg-opacity');
    root.style.removeProperty('--aurora-glass-fill-opacity');
    root.style.removeProperty('--aurora-glass-blur');
    root.style.removeProperty('--aurora-glass-backdrop');
    root.removeAttribute('data-glass-intensity');
    root.removeAttribute('data-aurora-zero-blur');
    root.removeAttribute('data-aurora-codex');
    root.removeAttribute('data-aurora-temporary-chat');
    ['--aurora-glass-saturate', '--sidebar-glass-blur', '--clear-blur', '--composer-blur', '--glass-blur'].forEach(name => root.style.removeProperty(name));
    A.defaultModel?.cancel?.();
    A.queue?.shutdown?.();
    A.glass?.untag?.();
    A.upgrade?.untag?.();
    A.aiWarnings?.untag?.();
    A.ads?.untag?.();
    A.interface?.untag?.();
    A.background?.restoreApp?.();

    // Optional engines / UI.
    A.fonts?.cleanup?.();
    A.audio?.detach?.();

    const bgNode = document.getElementById(ID);
    bgNode?.remove();

    try {
      if (A.background?.reset) A.background.reset();
      else if (A.background?.manager) {
        A.background.manager.abort?.();
        A.background.manager.currentUrl = null;
        A.background.manager.activeLayerId = 'a';
        A.background.manager.state = 'idle';
      }
    } catch (e) {
      // ignore
    }

    A.quickSettings?.remove?.();

    document.getElementById('aurora-welcome-overlay')?.remove();
    document.getElementById('aurora-success-overlay')?.remove();
    document.getElementById('aurora-style-bar')?.remove();
    document.getElementById('aurora-support-screen')?.remove();

    document.querySelectorAll(`.${HIDE_UPGRADE_CLASS}`).forEach((el) => el.classList.remove(HIDE_UPGRADE_CLASS));

    // Data masking engine.
    A.masking?.stop?.();
  }

  A.disable.all = A.disable.all || disableAllFeatures;
})();

