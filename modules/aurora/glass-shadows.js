// Paint Aurora's outer shadows outside native clip trees and hit areas.
(() => {
  'use strict';
  const A = window.AuroraExt ||= {};
  const planeId = 'aurora-glass-shadows';
  const nativeAttribute = 'data-aurora-self-shadow';
  const messageBoxes = '[data-user-message-bubble], .user-message-bubble-color, [data-aurora-surface="message"], [data-markdown-copy="inline-code"], .markdown code, .prose code';
  const shadowTokens = {
    101: '--aurora-glass-shadow',
    102: '--sidebar-glass-shadow',
    103: '--glass-shadow',
    104: '--composer-shadow',
    105: '--aurora-control-shadow',
    106: '--aurora-detail-shadow',
    107: '--switch-glider-shadow',
  };
  const castMarker = /(?:^|\s)0px 0px 0px -(\d+)px\b/;
  const corners = ['TopLeft', 'TopRight', 'BottomRight', 'BottomLeft'];
  const geometryProperty = /^(?:--aurora-shadow-pulse|box-shadow|transform(?:-origin)?|translate|rotate|scale|opacity|visibility|zoom|(?:min-|max-)?(?:width|height)|top|right|bottom|left|inset(?:-.+)?|margin(?:-.+)?|padding(?:-.+)?|border-(?:(?:top|right|bottom|left)-width|(?:top|bottom)-(?:left|right)-radius))$/;
  const planeStyle = {
    all: 'initial', position: 'fixed', inset: '0', 'z-index': '2147483647',
    overflow: 'visible', 'pointer-events': 'none',
  };
  const layerStyle = 'div{position:absolute;left:0;top:0;transform-origin:0 0;pointer-events:none}';
  const occludingDialog = '[role="dialog"][aria-modal="true"]';
  const anchorStyle = `
    [popover] {
      position: fixed;
      position-anchor: auto;
      inset: auto;
      left: anchor(left, -1000000px);
      top: anchor(top, -1000000px);
      position-visibility: anchors-visible;
      width: 0;
      height: 0;
      margin: 0;
      padding: 0;
      border: 0;
      background: none;
      overflow: visible;
      pointer-events: none;
    }
    [popover]::backdrop { display: none; }
  `;

  const parentOf = node => node.assignedSlot || node.parentElement || node.getRootNode().host;
  const px = value => parseFloat(value) || 0;

  // Only decorations lost between a source and its scrolling paint host need
  // a second paint. Native overflow:hidden does not clip a box's own shadow.
  function intermediateClip(node, host, styleOf) {
    const clip = { left: -Infinity, top: -Infinity, right: Infinity, bottom: Infinity };
    for (let n = parentOf(node); n && n !== host; n = parentOf(n)) {
      const s = styleOf(n);
      if (s.display === 'contents') continue;
      if (s.clipPath !== 'none' || s.maskImage !== 'none' || s.transform !== 'none') return null;
      const paint = /paint|strict|content/.test(s.contain) || s.contentVisibility === 'auto';
      const x = paint || s.overflowX !== 'visible', y = paint || s.overflowY !== 'visible';
      if (!x && !y) continue;
      if (px(s.overflowClipMargin) || (x && y && corners.some(c => px(s[`border${c}Radius`])))) return null;
      const r = n.getBoundingClientRect();
      if (x) {
        clip.left = Math.max(clip.left, r.left + px(s.borderLeftWidth));
        clip.right = Math.min(clip.right, r.right - px(s.borderRightWidth));
      }
      if (y) {
        clip.top = Math.max(clip.top, r.top + px(s.borderTopWidth));
        clip.bottom = Math.min(clip.bottom, r.bottom - px(s.borderBottomWidth));
      }
    }
    return clip;
  }

  // The outer polygon covers all visible ink. The inner hole removes every
  // pixel already painted by the native box, including the entire box itself.
  function escapedInk(bounds, clip, shadow, viewport) {
    // Bound the mask to the shadow for ordinary pixel-valued tokens. For a
    // custom expression, conservatively cover the entire visible viewport.
    const tokens = shadow.replace(/(?:rgba?|hsla?|color)\([^()]*\)/gi, '').trim().split(/\s+/);
    const pad = tokens.every(t => /^-?(?:\d*\.)?\d+(?:px)?$/.test(t))
      ? 2 + 2 * tokens.reduce((sum, t) => sum + Math.abs(px(t)), 0)
      : 2 * Math.max(viewport.innerWidth, viewport.innerHeight, bounds.width, bounds.height);
    const left = Math.max(clip.left - bounds.left, -pad), top = Math.max(clip.top - bounds.top, -pad);
    const right = Math.min(clip.right - bounds.left, bounds.width + pad);
    const bottom = Math.min(clip.bottom - bounds.top, bounds.height + pad);
    if (left === -pad && top === -pad && right === bounds.width + pad && bottom === bounds.height + pad) return null;
    if (left >= right || top >= bottom) return '';
    const rect = (x, y, r, b) => `${x}px ${y}px,${r}px ${y}px,${r}px ${b}px,${x}px ${b}px,${x}px ${y}px`;
    return `clip-path:polygon(evenodd,${rect(-pad,-pad,bounds.width+pad,bounds.height+pad)},${rect(left,top,right,bottom)});`;
  }

  function boxSize(style, axis, fallback) {
    const size = style[axis];
    if (!size.endsWith('px')) return fallback;
    const edges = axis === 'width' ? ['Left', 'Right'] : ['Top', 'Bottom'];
    return px(size) + (style.boxSizing === 'border-box' ? 0 : edges.reduce((sum, edge) =>
      sum + px(style[`padding${edge}`]) + px(style[`border${edge}Width`]), 0));
  }

  function linearTransform(style, inherited) {
    if (style.transform === 'none' && style.rotate === 'none' && style.scale === 'none') return inherited;
    const matrix = style.transform === 'none' ? new DOMMatrix() : new DOMMatrix(style.transform);
    if (!matrix.is2D) return inherited;
    const scale = style.scale === 'none' ? [] : style.scale.split(' ').map(Number);
    const angle = style.rotate.match(/^(?:z )?(-?[\d.]+)(deg|grad|rad|turn)$/);
    const degrees = angle ? Number(angle[1]) * { deg: 1, grad: .9, rad: 180 / Math.PI, turn: 360 }[angle[2]] : 0;
    // The measured bounds provide the translation. Only copy the linear part.
    return (inherited || new DOMMatrix()).rotate(degrees).scale(scale[0] ?? 1, scale[1] ?? scale[0] ?? 1)
      .multiply(new DOMMatrix([matrix.a, matrix.b, matrix.c, matrix.d, 0, 0]));
  }

  function shadowGeometry(node, style, box, matrix, pseudo, rect, fragment, count, origin) {
    const width = fragment ? rect.width : boxSize(box, 'width', node.offsetWidth);
    const height = fragment ? rect.height : boxSize(box, 'height', node.offsetHeight);
    if (!(width > 0 && height > 0 && rect.width > 0 && rect.height > 0)) return '';
    let { a, b, c, d } = matrix || { a: 1, b: 0, c: 0, d: 1 };
    const extentX = Math.abs(a * width) + Math.abs(c * height);
    const extentY = Math.abs(b * width) + Math.abs(d * height);
    if (!extentX || !extentY) return '';
    // Account for CSS zoom and fractional layout without rounding the shadow.
    const sx = rect.width / extentX;
    const sy = rect.height / extentY;
    a *= sx; c *= sx; b *= sy; d *= sy;
    let x = rect.left - (origin?.left ?? 0) - Math.min(0, a * width) - Math.min(0, c * height);
    let y = rect.top - (origin?.top ?? 0) - Math.min(0, b * width) - Math.min(0, d * height);
    let w = width, h = height;
    if (pseudo) {
      // These native paint layers are absolutely positioned on their owners.
      const borderLeft = px(box.borderLeftWidth), borderTop = px(box.borderTopWidth);
      const innerWidth = width - borderLeft - px(box.borderRightWidth);
      const innerHeight = height - borderTop - px(box.borderBottomWidth);
      w = boxSize(style, 'width', innerWidth);
      h = boxSize(style, 'height', innerHeight);
      const left = borderLeft + (style.left === 'auto' ? innerWidth - w - px(style.right) : px(style.left)) + px(style.marginLeft);
      const top = borderTop + (style.top === 'auto' ? innerHeight - h - px(style.bottom) : px(style.top)) + px(style.marginTop);
      x += a * left + c * top;
      y += b * left + d * top;
    }
    const rtl = style.direction === 'rtl';
    const radii = corners.map(corner => {
      if (fragment && style.boxDecorationBreak !== 'clone') {
        const firstSide = corner.endsWith('Left') !== rtl;
        if (firstSide ? count.first : count.last) return style[`border${corner}Radius`].split(' ');
        return ['0px'];
      }
      return style[`border${corner}Radius`].split(' ');
    });
    const horizontal = radii.map(radius => radius[0]).join(' ');
    const vertical = radii.map(radius => radius[1] || radius[0]).join(' ');
    const scaleX = origin?.scaleX || 1, scaleY = origin?.scaleY || 1;
    return `width:${w}px;height:${h}px;transform:matrix(${a/scaleX},${b/scaleY},${c/scaleX},${d/scaleY},${x/scaleX},${y/scaleY});border-radius:${horizontal}/${vertical};`;
  }

  function create({ selectors = {}, document: doc = document, anchorShadows = false } = {}) {
    const view = doc.defaultView;
    const getComputedStyle = view.getComputedStyle.bind(view);
    const anchored = anchorShadows && view.CSS.supports('top', 'anchor(top)') &&
      view.CSS.supports('position-anchor', 'auto');
    const anchorGroups = new WeakMap();
    const scrollPlanes = new Map();
    const nativeSources = new Set();
    const planeNodes = new WeakSet();
    const roots = new Map();
    function makeSelectors(parts) {
      const entries = Object.entries(parts).filter(([, selector]) => selector)
        .map(([part, selector]) => [part, `:is(${selector})`]);
      const candidates = entries.map(([, selector]) => selector).join(',');
      const attributes = new Set(['class', 'style', 'id', 'open', 'hidden', 'aria-hidden', 'aria-modal', 'role', 'slot',
        'aria-controls', 'aria-describedby', 'aria-expanded']);
      if (anchorShadows) attributes.add('data-is-intersecting');
      for (const [, attribute] of candidates.matchAll(/\[([a-z_][\w-]*)/gi)) attributes.add(attribute);
      return { entries, candidates, attributes: [...attributes] };
    }
    const documentSelectors = makeSelectors(selectors);
    const partsFor = node => roots.get(node.getRootNode()) || documentSelectors;
    const owners = new Map();
    const visible = new Set();
    const pending = new Set();
    const animations = new Set();
    let ancestors = new WeakSet();
    let controller, plane, paintRoot, lastModal, frame = 0, promote = false, prune = false;

    const resize = new view.ResizeObserver(() => schedule());
    const flowResize = new view.ResizeObserver(() => schedule());
    const intersection = new view.IntersectionObserver(entries => {
      for (const { target, isIntersecting } of entries) {
        if (!owners.has(target)) continue;
        if (isIntersecting) {
          visible.add(target);
          resize.observe(target, { box: 'border-box' });
        } else {
          visible.delete(target);
          resize.unobserve(target);
          clear(owners.get(target));
          if (nativeSources.delete(target)) target.removeAttribute(nativeAttribute);
        }
      }
      schedule();
    }, anchored ? { rootMargin: '96px', scrollMargin: '96px' } : {});

    // The browser moves this top-layer group with its implicit anchor. Child
    // transforms describe only the shape or fragment offset within that owner.
    function shadowRootFor(node, owner, reorder) {
      if (!anchored) return paintRoot;
      let group = anchorGroups.get(owner)?.element;
      if (!group) {
        group = doc.createElement('div');
        group.popover = 'manual';
        group.inert = true;
        paintRoot.append(group);
      }
      if ((reorder || anchorGroups.get(owner)?.source !== node) && group.matches(':popover-open')) group.hidePopover();
      if (node.isConnected && !group.matches(':popover-open')) group.showPopover({ source: node });
      anchorGroups.set(owner, { element: group, source: node });
      return group.matches(':popover-open') ? group : null;
    }

    function clear(owner) {
      for (const shadow of owner.values()) shadow.element.remove();
      owner.clear();
      anchorGroups.get(owner)?.element.remove();
      anchorGroups.delete(owner);
    }

    // Ink inside the native scrolling content gets the very same compositor
    // scroll transform as the text, including between two main-thread frames.
    function localPlane(host) {
      let entry = scrollPlanes.get(host);
      if (entry && entry.element.parentNode === host) return entry;
      const element = doc.createElement('div');
      planeNodes.add(element);
      element.setAttribute('data-aurora-shadow-plane', '');
      element.setAttribute('aria-hidden', 'true');
      element.inert = true;
      const properties = { ...planeStyle, position: 'absolute', inset: '0 auto auto 0',
        width: '0', height: '0', 'z-index': 'auto' };
      for (const [name, value] of Object.entries(properties)) element.style.setProperty(name, value, 'important');
      const root = element.attachShadow({ mode: 'closed' });
      root.adoptedStyleSheets = paintRoot.adoptedStyleSheets;
      host.append(element);
      entry = { root, element };
      scrollPlanes.set(host, entry);
      flowResize.observe(host);
      return entry;
    }

    function discover(root) {
      const selector = partsFor(root).candidates;
      if (!selector) return;
      if (root.matches?.(selector)) track(root);
      for (const node of root.querySelectorAll(selector)) track(node);
    }

    function track(node) {
      if (owners.has(node)) return;
      owners.set(node, new Map());
      intersection.observe(node);
      for (let parent = node; parent; parent = parentOf(parent)) ancestors.add(parent);
    }

    function schedule() {
      if (controller && !doc.hidden && !frame) frame = view.requestAnimationFrame(paint);
    }

    function refresh(roots = doc) {
      if (!controller) return;
      for (const root of Array.isArray(roots) ? roots : [roots]) if (root?.querySelectorAll) pending.add(root);
      schedule();
    }

    function mount() {
      if (!plane.isConnected) doc.documentElement.append(plane);
      if (anchored) return true;
      // A manual popover is outside author stacking and clipping, with no
      // focus target or light-dismiss behavior. Reorder when the site opens one.
      if (promote && plane.matches(':popover-open')) plane.hidePopover();
      if (!plane.matches(':popover-open')) {
        try { plane.showPopover(); }
        catch { return false; }
        if (!plane.matches(':popover-open')) return false;
      }
      return true;
    }

    function foregroundSurfaces() {
      const nativeModal = doc.fullscreenElement || doc.querySelector('dialog:modal:focus-within') ||
        [...doc.querySelectorAll('dialog:modal')].at(-1);
      const dialogs = nativeModal ? [] : [...doc.querySelectorAll(occludingDialog)]
        .filter(dialog => dialog.checkVisibility({ visibilityProperty: true }));
      // Focus can move from a modal into a popup portalled outside its DOM subtree.
      const modal = nativeModal || dialogs.findLast(dialog => dialog.matches(':focus-within')) ||
        (dialogs.includes(lastModal) ? lastModal : dialogs.at(-1));
      lastModal = modal;
      const surfaces = new Set();
      if (!modal) return surfaces;
      surfaces.add(modal);
      for (const trigger of modal.querySelectorAll('[aria-expanded="true"][aria-controls], [aria-describedby]')) {
        const controls = trigger.getAttribute('aria-expanded') === 'true' ? trigger.getAttribute('aria-controls') : '';
        const descriptions = trigger.getAttribute('aria-describedby');
        for (const id of `${controls || ''} ${descriptions || ''}`.trim().split(/\s+/)) {
          const popup = doc.getElementById(id)?.closest('[data-radix-popper-content-wrapper], :popover-open');
          if (popup) surfaces.add(popup);
        }
      }
      return surfaces;
    }

    function paint() {
      frame = 0;
      const reorder = promote;
      if (!mount()) return;
      promote = false;
      for (const root of pending) {
        if (!root.isConnected) continue;
        const tree = root.getRootNode();
        if (tree !== root && pending.has(tree)) continue;
        let covered = false;
        for (let ancestor = root.parentElement; ancestor; ancestor = ancestor.parentElement) {
          if (!pending.has(ancestor)) continue;
          covered = true;
          break;
        }
        if (!covered) discover(root);
      }
      pending.clear();
      const foreground = foregroundSurfaces();
      const context = new Map();
      const origins = new Map();
      const reads = [];
      function readContext(node) {
        if (context.has(node)) return context.get(node);
        const parent = parentOf(node);
        const inherited = parent ? readContext(parent) : { opacity: 1, inForeground: !foreground.size };
        const style = getComputedStyle(node);
        const matrix = linearTransform(style, inherited.matrix);
        const independent = anchorShadows && (style.position === 'sticky' || style.position === 'fixed' ||
          node.matches(':popover-open, :modal'));
        const host = independent ? null : inherited.childHost;
        let childHost = host;
        let scrolling = !independent && inherited.scrolling;
        if (anchorShadows) {
          const isScroller = node === doc.scrollingElement ||
            /^(auto|scroll)$/.test(style.overflowY) || /^(auto|scroll)$/.test(style.overflowX);
          if (isScroller) { scrolling = true; childHost = null; }
          const positioned = style.position !== 'static' && style.display !== 'contents';
          const transcript = node.hasAttribute('data-thread-user-message-navigation-content') ||
            /\btranscriptContent-/.test(node.getAttribute('class') || '');
          const clips = style.overflowX !== 'visible' || style.overflowY !== 'visible' ||
            style.clipPath !== 'none' || /paint|content|strict/.test(style.contain);
          if (!childHost && clips && !isScroller) scrolling = false;
          if (transcript && !independent) scrolling = true;
          if (scrolling && positioned && (!clips || isScroller) && (!childHost || transcript) &&
              (!matrix || (!matrix.b && !matrix.c && matrix.a > 0 && matrix.d > 0))) childHost = node;
        }
        const result = {
          opacity: inherited.opacity * Number(style.opacity),
          matrix, host, childHost, scrolling,
          inForeground: inherited.inForeground || foreground.has(node),
        };
        context.set(node, result);
        ancestors.add(node);
        return result;
      }
      if (prune) for (const [node, owner] of owners) {
        if (!node.isConnected || node.ownerDocument !== doc) {
          if (nativeSources.delete(node)) node.removeAttribute(nativeAttribute);
          clear(owner);
          intersection.unobserve(node);
          resize.unobserve(node);
          visible.delete(node);
          owners.delete(node);
        }
      }
      prune = false;
      for (const node of visible) {
        const owner = owners.get(node);
        const layers = new Map();
        const read = { anchor: node, node, owner, layers };
        reads.push(read);
        if (!node.checkVisibility({ visibilityProperty: true, contentVisibilityAuto: true })) continue;
        const parts = partsFor(node);
        const style = getComputedStyle(node);
        const cast = parts.entries.flatMap(([part, selector]) => {
          const pseudo = part === 'element' ? '' : '::' + part;
          if (pseudo && !node.matches(selector)) return [];
          const source = pseudo ? getComputedStyle(node, pseudo) : style;
          if (pseudo && (source.content === 'none' || source.content === 'normal' || source.display === 'none')) return [];
          return source.boxShadow.split(/,(?![^()]*\))/).flatMap(layer => {
            const token = shadowTokens[layer.match(castMarker)?.[1]];
            return token && /\b(?:transparent|rgba\([^)]*,\s*0\))/.test(layer) ? [{ pseudo, source, token }] : [];
          });
        });
        if (!cast.length) continue;
        const { opacity, matrix, inForeground, host } = readContext(node);
        if (!inForeground || opacity <= 0) continue;
        const rect = node.getBoundingClientRect();
        const clip = host && node.matches(messageBoxes) && !matrix && (node.currentCSSZoom || 1) === 1
          ? intermediateClip(node, host, getComputedStyle) : null;
        read.native = !!clip && cast.some(({ pseudo, token }) => !pseudo &&
          (token === '--aurora-glass-shadow' || token === '--aurora-control-shadow'));
        if (!anchored && (rect.right <= 0 || rect.bottom <= 0 ||
            rect.left >= view.innerWidth || rect.top >= view.innerHeight)) continue;
        let origin;
        if (host) {
          const local = localPlane(host);
          read.root = local.root;
          if (!origins.has(host)) {
            const point = local.element.getBoundingClientRect();
            const axes = readContext(host).matrix;
            const zoom = host.currentCSSZoom || 1;
            origins.set(host, { left: point.left, top: point.top,
              scaleX: (axes?.a || 1) * zoom, scaleY: (axes?.d || 1) * zoom });
          }
          origin = origins.get(host);
        } else if (anchored) {
          // SVG sources can cast a shadow, but a popover invoker must be HTML.
          while (read.anchor && !(read.anchor instanceof view.HTMLElement)) read.anchor = parentOf(read.anchor);
          if (!read.anchor) continue;
          origin = read.anchor === node ? rect : read.anchor.getBoundingClientRect();
        }
        for (const [layerIndex, { pseudo, source, token }] of cast.entries()) {
          const shadow = source.getPropertyValue(token).trim();
          if (!shadow || shadow === 'none') continue;
          const fragments = !pseudo && !matrix && style.display === 'inline' ? [...node.getClientRects()] : [];
          const fragmented = fragments.length > 1;
          const boxes = fragmented ? fragments : [rect];
          for (const [index, bounds] of boxes.entries()) {
            const escape = read.native && !pseudo && (token === '--aurora-glass-shadow' || token === '--aurora-control-shadow')
              ? escapedInk(bounds, clip, shadow, view) : '';
            if (escape === null) continue;
            const geometry = shadowGeometry(node, source, style, matrix, pseudo, bounds, fragmented,
              { first: index === 0, last: index === boxes.length - 1 }, origin);
            if (geometry) layers.set(`${layerIndex}:${index}`,
              `${geometry}${escape}box-shadow:${shadow};color:${source.color};opacity:${opacity * (pseudo ? Number(source.opacity) : 1)};`);
          }
        }
      }
      for (const { node, anchor, owner, layers, root: local, native } of reads) {
        if (!!native !== nativeSources.has(node)) {
          node.toggleAttribute(nativeAttribute, !!native);
          if (native) nativeSources.add(node);
          else nativeSources.delete(node);
        }
        if (!layers.size) {
          clear(owner);
          continue;
        }
        for (const [key, shadow] of owner) if (!layers.has(key)) {
          shadow.element.remove();
          owner.delete(key);
        }
        if (local && anchorGroups.has(owner)) {
          anchorGroups.get(owner).element.remove();
          anchorGroups.delete(owner);
        }
        const root = local || shadowRootFor(anchor, owner, reorder);
        if (!root) { clear(owner); continue; }
        for (const [key, css] of layers) {
          let shadow = owner.get(key);
          if (!shadow) {
            shadow = { element: doc.createElement('div'), css: '' };
            owner.set(key, shadow);
          }
          if (shadow.element.parentNode !== root) root.append(shadow.element);
          if (css === shadow.css) continue;
          shadow.element.style.cssText = css;
          shadow.css = css;
        }
      }
      for (const [host, { element }] of scrollPlanes) if (!origins.has(host) || !host.isConnected) {
        element.remove();
        flowResize.unobserve(host);
        scrollPlanes.delete(host);
      }
      for (const animation of animations) if (!animation.pending && animation.playState !== 'running') animations.delete(animation);
      if (animations.size) schedule();
    }

    function onChanges(mutations) {
      let changed = false;
      for (const { target, type, attributeName, addedNodes, removedNodes } of mutations) {
        if (target === plane || planeNodes.has(target)) continue;
        if (type === 'attributes') {
          if (attributeName === 'data-is-intersecting') {
            changed ||= [...visible].some(node => target.contains(node));
            continue;
          }
          const selector = partsFor(target).candidates;
          if (selector && target.matches(selector)) track(target);
          // Descendants can become owners when a native wrapper changes state.
          if (target.childElementCount && attributeName !== 'style') pending.add(target);
          changed ||= ancestors.has(target) || pending.size > 0 || lastModal?.contains(target);
          if (attributeName === 'open' && target.matches('dialog:modal')) promote = true;
          continue;
        }
        if ([...addedNodes, ...removedNodes].every(node => planeNodes.has(node))) continue;
        for (const node of addedNodes) {
          if (node.nodeType !== 1 || node === plane || planeNodes.has(node)) continue;
          pending.add(node);
          changed = true;
        }
        if (addedNodes.length && target.matches?.('html, body, [role="dialog"], [popover]')) pending.add(target);
        prune ||= [...removedNodes].some(node => node.nodeType === 1);
        changed ||= prune || ancestors.has(target);
      }
      // Virtualized turns can disappear between paints. Their detached ink
      // must be removed in the same mutation delivery as their source.
      if (prune) for (const node of visible) {
        if (!node.isConnected) clear(owners.get(node));
      }
      if (changed || promote) schedule();
    }

    const observer = new view.MutationObserver(onChanges);
    const observe = root => observer.observe(root, { subtree: true, childList: true,
      attributes: true, attributeFilter: partsFor(root).attributes });

    function observeShadowRoot(root, selectors) {
      if (!controller || roots.has(root)) return;
      roots.set(root, makeSelectors(selectors));
      observe(root);
      refresh(root);
    }

    function onAnimation(event) {
      const selector = partsFor(event.target).candidates;
      if (!ancestors.has(event.target) && (!selector || !event.target.matches(selector))) return;
      if (event.type === 'transitionrun' && !geometryProperty.test(event.propertyName)) return;
      if (event.type === 'transitionrun' || event.type === 'animationstart') {
        for (const animation of event.target.getAnimations()) {
          if (animation.transitionProperty ? geometryProperty.test(animation.transitionProperty) :
            animation.effect?.getKeyframes().some(keyframe => Object.keys(keyframe).some(property =>
              geometryProperty.test(property.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`))))) {
            animations.add(animation);
          }
        }
      }
      schedule();
    }

    function start() {
      if (controller) { refresh(); return; }
      controller = new view.AbortController();
      const options = { capture: true, passive: true, signal: controller.signal };
      plane = doc.createElement('div');
      plane.id = planeId;
      if (!anchored) plane.popover = 'manual';
      plane.inert = true;
      plane.setAttribute('aria-hidden', 'true');
      for (const [name, value] of Object.entries(planeStyle)) plane.style.setProperty(name, value, 'important');
      if (anchored) plane.style.setProperty('inset', '0 auto auto 0', 'important');
      paintRoot = plane.attachShadow({ mode: 'closed' });
      const sheet = new view.CSSStyleSheet();
      sheet.replaceSync(layerStyle + anchorStyle);
      paintRoot.adoptedStyleSheets = [sheet];
      observe(doc.documentElement);
      resize.observe(doc.documentElement);
      if (!anchored) doc.addEventListener('scroll', schedule, options);
      for (const type of ['load', 'focusin', 'focusout', 'pointerover', 'pointerout', 'pointerdown', 'pointerup']) {
        doc.addEventListener(type, event => {
          if (type === 'load') { schedule(); return; }
          if (type === 'focusin' || type === 'focusout') schedule();
          const path = event.composedPath();
          for (const node of path) {
            if (!node.matches || node === plane || node === doc.documentElement) continue;
            const selector = partsFor(node).candidates;
            if (selector && node.matches(selector)) track(node);
            if (ancestors.has(node)) schedule();
          }
        }, options);
      }
      for (const type of ['transitionrun', 'transitionend', 'transitioncancel', 'animationstart', 'animationend', 'animationcancel']) {
        doc.addEventListener(type, onAnimation, options);
      }
      // Keep native top-layer dialogs and popovers above the rest of the page.
      doc.addEventListener('beforetoggle', event => {
        if (event.target === plane || !event.target.matches?.('dialog, [popover]')) return;
        promote ||= event.newState === 'open';
        refresh(event.target);
      }, options);
      doc.addEventListener('fullscreenchange', () => { promote = true; schedule(); }, options);
      doc.addEventListener('visibilitychange', () => {
        if (!doc.hidden) refresh();
      }, options);
      view.addEventListener('resize', () => refresh(), options);
      view.visualViewport?.addEventListener('resize', schedule, options);
      if (!anchored) view.visualViewport?.addEventListener('scroll', schedule, options);
      doc.fonts?.addEventListener('loadingdone', schedule, options);
      refresh();
    }

    function stop() {
      controller?.abort();
      controller = null;
      observer.disconnect();
      resize.disconnect();
      flowResize.disconnect();
      intersection.disconnect();
      view.cancelAnimationFrame(frame);
      frame = 0;
      promote = prune = false;
      lastModal = null;
      pending.clear();
      owners.clear();
      for (const node of nativeSources) node.removeAttribute(nativeAttribute);
      nativeSources.clear();
      visible.clear();
      roots.clear();
      animations.clear();
      ancestors = new WeakSet();
      for (const { element } of scrollPlanes.values()) element.remove();
      scrollPlanes.clear();
      plane?.remove();
      plane = paintRoot = null;
    }

    return { start, refresh, observeShadowRoot, stop };
  }

  A.createGlassShadows = create;
  if (A.site) A.glassShadows = create({
    selectors: A.shadowSelectors?.[location.hostname],
    anchorShadows: A.site.id === 'chatgpt',
  });
})();
