// Shared selectors and input helpers for the current ChatGPT and Codex composers.
(() => {
  'use strict';

  const A = (window.AuroraExt = window.AuroraExt || {});
  if (A.dom) return;

  const selectors = Object.freeze({
    appRoot: '#root',
    sidebar: '#app-shell-sidebar',
    composerForm: 'form[data-chatgpt-composer]',
    composerEditor: 'form[data-chatgpt-composer] [contenteditable="true"][data-composer-markdown]',
    codexComposerEditor: '#prompt-textarea[contenteditable="true"]',
    modelSwitcher: 'button[data-codex-intelligence-trigger="true"]',
    legacyModelSwitcher: '[data-testid="model-switcher-dropdown-button"]',
  });

  // Visibility probes often share the same ancestor chain. Cache reads only
  // inside an explicit synchronous read transaction, never across host edits.
  let reads = null;
  function readScope(read) {
    if (reads) return read();
    reads = { styles: new Map(), visible: new Map() };
    try { return read(); }
    finally { reads = null; }
  }
  function styleOf(node) {
    if (!reads) return window.getComputedStyle(node);
    if (!reads.styles.has(node)) reads.styles.set(node, window.getComputedStyle(node));
    return reads.styles.get(node);
  }

  function isVisible(element) {
    if (!element || !element.isConnected || element.hidden) return false;
    if (reads?.visible.has(element)) return reads.visible.get(element);
    const visible = measureVisibility(element);
    reads?.visible.set(element, visible);
    return visible;
  }

  function measureVisibility(element) {
    const rect = element.getBoundingClientRect?.();
    if (!rect || rect.width < 1 || rect.height < 1) return false;

    for (let node = element; node && node.nodeType === Node.ELEMENT_NODE; node = node.parentElement) {
      if (node.hidden || node.inert || node.getAttribute('aria-hidden') === 'true') return false;
      const style = styleOf(node);
      if (style.display === 'none' || style.visibility === 'hidden' || style.contentVisibility === 'hidden') {
        return false;
      }
    }

    return true;
  }

  function firstVisible(selector, root = document) {
    if (!selector || !root?.querySelectorAll) return null;
    for (const element of root.querySelectorAll(selector)) {
      if (isVisible(element)) return element;
    }
    return null;
  }

  function findActiveComposer() {
    if (A.site?.workflow) {
      for (const editor of document.querySelectorAll(A.site.workflow.editor)) {
        if (editor.closest('#cgpt-qs-panel, #aurora-queue-panel, [role="dialog"]')) continue;
        if (isVisible(editor) && editor.closest(A.site.workflow.composer)) return editor;
      }
      return null;
    }
    const candidates = [
      selectors.composerEditor,
      selectors.codexComposerEditor,
      '[contenteditable="true"][data-composer-markdown]',
      'form[data-chatgpt-composer] textarea',
      'textarea#prompt-textarea',
      'textarea#mobile-composer-prompt',
      'textarea[id*="prompt"]',
      'textarea[placeholder*="Message" i]',
      'textarea[placeholder*="Send" i]',
    ];

    for (const selector of candidates) {
      const match = firstVisible(selector);
      if (match) return match;
    }
    return null;
  }

  function findModelSwitcher() {
    if (A.site?.workflow?.modelTrigger) return firstVisible(A.site.workflow.modelTrigger);
    return firstVisible(selectors.modelSwitcher) || firstVisible(selectors.legacyModelSwitcher);
  }

  function getComposerForm(composer) {
    if (A.site?.workflow) return composer?.closest?.(A.site.workflow.composer) || null;
    return composer?.closest?.(selectors.composerForm) || composer?.closest?.('form') || null;
  }

  function getComposerText(composer) {
    if (!composer) return '';
    if (composer.tagName === 'TEXTAREA' || composer.tagName === 'INPUT') return composer.value || '';
    return composer.innerText || composer.textContent || '';
  }

  function findComposerButton(composer, kind) {
    const form = getComposerForm(composer);
    if (!form) return null;
    if (A.site?.workflow) {
      const scope = A.site.workflow.buttonScope ? composer.closest(A.site.workflow.buttonScope) : form;
      return A.site.workflow.findButton?.(composer, kind, firstVisible) || firstVisible(A.site.workflow[kind], scope || form);
    }
    const selector = kind === 'stop'
      ? 'button[data-testid="stop-button"],button[data-testid*="stop-generating"],button[aria-label="Stop generating"],button[aria-label="Stop streaming"],button[aria-label="Stop response"],button[aria-label="Stop"]'
      : 'button[data-testid="send-button"],button[type="submit"],button[aria-label="Send message"],button[aria-label="Send prompt"],button[aria-label="Send"]';
    return firstVisible(selector, form);
  }

  function dispatchInput(composer, inputType, data) {
    let event;
    try {
      event = new InputEvent('input', { bubbles: true, inputType, data });
    } catch (e) {
      event = new Event('input', { bubbles: true });
    }
    composer.dispatchEvent(event);
  }

  function setComposerText(composer, value) {
    if (!composer) return false;
    const text = value == null ? '' : String(value);

    if (composer.tagName === 'TEXTAREA' || composer.tagName === 'INPUT') {
      const prototype = composer.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
      if (setter) setter.call(composer, text);
      else composer.value = text;
      dispatchInput(composer, text ? 'insertText' : 'deleteContentBackward', text || null);
      return composer.value === text;
    }

    try {
      composer.focus();
      const selection = window.getSelection?.();
      if (selection) {
        const range = document.createRange();
        range.selectNodeContents(composer);
        selection.removeAllRanges();
        selection.addRange(range);
      }

      const command = text ? 'insertText' : 'delete';
      const inserted = document.execCommand?.(command, false, text || null);
      if (!inserted) return false;
    } catch (e) {
      return false;
    }
    return getComposerText(composer).trim() === text.trim();
  }

  A.dom = Object.freeze({
    selectors,
    readScope,
    isVisible,
    firstVisible,
    findActiveComposer,
    findModelSwitcher,
    getComposerForm,
    getComposerText,
    findComposerButton,
    setComposerText,
    isGenerating: (composer = findActiveComposer()) => !!findComposerButton(composer, 'stop'),
    conversationKey: () => `${location.origin}${location.pathname.replace(/\/+$/, '') || '/'}`,
    conversationIdentity: () => document.querySelector(A.site?.workflow?.userMessage || '[data-user-message-bubble], [data-message-author-role="user"]'),
    userMessageCount: () => document.querySelectorAll(A.site?.workflow?.userMessage || '[data-user-message-bubble], [data-message-author-role="user"]').length,
  });
})();
