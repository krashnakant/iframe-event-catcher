/**
 * Service Worker Background Script
 * Handles event persistence, retention alarms, storage stats, tab badge counters,
 * and page-level enable/disable state (Disabled by default).
 */
import { EventStorage } from './db.js';

const ALARM_NAME = 'AUTO_CLEANUP_ALARM';
const DEFAULT_RETENTION_DAYS = 7; // 1 week default

// In-memory sets for tab-level and domain-level monitoring activations
const enabledTabs = new Set();
const enabledDomains = new Set();
const tabEventCounts = new Map();

// Initialize extension settings & auto-cleanup alarm on installation or startup
chrome.runtime.onInstalled.addListener(async () => {
  console.log('[Iframe Catcher] Extension Installed/Updated.');
  
  // Set default settings if not already present
  const currentRetention = await EventStorage.getSetting('retentionDays', null);
  if (currentRetention === null) {
    await EventStorage.setSetting('retentionDays', DEFAULT_RETENTION_DAYS);
  }

  // DISABLED by default as requested by user
  const isLogging = await EventStorage.getSetting('isLoggingEnabled', null);
  if (isLogging === null) {
    await EventStorage.setSetting('isLoggingEnabled', false);
  }

  const customEvents = await EventStorage.getSetting('customEvents', null);
  if (customEvents === null) {
    await EventStorage.setSetting('customEvents', ['analytics_track', 'state_change', 'user_action']);
  }

  // Create periodic cleanup alarm (runs every 60 minutes)
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: 60 });
  
  runAutoCleanup();
});

// Alarm Listener for Periodic Storage Retention Cleanup
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    runAutoCleanup();
  }
});

async function runAutoCleanup() {
  try {
    const retentionDays = await EventStorage.getSetting('retentionDays', DEFAULT_RETENTION_DAYS);
    if (retentionDays > 0) {
      const deletedCount = await EventStorage.cleanupOldEvents(retentionDays);
      console.log(`[Iframe Catcher] Auto-cleanup completed. Purged ${deletedCount} events older than ${retentionDays} days.`);
    }
  } catch (err) {
    console.error('[Iframe Catcher] Auto-cleanup failed:', err);
  }
}

// Helper to extract domain from URL
function getDomain(urlStr) {
  try {
    const u = new URL(urlStr);
    return u.hostname;
  } catch (e) {
    return null;
  }
}

// Check if monitoring is enabled for a specific tab or globally
async function isTabEnabled(tabId, tabUrl) {
  const globalEnabled = await EventStorage.getSetting('isLoggingEnabled', false);
  if (globalEnabled) return true;

  if (tabId && enabledTabs.has(tabId)) return true;

  if (tabUrl) {
    const domain = getDomain(tabUrl);
    if (domain && enabledDomains.has(domain)) return true;
  }

  return false;
}

// Update Extension Icon Badge for tab
async function updateBadge(tabId, tabUrl) {
  const enabled = await isTabEnabled(tabId, tabUrl);
  
  if (!enabled) {
    chrome.action.setBadgeText({ text: 'OFF', tabId: tabId });
    chrome.action.setBadgeBackgroundColor({ color: '#64748b', tabId: tabId }); // Slate gray for OFF
  } else {
    const count = tabEventCounts.get(tabId) || 0;
    chrome.action.setBadgeText({
      text: count > 0 ? (count > 999 ? '999+' : String(count)) : 'ON',
      tabId: tabId
    });
    chrome.action.setBadgeBackgroundColor({ color: '#10b981', tabId: tabId }); // Emerald green for ON
  }
}

