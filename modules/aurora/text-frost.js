// Frost existing backdrop paint layers only while page text is visible behind them.
// Geometry and fill stay native. All layout reads precede material writes.
(() => {
  'use strict';
  const A = window.AuroraExt;
  const ATTRIBUTE = 'data-aurora-text-frost';
  const FILTER = 'blur(48px)';
  const PROPERTIES = ['backdrop-filter', '-webkit-backdrop-filter'];
  const SOURCE = '--aurora-backdrop-source';
  const IGNORE = 'script, style, noscript, template, #cgpt-ambient-bg';
  // Browser intersection tracking replaces full-history layout measurements.
  // Text is indexed once by its existing parent and only visible groups are read.
  const textGroups = new Map();
  let indexedTexts = new WeakMap();
  const tracked = new Set();
  const visibleNodes = new Set();
  const surfaceNodes = new Set();
  const deferredBranches = new Set();
  let indexedBranches = new WeakSet();
  let indexedElements = new WeakSet();
  let wordCache = new WeakMap();
  const pendingCollections = new Map();
  let collection = null;
  let collectionTask = 0;
  const surfaceSelector = [
    ...A.material.attributes.map(name => `[${name}]`),
    A.site.selectors?.material,
    '[data-aurora-image-viewer]', '[data-composer-surface-variant]',
    '[data-user-message-bubble]', '.user-message-bubble-color',
    '[class*="bg-"]', '[class*="surface"]', '[class*="backdrop"]',
    // The native Chat/Work indicator paints through its component class.
    '[role="group"]:has(> .bg-background-mode-toggle-track) > [class*="indicator-"]',
    '[class*="before:"]', '[class*="after:"]', '[style*="backdrop"]',
    '[role="menu"]', '[role="dialog"]', '[role="listbox"]', '[role="tooltip"]',
    '[data-summary-panel-variant]', '#cgpt-qs-panel', '#aurora-queue-panel',
  ].filter(Boolean).join(',');
  const messageSelector = [
    '[data-message-author-role], [data-message-id], [data-testid^="conversation-turn"], .agent-turn, [data-chatgpt-search-unit-key]',
    'model-response, user-query, ms-chat-turn, .qwen-chat-message, .ds-markdown, .font-claude-response, .message-bubble',
    A.site.workflow?.userMessage,
  ].filter(Boolean).join(',');
  const dirty = new Set();
  const layers = new Map();
  const frosted = new Map();
  const probedStyles = new WeakMap();
  let running = false;
  let unsubscribe = null;
  let timer = 0;
  let frame = 0;
  let idleTask = 0;
  let measurement = null;
  let revision = 0;
  let measurementRevision = 0;
  let overlapDirty = true;
  let interactionUntil = 0;
  let lastPass = 0;
  let observed = new Set();
  const resizeSizes = new WeakMap();
  const resize = new ResizeObserver(entries => {
    let changed = false;
    for (const { target, contentRect } of entries) {
      const key = `${contentRect.width}|${contentRect.height}`;
      const previous = resizeSizes.get(target);
      resizeSizes.set(target, key);
      // The pass that registered this node already measured its initial size.
      if (previous !== undefined && previous !== key) changed = true;
    }
    if (changed) schedule();
  });
  const materialObserver = new MutationObserver(records => {
    for (const record of records) {
      if (record.attributeName === 'style' && probedStyles.has(record.target) &&
          probedStyles.get(record.target) === record.target.getAttribute('style')) continue;
      if ((layers.get(record.target) || []).some(layer =>
        frosted.get(layer)?.writtenStyle === record.target.getAttribute('style')) && record.attributeName === 'style') continue;
      dirty.add(record.target);
    }
    if (dirty.size) schedule();
  });
  const viewportObserver = new IntersectionObserver(entries => {
    let changed = false;
    for (const { target, isIntersecting } of entries) {
      if (!target.isConnected) { forget(target); continue; }
      if (visibleNodes.has(target) === isIntersecting) continue;
      if (isIntersecting) {
        visibleNodes.add(target);
        if (deferredBranches.delete(target)) {
          indexedBranches.add(target);
          queueCollection(target, false, true);
        }
        if (surfaceNodes.has(target)) dirty.add(target);
      } else visibleNodes.delete(target);
      // Only message paint is suspended. Native geometry and all UI stay intact.
      if (target.closest(messageSelector) &&
          target.matches('[data-aurora-code-block], [data-aurora-glass], [data-aurora-surface="code"], [data-aurora-surface="message"], [data-user-message-bubble], .user-message-bubble-color')) {
        A.utils.toggleAttribute(target, 'data-aurora-offscreen', !isIntersecting);
      }
      changed = true;
    }
    if (changed) schedule();
  }, { rootMargin: '96px' });

  function active() {
    return running && A.isActive() && !document.hidden &&
      document.documentElement.classList.contains('cgpt-ambient-on');
  }

  function track(node, immediate = false) {
    if (!tracked.has(node)) {
      tracked.add(node);
      viewportObserver.observe(node);
    }
    // New menus need first-frame discovery. Let the normal read pass measure
    // them together instead of forcing layout once for every inserted node.
    if (immediate && surfaceNodes.has(node)) {
      visibleNodes.add(node);
      dirty.add(node);
    }
  }

  function indexText(text) {
    if (!text.nodeValue.trim()) return;
    let owner = text.parentElement;
    while (owner && (owner.classList.contains('contents') || owner.style.display === 'contents')) owner = owner.parentElement;
    if (!owner) return;
    if (indexedTexts.get(text) === owner && textGroups.get(owner)?.has(text)) return;
    textGroups.get(indexedTexts.get(text))?.delete(text);
    indexedTexts.set(text, owner);
    if (!textGroups.has(owner)) textGroups.set(owner, new Set());
    textGroups.get(owner).add(text);
    track(owner);
  }

  function forget(node) {
    viewportObserver.unobserve(node);
    tracked.delete(node);
    visibleNodes.delete(node);
    surfaceNodes.delete(node);
    deferredBranches.delete(node);
    textGroups.delete(node);
    dirty.delete(node);
    for (const layer of layers.get(node) || []) {
      const state = frosted.get(layer);
      if (state) restore(layer, state);
    }
    layers.delete(node);
    node.removeAttribute('data-aurora-offscreen');
  }

  function removeBranch(root) {
    if (root.nodeType !== 1 || root.isConnected) return;
    pendingCollections.delete(root);
    forget(root);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) if (tracked.has(node)) forget(node);
  }

  function* collect(root, immediate = false, enterMessages = false) {
    if (!root || root.nodeType !== 1 || root.closest(IGNORE)) return;
    const deferMessage = node => {
      if (enterMessages || !node.matches(messageSelector) || indexedBranches.has(node)) return false;
      if (visibleNodes.has(node)) { indexedBranches.add(node); return false; }
      deferredBranches.add(node);
      track(node);
      return true;
    };
    if (deferMessage(root)) return;
    const register = node => {
      indexedElements.add(node);
      if (node.matches(surfaceSelector) ||
          (node.matches('button, input, textarea, select, [role="button"], [role="menuitem"]') &&
           node.closest('[role="menu"], [role="dialog"], [role="tooltip"]'))) {
        surfaceNodes.add(node);
        track(node, immediate);
        if (visibleNodes.has(node)) dirty.add(node);
      }
    };
    register(root);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (node.nodeType === 1) {
          if (node.matches(IGNORE)) return NodeFilter.FILTER_REJECT;
          if (deferMessage(node)) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
        return node.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      },
    });
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!root.isConnected) return;
      if (node.nodeType === 1) register(node);
      else indexText(node);
      yield;
    }
  }

  // Indexing is optional work. Yield to input and the first page paint after a
  // small slice, including on provider pages without conversation-turn IDs.
  function drainCollections() {
    collectionTask = 0;
    if (!active()) return;
    const quietIn = interactionUntil - performance.now();
    if (quietIn > 0) { collectionTask = setTimeout(drainCollections, quietIn); return; }
    const deadline = performance.now() + 3;
    let steps = 0;
    do {
      if (!collection) {
        const entry = pendingCollections.entries().next().value;
        if (!entry) break;
        const [root, options] = entry;
        pendingCollections.delete(root);
        if (!root.isConnected) continue;
        collection = collect(root, options.immediate, options.enterMessages);
      }
      if (collection.next().done) collection = null;
    } while (++steps < 96 && performance.now() < deadline);
    if (dirty.size) schedule();
    if (collection || pendingCollections.size) collectionTask = setTimeout(drainCollections, 0);
  }

  function queueCollection(root, immediate = false, enterMessages = false) {
    if (!root || root.nodeType !== 1 || !root.isConnected || root.closest(IGNORE)) return;
    // Keep descendants of deferred messages behind their visibility boundary.
    const message = root.closest(messageSelector);
    if (!enterMessages && message && message !== root && !indexedBranches.has(message)) {
      if (visibleNodes.has(message)) {
        indexedBranches.add(message);
        deferredBranches.delete(message);
        queueCollection(message, immediate, true);
        return;
      }
      deferredBranches.add(message);
      track(message);
      return;
    }
    for (let parent = root.parentElement; parent; parent = parent.parentElement) {
      const pending = pendingCollections.get(parent);
      if (pending && (!immediate || pending.immediate) && (!enterMessages || pending.enterMessages)) return;
    }
    const previous = pendingCollections.get(root);
    for (const [pending, options] of pendingCollections) {
      // Keep a visible message's stronger traversal scoped to that message.
      // Widening an outer root would eagerly enter offscreen history too.
      if (pending !== root && root.contains(pending) &&
          (!options.immediate || immediate) && (!options.enterMessages || enterMessages)) {
        pendingCollections.delete(pending);
      }
    }
    pendingCollections.set(root, {
      immediate: immediate || !!previous?.immediate,
      enterMessages: enterMessages || !!previous?.enterMessages,
    });
    if (!collectionTask && active()) collectionTask = setTimeout(drainCollections, 0);
  }

  function schedule(delay = 0, urgent = false, geometry = true) {
    if (!active()) return;
    overlapDirty ||= geometry;
    revision++;
    if (urgent) {
      clearTimeout(timer);
      timer = 0;
      if (idleTask) A.utils.cancelIdleCallback(idleTask);
      idleTask = 0;
      if (!frame) frame = requestAnimationFrame(update);
      return;
    }
    if (timer || frame || idleTask) return;
    const wait = Math.max(delay, interactionUntil - performance.now(), 120 - (performance.now() - lastPass), 0);
    timer = setTimeout(() => {
      timer = 0;
      idleTask = A.utils.safeRequestIdleCallback(() => {
        idleTask = 0;
        if (performance.now() < interactionUntil) { schedule(); return; }
        update();
      }, { timeout: 500 });
    }, wait);
  }

  function onMutation({ mutations = [], addedElements = [], addedTexts = [] }) {
    const relevant = mutations.filter(m => m.type !== 'attributes' || m.attributeName !== 'style' ||
      !(layers.get(m.target) || []).some(layer => frosted.get(layer)?.writtenStyle === m.target.getAttribute('style')));
    if (mutations.length && !relevant.length) return;
    // Attribute changes do not rescan existing descendants. Structural changes
    // index only their added branch and release detached registrations.
    // Visible additions are collected by the orchestrator's post-tag refresh.
    // Keep hidden-tab additions pending until its next visibility update.
    if (document.hidden) for (const node of addedElements) queueCollection(node);
    for (const node of addedTexts) {
      const message = node.parentElement?.closest(messageSelector);
      if (message && !indexedBranches.has(message)) { queueCollection(message); continue; }
      indexText(node);
    }
    for (const m of relevant) {
      if (m.type === 'childList') for (const node of m.removedNodes) {
        if (node.nodeType === 3 && !node.isConnected) {
          textGroups.get(indexedTexts.get(node))?.delete(node);
          indexedTexts.delete(node);
        } else removeBranch(node);
      }
      if (m.type === 'attributes' && ['class', 'style', 'hidden', 'aria-hidden', 'data-state'].includes(m.attributeName) &&
          surfaceNodes.has(m.target) && visibleNodes.has(m.target)) dirty.add(m.target);
    }
    if (dirty.size || relevant.some(m => visibleNodes.has(m.target.nodeType === 1 ? m.target : m.target.parentElement))) schedule();
  }

  function intersection(a, b) {
    const left = Math.max(a.left, b.left);
    const top = Math.max(a.top, b.top);
    const right = Math.min(a.right, b.right);
    const bottom = Math.min(a.bottom, b.bottom);
    return right > left && bottom > top ? { left, top, right, bottom } : null;
  }

  // Computed colors serialize to rgb/rgba in Gecko. Modern slash alpha is also handled.
  function alpha(color) {
    if (!color || color === 'transparent') return 0;
    const match = color.match(/(?:,|\/)\s*([\d.]+)(%)?\s*\)$/);
    return color.startsWith('rgba(') || color.includes('/')
      ? (match ? Number(match[1]) / (match[2] ? 100 : 1) : 1) : 1;
  }

  function restore(layer, state) {
    const { node } = layer;
    for (const [property, saved] of state.saved) {
      // A host rerender may have already replaced our inline filter.
      if (node.style.getPropertyValue(property) !== FILTER ||
          node.style.getPropertyPriority(property) !== 'important') continue;
      if (saved.value) node.style.setProperty(property, saved.value, saved.priority);
      else node.style.removeProperty(property);
    }
    node.removeAttribute(layer.attribute);
    frosted.delete(layer);
  }

  function frost(layer) {
    const { node } = layer;
    let state = frosted.get(layer);
    if (!state) {
      state = { saved: new Map(), clearAt: 0, writtenStyle: '' };
      frosted.set(layer, state);
    }
    state.clearAt = 0;
    // Native token consumers can paint glass through host CSS. Direct material
    // overrides are allowed only on their already-existing backdrop layer.
    for (const property of layer.native ? PROPERTIES : []) {
      const value = node.style.getPropertyValue(property);
      const priority = node.style.getPropertyPriority(property);
      if (state.saved.has(property) && value === FILTER && priority === 'important') continue;
      state.saved.set(property, { value, priority });
      node.style.setProperty(property, FILTER, 'important');
    }
    A.utils.setAttribute(node, layer.attribute, 'true');
    state.writtenStyle = node.getAttribute('style');
  }

  function update() {
    frame = 0;
    if (!active() || !document.body) { measurement?.return(); measurement = null; return; }
    // Optional overlap detection yields while the user scrolls or types. Keep
    // existing paint stable until the input burst settles, including IO events.
    if (performance.now() < interactionUntil) { measurement?.return(); measurement = null; schedule(); return; }
    if (!measurement || measurementRevision !== revision) {
      measurement?.return();
      measurement = measureOverlap();
      measurementRevision = revision;
    }
    // Bound optional overlap work to short slices. Paint changes commit only
    // after a complete pass. A new host or input event discards stale reads.
    if (A.utils.advanceWork(measurement, 32, 3)) { measurement = null; return; }
    idleTask = A.utils.safeRequestIdleCallback(() => {
      idleTask = 0;
      update();
    }, { timeout: 500 });
  }

  function* measureOverlap() {
    const now = lastPass = performance.now();
    const pending = new Set(dirty);
    const viewport = { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
    const styles = new WeakMap();
    const boxes = new WeakMap();
    const visibility = new WeakMap();
    const style = node => {
      if (!styles.has(node)) styles.set(node, getComputedStyle(node));
      return styles.get(node);
    };
    const pseudoStyles = new Map();
    const layerStyle = layer => {
      if (!layer.pseudo) return style(layer.node);
      if (!pseudoStyles.has(layer)) pseudoStyles.set(layer, getComputedStyle(layer.node, layer.pseudo));
      return pseudoStyles.get(layer);
    };
    // Only ChatGPT's native composer consumes an unmarked backdrop token.
    // Probe that small branch once per material change. Changing the inherited
    // document token used to invalidate every element twice on each pass.
    const token = '--composer-layout-surface-backdrop-filter';
    const probes = [];
    if (document.documentElement.hasAttribute('data-aurora-zero-blur')) {
      for (const node of pending) {
        if (!node.isConnected || !visibleNodes.has(node) || !node.closest('[data-composer-surface-variant]')) continue;
        const s = style(node);
        if (s.getPropertyValue(SOURCE).trim() || s.backdropFilter !== 'none') continue;
        probes.push({ node, value: node.style.getPropertyValue(token), priority: node.style.getPropertyPriority(token) });
      }
      for (const { node } of probes) node.style.setProperty(token, 'blur(0px)', 'important');
    }
    try {
      for (const node of pending) {
        if (!node.isConnected || !visibleNodes.has(node)) continue;
        const previous = layers.get(node) || [];
        const next = [];
        for (const pseudo of ['', '::before', '::after']) {
          const s = pseudo ? getComputedStyle(node, pseudo) : style(node);
          if (pseudo && (s.content === 'none' || s.content === 'normal')) continue;
          // Native scroll fades are layout paint, even when their masked fill
          // or utility class originally included blur. Never restore a flat
          // inline frost over the CSS that clears those decorative edges.
          if (s.getPropertyValue('--aurora-scroll-edge').trim() === '1') continue;
          const source = s.getPropertyValue(SOURCE).trim();
          // Semantic roles and positioning shells alone never own a backdrop.
          const native = !pseudo && !source && s.backdropFilter !== 'none';
          if (!source && !native) continue;
          const layer = previous.find(item => item.pseudo === pseudo) || {
            node, pseudo, attribute: pseudo ? `${ATTRIBUTE}-${pseudo.slice(2)}` : ATTRIBUTE,
          };
          layer.native = native;
          if (native && !frosted.has(layer)) layer.nativeBackdrop = s.backdropFilter;
          const signature = [source || layer.nativeBackdrop, s.backgroundColor, s.backgroundImage,
            s.opacity, s.visibility, s.display, s.position, s.zIndex, s.transform,
            s.borderTopLeftRadius, s.borderTopRightRadius, s.borderBottomRightRadius, s.borderBottomLeftRadius,
            s.borderTopWidth, s.borderRightWidth, s.borderBottomWidth, s.borderLeftWidth,
            s.borderTopColor, s.borderRightColor, s.borderBottomColor, s.borderLeftColor].join('|');
          if (layer.signature !== signature) { layer.signature = signature; overlapDirty = true; }
          next.push(layer);
        }
        if (next.length) layers.set(node, next);
        else layers.delete(node);
        for (const layer of previous) if (!next.includes(layer)) {
          const state = frosted.get(layer);
          if (state) restore(layer, state);
          overlapDirty = true;
        }
        // Composer token probes stay atomic. Ordinary surface discovery can
        // yield between nodes without leaving temporary native style behind.
        if (!probes.length) yield;
      }
    } finally {
      for (const { node, value, priority } of probes) {
        if (value) node.style.setProperty(token, value, priority);
        else node.style.removeProperty(token);
        probedStyles.set(node, node.getAttribute('style'));
      }
    }
    for (const node of pending) dirty.delete(node);
    // Most pointer transitions do not change a surface's actual material.
    // Stop here instead of rebuilding text ranges, clipping and hit stacks.
    if (!overlapDirty) return;
    yield;
    const baseBackdrop = (node, s) => {
      const source = s.getPropertyValue(SOURCE).trim();
      if (source) return source !== 'none';
      const layer = (layers.get(node) || []).find(item => !item.pseudo && item.native);
      return (layer?.nativeBackdrop || s.backdropFilter) !== 'none';
    };
    const box = node => {
      if (!boxes.has(node)) boxes.set(node, node.getBoundingClientRect());
      return boxes.get(node);
    };
    const paintPaths = new WeakMap();
    const topLayers = new WeakMap();
    const topLayer = node => {
      if (!topLayers.has(node)) topLayers.set(node, node.closest(':modal, :popover-open'));
      return topLayers.get(node);
    };
    const paintPath = node => {
      if (paintPaths.has(node)) return paintPaths.get(node);
      const path = [];
      for (let current = node; current; current = current.parentElement) {
        const s = style(current);
        const positioned = s.position !== 'static';
        const parentDisplay = current.parentElement ? style(current.parentElement).display : '';
        const context = current === document.documentElement ||
          s.position === 'fixed' || s.position === 'sticky' ||
          (s.zIndex !== 'auto' && (positioned || /flex|grid/.test(parentDisplay))) ||
          Number(s.opacity) < 1 || s.transform !== 'none' || s.filter !== 'none' ||
          baseBackdrop(current, s) || s.isolation === 'isolate' ||
          s.mixBlendMode !== 'normal' || s.clipPath !== 'none' ||
          /paint|layout|strict|content/.test(s.contain) ||
          /transform|opacity|filter/.test(s.willChange);
        if (context || current === node) {
          const z = s.zIndex === 'auto' ? 0 : Number(s.zIndex) || 0;
          path.unshift({ node: current, z, phase: z < 0 ? 1 : z > 0 ? 6 : context || positioned ? 5 : 3 });
        }
      }
      paintPaths.set(node, path);
      return path;
    };
    // Hit testing omits pointer-transparent and inert background text. Resolve
    // those cases through stacking contexts instead of comparing bare z-indexes.
    function paintedAbove(a, b) {
      const aTop = topLayer(a);
      const bTop = topLayer(b);
      if (aTop !== bTop && (!aTop || !bTop)) return !!aTop;
      const left = paintPath(a);
      const right = paintPath(b);
      let i = 0;
      while (i < left.length && i < right.length && left[i].node === right[i].node) i++;
      if (i === left.length) return false;
      if (i === right.length) return true;
      const x = left[i];
      const y = right[i];
      if (x.phase !== y.phase) return x.phase > y.phase;
      if (x.z !== y.z) return x.z > y.z;
      return !!(x.node.compareDocumentPosition(y.node) & Node.DOCUMENT_POSITION_PRECEDING);
    }
    const visible = node => {
      if (!node) return { opacity: 1, clip: viewport };
      if (visibility.has(node)) return visibility.get(node);
      const result = { opacity: 1, clip: viewport };
      let escape = '';
      const top = topLayer(node);
      for (let current = node; current; current = current.parentElement) {
        const s = style(current);
        result.opacity *= Number(s.opacity);
        if (s.display === 'none' || s.contentVisibility === 'hidden') result.opacity = 0;
        // Overflow between an out-of-flow box and its containing block cannot
        // clip it. The same rule applies to its ordinary-flow text descendants.
        const containing = s.transform !== 'none' || s.perspective !== 'none' ||
          s.filter !== 'none' || baseBackdrop(current, s) ||
          /layout|paint|strict|content/.test(s.contain) ||
          /transform|perspective|filter/.test(s.willChange);
        if (current !== node && escape && (containing ||
            (escape === 'absolute' && s.position !== 'static'))) escape = '';
        const clips = !escape && (!top || top.contains(current)) &&
          s.display !== 'contents' && s.display !== 'inline' &&
          /(hidden|clip|scroll|auto)/.test(`${s.overflowX} ${s.overflowY}`);
        if (result.clip && clips) {
          const rect = box(current);
          const scaleX = current.offsetWidth ? rect.width / current.offsetWidth : 1;
          const scaleY = current.offsetHeight ? rect.height / current.offsetHeight : 1;
          const left = rect.left + current.clientLeft * scaleX;
          const clipTop = rect.top + current.clientTop * scaleY;
          result.clip = intersection(result.clip, {
            left: /(hidden|clip|scroll|auto)/.test(s.overflowX) ? left : viewport.left,
            right: /(hidden|clip|scroll|auto)/.test(s.overflowX) ? left + current.clientWidth * scaleX : viewport.right,
            top: /(hidden|clip|scroll|auto)/.test(s.overflowY) ? clipTop : viewport.top,
            bottom: /(hidden|clip|scroll|auto)/.test(s.overflowY) ? clipTop + current.clientHeight * scaleY : viewport.bottom,
          });
        }
        if (current === top) break;
        if (s.position === 'fixed' || s.position === 'absolute') escape = s.position;
      }
      visibility.set(node, result);
      return result;
    };

    const surfaces = [];
    for (const node of visibleNodes) {
      yield;
      const owners = layers.get(node);
      if (!owners) continue;
      const view = visible(node);
      if (view.opacity <= 0.01 || !view.clip) continue;
      const rect = intersection(box(node), view.clip);
      if (!rect) continue;
      for (const layer of owners) {
        const s = layerStyle(layer);
        if (s.getPropertyValue('--aurora-scroll-edge').trim() === '1') continue;
        if (s.visibility !== 'visible' || s.display === 'none' ||
            (layer.pseudo && Number(s.opacity) <= 0.01)) continue;
        if (!s.getPropertyValue(SOURCE).trim() && !layer.native) continue;
        surfaces.push({ node, layer, rect, conflict: false });
      }
    }

    const watch = new Set(surfaces.map(surface => surface.node));
    const range = document.createRange();
    const pointCache = new Map();
    function insideRoundedLayer(surface, x, y) {
      const rect = box(surface.node);
      const s = layerStyle(surface.layer);
      const corners = surface.corners ||= ['TopLeft', 'TopRight', 'BottomRight', 'BottomLeft'].map(corner => {
        const values = s[`border${corner}Radius`].split(/\s+/);
        const length = (value, size) => parseFloat(value) * (value.endsWith('%') ? size / 100 : 1) || 0;
        return [length(values[0], rect.width), length(values[1] || values[0], rect.height)];
      });
      const scale = Math.min(1, rect.width / (corners[0][0] + corners[1][0] || rect.width),
        rect.width / (corners[3][0] + corners[2][0] || rect.width),
        rect.height / (corners[0][1] + corners[3][1] || rect.height),
        rect.height / (corners[1][1] + corners[2][1] || rect.height));
      return corners.every(([rx, ry], index) => {
        rx *= scale; ry *= scale;
        if (!rx || !ry) return true;
        const left = index === 0 || index === 3;
        const top = index < 2;
        const dx = left ? x - rect.left : rect.right - x;
        const dy = top ? y - rect.top : rect.bottom - y;
        return dx >= rx || dy >= ry || ((dx - rx) / rx) ** 2 + ((dy - ry) / ry) ** 2 <= 1;
      });
    }
    function behind(surface, parent, overlap) {
      // Sampling inside word boxes also respects native rounded corners and clipping.
      const xs = [0.5, 0.15, 0.85];
      for (const fraction of xs) {
        const x = overlap.left + (overlap.right - overlap.left) * fraction;
        const y = (overlap.top + overlap.bottom) / 2;
        const key = `${x}|${y}`;
        if (!pointCache.has(key)) pointCache.set(key, document.elementsFromPoint(x, y));
        const stack = pointCache.get(key);
        const front = stack.findIndex(node => node === surface.node || surface.node.contains(node));
        // Decorative glass often has pointer-events:none. It still paints.
        // In that case use its native stacking context to locate the backdrop.
        const pointerless = front < 0;
        if (pointerless && (!insideRoundedLayer(surface, x, y) || !paintedAbove(surface.node, parent))) continue;
        let textOwner = parent;
        // Pointer-transparent labels still belong to their nearest hit-testable owner.
        while (textOwner && (style(textOwner).pointerEvents === 'none' ||
            style(textOwner).display === 'contents')) textOwner = textOwner.parentElement;
        const owner = textOwner && !textOwner.contains(surface.node) ? textOwner : parent;
        // Text can share a DOM ancestor with a floating menu. That ancestor's
        // descendants include the menu's foreground, not just background text.
        // Only the text owner's own box can anchor its position in the hit stack.
        const back = stack.indexOf(owner);
        if (!pointerless && (back >= 0 ? back <= front : !paintedAbove(surface.node, parent))) continue;
        let transmission = 1 - alpha(layerStyle(surface.layer).backgroundColor) * visible(surface.node).opacity;
        for (let i = pointerless ? 0 : front + 1; i < (back < 0 ? stack.length : back); i++) {
          const layer = stack[i];
          if (surface.node.contains(layer) || layer.contains(surface.node) || layer.contains(parent)) continue;
          if (pointerless && paintedAbove(layer, surface.node)) continue;
          if (back < 0 && !paintedAbove(layer, parent)) continue;
          const s = style(layer);
          transmission *= 1 - alpha(s.backgroundColor) * visible(layer).opacity;
        }
        if (transmission > 0.03) return true;
      }
      return false;
    }

    // A viewport grid is a broad phase only. The existing clipping, stacking,
    // rounded-corner and word-level checks still decide every conflict.
    // Keep document order so early exits and hit sampling stay deterministic.
    const cellSize = 128;
    const columns = Math.max(1, Math.ceil(innerWidth / cellSize));
    const rows = Math.max(1, Math.ceil(innerHeight / cellSize));
    const cells = new Map();
    const useGrid = surfaces.length >= 8;
    const cellBounds = rect => [
      Math.max(0, Math.min(columns - 1, Math.floor(rect.left / cellSize))),
      Math.max(0, Math.min(rows - 1, Math.floor(rect.top / cellSize))),
      Math.max(0, Math.min(columns - 1, Math.floor(rect.right / cellSize))),
      Math.max(0, Math.min(rows - 1, Math.floor(rect.bottom / cellSize))),
    ];
    if (useGrid) surfaces.forEach((surface, index) => {
      const [left, top, right, bottom] = cellBounds(surface.rect);
      for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
        const key = y * columns + x;
        if (!cells.has(key)) cells.set(key, []);
        cells.get(key).push(index);
      }
    });
    const visits = new Uint32Array(surfaces.length);
    let visit = 0;
    const nearbySurfaces = (node, bounds) => {
      const linear = () => surfaces.filter(surface => !surface.conflict && !surface.node.contains(node) &&
        (!bounds.width || !bounds.height || intersection(bounds, surface.rect)));
      // Display-contents and overflowing zero-size text owners use the original
      // conservative search. Their text range supplies the actual geometry.
      if (!useGrid || !bounds.width || !bounds.height) return linear();
      const indices = [];
      const [left, top, right, bottom] = cellBounds(bounds);
      // Large text boxes and heavily overlapping layers favor a linear pass.
      // Avoid visiting the same dense bucket across many viewport cells.
      if ((right - left + 1) * (bottom - top + 1) > 16) return linear();
      visit++;
      for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
        const cell = cells.get(y * columns + x);
        if (!cell) continue;
        if (cell.length >= surfaces.length / 2) return linear();
        for (const index of cell) {
          if (visits[index] === visit) continue;
          visits[index] = visit;
          const surface = surfaces[index];
          if (!surface.conflict && intersection(bounds, surface.rect) && !surface.node.contains(node)) indices.push(index);
        }
      }
      return indices.sort((a, b) => a - b).map(index => surfaces[index]);
    };

    // Discover text lazily. Once every surface has a conflict, later text
    // groups need neither layout reads nor temporary arrays.
    function* nearbyTexts() {
      for (const node of visibleNodes) {
        yield null;
        const group = textGroups.get(node);
        if (!group) continue;
        const bounds = box(node);
        const nearby = nearbySurfaces(node, bounds);
        if (!nearby.length) continue;
        for (const text of group) {
          if (!text.isConnected) group.delete(text);
          else yield { text, nearby };
        }
      }
    }
    let unresolved = surfaces.length;
    for (const item of nearbyTexts()) {
      if (!unresolved) break;
      yield;
      if (!item) continue;
      const { text, nearby: candidates } = item;
      const parent = text.parentElement;
      if (!parent || parent.closest(IGNORE) || !text.nodeValue.trim()) continue;
      const nearby = candidates.filter(surface => !surface.conflict);
      if (!nearby.length) continue;
      const bounds = box(parent);
      if (bounds.width && bounds.height && !nearby.some(surface => intersection(bounds, surface.rect))) continue;
      const s = style(parent);
      const view = visible(parent);
      if (s.visibility !== 'visible' || view.opacity * alpha(s.color) <= 0.01 || !view.clip) continue;
      range.selectNodeContents(text);
      const lines = Array.from(range.getClientRects()).map(rect => intersection(rect, view.clip)).filter(Boolean);
      const targets = nearby.filter(surface => lines.some(rect => intersection(rect, surface.rect)) &&
        (parent.contains(surface.node) || paintedAbove(surface.node, parent)));
      if (!targets.length) continue;
      watch.add(parent);
      let cachedWords = wordCache.get(text);
      if (cachedWords?.value !== text.nodeValue) {
        cachedWords = { value: text.nodeValue, words: Array.from(text.nodeValue.matchAll(/\S+/gu),
          match => ({ start: match.index, end: match.index + match[0].length })) };
        wordCache.set(text, cachedWords);
      }
      const words = cachedWords.words;
      // Subdivide only text fragments near a surface. Long messages stay cheap.
      function* search(surface, first, last) {
        if (first > last) return false;
        yield;
        range.setStart(text, words[first].start);
        range.setEnd(text, words[last].end);
        const overlaps = Array.from(range.getClientRects()).map(rect => {
          const clipped = intersection(rect, view.clip);
          return clipped && intersection(clipped, surface.rect);
        }).filter(Boolean);
        if (!overlaps.length) return false;
        if (first === last) return overlaps.some(overlap => behind(surface, parent, overlap));
        const middle = (first + last) >> 1;
        return (yield* search(surface, first, middle)) || (yield* search(surface, middle + 1, last));
      }
      for (const surface of targets) {
        surface.conflict = yield* search(surface, 0, words.length - 1);
        if (surface.conflict) unresolved--;
      }
    }

    // Changing blur must never change the overlap decision, avoiding feedback flicker.
    let watchChanged = false;
    for (const node of observed) if (!watch.has(node)) { resize.unobserve(node); watchChanged = true; }
    for (const node of watch) if (!observed.has(node)) { resize.observe(node); watchChanged = true; }
    if (watchChanged) {
      materialObserver.disconnect();
      for (const node of watch) if (surfaceNodes.has(node)) materialObserver.observe(node, { attributes: true, attributeFilter: ['class', 'style'] });
    }
    observed = watch;
    const conflicts = new Set(surfaces.filter(surface => surface.conflict).map(surface => surface.layer));
    const present = new Set(surfaces.map(surface => surface.layer));
    for (const layer of conflicts) {
      frost(layer);
    }
    let settling = false;
    for (const [layer, state] of frosted) {
      if (conflicts.has(layer)) continue;
      if (!layer.node.isConnected || !present.has(layer)) { restore(layer, state); continue; }
      if (!state.clearAt) state.clearAt = now + 180;
      if (now >= state.clearAt) { restore(layer, state); }
      else settling = true;
    }
    overlapDirty = false;
    if (settling) schedule(180);
  }

  const onChange = event => {
    if (!active() || event?.target?.closest?.(IGNORE)) return;
    if (['scroll', 'wheel', 'touchmove', 'keydown', 'input'].includes(event?.type)) {
      interactionUntil = performance.now() + 100;
      // Actual scroll and input events invalidate layout. A key press or
      // wheel over a non-scrolling control only asks existing work to yield.
      if (event.type === 'scroll' || event.type === 'input') schedule();
      return;
    }
    if (event?.type === 'resize' || (event?.type === 'load' && event.target?.tagName === 'LINK')) {
      for (const node of visibleNodes) if (surfaceNodes.has(node)) dirty.add(node);
    }
    if (event?.target?.nodeType === 1 && !event.target.closest(IGNORE) &&
        ['pointerover', 'pointerout', 'pointerdown', 'focusin', 'transitionend', 'animationend'].includes(event.type)) {
      let changed = false;
      for (let node = event.target; node; node = node.parentElement) {
        if (!surfaceNodes.has(node) || !visibleNodes.has(node)) continue;
        // Moving between children does not change the parent's hover material.
        if (event.type.startsWith('pointer') && event.relatedTarget?.nodeType && node.contains(event.relatedTarget)) continue;
        dirty.add(node);
        changed = true;
      }
      if (!changed) return;
    }
    if (!collectionTask && (collection || pendingCollections.size)) collectionTask = setTimeout(drainCollections, 0);
    schedule(0, false, !['pointerover', 'pointerout', 'pointerdown', 'focusin'].includes(event?.type));
  };
  const events = ['scroll', 'resize', 'pointerover', 'pointerout', 'pointerdown', 'focusin',
    'wheel', 'touchmove', 'keydown', 'input', 'load', 'visibilitychange', 'pageshow', 'transitionend', 'animationend'];
  function start() {
    if (running) { refresh(document.body); return; }
    running = true;
    queueCollection(document.body);
    unsubscribe = A.centralObserver.subscribe(onMutation);
    for (const event of events) window.addEventListener(event, onChange, { capture: true, passive: true });
    document.fonts?.addEventListener('loadingdone', onChange);
    refresh();
  }

  function stop() {
    running = false;
    clearTimeout(timer);
    clearTimeout(collectionTask);
    cancelAnimationFrame(frame);
    if (idleTask) A.utils.cancelIdleCallback(idleTask);
    idleTask = 0;
    measurement?.return();
    measurement = null;
    revision++;
    interactionUntil = 0;
    timer = frame = 0;
    collectionTask = 0;
    collection = null;
    pendingCollections.clear();
    unsubscribe?.();
    unsubscribe = null;
    resize.disconnect();
    materialObserver.disconnect();
    viewportObserver.disconnect();
    observed.clear();
    for (const node of tracked) node.removeAttribute('data-aurora-offscreen');
    tracked.clear();
    visibleNodes.clear();
    surfaceNodes.clear();
    deferredBranches.clear();
    indexedBranches = new WeakSet();
    indexedElements = new WeakSet();
    textGroups.clear();
    indexedTexts = new WeakMap();
    wordCache = new WeakMap();
    dirty.clear();
    for (const [layer, state] of frosted) restore(layer, state);
    layers.clear();
    overlapDirty = true;
    for (const event of events) window.removeEventListener(event, onChange, true);
    document.fonts?.removeEventListener('loadingdone', onChange);
  }
  function refresh(root) {
    if (!active()) return;
    const popups = '[role="menu"], [role="dialog"], [role="tooltip"], [role="listbox"]';
    let opening = false;
    for (const node of Array.isArray(root) ? root : [root]) {
      if (node?.nodeType !== 1) continue;
      const immediate = node !== document.body && !node.closest(messageSelector);
      queueCollection(node, immediate);
      opening ||= immediate && !!(node.closest(popups) || node.querySelector(popups));
      for (let parent = node; parent; parent = parent.parentElement) if (surfaceNodes.has(parent) && visibleNodes.has(parent)) dirty.add(parent);
    }
    if (!root) for (const node of visibleNodes) if (surfaceNodes.has(node)) dirty.add(node);
    if (!collectionTask && (collection || pendingCollections.size)) collectionTask = setTimeout(drainCollections, 0);
    schedule(0, opening);
  }
  function refreshState(roots) {
    if (!active()) return;
    for (const root of roots) {
      if (!indexedElements.has(root)) { queueCollection(root, true); continue; }
      for (const node of A.utils.matchingElements(root, surfaceSelector)) {
        surfaceNodes.add(node);
        track(node);
        if (visibleNodes.has(node)) dirty.add(node);
      }
    }
    schedule();
  }
  A.textFrost = { start, stop, schedule, refresh, refreshState };
})();
