// Small shared registry used by content scripts and the settings popup.
(() => {
  'use strict';
  // Firefox gives content scripts a globalThis distinct from their window.
  // Share the same window namespace used by every feature module.
  const A = (window.AuroraExt = window.AuroraExt || {});
  A.startupTimings = { injected: performance.now() };
  const chatgptOnly = new Set([
    'legacyComposer', 'voiceColor', 'cuteVoiceUI', 'blockAds',
  ]);
  const chatFeatures = new Set(['queueWhileGenerating', 'defaultModel', 'cinemaMode', 'glassUserMessages']);
  const visibilityFeatures = new Set(['focusMode', 'hideUpgradeButtons', 'hideRateLimitMessages', 'hideAIWarnings']);
  const sites = [
    { id: 'chatgpt', name: 'ChatGPT', host: 'chatgpt.com' },
    { id: 'claude', name: 'Claude', host: 'claude.ai' },
    { id: 'gemini', name: 'Gemini', host: 'gemini.google.com' },
    { id: 'grok', name: 'Grok', host: 'grok.com' },
    { id: 'qwen', name: 'Qwen', host: 'chat.qwen.ai' },
    { id: 'aistudio', name: 'Google AI Studio', host: 'aistudio.google.com' },
    { id: 'deepseek', name: 'DeepSeek', host: 'chat.deepseek.com', capabilities: { defaultModel: false, hideUpgradeButtons: false } },
    { id: 'huggingface', name: 'Hugging Face', host: 'huggingface.co', capabilities: { defaultModel: false } },
  ];
  const matchesPath = (site, path) => !site.pathPrefix || path === site.pathPrefix || path.startsWith(`${site.pathPrefix}/`);
  sites.forEach(site => {
    site.matches = site.pathPrefix
      ? [`https://${site.host}${site.pathPrefix}`, `https://${site.host}${site.pathPrefix}/*`]
      : [`https://${site.host}/*`];
  });
  A.sites = {
    all: sites,
    fromUrl(url) {
      try {
        const parsed = new URL(url);
        return parsed.protocol === 'https:' ? sites.find(site => site.host === parsed.hostname && matchesPath(site, parsed.pathname)) || null : null;
      }
      catch { return null; }
    },
    supports(site, setting, context = {}) {
      if (!site || site.capabilities?.[setting] === false || (site.id !== 'chatgpt' && chatgptOnly.has(setting))) return false;
      let path = context.path;
      if (context.url) {
        try { path = new URL(context.url).pathname; } catch { /* Use the site default. */ }
      }
      if (path === undefined && site === A.site) path = location.pathname;
      if (site.id === 'huggingface' && path !== undefined && !/^\/chat(?:\/|$)/.test(path) &&
          (chatFeatures.has(setting) || setting === 'blurChatHistory')) return false;
      if (site.id === 'aistudio' && path !== undefined && chatFeatures.has(setting) && !/\/(?:prompts)(?:\/|$)/.test(path)) return false;
      // Documentation and key management receive material changes only. Their
      // navigation and instructional copy are native page content, not notices.
      if (site.id === 'aistudio' && path !== undefined && visibilityFeatures.has(setting) &&
          /\/(?:docs|api-keys|apikey)(?:\/|$)/.test(path)) return false;
      if (context.capabilities?.[setting] === false) return false;
      return true;
    },
    readTheme() {
      const root = document.documentElement;
      const mode = root.getAttribute('data-mode') || root.getAttribute('data-theme') || root.getAttribute('data-appearance-theme');
      if (mode === 'light' || mode === 'dark') return mode;
      for (const node of [root, document.body]) {
        if (node?.matches('.dark, .dark-mode, .dark-theme')) return 'dark';
        if (node?.matches('.light, .light-mode, .light-theme')) return 'light';
      }
      return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    },
  };
  A.site = A.sites.fromUrl(location.href);
  A.isActive = () => A.isEnabled?.() && !!A.site?.isSupportedRoute(location.pathname);
})();
