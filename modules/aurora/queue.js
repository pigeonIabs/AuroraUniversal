// modules/aurora/queue.js
// Wrapper for modules/message-queue.js (delayed/queued messages while generating).
(() => {
  'use strict';

  const A = (window.AuroraExt = window.AuroraExt || {});
  A.queue = A.queue || {};

  const getSettings = () => (A.getSettings ? A.getSettings() : {});
  const isExtensionEnabled = () => !!A.isActive?.() && A.sites.supports(A.site, 'queueWhileGenerating');
  const getMessage = A.i18n?.getMessage || ((k) => k);

  let engine = null;
  let loading = false;

  function ensureEngine() {
    if (engine) return engine;
    const s = getSettings();
    if (!isExtensionEnabled() || !s.queueWhileGenerating || !A.sites.supports(A.site, 'queueWhileGenerating')) return null;
    if (!window.AuroraMessageQueueEngine) {
      if (!loading) {
        loading = true;
        A.utils.loadModule('modules/message-queue.js').then(() => {
          loading = false;
          pulse();
        }).catch(error => { loading = false; console.error('Aurora queue could not load', error); });
      }
      return null;
    }
    engine = new window.AuroraMessageQueueEngine({ getSettings, isExtensionEnabled, getMessage });
    return engine;
  }

  function isEnabled() {
    const s = getSettings();
    return isExtensionEnabled() && !!s.queueWhileGenerating && A.sites.supports(A.site, 'queueWhileGenerating');
  }

  function hasWork() {
    return !!(engine && engine.hasWork && engine.hasWork());
  }

  function pulse() {
    const e = ensureEngine();
    if (e) e.pulse();
  }

  function schedulePulse(delay = 0) {
    const e = ensureEngine();
    if (e) e.schedulePulse(delay);
  }

  function shutdown() {
    if (engine) engine.shutdown();
  }

  A.queue.isEnabled = A.queue.isEnabled || isEnabled;
  A.queue.hasWork = A.queue.hasWork || hasWork;
  A.queue.pulse = A.queue.pulse || pulse;
  A.queue.schedulePulse = A.queue.schedulePulse || schedulePulse;
  A.queue.shutdown = A.queue.shutdown || shutdown;
})();