// Message Router
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handleAsyncMessage = async () => {
    switch (message.action) {
      case 'LOG_EVENT': {
        const tabId = sender.tab ? sender.tab.id : null;
        const tabUrl = sender.tab ? sender.tab.url : message.event?.frameUrl;

        const enabled = await isTabEnabled(tabId, tabUrl);
        if (!enabled) {
          return { success: false, reason: 'Monitoring disabled for this page' };
        }

        const tabTitle = sender.tab ? sender.tab.title : null;

        const eventToSave = {
          ...message.event,
          tabId,
          tabTitle,
          tabUrl
        };

        const eventId = await EventStorage.addEvent(eventToSave);

        if (tabId) {
          const current = tabEventCounts.get(tabId) || 0;
          tabEventCounts.set(tabId, current + 1);
          updateBadge(tabId, tabUrl);
        }

        return { success: true, eventId };
      }

      case 'GET_TAB_STATUS': {
        const { tabId, tabUrl } = message;
        const enabled = await isTabEnabled(tabId, tabUrl);
        const globalEnabled = await EventStorage.getSetting('isLoggingEnabled', false);
        const tabSpecific = tabId ? enabledTabs.has(tabId) : false;
        const domainSpecific = tabUrl ? enabledDomains.has(getDomain(tabUrl)) : false;

        return {
          success: true,
          status: {
            isEnabled: enabled,
            globalEnabled,
            tabSpecific,
            domainSpecific
          }
        };
      }

      case 'TOGGLE_TAB_LOGGING': {
        const { tabId, tabUrl, enable } = message;
        const domain = tabUrl ? getDomain(tabUrl) : null;

        if (enable) {
          if (tabId) enabledTabs.add(tabId);
          if (domain) enabledDomains.add(domain);
        } else {
          if (tabId) enabledTabs.delete(tabId);
          if (domain) enabledDomains.delete(domain);
        }

        if (tabId) updateBadge(tabId, tabUrl);

        return { success: true, isEnabled: enable };
      }

      case 'GET_EVENTS': {
        const events = await EventStorage.getEvents(message.options || {});
        return { success: true, events };
      }

      case 'GET_STATS': {
        const stats = await EventStorage.getStats();
        const retentionDays = await EventStorage.getSetting('retentionDays', DEFAULT_RETENTION_DAYS);
        const isLoggingEnabled = await EventStorage.getSetting('isLoggingEnabled', false);
        return { success: true, stats: { ...stats, retentionDays, isLoggingEnabled } };
      }

      case 'CLEANUP_OLD_EVENTS': {
        const days = message.retentionDays !== undefined ? message.retentionDays : await EventStorage.getSetting('retentionDays', DEFAULT_RETENTION_DAYS);
        const count = await EventStorage.cleanupOldEvents(days);
        return { success: true, deletedCount: count };
      }

      case 'CLEAR_ALL_EVENTS': {
        await EventStorage.clearAllEvents();
        tabEventCounts.clear();
        return { success: true };
      }

      case 'GET_SETTINGS': {
        const retentionDays = await EventStorage.getSetting('retentionDays', DEFAULT_RETENTION_DAYS);
        const isLoggingEnabled = await EventStorage.getSetting('isLoggingEnabled', false);
        const customEvents = await EventStorage.getSetting('customEvents', ['analytics_track', 'state_change']);
        const theme = await EventStorage.getSetting('theme', 'midnight');
        return { success: true, settings: { retentionDays, isLoggingEnabled, customEvents, theme } };
      }

      case 'SAVE_SETTINGS': {
        const { retentionDays, isLoggingEnabled, customEvents, theme } = message.settings;
        if (retentionDays !== undefined) await EventStorage.setSetting('retentionDays', retentionDays);
        if (isLoggingEnabled !== undefined) await EventStorage.setSetting('isLoggingEnabled', isLoggingEnabled);
        if (customEvents !== undefined) await EventStorage.setSetting('customEvents', customEvents);
        if (theme !== undefined) await EventStorage.setSetting('theme', theme);

        if (retentionDays !== undefined) {
          runAutoCleanup();
        }

        return { success: true };
      }

      default:
        return { success: false, error: 'Unknown action' };
    }
  };

  handleAsyncMessage().then(sendResponse).catch((err) => {
    sendResponse({ success: false, error: err.message });
  });

  return true;
});

// Update tab badge on navigation
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'loading') {
    tabEventCounts.set(tabId, 0);
    updateBadge(tabId, tab.url);
  }
});
