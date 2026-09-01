# 🚀 IFrame & Custom Event Catcher - Chrome Extension (Manifest V3)

A Chrome extension designed to catch, monitor, persist, and analyze **iframe events**, `postMessage` communications, iframe lifecycles, and **custom DOM events** across parent pages and embedded frames.

---

## ✨ Features

- 🛰️ **Complete Iframe Event Interception**: Intercepts inbound and outbound `postMessage` communications between parent windows and iframes, as well as cross-frame messages.
- ⚡ **Custom Event & DOM Event Monitoring**: Tracks dispatches of custom `CustomEvent` objects and user-configured event names across all frame contexts.
- 🖼️ **Iframe Lifecycle Tracking**: Detects when `<iframe>` elements are created, attached to the DOM, or fully loaded.
- 💾 **IndexedDB Event Persistence**: High-capacity event storage powered by IndexedDB. Stores tens of thousands of event logs without memory issues.
- ⏰ **Automatic 1-Week Retention Cleanup**: Includes a background service worker alarm (`chrome.alarms`) that automatically purges logs older than **1 week (default, configurable)**.
- 🎛️ **Sleek Modern Dashboard**: Dual-pane real-time event stream viewer with search filtering, JSON syntax inspector, CSV/JSON log export, and auto-refresh stream controls.
- 🧪 **Interactive Test Sandbox**: Built-in test playground inside the dashboard with embedded test iframes and dispatch generators to verify interception live out of the box.

---

## 🛠️ How to Install in Google Chrome

1. Open **Google Chrome** and navigate to `chrome://extensions`.
2. Enable **Developer mode** using the toggle switch in the top right corner.
3. Click **Load unpacked**.
4. Select the directory:
   `/Users/chaurasiak/experiments/chrome-extentions/iframe-event-catcher`
5. The **IFrame & Custom Event Catcher** extension icon will now appear in your browser toolbar.

---

## 💻 How to Use

1. **Popup Controls**:
   - Click the extension icon in the Chrome toolbar to see active tab event counts, retention status, toggle monitoring ON/OFF, or clear logs.
   - Click **Open Full Dashboard** to launch the comprehensive control center.

2. **Dashboard (Live Stream & Inspector)**:
   - **Search & Filters**: Search payload contents, URLs, origins, or filter by event type (`postMessage`, `CustomEvent`, `Iframe Loaded`).
   - **Payload Inspector**: Click any row in the stream to inspect formatted JSON payload, timestamps (local & UTC), and frame location details.
   - **Exporting Logs**: Download logs as `.json` or `.csv` files anytime.

3. **Testing with Built-In Sandbox**:
   - Go to the **Test Sandbox** tab in the Dashboard.
   - Click **Send postMessage to Iframe 1**, **Dispatch CustomEvent**, or **Dynamically Insert New Iframe**.
   - Switch back to the **Live Stream** tab to see your captured events logged in real time!

4. **Retention Settings**:
   - Under **Retention & Settings**, adjust your retention period (1 Day, 3 Days, **1 Week (Default)**, 2 Weeks, 30 Days, or Unlimited).
   - Click **Run Auto-Clean Now** to manually trigger retention cleanup at any time.

---

## 📁 File Structure

- `manifest.json`: Manifest V3 config with permissions and MAIN world content script declarations.
- `background.js`: Service worker handling persistence, retention alarms, storage stats, and extension badges.
- `db.js`: IndexedDB engine for event storage and auto-cleanup queries.
- `injected.js`: MAIN execution world script intercepting native `postMessage`, `dispatchEvent`, and `CustomEvent` dispatches.
- `content.js`: ISOLATED world content script running on `all_frames: true` bridging page context events to the background worker.
- `popup.html`, `popup.css`, `popup.js`: Extension popup UI.
- `dashboard.html`, `dashboard.css`, `dashboard.js`: Full-featured dashboard, inspector, and sandbox UI.
- `icons/`: Extension icon assets (16x16, 48x48, 128x128).
