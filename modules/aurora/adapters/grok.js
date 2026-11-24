(() => {
  'use strict';
  const A = window.AuroraExt;
  // Grok's desktop redesign hashes visual classes, but keeps composer hooks.
  // The form owns the fill. Nested data-composer-surface nodes are layout only.
  const composer = '[data-composer], .query-bar';
  const editor = ':is([data-composer], .query-bar) :is(textarea, [contenteditable="true"]), [data-testid="chat-input"] [contenteditable="true"]';
  Object.assign(A.site, {
    appRoot: '#grok-app-root, #__next',
    isSupportedRoute: () => true,
    isNewConversation: path => path === '/',
    workflow: {
      editor,
      composer: 'form[data-composer], form:has(.query-bar)',
      send: 'button[data-testid="chat-submit"], button[data-composer-action="send"], button[type="submit"][aria-label="Submit"]',
      stop: 'button[data-testid="chat-stop"], button[aria-label="Stop generating"], button[aria-label="Stop response"], button[aria-label="Stop"]',
      userMessage: '[data-message-author-role="user"], .message-bubble.bg-surface-l1, [data-testid="user-message"]',
      modelTrigger: '#model-select-trigger',
      modelOption: '[role="menuitemradio"], [role="menuitemcheckbox"]',
      modelLabel: '.truncate',
    },
    selectors: {
      composer,
      editor,
      sidebar: 'aside, nav[aria-label], [data-testid="sidebar"], [data-sidebar="sidebar"]',
      menu: '[role="menu"], [role="listbox"], [role="dialog"], [role="tooltip"], [data-radix-popper-content-wrapper] > [data-side], #tooltip-portal :is([class*="bg-surface-"], .bg-background, [data-slot="tooltip-content"])',
      overlay: '#promo-portal > div, #grok-content-area .fixed.inset-0.bg-surface-base',
      panel: '[class~="group/pane-card"], :is(#promo-portal, #dialog-portal, #grok-content-area .fixed.inset-0.bg-surface-base) :is(.bg-surface-l1, [class~="bg-surface-l1/80"], .bg-surface-l2, .bg-surface-l3, .bg-surface-elevated)',
      promotion: '[class~="group/mode-select-upsell"]',
      control: '[data-composer] button, .query-bar :is(button, button > *):is(.bg-button-filled, .bg-button-primary-fill, .bg-button-secondary-fill, .bg-surface-base, .bg-surface-l1, .bg-surface-l2, .bg-surface-l3, .bg-surface-elevated), :is(#promo-portal, #dialog-portal, #grok-content-area .fixed.inset-0.bg-surface-base) :is(button, a[role="button"]):not([role="switch"])',
      message: '[data-message-author-role="user"], .message-bubble.bg-surface-l1, [data-testid="user-message"]',
      history: ':is(aside, nav[aria-label], [data-testid="sidebar"], [data-sidebar="sidebar"]) :is(a[href^="/c/"], a[href*="/chat/"], a[href^="/project/"], a[href^="/projects/"], [data-testid="chat-item"], [data-testid="conversation-item"], [data-testid="chat-title"], [data-testid="conversation-title"])',
      avatar: '[data-testid="user-avatar"] img, button[aria-label*="account" i] img, [data-testid="user-menu"] img',
      plane: '#grok-app-root, #grok-content-area, div:has(> #grok-app-root), div:has(> #grok-content-area), [class~="@container/nav"] [aria-hidden="true"], :is(#promo-portal, #dialog-portal) :is(.bg-background, .bg-surface-base)',
      toolbar: '[class~="@container/nav"], #grok-content-area header',
      content: '#grok-content-area .mx-auto[class*="max-w-"]',
      code: 'pre, .code-block',
      upgrade: 'a[href="/plans"], a[href^="/plans?"], a[href="/subscribe"], a[href^="/subscribe?"], a[href="/supergrok"], a[href="/supergrok/"], [data-testid="upgrade-button"]',
      upgradeContainer: '[class~="group/mode-select-upsell"], [data-testid="upsell-banner"], [data-testid="upgrade-banner"]',
      notice: '#promo-portal [role="alert"], [data-testid="usage-limit-notice"], [data-sonner-toast]',
    },
  });
})();
