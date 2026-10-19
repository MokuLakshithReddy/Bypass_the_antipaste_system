/**
 * SuperPaste - Offscreen Document Script
 * Uses DOM document.execCommand('paste') with clipboardRead permission
 * to reliably retrieve clipboard content in Manifest V3 without page focus constraints.
 */

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'OFFSCREEN_READ_CLIPBOARD') {
    handleReadClipboard().then((text) => {
      sendResponse({ text: text || '' });
    }).catch(() => {
      sendResponse({ text: '' });
    });
    return true; // Keep message channel open for async response
  }
});

async function handleReadClipboard() {
  const textarea = document.getElementById('clipBuffer') || document.createElement('textarea');
  textarea.value = '';
  document.body.appendChild(textarea);
  textarea.select();
  textarea.focus();

  // Method 1: document.execCommand('paste')
  // Supported in extension offscreen documents with 'clipboardRead' permission
  const success = document.execCommand('paste');
  let result = textarea.value;

  // Method 2: Fallback to Async Clipboard API
  if (!result) {
    try {
      result = await navigator.clipboard.readText();
    } catch (e) {
      console.debug('Offscreen navigator.clipboard failed:', e);
    }
  }

  textarea.value = '';
  return result;
}
