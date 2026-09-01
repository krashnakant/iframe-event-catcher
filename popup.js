import { initTheme, applyTheme } from './theme.js';

/**
 * Popup Script
 * Disabled by default; user explicitly clicks to enable monitoring on current page/tab.
 */
document.addEventListener('DOMContentLoaded', async () => {
  const globalToggle = document.getElementById('globalToggle');
  const statusBadge = document.getElementById('statusBadge');
  const statusText = document.getElementById('statusText');
  const retentionPill = document.getElementById('retentionPill');
  const enablePageBtn = document.getElementById('enablePageBtn');
  const currentTabEventsEl = document.getElementById('currentTabEvents');
  const totalDbEventsEl = document.getElementById('totalDbEvents');
  const activeTabUrlEl = document.getElementById('activeTabUrl');
  const openDashboardBtn = document.getElementById('openDashboardBtn');
  const clearLogsBtn = document.getElementById('clearLogsBtn');
  const cleanOldBtn = document.getElementById('cleanOldBtn');
  const themeSelect = document.getElementById('themeSelect');

  // Initialize Theme
  const currentTheme = await initTheme();
  if (themeSelect) themeSelect.value = currentTheme;

  if (themeSelect) {
    themeSelect.addEventListener('change', async () => {
      const selectedTheme = themeSelect.value;
      applyTheme(selectedTheme);
      await chrome.runtime.sendMessage({
        action: 'SAVE_SETTINGS',
        settings: { theme: selectedTheme }
      });
    });
  }

  let activeTab = null;
  let isPageEnabled = false;

  // Load Active Tab Context
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  activeTab = tabs[0] || null;

  if (activeTab) {
    activeTabUrlEl.textContent = activeTab.url || 'Chrome Internal Page';
  } else {
    activeTabUrlEl.textContent = 'Unknown Tab';
  }

  async function refreshData() {
    try {
      // 1. Fetch Tab Status
      if (activeTab && activeTab.id) {
        const tabStatusRes = await chrome.runtime.sendMessage({
          action: 'GET_TAB_STATUS',
          tabId: activeTab.id,
          tabUrl: activeTab.url
        });

        if (tabStatusRes && tabStatusRes.success) {
          const { status } = tabStatusRes;
          isPageEnabled = status.isEnabled;
          globalToggle.checked = status.globalEnabled;
          updatePageStatusUI(isPageEnabled);
        }
      }

      // 2. Fetch Stats & DB Counts
      const statsRes = await chrome.runtime.sendMessage({ action: 'GET_STATS' });
      if (statsRes && statsRes.success) {
        const { stats } = statsRes;
        totalDbEventsEl.textContent = stats.totalEvents || 0;
        
        const days = stats.retentionDays;
        if (days === 7) retentionPill.textContent = 'Retention: 1 Week';
        else if (days === 1) retentionPill.textContent = 'Retention: 1 Day';
        else if (days === 3) retentionPill.textContent = 'Retention: 3 Days';
        else if (days > 0) retentionPill.textContent = `Retention: ${days} Days`;
        else retentionPill.textContent = 'Retention: Unlimited';
      }

      // 3. Fetch Tab Events Captured
      if (activeTab && activeTab.id) {
        const tabEventsRes = await chrome.runtime.sendMessage({
          action: 'GET_EVENTS',
          options: { tabId: activeTab.id, limit: 1000 }
        });
        if (tabEventsRes && tabEventsRes.success) {
          currentTabEventsEl.textContent = tabEventsRes.events.length;
        }
      }
    } catch (err) {
      console.error('Error refreshing popup data:', err);
    }
  }

  function updatePageStatusUI(enabled) {
    if (enabled) {
      statusBadge.classList.remove('disabled');
      statusText.textContent = 'Active on Page';
      enablePageBtn.classList.add('active');
      enablePageBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
        Monitoring Active (Click to Pause)
      `;
    } else {
      statusBadge.classList.add('disabled');
      statusText.textContent = 'Disabled for Page';
      enablePageBtn.classList.remove('active');
      enablePageBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
        Enable Catching on this Page
      `;
    }
  }

  // Handle Enable for Page Button Click
  enablePageBtn.addEventListener('click', async () => {
    if (!activeTab || !activeTab.id) return;
    const nextState = !isPageEnabled;

    await chrome.runtime.sendMessage({
      action: 'TOGGLE_TAB_LOGGING',
      tabId: activeTab.id,
      tabUrl: activeTab.url,
      enable: nextState
    });

    isPageEnabled = nextState;
    updatePageStatusUI(isPageEnabled);
    await refreshData();
  });

  // Handle Global Always-On Toggle
  globalToggle.addEventListener('change', async () => {
    const isLoggingEnabled = globalToggle.checked;
    await chrome.runtime.sendMessage({
      action: 'SAVE_SETTINGS',
      settings: { isLoggingEnabled }
    });
    await refreshData();
  });

  // Open Full Dashboard Page
  openDashboardBtn.addEventListener('click', () => {
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      window.open(chrome.runtime.getURL('dashboard.html'));
    }
  });

  // Clear Logs
  clearLogsBtn.addEventListener('click', async () => {
    if (confirm('Are you sure you want to clear all stored event logs?')) {
      await chrome.runtime.sendMessage({ action: 'CLEAR_ALL_EVENTS' });
      await refreshData();
    }
  });

  // Auto Clean Now
  cleanOldBtn.addEventListener('click', async () => {
    const res = await chrome.runtime.sendMessage({ action: 'CLEANUP_OLD_EVENTS' });
    if (res && res.success) {
      alert(`Auto-clean complete! Purged ${res.deletedCount} old events.`);
      await refreshData();
    }
  });

  // Initial Load
  await refreshData();
});
