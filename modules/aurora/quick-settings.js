// modules/aurora/quick-settings.js
// Quick Settings floating button and panel UI.
(() => {
  'use strict';

  const A = (window.AuroraExt = window.AuroraExt || {});
  A.quickSettings = A.quickSettings || {};

  const cfg = A.config || {};
  const QS_BUTTON_ID = cfg.QS_BUTTON_ID || 'cgpt-qs-btn';
  const QS_PANEL_ID = cfg.QS_PANEL_ID || 'cgpt-qs-panel';

  const getMessage = A.i18n?.getMessage || ((k) => k);
  const isEnabled = () => (A.isEnabled ? A.isEnabled() : true);
  const getSettings = () => (A.getSettings ? A.getSettings() : {});

  let themeTimer = null;
  let outsideClick = null;
  let escapeKey = null;

  function syncPanel(panel, settings) {
    const context = { capabilities: A.interface?.capabilities?.() };
    panel.querySelectorAll('.qs-row[data-setting]').forEach(row => {
      A.utils.toggleAttribute(row, 'hidden', !A.sites.supports(A.site, row.dataset.setting, context));
    });
    panel.querySelectorAll('.qs-section-title').forEach(title => {
      let row = title.nextElementSibling;
      let visible = false;
      while (row && !row.classList.contains('qs-section-title')) {
        if (!row.hidden) visible = true;
        row = row.nextElementSibling;
      }
      A.utils.toggleAttribute(title, 'hidden', !visible);
    });
    panel.querySelectorAll('.qs-row[data-setting] input').forEach(input => {
      input.checked = !!settings[input.closest('.qs-row').dataset.setting];
    });
    const appearance = settings.appearance || 'clear';
    const toggle = panel.querySelector('#qs-appearance-toggle');
    if (toggle) A.utils.setAttribute(toggle, 'data-switch-state', appearance === 'dimmed' ? '1' : '0');
    toggle?.querySelectorAll('button').forEach(button => {
      A.utils.setAttribute(button, 'aria-pressed', String(button.dataset.settingValue === appearance));
    });
  }

  function ensure() {
    if (!A.isActive() || getSettings().hideQuickSettings) { remove(); return; }
    if (!document.body) return;

    const settings = getSettings();

    let btn = document.getElementById(QS_BUTTON_ID);
    let panel = document.getElementById(QS_PANEL_ID);
    if (!btn || !panel) {
      remove();
      btn = null;
      panel = null;
    }

    if (!btn) {
      btn = document.createElement('button');
      btn.id = QS_BUTTON_ID;
      btn.title = getMessage('quickSettingsButtonTitle');
      btn.setAttribute('aria-label', btn.title);
      btn.setAttribute('aria-expanded', 'false');
      btn.setAttribute('aria-controls', QS_PANEL_ID);
      btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 15.5A3.5 3.5 0 0 1 8.5 12A3.5 3.5 0 0 1 12 8.5A3.5 3.5 0 0 1 15.5 12A3.5 3.5 0 0 1 12 15.5M19.43 12.98C19.47 12.65 19.5 12.33 19.5 12S19.47 11.35 19.43 11L21.54 9.37C21.73 9.22 21.78 8.95 21.66 8.73L19.66 5.27C19.54 5.05 19.27 4.96 19.05 5.05L16.56 6.05C16.04 5.66 15.5 5.32 14.87 5.07L14.5 2.42C14.46 2.18 14.25 2 14 2H10C9.75 2 9.54 2.18 9.5 2.42L9.13 5.07C8.5 5.32 7.96 5.66 7.44 6.05L4.95 5.05C4.73 4.96 4.46 5.05 4.34 5.27L2.34 8.73C2.21 8.95 2.27 9.22 2.46 9.37L4.57 11C4.53 11.35 4.5 11.67 4.5 12S4.53 12.65 4.57 12.98L2.46 14.63C2.27 14.78 2.21 15.05 2.34 15.27L4.34 18.73C4.46 18.95 4.73 19.04 4.95 18.95L7.44 17.94C7.96 18.34 8.5 18.68 9.13 18.93L9.5 21.58C9.54 21.82 9.75 22 10 22H14C14.25 22 14.46 21.82 14.5 21.58L14.87 18.93C15.5 18.68 16.04 18.34 16.56 17.94L19.05 18.95C19.27 19.04 19.54 18.95 19.66 18.73L21.66 15.27C21.78 15.05 21.73 14.78 21.54 14.63L19.43 12.98Z"></path></svg>`;
      document.body.appendChild(btn);

      panel = document.createElement('div');
      panel.id = QS_PANEL_ID;
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-label', getMessage('quickSettingsButtonTitle'));
      document.body.appendChild(panel);

      panel.setAttribute('data-state', 'closed');
      const openPanel = () => {
        populatePanel(panel);
        panel.setAttribute('data-state', 'open');
        btn.setAttribute('aria-expanded', 'true');
      };
      const closePanel = () => {
        panel.setAttribute('data-state', (getSettings().disableAnimations || matchMedia('(prefers-reduced-motion: reduce)').matches) ? 'closed' : 'closing');
        btn.setAttribute('aria-expanded', 'false');
      };

      panel.addEventListener('animationend', (e) => {
        if (e.animationName === 'qs-panel-close' && panel.getAttribute('data-state') === 'closing') {
          panel.setAttribute('data-state', 'closed');
        }
      });

      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const state = panel.getAttribute('data-state');
        if (state === 'open') closePanel();
        else openPanel();
      });

      outsideClick = (e) => {
        if (panel && !panel.contains(e.target) && panel.getAttribute('data-state') === 'open') {
          closePanel();
        }

      };
      document.addEventListener('click', outsideClick);
      escapeKey = (event) => {
        if (event.key === 'Escape' && panel.getAttribute('data-state') === 'open') {
          closePanel();
          btn.focus();
        }
      };
      document.addEventListener('keydown', escapeKey);
    }

    // Build controls when opened. Hydration and settings updates retain the same
    // panel and focused inputs once it has been populated.
    if (panel.childElementCount) syncPanel(panel, settings);
  }

  function populatePanel(panel) {
    const settings = getSettings();
    if (panel.childElementCount) { syncPanel(panel, settings); return; }

    const createSectionTitle = (messageKey) => {
      const title = document.createElement('div');
      title.className = 'qs-section-title';
      title.textContent = getMessage(messageKey);
      return title;
    };

    const createToggleRow = (setting, messageKey) => {
      const row = document.createElement('div');
      row.className = 'qs-row';
      row.dataset.setting = setting;

      const title = document.createElement('label');
      title.textContent = getMessage(messageKey);

      const switchLabel = document.createElement('label');
      switchLabel.className = 'switch';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.id = `qs-${setting}`;
      title.htmlFor = input.id;
      input.setAttribute('aria-label', getMessage(messageKey));
      const track = document.createElement('span');
      track.className = 'track';
      const thumb = document.createElement('span');
      thumb.className = 'thumb';
      track.appendChild(thumb);
      switchLabel.append(input, track);
      row.append(title, switchLabel);
      return row;
    };

    const appearanceRow = document.createElement('div');
    appearanceRow.className = 'qs-row';
    appearanceRow.dataset.setting = 'appearance';
    const appearanceLabel = document.createElement('label');
    appearanceLabel.textContent = getMessage('quickSettingsLabelGlassStyle');
    const appearanceSwitch = document.createElement('div');
    appearanceSwitch.className = 'aurora-glass-switch';
    appearanceSwitch.id = 'qs-appearance-toggle';
    appearanceSwitch.dataset.switchState = settings.appearance === 'dimmed' ? '1' : '0';
    const appearanceGlider = document.createElement('div');
    appearanceGlider.className = 'aurora-switch-glider';
    appearanceSwitch.appendChild(appearanceGlider);
    [
      ['0', 'clear', 'glassAppearanceOptionClear'],
      ['1', 'dimmed', 'glassAppearanceOptionDimmed'],
    ].forEach(([value, settingValue, messageKey]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'aurora-switch-btn';
      button.dataset.value = value;
      button.dataset.settingValue = settingValue;
      button.textContent = getMessage(messageKey);
      appearanceSwitch.appendChild(button);
    });
    appearanceRow.append(appearanceLabel, appearanceSwitch);

    panel.replaceChildren(
      createSectionTitle('quickSettingsSectionVisibility'),
      createToggleRow('focusMode', 'labelFocusMode'),
      createToggleRow('hideUpgradeButtons', 'quickSettingsLabelHideUpgradeButtons'),
      createToggleRow('hideRateLimitMessages', 'labelHideRateLimitMessages'),
      createToggleRow('hideAIWarnings', 'labelHideAIWarnings'),
      createToggleRow('blockAds', 'labelBlockAds'),
      createSectionTitle('tabPrivacy'),
      createToggleRow('blurChatHistory', 'labelBlurChatHistory'),
      createToggleRow('blurAvatar', 'labelBlurAvatar'),
      createToggleRow('dataMaskingEnabled', 'labelEnableDataMasking'),
      createSectionTitle('tabBehavior'),
      createToggleRow('cinemaMode', 'labelCinemaMode'),
      createToggleRow('queueWhileGenerating', 'labelQueueWhileGenerating'),
      createSectionTitle('sectionAppearance'),
      appearanceRow
    );

    const qsToggles = ['focusMode', 'hideUpgradeButtons', 'hideRateLimitMessages', 'hideAIWarnings', 'blockAds', 'blurChatHistory', 'blurAvatar', 'dataMaskingEnabled', 'cinemaMode', 'queueWhileGenerating'];
    qsToggles.forEach((key) => {
      const checkbox = document.getElementById(`qs-${key}`);
      if (!checkbox) return;
      checkbox.checked = !!settings[key];
      checkbox.addEventListener('change', () => {
        chrome.storage.sync.set({ [key]: checkbox.checked });
      });
    });

    const appearanceToggle = document.getElementById('qs-appearance-toggle');
    if (appearanceToggle) {
      const currentAppearance = settings.appearance || 'clear';
      appearanceToggle.setAttribute('data-switch-state', currentAppearance === 'dimmed' ? '1' : '0');

      const segmentBtns = appearanceToggle.querySelectorAll('.aurora-switch-btn');
      segmentBtns.forEach((btnEl) => {
        btnEl.addEventListener('click', () => {
          const settingValue = btnEl.dataset.settingValue;
          const switchState = btnEl.dataset.value;

          document.documentElement.classList.add('cgpt-theme-transitioning');
          if (themeTimer) clearTimeout(themeTimer);
          themeTimer = setTimeout(() => {
            document.documentElement.classList.remove('cgpt-theme-transitioning');
            themeTimer = null;
          }, 600);

          chrome.storage.sync.set({ appearance: settingValue });
          appearanceToggle.setAttribute('data-switch-state', switchState);
        });
      });
    }
    syncPanel(panel, settings);
  }

  function remove() {
    if (outsideClick) document.removeEventListener('click', outsideClick);
    if (escapeKey) document.removeEventListener('keydown', escapeKey);
    escapeKey = null;
    outsideClick = null;
    if (themeTimer) clearTimeout(themeTimer);
    themeTimer = null;
    document.getElementById(QS_BUTTON_ID)?.remove();
    document.getElementById(QS_PANEL_ID)?.remove();
  }

  A.quickSettings.ensure = A.quickSettings.ensure || ensure;
  A.quickSettings.refreshCapabilities = () => {
    const panel = document.getElementById(QS_PANEL_ID);
    if (panel?.getAttribute('data-state') === 'open') syncPanel(panel, getSettings());
  };
  A.quickSettings.remove = A.quickSettings.remove || remove;
})();
