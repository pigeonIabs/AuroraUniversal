// AI Studio's workspaces, API keys, and docs use Angular Material and ms-* components.
(() => {
  'use strict';
  const A = window.AuroraExt;
  Object.assign(A.site, {
    appRoot: 'ms-app, app-root',
    // Appearance applies throughout the site. Chat features remain prompt-scoped.
    isSupportedRoute: () => true,
    isNewConversation: path => /\/(?:prompts\/new_chat)\/?$/.test(path),
    workflow: {
      editor: 'ms-prompt-box textarea, ms-prompt-input-wrapper textarea, .chat-input-field textarea, ms-prompt-input-wrapper [contenteditable="true"]',
      composer: '.prompt-box-container, ms-prompt-input-wrapper, .chat-input-field',
      buttonScope: 'ms-prompt-box, footer:has(ms-run-button)',
      send: 'ms-run-button button:not(:has(.spin, .stoppable-spinner, .stoppable-stop)), button[data-test-id="run-button"]:not([aria-label*="Stop" i])',
      stop: 'ms-run-button button:has(.spin, .stoppable-spinner, .stoppable-stop), button[data-test-id="stop-button"]',
      userMessage: 'ms-chat-turn:has(.user-prompt-container), ms-chat-turn[data-role="user"]',
      modelTrigger: 'button.model-selector-card, ms-model-selector mat-select, .model-selector mat-select, mat-select[aria-label="Model"], button[aria-label="Select model"]',
      modelOption: 'mat-option[role="option"], [role="option"]',
      modelLabel: '.model-name, .model-title, .mdc-list-item__primary-text, .mat-mdc-select-value-text',
    },
    selectors: {
      composer: '.prompt-box-container, ms-prompt-input-wrapper, .chat-input-field',
      editor: 'ms-prompt-box textarea, ms-prompt-input-wrapper textarea, .chat-input-field textarea, ms-prompt-input-wrapper [contenteditable="true"]',
      sidebar: 'ms-navbar-v2 .nav-content, mat-sidenav, mat-drawer, ms-side-nav, ms-sidenav, .left-nav',
      menu: '.nav-flyout-panel, .mat-mdc-menu-panel, .mat-mdc-select-panel, .mat-mdc-dialog-surface, .mat-mdc-tooltip-surface, .cdk-overlay-container :is([role="menu"], [role="listbox"], [role="dialog"])',
      panel: 'ms-run-settings, .run-settings, .run-settings-menu, ms-sliding-right-panel, ms-documentation ms-callout, ms-global-banner .global-banner, ms-thought-chunk:not(ms-conversation-turn-execution-steps *) .compact-accordion > mat-expansion-panel',
      control: 'ms-carousel-nav .carousel-nav, button.model-selector-card, button.system-instructions-card, button.category-card, ms-system-instructions .mat-mdc-text-field-wrapper, ms-system-instructions input[ms-input], ms-system-instructions textarea[ms-input], ms-dashboard-selector .mat-mdc-text-field-wrapper, ms-api-switcher .mat-mdc-text-field-wrapper, ms-nav-items-documentation .search-input, ms-documentation mat-card.docs-card',
      message: 'ms-chat-turn[data-role="user"] .chat-turn-container, ms-chat-turn.user .chat-turn-container',
      history: ':is(ms-navbar-v2, mat-sidenav, mat-drawer, ms-side-nav, ms-sidenav, .left-nav) a[href*="/prompts/"]',
      avatar: 'ms-account-switcher img, button[aria-label*="Google Account"] img',
      plane: 'ms-marketing-welcome-new-screen, ms-hero-prompt, ms-hero-prompt .hero, ms-marketing-slider, ms-marketing-remix, ms-app, app-root, .banner-and-app-container, .makersuite-layout, .layout-wrapper, .layout-main, .router-outlet-wrapper, .chunk-editor-main, mat-sidenav-container, mat-drawer-container, mat-sidenav-content, mat-drawer-content, ms-prompt-view, ms-chat-session, .chat-session-container, ms-api-keys .page-content-wrapper, ms-documentation .page-content-wrapper',
      toolbar: 'ms-marketing-welcome-new-screen .nav, ms-header, ms-toolbar, ms-prompt-toolbar, .prompt-toolbar',
      content: '.chat-session-container',
      code: 'ms-docs-tabs.code-tabs, ms-code-block > .container, pre:not(ms-code-block pre)',
      rateLimit: 'ms-billing-quota-error-callout, ms-quota-error-callout, .quota-exceeded-container, [data-test-id="quota-exceeded"]',
      upgrade: 'a[href*="one.google.com/ai"], [data-test-id="upgrade-button"]',
      upgradeContainer: 'ms-upgrade-banner',
      notice: 'ms-billing-quota-error-callout, ms-quota-error-callout, ms-error-callout, .quota-exceeded-container, .token-cap-banner',
      noticeContent: 'ms-documentation, ms-api-keys, ms-navbar-v2',
    },
    surfaceShells: { panel: 'ms-run-settings, ms-global-banner .global-banner', code: 'ms-docs-tabs.code-tabs' },
  });
})();
