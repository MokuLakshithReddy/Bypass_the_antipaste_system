/**
 * SuperPaste - Popup Logic
 */

document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const statusBadge = document.getElementById('statusBadge');
  const statusBadgeText = document.getElementById('statusBadgeText');
  const btnForcePaste = document.getElementById('btnForcePaste');
  const clipPreviewText = document.getElementById('clipPreviewText');
  const btnRefreshClip = document.getElementById('btnRefreshClip');
  const btnOpenTestLab = document.getElementById('btnOpenTestLab');

  const chkEnabled = document.getElementById('chkEnabled');
  const chkUnblockPaste = document.getElementById('chkUnblockPaste');
  const chkUnblockContextMenu = document.getElementById('chkUnblockContextMenu');
  const chkUnblockSelection = document.getElementById('chkUnblockSelection');
  const chkShowNotifications = document.getElementById('chkShowNotifications');
  const pasteModeRadios = document.querySelectorAll('input[name="pasteMode"]');

  let currentClipboardText = '';

  // Load saved settings
  const defaults = {
    enabled: true,
    unblockPaste: true,
    unblockContextMenu: true,
    unblockSelection: true,
    showNotifications: true,
    pasteMode: 'instant'
  };

  chrome.storage.local.get(defaults, (data) => {
    chkEnabled.checked = data.enabled;
    chkUnblockPaste.checked = data.unblockPaste;
    chkUnblockContextMenu.checked = data.unblockContextMenu;
    chkUnblockSelection.checked = data.unblockSelection;
    chkShowNotifications.checked = data.showNotifications;

    const activeRadio = document.querySelector(`input[name="pasteMode"][value="${data.pasteMode}"]`);
    if (activeRadio) activeRadio.checked = true;

    updateStatusBadge(data.enabled);
  });

  function updateStatusBadge(isEnabled) {
    if (isEnabled) {
      statusBadge.classList.remove('inactive');
      statusBadgeText.textContent = 'ACTIVE';
    } else {
      statusBadge.classList.add('inactive');
      statusBadgeText.textContent = 'PAUSED';
    }
  }

  // Update storage on toggle change
  function saveToggle(key, value) {
    chrome.storage.local.set({ [key]: value });
  }

  chkEnabled.addEventListener('change', (e) => {
    const val = e.target.checked;
    saveToggle('enabled', val);
    updateStatusBadge(val);
  });

  chkUnblockPaste.addEventListener('change', (e) => saveToggle('unblockPaste', e.target.checked));
  chkUnblockContextMenu.addEventListener('change', (e) => saveToggle('unblockContextMenu', e.target.checked));
  chkUnblockSelection.addEventListener('change', (e) => saveToggle('unblockSelection', e.target.checked));
  chkShowNotifications.addEventListener('change', (e) => saveToggle('showNotifications', e.target.checked));

  pasteModeRadios.forEach((radio) => {
    radio.addEventListener('change', (e) => {
      if (e.target.checked) {
        saveToggle('pasteMode', e.target.value);
      }
    });
  });

  // Fast direct clipboard reading (popup is a focused privileged window)
  async function refreshClipboard() {
    let text = '';

    // 1. Direct async clipboard read
    try {
      text = await navigator.clipboard.readText();
    } catch (e) {}

    // 2. Fallback to background query if direct read empty
    if (!text) {
      try {
        const bgRes = await Promise.race([
          new Promise((resolve) => {
            chrome.runtime.sendMessage({ action: 'READ_CLIPBOARD' }, (res) => resolve(res?.text || ''));
          }),
          new Promise((resolve) => setTimeout(() => resolve(''), 400))
        ]);
        text = bgRes;
      } catch (e) {}
    }

    currentClipboardText = text || '';

    if (!currentClipboardText || currentClipboardText.trim() === '') {
      clipPreviewText.textContent = '[Clipboard is empty - Copy text anywhere to test]';
      clipPreviewText.style.fontStyle = 'italic';
      clipPreviewText.style.color = '#94a3b8';
    } else {
      clipPreviewText.textContent = currentClipboardText;
      clipPreviewText.style.fontStyle = 'normal';
      clipPreviewText.style.color = '#38bdf8';
    }
  }

  refreshClipboard();
  btnRefreshClip.addEventListener('click', (e) => {
    e.stopPropagation();
    refreshClipboard();
  });
  clipPreviewText.parentElement.addEventListener('click', refreshClipboard);

  // Force Paste button click
  btnForcePaste.addEventListener('click', async () => {
    let textToPaste = currentClipboardText;

    if (!textToPaste) {
      try {
        textToPaste = await navigator.clipboard.readText();
      } catch (e) {}
    }

    if (!textToPaste) {
      clipPreviewText.textContent = '⚠️ Clipboard empty! Copy some text first.';
      clipPreviewText.style.color = '#f59e0b';
      return;
    }

    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs && tabs[0]) {
      chrome.tabs.sendMessage(
        tabs[0].id,
        { action: 'FORCE_PASTE', text: textToPaste },
        () => {
          setTimeout(() => window.close(), 120);
        }
      );
    }
  });

  // Open Test Lab
  btnOpenTestLab.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('demo.html') });
  });
});
