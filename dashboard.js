import { initTheme, applyTheme } from './theme.js';

/**
 * Dashboard Controller Script
 */
document.addEventListener('DOMContentLoaded', async () => {
  // Theme Management
  const dashThemeSelect = document.getElementById('dashThemeSelect');
  const themeSwatches = document.querySelectorAll('.theme-swatch');

  const currentTheme = await initTheme();
  updateThemeUI(currentTheme);

  async function handleThemeChange(newTheme) {
    applyTheme(newTheme);
    updateThemeUI(newTheme);
    await chrome.runtime.sendMessage({
      action: 'SAVE_SETTINGS',
      settings: { theme: newTheme }
    });
  }

  function updateThemeUI(tId) {
    if (dashThemeSelect) dashThemeSelect.value = tId;
    themeSwatches.forEach(swatch => {
      if (swatch.dataset.themeId === tId) {
        swatch.style.borderColor = 'var(--accent-violet)';
      } else {
        swatch.style.borderColor = 'rgba(255,255,255,0.1)';
      }
    });
  }

  if (dashThemeSelect) {
    dashThemeSelect.addEventListener('change', () => {
      handleThemeChange(dashThemeSelect.value);
    });
  }

  themeSwatches.forEach(swatch => {
    swatch.addEventListener('click', () => {
      const themeId = swatch.dataset.themeId;
      handleThemeChange(themeId);
    });
  });

  // Navigation Tabs
  const navTabs = document.querySelectorAll('.nav-tab');
  const tabPanels = document.querySelectorAll('.tab-panel');

  navTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;
      navTabs.forEach(t => t.classList.remove('active'));
      tabPanels.forEach(p => p.classList.remove('active'));

      tab.classList.add('active');
      document.getElementById(`tab-${target}`).classList.add('active');

      if (target === 'settings') {
        loadSettingsAndStats();
      }
    });
  });

  // Global Status Navbar Pill
  const globalStatusPill = document.getElementById('globalStatusPill');
  const globalStatusText = document.getElementById('globalStatusText');

  async function updateNavbarStatus() {
    const statsRes = await chrome.runtime.sendMessage({ action: 'GET_STATS' });
    if (statsRes && statsRes.success) {
      if (statsRes.stats.isLoggingEnabled) {
        globalStatusPill.style.background = 'rgba(16, 185, 129, 0.15)';
        globalStatusPill.style.borderColor = 'rgba(16, 185, 129, 0.3)';
        globalStatusPill.style.color = '#10b981';
        globalStatusText.textContent = 'Global Monitoring Always-On';
      } else {
        globalStatusPill.style.background = 'rgba(100, 116, 139, 0.15)';
        globalStatusPill.style.borderColor = 'rgba(100, 116, 139, 0.3)';
        globalStatusPill.style.color = '#cbd5e1';
        globalStatusText.textContent = 'Disabled by Default (Click Enable on Page in Popup)';
      }
    }
  }

  // ================= TAB 1: STREAM ENGINE =================
  const eventListBody = document.getElementById('eventListBody');
  const inspectorBody = document.getElementById('inspectorBody');
  const searchInput = document.getElementById('searchInput');
  const eventTypeFilter = document.getElementById('eventTypeFilter');
  const frameFilter = document.getElementById('frameFilter');
  const autoRefreshBtn = document.getElementById('autoRefreshBtn');
  const exportJsonBtn = document.getElementById('exportJsonBtn');
  const exportCsvBtn = document.getElementById('exportCsvBtn');
  const clearStreamBtn = document.getElementById('clearStreamBtn');
  const copyPayloadBtn = document.getElementById('copyPayloadBtn');

  let isAutoRefresh = true;
  let refreshTimer = null;
  let loadedEvents = [];
  let selectedEvent = null;

  async function fetchStreamEvents() {
    const searchQuery = searchInput.value.trim();
    const eventType = eventTypeFilter.value;
    const frameVal = frameFilter.value;

    let isIframe = null;
    if (frameVal === 'iframe') isIframe = true;
    if (frameVal === 'main') isIframe = false;

    try {
      const res = await chrome.runtime.sendMessage({
        action: 'GET_EVENTS',
        options: {
          limit: 300,
          searchQuery,
          eventType,
          isIframe,
          sortOrder: 'desc'
        }
      });

      if (res && res.success) {
        loadedEvents = res.events;
        renderEventList(loadedEvents);
      }
    } catch (err) {
      console.error('Error fetching stream events:', err);
    }
  }

  const expandedRowIds = new Set();

  function renderEventList(events) {
    if (!events || events.length === 0) {
      eventListBody.innerHTML = `
        <div class="empty-state">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
          <h3>No Events Caught Yet</h3>
          <p>By default, monitoring is disabled for pages until you click <strong>"Enable Catching on this Page"</strong> in the extension popup.</p>
        </div>
      `;
      return;
    }

    eventListBody.innerHTML = '';

    events.forEach(evt => {
      const isExpanded = expandedRowIds.has(evt.id);
      const isSelected = selectedEvent && selectedEvent.id === evt.id;

      const row = document.createElement('div');
      row.className = `event-row ${isSelected ? 'selected' : ''} ${isExpanded ? 'expanded' : ''}`;
      
      const timeStr = new Date(evt.timestamp).toLocaleTimeString();
      const sourceBadge = evt.isIframe 
        ? `<span class="badge-source iframe">[IFRAME]</span>`
        : `<span class="badge-source main">[MAIN]</span>`;

      const typeClass = (evt.eventType || '').toLowerCase();
      const typeBadge = `<span class="badge-type ${typeClass}">${evt.eventType}</span>`;

      const displayOrigin = evt.frameUrl || evt.origin || 'Unknown Origin';
      const detailsJsonStr = JSON.stringify(evt.details || {});
      const payloadSnippet = detailsJsonStr.length > 60 ? detailsJsonStr.substring(0, 60) + '...' : detailsJsonStr;
      const highlightedJson = syntaxHighlightJson(JSON.stringify(evt, null, 2));

      row.innerHTML = `
        <div class="event-row-header">
          <span class="col col-expand">
            <span class="expand-chevron">▶</span>
          </span>
          <span class="col col-time">${timeStr}</span>
          <span class="col col-source">${sourceBadge}</span>
          <span class="col col-type">${typeBadge}</span>
          <span class="col col-name" title="${evt.eventName}">${evt.eventName || evt.eventType}</span>
          <span class="col col-origin" title="${payloadSnippet} | ${displayOrigin}">
            <span style="color:#a5f3fc; font-family:var(--font-mono); margin-right:6px;">${payloadSnippet}</span>
            <span style="color:var(--text-muted); font-size:10px;">(${displayOrigin})</span>
          </span>
          <span class="col col-actions">
            <button class="btn-row-copy" title="Copy Log JSON to Clipboard">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            </button>
          </span>
        </div>
        <div class="event-row-drawer">
          <div class="drawer-header">
            <span>Expanded Context for Event ID #${evt.id}</span>
            <button class="btn btn-xs btn-outline drawer-copy-btn">Copy Full Event JSON</button>
          </div>
          <div class="drawer-payload-box">${highlightedJson}</div>
        </div>
      `;

      // Header row click -> select event & toggle inline expansion
      const headerEl = row.querySelector('.event-row-header');
      headerEl.addEventListener('click', (e) => {
        // If copy button clicked, ignore row select/expand
        if (e.target.closest('.btn-row-copy')) return;

        document.querySelectorAll('.event-row').forEach(r => r.classList.remove('selected'));
        row.classList.add('selected');
        selectedEvent = evt;
        renderInspector(evt);

        // Toggle Expand
        if (expandedRowIds.has(evt.id)) {
          expandedRowIds.delete(evt.id);
          row.classList.remove('expanded');
        } else {
          expandedRowIds.add(evt.id);
          row.classList.add('expanded');
        }
      });

      // Direct Row Copy Button
      const rowCopyBtn = row.querySelector('.btn-row-copy');
      rowCopyBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(JSON.stringify(evt, null, 2));
        rowCopyBtn.classList.add('copied');
        rowCopyBtn.innerHTML = `✓`;
        setTimeout(() => {
          rowCopyBtn.classList.remove('copied');
          rowCopyBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
        }, 1200);
      });

      // Drawer Copy Button
      const drawerCopyBtn = row.querySelector('.drawer-copy-btn');
      if (drawerCopyBtn) {
        drawerCopyBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          navigator.clipboard.writeText(JSON.stringify(evt, null, 2));
          drawerCopyBtn.innerText = 'Copied!';
          setTimeout(() => { drawerCopyBtn.innerText = 'Copy Full Event JSON'; }, 1200);
        });
      }

      eventListBody.appendChild(row);
    });
  }

  function renderInspector(evt) {
    if (!evt) return;

    const localTime = new Date(evt.timestamp).toLocaleString();
    const utcTime = new Date(evt.timestamp).toUTCString();
    const formattedJson = JSON.stringify(evt, null, 2);
    const highlightedJson = syntaxHighlightJson(formattedJson);

    inspectorBody.innerHTML = `
      <div class="payload-meta">
        <div class="meta-row">
          <span class="meta-key">Event Name:</span>
          <span class="meta-val" style="color:#6366f1; font-weight:bold;">${evt.eventName || evt.eventType}</span>
        </div>
        <div class="meta-row">
          <span class="meta-key">Event Type:</span>
          <span class="meta-val">${evt.eventType}</span>
        </div>
        <div class="meta-row">
          <span class="meta-key">Frame Context:</span>
          <span class="meta-val">${evt.isIframe ? 'IFrame Window' : 'Main Top Window'}</span>
        </div>
        <div class="meta-row">
          <span class="meta-key">Frame URL:</span>
          <span class="meta-val">${evt.frameUrl || 'N/A'}</span>
        </div>
        <div class="meta-row">
          <span class="meta-key">Tab Title:</span>
          <span class="meta-val">${evt.tabTitle || evt.title || 'N/A'}</span>
        </div>
        <div class="meta-row">
          <span class="meta-key">Local Time:</span>
          <span class="meta-val">${localTime}</span>
        </div>
        <div class="meta-row">
          <span class="meta-key">UTC Time:</span>
          <span class="meta-val">${utcTime}</span>
        </div>
      </div>
      <pre class="json-view"><code>${highlightedJson}</code></pre>
    `;
  }

  function syntaxHighlightJson(jsonStr) {
    jsonStr = jsonStr.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return jsonStr.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, function (match) {
      let cls = 'json-number';
      if (/^"/.test(match)) {
        if (/:$/.test(match)) {
          cls = 'json-key';
        } else {
          cls = 'json-string';
        }
      } else if (/true|false/.test(match)) {
        cls = 'json-boolean';
      } else if (/null/.test(match)) {
        cls = 'json-null';
      }
      return `<span class="${cls}">${match}</span>`;
    });
  }

  // Filter Listeners
  searchInput.addEventListener('input', fetchStreamEvents);
  eventTypeFilter.addEventListener('change', fetchStreamEvents);
  frameFilter.addEventListener('change', fetchStreamEvents);

  // Auto Refresh Toggle
  autoRefreshBtn.addEventListener('click', () => {
    isAutoRefresh = !isAutoRefresh;
    if (isAutoRefresh) {
      autoRefreshBtn.classList.add('active');
      autoRefreshBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
        Auto Refresh: ON
      `;
      startAutoRefresh();
    } else {
      autoRefreshBtn.classList.remove('active');
      autoRefreshBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>
        Auto Refresh: OFF
      `;
      stopAutoRefresh();
    }
  });

  function startAutoRefresh() {
    stopAutoRefresh();
    refreshTimer = setInterval(() => {
      fetchStreamEvents();
      updateNavbarStatus();
    }, 1500);
  }

  function stopAutoRefresh() {
    if (refreshTimer) clearInterval(refreshTimer);
  }

  // Copy Payload JSON
  copyPayloadBtn.addEventListener('click', () => {
    if (!selectedEvent) return alert('Please select an event first');
    navigator.clipboard.writeText(JSON.stringify(selectedEvent, null, 2));
    const origText = copyPayloadBtn.innerText;
    copyPayloadBtn.innerText = 'Copied!';
    setTimeout(() => { copyPayloadBtn.innerText = origText; }, 1500);
  });

  // Export JSON
  exportJsonBtn.addEventListener('click', () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(loadedEvents, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `iframe_events_export_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  });

  // Export CSV
  exportCsvBtn.addEventListener('click', () => {
    if (!loadedEvents || loadedEvents.length === 0) return alert('No events to export');
    
    const headers = ['ID', 'Timestamp', 'IsIframe', 'EventType', 'EventName', 'Origin', 'FrameUrl', 'Details'];
    const csvRows = [headers.join(',')];

    loadedEvents.forEach(e => {
      const row = [
        e.id,
        new Date(e.timestamp).toISOString(),
        e.isIframe ? 'true' : 'false',
        `"${(e.eventType || '').replace(/"/g, '""')}"`,
        `"${(e.eventName || '').replace(/"/g, '""')}"`,
        `"${(e.origin || '').replace(/"/g, '""')}"`,
        `"${(e.frameUrl || '').replace(/"/g, '""')}"`,
        `"${JSON.stringify(e.details || {}).replace(/"/g, '""')}"`
      ];
      csvRows.push(row.join(','));
    });

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.setAttribute('href', url);
    a.setAttribute('download', `iframe_events_${Date.now()}.csv`);
    a.click();
  });

  // Clear Stream
  clearStreamBtn.addEventListener('click', async () => {
    if (confirm('Clear all stored event logs from IndexedDB?')) {
      await chrome.runtime.sendMessage({ action: 'CLEAR_ALL_EVENTS' });
      selectedEvent = null;
      inspectorBody.innerHTML = '<div class="inspector-placeholder"><p>Select an event from the list on the left to inspect detailed frame context and JSON payload.</p></div>';
      await fetchStreamEvents();
    }
  });


  // ================= TAB 2: TEST SANDBOX ENGINE =================
  const testPostMessageText = document.getElementById('testPostMessageText');
  const sendParentToIframeBtn = document.getElementById('sendParentToIframeBtn');
  const sendIframeToParentBtn = document.getElementById('sendIframeToParentBtn');
  const customEventNameInput = document.getElementById('customEventNameInput');
  const fireCustomEventBtn = document.getElementById('fireCustomEventBtn');
  const createDynamicIframeBtn = document.getElementById('createDynamicIframeBtn');
  const dynamicIframeContainer = document.getElementById('dynamicIframeContainer');

  sendParentToIframeBtn.addEventListener('click', () => {
    try {
      const payload = JSON.parse(testPostMessageText.value);
      const iframe1 = document.getElementById('sandboxIframe1');
      if (iframe1 && iframe1.contentWindow) {
        iframe1.contentWindow.postMessage(payload, '*');
      }
    } catch (e) {
      alert('Invalid JSON in postMessage payload!');
    }
  });

  sendIframeToParentBtn.addEventListener('click', () => {
    try {
      const payload = JSON.parse(testPostMessageText.value);
      window.postMessage(payload, '*');
    } catch (e) {
      alert('Invalid JSON in postMessage payload!');
    }
  });

  fireCustomEventBtn.addEventListener('click', () => {
    const eventName = customEventNameInput.value.trim() || 'custom_test_event';
    const evt = new CustomEvent(eventName, {
      detail: {
        timestamp: Date.now(),
        triggeredBy: 'Sandbox Generator',
        status: 'active'
      },
      bubbles: true,
      cancelable: true
    });
    window.dispatchEvent(evt);
  });

  let dynamicIframeId = 1;
  createDynamicIframeBtn.addEventListener('click', () => {
    dynamicIframeContainer.innerHTML = '';
    const iframe = document.createElement('iframe');
    iframe.id = `dynamic_iframe_${dynamicIframeId++}`;
    iframe.srcdoc = `
      <!DOCTYPE html>
      <html>
      <body style="background:#0f172a; color:#10b981; font-family:sans-serif; padding:10px; font-size:12px;">
        <strong>Dynamic Iframe Loaded!</strong>
        <p>Created at ${new Date().toLocaleTimeString()}</p>
      </body>
      </html>
    `;
    dynamicIframeContainer.appendChild(iframe);
  });


  // ================= TAB 3: SETTINGS & RETENTION ENGINE =================
  const retentionSelect = document.getElementById('retentionSelect');
  const customEventsInput = document.getElementById('customEventsInput');
  const saveRetentionBtn = document.getElementById('saveRetentionBtn');
  const forceCleanupBtn = document.getElementById('forceCleanupBtn');
  const saveCustomEventsBtn = document.getElementById('saveCustomEventsBtn');
  const wipeDatabaseBtn = document.getElementById('wipeDatabaseBtn');
  const settingsTotalEvents = document.getElementById('settingsTotalEvents');
  const settingsOldestDate = document.getElementById('settingsOldestDate');
  const settingsNewestDate = document.getElementById('settingsNewestDate');

  async function loadSettingsAndStats() {
    const settingsRes = await chrome.runtime.sendMessage({ action: 'GET_SETTINGS' });
    if (settingsRes && settingsRes.success) {
      retentionSelect.value = String(settingsRes.settings.retentionDays);
      if (settingsRes.settings.customEvents) {
        customEventsInput.value = settingsRes.settings.customEvents.join(', ');
      }
      if (settingsRes.settings.theme) {
        applyTheme(settingsRes.settings.theme);
        updateThemeUI(settingsRes.settings.theme);
      }
    }

    const statsRes = await chrome.runtime.sendMessage({ action: 'GET_STATS' });
    if (statsRes && statsRes.success) {
      const s = statsRes.stats;
      settingsTotalEvents.textContent = s.totalEvents;
      settingsOldestDate.textContent = s.oldestTimestamp ? new Date(s.oldestTimestamp).toLocaleString() : 'None';
      settingsNewestDate.textContent = s.newestTimestamp ? new Date(s.newestTimestamp).toLocaleString() : 'None';
    }
  }

  saveRetentionBtn.addEventListener('click', async () => {
    const retentionDays = parseInt(retentionSelect.value, 10);
    await chrome.runtime.sendMessage({
      action: 'SAVE_SETTINGS',
      settings: { retentionDays }
    });
    alert(`Retention policy updated to ${retentionDays === 7 ? '1 Week' : (retentionDays === 0 ? 'Unlimited' : retentionDays + ' Days')}`);
    await loadSettingsAndStats();
  });

  forceCleanupBtn.addEventListener('click', async () => {
    const res = await chrome.runtime.sendMessage({ action: 'CLEANUP_OLD_EVENTS' });
    if (res && res.success) {
      alert(`Cleanup completed! Purged ${res.deletedCount} old events.`);
      await loadSettingsAndStats();
    }
  });

  saveCustomEventsBtn.addEventListener('click', async () => {
    const list = customEventsInput.value.split(',').map(s => s.trim()).filter(Boolean);
    await chrome.runtime.sendMessage({
      action: 'SAVE_SETTINGS',
      settings: { customEvents: list }
    });
    alert('Custom event filtering rules saved!');
  });

  wipeDatabaseBtn.addEventListener('click', async () => {
    if (confirm('PERMANENT WIPE: Delete all events in IndexedDB?')) {
      await chrome.runtime.sendMessage({ action: 'CLEAR_ALL_EVENTS' });
      await loadSettingsAndStats();
      alert('Database wiped clean.');
    }
  });

  // Initial stream start
  fetchStreamEvents();
  updateNavbarStatus();
  startAutoRefresh();
});
