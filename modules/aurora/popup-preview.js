// Preview the resolved website appearance using the site's own background renderer.
(() => {
  'use strict';
  const A = window.AuroraExt;
  let settings = A.preferences.defaults;
  let backgroundKey = '';
  A.getSettings = () => settings;
  A.startupTimings = {};

  function apply(next, refreshUpload = false) {
    settings = next;
    const root = document.documentElement;
    root.classList.add('cgpt-ambient-on');
    root.classList.toggle('cgpt-appearance-clear', next.appearance === 'clear');
    root.classList.toggle('cgpt-animations-disabled', !!next.disableAnimations);
    const rawIntensity = Number(next.glassIntensity);
    const intensity = Number.isFinite(rawIntensity) ? Math.max(0, Math.min(100, rawIntensity)) : next.appearance === 'clear' ? 100 : 0;
    const rawBlur = Number(next.backgroundBlur);
    const blur = Number.isFinite(rawBlur) ? Math.max(0, Math.min(150, rawBlur)) : 50;
    const glassBlur = blur;
    root.style.setProperty('--aurora-glass-fill-opacity', `${100 - intensity}%`);
    root.style.setProperty('--clear-blur', `${glassBlur}px`);
    root.style.setProperty('--aurora-glass-blur', `${glassBlur}px`);
    root.style.setProperty('--aurora-glass-backdrop', glassBlur === 0 ? 'none' : `blur(${glassBlur}px)`);
    root.style.setProperty('--aurora-glass-saturate', '100%');
    if (!A.background.manager.getContainer()) document.body.prepend(A.background.create());
    A.background.applyStyles();
    const key = `${next.customBgUrl}|${next.customBgDataKey}`;
    A.background.update(refreshUpload || key !== backgroundKey);
    backgroundKey = key;
  }

  window.addEventListener('resize', () => A.background.applyStyles());
  window.addEventListener('pagehide', () => {
    A.background.reset();
    A.background.manager.getContainer()?.querySelectorAll('video').forEach(video => video.pause());
  }, { once: true });
  A.popupPreview = { apply };
})();
