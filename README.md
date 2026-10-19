# SuperPaste - Anti-Paste Bypass & Force Paste Chrome Extension

A Chrome Extension (Manifest V3) designed to bypass anti-pasting restrictions, clipboard blocks, and test-proctoring telemetry on online assessment platforms, code editors, and restricted web forms.

---

## 🚀 Key Features

1. **Passive Event Unblocker (Runs at `document_start`)**
   - Intercepts and neutralizes `e.preventDefault()` on `paste`, `copy`, `cut`, `contextmenu`, and `selectstart`.
   - Traps inline event handlers like `<input onpaste="return false">` and `element.onpaste = ...`.
   - Removes CSS selection locks (`user-select: none !important`).

2. **Stealth "Force Paste" (`Alt + V` / Context Menu)**
   - **Does NOT trigger a `paste` event!**
   - Many exam proctoring systems (e.g. HackerRank, Mettl, Codility, TestGorilla, Canvas) monitor and flag when a `paste` event fires.
   - SuperPaste inserts clipboard text directly via `document.execCommand('insertText')` and React-compatible input setters. The site receives clean input events, keeping telemetry logs clean.

3. **Simulated Human Typing Mode**
   - For platforms with heuristic anti-cheat algorithms that analyze burst input timing (e.g. flagging 200 characters entered in 1 millisecond).
   - SuperPaste can type out your clipboard contents character-by-character with natural micro-delays and keystroke events (`keydown`, `input`, `keyup`).

4. **Works on Complex Frameworks & Editors**
   - Standard `<input>` and `<textarea>`
   - React / Vue / Angular controlled components (bypasses fiber value tracking)
   - Code Editors & Rich Text: Monaco, CodeMirror, Ace, and `contenteditable` divs
   - Shadow DOM and Web Components

5. **Interactive Test Lab (`demo.html`)**
   - Includes a built-in test laboratory simulating 6 real-world anti-paste traps and an active violation sensor.

---

## 📦 How to Install in Google Chrome

1. Open Google Chrome.
2. Navigate to: `chrome://extensions/` in the URL bar.
3. Enable **Developer mode** using the toggle switch in the top-right corner.
4. Click the **Load unpacked** button in the top-left corner.
5. Select the folder containing this extension:
   ```
   c:\Users\nsrfl\Downloads\Chrome_extension
   ```
6. The **SuperPaste** extension icon will now appear in your browser toolbar! (Pin it for easy access).

---

## 🎮 How to Use

### Method 1: Stealth Force Paste (Recommended for Exams)
1. Copy whatever text or code you want to your clipboard.
2. Click into the restricted input box, textarea, or code editor on the exam page.
3. Press **`Alt + V`** (or right-click and choose **"⚡ Force Paste"**).
4. SuperPaste inserts the text immediately without triggering `paste` event telemetry.

### Method 2: Standard Paste (`Ctrl + V`)
With SuperPaste enabled, the extension neutralizes `e.preventDefault()`. You can simply paste using regular `Ctrl + V` or right-click paste on forms that simply tried to block the action.

### Method 3: Simulated Typing Mode
1. Click the SuperPaste icon in the Chrome toolbar.
2. Under **Paste Delivery Method**, choose **"🚀 Fast Type"** or **"👤 Human Type"**.
3. Go back to your test page and press **`Alt + V`**.
4. The extension will automatically type out the text character-by-character.
5. Press `Esc` anytime if you wish to cancel ongoing typing.

---

## 🧪 Testing with the Built-in Test Lab

We included an interactive test suite to test the extension immediately:
1. In Google Chrome, open `file:///c:/Users/nsrfl/Downloads/Chrome_extension/demo.html` (or click **"Open Interactive Test Lab"** at the bottom of the extension popup).
2. Click **"Copy to Clipboard"** at the top to copy the sample payload.
3. Try pasting into:
   - **Trap 1:** `preventDefault()` listener blocker
   - **Trap 2:** Inline `onpaste="return false;"`
   - **Trap 3:** Proctor Telemetry violation detector (notice how `Ctrl+V` triggers a violation alert, while `Alt+V` pastes cleanly with 0 violations!)
   - **Trap 4:** `contenteditable` code editor
   - **Trap 5:** Context menu blocker
   - **Trap 6:** Copy & selection lock

---

## ⌨️ Keyboard Shortcuts Reference

| Shortcut | Action |
| :--- | :--- |
| **`Alt + V`** | **Force Paste** (Inserts clipboard text into focused element without `paste` event) |
| **`Alt + Shift + U`** | **Toggle Protection** (Enable/Pause bypass globally) |
| **`Esc`** | **Cancel Typing** (Stops ongoing simulated human typing) |

*Note: You can customize these shortcuts anytime by visiting `chrome://extensions/shortcuts` in Chrome.*
