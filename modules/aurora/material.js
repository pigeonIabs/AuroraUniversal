// Native paint ownership shared by all adapters. Reads finish before glass writes.
(() => {
  'use strict';
  const A = window.AuroraExt;
  const attributes = ['data-aurora-glass', 'data-aurora-surface', 'data-aurora-code-block',
    'data-aurora-surface-edge', 'data-aurora-image-toolbar', 'data-aurora-image-top-control', 'data-aurora-work-context',
    'data-aurora-library-header'];
  const shells = '[role="menu"], [role="listbox"], [role="dialog"], [role="tooltip"], button, [role="button"]';
  const excluded = '.sr-only, [hidden], [aria-hidden="true"]';
  // State is communicated by native paint, including thumbs and selected fills.
  // Keep control subtrees outside generic ownership. Explicit Chat/Work
  // material in app-skin.css paints only its existing native selection layer.
  const nativeControls = [
    '[role="switch"]', '[role="checkbox"]', '[role="radio"]',
    '[role="menuitemcheckbox"]', '[role="menuitemradio"]',
    '[role="tab"]', '[role="option"]', '[role="tablist"]', '[role="radiogroup"]',
    '[aria-checked]', '[aria-pressed]', '[aria-selected]', '[aria-current]',
    'input:is([type="checkbox" i], [type="radio" i], [type="range" i])',
    '[data-state="checked"]', '[data-state="unchecked"]',
    '[data-state="on"]', '[data-state="off"]',
    '[data-state="active"]', '[data-state="inactive"]',
    '[data-model-picker-power-slider]',
    '[role="group"]:has(> .bg-background-mode-toggle-track)',
  ].join(',');
  const preservesNativePaint = node => A.site?.id === 'chatgpt' &&
    !!node?.closest?.(nativeControls) && !node.closest(A.ownedUI);
  let paint = new WeakMap();
  let pass = 0;
  let environment = '';

  function invalidate() {
    paint = new WeakMap();
  }

  function beginPass() {
    const next = `${innerWidth}|${innerHeight}|${document.documentElement.classList.contains('cgpt-light-mode')}`;
    if (next !== environment) { environment = next; invalidate(); }
    pass++;
  }

  function usable(node) {
    return node?.nodeType === 1 && !node.matches(excluded) && !preservesNativePaint(node);
  }

  function cachedPaint(node) {
    const cached = paint.get(node);
    const valid = cached && cached.className === node.getAttribute('class') &&
      cached.style === node.getAttribute('style') && cached.role === node.getAttribute('role') &&
      (cached.painted || cached.pass === pass);
    return valid ? cached : null;
  }

  function visibleColor(color) {
    if (!color || color === 'transparent') return false;
    const alpha = color.includes('/') ? color.split('/').pop().replace(')', '').trim() :
      color.startsWith('rgba(') ? color.slice(5, -1).split(',').pop().trim() : null;
    return alpha === null || parseFloat(alpha) > 0;
  }

  function measure(node) {
    const style = getComputedStyle(node);
    const bordered = ['Top', 'Right', 'Bottom', 'Left'].every(side =>
      parseFloat(style[`border${side}Width`]) > 0 &&
      !['none', 'hidden'].includes(style[`border${side}Style`]) && visibleColor(style[`border${side}Color`]));
    const painted = style.display !== 'none' && style.display !== 'contents' && (
      visibleColor(style.backgroundColor) || (style.backgroundImage && style.backgroundImage !== 'none') || bordered);
    const edge = bordered || ['TopLeft', 'TopRight', 'BottomLeft', 'BottomRight'].some(corner =>
      parseFloat(style[`border${corner}Radius`]) > 0);
    const value = { painted, edge, pass, className: node.getAttribute('class'),
      style: node.getAttribute('style'), role: node.getAttribute('role'), owner: undefined };
    paint.set(node, value);
    return value;
  }

  function readBatch(nodes) {
    const pending = [];
    for (const node of new Set(nodes)) {
      if (!usable(node)) {
        if (preservesNativePaint(node)) {
          for (const attribute of attributes) node.removeAttribute(attribute);
        }
        continue;
      }
      if (cachedPaint(node)) continue;
      const saved = [];
      for (const attribute of attributes) {
        const value = node.getAttribute(attribute);
        if (value !== null) { saved.push([attribute, value]); node.removeAttribute(attribute); }
      }
      pending.push({ node, saved });
    }
    try {
      for (const { node } of pending) measure(node);
    } finally {
      for (const { node, saved } of pending) {
        for (const [attribute, value] of saved) node.setAttribute(attribute, value);
        if (paint.has(node)) paint.get(node).style = node.getAttribute('style');
      }
    }
  }

  function structuralLayers(node) {
    const bounds = node.getBoundingClientRect();
    const groups = [];
    if (!bounds.width || !bounds.height) return groups;
    let children = [...node.children];
    for (let depth = 0; depth < 3 && children.length; depth++) {
      const layers = children.filter(child => {
        if (!child.matches('div, section, article, span') ||
            child.matches('[role="button"], [role="option"], [role^="menuitem"]')) return false;
        const rect = child.getBoundingClientRect();
        return Math.abs(rect.left - bounds.left) <= 2 && Math.abs(rect.top - bounds.top) <= 2 &&
          Math.abs(rect.width - bounds.width) <= 4 && Math.abs(rect.height - bounds.height) <= 4;
      });
      groups.push(layers);
      children = layers.flatMap(layer => [...layer.children]);
    }
    return groups;
  }

  function prepare(nodes, newPass = true) {
    const all = [...new Set(nodes)];
    if (!all.length) return;
    if (newPass) beginPass();
    readBatch(all);
    const candidates = all.filter(usable);
    // Resolve transparent positioning shells as a batch too. A menu item or
    // icon never becomes the paint owner of its larger interaction container.
    const pending = candidates.filter(node => !paint.get(node).painted && node.matches(shells));
    const layers = pending.map(node => [node, structuralLayers(node)]);
    readBatch(layers.flatMap(([, groups]) => groups.flat()));
    for (const [node, groups] of layers) {
      paint.get(node).owner = groups.flat().find(layer => usable(layer) && paint.get(layer)?.painted) || null;
    }
  }

  function owner(node, allowTransparent = false) {
    if (!usable(node)) return null;
    const nativeShell = A.site.surfaceShells?.[node.getAttribute('data-aurora-surface')];
    allowTransparent ||= !!nativeShell && node.matches(nativeShell);
    // Isolated legacy controls use the same transaction as a full adapter pass.
    if (!cachedPaint(node)) prepare([node], false);
    const value = paint.get(node);
    let target = value.painted || allowTransparent ? node : value.owner;
    if (target === undefined && node.matches(shells)) {
      prepare([node], false);
      target = paint.get(node).owner;
    }
    if (!target) return null;
    A.utils.setAttribute(target, 'data-aurora-surface-edge', paint.get(target).edge ? 'true' : 'false');
    return target;
  }

  function clear(root, names = attributes) {
    for (const node of A.utils.matchingElements(root, names.map(name => `[${name}]`).join(','))) {
      for (const name of names) node.removeAttribute(name);
    }
  }

  A.material = { prepare, owner, invalidate, clear, attributes };

  // Responsive native geometry remains authoritative. Only current owners need
  // remeasurement when a breakpoint changes the surface's shape.
  window.addEventListener('resize', A.utils.debounce(() => {
    if (!A.isActive()) return;
    const nodes = document.querySelectorAll('[data-aurora-surface-edge]');
    prepare(nodes);
    for (const node of nodes) {
      const target = owner(node);
      if (target === node) continue;
      for (const attribute of attributes) {
        if (attribute === 'data-aurora-surface-edge') continue;
        const value = node.getAttribute(attribute);
        if (value !== null && target) A.utils.setAttribute(target, attribute, value);
        node.removeAttribute(attribute);
      }
      node.removeAttribute('data-aurora-surface-edge');
    }
  }, 150), { passive: true });
})();
