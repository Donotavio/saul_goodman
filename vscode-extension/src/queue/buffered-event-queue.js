const { mkdir, readFile, writeFile } = require('fs/promises');
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
    this.timer = null;
    this.flushing = false;
    this.backoffMs = 0;
    this.nextFlushAt = 0;
    this.config = {
      apiBase: options.apiBase,
      pairingKey: options.pairingKey,
      enabled: options.enabled ?? true
    };
  }

  async init() {
    await mkdir(this.storageDir, { recursive: true });
    try {
      const raw = await readFile(this.storagePath, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.events)) {
        this.buffer = parsed.events;
      }
    } catch {
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

  stop() {
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
    if (this.buffer.length > this.maxBufferSize) {
      this.buffer.splice(0, this.buffer.length - this.maxBufferSize);
    }
    void this.persist();
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
      this.backoffMs = 0;
      this.nextFlushAt = 0;
      await this.persist();
    } catch (error) {
      console.error('[Saul Queue] ✗ Flush failed:', error.message);
      this.logger.warn('[saul-goodman-vscode] failed to flush heartbeats', error);
      this.backoffMs = this.backoffMs ? Math.min(this.backoffMs * 2, 120000) : 2000;
      this.nextFlushAt = Date.now() + this.backoffMs;
    } finally {
      this.flushing = false;
    }
  }

  async persist() {
    try {
      await mkdir(this.storageDir, { recursive: true });
      const payload = { version: 1, events: this.buffer };
      await writeFile(this.storagePath, JSON.stringify(payload, null, 2), 'utf8');
    } catch (error) {
      this.logger.warn('[saul-goodman-vscode] failed to persist queue', error);
    }
  }
}

module.exports = {
  BufferedEventQueue
};
