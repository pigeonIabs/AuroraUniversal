// Gemini uses stable custom element names rather than generated Angular classes.
(() => {
  'use strict';
  const A = window.AuroraExt;
  Object.assign(A.site, {
    appRoot: 'chat-app-orchestrator, chat-app, #app-root',
    // All sidebar destinations share the app shell, including discovery and
    // library detail routes. Keep appearance active through their route changes.
    isSupportedRoute: path => path === '/' || /^\/(?:app|apps|extensions|gem|gems|notebook|notebooks|spark|agent|scheduled|scheduled-tasks|search|daily-brief|students|immersive-view|images|videos|library)(?:\/|$)/.test(path),
    isNewConversation: path => path === '/' || path === '/app' || /^\/gem\/[^/]+\/?$/.test(path),
    workflow: {
      editor: 'rich-textarea .ql-editor[contenteditable="true"]',
      composer: 'input-container, input-area-v2',
      send: 'button[data-test-id="send-button"], button.send-button, button[aria-label="Send message"]',
      stop: 'button[data-test-id="stop-button"], button.stop-button, button[aria-label="Stop response"]',
      userMessage: 'user-query',
      modelTrigger: '[data-test-id="bard-mode-menu-button"] button, button[data-test-id="bard-mode-menu-button"], bard-mode-switcher button[aria-label*="mode picker"]',
      modelOption: '[role="menuitemradio"], [role="option"], [role="menuitem"]',
      modelLabel: '.mode-title, .model-name, [data-test-id="mode-name"], .mdc-list-item__primary-text',
      currentLabel: button => button.querySelector('.conversation-title')?.textContent || button.getAttribute('aria-label')?.match(/currently\s+(.+)$/i)?.[1] || button.textContent,
    },
    // This host owns native composer paint even before its deferred CSS arrives.
    surfaceShells: { composer: 'input-area-v2' },
    selectors: {
      // The custom element owns the native background, border, and corner shape.
      // .text-input-field is its square, transparent layout child.
      composer: 'input-area-v2',
      editor: 'rich-textarea .ql-editor[contenteditable="true"]',
      sidebar: 'bard-sidenav, mat-sidenav',
      menu: [
        // Semantic roles also describe inline task lists and hit areas. Only
        // portaled role fallbacks paint menus; named native surfaces work anywhere.
        '.cdk-overlay-container :is([role="menu"], [role="listbox"])',
        '.mat-mdc-menu-panel', '.mat-mdc-select-panel',
        '.mat-mdc-dialog-surface', '.mat-bottom-sheet-container', 'mat-datepicker-content',
        'gem-menu', 'gem-popover [role="dialog"]', '.mat-mdc-tooltip-surface',
        // These templates are portaled outside their component hosts.
        '.file-tree-popover', '.calendar-popover-card',
      ].join(', '),
      message: 'user-query .user-query-bubble-with-background, user-query .user-query-bubble-container',
      // Tag the native paint owners, rather than their square layout hosts.
      panel: [
        'search-bar .search-container',
        'library-list-item .list-item-container', 'library-item-card .library-item-card',
        'gem-processing-card',
        'study-notebooks-section .empty-state-card', 'hero-tile .card-image-container',
        'image-card .image-card',
        ':is(image-generation-zero-state, video-generation-zero-state) .template-overlay',
        'remy-task-list .goal-card', 'remy-task-list .no-tasks-container',
        'remy-viewer .right-pane-inner-wrapper', 'remy-side-panel .remy-side-panel',
        'remy-viewer :is(.split-pane-button, .computer-use-header-button, .remy-plan-pill)',
        'scheduled-tasks-side-pane .side-pane', 'scheduled-tasks-side-pane .frequency-card',
        ':is(schedules-tab, scheduled-tasks-tab) .schedules-list-item',
        'schedules-tab .schedule-limit-banner', 'schedule-editor .schedule-detail-card',
        'skill-card', 'skill-editor :is(.editor-content, .editor-new-content)',
        'skill-folder-manager .readonly-file-viewer',
        'extension-card :is(.extension-card-container, .parent-card)',
        'extension-card child-card .child-card',
        'extensions-window :is(.discovery-banner, .extension-disabled-container, .extension-error-banner)',
        'template-gallery-card .template-gallery-card', 'all-bots .empty-instructions',
        'project-mgmt-row .project-card', 'project-mgmt .empty-instructions',
        'remy-new-task-page .gem-banner-container',
        'elicitations .elicitations-container > .elicitation-item',
      ].join(', '),
      control: [
        // Shared Chat/Spark navigation lives outside the Remy route controls.
        'side-navigation-content mode-switcher-toggle .app-tabs',
        'side-navigation-content gem-nav-list-item[data-test-id="new-chat-button"] .gem-nav-list-item',
        'side-navigation-content .gem-nav-list-item:is(.is-active, .mdc-list-item--activated)',
        ':is(chat-app.remy-route, your-day-viewer, learn-landing-page, discovery-images-page, discovery-videos-page) :is(gem-button.gem-button-type-filled, gem-button.gem-button-type-tonal, gem-button.gem-button-type-bright, gem-button.gem-button-type-accent) :is(button, a)',
        ':is(chat-app.remy-route, your-day-viewer, learn-landing-page, discovery-images-page, discovery-videos-page) :is(gem-icon-button.gem-button-type-tonal, gem-icon-button.gem-button-type-bright, gem-icon-button.gem-button-type-accent) :is(button, a)',
        'template-filter-chips .filter-chip', 'input-companion :is(button, a)',
        'lx-overflow-carousel .carousel-nav-button', 'library-section .view-all-button',
        'library-item-card .icon-overlay',
        'your-day-viewer :is(.your-day-active-goal-button, .your-day-feedback-icon)',
        'skill-editor .save-button', 'skill-folder-manager .nav-btn',
        'schedule-editor .create-save-button', 'schedule-editor .delete-button',
        ':is(extension-card, capabilities-card) .example-prompt', 'discovery-card button[mat-flat-button]',
        'all-bots .bot-creation-button',
        'project-mgmt .create-btn-container button',
      ].join(', '),
      history: ':is(bard-sidenav, mat-sidenav) :is(a[href^="/app/"], a[href^="/gem/"], a[href*="/notebook/"], a[href*="/notebooks/"], [data-test-id="conversation"], .conversation-title, notebook-item, notebook-list-item, [data-test-id="notebook-item"], [data-test-id="notebook-list-item"], [class*="notebook-item"], [class*="notebook-entry"], [class*="notebook-title"], [class*="notebook-name"]), [data-test-id="notebooks-expandable-section"] :is(a[href], [role="link"], notebook-item, notebook-list-item), remy-task-list :is(.goal-description, .goal-secondary-text)',
      avatar: 'user-profile-picture img, sidenav-mavatar-footer img, a[aria-label*="Google Account"] img',
      plane: [
        'chat-app-orchestrator', 'chat-app', 'side-navigation-v2', 'bard-sidenav-container',
        'bard-sidenav-content', 'mat-sidenav-container', 'mat-sidenav-content', '.mat-drawer-content',
        'chat-window', 'chat-window-content', 'input-container', 'infinite-scroller.chat-history',
        'top-bar-actions', 'side-navigation-content',
        'search-window', 'search-window .search-window-container', 'search-zero-state', 'search-results',
        'your-day-viewer', 'your-day-viewer :is(.your-day-page, .your-day-content-wrapper, .your-day-feed-view)',
        'learn-landing-page', 'learn-landing-page :is(.learn-page-container, .learn-page-chat-window)',
        'discovery-images-page', 'discovery-images-page :is(.images-page-container, .images-page-chat-window)',
        'discovery-videos-page', 'media-gen-zero-state-shell',
        'library-sections-overview-page', 'library-sections-overview-page :is(.library-overview-page-container, .item-list-container)',
        'library-page', 'library-page :is(.library-page-container, .item-list-container)',
        'library-section', 'library-item-grid', 'library-item-grid .library-item-grid',
        'remy-new-task-page', 'remy-viewer', 'remy-viewer .split-pane-container',
        'remy-side-panel', 'remy-viewer .mobile-side-panel-overlay',
        'remy-task-list', 'remy-task-list .goal-list',
        'scheduled-tasks-tab', 'scheduled-tasks-tab :is(.scheduled-tasks-layout, .tasks-pane, .title-and-filter-row, .input-area-row, .schedules-list)',
        'skills-viewer', 'remy-memory-viewer', 'extensions-window', 'extensions-window .extensions-window-container',
        'all-bots', 'all-bots :is(.container, .inner-container, .premade-gems-cards-container, .premade-gems-cards-container-inner, .premade-gems-cards-overflow-curtain, .bot-list-container, .bots-section-container)',
        'project-mgmt', 'project-mgmt :is(.container, .inner-container, .list-header, .projects-section-container)',
        'project-mgmt-row', 'project-mgmt-row .project-card-container',
      ].join(', '),
      content: '.conversation-container, .conversation-content',
      code: 'code-block .formatted-code-block-internal-container, pre',
      upgrade: 'a[href*="one.google.com/ai"], [data-test-id="upgrade-button"], upsell-button button',
      upgradeContainer: 'upsell-button, [data-test-id="upsell-banner"], [data-test-id="upgrade-banner"]',
      rateLimit: 'usage-limit-banner, rate-limit-banner, [data-test-id="usage-limit-notice"]',
      notice: 'mat-snack-bar-container, .mat-mdc-snack-bar-container, .mat-mdc-snackbar-surface, .limit-banner, .schedule-limit-banner',
    },
  });
})();
