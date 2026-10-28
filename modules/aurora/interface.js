// Functional DOM ownership is independent of native surface paint.
(() => {
  'use strict';
  const A = window.AuroraExt;
  const selectors = A.site.selectors || {};
  const chatgpt = {
    sidebar: '#app-shell-sidebar, #stage-slideover-sidebar, #stage-sidebar-tiny-bar, [data-testid="sidebar"]',
    avatar: '[data-testid="accounts-profile-button"] :is(img, [class*="avatar"]), button[aria-label="Open profile menu"] :is(img, [class*="avatar"])',
    content: '[data-thread-user-message-navigation-content], [data-pip-obstacle="thread-footer"], [data-testid="conversation-turn"], [data-testid^="conversation-turn-"] > .mx-auto, main :is([class*="max-w-3xl"], [class*="max-w-thread"]), #thread :is([class*="max-w-"], [data-composer-body])',
    toolbar: '[data-app-shell-titlebar], header#page-header, [data-testid="chat-header"]',
  };
  const roles = ['sidebar', 'history', 'avatar', 'content', 'composer', 'toolbar'];
  const roleSelector = role => selectors[role] || chatgpt[role] || (role === 'composer' ? 'form[data-chatgpt-composer], #thread-bottom-container form' : '');
  const matching = (root, selector) => A.utils.matchingElements(root, selector);
  let widthOwners = new WeakSet();
  function tagWidth(node) {
    if (!A.getSettings().cinemaMode) return;
    for (let owner = node, depth = 0; owner && owner !== document.body && depth < 8; owner = owner.parentElement) {
      if (A.site.appRoot && owner.matches(A.site.appRoot)) break;
      // Native display-contents wrappers do not consume the layout ancestor budget.
      if (!owner.classList.contains('contents')) depth++;
      if (widthOwners.has(owner)) continue;
      widthOwners.add(owner);
      const limit = getComputedStyle(owner).maxWidth;
      if (limit && limit !== 'none' && limit !== '100%') A.utils.toggleAttribute(owner, 'data-aurora-width', true);
    }
  }

  function tagElements(root = document) {
    if (!A.isActive() || root.closest?.(A.ownedUI)) return;
    for (const role of roles) {
      const settings = A.getSettings();
      if (role === 'history' && !settings.blurChatHistory) continue;
      if (role === 'avatar' && !settings.blurAvatar) continue;
      if ((role === 'content' || role === 'composer') && !settings.cinemaMode) continue;
      if (role === 'sidebar' && !settings.focusMode) continue;
      const selector = roleSelector(role);
      for (const node of matching(root, `${selector || ':not(*)'}, [data-aurora-${role}]`)) {
        if (node.closest(A.ownedUI)) continue;
        if (role === 'toolbar' && node.tagName === 'FOOTER') continue;
        A.utils.toggleAttribute(node, `data-aurora-${role}`, !!selector && node.matches(selector));
        if ((role === 'content' || role === 'composer') && node.matches(selector)) tagWidth(node);
      }
      // Editors, history labels and avatars can mount inside an existing owner.
      const owner = selector && root.closest?.(selector);
      if (owner && !owner.closest(A.ownedUI)) A.utils.toggleAttribute(owner, `data-aurora-${role}`, true);
    }
  }

  function readCapabilities() {
    const supported = A.site.isSupportedRoute(location.pathname);
    const presence = new Map();
    const present = role => {
      if (!presence.has(role)) presence.set(role, !!document.querySelector(roleSelector(role) || ':not(*)'));
      return presence.get(role);
    };
    const editor = A.dom.findActiveComposer();
    const workflow = A.site.workflow;
    const composer = A.dom.getComposerForm(editor);
    const queue = !!editor && !!composer && (A.site.id === 'chatgpt' || !!workflow?.send && !!workflow?.stop) &&
      !!(A.dom.findComposerButton(editor, 'send') || A.dom.findComposerButton(editor, 'stop'));
    const result = {
      focusMode: present('sidebar') || present('toolbar'), blurChatHistory: present('history'), blurAvatar: present('avatar'),
      cinemaMode: !!editor || present('content'), glassUserMessages: !!editor || present('content'),
      queueWhileGenerating: queue,
      defaultModel: !!A.dom.findModelSwitcher() && !!editor,
      hideRateLimitMessages: !!editor || !!document.querySelector('[data-aurora-rate-limit]'),
      autoContrast: !['__pure_black__', '__gpt5_animated__', ...Object.keys(A.preferences.scenicBackgrounds)].includes(A.getSettings().customBgUrl) &&
        !A.background?.manager?.isVideo?.(A.background.manager.currentUrl),
    };
    for (const key of Object.keys(result)) result[key] = supported && result[key] && A.sites.supports(A.site, key);
    if (!supported) for (const key of Object.keys(A.preferences.defaults)) result[key] = false;
    return result;
  }

  const capabilities = () => A.dom.readScope(readCapabilities);

  function snapshot() {
    return { site: A.site.id, url: location.href, capabilities: capabilities(),
      models: [], currentModel: '', ...A.defaultModel?.snapshot?.() };
  }

  function untag() {
    for (const role of roles) document.querySelectorAll(`[data-aurora-${role}]`).forEach(node => node.removeAttribute(`data-aurora-${role}`));
    document.querySelectorAll('[data-aurora-width]').forEach(node => node.removeAttribute('data-aurora-width'));
    widthOwners = new WeakSet();
  }

  chrome.runtime.onMessage.addListener((request, _sender, respond) => {
    if (request.type === 'GET_SITE_STATE') respond(snapshot());
    if (request.type === 'GET_STARTUP_TIMING') respond({ ...A.startupTimings, enabled: A.isActive() });
  });
  A.interface = { tagElements, capabilities, snapshot, untag };
})();
