// modules/aurora/namespace.js
// Shared namespace for Aurora content-script modules (non-ESM).
(() => {
  'use strict';

  try {
    const A = (window.AuroraExt = window.AuroraExt || {});
    A.ownedUI = ['cgpt-ambient-bg', 'cgpt-qs-panel', 'cgpt-qs-btn', 'aurora-queue-panel',
      'aurora-queue-btn', 'aurora-queue-toast', 'aurora-welcome-overlay', 'aurora-success-overlay',
      'aurora-style-bar', 'aurora-support-screen'].map(id => `#${id}`).join(',');

    A.state = A.state || {};
    A.state.settings = A.state.settings || {};

    A.getSettings = A.getSettings || (() => A.state.settings);
    A.isEnabled = A.isEnabled || (() => A.getSettings().extensionEnabled !== false && !(Array.isArray(A.getSettings().disabledSites) && A.getSettings().disabledSites.includes(A.site?.id)));
  } catch (e) {
    // ignore
  }
})();
