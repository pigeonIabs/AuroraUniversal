// Existing ChatGPT feature modules remain exclusive to this adapter's manifest entry.
(() => {
  'use strict';
  const A = window.AuroraExt;
  Object.assign(A.site, {
    appRoot: '#__next, #root, #web-mobile-root',
    selectors: {
      history: ':is(#app-shell-sidebar, #stage-slideover-sidebar, [data-testid="sidebar"]) :is(a[href^="/c/"], a[href*="/project/"], a[href*="/projects/"], [data-testid="history-item"], [data-testid="conversation-title"])',
    },
    config: {
      // Selectors
      SELECTORS: {
        APP_ROOT: '#root',
        APP_SIDEBAR: '#app-shell-sidebar',
        CHATGPT_COMPOSER_FORM: 'form[data-chatgpt-composer]',
        CHATGPT_COMPOSER_EDITOR: 'form[data-chatgpt-composer] [contenteditable="true"][data-composer-markdown]',
        CODEX_COMPOSER_EDITOR: '#prompt-textarea[contenteditable="true"]',
        MODEL_SWITCHER_BUTTON: 'button[data-codex-intelligence-trigger="true"]',
        LEGACY_MODEL_SWITCHER_BUTTON: '[data-testid="model-switcher-dropdown-button"]',
        UPGRADE_MENU_ITEM: 'a.__menu-item',
        UPGRADE_TOP_BUTTON_CONTAINER: '.start-1\\/2.absolute',
        UPGRADE_PROFILE_BUTTON_TRAILING_ICON: '[data-testid="accounts-profile-button"] .__menu-item-trailing-btn',
        UPGRADE_SIDEBAR_BUTTON: 'div.gap-1\\.5.__menu-item.group',
        UPGRADE_TINY_SIDEBAR_ICON: '#stage-sidebar-tiny-bar > div:nth-of-type(4)',
        UPGRADE_SETTINGS_ROW_CONTAINER: 'div.py-2.border-b',
        UPGRADE_BOTTOM_BANNER: 'div[role="button"]',
        PROFILE_BUTTON: 'button[aria-label="Open profile menu"]',
      },

      // Default model selection hints (robust to UI text variations)
      MODEL_LABEL_HINTS: {
        'gpt-5.5-instant': ['gpt-5.5 instant', 'instant'],
        'gpt-5.6-sol-medium': ['gpt-5.6 sol medium', 'medium'],
        'gpt-5.6-sol-high': ['gpt-5.6 sol high', 'high'],
      },
    },
    isNewConversation: path => path === '/' || path === '/codex/cloud' || /^\/g\/[^/]+\/?$/.test(path),
    isSupportedRoute: () => true,
  });
})();
