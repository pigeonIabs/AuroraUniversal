// Appearance-only bridge for the two Opal frames embedded in Gemini's Gems page.
// Only material tokens cross origins. Each frame keeps its native app behavior.
(() => {
  'use strict';
  const GEMINI = 'https://gemini.google.com';
  const SHELL = 'https://opal.google.com';
  const GUEST = 'https://opal.google';
  const READY = 'AURORA_GEMS_READY';
  const APPEARANCE = 'AURORA_GEMS_APPEARANCE';
  const tokens = ['--aurora-glass-fill', '--aurora-glass-border', '--aurora-glass-shadow',
    '--aurora-glass-backdrop', '--theme-text-primary', '--theme-text-secondary', '--menu-item-hover'];

  function frameOrigin(frame) {
    try {
      const url = new URL(frame.src);
      if (url.origin === SHELL && /^\/_gemini(?:\/|$)/.test(url.pathname)) return SHELL;
      if (url.origin === GUEST && /^\/_app\//.test(url.pathname)) return GUEST;
    } catch { /* A frame still loading about:blank has no appearance target. */ }
    return null;
  }

  function forward(appearance, targetOrigin) {
    for (const frame of document.querySelectorAll('iframe')) {
      if (frameOrigin(frame) === targetOrigin) frame.contentWindow?.postMessage(appearance, targetOrigin);
    }
  }

  if (location.origin === GEMINI) {
    const A = window.AuroraExt;
    if (!A) return;
    function sync() {
      const root = document.documentElement;
      const enabled = !!A.isActive?.() && root.classList.contains('cgpt-ambient-on');
      const frames = [...document.querySelectorAll('iframe')].filter(frame => frameOrigin(frame) === SHELL);
      if (!frames.length) return;
      const style = enabled ? getComputedStyle(root) : null;
      const appearance = { type: APPEARANCE, enabled,
        light: enabled && root.classList.contains('cgpt-light-mode'),
        tokens: Object.fromEntries(tokens.map(name => [name, style?.getPropertyValue(name).trim() || ''])) };
      frames.forEach(frame => frame.contentWindow?.postMessage(appearance, SHELL));
    }
    A.embeddedGems = { sync };
    window.addEventListener('message', event => {
      if (event.origin !== SHELL || event.data?.type !== READY) return;
      if ([...document.querySelectorAll('iframe')].some(frame =>
        frameOrigin(frame) === SHELL && frame.contentWindow === event.source)) sync();
    });
    document.addEventListener('load', event => {
      if (event.target?.tagName === 'IFRAME' && frameOrigin(event.target) === SHELL) sync();
    }, true);
    return;
  }

  // The guest also serves standalone Opal. Only Gemini's lite embedding opts in.
  const query = new URLSearchParams(location.search);
  const shell = location.origin === SHELL && /^\/_gemini(?:\/|$)/.test(location.pathname);
  const guest = location.origin === GUEST && /^\/_app\//.test(location.pathname) && query.get('lite') === 'true';
  if (window === window.top || query.get('origin') !== GEMINI || (!shell && !guest)) return;
  const parentOrigin = shell ? GEMINI : SHELL;
  const glassShadows = guest ? window.AuroraExt?.createGlassShadows?.() : null;
  const boardSelector = '.board, #no-projects-panel, #no-create-panel';
  let appearance = null;
  const hosts = new Set();
  const styles = new WeakMap();
  const hostSelector = 'bb-lite-home, bb-project-listing-lite, bb-gallery-lite';
  const shadowCSS = `
    :host([data-aurora-opal-active]) {
      --sys-color--body-background: transparent;
      --sys-color--on-surface: var(--theme-text-primary);
      --sys-color--on-surface-variant: var(--theme-text-secondary);
      --sys-color--on-surface-low: var(--theme-text-secondary);
      --sys-color--outline: var(--aurora-glass-border);
      --sys-color--outline-variant: var(--aurora-glass-border);
      color: var(--theme-text-primary);
      background: transparent !important;
    }
    :host([data-aurora-opal-active]) :is(#home, #board-listing, #content, #boards, #boards-inner) {
      background: transparent !important;
    }
    :host([data-aurora-opal-active]) :is(${boardSelector}) {
      background: var(--aurora-glass-fill) !important;
      border-color: transparent !important;
      box-shadow: inset 0 1px 0 color-mix(in srgb, var(--aurora-glass-border) 55%, transparent), var(--aurora-cast-glass) !important;
      backdrop-filter: var(--aurora-glass-backdrop) !important;
      -webkit-backdrop-filter: var(--aurora-glass-backdrop) !important;
      color: var(--theme-text-primary) !important;
    }
    :host([data-aurora-opal-active]) .board .thumbnail {
      opacity: 0.5 !important;
      background-color: transparent !important;
    }
    :host([data-aurora-opal-active]) .board::before {
      background: transparent !important;
    }
    :host([data-aurora-opal-active]) .board::after {
      outline-color: var(--aurora-glass-border) !important;
      box-shadow: inset 0 0 0 1px var(--aurora-glass-border) !important;
    }
    :host([data-aurora-opal-active]) .board .info {
      background: var(--aurora-glass-fill) !important;
      backdrop-filter: var(--aurora-glass-backdrop) !important;
      -webkit-backdrop-filter: var(--aurora-glass-backdrop) !important;
      color: var(--theme-text-primary) !important;
    }
    :host([data-aurora-opal-active]) .board .description {
      color: var(--theme-text-secondary) !important;
    }
    :host([data-aurora-opal-active]) :is(#create-new-button-inline, .remix-button) {
      background: var(--aurora-glass-fill) !important;
      color: var(--theme-text-primary) !important;
      box-shadow: inset 0 1px 0 var(--aurora-glass-border) !important;
      backdrop-filter: var(--aurora-glass-backdrop) !important;
      -webkit-backdrop-filter: var(--aurora-glass-backdrop) !important;
    }
    :host([data-aurora-opal-active]) #create-new-button-inline .g-icon {
      color: var(--theme-text-primary) !important;
    }
  `;

  function updateHost(host) {
    const enabled = !!appearance?.enabled;
    host.toggleAttribute('data-aurora-opal-active', enabled);
    for (const name of tokens) {
      if (enabled) host.style.setProperty(name, appearance.tokens[name]);
      else host.style.removeProperty(name);
    }
  }

  const observer = new MutationObserver(records => {
    for (const record of records) for (const node of record.addedNodes) {
      if (node.nodeType === 1) scan(node);
    }
    for (const host of hosts) if (!host.isConnected) hosts.delete(host);
  });

  function scan(root) {
    const found = root.matches?.(hostSelector) ? [root] : [];
    found.push(...root.querySelectorAll(hostSelector));
    for (const host of found) {
      const shadow = host.shadowRoot;
      if (!shadow) continue;
      if (!styles.has(shadow)) {
        const style = document.createElement('style');
        style.setAttribute('data-aurora-opal-style', '');
        style.textContent = shadowCSS;
        shadow.append(style);
        styles.set(shadow, style);
        hosts.add(host);
        observer.observe(shadow, { childList: true, subtree: true });
      }
      updateHost(host);
      glassShadows?.observeShadowRoot(shadow, { element: boardSelector });
      scan(shadow);
    }
  }

  function apply(next) {
    if (typeof next.enabled !== 'boolean' || !next.tokens || typeof next.tokens !== 'object') return;
    if (tokens.some(name => typeof next.tokens[name] !== 'string' || next.tokens[name].length > 500)) return;
    appearance = next;
    const root = document.documentElement;
    root.toggleAttribute('data-aurora-opal-active', next.enabled);
    if (next.enabled) root.style.setProperty('color-scheme', next.light ? 'light' : 'dark');
    else root.style.removeProperty('color-scheme');
    hosts.forEach(updateHost);
    if (guest) {
      if (next.enabled) glassShadows?.start();
      else glassShadows?.stop();
      scan(document);
    }
    if (shell) forward(next, GUEST);
  }

  window.addEventListener('message', event => {
    if (event.origin === parentOrigin && event.source === window.parent && event.data?.type === APPEARANCE) apply(event.data);
    if (shell && event.origin === GUEST && event.data?.type === READY &&
        [...document.querySelectorAll('iframe')].some(frame => frameOrigin(frame) === GUEST && frame.contentWindow === event.source)) {
      if (appearance) forward(appearance, GUEST);
      else window.parent.postMessage({ type: READY }, parentOrigin);
    }
  });
  document.addEventListener('load', event => {
    if (shell && appearance && event.target?.tagName === 'IFRAME' && frameOrigin(event.target) === GUEST) forward(appearance, GUEST);
  }, true);
  if (guest) {
    observer.observe(document, { childList: true, subtree: true });
    scan(document);
    for (const name of hostSelector.split(', ')) {
      customElements.whenDefined(name).then(() => requestAnimationFrame(() => scan(document)));
    }
  }
  window.parent.postMessage({ type: READY }, parentOrigin);
})();
