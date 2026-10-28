(() => {
  'use strict';
  const A = window.AuroraExt;
  Object.assign(A.site, {
    appRoot: '#grok-app-root, #__next',
    isSupportedRoute: () => true,
    isNewConversation: path => path === '/',
    workflow: {
      editor: '.query-bar textarea, .query-bar [contenteditable="true"]',
      composer: 'form:has(.query-bar)',
      send: 'button[data-testid="chat-submit"], button[type="submit"][aria-label="Submit"]',
      stop: 'button[data-testid="chat-stop"], button[aria-label="Stop generating"], button[aria-label="Stop response"], button[aria-label="Stop"]',
      userMessage: '[data-message-author-role="user"], .message-bubble.bg-surface-l1, [data-testid="user-message"]',
      modelTrigger: '#model-select-trigger',
      modelOption: '[role="menuitemradio"]',
      modelLabel: '.truncate',
    },
    selectors: {
      composer: '.query-bar',
      editor: '.query-bar textarea, .query-bar [contenteditable="true"]',
      sidebar: 'aside, nav[aria-label], [data-testid="sidebar"], [data-sidebar="sidebar"]',
      menu: '[role="menu"], [role="listbox"], [role="dialog"], [role="tooltip"], [data-radix-popper-content-wrapper] > [data-side], #tooltip-portal :is([class*="bg-surface-"], .bg-background, [data-slot="tooltip-content"])',
      overlay: '#promo-portal > div, #grok-content-area .fixed.inset-0.bg-surface-base',
      panel: ':is(#promo-portal, #dialog-portal, #grok-content-area .fixed.inset-0.bg-surface-base) :is(.bg-surface-l1, [class~="bg-surface-l1/80"], .bg-surface-l2, .bg-surface-l3, .bg-surface-elevated)',
      promotion: '[class~="group/mode-select-upsell"]',
      control: '.query-bar :is(button, button > *):is(.bg-button-filled, .bg-button-primary-fill, .bg-button-secondary-fill, .bg-surface-base, .bg-surface-l1, .bg-surface-l2, .bg-surface-l3, .bg-surface-elevated), :is(#promo-portal, #dialog-portal, #grok-content-area .fixed.inset-0.bg-surface-base) :is(button, a[role="button"]):not([role="switch"])',
      message: '[data-message-author-role="user"], .message-bubble.bg-surface-l1, [data-testid="user-message"]',
      history: ':is(aside, nav[aria-label], [data-testid="sidebar"], [data-sidebar="sidebar"]) :is(a[href^="/c/"], a[href*="/chat/"], a[href^="/project/"], a[href^="/projects/"], [data-testid="chat-item"], [data-testid="conversation-item"], [data-testid="chat-title"], [data-testid="conversation-title"])',
      avatar: '[data-testid="user-avatar"] img, button[aria-label*="account" i] img, [data-testid="user-menu"] img',
      plane: '#grok-app-root, #grok-content-area, [class~="@container/nav"] [aria-hidden="true"], :is(#promo-portal, #dialog-portal) :is(.bg-background, .bg-surface-base)',
      toolbar: '[class~="@container/nav"]',
      content: '#grok-content-area .mx-auto[class*="max-w-"]',
      code: 'pre, .code-block',
      upgrade: 'a[href="/plans"], a[href^="/plans?"], a[href="/subscribe"], a[href^="/subscribe?"], a[href="/supergrok"], a[href="/supergrok/"], [data-testid="upgrade-button"]',
      upgradeContainer: '[class~="group/mode-select-upsell"], [data-testid="upsell-banner"], [data-testid="upgrade-banner"]',
      notice: '#promo-portal [role="alert"], [data-testid="usage-limit-notice"], [data-sonner-toast]',
    },
  });
})();
