// modules/aurora/glass.js
// Tags dynamic ChatGPT UI nodes with `data-aurora-glass="true"` so CSS can apply a glass effect.
(() => {
  'use strict';

  const A = (window.AuroraExt = window.AuroraExt || {});
  A.glass = A.glass || {};

  const isEnabled = () => (A.isEnabled ? A.isEnabled() : true);

  const GLASS_SELECTORS_FAST = [
    /* Popups, Menus, Dialogs */
    // Current floating product and source panels paint their native summary shell.
    '[data-summary-panel-variant]',
    // Library/storage owns separate painted category and bulk-action shells.
    // Resolve their native paint instead of changing the tabs or their geometry.
    '[data-testid="artifacts-surface-top-controls"]',
    '[class*="_toolbarShell"]',
    '[class*="_refreshedStickyToolbarShell"]',
    '[data-testid="artifacts-surface-floating-selection-controls"]',
    '[data-testid="artifacts-surface-floating-selection-controls"] button',
    '[data-testid="artifacts-surface-top-controls"] button',
    '[data-theme="dark"][class*="Container-"] > [role="toolbar"][class*="Toolbar-"]',
    '[data-theme="dark"][class*="Container-"] > [role="toolbar"][class*="Toolbar-"] button',
    '[role="menu"]',
    '[role="dialog"]',
    '[role="listbox"][data-state="open"]',
    '[data-radix-menu-content][data-state="open"]',
    '[data-radix-popper-content-wrapper] > [role="menu"]',
    '[data-radix-popper-content-wrapper] > [role="dialog"]',
    '.popover.bg-token-main-surface-primary[data-radix-menu-content]',
    '.popover.bg-token-main-surface-primary[role="dialog"]',
    'div[role="dialog"][class*="shadow-long"]',
    '.popover.bg-token-main-surface-primary.max-w-xs',
    'div.sticky.top-14.bg-token-main-surface-primary',
    'textarea.bg-token-main-surface-primary.border-token-border-default',
    '.bg-token-main-surface-primary.sticky.top-\\[-1px\\]',
    'div.absolute.top-full > div.bg-surface-primary',
    'div.absolute.top-full > div[class*="bg-surface"]',
    /* Composer & Code Blocks */
    // Modern composers consume native material tokens in app-skin.css.
    // Their home layout wrapper has square corners; its inner body owns paint.
    '[data-composer-dark][data-composer-layout][role="presentation"]:not([data-composer-surface-variant])',
    '[class*="composer-surface-primary"]',
    '[data-testid="chatgpt-writing-block"]',
    '[data-markdown-copy="code-block"]',
    // DIL renders generated icon backplates and numeric summaries as native
    // boxes/cards, independently of Markdown and its utility-class surfaces.
    // The shared paint gate leaves transparent layout boxes untouched and
    // applies material only to the existing component that owns the fill.
    '[data-dil-message-id] [data-d-component="box"]',
    '[data-dil-message-id] [data-d-component="card"]',
    '[data-dil-message-id] [data-d-component="badge"]',
    '[data-dil-message-id] [data-d-component="button"]',
    '[data-dil-message-id] [data-d-component="pressable"]',
    '[data-composer-overlay-floating-ui] > div',
    'dialog[open]',
    '#octane-mobile-composer-actions-popover',
    '[class*="showcaseEmptyState-"]',
    '[class~="group/plugin"] > [class*="surface-"]',
    'button.bg-composer-primary',
    'button.bg-primary-solid',
    'button.btn-primary',
    'button[data-color="primary"][data-variant="solid"]',
    'form[data-chatgpt-composer] button:is([data-testid="send-button"], [data-testid="stop-button"], [data-testid*="stop-generating"], [aria-label="Start Voice" i], [aria-label="Send prompt" i], [aria-label="Send message" i], [aria-label="Send" i], [aria-label="Stop generating" i], [aria-label="Stop streaming" i], [aria-label="Stop response" i], [aria-label="Stop" i])',
    'div.relative.z-10.grow div.rounded-md',
    'button.btn.relative.btn-secondary.w-full',
    'div.bg-token-bg-primary.sticky.top-14.z-30',
    'div.absolute.start-0.top-2.hidden.h-full.items-end.bg-linear-to-r.from-white button',
    'div.absolute.end-0.top-2.hidden.h-full.bg-linear-to-l.from-white button',
    'div.bg-token-main-surface-primary.sticky.top-14.z-10 .absolute.end-0 button',
    'div.bg-token-main-surface-primary.sticky.top-14.z-10 .absolute.start-0 button',
    'a.gizmo-link, a[class*="gizmo-link"], div.grid a.group',
    /* Buttons & UI Elements */
    '#cgpt-qs-panel',
    '.py-3.px-3.rounded-3xl.bg-token-main-surface-tertiary',
    '.divide-token-border-default.bg-token-main-surface-primary.mx-1.mt-1',
    'button[aria-label="Scroll down"]',
    '.active\\:opacity-1.border-none.rounded-xl.flex.shadow-long.btn-secondary.relative.btn',
    '.shrink-0.btn-secondary.relative.btn',
    '.shrink-0.btn-danger-outline.relative.btn',
    '.justify-between.items-center.flex > .btn-small.btn-secondary.relative.btn',
    '.hover\\:cursor-pointer.cursor-default.me-0.my-0.btn-small.btn.btn-secondary',
    '.p-4.rounded-lg.justify-stretch.items-center.flex-col.w-full.flex.relative.bg-token-main-surface-primary',
    '.p-4.rounded-xl.my-4.bg-token-bg-tertiary.text-token-text-secondary',
    '.p-3.border.rounded-\\[10px\\].w-full.btn-secondary',
    '[role="tooltip"]',
    '.bg-token-bg-tooltip',
    '[class*="bg-token-bg-tooltip"]',
    '.bg-black[data-state*="open"]',
    /* Toast Notifications */
    '[data-sonner-toast]',
    '[data-radix-toast-viewport] > li',
    '[data-swipe-direction][role="status"]',
    '[data-toast]',
    '[data-testid="toast"]',
    '.Toastify__toast',
    /* Scroll to bottom button */
    '.absolute.z-30.h-8.w-8.rounded-full.bg-token-main-surface-primary',
    /* Voice Mode Buttons (Icon & Expanded Pill) */
    'button.h-9.w-9.rounded-full.bg-black',
    '.h-9.rounded-full.bg-token-bg-accent-static',
  ];

  const GLASS_SELECTOR_FAST = GLASS_SELECTORS_FAST.join(',');

  function tagPaintOwner(node, attribute = 'data-aurora-glass') {
    const owner = A.material.owner(node);
    if (owner !== node) {
      node.removeAttribute(attribute);
      node.removeAttribute('data-aurora-surface-edge');
    }
    if (owner) A.utils.setAttribute(owner, attribute, 'true');
    return owner;
  }

  const CODE_CONTENT_SELECTOR = [
    'div[data-message-author-role="assistant"] pre',
    '.agent-turn pre',
    '[data-chatgpt-search-unit-key$=":assistant"] pre',
    '[data-testid="chatgpt-writing-block"] pre',
    'div[data-message-author-role="assistant"] code[class*="language-"]',
    '.agent-turn code[class*="language-"]',
    '[data-chatgpt-search-unit-key$=":assistant"] code[class*="language-"]',
    '[data-testid="chatgpt-writing-block"] code[class*="language-"]',
    'div[data-message-author-role="assistant"] [class*="code-block"]',
    '.agent-turn [class*="code-block"]',
  ].join(',');

  const IMAGE_EDITOR_ACTION = /\bremove\s*(?:bg|background)\b/i;
  const IMAGE_CONTROL_SELECTOR = 'button, [role="button"], a[download]';
  let activeImageAction = null;
  let activeImageScope = null;
  let imageViewerFrame = 0;
  const imageViewerResizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(() => {
    if (imageViewerFrame || !isEnabled()) return;
    imageViewerFrame = requestAnimationFrame(() => {
      imageViewerFrame = 0;
      if (activeImageAction?.isConnected && isEnabled()) tagImageViewer(activeImageAction);
      else clearImageViewerTracking();
    });
  }) : null;

  function clearImageViewerTracking() {
    if (imageViewerFrame) cancelAnimationFrame(imageViewerFrame);
    imageViewerFrame = 0;
    activeImageAction = null;
    activeImageScope = null;
    imageViewerResizeObserver?.disconnect();
    A.centralObserver?.setAttributeScope?.('image-viewer', null);
  }

  function trackImageViewer(action) {
    if (activeImageAction === action && activeImageScope?.contains(action)) return;
    activeImageAction = action;
    imageViewerResizeObserver?.disconnect();
    for (let node = action; node && node !== document.body && node.id !== 'root'; node = node.parentElement) {
      activeImageScope = node;
      imageViewerResizeObserver?.observe(node);
    }
    // Watch the viewer's own layout and backdrop updates through the shared observer.
    A.centralObserver?.setAttributeScope?.('image-viewer', activeImageScope, ['class', 'style'], (node) =>
      node.contains(activeImageAction) || node.hasAttribute('data-aurora-image-viewer') ||
      /(?:^|\s)bg-black(?:\/[^\s]+)?(?:\s|$)/.test(node.getAttribute('class') || '') ||
      (node.getAttribute('class') || '').includes('bg-[#000') || !!node.style?.backgroundColor);
  }

  function backgroundAlpha(node) {
    const channels = getComputedStyle(node).backgroundColor.match(/[\d.]+/g)?.map(Number);
    return channels?.length >= 3 ? (channels[3] ?? 1) : 0;
  }

  function tagImageToolbar(action, viewerRoot) {
    const compactAncestors = [];
    for (let node = action.parentElement; node && node !== viewerRoot && node !== document.body; node = node.parentElement) {
      const rect = node.getBoundingClientRect();
      if (rect.width > Math.min(innerWidth * 0.85, 1200) || rect.height > 96) break;
      if (rect.width >= 180 && rect.height >= 28 && node.querySelectorAll(IMAGE_CONTROL_SELECTOR).length >= 4) {
        compactAncestors.push(node);
      }
    }
    compactAncestors.reverse();
    const toolbar = compactAncestors.find(node => A.material.owner(node) === node);
    if (!toolbar) return;
    toolbar.dataset.auroraImageToolbar = 'glass';
    const toolbarRect = toolbar.getBoundingClientRect();
    for (const node of toolbar.querySelectorAll('div, section')) {
      const rect = node.getBoundingClientRect();
      if (rect.width >= toolbarRect.width * 0.7 && rect.height >= toolbarRect.height * 0.7 && backgroundAlpha(node) > 0.3) {
        node.dataset.auroraImageToolbar = 'clear';
      }
    }
  }

  function tagImageTopControls(root = document) {
    if (innerWidth < 700) return;
    const controls = [];
    if (root?.nodeType === 1) {
      const ownControl = root.closest?.(IMAGE_CONTROL_SELECTOR);
      if (ownControl) controls.push(ownControl);
    }
    root?.querySelectorAll?.(IMAGE_CONTROL_SELECTOR).forEach((control) => controls.push(control));
    for (const control of controls) {
      if (control.querySelector(IMAGE_CONTROL_SELECTOR) || control.closest('[data-aurora-image-toolbar]')) continue;
      const header = control.closest('[data-testid="viewer-header"]');
      const rect = control.getBoundingClientRect();
      const onLeft = rect.left >= 42 && rect.left <= Math.min(350, innerWidth * 0.28);
      const onRight = rect.right >= innerWidth - 380;
      if (!header) {
        if (rect.top < 0 || rect.top > 70 || rect.width < 20 || rect.width > 180 ||
            rect.height < 20 || rect.height > 56 || (!onLeft && !onRight)) continue;
        const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        if (!hit || !control.contains(hit)) continue;
      }
      const owner = A.material.owner(control);
      if (owner !== control) control.removeAttribute('data-aurora-image-top-control');
      if (!owner) continue;
      owner.dataset.auroraImageTopControl = 'true';
      if (header) {
        for (let node = control.parentElement; node && node !== header; node = node.parentElement) {
          if (!node.matches(IMAGE_CONTROL_SELECTOR)) node.dataset.auroraImageControlGroup = 'clear';
        }
        continue;
      }
      for (let node = control.parentElement, depth = 0; node && depth < 3; node = node.parentElement, depth += 1) {
        const parentRect = node.getBoundingClientRect();
        if (parentRect.width > 190 || parentRect.height > 60 || parentRect.top > 70) break;
        const style = getComputedStyle(node);
        const hasSurface = backgroundAlpha(node) > 0.01 || style.boxShadow !== 'none' ||
          style.backdropFilter !== 'none' || style.webkitBackdropFilter !== 'none' ||
          style.outlineStyle !== 'none' || parseFloat(style.borderTopWidth) > 0;
        if (parentRect.width > 0 && hasSurface) node.dataset.auroraImageControlGroup = 'clear';
      }
    }
  }

  function tagImageViewer(root = document, candidates = null) {
    if (activeImageAction && !activeImageAction.isConnected) clearImageViewerTracking();
    const buttons = new Set();
    if (root?.nodeType === 1) {
      const ownButton = root.closest?.('button, [role="button"]');
      if (ownButton) buttons.add(ownButton);
    }
    const discovered = candidates || root?.querySelectorAll?.('button, [role="button"]') || [];
    for (const button of discovered) {
      if (button.matches('button, [role="button"]')) buttons.add(button);
    }
    if (activeImageAction && !buttons.has(activeImageAction) &&
        (root === document || activeImageScope?.contains(root) || root?.contains?.(activeImageAction))) {
      buttons.add(activeImageAction);
    }

    let foundViewer = false;
    for (const button of buttons) {
      const label = [button.getAttribute('aria-label'), button.getAttribute('title'), button.textContent].filter(Boolean).join(' ');
      if (!IMAGE_EDITOR_ACTION.test(label)) continue;
      trackImageViewer(button);

      const imagePanel = button.closest('[data-app-shell-tab-panel-controller][data-tab-id^="image:"]');
      const paneFrame = imagePanel?.closest('[data-app-shell-pane-frame]');
      let viewerRoot = imagePanel || button;
      while (!imagePanel && viewerRoot && viewerRoot !== document.body && viewerRoot.id !== 'root') {
        const rect = viewerRoot.getBoundingClientRect();
        if ((viewerRoot.offsetWidth || rect.width) >= innerWidth * 0.65 &&
            (viewerRoot.offsetHeight || rect.height) >= innerHeight * 0.65) break;
        viewerRoot = viewerRoot.parentElement;
      }
      if (!viewerRoot || viewerRoot === document.body || viewerRoot.id === 'root') continue;

      foundViewer = true;
      tagImageToolbar(button, viewerRoot);

      if (paneFrame) {
        // The pane frame is the opaque outer backdrop. It owns the only viewer blur.
        paneFrame.dataset.auroraImageViewer = 'glass';
        for (let node = button.parentElement; node && node !== paneFrame; node = node.parentElement) {
          const rect = node.getBoundingClientRect();
          if ((node.offsetWidth || rect.width) >= innerWidth * 0.65 &&
              (node.offsetHeight || rect.height) >= innerHeight * 0.65) {
            node.dataset.auroraImageViewer = 'clear';
          }
        }
        paneFrame.querySelectorAll('[data-aurora-image-viewer="glass"]').forEach(node => {
          node.dataset.auroraImageViewer = 'clear';
        });
        break;
      }

      const darkStages = [];
      let searchRoot = viewerRoot;
      while (searchRoot && searchRoot.id !== 'root' && searchRoot !== document.body) {
        for (const node of [searchRoot, ...searchRoot.querySelectorAll('div, main, section')]) {
          const rect = node.getBoundingClientRect();
          if ((node.offsetWidth || rect.width) < innerWidth * 0.65 ||
              (node.offsetHeight || rect.height) < innerHeight * 0.65) continue;
          const className = node.getAttribute('class') || '';
          const nativeBlack = /(?:^|\s)bg-black(?:\/[^\s]+)?(?:\s|$)/.test(className) || className.includes('bg-[#000');
          const channels = getComputedStyle(node).backgroundColor.match(/[\d.]+/g)?.map(Number);
          const opaqueDark = channels?.length >= 3 && channels.slice(0, 3).every((value) => value <= 48) &&
            (channels.length === 3 || channels[3] >= 0.9);
          if (!nativeBlack && !opaqueDark && !node.hasAttribute('data-aurora-image-viewer')) continue;
          if (!darkStages.includes(node)) darkStages.push(node);
        }
        searchRoot = searchRoot.parentElement;
      }
      darkStages.forEach((node) => {
        const hasNestedStage = darkStages.some((other) => other !== node && node.contains(other));
        node.dataset.auroraImageViewer = hasNestedStage ? 'clear' : 'glass';
      });
      break;
    }
    const activeToolbar = document.querySelector('[data-aurora-image-toolbar="glass"]');
    const toolbarRect = activeToolbar?.getBoundingClientRect();
    if (foundViewer || (toolbarRect?.width >= 180 && toolbarRect?.height >= 28)) {
      tagImageTopControls(foundViewer ? document : root);
    }
  }

  function codePaintCandidates(root) {
    const groups = [];
    const starts = new Set();
    const candidates = new Map();
    for (const content of A.utils.matchingElements(root, CODE_CONTENT_SELECTOR)) {
      if (content.closest('[data-testid="chatgpt-writing-block"]')) continue;
      const turn = content.closest('div[data-message-author-role="assistant"]') ||
        content.closest('.agent-turn') || content.closest('[data-chatgpt-search-unit-key$=":assistant"]');
      const wrappers = [];
      let wrapper = content.tagName === 'PRE' ? content.parentElement : content;
      if (starts.has(wrapper)) continue;
      starts.add(wrapper);
      for (let depth = 0; wrapper && wrapper !== turn && depth < 5; depth += 1, wrapper = wrapper.parentElement) {
        if (!candidates.has(wrapper)) candidates.set(wrapper,
          /(code|contain-inline-size|bg-token|bg-surface)/i.test(wrapper.getAttribute('class') || '') ||
          !!wrapper.querySelector('button[aria-label*="copy" i], button[title*="copy" i], button[aria-label*="download" i], button[title*="download" i], button[aria-label*="edit" i], button[title*="edit" i]'));
        if (candidates.get(wrapper)) wrappers.push(wrapper);
      }
      groups.push(wrappers);
    }
    return groups;
  }

  function tagCodeBlocks(root = document, groups = codePaintCandidates(root)) {
    for (const wrappers of groups) {
      for (const wrapper of wrappers) {
        const owner = A.material.owner(wrapper);
        if (!owner) continue;
        A.utils.setAttribute(owner, 'data-aurora-code-block', 'true');
        break;
      }
    }
  }

  // Work's Outputs/Sources panel uses ordinary native rows. Surface discovery
  // stays independent of the promotion scanner's protected-content boundaries.
  function workContextPanels(root, candidates) {
    const panels = new Set();
    const sourceRow = '[class~="group/add-source-row"]';
    const excluded = `${A.ownedUI}, [data-message-author-role], [data-message-id], .prose, .markdown, pre, code`;
    const anchors = new Set(A.utils.matchingElements(root, sourceRow));
    for (const node of candidates) {
      if (node.closest(excluded)) continue;
      const label = (node.textContent || '').replace(/\s+/g, ' ').trim();
      if (/^(?:Outputs|Sources|Create file or site)$/i.test(label)) anchors.add(node);
    }
    if (root?.nodeType === 1) {
      const panel = root.closest('[data-aurora-work-context="panel"]');
      if (panel) panels.add(panel);
    }
    for (const anchor of anchors) {
      if (anchor.closest(excluded)) continue;
      const nativeSourceRow = anchor.matches(sourceRow);
      for (let node = anchor.parentElement, depth = 0; node && depth < 6; node = node.parentElement, depth++) {
        if (node.matches('body, main, #root, #web-mobile-root, [data-app-shell-frame], [data-app-shell-main-surface]')) break;
        if (!node.matches('div, section, aside') || !node.classList.contains('border')) continue;
        const text = node.textContent || '';
        if (nativeSourceRow || (/\bOutputs\b/i.test(text) && /\bSources\b/i.test(text))) {
          panels.add(node);
          break;
        }
      }
    }
    return [...panels].map(panel => ({ panel, layers: [...panel.querySelectorAll(
      'div[class*="bg-"], section[class*="bg-"], header[class*="bg-"], button, [role="button"]'
    )].filter(node => !node.closest(excluded)) }));
  }

  function tagWorkContext(groups) {
    for (const { panel, layers } of groups) {
      const owner = tagPaintOwner(panel);
      if (!owner) continue;
      A.utils.setAttribute(owner, 'data-aurora-work-context', 'panel');
      for (const layer of layers) {
        const rowOwner = A.material.owner(layer);
        if (rowOwner && rowOwner !== owner && owner.contains(rowOwner)) {
          // The section owns the backdrop. Row fills retain their native shape
          // while revealing that glass instead of stacking multiple filters.
          A.utils.setAttribute(rowOwner, 'data-aurora-work-context', 'row');
        }
      }
    }
  }


  function tagLibraryHeader(root) {
    // Current Library headers own their opaque paint on the existing ::before.
    // The search input ID scopes this shared collapsing-header component to Library.
    const headers = new Set();
    if (root?.nodeType === 1) {
      const header = root.closest('[data-scroll-collapse][data-sticky]');
      if (header) headers.add(header);
    }
    for (const input of A.utils.matchingElements(root, 'input[id^="library-search-"]')) {
      const header = input.closest('[data-scroll-collapse][data-sticky]');
      if (header) headers.add(header);
    }
    for (const header of headers) {
      if (header.querySelector('input[id^="library-search-"]')) {
        A.utils.setAttribute(header, 'data-aurora-library-header', 'true');
      }
    }
  }

  function tag(root = document, initial = false) {
    if (!isEnabled()) return;
    const controls = A.upgrade.tagElements(root);
    for (const node of A.utils.matchingElements(root, 'button, a, [role="button"], [role="link"], [role="menuitem"]')) controls.add(node);
    const elements = new Set([...A.utils.matchingElements(root, GLASS_SELECTOR_FAST), ...hintOwners(root, initial)]);
    const code = codePaintCandidates(root);
    const workContext = workContextPanels(root, controls);
    A.material.prepare([...elements, ...code.flat(), ...workContext.flatMap(({ panel, layers }) => [panel, ...layers])]);
    for (const el of elements) {
      tagPaintOwner(el);
    }

    tagCodeBlocks(root, code);
    tagWorkContext(workContext);
    tagImageViewer(root, controls);
    tagLibraryHeader(root);
  }

  function untag(root = document) {
    if (root === document || root?.contains?.(activeImageAction)) clearImageViewerTracking();
    A.material.clear(root, [...A.material.attributes, 'data-aurora-image-viewer', 'data-aurora-image-control-group', 'data-aurora-work-context']);
  }

  // Find small identifying controls once, then follow their existing owners.
  // This replaces broad :has() queries and five repeated descendant scans.
  const HINTS = 'ul[class*="divide-y"], input#search, input[placeholder="Search plugins" i], #mobile-composer-prompt, [data-testid="project-modal-trigger"]';
  function hintOwners(root, initial) {
    const owners = new Set();
    for (const node of A.utils.matchingElements(root, HINTS)) {
      let owner = null;
      if (node.matches('ul[class*="divide-y"]')) {
        if (initial) {
          for (let parent = node.parentElement; parent; parent = parent.parentElement) {
            if (parent.matches('div.bg-token-bg-primary.w-full.block')) owners.add(parent);
          }
        } else owner = node.closest('div.bg-token-bg-primary.w-full.block') || node.closest('div.bg-token-bg-primary');
      } else if (node.id === 'search') owner = node.closest('div[role="dialog"]') || node.closest('.popover');
      else if (node.matches('input[placeholder="Search plugins" i]')) {
        if (node.parentElement?.matches('div, label')) owner = node.parentElement;
      } else if (node.id === 'mobile-composer-prompt') {
        const form = node.closest('#web-mobile-root form');
        if (form && !form.querySelector('[data-composer-surface-variant]')) owner = form;
      } else {
        for (let parent = node.parentElement; parent; parent = parent.parentElement) {
          if (parent.matches('div.flex.justify-between')) owners.add(parent);
        }
      }
      if (owner) owners.add(owner);
    }
    return owners;
  }

  A.glass.tagFast = tag;
  A.glass.tagAll = (root = document) => tag(root, true);
  A.glass.untag = A.glass.untag || untag;
})();

