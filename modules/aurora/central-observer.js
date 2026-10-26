// modules/aurora/central-observer.js
// Centralized DOM Event Bus to prevent observer multiplication overhead.
(() => {
  'use strict';

  // Ensure namespace exists early
  const A = (window.AuroraExt = window.AuroraExt || {});
  const ownUI = A.ownedUI;

  class AuroraCentralObserver {
    constructor() {
      this.callbacks = new Set();
      this.attributeScopes = new Map();
      this.observer = new MutationObserver(this.handleMutations.bind(this));
      this.running = false;
    }

    subscribe(fn) {
      this.callbacks.add(fn);
      return () => this.unsubscribe(fn);
    }

    unsubscribe(fn) {
      this.callbacks.delete(fn);
    }

    // Await host state through the existing event bus. The timeout bounds the
    // operation, while cancellation immediately releases its subscription.
    waitFor(getter, { timeout = 1200, signal, valid = () => true } = {}) {
      return new Promise(resolve => {
        let timer;
        const finish = value => {
          clearTimeout(timer);
          this.unsubscribe(probe);
          signal?.removeEventListener('abort', abort);
          resolve(value);
        };
        const abort = () => finish(null);
        const probe = () => {
          if (signal?.aborted || !valid()) { finish(null); return; }
          const value = getter();
          if (value) finish(value);
        };
        this.subscribe(probe);
        signal?.addEventListener('abort', abort, { once: true });
        timer = setTimeout(abort, timeout);
        probe();
      });
    }

    observeTargets() {
      this.observer.observe(document.documentElement, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['data-state', 'contenteditable', 'hidden', 'aria-hidden', 'disabled', 'aria-disabled', 'aria-busy', 'aria-expanded', 'aria-checked', 'aria-valuenow', 'data-selected-reasoning-effort', 'aria-label', 'title', ...(A.site?.id === 'chatgpt' ? ['href', 'data-testid', 'data-assistant-ads', 'data-assistant-ads-unit', 'data-ad-card-root', 'data-partial-island', 'data-conversation-control'] : [])] });
      for (const { target, attributes } of this.attributeScopes.values()) {
        if (target.isConnected) this.observer.observe(target, { attributes: true, subtree: true, attributeFilter: attributes });
      }
    }

    setAttributeScope(name, target, attributes = [], filter = null) {
      const previous = this.attributeScopes.get(name);
      if (previous?.target === target || (!previous && !target)) return;
      if (target) this.attributeScopes.set(name, { target, attributes, filter });
      else this.attributeScopes.delete(name);
      if (!this.running) return;
      const pending = this.observer.takeRecords();
      this.observer.disconnect();
      this.observeTargets();
      if (pending.length) this.handleMutations(pending);
    }

    start() {
      if (!this.running) {
        const target = document.documentElement;
        if (target) {
            this.running = true;
            this.observeTargets();
        }
      }
    }

    stop() {
      if (this.running) {
        this.observer.disconnect();
        this.running = false;
      }
    }

    handleMutations(mutations) {
      if (this.callbacks.size === 0) return;

      const relevant = [];
      const addedElements = new Set();
      const addedTexts = new Set();
      const textParents = new Set();
      const ownership = new Map();
      const states = new Map();
      let structuralChange = false;

      for (const m of mutations) {
        const target = m.target.nodeType === 1 ? m.target : m.target.parentElement;
        if (!target) continue;
        if (!ownership.has(target)) ownership.set(target, !!target.closest(ownUI));
        if (ownership.get(target)) continue;
        if (m.type === 'childList') {
          const children = [...m.addedNodes, ...m.removedNodes];
          // Ignore our UI writes, but let the orchestrator restore a background
          // root removed by host hydration before the document is ready.
          const lostBackground = [...m.removedNodes].some(node => node.id === A.config.ID) &&
            !document.getElementById(A.config.ID) && A.isActive();
          if (!lostBackground && children.length && children.every(node => node.nodeType === 1 &&
              (node.matches(ownUI) || node.closest(ownUI)))) continue;
        }
        if (m.type === 'attributes' && (m.attributeName === 'class' || m.attributeName === 'style')) {
          let relevantScope = false;
          for (const scope of this.attributeScopes.values()) {
            if (scope.target.contains(target) && scope.attributes.includes(m.attributeName) && (!scope.filter || scope.filter(target))) {
              relevantScope = true;
              break;
            }
          }
          if (!relevantScope) continue;
        }
        // Subscribers read the final DOM state. Repeated writes to one text
        // node or attribute in a host commit need one notification each.
        if (m.type !== 'childList') {
          const key = m.type === 'attributes' ? m.attributeName : '#text';
          let seen = states.get(m.target);
          if (!seen) states.set(m.target, seen = new Set());
          if (seen.has(key)) continue;
          seen.add(key);
        }
        relevant.push(m);
        if (m.type === 'characterData') {
          textParents.add(target);
          if (m.target.nodeValue?.trim()) addedTexts.add(m.target);
        } else if (m.type === 'attributes' || [...m.addedNodes, ...m.removedNodes].some(node => node.nodeType === 1)) {
          structuralChange = true;
        }
        if (m.type === 'childList' && m.removedNodes.length) textParents.add(target);
        // State changes are delivered in mutations. They are not new branches
        // and must not make subscribers walk an existing conversation again.
        for (const n of m.addedNodes) {
          if (n.nodeType === 1 && !n.matches(ownUI)) addedElements.add(n);
          else if (n.nodeType === 3 && n.nodeValue?.trim()) {
            addedTexts.add(n);
            if (n.parentElement) textParents.add(n.parentElement);
          }
        }
      }

      // Real removals still matter, but extension UI updates must never pulse themselves.
      if (!relevant.length) return;
      const event = { mutations: relevant, addedElements: A.utils.minimalRoots(addedElements),
        addedTexts: [...addedTexts], textParents, structuralChange };
      this.callbacks.forEach(cb => {
        try {
          cb(event);
        } catch (e) {
          // ignore
        }
      });
    }
  }

  A.centralObserver ||= new AuroraCentralObserver();

  // The orchestrator starts observation at document_start and owns shutdown.
})();
