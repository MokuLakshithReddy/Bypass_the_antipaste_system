/**
 * SuperPaste - Content Script (ISOLATED World)
 * Manages active element focus, clipboard extraction, force-pasting,
 * and simulated human typing for bypass in strict test environments.
 */

(function () {
  'use strict';

  // Default settings
  let settings = {
    enabled: true,
    unblockPaste: true,
    unblockCopy: true,
    unblockContextMenu: true,
    unblockSelection: true,
    pasteMode: 'instant', // 'instant' | 'fast_type' | 'natural_type'
    typingSpeed: 20, // ms per char in typing modes
    showNotifications: true
  };

  let lastFocusedEditable = null;
  let isTypingInProgress = false;

  // Track any editable element the user interacts with (clicks, focuses, types in)
  function registerEditable(target) {
    if (!target) return;
    let el = target;
    while (el && el.shadowRoot && el.shadowRoot.activeElement) {
      el = el.shadowRoot.activeElement;
    }
    if (isEditable(el)) {
      lastFocusedEditable = el;
    }
  }

  ['focusin', 'mousedown', 'mouseup', 'click', 'contextmenu', 'keydown'].forEach((evt) => {
    document.addEventListener(evt, (e) => registerEditable(e.target), true);
  });

  // Sync settings with chrome.storage and injected script
  function syncSettings() {
    chrome.storage.local.get(settings, (stored) => {
      settings = { ...settings, ...stored };
      window.dispatchEvent(
        new CustomEvent('__superpaste_sync_config', {
          detail: {
            enabled: settings.enabled,
            unblockPaste: settings.unblockPaste,
            unblockCopy: settings.unblockCopy,
            unblockContextMenu: settings.unblockContextMenu,
            unblockSelection: settings.unblockSelection
          }
        })
      );
    });
  }

  // Initial sync & storage change listener
  syncSettings();
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
      for (const [key, val] of Object.entries(changes)) {
        settings[key] = val.newValue;
      }
      syncSettings();
    }
  });

  function isEditable(el) {
    if (!el || el === document.body || el === document.documentElement) return false;
    const tag = el.tagName ? el.tagName.toLowerCase() : '';
    if (tag === 'input') {
      const type = (el.getAttribute('type') || 'text').toLowerCase();
      // Only reject non-text input types like submit, button, checkbox, radio
      const nonTextTypes = ['submit', 'button', 'reset', 'checkbox', 'radio', 'file', 'image'];
      return !nonTextTypes.includes(type);
    }
    if (tag === 'textarea') return true;
    if (el.isContentEditable) return true;
    if (el.getAttribute && (el.getAttribute('contenteditable') === 'true' || el.getAttribute('role') === 'textbox')) {
      return true;
    }
    return false;
  }

  // Find deepest active element (handles shadow DOM, nested IFRAMEs, and editor containers)
  function getFocusedElement() {
    let el = document.activeElement;

    // Traverse shadow DOM and same-origin iframes
    while (el) {
      if (el.shadowRoot && el.shadowRoot.activeElement) {
        el = el.shadowRoot.activeElement;
        continue;
      }
      if (el.tagName && el.tagName.toLowerCase() === 'iframe') {
        try {
          if (el.contentDocument && el.contentDocument.activeElement) {
            el = el.contentDocument.activeElement;
            continue;
          }
        } catch (e) {
          break; // Cross-origin iframe, handled by postMessage broadcast
        }
      }
      break;
    }

    // Check if element is directly editable
    if (el && isEditable(el)) {
      return el;
    }

    // If active element is a DIV or editor wrapper, resolve actual input target
    if (el) {
      const resolved = resolveEditorInput(el);
      if (resolved && isEditable(resolved)) return resolved;
    }

    if (lastFocusedEditable && document.contains(lastFocusedEditable) && isEditable(lastFocusedEditable)) {
      return lastFocusedEditable;
    }

    // Fallback: check window selection node
    const sel = window.getSelection();
    if (sel && sel.anchorNode) {
      let node = sel.anchorNode;
      if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
      if (node) {
        const resolvedNode = resolveEditorInput(node);
        if (resolvedNode && isEditable(resolvedNode)) return resolvedNode;
      }
    }

    // Last resort fallback: find any editor or editable field on page
    const fallbackInput = document.querySelector('textarea.inputarea, textarea.ace_text-input, .cm-content, input:not([type="hidden"]):not([type="submit"]), textarea, [contenteditable="true"]');
    if (fallbackInput && isEditable(fallbackInput)) {
      return fallbackInput;
    }

    return null;
  }

  // Resolves hidden textareas inside code editors (Monaco, Ace, CodeMirror)
  function resolveEditorInput(el) {
    if (!el) return null;
    if (isEditable(el)) return el;

    // 1. Search inside the element
    const inner = el.querySelector?.('textarea, input:not([type="hidden"]), [contenteditable="true"]');
    if (inner && isEditable(inner)) return inner;

    // 2. Monaco Editor (VS Code Web, LeetCode, HackerRank)
    const monacoTextarea = el.closest?.('.monaco-editor')?.querySelector('textarea.inputarea')
                        || document.querySelector('.monaco-editor textarea.inputarea');
    if (monacoTextarea) return monacoTextarea;

    // 3. Ace Editor
    const aceTextarea = el.closest?.('.ace_editor')?.querySelector('textarea.ace_text-input')
                     || document.querySelector('.ace_editor textarea.ace_text-input');
    if (aceTextarea) return aceTextarea;

    // 4. CodeMirror
    const cmInput = el.closest?.('.CodeMirror, .cm-editor')?.querySelector('textarea, .cm-content')
                 || document.querySelector('.CodeMirror textarea, .cm-content');
    if (cmInput) return cmInput;

    return null;
  }

  function flashTargetElement(el) {
    if (!el || !el.style) return;
    try {
      const origOutline = el.style.outline;
      const origTransition = el.style.transition;
      el.style.transition = 'outline 0.15s ease';
      el.style.outline = '3px solid #10b981';
      setTimeout(() => {
        el.style.outline = origOutline;
        el.style.transition = origTransition;
      }, 1000);
    } catch (e) {}
  }

  /**
   * Inserts text instantly using multi-tier strategy:
   * 1. Direct MAIN world Monaco/Ace bridge
   * 2. Direct .value assignment with selection bounds and React setter bypass
   * 3. execCommand('insertText') for rich editors
   * 4. Selection Range insertion for contenteditable
   */
  function insertInstant(el, text) {
    // Check 1: Dispatch to MAIN world for direct Monaco/Ace code editor APIs
    let mainSuccess = false;
    const onSuccess = () => { mainSuccess = true; };
    window.addEventListener('__superpaste_main_insert_success', onSuccess, { once: true });
    window.dispatchEvent(new CustomEvent('__superpaste_main_insert', { detail: { text } }));
    window.removeEventListener('__superpaste_main_insert_success', onSuccess);

    if (mainSuccess) {
      if (el) flashTargetElement(el);
      return true;
    }

    if (!el) return false;

    try {
      if (typeof el.focus === 'function') {
        el.focus();
      }
    } catch (e) {}

    flashTargetElement(el);

    // Strategy A: Standard input & textarea
    if ('value' in el && typeof el.value === 'string') {
      const valBefore = el.value;

      // Try execCommand first
      try {
        document.execCommand('insertText', false, text);
      } catch (e) {}

      // If execCommand did not actually change the value, update it directly!
      if (el.value === valBefore) {
        const start = el.selectionStart ?? el.value.length;
        const end = el.selectionEnd ?? el.value.length;
        const prev = el.value || '';
        const updated = prev.slice(0, start) + text + prev.slice(end);

        // React 16+ setter bypass
        try {
          const tag = el.tagName ? el.tagName.toLowerCase() : 'input';
          const proto = tag === 'textarea' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
          const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
          nativeSetter?.call(el, updated);
        } catch (e) {}

        // Direct property assignment
        el.value = updated;

        try {
          el.selectionStart = el.selectionEnd = start + text.length;
        } catch (e) {}
      }

      triggerInputEvents(el);
      return true;
    }

    // Strategy B: Contenteditable / Rich Text
    if (el.isContentEditable || el.getAttribute('contenteditable') === 'true') {
      const textBefore = el.textContent;

      try {
        document.execCommand('insertText', false, text);
      } catch (e) {}

      if (el.textContent === textBefore) {
        try {
          const sel = window.getSelection();
          let range = null;
          if (sel && sel.rangeCount > 0 && el.contains(sel.anchorNode)) {
            range = sel.getRangeAt(0);
          } else {
            range = document.createRange();
            range.selectNodeContents(el);
            range.collapse(false);
            if (sel) {
              sel.removeAllRanges();
              sel.addRange(range);
            }
          }

          range.deleteContents();
          const node = document.createTextNode(text);
          range.insertNode(node);
          range.setStartAfter(node);
          range.setEndAfter(node);
        } catch (err) {
          el.appendChild(document.createTextNode(text));
        }
      }

      triggerInputEvents(el);
      return true;
    }

    return false;
  }

  /**
   * Simulates typing character-by-character.
   * Defeats heuristic anti-cheat algorithms that analyze burst input timing!
   */
  async function simulateTyping(el, text, speedMode) {
    if (!el || isTypingInProgress) return;
    isTypingInProgress = true;

    try {
      if (typeof el.focus === 'function') {
        el.focus();
      }
    } catch (e) {}

    flashTargetElement(el);

    showToast(`⌨️ Typing ${text.length} characters...`, 2000);

    const baseDelay = speedMode === 'fast_type' ? 4 : Math.max(10, settings.typingSpeed || 20);

    for (let i = 0; i < text.length; i++) {
      if (!isTypingInProgress) break;

      const char = text[i];

      // Dispatch keydown
      el.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: char,
          bubbles: true,
          cancelable: true
        })
      );

      // Insert character with guaranteed fallback
      if ('value' in el && typeof el.value === 'string') {
        const valBefore = el.value;
        try {
          document.execCommand('insertText', false, char);
        } catch (e) {}

        // If execCommand failed or returned false without updating value
        if (el.value === valBefore) {
          const start = el.selectionStart ?? el.value.length;
          const end = el.selectionEnd ?? el.value.length;
          const val = el.value || '';
          const updated = val.slice(0, start) + char + val.slice(end);

          try {
            const tag = el.tagName ? el.tagName.toLowerCase() : 'input';
            const proto = tag === 'textarea' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
            const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
            nativeSetter?.call(el, updated);
          } catch (e) {}

          el.value = updated;
          try {
            el.selectionStart = el.selectionEnd = start + 1;
          } catch (e) {}
        }
      } else if (el.isContentEditable) {
        const textBefore = el.textContent;
        try {
          document.execCommand('insertText', false, char);
        } catch (e) {}
        if (el.textContent === textBefore) {
          el.appendChild(document.createTextNode(char));
        }
      }

      triggerInputEvents(el);

      // Dispatch keyup
      el.dispatchEvent(
        new KeyboardEvent('keyup', {
          key: char,
          bubbles: true,
          cancelable: true
        })
      );

      const jitter = speedMode === 'natural_type' ? Math.floor(Math.random() * 16 - 8) : 0;
      const delay = Math.max(2, baseDelay + jitter);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    el.dispatchEvent(new Event('change', { bubbles: true }));
    isTypingInProgress = false;
    showToast('✅ Typing complete!', 1500);
  }

  function triggerInputEvents(el) {
    try {
      el.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true }));
      el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
      el.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
    } catch (e) {}
  }

  // Visual HUD Toast Notification
  function showToast(message, duration = 2000) {
    if (!settings.showNotifications) return;

    let toast = document.getElementById('__superpaste_hud_toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = '__superpaste_hud_toast';
      Object.assign(toast.style, {
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        backgroundColor: '#0f172a',
        color: '#f8fafc',
        padding: '10px 18px',
        borderRadius: '10px',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        fontSize: '13px',
        fontWeight: '600',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(99, 102, 241, 0.4)',
        zIndex: '2147483647',
        pointerEvents: 'none',
        transition: 'opacity 0.25s ease, transform 0.25s ease',
        opacity: '0',
        transform: 'translateY(10px)',
        display: 'flex',
        alignItems: 'center',
        gap: '8px'
      });
      document.documentElement.appendChild(toast);
    }

    toast.textContent = message;
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';

    clearTimeout(toast.__timeout);
    toast.__timeout = setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
    }, duration);
  }

  /**
   * Main Paste Handler: retrieves text from clipboard or message and executes insertion.
   */
  async function executeForcePaste(providedText = null, overrideMode = null) {
    let textToPaste = providedText;

    if (!textToPaste) {
      // 1. Try direct navigator.clipboard (fastest & reliable during Alt+V keystroke gesture)
      try {
        textToPaste = await navigator.clipboard.readText();
      } catch (e) {}

      // 2. Fallback to background query with a 400ms timeout
      if (!textToPaste) {
        try {
          const bgPromise = new Promise((resolve) => {
            chrome.runtime.sendMessage({ action: 'READ_CLIPBOARD' }, (res) => {
              resolve(res?.text || '');
            });
          });
          const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve(''), 400));
          textToPaste = await Promise.race([bgPromise, timeoutPromise]);
        } catch (err) {}
      }
    }

    if (!textToPaste) {
      showToast('⚠️ Clipboard is empty! Copy text first.');
      return;
    }

    const activeEl = getFocusedElement();
    if (!activeEl || !isEditable(activeEl)) {
      showToast('⚠️ Please click into an input box first');
      return;
    }

    const mode = overrideMode || settings.pasteMode;

    if (mode === 'fast_type' || mode === 'natural_type') {
      simulateTyping(activeEl, textToPaste, mode);
    } else {
      const success = insertInstant(activeEl, textToPaste);
      if (success) {
        const preview = textToPaste.length > 25 ? textToPaste.substring(0, 22) + '...' : textToPaste;
        showToast(`⚡ Pasted: "${preview}" (${textToPaste.length} chars)`);
      } else {
        showToast('❌ Unable to insert into target field');
      }
    }
  }

  // Broadcast action to all child iframes
  function broadcastToChildFrames(text, mode) {
    const payload = { type: '__SUPERPASTE_FRAME_PASTE', text, mode };
    document.querySelectorAll('iframe').forEach((fr) => {
      try {
        fr.contentWindow?.postMessage(payload, '*');
      } catch (e) {}
    });
  }

  // Listen for broadcast from parent window
  window.addEventListener('message', (e) => {
    if (e.data && e.data.type === '__SUPERPASTE_FRAME_PASTE') {
      // Forward down to nested iframes
      broadcastToChildFrames(e.data.text, e.data.mode);

      // If this frame has focus or has active target, execute
      const target = getFocusedElement();
      if (target || document.hasFocus()) {
        executeForcePaste(e.data.text, e.data.mode);
      }
    }
  });

  // Listen for messages from background script
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.action === 'FORCE_PASTE') {
      // Broadcast to any embedded iframes
      broadcastToChildFrames(msg.text, msg.mode);
      executeForcePaste(msg.text, msg.mode);
      sendResponse({ status: 'ok' });
    } else if (msg && msg.action === 'TOGGLE_UNBLOCK') {
      settings.enabled = !settings.enabled;
      chrome.storage.local.set({ enabled: settings.enabled }, () => {
        showToast(settings.enabled ? '🟢 SuperPaste: Enabled' : '⚪ SuperPaste: Paused');
      });
      sendResponse({ enabled: settings.enabled });
    } else if (msg && msg.action === 'STOP_TYPING') {
      isTypingInProgress = false;
      showToast('⏹️ Typing stopped');
      sendResponse({ status: 'stopped' });
    }
    return false;
  });

  // Fallback keyboard shortcut listener directly inside DOM (Alt+V)
  window.addEventListener(
    'keydown',
    (e) => {
      // Check Alt+V
      if (e.altKey && (e.key === 'v' || e.key === 'V') && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        e.stopPropagation();
        broadcastToChildFrames(null, null);
        executeForcePaste();
      }
      // Escape to cancel typing if typing simulation is ongoing
      if (e.key === 'Escape' && isTypingInProgress) {
        isTypingInProgress = false;
        showToast('⏹️ Typing cancelled');
      }
    },
    true
  );
})();
