// Reversible removal of native AI accuracy and generated-content disclaimers.
(() => {
  'use strict';
  const A = window.AuroraExt;
  const attribute = 'data-aurora-ai-warning';
  const tagged = `[${attribute}]`;
  const native = {
    chatgpt: '#thread-bottom-disclaimer, [data-testid="chat-disclaimer"], [data-testid="composer-disclaimer"]',
    claude: '[data-testid="chat-disclaimer"], [data-testid="composer-disclaimer"], [data-cds="ChatDisclaimer"]',
    gemini: 'hallucination-disclaimer, .hallucination-disclaimer, [data-test-id="hallucination-disclaimer"]',
    grok: '[data-testid="chat-disclaimer"], [data-testid="ai-disclaimer"]',
    qwen: '.message-input-container .disclaimer, .chat-disclaimer, .message-input-disclaimer',
    aistudio: 'ms-hallucinations-disclaimer, .chat-hallucinations-disclaimer',
    deepseek: '#root ._0fcaa63, [data-testid="content-caveat"], [data-testid="risk-tip"]',
    huggingface: '[data-testid="chat-disclaimer"], [data-testid="ai-disclaimer"]',
  }[A.site.id];
  const identified = [native,
    '[data-testid="ai-warning"], [data-test-id="ai-disclaimer"], [data-testid="hallucination-disclaimer"]',
  ].filter(Boolean).join(',');
  const hints = '[class*="disclaimer" i], [class*="caveat" i], [class*="risk-tip" i], [class*="risk_tip" i], [class*="ai-warning" i], [class*="ai-generated" i], [data-testid*="disclaimer" i], [data-test-id*="disclaimer" i], [data-testid*="ai-generated" i]';
  const protectedContent = [A.ownedUI,
    'script, style, noscript, template, svg, pre, code, textarea, input, [contenteditable], [role="textbox"]',
    '[data-message-author-role], [data-message-id], [data-testid="user-message"], [data-testid="assistant-message"], [data-testid^="conversation-turn"], .prose, .markdown, .markdown-body, .md-render, .ds-markdown, .qwen-chat-message, .message-bubble, model-response, user-query, ms-chat-turn',
    A.site.workflow?.userMessage, A.site.selectors?.history, A.site.selectors?.noticeContent,
  ].filter(Boolean).join(',');
  const editable = 'script, style, noscript, template, pre, code, textarea, input, [contenteditable], [role="textbox"]';
  const shells = ['html, body, main, nav, form, [role="main"], [role="navigation"]', A.site.appRoot].filter(Boolean).join(',');
  const normalize = text => String(text || '').normalize('NFKC').replace(/[\u200b-\u200d\ufeff]/g, '').replace(/\s+/g, ' ').trim();
  // Wording is shared across providers. Native named components handle localized
  // versions while these patterns catch newly mounted or renamed disclaimer UI.
  const copy = [
    /\b(?:AI|ChatGPT|Claude|Gemini|Grok|Qwen|DeepSeek|Hugging\s?Chat|Gemma|Bard|(?:this|the)\s+(?:model|chatbot|assistant|response|content)|(?:AI[- ]generated\s+)?(?:responses?|content|answers?))\b[\s\S]{0,45}(?:(?:can|may|might|could)\s+(?:sometimes\s+)?(?:make\s+(?:mistakes|errors)|(?:contain|include|produce|generate|provide|give)\s+(?:\w+\s+){0,3}(?:mistakes|errors|inaccuracies|inaccurate|incorrect|misleading)|be\s+(?:\w+\s+){0,2}(?:wrong|inaccurate|incorrect|unreliable)|not\s+be\s+(?:accurate|correct|reliable))|(?:isn't|is not|isn’t)\s+(?:always\s+)?(?:accurate|correct|right|reliable))/i,
    /(?:AI[- ]generated|generated\s+(?:by|using|with)\s+(?:AI|artificial\s+intelligence))[\s\S]{0,200}(?:reference\s+only|(?:informational|illustrative)\s+purposes|mistakes|errors|verify|check|accurac|accurat|incorrect|not\s+reflective)/i,
    /^(?:(?:this|the|all)\s+)?(?:(?:responses?|content|answers?|text|images?|videos?)\s+(?:(?:is|are|was|were)\s+)?)?(?:AI[- ]generated|generated\s+(?:by|using|with)\s+AI)(?:\s+(?:content|images?|videos?))?[.!]*$/i,
    /(?:AI|ChatGPT|Claude|Gemini|Grok|Qwen|DeepSeek)[\s\S]{0,40}(?:puede\s+(?:cometer\s+errores|equivocarse)|peut\s+(?:faire|commettre)\s+des\s+erreurs|может\s+(?:ошибаться|допускать\s+ошибки)|可能[\s\S]{0,10}(?:错误|錯誤|出错|出錯))/i,
    /(?:内容|內容|回答)[\s\S]{0,25}(?:AI|人工智能|人工智慧)[\s\S]{0,25}(?:生成|产生|產生)|(?:生成|产生|產生)[\s\S]{0,20}(?:仅供参考|僅供參考)/i,
    /(?:généré|générée|generado|generada|generato)[\s\S]{0,20}(?:IA|AI)[\s\S]{0,70}(?:erreurs|errores|vérifi|verifica|accuratezza|inesattezze)/i,
    /(?:ИИ|искусственн[\s\S]{0,15}интеллект)[\s\S]{0,70}(?:ошиб|неточ|справоч)/i,
    /(?:AI|ChatGPT|Claude|Gemini|Grok|Qwen|DeepSeek)[\s\S]{0,30}(?:kann\s+Fehler\s+machen|può\s+commettere\s+errori|pode\s+cometer\s+erros|間違|誤り|실수)/i,
    /\bAI\b[\s\S]{0,120}(?:known\s+(?:problems|limitations)|biased\s+generation|misinformation)/i,
  ];
  const matchesCopy = node => {
    const text = normalize(node.textContent);
    return text.length > 0 && text.length <= 650 && copy.some(pattern => pattern.test(text));
  };
  const blocked = node => !node || !!node.closest(protectedContent);
  const safeNamed = node => !node.closest(A.ownedUI) && !node.closest(editable) && !node.querySelector(editable) && !node.matches(shells);

  function owner(node) {
    if (!A.getSettings().hideAIWarnings || !node?.closest) return null;
    const named = node.closest(`${identified}, ${hints}, ${tagged}`);
    if (named && safeNamed(named)) return named;
    if (blocked(node)) return null;
    let result = null;
    for (let current = node, depth = 0; current && depth < 6; current = current.parentElement, depth++) {
      if (blocked(current) || current.matches(shells) || current.childElementCount > 12 ||
          current.querySelector('textarea, input, [contenteditable], pre, code, button, [role="button"]')) break;
      if (matchesCopy(current)) { result = current; break; }
    }
    if (!result) return node.closest(tagged);
    // Collapse same-text wrappers so the disclaimer's native padding goes away.
    for (let parent = result.parentElement, depth = 0; parent && depth < 4; parent = result.parentElement, depth++) {
      if (blocked(parent) || parent.matches(shells) || parent.childElementCount !== 1 ||
          normalize(parent.textContent) !== normalize(result.textContent) ||
          parent.querySelector('button, input, textarea, [contenteditable]')) break;
      result = parent;
    }
    return result;
  }

  function tagElements(root = document, scanText = true) {
    if (!A.isActive() || !A.getSettings().hideAIWarnings) return;
    const candidates = new Set(A.utils.matchingElements(root, `${identified}, ${hints}, ${tagged}`));
    // A text replacement can change a warning above the changed branch.
    const nearest = root.closest?.(`${identified}, ${hints}, ${tagged}`);
    if (nearest) candidates.add(nearest);
    const changed = owner(root.nodeType === 3 ? root.parentElement : root);
    if (changed) candidates.add(changed);
    for (const parent of scanText ? A.utils.textParentsOutside(root, protectedContent) : []) {
      const warning = owner(parent);
      if (warning) candidates.add(warning);
    }
    for (const node of candidates) {
      const known = node.matches(identified);
      // Named warning components can sit alongside an answer inside a turn.
      // Ordinary answer text remains protected by the text-discovery boundary.
      const warning = safeNamed(node) && (known || ((!blocked(node) || node.matches(hints)) && matchesCopy(node)));
      A.utils.toggleAttribute(node, attribute, warning);
    }
  }

  function untag() {
    document.querySelectorAll(tagged).forEach(node => node.removeAttribute(attribute));
  }
  function apply() {
    if (A.isActive() && A.getSettings().hideAIWarnings) tagElements();
    else untag();
  }
  A.aiWarnings = { tagElements, changedOwner: owner, apply, untag };
})();
