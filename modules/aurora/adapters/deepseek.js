// Keep workflow discovery tied to DeepSeek's chat editor and labelled controls.
(() => {
  'use strict';
  const A = window.AuroraExt;
  const editor = '#root textarea.ds-scroll-area, textarea#chat-input, #root .ds-textarea.cc852ac5 textarea';
  // Editing a sent message uses a separate design-system textarea shell.
  // Its scroll-area class belongs to the shell rather than the textarea.
  const composer = '#root ._77cefa5:has(textarea.ds-scroll-area), #root .ds-textarea.cc852ac5, div:has(> div > div > textarea.ds-scroll-area), .ds-input:has(#chat-input), .chat-input-container:has(#chat-input)';
  // Current chat turns paint the user bubble on this CSS-module element.
  // The outer message row only lays out the bubble and its action buttons.
  const userMessage = '#root .fbb737a4, [data-message-author-role="user"], [data-testid="user-message"]';
  // The history panel owns its paint inside the responsive navigation shell.
  // Its depth changes between desktop and mobile, so target the panel itself.
  const sidebar = '#root .b8812f16, aside, [data-testid="sidebar"]';
  Object.assign(A.site, {
    // The root is a zero-height mount around a viewport-positioned app.
    // Positioning the mount collapses its absolutely positioned children.
    appRoot: '#root > div, #app > div',
    isSupportedRoute: () => true,
    isNewConversation: path => path === '/' || /^\/a\/chat\/?$/.test(path),
    workflow: {
      editor,
      composer,
      send: 'button[aria-label="Send message"], [role="button"][aria-label="Send message"], button[aria-label="Send"], [data-testid="send-button"], .ds-button[role="button"]:has(svg path[d^="M8.3125 0.980206"])',
      stop: 'button[aria-label="Stop generating"], [role="button"][aria-label="Stop generating"], button[aria-label="Stop"], [data-testid="stop-button"], .ds-button[role="button"]:has(svg path[d^="M2 4.88C2 3.68009"])',
      userMessage,
    },
    selectors: {
      composer,
      editor,
      sidebar,
      menu: '.ds-dropdown-menu, .ds-modal-content, .ds-dialog, .ds-tooltip, [role="menu"], [role="listbox"], [role="dialog"]',
      message: userMessage,
      history: ':is(aside, .sidebar, [data-testid="sidebar"]) :is(a[href^="/a/chat/"], a[href^="/chat/"], [data-testid="chat-title"]), a[href^="/a/chat/s/"]',
      avatar: '[data-testid="user-avatar"] img, .ds-avatar img, button[aria-label*="account" i] img',
      // The sticky composer includes a full-width fade and painted caveat.
      // They are layout paint, while the editor retains its own glass surface.
      plane: '#root, #app, #root > div, #root > div > div:has(textarea.ds-scroll-area), #root > div > div > div:has(textarea.ds-scroll-area), #root :is(._871cbca, .d72636e2, ._0fcaa63), #root ._189b4a0 ._6ffc3c9, main, [data-testid="chat-container"]',
      toolbar: '.the-header, [data-testid="chat-header"], main > header',
      // The collapsed navigation groups its icons in one painted control.
      control: '#root ._5a20a69 .e5bf614e, #root .ds-input, #root .ds-button',
      // The compact message markers sit directly on the page. Only the
      // expanded hover list owns glass, following its native open class.
      material: '#root ._189b4a0 ._4ce999d',
      content: '[data-testid="chat-messages"], [data-testid="conversation"]',
      code: '.ds-markdown-code-block, pre:not(.ds-markdown-code-block pre)',
      notice: '.ds-toast, .ds-toast__content, .ds-notification, .ds-message',
    },
    surfaceShells: { sidebar },
  });
})();
