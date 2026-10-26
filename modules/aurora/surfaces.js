// Shared surface tagging for lightweight website adapters.
// The orchestrator supplies added subtrees, so streaming text needs no full-page scan.
(() => {
  'use strict';
  const A = window.AuroraExt;
  const selectors = A.site?.selectors || {};
  const ownUI = A.ownedUI;
  const surfaceRoles = ['composer', 'sidebar', 'menu', 'message', 'code', 'toolbar', 'overlay', 'panel', 'promotion', 'control',
    ...(A.site.id === 'claude' ? ['notice'] : [])];

  function each(root, selector, apply) {
    if (!selector || !root?.querySelectorAll) return;
    if (root.matches?.(selector)) apply(root);
    root.querySelectorAll(selector).forEach(apply);
  }

  function tagPlane(node) {
    if (node.closest(ownUI)) return;
    // Layout ownership wins over semantic roles. A task list can be a listbox
    // without painting a menu around the individually rounded task rows.
    node.removeAttribute('data-aurora-surface');
    node.removeAttribute('data-aurora-surface-edge');
    A.utils.setAttribute(node, 'data-aurora-plane', '');
  }

  function flattenParents(node) {
    for (let parent = node.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
      if (parent.hasAttribute('data-aurora-surface')) break;
      A.utils.setAttribute(parent, 'data-aurora-plane', '');
    }
  }

  function tagSurface(node, role) {
    const targetSelector = A.site.surfaceTargets?.[role];
    if (targetSelector) {
      node = node.closest(targetSelector);
      if (!node) return;
    }
    if (node.closest(ownUI)) return;
    if (role !== 'panel' && node.parentElement?.closest('[data-aurora-surface]')?.getAttribute('data-aurora-surface') === role) return;
    if (selectors.plane && node.matches(selectors.plane)) {
      tagPlane(node);
      return;
    }
    // Transparent semantic shells share the same ownership rule as ChatGPT.
    // Toolbar tags only clear paint, and overlays retain their backdrop role.
    if (role !== 'toolbar' && role !== 'overlay') {
      // Adapters may identify a native panel whose fill comes from the page
      // behind it. Its existing geometry still owns one glass backdrop.
      const nativeShell = A.site.surfaceShells?.[role];
      const owner = A.material.owner(node, !!nativeShell && node.matches(nativeShell));
      if (owner !== node) {
        node.removeAttribute('data-aurora-surface');
        node.removeAttribute('data-aurora-surface-edge');
      }
      if (!owner || (selectors.plane && owner.matches(selectors.plane))) return;
      node = owner;
    }
    // One backdrop per surface avoids stacking filters on nested wrappers.
    const parentSurface = node.parentElement?.closest('[data-aurora-surface]');
    if (role !== 'panel' && parentSurface?.getAttribute('data-aurora-surface') === role) return;
    if (node.getAttribute('data-aurora-surface') === role) return;
    node.setAttribute('data-aurora-surface', role);
    node.removeAttribute('data-aurora-plane');
    if (role !== 'panel') node.querySelectorAll(`[data-aurora-surface="${role}"]`).forEach(child => child.removeAttribute('data-aurora-surface'));
    if (role === 'composer' || role === 'sidebar') flattenParents(node);
  }

  function tagFast(root = document) {
    if (!A.isEnabled() || !A.site.isSupportedRoute(location.pathname)) return;
    if (root.closest?.(ownUI)) return;
    // Classify layout first and repair old surface tags on matching wrappers.
    // The same priority applies to full scans and incrementally added subtrees.
    each(root, selectors.plane, tagPlane);
    const groups = surfaceRoles.map(role => [role, A.utils.matchingElements(root, selectors[role])]);
    const editors = A.utils.matchingElements(root, selectors.editor);
    const composers = editors.map(editor => selectors.composer && editor.closest(selectors.composer)).filter(Boolean);
    const paintCandidates = [...composers];
    for (const [role, nodes] of groups) {
      if (role === 'toolbar' || role === 'overlay') continue;
      for (const node of nodes) {
        const target = A.site.surfaceTargets?.[role];
        const owner = target ? node.closest(target) : node;
        if (owner) paintCandidates.push(owner);
      }
    }
    A.material.prepare(paintCandidates);
    for (const [role, nodes] of groups) nodes.forEach(node => tagSurface(node, role));
    editors.forEach(editor => {
      if (editor.closest(ownUI)) return;
      // Added editors can arrive inside an existing composer. Only tag the
      // adapter's known paint owner, never an arbitrary editor layout wrapper.
      const composer = selectors.composer && editor.closest(selectors.composer);
      if (composer) tagSurface(composer, 'composer');
    });
    A.upgrade?.tagElements?.(root);
  }

  A.glass = {
    tagFast,
    tagAll: tagFast,
    untag() {
      const attrs = ['data-aurora-surface', 'data-aurora-surface-edge', 'data-aurora-plane', 'data-aurora-history', 'data-aurora-avatar', 'data-aurora-content', 'data-aurora-upgrade'];
      A.material.clear(document, attrs);
    },
  };
})();
