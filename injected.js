/**
 * Main World Injection Script
 * Intercepts postMessages, CustomEvents, and iframe events at native API level.
 */
(function () {
  if (window.__IFRAME_EVENT_CATCHER_INJECTED__) return;
  window.__IFRAME_EVENT_CATCHER_INJECTED__ = true;

  const BRIDGE_TAG = '__IFRAME_EVENT_CATCHER_BRIDGE__';

  // Helper to safely serialize objects without throwing on circular references or non-clonables
  function safeSerialize(obj, depth = 0, maxDepth = 4) {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj === 'string' || typeof obj === 'number' || typeof obj === 'boolean') return obj;
    if (typeof obj === 'function') return `[Function: ${obj.name || 'anonymous'}]`;
    if (typeof obj === 'symbol') return obj.toString();
    if (obj instanceof Element) {
      return `<${obj.tagName.toLowerCase()}${obj.id ? '#' + obj.id : ''}${obj.className ? '.' + Array.from(obj.classList).join('.') : ''}>`;
    }
    if (depth >= maxDepth) return '[Object / Array Max Depth Exceeded]';

    try {
      if (Array.isArray(obj)) {
        return obj.map(item => safeSerialize(item, depth + 1, maxDepth));
      }
      if (typeof obj === 'object') {
        const res = {};
        for (const key of Object.keys(obj)) {
          // Skip internal extension properties
          if (key === BRIDGE_TAG || key === '__IFRAME_EVENT_CATCHER_INTERNAL__') continue;
          try {
            res[key] = safeSerialize(obj[key], depth + 1, maxDepth);
          } catch (e) {
            res[key] = '[Unserializable]';
          }
        }
        return res;
      }
    } catch (err) {
      return String(obj);
    }
    return String(obj);
  }

  // Send captured event payload to Content Script
  let isEmitting = false;
  function emitToBridge(eventType, eventName, details) {
    if (isEmitting) return;
    isEmitting = true;
    try {
      window.postMessage({
        [BRIDGE_TAG]: true,
        eventType,
        eventName,
        details: safeSerialize(details),
        location: {
          href: window.location.href,
          origin: window.location.origin,
          isIframe: window.top !== window.self,
          title: document.title
        },
        timestamp: Date.now()
      }, '*');
    } catch (err) {
      // Ignore bridge emit errors
    } finally {
      isEmitting = false;
    }
  }

  // 1. Intercept Outgoing window.postMessage
  const originalPostMessage = window.postMessage;
  window.postMessage = function (message, targetOrigin, transfer) {
    // Check if internal bridge message
    if (message && typeof message === 'object' && message[BRIDGE_TAG]) {
      return originalPostMessage.apply(this, arguments);
    }

    try {
      emitToBridge('postMessage_sent', 'postMessage:outbound', {
        message,
        targetOrigin: targetOrigin || '*',
        transferCount: transfer ? transfer.length : 0
      });
    } catch (e) {}

    return originalPostMessage.apply(this, arguments);
  };

  // 2. Intercept Incoming 'message' and 'messageerror' events
  window.addEventListener('message', function (evt) {
    if (evt.data && typeof evt.data === 'object' && evt.data[BRIDGE_TAG]) {
      return; // Ignore bridge messages
    }
    try {
      emitToBridge('postMessage_received', 'postMessage:inbound', {
        data: evt.data,
        origin: evt.origin,
        lastEventId: evt.lastEventId,
        sourceType: evt.source ? (evt.source === window.parent ? 'parent' : (evt.source === window.top ? 'top' : 'frame/other')) : 'unknown'
      });
    } catch (e) {}
  }, true);

  window.addEventListener('messageerror', function (evt) {
    try {
      emitToBridge('postMessage_error', 'postMessage:error', {
        origin: evt.origin,
        data: evt.data
      });
    } catch (e) {}
  }, true);

  // 3. Intercept dispatchEvent (Custom Events & System Events)
  const originalDispatchEvent = EventTarget.prototype.dispatchEvent;
  EventTarget.prototype.dispatchEvent = function (event) {
    try {
      if (event && event.type) {
        const isCustom = event instanceof CustomEvent;
        const targetDesc = this instanceof Element 
          ? `<${this.tagName.toLowerCase()}${this.id ? '#' + this.id : ''}>`
          : (this === window ? 'window' : (this === document ? 'document' : 'EventTarget'));

        emitToBridge(isCustom ? 'custom_event' : 'dom_event', event.type, {
          eventType: event.type,
          isCustomEvent: isCustom,
          detail: isCustom ? event.detail : undefined,
          target: targetDesc,
          bubbles: event.bubbles,
          cancelable: event.cancelable
        });
      }
    } catch (e) {}

    return originalDispatchEvent.apply(this, arguments);
  };

  // 4. Intercept Dynamic Iframe Insertions & Load Events
  function observeIframes() {
    // Monitor iframe load events
    document.addEventListener('load', function (e) {
      if (e.target && e.target.tagName === 'IFRAME') {
        const iframe = e.target;
        emitToBridge('iframe_loaded', 'iframe:load', {
          iframeId: iframe.id || null,
          iframeName: iframe.name || null,
          src: iframe.src || iframe.getAttribute('src'),
          currentFrameUrl: window.location.href
        });
      }
    }, true);

    // MutationObserver for iframe addition/removal
    const observer = new MutationObserver(function (mutations) {
      mutations.forEach(function (mutation) {
        mutation.addedNodes.forEach(function (node) {
          if (node.tagName === 'IFRAME') {
            emitToBridge('iframe_created', 'iframe:inserted', {
              iframeId: node.id || null,
              iframeName: node.name || null,
              src: node.src || node.getAttribute('src')
            });
          }
        });
      });
    });

    if (document.documentElement) {
      observer.observe(document.documentElement, { childList: true, subtree: true });
    } else {
      document.addEventListener('DOMContentLoaded', () => {
        observer.observe(document.documentElement, { childList: true, subtree: true });
      });
    }
  }

  observeIframes();
})();
