// One native range and a material preview thumb shared by all Aurora settings.
(() => {
  'use strict';
  const A = window.AuroraExt;
  const message = key => A.i18n?.getMessage?.(key) || chrome.i18n.getMessage(key) || key;

  function render(control, settings) {
    const amount = A.preferences.glassAmount(settings);
    const input = control.querySelector('input');
    input.value = String(amount);
    input.setAttribute('aria-valuetext', amount === 0 ? message('glassAppearanceOptionClear') :
      amount === 100 ? message('glassAppearanceOptionDimmed') : `${amount}% ${message('glassAppearanceOptionDimmed')}`);
    control.style.setProperty('--glass-position', `${amount}%`);
    control.style.setProperty('--glass-offset', `${-24 * amount / 100}px`);
    control.style.setProperty('--aurora-glass-fill-opacity', `${amount}%`);
  }

  function bind(control, settings, onInput, onCommit) {
    const input = control.querySelector('input');
    let dragging = false;
    let pending;
    const update = () => {
      const patch = A.preferences.glassPatch(input.value);
      pending = patch;
      render(control, patch);
      onInput?.(patch);
    };
    input.addEventListener('pointerdown', () => { dragging = true; });
    input.addEventListener('pointerup', () => { dragging = false; });
    input.addEventListener('input', update);
    input.addEventListener('change', () => {
      dragging = false;
      if (pending) onCommit(pending);
      pending = null;
    });
    input.addEventListener('pointercancel', () => {
      dragging = false;
      if (pending) onCommit(pending);
      pending = null;
    });
    control.syncGlass = next => {
      if (!dragging && !pending) render(control, next);
    };
    render(control, settings);
  }

  function create(id, settings, onInput, onCommit) {
    const control = document.createElement('div');
    control.className = 'aurora-glass-control';
    const range = document.createElement('div');
    range.className = 'aurora-glass-range';
    const input = document.createElement('input');
    Object.assign(input, { id, type: 'range', min: '0', max: '100', step: '1', value: '0' });
    input.setAttribute('aria-label', message('labelGlassStyle'));
    const thumb = document.createElement('span');
    thumb.className = 'aurora-glass-thumb';
    thumb.setAttribute('aria-hidden', 'true');
    range.append(input, thumb);
    const ends = document.createElement('div');
    ends.className = 'aurora-glass-ends';
    ends.setAttribute('aria-hidden', 'true');
    for (const key of ['glassAppearanceOptionClear', 'glassAppearanceOptionDimmed']) {
      const label = document.createElement('span');
      label.textContent = message(key);
      ends.append(label);
    }
    control.append(range, ends);
    bind(control, settings, onInput, onCommit);
    return control;
  }

  A.glassControl = { create, bind, render };
})();
