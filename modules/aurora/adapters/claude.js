// Current CDS components with semantic fallbacks for older Claude layouts.
(() => {
  'use strict';
  const A = window.AuroraExt;
  Object.assign(A.site, {
    appRoot: '#root, #__next',
    isSupportedRoute: () => true,
    isNewConversation: path => path === '/' || path === '/new' || /^\/project\/[^/]+\/?$/.test(path),
    // The message test ID belongs to its text. Its enclosing native fill owns
    // the bubble's padding and corners, including on incrementally added text.
    surfaceTargets: {
      message: '.bg-bg-user-message, .bg-user-message, .bg-bg-300, [class~="bg-[var(--cds-bg-user-message)]"], [data-cds="UserMessage"]',
    },
    // This native fill keeps ownership through Claude's background transitions.
    // A clear glass frame can otherwise look unpainted during reclassification.
    surfaceShells: {
      composer: '[data-cds="ChatComposer"] > .rounded-composer',
      message: '[class~="bg-[var(--cds-bg-user-message)]"], .bg-bg-user-message, .bg-user-message, [data-cds="UserMessage"]',
    },
    workflow: {
      editor: '[data-testid="chat-input"][contenteditable="true"], [data-testid="chat-input"] [contenteditable="true"], .ProseMirror[contenteditable="true"]',
      composer: '[data-cds="ChatComposer"], [data-testid="composer"], [data-composer], fieldset, form',
      send: 'button[data-testid="chat-input-send"], button[aria-label="Send message"], button[data-testid="send-button"], button[type="submit"]',
      stop: 'button[data-testid="chat-input-stop"], button[aria-label="Stop response"], button[aria-label="Stop generating"], button[data-testid="stop-button"]',
      userMessage: '[data-testid="user-message"], [data-message-author-role="user"]',
      modelTrigger: 'button[data-cds="ModelSelector"], [data-testid="model-selector-dropdown"], button[data-testid="model-selector"], button[aria-label*="model" i][aria-haspopup]',
      modelOption: '[role="menuitemradio"], [role="option"], [role="menuitem"]',
      modelLabel: '[data-testid="model-name"], .truncate',
    },
    selectors: {
      panel: '.bg-surface-1:has(> form), .bg-surface-1.border-border-300, [class~="[direction:ltr]"].rounded-3xl',
      control: 'input.cds-input, form button, form [role="button"]',
      composer: '[data-cds="ChatComposer"] > .rounded-composer, :is([data-testid="chat-input"]:not([contenteditable]), [data-testid="composer"], [data-composer], fieldset:has([contenteditable="true"]), form:has(.ProseMirror)):not(:has([data-cds="ChatComposer"]))',
      editor: '.ProseMirror[contenteditable="true"], [contenteditable="true"][role="textbox"]',
      sidebar: 'nav[aria-label], aside, [data-testid="sidebar"], [data-testid="desktop-sidebar"]',
      menu: '[role="menu"], [role="listbox"], [role="dialog"], [data-radix-popper-content-wrapper] > div',
      message: '[data-testid="user-message"], [data-message-author-role="user"]',
      history: ':is(nav[aria-label], aside, [data-testid="sidebar"], [data-testid="desktop-sidebar"]) :is(a[href*="/chat/"], a[href^="/project/"], a[href^="/projects/"], [data-testid="chat-item"], [data-testid="conversation-item"], [data-testid="chat-title"], [data-testid="conversation-title"])',
      avatar: '[data-testid="user-menu-button"] [data-cds="Avatar"], [data-testid="user-menu-button"] img, [data-testid="user-menu"] img, button[aria-label*="account" i] img',
      // CDS paints header ground and transcript backing separately from their
      // semantic wrappers. They are layout paint, never additional glass panes.
      plane: 'main, #root, #__next, .min-h-screen.bg-surface-1, nav.fixed.bg-surface-1, .dframe-header [data-cds-part="toolbar-ground"], .df-header-peek-cover, [data-testid="transcript-bottom-fade"], [data-testid="transcript-bottom-fade"] > div, [data-cds="ChatComposer"], [data-composer-card-holder]',
      toolbar: 'header, .dframe-header, [data-testid="chat-header"], main .sticky.top-0',
      content: '[data-testid="conversation"], [data-testid="chat-messages"], main .mx-auto[class*="max-w-"]',
      code: 'pre, [data-testid="code-block"], .code-block',
      upgrade: '[data-testid="upgrade-button"], a[href="/upgrade"]',
      upgradeContainer: '[data-testid="upgrade-banner"], [data-testid="upsell-banner"]',
      rateLimit: '[data-testid="usage-limit-banner"], [data-testid="rate-limit-banner"]',
      // Notice hosts contain transparent positioning wrappers around native
      // painted banners. Material ownership selects only the existing fill,
      // including notices added after the composer has already been tagged.
      notice: '[data-testid="usage-limit-notice"], [data-testid="usage-limit-banner"], [data-testid="rate-limit-banner"], [data-cds="Toast"], [data-cds="Banner"], [data-testid="chat-input-banner"], :is([data-cds="ChatComposerNotices"], [data-composer-banner-layer]) :is(div, section):not(button *, a *, [role="button"] *, [data-cds-part="paint"])',
    },
  });
})();
