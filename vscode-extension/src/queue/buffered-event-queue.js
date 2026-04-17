const { mkdir, readFile, writeFile, rename } = require('fs/promises');
const path = require('path');

class BufferedEventQueue {
  constructor(options) {
    this.apiClient = options.apiClient;
    this.logger = options.logger || console;
    this.flushIntervalMs = options.flushIntervalMs ?? 10000;
    this.maxBatchSize = options.maxBatchSize ?? 50;
    this.maxBufferSize = options.maxBufferSize ?? 1000;
    this.storageDir = options.storageDir;
    this.storagePath = path.join(this.storageDir, 'vscode-heartbeat-queue.json');
    this.buffer = [];
    this.droppedEvents = 0;
    this.lastOverflowNotifiedAt = 0;
    this.onOverflow = options.onOverflow || null;
    this.timer = null;
    this.flushing = false;
    this.backoffMs = 0;
    this.nextFlushAt = 0;
    this._persistChain = Promise.resolve();
    this._persistDebounceTimer = null;
    this.config = {
      apiBase: options.apiBase,
      pairingKey: options.pairingKey,
      enabled: options.enabled ?? true
    };
  }

  async init() {
    await mkdir(this.storageDir, { recursive: true });
    let loaded = false;
    // Try main file first
    try {
      const raw = await readFile(this.storagePath, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.events)) {
        const todayKey = this.getTodayKey();
        this.buffer = parsed.events.filter(event => {
          if (!event || !event.time) return false;
          const eventDate = new Date(event.time);
          const eventKey = this.formatDateKey(eventDate);
          return eventKey === todayKey;
        });
        if (this.buffer.length < parsed.events.length) {
          console.log(`[Saul Queue] Filtered ${parsed.events.length - this.buffer.length} old events from previous days`);
        }
        if (typeof parsed.droppedEvents === 'number' && parsed.droppedEvents > 0) {
          this.droppedEvents = parsed.droppedEvents;
        }
        loaded = true;
      }
    } catch {
      // Main file missing or corrupted — try .tmp fallback
      try {
        const tmpPath = `${this.storagePath}.tmp`;
        const raw = await readFile(tmpPath, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.events)) {
          const todayKey = this.getTodayKey();
          this.buffer = parsed.events.filter(event => {
            if (!event || !event.time) return false;
            const eventDate = new Date(event.time);
            const eventKey = this.formatDateKey(eventDate);
            return eventKey === todayKey;
          });
          if (typeof parsed.droppedEvents === 'number' && parsed.droppedEvents > 0) {
            this.droppedEvents = parsed.droppedEvents;
          }
          loaded = true;
          this.logger.warn('[saul-goodman-vscode] queue file corrupted, recovered from .tmp fallback');
        }
      } catch {
        // Both files missing or corrupted
      }
    }
    if (!loaded) {
      this.buffer = [];
    }
    await this.persist();
  }

  updateConfig(nextConfig) {
    this.config = { ...this.config, ...nextConfig };
  }

  start() {
    if (this.timer) {
      clearInterval(this.timer);
    }
    this.timer = setInterval(() => this.flush(), this.flushIntervalMs);
  }

  async stop() {
    await this.flush();
    await this.persist();
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  enqueue(event) {
    if (!event) {
      return;
    }
    console.log('[Saul Queue] Enqueued:', event.entityType, '| Buffer size:', this.buffer.length + 1);
    this.buffer.push(event);
    const warningThreshold = Math.floor(this.maxBufferSize * 0.8);
    if (this.buffer.length === warningThreshold && this.onOverflow) {
      this.logger.warn(`[saul-goodman-vscode] buffer at 80% capacity (${warningThreshold}/${this.maxBufferSize}) — daemon may be offline`);
      const now = Date.now();
      if (now - this.lastOverflowNotifiedAt > 5 * 60 * 1000) {
        this.lastOverflowNotifiedAt = now;
        this.onOverflow(-1);
      }
    }
    if (this.buffer.length > this.maxBufferSize) {
      const dropped = this.buffer.length - this.maxBufferSize;
      this.droppedEvents += dropped;
      this.logger.warn(`[saul-goodman-vscode] buffer overflow: ${dropped} heartbeats discarded (total: ${this.droppedEvents})`);
      this.buffer.splice(0, dropped);
      const now = Date.now();
      if (this.onOverflow && now - this.lastOverflowNotifiedAt > 5 * 60 * 1000) {
        this.lastOverflowNotifiedAt = now;
        this.onOverflow(this.droppedEvents);
      }
    }
    this.persistDebounced();
    if (this.buffer.length >= this.maxBatchSize) {
      console.log('[Saul Queue] Buffer full, flushing', this.buffer.length, 'events');
      void this.flush();
    }
  }

  async flush() {
    if (this.flushing) {
      return;
    }
    if (!this.config.enabled) {
      return;
    }
    if (!this.config.apiBase || !this.config.pairingKey) {
      return;
    }
    if (!this.buffer.length) {
      return;
    }
    const now = Date.now();
    if (now < this.nextFlushAt) {
      return;
    }

    const batch = this.buffer.slice(0, this.maxBatchSize);
    const types = batch.reduce((acc, e) => {
      acc[e.entityType] = (acc[e.entityType] || 0) + 1;
      return acc;
    }, {});
    console.log('[Saul Queue] Flushing batch:', batch.length, 'events |', JSON.stringify(types));
    
    this.flushing = true;
    try {
      await this.apiClient.postHeartbeats(this.config.apiBase, this.config.pairingKey, batch);
      console.log('[Saul Queue] ✓ Flush successful');
      this.buffer.splice(0, batch.length);
      if (this.droppedEvents > 0) {
        this.logger.warn(`[saul-goodman-vscode] connection restored, ${this.droppedEvents} heartbeats were lost during offline period`);
        this.droppedEvents = 0;
      }
      this.backoffMs = 0;
      this.nextFlushAt = 0;
      const persisted = await this.persist();
      if (!persisted) {
        console.warn('[Saul Queue] Post-flush persist failed — scheduling immediate retry');
        void this.persist();
      }
    } catch (error) {
      console.error('[Saul Queue] ✗ Flush failed:', error.message);
      this.logger.warn('[saul-goodman-vscode] failed to flush heartbeats', error);
      this.backoffMs = this.backoffMs ? Math.min(this.backoffMs * 2, 120000) : 2000;
      this.nextFlushAt = Date.now() + this.backoffMs;
    } finally {
      this.flushing = false;
    }
  }

  getDroppedEvents() {
    return this.droppedEvents;
  }

  persistDebounced() {
    if (this._persistDebounceTimer) {
      clearTimeout(this._persistDebounceTimer);
    }
    this._persistDebounceTimer = setTimeout(() => {
      this._persistDebounceTimer = null;
      void this.persist();
    }, 500);
  }

  async persist() {
    let ok = false;
    const op = async () => {
      try {
        await mkdir(this.storageDir, { recursive: true });
        const payload = { version: 1, events: this.buffer, droppedEvents: this.droppedEvents };
        const tmpPath = `${this.storagePath}.tmp`;
        await writeFile(tmpPath, JSON.stringify(payload, null, 2), 'utf8');
        await rename(tmpPath, this.storagePath);
        ok = true;
      } catch (error) {
        this.logger.warn('[saul-goodman-vscode] failed to persist queue', error);
      }
    };
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('persist timeout')), 10000)
    );
    const work = this._persistChain.then(op, op);
    this._persistChain = work.catch(() => {});
    try {
      await Promise.race([work, timeout]);
    } catch (error) {
      this.logger.warn('[saul-goodman-vscode] persist timed out or failed', error);
    }
    return ok;
  }

  getTodayKey() {
    const now = new Date();
    return this.formatDateKey(now);
  }

  formatDateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  async clearOldEvents() {
    const todayKey = this.getTodayKey();
    const before = this.buffer.length;
    this.buffer = this.buffer.filter(event => {
      if (!event || !event.time) return false;
      const eventDate = new Date(event.time);
      const eventKey = this.formatDateKey(eventDate);
      return eventKey === todayKey;
    });
    const removed = before - this.buffer.length;
    if (removed > 0) {
      console.log(`[Saul Queue] Cleared ${removed} events from previous days`);
      await this.persist();
    }
    return removed;
  }
}

module.exports = {
  BufferedEventQueue
};
