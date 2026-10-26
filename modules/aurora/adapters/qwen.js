// Qwen's named desktop/mobile components also expose semantic model choices.
(() => {
  'use strict';
  const A = window.AuroraExt;
  Object.assign(A.site, {
    appRoot: '#root',
    isSupportedRoute: path => path === '/' || /^\/(?:c|chat|s|share|project|projects|artifacts|settings|library)(?:\/|$)/.test(path) || /^\/community\/collections(?:\/|$)/.test(path),
    isNewConversation: path => path === '/' || path === '/chat' || path === '/chat/',
    workflow: {
      editor: '.message-input-container textarea.message-input-textarea',
      composer: '.message-input-container',
      send: 'button.send-button, button[aria-label="Send"], button[aria-label="Send message"]',
      stop: 'button.stop-button, button[aria-label="Stop"], button[aria-label="Stop generating"]',
      userMessage: '.qwen-chat-message-user, [data-message-author-role="user"]',
      modelTrigger: '.wms-trigger[aria-haspopup="listbox"], [aria-label="Select Model"][aria-haspopup="listbox"]',
      modelOption: '.wms-list__item[role="option"]',
      modelLabel: '.wms-list__name-text, .wms-trigger__text',
    },
    selectors: {
      composer: '.message-input-container',
      editor: '.message-input-container textarea.message-input-textarea',
      sidebar: '.sidebar, .sidebar-floating, .setting-side-bar',
      menu: '.wms-popup, .qwen-chat-v2-dropdown-menu-content, .qwen-chat-v2-dropdown-menu-popup, .touch-more-dropdown, .qwen-chat-v2-modal-content, .qwen-chat-v2-popup, .qwen-modal-content, .qwen-select-dropdown, .qwen-language-dropdown, .ant-modal-content, .ant-dropdown-menu, .ant-select-dropdown, .ant-popover-inner, [role="dialog"], [role="menu"], [role="listbox"]',
      message: '.chat-user-message-container .chat-user-message, [data-message-author-role="user"]',
      history: ':is(.sidebar, .sidebar-side, .sidebar-floating) :is(a[href^="/c/"], a[href^="/chat/"], .sidebar-entry-list-text, .sidebar-entry-fixed-list-text)',
      avatar: '.sidebar-user img, .sidebar-user-small img, [data-testid="user-avatar"] img',
      // Thinking shares the composer's fill and explicitly has no native border.
      plane: '#root, .app, .desktop-layout, .desktop-layout-content, .desktop-layout-content-inner, .desktop-layout-content-chat-panel, .splitter-container, .splitter-container-left-panel, .home-page-layout-main, .chat-layout, .chat-container, .h5-layout, .layout-main, .main-content, .message-input-wrapper, .sidebar-wrapper, .sidebar-side, .qwen-chat-setting, .qwen-chat-setting-content, .setting-content, .settings-overlay, .library-content, .library-content-header, .library-content-scroll-segment, .library-content-body, .collections-page, .water-fall-container-collection, .qwen-thinking-selector .qwen-chat-v2-dropdown-menu-select-button',
      toolbar: '.header-desktop, .header-mobile, .chat-header, .qwen-chat-setting .layout-header, .settings-overlay-header, .library-content .layout-common-header, .community-header-desktop, .community-header-mobile',
      content: '.chat-container, .qwen-chat-message, .qwen-chat-message-select-turn-active',
      code: '.qwen-markdown-code, pre:not(.qwen-markdown-code pre)',
      panel: '.satisfaction-rating, .model-item-shell, .mcp-card, .subscription-usage-overview-plan, .settings-overlay-content :is(.user, .menu-buttons-wrapper), .about-shell .native-about, .qwen-chat-setting :is(.mobile-personalization-custom-instruction-content, .mobile-personalization-reference, .qwen-chat-comp-mobile-voice-content-list, .chat-voice-select-mobile-container), :is(.library-content, .collections-page) :is(.audio-controls, .item-card-report)',
      control: '[class*="index-module__custom-instr-respond-style-item___"], .message-input-container :is(#voice-input-button, button[aria-label="Voice mode"]), .sidebar-user-upgrade-plan-button, .sidebar-user .member-upgrade-button, .library-content .header-collections-button, :is(.library-content, .collections-page) :is(.qwen-chat-v2-tabs-capsule .qwen-chat-v2-tabs-nav-list, .library-item-operation-icon, .item-card-tag, .play-pause-btn), :is(.qwen-chat-setting, .settings-overlay, .qwen-modal-content, .ant-modal-content, .qwen-chat-v2-popup) :is(.qwen-chat-v2-tabs-capsule .qwen-chat-v2-tabs-nav-list, .qwen-chat-v2-input.ant-input:not(.ant-input-affix-wrapper .ant-input), .qwen-chat-v2-input.ant-input-affix-wrapper, .qwen-chat-v2-input-textarea, .qwen-select .ant-select-selector, .profile-name-input, .qwen-chat-v2-btn-primary, .qwen-chat-v2-btn-black, .qwen-chat-v2-btn-gray, .qwen-chat-v2-btn-secondary, .qwen-chat-v2-btn-plain, .qwen-chat-btn-primary, .qwen-chat-btn-secondary, .qwen-input)',
      upgrade: '.sidebar-user-upgrade-plan-button, .sidebar-user .member-upgrade-button, .sidebar-side-fold-container-upgrade',
      upgradeContainer: '.upgrade-banner, .upgrade-plan-banner',
      notice: '.ant-message-notice-content, .ant-notification-notice, .qwen-chat-v2-toast, .qwen-chat-v2-alert, .message-input-tip',
    },
  });
})();
