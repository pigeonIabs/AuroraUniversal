// Reversible ChatGPT ad and advertiser-promotion blocking.
(() => {
  'use strict';
  const A = window.AuroraExt;
  if (A.site.id !== 'chatgpt') return;

  const attribute = 'data-aurora-ad';
  const tagged = `[${attribute}]`;
  // Native placement markers, including streamed and mobile supplements.
  // Reference https://github.com/uBlockOrigin/uAssets/issues/32224 and
  // https://github.com/easylist/easylist/blob/master/easylist/easylist_specific_hide.txt
  const placements = [
    '[data-assistant-ads]', '[data-assistant-ads-unit]', '[data-ad-card-root]',
    '[data-partial-island="assistant-ads"]', '[data-conversation-control="assistant-ads"]',
    '[class*="_assistantAds"]',
    '[data-testid="bazaar-v2-elevated-box"]', '[data-testid="bazaar-single-card-container"]',
    'div[data-message-supplement]:has(aside[data-partial-island="assistant-ads"])',
    '.border-token-border-default.mt-2.border-t:has(button[aria-label="Ad options"])',
    'div.opacity-100.transition-opacity.ease-out:has(button[aria-label="Sponsored options"], button[aria-label="Ad options"])',
    'section:has(> [aria-label="Sponsored"])',
    '[data-message-role="assistant"] > section[class]:has(> [aria-label] > div[role="list"] a[rel][target="_blank"][href*="&oppref="])',
    'div[role="complementary"]:has(a[href*="oppref="])',
    'aside[aria-label="Advertisement" i]', 'aside[aria-label="Sponsored" i]',
  ].join(',');
  const notices = '[role="alert"], [role="status"], [role="dialog"], [data-testid*="banner" i], [class*="banner" i], [class*="callout" i]';
  const protectedBody = [
    A.ownedUI, 'pre, code, textarea, input, [contenteditable]',
    '.markdown, .prose, .markdown-body, [data-message-author-role="user"], [data-testid="user-message"]',
    '[data-aurora-history], #history', A.site.selectors?.history,
  ].filter(Boolean).join(',');
  const messages = '[data-message-author-role], [data-message-role], [data-message-id], [data-testid^="conversation-turn-"], [data-testid="assistant-message"], article[data-turn]';
  const protectedText = `${protectedBody}, ${messages}`;
  const shells = 'html, body, main, nav, form, #root, #__next, #thread, [role="main"], [role="navigation"], [data-pip-obstacle="thread-footer"]';
  const unsafeChildren = `${protectedBody}, ${messages}, form, [role="tablist"]`;
  const normalize = text => String(text || '').replace(/\s+/g, ' ').trim();
  const salesCopy = /(?:\b(?:new\s+to|try|introducing|explore|get\s+started\s+with)\s+chatgpt\s+ads\b|\badvertis(?:e|ing)\s+(?:on|in|with)\s+chatgpt\b|\b(?:create|launch|run|buy|start)\b.{0,100}\b(?:ads?\b|ad\s+campaign)\b.{0,100}\bchatgpt\b|\bchatgpt\s+ads\b.{0,180}(?:\b(?:create|launch|start|campaign|advertis)|\$\s*\d)|\b(?:anunciarse|publicitar)\s+en\s+chatgpt\b|\bpublicit[ée]\s+sur\s+chatgpt\b|\bреклам\S*\s+в\s+chatgpt\b|在\s*chatgpt\s*(?:投放|刊登)\s*广告)/i;
  const adAction = /\b(?:create|launch|run|buy|start|get\s+started|advertis(?:e|ing))\b/i;
  const blockedText = node => !node?.closest || !!node.closest(protectedText);
  const safe = node => node?.nodeType === 1 && !node.matches(shells) &&
    !node.closest(protectedBody) && !node.querySelector(unsafeChildren);

  function advertiserLink(node) {
    if (!node?.matches('a[href]')) return false;
    try {
      const url = new URL(node.getAttribute('href'), location.href);
      return url.protocol === 'https:' && (url.hostname === 'ads.openai.com' ||
        (url.hostname === 'chatgpt.com' && /^\/(?:ads|advertise)(?:\/|$)/.test(url.pathname)));
    } catch { return false; }
  }

  function promotion(node) {
    if (!safe(node) || blockedText(node)) return false;
    const text = normalize(node.textContent);
    if (!text || text.length > 1600) return false;
    if (salesCopy.test(text)) return true;
    const links = node.matches('a[href]') ? [node] : node.querySelectorAll('a[href]');
    return [...links].some(advertiserLink) && (adAction.test(text) || /\bchatgpt\s+ads\b/i.test(text));
  }

  function promotionOwner(node) {
    if (blockedText(node)) return null;
    let result = null;
    for (let current = node, depth = 0; current && depth < 6; current = current.parentElement, depth++) {
      if (!safe(current) || blockedText(current)) break;
      if (promotion(current)) {
        result = current;
        // Prefer the site's entire banner to its title or CTA.
        if (current.matches(notices)) break;
      } else if (result && normalize(current.textContent) !== normalize(result.textContent)) break;
    }
    return result;
  }

  function changedOwner(node) {
    if (!A.isActive() || !A.getSettings().blockAds || !node?.closest) return null;
    // Protected answer/editor text cannot own an ad. Structural placement
    // discovery still handles supplements mounted alongside that content.
    if (node.closest(protectedBody)) return null;
    const named = node.closest(`${placements}, ${tagged}`);
    if (named && safe(named)) return named;
    return promotionOwner(node);
  }

  function tagElements(root = document, scanText = true) {
    if (!A.isActive() || !A.getSettings().blockAds) return;
    const candidates = new Set(A.utils.matchingElements(root, `${placements}, ${tagged}`));
    const named = root.closest?.(`${placements}, ${tagged}`);
    if (named) candidates.add(named);
    // A newly inserted descendant can complete a placement's :has selector.
    for (let parent = root.parentElement, depth = 0; parent && depth < 6; parent = parent.parentElement, depth++) {
      if (parent.matches(shells)) break;
      if (parent.matches(placements) || parent.matches(tagged)) candidates.add(parent);
    }
    const nearest = promotionOwner(root.nodeType === 3 ? root.parentElement : root);
    if (nearest) candidates.add(nearest);
    for (const parent of scanText ? A.utils.textParentsOutside(root, `${protectedText}, script, style, template`) : []) {
      const owner = promotionOwner(parent);
      if (owner) candidates.add(owner);
    }
    for (const node of candidates) {
      A.utils.toggleAttribute(node, attribute, safe(node) && (node.matches(placements) || promotion(node)));
    }
  }

  function untag() {
    document.querySelectorAll(tagged).forEach(node => node.removeAttribute(attribute));
  }
  function apply() {
    if (A.isActive() && A.getSettings().blockAds) tagElements();
    else untag();
  }
  A.ads = { tagElements, changedOwner, apply, untag };
})();
