// modules/aurora/utils.js
(() => {
  'use strict';

  const A = (window.AuroraExt = window.AuroraExt || {});
  A.utils = A.utils || {};

  A.utils.debounce = A.utils.debounce || ((func, wait) => {
    let timeout;
    const debounced = function (...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => { timeout = null; func(...args); }, wait);
    };
    debounced.cancel = () => { clearTimeout(timeout); timeout = null; };
    return debounced;
  });

  A.utils.setAttribute = (node, name, value) => {
    if (node.getAttribute(name) !== value) node.setAttribute(name, value);
  };

  A.utils.setText = (node, value) => {
    if (node.textContent !== value) node.textContent = value;
  };

  A.utils.setStyle = (node, name, value) => {
    if (node.style.getPropertyValue(name) !== value) node.style.setProperty(name, value);
  };

  A.utils.toggleClass = (node, name, enabled) => {
    if (node.classList.contains(name) !== !!enabled) node.classList.toggle(name, !!enabled);
  };

  A.utils.toggleAttribute = (node, name, enabled) => {
    if (node.hasAttribute(name) !== !!enabled) node.toggleAttribute(name, !!enabled);
  };

  A.utils.matchingElements = (root, selector) => {
    if (!selector || !root?.querySelectorAll) return [];
    const nodes = [...root.querySelectorAll(selector)];
    if (root.matches?.(selector)) nodes.unshift(root);
    return nodes;
  };

  // Prune protected branches before matching. Notice discovery should scale
  // with the site's controls, rather than with the length of a conversation.
  A.utils.matchingElementsOutside = (root, selector, boundary) => {
    if (!root?.querySelectorAll || root.closest?.(boundary)) return [];
    const nodes = root.matches?.(selector) ? [root] : [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
      acceptNode(node) {
        if (node.matches(boundary)) return NodeFilter.FILTER_REJECT;
        return node.matches(selector) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      },
    });
    for (let node = walker.nextNode(); node; node = walker.nextNode()) nodes.push(node);
    return nodes;
  };

  // Reject a protected branch once. Descendants cannot escape it, so each
  // visited element needs a local match instead of another ancestor search.
  A.utils.textParentsOutside = function* (root, boundary) {
    if (root.closest?.(boundary) || root.parentElement?.closest(boundary)) return;
    const parents = new Set();
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (node.nodeType === 1) return node.matches(boundary) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_SKIP;
        return node.nodeValue?.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      },
    });
    for (let text = walker.nextNode(); text; text = walker.nextNode()) {
      const parent = text.parentElement;
      if (!parents.has(parent)) { parents.add(parent); yield parent; }
    }
  };

  // Keep only changed branches. Walking ancestors avoids pairwise contains()
  // checks when the host mounts hundreds of nodes in one render.
  A.utils.minimalRoots = nodes => {
    const connected = new Set([...nodes].filter(node => node.isConnected));
    return [...connected].filter(node => {
      for (let parent = node.parentElement; parent; parent = parent.parentElement) {
        if (connected.has(parent)) return false;
      }
      return true;
    });
  };

  A.utils.safeRequestIdleCallback =
    A.utils.safeRequestIdleCallback ||
    ((callback, options) => {
      return window.requestIdleCallback ? window.requestIdleCallback(callback, options) : setTimeout(callback, 16);
    });
  A.utils.cancelIdleCallback = handle => {
    if (window.cancelIdleCallback) window.cancelIdleCallback(handle);
    else clearTimeout(handle);
  };

  // Privacy-rounded clocks cannot enforce a millisecond budget. A hard step
  // limit bounds each task even when every clock read returns the same value.
  A.utils.advanceWork = (iterator, steps = 64, milliseconds = 3) => {
    const deadline = performance.now() + milliseconds;
    for (let index = 0; index < steps; index++) {
      if (iterator.next().done) return true;
      if (performance.now() >= deadline) break;
    }
    return false;
  };

  const modules = new Map();
  A.utils.loadModule = path => {
    if (!modules.has(path)) {
      modules.set(path, import(chrome.runtime.getURL(path)).catch(error => {
        modules.delete(path);
        throw error;
      }));
    }
    return modules.get(path);
  };

  A.utils.normalizeToken =
    A.utils.normalizeToken ||
    ((value) => (value || '').toLowerCase().replace(/\s+/g, ' ').trim());

})();
