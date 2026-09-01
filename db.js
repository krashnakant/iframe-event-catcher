/**
 * IndexedDB storage engine for IFrame & Custom Event Catcher
 */
const DB_NAME = 'IframeEventCatcherDB';
const DB_VERSION = 1;

export class EventStorage {
  static dbPromise = null;

  static getDB() {
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
          const db = event.target.result;
          
          // Events Object Store
          if (!db.objectStoreNames.contains('events')) {
            const eventStore = db.createObjectStore('events', { keyPath: 'id', autoIncrement: true });
            eventStore.createIndex('timestamp', 'timestamp', { unique: false });
            eventStore.createIndex('eventType', 'eventType', { unique: false });
            eventStore.createIndex('origin', 'origin', { unique: false });
            eventStore.createIndex('tabId', 'tabId', { unique: false });
            eventStore.createIndex('isIframe', 'isIframe', { unique: false });
          }

          // Settings Object Store
          if (!db.objectStoreNames.contains('settings')) {
            db.createObjectStore('settings', { keyPath: 'key' });
          }
        };

        request.onsuccess = (event) => resolve(event.target.result);
        request.onerror = (event) => reject(event.target.error);
      });
    }
    return this.dbPromise;
  }

  /**
   * Save a single event entry into IndexedDB
   */
  static async addEvent(eventData) {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('events', 'readwrite');
      const store = tx.objectStore('events');
      
      const record = {
        ...eventData,
        timestamp: eventData.timestamp || Date.now()
      };

      const req = store.add(record);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Get events with optional filters, pagination, and sorting
   */
  static async getEvents(options = {}) {
    const {
      limit = 200,
      offset = 0,
      eventType = null,
      searchQuery = '',
      isIframe = null,
      tabId = null,
      startTime = null,
      endTime = null,
      sortOrder = 'desc' // 'asc' or 'desc'
    } = options;

    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('events', 'readonly');
      const store = tx.objectStore('events');
      const index = store.index('timestamp');

      const results = [];
      const cursorDirection = sortOrder === 'desc' ? 'prev' : 'next';

      let range = null;
      if (startTime && endTime) {
        range = IDBKeyRange.bound(startTime, endTime);
      } else if (startTime) {
        range = IDBKeyRange.lowerBound(startTime);
      } else if (endTime) {
        range = IDBKeyRange.upperBound(endTime);
      }

      let skipped = 0;
      const req = index.openCursor(range, cursorDirection);

      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (!cursor) {
          return resolve(results);
        }

        const value = cursor.value;

        // Apply filters
        let match = true;

        if (eventType && eventType !== 'all' && value.eventType !== eventType) {
          match = false;
        }

        if (isIframe !== null && isIframe !== undefined && value.isIframe !== isIframe) {
          match = false;
        }

        if (tabId !== null && tabId !== undefined && value.tabId !== tabId) {
          match = false;
        }

        if (searchQuery && searchQuery.trim() !== '') {
          const q = searchQuery.toLowerCase().trim();
          const eventStr = JSON.stringify(value).toLowerCase();
          if (!eventStr.includes(q)) {
            match = false;
          }
        }

        if (match) {
          if (skipped < offset) {
            skipped++;
          } else {
            results.push(value);
            if (results.length >= limit) {
              return resolve(results);
            }
          }
        }

        cursor.continue();
      };

      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Delete events older than specified threshold (in milliseconds)
   */
  static async cleanupOldEvents(retentionDays = 7) {
    if (!retentionDays || retentionDays <= 0) return 0; // 0 means keep forever

    const db = await this.getDB();
    const cutoffTime = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);

    return new Promise((resolve, reject) => {
      const tx = db.transaction('events', 'readwrite');
      const store = tx.objectStore('events');
      const index = store.index('timestamp');
      const range = IDBKeyRange.upperBound(cutoffTime, true);

      let deletedCount = 0;
      const req = index.openCursor(range);

      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          store.delete(cursor.primaryKey);
          deletedCount++;
          cursor.continue();
        } else {
          resolve(deletedCount);
        }
      };

      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Clear all stored logs
   */
  static async clearAllEvents() {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('events', 'readwrite');
      const store = tx.objectStore('events');
      const req = store.clear();
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Get total count of stored events and total storage statistics
   */
  static async getStats() {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('events', 'readonly');
      const store = tx.objectStore('events');
      const countReq = store.count();

      countReq.onsuccess = () => {
        const count = countReq.result;
        
        // Get oldest and newest record timestamp
        const index = store.index('timestamp');
        let oldest = null;
        let newest = null;

        const firstReq = index.openCursor(null, 'next');
        firstReq.onsuccess = (e1) => {
          const c1 = e1.target.result;
          if (c1) oldest = c1.value.timestamp;

          const lastReq = index.openCursor(null, 'prev');
          lastReq.onsuccess = (e2) => {
            const c2 = e2.target.result;
            if (c2) newest = c2.value.timestamp;

            resolve({
              totalEvents: count,
              oldestTimestamp: oldest,
              newestTimestamp: newest
            });
          };
        };
      };

      countReq.onerror = () => reject(countReq.error);
    });
  }

  /**
   * Get or set setting key
   */
  static async getSetting(key, defaultValue = null) {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('settings', 'readonly');
      const store = tx.objectStore('settings');
      const req = store.get(key);
      req.onsuccess = () => {
        if (req.result !== undefined) {
          resolve(req.result.value);
        } else {
          resolve(defaultValue);
        }
      };
      req.onerror = () => reject(req.error);
    });
  }

  static async setSetting(key, value) {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('settings', 'readwrite');
      const store = tx.objectStore('settings');
      const req = store.put({ key, value });
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }
}
