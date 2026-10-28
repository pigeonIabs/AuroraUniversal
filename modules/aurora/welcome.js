// modules/aurora/welcome.js
// Welcome and onboarding overlay shown once per install.
(() => {
  'use strict';

  const A = (window.AuroraExt = window.AuroraExt || {});
  A.welcome = A.welcome || {};

  const cfg = A.config || {};
  const GROK_HORIZON_URL = cfg.GROK_HORIZON_URL || '';
  const QS_BUTTON_ID = cfg.QS_BUTTON_ID || 'cgpt-qs-btn';

  const getMessage = A.i18n?.getMessage || ((k) => k);
  const getSettings = () => (A.getSettings ? A.getSettings() : {});
  const escapeHtml = (value) =>
    String(value ?? '').replace(/[&<>"']/g, (character) => {
      const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
      return entities[character];
    });

  function getWelcomeScreenHTML() {
    const logoUrl = chrome?.runtime?.getURL ? chrome.runtime.getURL('icons/logo-48.png') : '';
    return `
      <div id="aurora-welcome-overlay">
        <div class="welcome-container">
          <div id="screen-1" class="screen active">
            <div class="content-panel">
              <img src="${escapeHtml(logoUrl)}" alt="Aurora" class="aurora-logo-img">
              <h1>${escapeHtml(getMessage('welcomeTitle'))}</h1>
              <p>${escapeHtml(getMessage('welcomeDescription'))}</p>
              <div class="progress-dots">
                <span class="dot active"></span>
                <span class="dot"></span>
              </div>
              <button id="get-started-btn" class="welcome-btn primary">${escapeHtml(
                getMessage('welcomeBtnGetStarted')
              )}</button>
            </div>
          </div>
        </div>

        <div id="aurora-style-bar" class="aurora-setup-bar">
          <div class="setup-section">
            <label class="section-label">${escapeHtml(getMessage('welcomeLabelBgPreset'))}</label>
            <div class="preset-grid">
              <button class="preset-tile" data-bg-url="default">
                <div class="preview default"></div>
                <span>${escapeHtml(getMessage('welcomePresetDefault'))}</span>
              </button>
              <button class="preset-tile" data-bg-url="__gpt5_animated__">
                <div class="preview animated"></div>
                <span>${escapeHtml(getMessage('welcomePresetAnimated'))}</span>
              </button>
              <button class="preset-tile" data-bg-url="grokHorizon">
                <div class="preview grok"></div>
                <span>${escapeHtml(getMessage('welcomePresetHorizon'))}</span>
              </button>
              <button class="preset-tile" data-bg-url="__deep_ocean__">
                <div class="preview ocean" style="background-image:url('${escapeHtml(chrome.runtime.getURL('assets/themes/deep-ocean-preview.webp'))}')"></div>
                <span>${escapeHtml(getMessage('bgPresetOptionDeepOcean'))}</span>
              </button>
            </div>
          </div>

          <div class="setup-section">
            <label class="section-label">${escapeHtml(getMessage('welcomeLabelGlassStyle'))}</label>
            <div id="welcome-glass-control"></div>
          </div>

          <div class="progress-dots bar-dots">
            <span class="dot"></span>
            <span class="dot active"></span>
          </div>

          <button id="finish-btn" class="welcome-btn primary finish-button">${escapeHtml(
            getMessage('welcomeBtnFinish')
          )}</button>
        </div>

        <div id="aurora-success-overlay" class="success-overlay">
          <div class="success-checkmark">
            <svg viewBox="0 0 52 52">
              <circle cx="26" cy="26" r="25" fill="none"/>
              <path fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8"/>
            </svg>
          </div>
        </div>
      </div>
    `;
  }

  function show(applyAllSettings) {
    if (!document.body) return;
    if (document.getElementById('aurora-welcome-overlay')) return;

    const welcomeDocument = new DOMParser().parseFromString(getWelcomeScreenHTML(), 'text/html');
    const parsedOverlay = welcomeDocument.getElementById('aurora-welcome-overlay');
    if (parsedOverlay) document.body.appendChild(document.importNode(parsedOverlay, true));

    const settings = getSettings();
    const tempSettings = { ...settings };

    const getStartedBtn = document.getElementById('get-started-btn');
    const finishBtn = document.getElementById('finish-btn');
    const welcomeOverlay = document.getElementById('aurora-welcome-overlay');
    const welcomeContainer = document.querySelector('.welcome-container');
    const styleBar = document.getElementById('aurora-style-bar');

    const finishWelcome = () => {
      tempSettings.hasSeenWelcomeScreen = true;
      A.preferences.save({ ...A.preferences.pickAppearance(tempSettings), hasSeenWelcomeScreen: true }, A.site.id, () => {
        if (chrome.runtime.lastError) return;

        const successOverlay = document.getElementById('aurora-success-overlay');
        if (successOverlay) {
          successOverlay.classList.add('active');
          setTimeout(() => {
            welcomeOverlay?.remove();
            setTimeout(() => {
              const qsBtn = document.getElementById(QS_BUTTON_ID);
              if (!qsBtn) return;
              qsBtn.classList.add('sparkle-hint');
              qsBtn.addEventListener(
                'click',
                () => {
                  qsBtn.classList.remove('sparkle-hint');
                },
                { once: true }
              );
            }, 500);
          }, 1200);
        } else {
          welcomeOverlay?.remove();
        }
      });
    };

    getStartedBtn?.addEventListener('click', () => {
      welcomeOverlay?.classList.add('setup-active');

      if (welcomeContainer) {
        welcomeContainer.classList.add('exiting');
        setTimeout(() => styleBar?.classList.add('active'), 150);
        setTimeout(() => {
          welcomeContainer.style.display = 'none';
        }, 500);
      } else {
        styleBar?.classList.add('active');
      }

      const defaultTile = document.querySelector('#aurora-style-bar .preset-tile[data-bg-url="default"]');
      defaultTile?.classList.add('active');
    });

    finishBtn?.addEventListener('click', finishWelcome);

    document.querySelectorAll('#aurora-style-bar .preset-tile').forEach((tile) => {
      tile.addEventListener('click', () => {
        document.querySelectorAll('#aurora-style-bar .preset-tile').forEach((t) => t.classList.remove('active'));
        tile.classList.add('active');
        const bgChoice = tile.dataset.bgUrl;
        let newUrl = '';

        if (bgChoice === '__deep_ocean__') newUrl = '__deep_ocean__';
        else if (bgChoice === 'grokHorizon') newUrl = GROK_HORIZON_URL;
        else if (bgChoice === '__gpt5_animated__') newUrl = '__gpt5_animated__';

        tempSettings.customBgUrl = newUrl;
        settings.customBgUrl = newUrl;
        if (typeof applyAllSettings === 'function') applyAllSettings();
      });
    });

    const glassHost = document.getElementById('welcome-glass-control');
    glassHost?.append(A.glassControl.create('welcome-glass-amount', settings, patch => {
      Object.assign(tempSettings, patch);
      Object.assign(settings, patch);
      if (typeof applyAllSettings === 'function') applyAllSettings();
    }, () => {}));
  }

  A.welcome.show = A.welcome.show || show;
})();
