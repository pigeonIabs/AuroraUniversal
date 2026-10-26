// Shared, reversible hiding of native promotions and usage notices.
(() => {
  'use strict';
  const A = window.AuroraExt;
  const selectors = A.site.selectors || {};
  const controls = 'button, a, [role="button"], [role="link"], [role="menuitem"]';
  const content = [
    'pre, code, textarea, input, [contenteditable], [data-message-author-role], [data-message-id], [data-testid="user-message"], [data-testid="assistant-message"], [data-testid^="conversation-turn-"], .message-bubble, .prose, .markdown, .markdown-body, .md-render, .ds-markdown, .qwen-chat-message, model-response, user-query, ms-chat-turn',
    A.site.workflow?.userMessage,
    selectors.history, selectors.noticeContent, '[data-aurora-history]',
  ].filter(Boolean).join(',');
  const pageShells = ['html, body, main, [role="main"], [role="navigation"]',
    A.site.appRoot, selectors.plane, selectors.sidebar, selectors.content,
  ].filter(Boolean).join(',');
  const explicitUpgrade = [selectors.upgrade, selectors.upgradeContainer,
    '[data-testid="upgrade-button"], [data-test-id="upgrade-button"], [data-testid="upsell-button"], [data-test-id="upsell-button"], [data-testid="upgrade-banner"], [data-testid="upsell-banner"]',
  ].filter(Boolean).join(',');
  const explicitRate = [selectors.rateLimit,
    '[data-testid="rate-limit"], [data-testid="rate-limit-message"], [data-testid="rate-limit-banner"], [data-testid="usage-limit"], [data-testid="usage-limit-banner"], [data-test-id="rate-limit-banner"], [data-test-id="usage-limit-banner"]',
  ].filter(Boolean).join(',');
  const notices = [selectors.notice,
    '[role="alert"], [role="status"], [data-sonner-toast], [data-radix-toast-root], [data-testid="toast"], [data-test-id="toast"], [data-testid="banner"], [data-test-id="banner"], [class*="banner" i], [class*="callout" i], [class*="notice" i], [class*="rate-limit"], [class*="quota-exceeded"], [class*="usage-limit"]',
  ].filter(Boolean).join(',');
  const tagged = '[data-aurora-upgrade], [data-aurora-rate-limit]';
  const leafNotice = ':is(p,span,div):not(:has(p,span,div,textarea,input,[contenteditable],pre,code))';
  const candidatesSelector = [controls, explicitUpgrade, explicitRate, notices, leafNotice, tagged, '[role="dialog"]'].join(',');
  const ownerSelector = [controls, explicitUpgrade, explicitRate, notices, tagged].join(',');
  const noticeSelector = [notices, explicitUpgrade, explicitRate, tagged].join(',');
  const boundary = `${A.ownedUI}, ${content}`;
  const upgradeAction = /^(?:upgrade\b|(?:get|try|unlock|subscribe(?:\s+to)?|switch\s+to)\s+(?:a\s+paid\s+plan|pro\b|max\b|plus\b|premium\b|super\s?grok\b|chatgpt\s+(?:plus|pro|go|business)|claude\s+(?:pro|max)|gemini\s+advanced|google\s+(?:ai|one)\b|hugging\s?face\s+pro)|super\s?grok(?:\s+heavy)?\s*$|(?:view|compare|explore)\s+(?:plans|subscriptions)|mejorar(?:\s+plan)?\b|actualizar\s+(?:el\s+)?plan\b|pasar\s+a\s+(?:pro|plus)|(?:mettre\s+à\s+niveau|passer\s+à\s+(?:pro|plus)|améliorer\s+(?:le\s+)?forfait)|(?:улучшить|обновить|повысить)\s+(?:план|тариф)|(?:升级|升級|订阅|訂閱))/i;
  const upgradeCopy = /(?:upgrade\s+(?:your\s+)?(?:plan|to|for)|unlock\s+(?:more|higher|premium)|(?:get|try)\s+(?:super\s?grok|claude\s+(?:pro|max)|chatgpt\s+(?:plus|pro|go)|google\s+ai\s+(?:pro|ultra))|(?:passer\s+à|mejorar\s+(?:tu\s+)?plan|повысить\s+тариф|升级|升級))/i;
  const limitCopy = /(?:rate[ -]?limit(?:ed|ing)?|too\s+many\s+(?:requests|messages)|(?:usage|message|daily|weekly|monthly|free|token|generation|request|model)\s+(?:\w+\s+){0,2}limit\s+(?:reached|exceeded)|(?:reached|hit|exceeded)\s+(?:your\s+|the\s+|a\s+)?(?:\w+\s+){0,3}(?:limit|quota)|(?:out\s+of|run\s+out\s+of|used\s+(?:up\s+)?all)\s+(?:your\s+)?(?:free\s+)?(?:messages|requests|generations|credits)|quota\s+(?:exceeded|exhausted)|\d+\s+(?:messages|requests|generations)\s+(?:left|remaining)|(?:límite|limite)\s+(?:de\s+\w+\s+)?(?:alcanzado|excedido|atteinte?|dépassée?)|(?:лимит|квота).{0,35}(?:достигнут|исчерпан|превышен)|(?:已达|超出|超过|超過|达到上限|使用上限|请求过于频繁|請求過於頻繁|额度已用完|額度已用完|配额已用完))/i;
  const normalize = text => String(text || '').replace(/\s+/g, ' ').trim();
  const labels = node => [node.getAttribute('aria-label'), node.getAttribute('title'), node.textContent].map(normalize);
  const excluded = node => !node || !!node.closest(A.ownedUI) || !!node.closest(content);
  const enabled = () => ['hideUpgradeButtons', 'hideRateLimitMessages'].some(key =>
    A.getSettings()[key] && A.sites.supports(A.site, key));

  function changedOwner(node) {
    if (!enabled() || !node?.closest || excluded(node)) return null;
    return node.closest(ownerSelector) || node.closest(leafNotice);
  }

  function classify(node) {
    // A wrapper can contain "Rate limits" navigation or upgrade documentation.
    // Its aggregated text never makes the application itself a usage notice.
    if (excluded(node) || node.matches(pageShells)) return { upgrade: false, rate: false };
    const text = normalize(node.textContent);
    const short = text.length > 0 && text.length < 900;
    const notice = node.matches(notices);
    const leaf = node.matches(leafNotice);
    const rate = node.matches(explicitRate) || ((notice || leaf || node.matches(controls)) && short && labels(node).some(label => limitCopy.test(label)));
    const upgrade = node.matches(explicitUpgrade) ||
      (node.matches(controls) && labels(node).some(label => label.length < 200 && upgradeAction.test(label))) ||
      ((notice || leaf) && short && upgradeCopy.test(text));
    return { upgrade, rate };
  }

  function tagElements(root = document) {
    if (!A.isActive() || !enabled() || (root.nodeType === 1 && excluded(root))) return new Set();
    const candidates = new Set(A.utils.matchingElementsOutside(root, candidatesSelector, boundary));
    const owner = changedOwner(root);
    if (owner) candidates.add(owner);
    for (let parent = root.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
      if (excluded(parent)) break;
      if (parent.matches(noticeSelector)) candidates.add(parent);
    }
    for (const node of candidates) {
      const { upgrade, rate } = classify(node);
      A.utils.toggleAttribute(node, 'data-aurora-upgrade', upgrade);
      A.utils.toggleAttribute(node, 'data-aurora-rate-limit', rate);
      if (A.site.id === 'chatgpt') A.utils.toggleClass(node, 'cgpt-hide-upgrade', upgrade && !!A.getSettings().hideUpgradeButtons);
      if (node.matches('[role="dialog"]') && A.getSettings().hideUpgradeButtons && A.sites.supports(A.site, 'hideUpgradeButtons')) {
        const text = normalize(node.textContent);
        const promotion = text.length < 1600 && upgradeCopy.test(text) &&
          !node.querySelector('input, textarea, [contenteditable], [role="tablist"]') &&
          [...node.querySelectorAll(controls)].some(control => classify(control).upgrade);
        const close = promotion && [...node.querySelectorAll('button, [role="button"]')].find(button =>
          labels(button).some(label => /^(?:close|dismiss|not now|maybe later|fermer|cerrar|закрыть|关闭|關閉)(?:\s.*)?$/i.test(label)));
        if (close && A.dom.isVisible(close)) close.click();
      }
    }
    return candidates;
  }

  function applyUpgradeButtons() {
    const root = document.documentElement;
    const active = A.isActive();
    for (const [setting, className] of [['hideUpgradeButtons', 'cgpt-hide-upgrade'], ['hideRateLimitMessages', 'cgpt-hide-rate-limits']]) {
      A.utils.toggleClass(root, className, active && A.sites.supports(A.site, setting) && !!A.getSettings()[setting]);
    }
    if (active && enabled()) tagElements();
    else untag();
  }

  function untag() {
    document.querySelectorAll(tagged).forEach(node => {
      node.removeAttribute('data-aurora-upgrade');
      node.removeAttribute('data-aurora-rate-limit');
      node.classList.remove('cgpt-hide-upgrade');
    });
  }
  A.upgrade = { applyUpgradeButtons, tagElements, changedOwner, untag };
})();
