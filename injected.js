/**
 * SuperPaste - Injected MAIN World Script
 * Runs directly in the webpage context at document_start.
 * Neutralizes anti-paste, anti-copy, anti-selection, and anti-contextmenu hooks.
 */
(function () {
  'use strict';

  // Prevent multiple injections
  if (window.__superpaste_injected) return;
  window.__superpaste_injected = true;

  // Configuration state (controlled by content script)
  let config = {
    unblockPaste: true,
    unblockCopy: true,
    unblockContextMenu: true,
    unblockSelection: true,
    enabled: true
  };

  // Listen for config sync from content script
  window.addEventListener('__superpaste_sync_config', (event) => {
    if (event.detail) {
      config = { ...config, ...event.detail };
    }
  });

  // 1. Hook Event.prototype.preventDefault
  const originalPreventDefault = Event.prototype.preventDefault;
  Event.prototype.preventDefault = function () {
    if (config.enabled && this) {
      const type = this.type;
      if (
        (config.unblockPaste && type === 'paste') ||
        (config.unblockCopy && (type === 'copy' || type === 'cut')) ||
        (config.unblockContextMenu && type === 'contextmenu') ||
        (config.unblockSelection && (type === 'selectstart' || type === 'selectionchange'))
      ) {
        // Suppress site's attempt to cancel the action
        return;
      }
    }
    return originalPreventDefault.apply(this, arguments);
  };

  // 2. Hook Event.prototype.stopImmediatePropagation for paste if desired
  const originalStopImmediatePropagation = Event.prototype.stopImmediatePropagation;
  Event.prototype.stopImmediatePropagation = function () {
    if (config.enabled && this && config.unblockPaste && this.type === 'paste') {
      // Don't let test sites hide the paste from other handlers or native behaviors
      return;
    }
    return originalStopImmediatePropagation.apply(this, arguments);
  };

  // 3. Trap inline event properties (onpaste, oncopy, oncut, oncontextmenu)
  const blockedProps = ['onpaste', 'oncopy', 'oncut', 'oncontextmenu', 'onselectstart', 'ondragstart'];
  blockedProps.forEach((prop) => {
    try {
      const privateKey = `__superpaste_${prop}`;
      Object.defineProperty(HTMLElement.prototype, prop, {
        get() {
          return this[privateKey] || null;
        },
        set(handler) {
          // If enabled, store it internally but don't let it execute preventDefault
          if (typeof handler === 'function') {
            this[privateKey] = function (e) {
              const res = handler.apply(this, arguments);
              if (res === false && config.enabled) {
                // If handler returned false to cancel event, override it to allow event
                return true;
              }
              return res;
            };
          } else {
            this[privateKey] = null;
          }
        },
        configurable: true,
        enumerable: true
      });
    } catch (e) {
      // Property might be non-configurable in some environments
    }
  });

  // 4. Hook EventTarget.prototype.addEventListener
  const originalAddEventListener = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function (type, listener, options) {
    if (typeof type === 'string' && typeof listener === 'function') {
      const lower = type.toLowerCase();
      if (
        (config.unblockPaste && lower === 'paste') ||
        (config.unblockCopy && (lower === 'copy' || lower === 'cut')) ||
        (config.unblockContextMenu && lower === 'contextmenu') ||
        (config.unblockSelection && lower === 'selectstart')
      ) {
        const wrappedListener = function (e) {
          // Temporarily ensure default action isn't canceled if site throws or returns false
          try {
            const res = listener.apply(this, arguments);
            if (res === false && config.enabled) {
              return true;
            }
            return res;
          } catch (err) {
            // Silently absorb site anti-paste errors
            console.debug('[SuperPaste] Trapped listener exception:', err);
          }
        };
        return originalAddEventListener.call(this, type, wrappedListener, options);
      }
    }
    return originalAddEventListener.call(this, type, listener, options);
  };

  // 5. Unlock CSS user-select and context menu restrictions
  function unlockDOMStyles() {
    if (!config.enabled) return;
    try {
      const style = document.createElement('style');
      style.id = '__superpaste_unlock_style';
      style.textContent = `
        * {
          -webkit-user-select: auto !important;
          -moz-user-select: auto !important;
          -ms-user-select: auto !important;
          user-select: auto !important;
        }
      `;
      if (document.head && !document.getElementById('__superpaste_unlock_style')) {
        document.head.appendChild(style);
      }
    } catch (err) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', unlockDOMStyles);
  } else {
    unlockDOMStyles();
  }

  // 6. Direct Rich Code Editor Bridge (Monaco / Ace / CodeMirror)
  window.addEventListener('__superpaste_main_insert', (e) => {
    const text = e.detail?.text;
    if (!text) return;

    // Check A: Monaco Editor (VS Code web, LeetCode, HackerRank, modern exam platforms)
    try {
      if (window.monaco && window.monaco.editor) {
        const editors = window.monaco.editor.getEditors();
        if (editors && editors.length > 0) {
          const activeEditor = editors.find((ed) => (ed.hasTextFocus && ed.hasTextFocus()) || (ed.hasWidgetFocus && ed.hasWidgetFocus())) || editors[0];
          if (activeEditor) {
            const selection = activeEditor.getSelection();
            activeEditor.executeEdits('superpaste', [
              { range: selection, text: text, forceMoveMarkers: true }
            ]);
            window.dispatchEvent(new CustomEvent('__superpaste_main_insert_success'));
            return;
          }
        }
      }
    } catch (err) {
      console.debug('[SuperPaste] Monaco insert error:', err);
    }

    // Check B: Ace Editor
    try {
      if (window.ace && typeof window.ace.edit === 'function') {
        const aceEl = document.querySelector('.ace_editor');
        if (aceEl) {
          const editor = window.ace.edit(aceEl);
          if (editor) {
            editor.insert(text);
            window.dispatchEvent(new CustomEvent('__superpaste_main_insert_success'));
            return;
          }
        }
      }
    } catch (err) {
      console.debug('[SuperPaste] Ace insert error:', err);
    }

    // Check C: CodeMirror (v5)
    try {
      const cmEl = document.querySelector('.CodeMirror');
      if (cmEl && cmEl.CodeMirror) {
        cmEl.CodeMirror.replaceSelection(text);
        window.dispatchEvent(new CustomEvent('__superpaste_main_insert_success'));
        return;
      }
    } catch (err) {
      console.debug('[SuperPaste] CodeMirror insert error:', err);
    }
  });
})();
