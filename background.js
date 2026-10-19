/**
 * SuperPaste - Background Service Worker
 * Manages context menus, keyboard commands, offscreen clipboard access, and extension lifecycle.
 */

// Initialize default settings and context menus on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(
    {
      enabled: true,
      unblockPaste: true,
      unblockCopy: true,
      unblockContextMenu: true,
      unblockSelection: true,
      pasteMode: 'instant', // 'instant' | 'fast_type' | 'natural_type'
      typingSpeed: 20,
      showNotifications: true
    },
    (defaults) => {
      chrome.storage.local.set(defaults);
    }
  );

  setupContextMenus();
});

function setupContextMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'superpaste_force_paste',
      title: '⚡ Force Paste (Bypass Restrictions)',
      contexts: ['editable', 'page']
    });

    chrome.contextMenus.create({
      id: 'superpaste_type_paste',
      title: '⌨️ Paste via Simulated Typing',
      contexts: ['editable']
    });

    chrome.contextMenus.create({
      id: 'superpaste_separator',
      type: 'separator',
      contexts: ['editable', 'page']
    });

    chrome.contextMenus.create({
      id: 'superpaste_toggle',
      title: '🛡️ Toggle Anti-Paste Protection',
      contexts: ['all']
    });
  });
}

// Manage Offscreen Document for Background Clipboard Access
let isCreatingOffscreen = false;

async function setupOffscreenDocument(path) {
  try {
    if (chrome.offscreen.hasDocument && await chrome.offscreen.hasDocument()) {
      return;
    }
    if (isCreatingOffscreen) return;
    isCreatingOffscreen = true;

    await chrome.offscreen.createDocument({
      url: path,
      reasons: ['CLIPBOARD'],
      justification: 'Read clipboard content to paste into protected inputs'
    });
  } catch (err) {
    // Document already exists or created concurrently
  } finally {
    isCreatingOffscreen = false;
  }
}

async function getClipboardText() {
  try {
    await setupOffscreenDocument('offscreen.html');
    const response = await Promise.race([
      chrome.runtime.sendMessage({ action: 'OFFSCREEN_READ_CLIPBOARD' }),
      new Promise((resolve) => setTimeout(() => resolve({ text: '' }), 500))
    ]);
    return response?.text || '';
  } catch (err) {
    return '';
  }
}

// Handle Context Menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab || !tab.id) return;

  if (info.menuItemId === 'superpaste_force_paste') {
    const text = await getClipboardText();
    chrome.tabs.sendMessage(tab.id, { action: 'FORCE_PASTE', text }).catch(() => {});
  } else if (info.menuItemId === 'superpaste_type_paste') {
    const text = await getClipboardText();
    chrome.tabs.sendMessage(tab.id, { action: 'FORCE_PASTE', text, mode: 'fast_type' }).catch(() => {});
  } else if (info.menuItemId === 'superpaste_toggle') {
    chrome.tabs.sendMessage(tab.id, { action: 'TOGGLE_UNBLOCK' }).catch(() => {});
  }
});

// Handle Keyboard Shortcuts configured in manifest.json
chrome.commands.onCommand.addListener(async (command) => {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tabs || tabs.length === 0) return;
  const activeTab = tabs[0];

  if (command === 'force-paste') {
    const text = await getClipboardText();
    chrome.tabs.sendMessage(activeTab.id, { action: 'FORCE_PASTE', text }).catch(() => {});
  } else if (command === 'toggle-unblock') {
    chrome.tabs.sendMessage(activeTab.id, { action: 'TOGGLE_UNBLOCK' }).catch(() => {});
  }
});

// Message listener for helper actions
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // CRITICAL: Only return true for messages this listener actually handles!
  if (request && request.action === 'READ_CLIPBOARD') {
    getClipboardText().then((text) => {
      sendResponse({ text });
    });
    return true; // Keep channel open for async response
  }
  return false;
});
