// The extension origin provides a reliable Worker principal independently of
// website worker policies. Messages contain lifecycle state, never page data.
(() => {
  'use strict';
  const params = new URLSearchParams(location.search);
  const theme = params.get('theme');
  if (!['northern-lights', 'deep-ocean'].includes(theme)) return;
  const preview = params.get('preview') === '1';
  const field = document.getElementById('field');
  const life = document.getElementById('life');
  if (theme !== 'deep-ocean') life.remove();
  let worker, state, disposed = false;
  const report = data => parent.postMessage({ source: 'aurora-wallpaper-frame', ...data }, '*');
  function sync() {
    if (!state || disposed) return;
    const current = { ...state, active: state.active && !document.hidden };
    if (!worker && !current.active) return;
    try {
      if (!worker) {
        worker = new Worker('wallpaper-worker.js');
        worker.onmessage = ({ data }) => report(data);
        worker.onerror = event => {
          event.preventDefault();
          worker.terminate(); worker = null;
          disposed = true;
          report({ type: 'error', message: event.message });
        };
        const target = field.transferControlToOffscreen();
        const particles = theme === 'deep-ocean' ? life.transferControlToOffscreen() : null;
        worker.postMessage({ ...current, type: 'init', theme, preview, target, particles },
          particles ? [target, particles] : [target]);
      } else worker.postMessage(current);
    } catch (error) { report({ type: 'error', message: String(error) }); }
  }
  window.addEventListener('message', event => {
    if (event.source !== parent || event.data?.type !== 'state') return;
    const data = event.data;
    if (!Number.isFinite(data.width) || !Number.isFinite(data.height) ||
        data.width < 0 || data.height < 0) return;
    state = { type: 'state', width: data.width, height: data.height,
      active: data.active === true, moving: data.moving === true };
    sync();
  });
  document.addEventListener('visibilitychange', sync);
  window.addEventListener('pagehide', event => {
    if (!event.persisted) { disposed = true; worker?.terminate(); worker = null; }
  });
  window.addEventListener('pageshow', sync);
  report({ type: 'ready' });
})();
