// The orchestrator owns privacy settings and the route lifecycle.
(() => {
  'use strict';
  const A = window.AuroraExt;
  let loading = false;
  function applyInitial() {
    if (window.DataMaskingEngine) { window.DataMaskingEngine.configure(A.getSettings(), A.isActive()); return; }
    if (loading || !A.isActive() || !A.getSettings().dataMaskingEnabled) return;
    loading = true;
    A.utils.loadModule('data-masking.js').then(() => {
      loading = false;
      applyInitial();
    }).catch(error => { loading = false; console.error('Aurora masking could not load', error); });
  }
  A.masking = {
    applyInitial,
    stop() { window.DataMaskingEngine?.stopObserver(); },
  };
})();
