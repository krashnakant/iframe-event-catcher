/**
 * Content Script (Runs in ISOLATED world for all frames)
 * Listens for bridge messages from injected.js and sends them to background service worker.
 */
(function () {
  const BRIDGE_TAG = '__IFRAME_EVENT_CATCHER_BRIDGE__';

  // Listen for bridge messages emitted from injected.js (MAIN world)
  window.addEventListener('message', function (event) {
    // Only process messages originating from the current window and containing our bridge tag
    if (event.source !== window || !event.data || !event.data[BRIDGE_TAG]) {
      return;
    }

    const rawData = event.data;

    // Build enriched payload with Chrome & Frame context
    const enrichedEvent = {
      eventType: rawData.eventType,
      eventName: rawData.eventName,
      details: rawData.details,
      timestamp: rawData.timestamp || Date.now(),
      isIframe: window.top !== window.self,
      frameUrl: window.location.href,
      origin: window.location.origin,
      title: document.title,
      ancestorOrigins: Array.from(window.location.ancestorOrigins || [])
    };

    // Safely send to background service worker
    try {
      if (chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({
          action: 'LOG_EVENT',
          event: enrichedEvent
        }).catch(() => {
          // Extension context reloaded or background worker waking up
        });
      }
    } catch (e) {
      // Ignore extension context invalidated errors
    }
  }, false);

  // Monitor frame readiness
  if (window.top !== window.self) {
    try {
      chrome.runtime.sendMessage({
        action: 'FRAME_REGISTERED',
        frameUrl: window.location.href,
        origin: window.location.origin,
        isIframe: true
      }).catch(() => {});
    } catch (e) {}
  }
})();
