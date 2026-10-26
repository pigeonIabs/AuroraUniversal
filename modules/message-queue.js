// modules/message-queue.js
// Queue messages while the model is generating, then auto-send them when it finishes.
(() => {
  'use strict';

  const dom = () => window.AuroraExt.dom;
  const ui = () => window.AuroraExt.utils;
  class AuroraComposerLocator {
    static findActive() { return dom().findActiveComposer(); }
    static getForm(composer) { return dom().getComposerForm(composer); }
    static getText(composer) { return dom().getComposerText(composer); }
    static setText(composer, value) { return dom().setComposerText(composer, value); }
  }

  class AuroraMessageQueueUI {
    constructor({ getMessage }) {
      this.getMessage = getMessage;
      this.toastTimer = null;
    }

    removeAll() {
      clearTimeout(this.toastTimer);
      document.getElementById('aurora-queue-btn')?.remove();
      document.getElementById('aurora-queue-panel')?.remove();
      document.getElementById('aurora-queue-toast')?.remove();
    }

    updateBadge(count) {
      const btn = document.getElementById('aurora-queue-btn');
      if (!btn) return;
      const badge = btn.querySelector('.aurora-queue-count');
      if (!badge) return;
      ui().setText(badge, count > 0 ? String(Math.min(count, 99)) : '');
      ui().setStyle(badge, 'display', count > 0 ? 'inline-flex' : 'none');
    }

    ensureButton({ anchor, count, onClick, visible }) {
      const BTN_ID = 'aurora-queue-btn';

      if (!visible) {
        document.getElementById(BTN_ID)?.remove();
        return;
      }

      if (!anchor || !anchor.parentElement) {
        document.getElementById(BTN_ID)?.remove();
        return;
      }

      let btn = document.getElementById(BTN_ID);
      if (!btn) {
        btn = document.createElement('button');
        btn.id = BTN_ID;
        btn.type = 'button';
        btn.className = 'aurora-queue-btn';
        const title = this.getMessage('queueButtonTitle');
        btn.title = title;
        btn.setAttribute('aria-label', title);
        btn.innerHTML = `
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path fill="currentColor" d="M12 8a1 1 0 0 1 1 1v3.59l2.3 2.3a1 1 0 1 1-1.42 1.42l-2.6-2.6A1 1 0 0 1 11 13V9a1 1 0 0 1 1-1Zm0-6a10 10 0 1 0 10 10A10.01 10.01 0 0 0 12 2Zm0 18a8 8 0 1 1 8-8a8.01 8.01 0 0 1-8 8Z"/>
          </svg>
          <span class="aurora-queue-count" aria-hidden="true"></span>
        `;
        btn.addEventListener('click', onClick);
      }

      // Keep it next to the current anchor (ChatGPT re-renders composer often).
      const mount = anchor.closest('gem-icon-button, gem-button') || anchor;
      if (btn.previousElementSibling !== mount) mount.parentElement.insertBefore(btn, mount.nextSibling);
      this.updateBadge(count);
    }

    ensurePanel({ composer, bounds, queue, pending, status, onRemove, onRetry }) {
      const PANEL_ID = 'aurora-queue-panel';
      const shouldShow = (queue.length > 0) || !!pending;
      if (!shouldShow || !document.body) {
        document.getElementById(PANEL_ID)?.remove();
        return;
      }

      let panel = document.getElementById(PANEL_ID);
      if (!panel) {
        panel = document.createElement('div');
        panel.id = PANEL_ID;
        panel.className = 'aurora-queue-panel';
        panel.setAttribute('data-aurora-glass', 'true');
        panel.innerHTML = `
          <div class="aurora-queue-panel-header">
            <div class="aurora-queue-panel-titles">
              <div class="aurora-queue-panel-title"></div>
              <div class="aurora-queue-panel-subtitle"></div>
            </div>
          </div>
          <ol class="aurora-queue-list" aria-label=""></ol>
        `;
        document.body.appendChild(panel);
      }

      // Position the panel just above the composer.
      try {
        const rect = bounds || composer.getBoundingClientRect();
        const maxW = Math.max(0, Math.round(window.innerWidth - 16));
        const width = Math.min(maxW, Math.max(240, Math.round(rect.width)));
        const rawLeft = Math.round(rect.left);
        const left = Math.max(8, Math.min(rawLeft, window.innerWidth - width - 8));
        const bottom = Math.max(8, Math.round(window.innerHeight - rect.top + 10));
        ui().setStyle(panel, 'left', `${left}px`);
        ui().setStyle(panel, 'width', `${width}px`);
        const above = rect.top >= 150;
        ui().setStyle(panel, 'bottom', above ? `${bottom}px` : 'auto');
        ui().setStyle(panel, 'top', above ? 'auto' : `${Math.max(8, Math.min(rect.bottom + 10, window.innerHeight - 150))}px`);
        ui().setStyle(panel, 'max-height', `${Math.max(100, Math.min(220, above ? rect.top - 20 : window.innerHeight - rect.bottom - 20))}px`);
      } catch (e) {
        // ignore
      }

      const title = panel.querySelector('.aurora-queue-panel-title');
      const subtitle = panel.querySelector('.aurora-queue-panel-subtitle');
      const list = panel.querySelector('.aurora-queue-list');
      if (!title || !subtitle || !list) return;

      ui().setText(title, `${this.getMessage('queuedPanelTitle')} (${queue.length})`);
      ui().setText(subtitle, status || '');
      ui().toggleAttribute(subtitle, 'hidden', !status);
      ui().setAttribute(list, 'aria-label', this.getMessage('queuedPanelTitle'));

      const settings = window.AuroraExt.getSettings();
      const signature = JSON.stringify([queue.map(item => [item.id, item.blocked]), pending?.phase, settings.dataMaskingEnabled, settings.maskingRandomMode]);
      if (list.dataset.signature === signature) return;
      list.dataset.signature = signature;
      list.replaceChildren();
      for (let i = 0; i < queue.length; i++) {
        const item = queue[i];

        const li = document.createElement('li');
        li.className = 'aurora-queue-item';

        const num = document.createElement('div');
        num.className = 'aurora-queue-item-num';
        num.textContent = String(i + 1);

        const main = document.createElement('div');
        main.className = 'aurora-queue-item-main';

        const text = document.createElement('div');
        text.className = 'aurora-queue-item-text';
        const preview = window.DataMaskingEngine?.preview(item.text) ?? item.text;
        const compact = (preview || '').replace(/\s+/g, ' ').trim();
        text.textContent = compact;
        text.title = preview || '';

        main.appendChild(text);
        if (item.blocked) {
          const retry = document.createElement('button');
          retry.type = 'button';
          retry.className = 'aurora-queue-retry';
          retry.textContent = this.getMessage('queueRetry');
          retry.addEventListener('click', () => onRetry(item));
          main.appendChild(retry);
        }

        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'aurora-queue-remove';
        remove.title = this.getMessage('queuedPanelRemove');
        remove.setAttribute('aria-label', this.getMessage('queuedPanelRemove'));
        remove.textContent = '×';
        remove.disabled = pending?.queuedItem === item && pending.phase === 'submitted';
        remove.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          onRemove(item);
        });

        li.appendChild(num);
        li.appendChild(main);
        li.appendChild(remove);
        list.appendChild(li);
      }
    }

    showToast(text) {
      if (!text || !document.body) return;
      const TOAST_ID = 'aurora-queue-toast';

      let toast = document.getElementById(TOAST_ID);
      if (!toast) {
        toast = document.createElement('div');
        toast.id = TOAST_ID;
        toast.className = 'aurora-queue-toast';
        toast.setAttribute('role', 'status');
        document.body.appendChild(toast);
      }
      toast.textContent = text;
      toast.classList.add('show');

      clearTimeout(this.toastTimer);
      this.toastTimer = setTimeout(() => {
        toast?.classList?.remove('show');
      }, 1400);
    }
  }

  class AuroraMessageQueueEngine {
    constructor({ getSettings, isExtensionEnabled, getMessage }) {
      Object.assign(this, { getSettings, isExtensionEnabled, getMessage });
      this.queue = [];
      this.pending = null;
      this.awaitingGeneration = null;
      this.nextId = 1;
      this.lastHref = dom().conversationKey();
      this.pulseTimeout = null;
      this.lastPulseAt = 0;
      this.ui = new AuroraMessageQueueUI({ getMessage });
      document.addEventListener('keydown', event => this.handleKeydown(event), true);
      document.addEventListener('input', event => {
        if (!this.hasWork()) return;
        const composer = AuroraComposerLocator.findActive();
        if (!composer || !composer.contains(event.target)) return;
        if (event.isTrusted && !this.editing && this.pending?.phase === 'prepared') {
          this.pending.queuedItem.blocked = true;
          this.pending = null;
        }
        if (this.hasWork()) this.schedulePulse();
      }, true);
      document.addEventListener('click', event => {
        if (!event.isTrusted || !this.hasWork()) return;
        const link = event.target.closest?.('a[href]');
        if (!link || event.ctrlKey || event.metaKey || event.shiftKey || link.target === '_blank') return;
        try {
          const next = new URL(link.href, location.href);
          if (next.origin === location.origin && next.pathname !== location.pathname) this.shutdown();
        } catch { /* A non-navigation link leaves the queue in place. */ }
      }, true);
      window.addEventListener('popstate', () => this.shutdown());
      document.addEventListener('visibilitychange', () => { if (!document.hidden) this.schedulePulse(); });
    }

    isEnabled() { return this.isExtensionEnabled() && !!this.getSettings().queueWhileGenerating; }
    hasWork() { return !!this.pending || this.queue.length > 0; }

    shutdown() {
      this.restorePreparedDraft();
      this.pending = null;
      this.queue = [];
      this.awaitingGeneration = null;
      clearTimeout(this.pulseTimeout);
      this.pulseTimeout = null;
      this.ui.removeAll();
    }

    restorePreparedDraft() {
      const pending = this.pending;
      if (!pending || pending.phase !== 'prepared' || pending.href !== dom().conversationKey()) return;
      const composer = AuroraComposerLocator.findActive();
      if (composer === pending.composer && AuroraComposerLocator.getText(composer).trim() === pending.text.trim()) {
        this.editing = true;
        AuroraComposerLocator.setText(composer, pending.draft);
        this.editing = false;
      }
    }

    schedulePulse(delay = 0) {
      if (this.pulseTimeout) return;
      const wait = Math.max(delay, 160 - (Date.now() - this.lastPulseAt));
      this.pulseTimeout = setTimeout(() => {
        this.pulseTimeout = null;
        this.pulse();
      }, Math.max(0, wait));
    }

    syncConversation() {
      const key = dom().conversationKey();
      if (this.lastHref === key) {
        const identity = dom().conversationIdentity();
        if (identity && this.queue.some(item => item.identity && item.identity !== identity)) this.shutdown();
        return;
      }
      const identity = dom().conversationIdentity();
      const previousPath = new URL(this.lastHref).pathname;
      const A = window.AuroraExt;
      const wasNew = A.site?.isNewConversation?.(previousPath) || previousPath.startsWith('/c/local-chatgpt');
      const canAdopt = wasNew && dom().isGenerating() && identity && this.queue.length > 0 && this.queue.every(item => item.identity === identity);
      this.lastHref = key;
      if (canAdopt) {
        this.queue.forEach(item => { item.href = key; });
        if (this.pending) this.pending.href = key;
      } else {
        // Restore only within the original conversation, never into a new chat.
        this.shutdown();
      }
    }

    pulse() {
      this.lastPulseAt = Date.now();
      this.syncConversation();
      if (!this.isEnabled()) { this.shutdown(); return; }
      if (document.hidden) return;
      const composer = AuroraComposerLocator.findActive();
      if (!composer) { this.ui.removeAll(); return; }
      const generating = dom().isGenerating(composer);
      const text = AuroraComposerLocator.getText(composer).trim();
      const pending = this.pending;
      if (pending) {
        if (pending.phase === 'prepared') {
          if (text !== pending.text.trim()) {
            pending.queuedItem.blocked = true;
            this.pending = null;
          } else if (generating) {
            this.restorePreparedDraft();
            pending.queuedItem.blocked = true;
            this.pending = null;
          } else {
            const send = dom().findComposerButton(composer, 'send');
            if (send && !send.disabled && send.getAttribute('aria-disabled') !== 'true' && !send.classList.contains('ds-button--disabled') && send.getAttribute('data-disabled') !== 'true') {
              // Mark submitted before click because the host may update synchronously.
              pending.phase = 'submitted';
              pending.attemptedAt = Date.now();
              pending.messageCount = dom().userMessageCount();
              try { send.click(); }
              catch {
                pending.queuedItem.blocked = true;
                this.pending = null;
              }
            } else if (Date.now() - pending.attemptedAt > 1800) {
              this.restorePreparedDraft();
              pending.queuedItem.blocked = true;
              this.pending = null;
            }
          }
        } else if (generating || dom().userMessageCount() > pending.messageCount) {
          this.queue = this.queue.filter(item => item !== pending.queuedItem);
          this.pending = null;
          // A visible user message can appear before the host enters generating state.
          if (!generating && this.queue.length) this.awaitingGeneration = Date.now();
        } else if (Date.now() - pending.attemptedAt > 5000) {
          // Ambiguous submission requires an explicit retry to prevent duplicate messages.
          this.restorePreparedDraft();
          pending.queuedItem.blocked = true;
          this.pending = null;
        }
      }
      const next = this.queue[0];
      if (this.awaitingGeneration !== null) {
        if (generating || !next) this.awaitingGeneration = null;
        else if (Date.now() - this.awaitingGeneration > 5000) {
          next.blocked = true;
          this.awaitingGeneration = null;
        }
      }
      const sameConversation = !next?.identity || next.identity === dom().conversationIdentity();
      if (sameConversation && this.awaitingGeneration === null && !generating && !this.pending && next && !next.blocked && !AuroraComposerLocator.getText(composer).trim()) {
        this.pending = { phase: 'prepared', composer, text: next.text, draft: '', href: this.lastHref, queuedItem: next, attemptedAt: Date.now() };
        this.editing = true;
        const inserted = AuroraComposerLocator.setText(composer, next.text);
        this.editing = false;
        if (!inserted) { next.blocked = true; this.pending = null; }
      }
      const status = next?.blocked ? this.getMessage('queueNeedsRetry')
        : this.pending?.phase === 'submitted' || this.awaitingGeneration !== null ? this.getMessage('queueSending')
        : generating ? this.getMessage('queuedPanelSubtitleGenerating')
        : next && text && !this.pending ? this.getMessage('queueWaitingForDraft') : '';
      const anchor = dom().findComposerButton(composer, generating ? 'stop' : 'send');
      const bounds = (this.queue.length || this.pending) ? composer.getBoundingClientRect() : null;
      this.ui.ensureButton({ anchor, count: this.queue.length, visible: generating || this.hasWork(), onClick: () => this.enqueueFromComposer(AuroraComposerLocator.findActive()) });
      this.ui.ensurePanel({ composer, bounds, queue: this.queue, pending: this.pending, status,
        onRemove: item => {
          if (this.pending?.queuedItem === item) {
            if (this.pending.phase === 'submitted') return;
            this.restorePreparedDraft();
            this.pending = null;
          }
          this.queue = this.queue.filter(queued => queued !== item);
          this.schedulePulse();
        },
        onRetry: item => {
          item.blocked = false;
          const editor = AuroraComposerLocator.findActive();
          if (editor && AuroraComposerLocator.getText(editor).trim() === item.text.trim()) {
            this.pending = { phase: 'prepared', composer: editor, text: item.text, draft: item.text,
              href: this.lastHref, queuedItem: item, attemptedAt: Date.now() };
          }
          this.schedulePulse();
        },
      });
      // Work owns its timer. Idle tabs use the shared DOM observer only.
      if (this.pending || this.awaitingGeneration !== null || (this.hasWork() && generating)) this.schedulePulse(220);
    }

    handleKeydown(event) {
      if (!this.isEnabled() || event.isComposing || event.key !== 'Enter' || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return;
      const composer = AuroraComposerLocator.findActive();
      if (!composer || (event.target !== composer && !composer.contains(event.target)) || !dom().isGenerating(composer)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      this.enqueueFromComposer(composer);
    }

    enqueueFromComposer(composer) {
      if (!this.isEnabled() || !composer || this.pending) return false;
      this.syncConversation();
      const text = AuroraComposerLocator.getText(composer).trim();
      if (!text) return false;
      if (this.queue.length >= 25) { this.ui.showToast(this.getMessage('queueFull')); return false; }
      this.editing = true;
      const cleared = AuroraComposerLocator.setText(composer, '');
      this.editing = false;
      if (!cleared) return false;
      this.queue.push({ id: this.nextId++, text, href: dom().conversationKey(), identity: dom().conversationIdentity(), blocked: false });
      this.ui.showToast(this.getMessage('toastMessageQueued', String(this.queue.length)));
      this.schedulePulse();
      return true;
    }
  }

  // Export for content.js orchestrator.
  window.AuroraMessageQueueEngine = AuroraMessageQueueEngine;
})();
