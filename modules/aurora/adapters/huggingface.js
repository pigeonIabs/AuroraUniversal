// Hugging Face Hub appearance and HuggingChat's native composer.
(() => {
  'use strict';
  const A = window.AuroraExt;
  const composer = 'form:has(textarea[role="combobox"])';
  const hub = 'body > .flex.min-h-dvh';
  // Hub actions and metadata paint their own native surfaces, including links
  // and labels. Transparent text links keep their existing interaction paint.
  const hubControls = `${hub} :is(.btn, .tag), ${hub} :is(header, main) input:is([type="text"], [type="search"])`;
  const hubPromptControls = `${hub} [data-target="InferenceWidget"] form :is(input[name="prompt"], textarea[name="prompt"], button[type="submit"].btn-widget, label.btn-widget:has(input[type="file"]))`;
  const settings = `html[data-aurora-hub-settings] ${hub}`;
  // Settings reuse Hub form styles across profile, credentials, billing and
  // connected apps. Select arrows and checked artwork keep their native paint.
  const settingsControls = `${settings} :is(input, textarea):is(.form-input, .form-input-alt):not([type="checkbox"], [type="radio"], [type="file"], [type="hidden"], [type="range"], [type="color"]), ${settings} main :is(button, label).border, ${settings} main button.bg-black`;
  const settingsPanels = `${settings} main :is(div, section, aside, nav, ul, li, a).border:is(.rounded, .rounded-sm, .rounded-md, .rounded-lg, .rounded-xl, .rounded-2xl), ${settings} main :is(aside, nav, section, ul).border:has(a[href^="/settings/"]), ${settings} [data-target="UserSettingsHardware"] div.rounded-xl.bg-gray-100`;
  // The repository tree owns the lower half of the bordered file surface.
  // Its commit header owns the upper half, including their native join.
  const hubFiles = `${hub} [data-target="ViewerIndexTreeList"] > ul.border, ${hub} [data-target="LastCommit"] > div.border`;
  // Discussion comments join separately painted top and bottom border shells.
  const hubDiscussion = `${hub} [data-target="DiscussionEvents"] div.border:is(.rounded-t-lg, .rounded-b-lg)`;
  // Collection actions share one painted list, with transparent controls inside.
  const hubCollectionActions = `${hub} ul.border.rounded-2xl:has(a[href="/docs/hub/collections"])`;
  const hubPanels = `${hub} .overview-card-wrapper, ${hub} main :is(div, a).border:is(.rounded-lg, .rounded-xl, .rounded-2xl), ${hub} main > .container > .flex-none, ${hubFiles}, ${hubDiscussion}, ${hubCollectionActions}, ${settingsPanels}`;
  Object.assign(A.site, {
    appRoot: `#app > .fixed.grid, ${hub}`,
    isSupportedRoute: () => true,
    isNewConversation: path => /^\/chat\/?$/.test(path),
    workflow: {
      editor: 'form textarea[role="combobox"][aria-autocomplete="list"]',
      composer,
      send: 'button[aria-label="Send message"]',
      stop: 'button[aria-label="Stop generating"]',
      userMessage: '[data-message-id][data-message-type="user"]',
    },
    selectors: {
      composer,
      editor: 'form textarea[role="combobox"][aria-autocomplete="list"]',
      sidebar: '#app nav:has(a[href="/chat/"]), #app nav:has(a[href="/chat/models"]), #app nav:has(a[href="/chat/models"]) > .border',
      menu: '[data-dropdown-menu-content], [data-dialog-content], [data-popover-content], [role="menu"], [role="listbox"], [role="dialog"]',
      panel: hubPanels,
      control: `${hubControls}, ${hubPromptControls}, ${settingsControls}`,
      history: '#app nav a[href^="/chat/conversation/"]',
      avatar: '#app nav img[src*="/api/users/"][src*="/avatar"], #app nav img[alt*="avatar" i], #app nav img[src*="/avatars/"], #app nav button img, header :is(button, [data-dropdown-menu-trigger]) img[src*="/avatars/"]',
      plane: `#app, #app > .fixed.grid, #app [aria-label="Conversation messages"], ${hub}, ${hub} .SVELTE_HYDRATER.contents, ${hub} main, ${hub} .container`,
      toolbar: `#app nav:has(button[aria-label="Open menu"]):not(:has(a[href="/chat/"])), ${hub} > .contents > header, ${hub} > footer`,
      content: '#app [aria-label="Conversation messages"] > div',
      code: 'pre',
      upgrade: 'a[href="/subscribe/pro"], a[href^="/subscribe/pro?"], a[href^="https://huggingface.co/subscribe/pro"]',
      notice: '#app [data-testid="error-message"], #app [data-toast], #app .toast, #app [role="alert"]',
    },
    surfaceShells: { panel: hubPanels },
  });
})();
