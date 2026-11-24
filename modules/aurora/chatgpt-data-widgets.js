// Health renders its records in a sandbox document with a same-origin preview.
// Share material settings only, scoped to first-party data pages.
(() => {
  'use strict';

  const CHATGPT = 'https://chatgpt.com';
  const READY = 'AURORA_DATA_WIDGET_READY';
  const MATERIAL = 'AURORA_DATA_WIDGET_MATERIAL';
  const TOKENS = {
    '--aurora-glass-fill': 'background-color',
    '--aurora-glass-border': 'border-top-color',
    '--aurora-glass-shadow': 'box-shadow',
    '--aurora-glass-backdrop': 'backdrop-filter',
  };
  const tokenNames = Object.keys(TOKENS);

  function isSandbox(url) {
    return url.protocol === 'https:' && !url.port && url.pathname === '/' &&
      /^(?:(?:connector-id-)?[0-9a-f]{32}\.)?web-sandbox\.oaiusercontent\.com$/.test(url.hostname) &&
      url.searchParams.get('app') === 'chatgpt';
  }

  if (location.origin === CHATGPT) {
    const A = window.AuroraExt;
    const knownFrames = new Map();
    const scope = 'main, [data-app-shell-focus-area="main"], dialog, [role="dialog"]';
    const message = '[data-message-id], [data-message-author-role]';

    function send(frame) {
      const src = new URL(frame.src, location.href);
      if (!isSandbox(src)) {
        knownFrames.delete(frame);
        return;
      }
      const root = document.documentElement;
      const enabled = A.glass.isDataRoute() && root.classList.contains('cgpt-ambient-on') &&
        frame.closest(scope) && !frame.closest(message);
      if (!enabled && !knownFrames.has(frame)) return;
      const style = enabled ? getComputedStyle(root) : null;
      const tokens = style && Object.fromEntries(tokenNames.map(name => [name, style.getPropertyValue(name).trim()]));
      const key = JSON.stringify(tokens);
      if (knownFrames.get(frame) !== key) frame.contentWindow?.postMessage({ type: MATERIAL, tokens }, src.origin);
      if (enabled) knownFrames.set(frame, key);
      else knownFrames.delete(frame);
    }

    function sync() {
      for (const frame of knownFrames.keys()) if (!frame.isConnected) knownFrames.delete(frame);
      if (A.glass.isDataRoute()) document.querySelectorAll('iframe[src]').forEach(send);
      else knownFrames.forEach((_, frame) => send(frame));
    }

    A.chatGPTDataWidgets = { sync };
    document.addEventListener('load', event => {
      if (event.target?.tagName !== 'IFRAME') return;
      if (!knownFrames.delete(event.target) && !A.glass.isDataRoute()) return;
      send(event.target);
    }, true);
    window.addEventListener('message', event => {
      if (!A.glass.isDataRoute() || event.data?.type !== READY) return;
      for (const frame of document.querySelectorAll('iframe[src]')) {
        if (frame.contentWindow !== event.source || new URL(frame.src, location.href).origin !== event.origin) continue;
        knownFrames.delete(frame);
        send(frame);
        break;
      }
    });
    return;
  }

  if (window.parent === window || !isSandbox(new URL(location.href))) return;

  const PAINT = 'data-aurora-widget-paint';
  const GLASS = `[${PAINT}="glass"]`;
  const CAST = '--aurora-cast-glass';
  const paintTokens = [...tokenNames, CAST];
  const PREVIEW = 'iframe#root';
  const SURFACES = 'div, main, section, article, table, ul, li';
  const NATIVE_CONTROLS = 'button, a, [role="img"], [role="switch"], [role="tablist"], [role="tab"], [role="option"], [aria-checked], [aria-pressed], [aria-selected], [contenteditable], [hidden], [aria-hidden="true"]';
  const CANVAS_CSS = ':root, body { background-color: transparent !important; }';
  const PREVIEW_CSS = `${CANVAS_CSS}
    [${PAINT}="canvas"] { background-color: transparent !important; }
    ${GLASS} {
      background-color: var(--aurora-glass-fill) !important;
      box-shadow: inset 0 0 0 1px var(--aurora-glass-border), var(--aurora-cast-glass) !important;
    }
    ${GLASS}:not(:where(${GLASS} *)) {
      backdrop-filter: var(--aurora-glass-backdrop) !important;
    }`;

  let tokens = null;
  let canvasSheet = null;
  let pending = 0;
  const previews = new Map();

  function addSheet(doc, css) {
    const sheet = new doc.defaultView.CSSStyleSheet();
    sheet.replaceSync(css);
    doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, sheet];
    return sheet;
  }

  function removeSheet(doc, sheet) {
    doc.adoptedStyleSheets = doc.adoptedStyleSheets.filter(item => item !== sheet);
  }

  function detach(frame, state) {
    state.observer.disconnect();
    state.shadows.stop();
    removeSheet(state.doc, state.sheet);
    for (const node of state.marked) node.removeAttribute(PAINT);
    for (const name of paintTokens) state.root?.style.removeProperty(name);
    previews.delete(frame);
  }

  function solid(color) {
    if (color === 'transparent') return false;
    const alpha = color.includes('/') ? color.split('/').pop().slice(0, -1).trim() :
      color.startsWith('rgba(') ? color.slice(5, -1).split(',').pop().trim() : '1';
    return parseFloat(alpha) >= (alpha.endsWith('%') ? 50 : 0.5);
  }

  function paint(state) {
    const { doc, sheet } = state;
    const root = doc.documentElement;
    if (!root || !doc.body) return;
    if (root !== state.root) {
      for (const name of paintTokens) state.root?.style.removeProperty(name);
      state.root = root;
    }
    const marker = getComputedStyle(document.documentElement).getPropertyValue(CAST).trim();
    if (root.style.getPropertyValue(CAST) !== marker) root.style.setProperty(CAST, marker);
    for (const name of tokenNames) {
      if (root.style.getPropertyValue(name) !== tokens[name]) root.style.setProperty(name, tokens[name]);
    }

    const next = new Map();
    // Only unbroken app wrappers can own the full preview canvas. Rounded or
    // bordered owners retain their own translucent fill, including nested cards.
    const shells = new Set();
    for (let node = doc.body; node;) {
      const children = [...node.children].filter(child => !child.matches('script, style, link, template, [hidden]'));
      node = children.length === 1 && children[0].matches(SURFACES) ? children[0] : null;
      if (!node) break;
      shells.add(node);
    }
    sheet.disabled = true;
    try {
      for (const node of doc.body.querySelectorAll(SURFACES)) {
        if (!node.firstElementChild || node.closest(NATIVE_CONTROLS)) continue;
        const style = doc.defaultView.getComputedStyle(node);
        if (style.display === 'none' || style.display === 'contents' || style.backgroundImage !== 'none' || !solid(style.backgroundColor)) continue;
        const rounded = ['TopLeft', 'TopRight', 'BottomLeft', 'BottomRight'].some(corner =>
          parseFloat(style[`border${corner}Radius`]) > 0);
        const bordered = ['Top', 'Right', 'Bottom', 'Left'].every(side => parseFloat(style[`border${side}Width`]) > 0);
        if (rounded || bordered) next.set(node, 'glass');
        else if (shells.has(node)) next.set(node, 'canvas');
      }
    } finally {
      sheet.disabled = false;
    }
    for (const node of state.marked) if (!next.has(node)) node.removeAttribute(PAINT);
    for (const [node, value] of next) if (node.getAttribute(PAINT) !== value) node.setAttribute(PAINT, value);
    state.marked = new Set(next.keys());
  }

  function updatePreviews() {
    pending = 0;
    if (!tokens) return;
    for (const [frame, state] of previews) {
      if (!frame.isConnected || frame.contentDocument !== state.doc) detach(frame, state);
    }
    for (const frame of document.querySelectorAll(PREVIEW)) {
      const doc = frame.contentDocument;
      if (!doc?.defaultView || !doc.body) continue;
      let state = previews.get(frame);
      if (!state) {
        const shadows = window.AuroraExt.createGlassShadows({ document: doc, selectors: { element: GLASS }, anchorShadows: true });
        state = { doc, sheet: addSheet(doc, PREVIEW_CSS), observer: new MutationObserver(schedule),
          marked: new Set(), shadows };
        state.observer.observe(doc, { subtree: true, childList: true, attributes: true,
          attributeFilter: ['class', 'style', 'hidden', 'aria-hidden', 'aria-checked', 'aria-pressed', 'aria-selected'] });
        previews.set(frame, state);
        shadows.start();
      }
      paint(state);
    }
  }

  function schedule() {
    if (tokens && !pending) pending = requestAnimationFrame(updatePreviews);
  }

  const observer = new MutationObserver(schedule);
  window.addEventListener('message', event => {
    if (event.origin !== CHATGPT || event.source !== window.parent || event.data?.type !== MATERIAL) return;
    const incoming = event.data.tokens;
    if (incoming && !tokenNames.every(name => typeof incoming[name] === 'string' &&
        incoming[name].length <= 1000 && CSS.supports(TOKENS[name], incoming[name]))) return;
    tokens = incoming;
    if (tokens) {
      canvasSheet ??= addSheet(document, CANVAS_CSS);
      observer.observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-preview-ready'] });
      document.addEventListener('load', schedule, true);
      schedule();
    } else if (canvasSheet) {
      observer.disconnect();
      document.removeEventListener('load', schedule, true);
      if (pending) cancelAnimationFrame(pending);
      pending = 0;
      for (const [frame, state] of previews) detach(frame, state);
      removeSheet(document, canvasSheet);
      canvasSheet = null;
    }
  });
  window.parent.postMessage({ type: READY }, CHATGPT);
})();
