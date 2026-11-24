// Main-thread lifecycle only. Pixel evaluation and presentation belong to workers.
(() => {
  'use strict';
  const A = (window.AuroraExt = window.AuroraExt || {});
  const renderers = new Map();
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

  function attach(scene, preview, theme) {
    if (renderers.has(scene)) return;
    // Firefox content scripts cannot reliably construct extension workers.
    // A packaged frame owns the worker and both presentation canvases. It has
    // exactly the same wallpaper bounds and blend mode as the former canvas.
    const surface = document.createElement('iframe');
    surface.className = `${theme}-canvas`;
    surface.setAttribute('aria-hidden', 'true');
    surface.tabIndex = -1;
    surface.style.border = '0';
    surface.style.pointerEvents = 'none';
    scene.appendChild(surface);
    const layer = scene.closest('.media-layer');
    const frameURL = chrome.runtime.getURL('modules/aurora/wallpaper-frame.html');
    const origin = new URL(frameURL).origin;
    let started = false, ready = false, disposed = false, failed = false, visible = false, suspended = false;
    let width = 0, height = 0, previous = '';
    function sync() {
      if (disposed || failed) return;
      const active = !suspended && !document.hidden && visible && scene.isConnected &&
        !!layer?.classList.contains('active') && width > 0 && height > 0;
      if (!started && !active) return;
      const moving = !reducedMotion.matches &&
        !document.documentElement.classList.contains('cgpt-animations-disabled');
      const state = { type: 'state', width, height, active, moving };
      const key = JSON.stringify(state);
      if (!started) {
        started = true;
        surface.src = `${frameURL}?theme=${theme}&preview=${preview ? '1' : '0'}`;
      }
      if (!ready || key === previous) return;
      surface.contentWindow.postMessage(state, origin);
      previous = key;
    }
    function onMessage(event) {
      if (disposed || event.source !== surface.contentWindow || event.origin !== origin ||
          event.data?.source !== 'aurora-wallpaper-frame') return;
      if (event.data.type === 'ready') { ready = true; previous = ''; sync(); }
      else if (event.data.type === 'painted') {
        scene.classList.add(`${theme}-live`);
        scene.dataset.auroraRenderer = event.data.backend;
      } else if (event.data.type === 'error') fail(event.data.message);
    }
    function fail(message) {
      failed = true;
      surface.remove();
      scene.classList.remove(`${theme}-live`);
      delete scene.dataset.auroraRenderer;
      console.warn(`Aurora ${theme} rendering worker could not start`, message);
    }
    const resize = new ResizeObserver(entries => {
      width = entries[0].contentRect.width;
      height = entries[0].contentRect.height;
      sync();
    });
    const intersection = new IntersectionObserver(entries => {
      visible = entries[0].isIntersecting;
      sync();
    });
    const state = new MutationObserver(sync);
    resize.observe(scene);
    intersection.observe(scene);
    state.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    if (layer) state.observe(layer, { attributes: true, attributeFilter: ['class'] });
    const pageHide = event => {
      if (event.persisted) { suspended = true; sync(); }
      else dispose();
    };
    const pageShow = () => { suspended = false; sync(); };
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      resize.disconnect(); intersection.disconnect(); state.disconnect();
      window.removeEventListener('message', onMessage);
      document.removeEventListener('visibilitychange', sync);
      reducedMotion.removeEventListener('change', sync);
      window.removeEventListener('pagehide', pageHide);
      window.removeEventListener('pageshow', pageShow);
      surface.remove();
      scene.classList.remove(`${theme}-live`);
      delete scene.dataset.auroraRenderer;
      renderers.delete(scene);
    };
    document.addEventListener('visibilitychange', sync);
    window.addEventListener('message', onMessage);
    reducedMotion.addEventListener('change', sync);
    window.addEventListener('pagehide', pageHide);
    window.addEventListener('pageshow', pageShow);
    renderers.set(scene, { theme, dispose });
  }

  A.wallpaperRenderer = {
    forTheme: theme => ({
      attach: (scene, preview = false) => attach(scene, preview, theme),
      detach: scene => renderers.get(scene)?.dispose(),
      reset: () => {
        for (const renderer of renderers.values()) if (renderer.theme === theme) renderer.dispose();
      }
    })
  };
})();
