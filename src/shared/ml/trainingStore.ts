import type { DomainBehaviorEvent } from './behaviorSignals.js';

export type TrainingSource = 'explicit' | 'implicit';

export interface SerializedSparseVector {
  indices: number[];
  values: number[];
}

export interface StoredTrainingExample {
  id?: number;
  createdAt: number;
  domain: string;
  source: TrainingSource;
  label: 0 | 1;
  weight: number;
  isHoldout: boolean;
  vector: SerializedSparseVector;
  v1Prediction: 0 | 1;
  v2Prediction: 0 | 1;
  v2Score: number;
}

export interface TrainingStoreConfig {
  dbName?: string;
  examplesStore?: string;
  behaviorStore?: string;
  metaStore?: string;
  version?: number;
}

export interface AddTrainingOptions {
  maxExamples: number;
  retentionMs: number;
  holdoutRatio: number;
  maxHoldout: number;
}

const DEFAULT_DB_NAME = 'sg-ml-training';
const DEFAULT_EXAMPLES_STORE = 'examples';
const DEFAULT_BEHAVIOR_STORE = 'behavior';
const DEFAULT_META_STORE = 'meta';
const DEFAULT_VERSION = 1;

/**
 * Stores trainable examples, holdout examples, behavior events and metadata in IndexedDB.
 */
export class MlTrainingStore {
  private readonly dbName: string;
  private readonly examplesStore: string;
  private readonly behaviorStore: string;
  private readonly metaStore: string;
  private readonly version: number;
  private dbPromise: Promise<IDBDatabase> | null = null;

  constructor(config?: TrainingStoreConfig) {
    this.dbName = config?.dbName ?? DEFAULT_DB_NAME;
    this.examplesStore = config?.examplesStore ?? DEFAULT_EXAMPLES_STORE;
    this.behaviorStore = config?.behaviorStore ?? DEFAULT_BEHAVIOR_STORE;
    this.metaStore = config?.metaStore ?? DEFAULT_META_STORE;
    this.version = config?.version ?? DEFAULT_VERSION;
  }

  async addTrainingExample(
    example: Omit<StoredTrainingExample, 'id' | 'isHoldout'>,
    options: AddTrainingOptions
  ): Promise<void> {
    const db = await this.open();
    await this.pruneExamples(Date.now() - options.retentionMs);

    const [totalSeen, holdoutCount, count] = await Promise.all([
      this.getMeta<number>('examples:totalSeen'),
      this.countHoldout(),
      this.countExamples()
    ]);

    const seen = (totalSeen ?? 0) + 1;
    const canUseHoldout = holdoutCount < options.maxHoldout;
    const isHoldout = canUseHoldout && Math.random() < options.holdoutRatio;
    const next: StoredTrainingExample = {
      ...example,
      isHoldout
    };

    if (count < options.maxExamples) {
      await this.addExample(next);
    } else {
      const replaceProbability = options.maxExamples / Math.max(seen, 1);
      if (Math.random() <= replaceProbability) {
        await this.replaceRandomExample(next);
      }
    }

    await this.setMeta('examples:totalSeen', seen);
  }

  async getHoldoutExamples(limit = 2000): Promise<StoredTrainingExample[]> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.examplesStore, 'readonly');
      const store = tx.objectStore(this.examplesStore);
      const request = store.getAll();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const entries = (request.result as StoredTrainingExample[])
          .filter((entry) => isHoldoutEntry(entry))
          .sort((a, b) => b.createdAt - a.createdAt)
          .slice(0, limit);
        resolve(entries);
      };
    });
  }

  async recordBehaviorEvent(event: DomainBehaviorEvent): Promise<void> {
    const db = await this.open();
    const payload = {
      ...event,
      createdAt: event.timestamp
    };
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(this.behaviorStore, 'readwrite');
      const store = tx.objectStore(this.behaviorStore);
      const request = store.add(payload);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async getBehaviorEvents(domain: string, sinceTimestamp: number): Promise<DomainBehaviorEvent[]> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.behaviorStore, 'readonly');
      const store = tx.objectStore(this.behaviorStore);
      const index = store.index('domainTimestamp');
      const range = IDBKeyRange.bound([domain, sinceTimestamp], [domain, Number.MAX_SAFE_INTEGER]);
      const request = index.getAll(range);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const rows = (request.result as Array<DomainBehaviorEvent & { createdAt: number }>) ?? [];
        resolve(rows.map((entry) => ({
          domain: entry.domain,
          timestamp: entry.timestamp,
          activeMs: entry.activeMs,
          interactionCount: entry.interactionCount,
          hasFeedLayout: entry.hasFeedLayout,
          hasAutoplayMedia: entry.hasAutoplayMedia,
          hasShortsPattern: entry.hasShortsPattern,
          audible: entry.audible,
          outOfSchedule: entry.outOfSchedule
        })));
      };
    });
  }

  async pruneBehavior(beforeTimestamp: number): Promise<void> {
    const db = await this.open();
    await deleteByIndexRange(db, this.behaviorStore, 'timestamp', IDBKeyRange.upperBound(beforeTimestamp));
  }

  async pruneExamples(beforeTimestamp: number): Promise<void> {
    const db = await this.open();
    await deleteByIndexRange(db, this.examplesStore, 'createdAt', IDBKeyRange.upperBound(beforeTimestamp));
  }

  async getMeta<T>(key: string): Promise<T | undefined> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.metaStore, 'readonly');
      const store = tx.objectStore(this.metaStore);
      const request = store.get(key);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const value = request.result as { value?: T } | undefined;
        resolve(value?.value);
      };
    });
  }

  async setMeta<T>(key: string, value: T): Promise<void> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.metaStore, 'readwrite');
      const store = tx.objectStore(this.metaStore);
      const request = store.put({ key, value });
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  private async countExamples(): Promise<number> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.examplesStore, 'readonly');
      const store = tx.objectStore(this.examplesStore);
      const request = store.count();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result ?? 0);
    });
  }

  private async countHoldout(): Promise<number> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.examplesStore, 'readonly');
      const store = tx.objectStore(this.examplesStore);
      const request = store.openCursor();
      let total = 0;
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) {
          resolve(total);
          return;
        }
        if (isHoldoutEntry(cursor.value as StoredTrainingExample)) {
          total += 1;
        }
        cursor.continue();
      };
    });
  }

  private async addExample(example: StoredTrainingExample): Promise<void> {
    const db = await this.open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(this.examplesStore, 'readwrite');
      const store = tx.objectStore(this.examplesStore);
      const request = store.add(example);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  private async replaceRandomExample(example: StoredTrainingExample): Promise<void> {
    const db = await this.open();
    const keys = await new Promise<IDBValidKey[]>((resolve, reject) => {
      const tx = db.transaction(this.examplesStore, 'readonly');
      const store = tx.objectStore(this.examplesStore);
      const request = store.getAllKeys();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve((request.result as IDBValidKey[]) ?? []);
    });

    if (!keys.length) {
      await this.addExample(example);
      return;
    }

    const randomKey = keys[Math.floor(Math.random() * keys.length)];
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(this.examplesStore, 'readwrite');
      const store = tx.objectStore(this.examplesStore);
      const deleteRequest = store.delete(randomKey);
      deleteRequest.onerror = () => reject(deleteRequest.error);
      deleteRequest.onsuccess = () => {
        const addRequest = store.add(example);
        addRequest.onerror = () => reject(addRequest.error);
        addRequest.onsuccess = () => resolve();
      };
    });
  }

  private async open(): Promise<IDBDatabase> {
    if (this.dbPromise) {
      return this.dbPromise;
    }

    if (!('indexedDB' in globalThis)) {
      throw new Error('IndexedDB indisponível neste contexto.');
    }

    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);
      request.onerror = () => reject(request.error);
      request.onupgradeneeded = () => {
        const db = request.result;

        if (!db.objectStoreNames.contains(this.examplesStore)) {
          const examples = db.createObjectStore(this.examplesStore, {
            keyPath: 'id',
            autoIncrement: true
          });
          examples.createIndex('createdAt', 'createdAt', { unique: false });
          examples.createIndex('isHoldout', 'isHoldout', { unique: false });
          examples.createIndex('source', 'source', { unique: false });
        }

        if (!db.objectStoreNames.contains(this.behaviorStore)) {
          const behavior = db.createObjectStore(this.behaviorStore, {
            keyPath: 'id',
            autoIncrement: true
          });
          behavior.createIndex('timestamp', 'timestamp', { unique: false });
          behavior.createIndex('domainTimestamp', ['domain', 'timestamp'], { unique: false });
        }

        if (!db.objectStoreNames.contains(this.metaStore)) {
          db.createObjectStore(this.metaStore, { keyPath: 'key' });
        }
      };
      request.onsuccess = () => resolve(request.result);
    });

    return this.dbPromise;
  }
}

async function deleteByIndexRange(
  db: IDBDatabase,
  storeName: string,
  indexName: string,
  range: IDBKeyRange
): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const index = store.index(indexName);
    const cursorRequest = index.openCursor(range);
    cursorRequest.onerror = () => reject(cursorRequest.error);
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor) {
        resolve();
        return;
      }
      const deleteRequest = cursor.delete();
      deleteRequest.onerror = () => reject(deleteRequest.error);
      deleteRequest.onsuccess = () => cursor.continue();
    };
  });
}

function isHoldoutEntry(entry: StoredTrainingExample | null | undefined): boolean {
  if (!entry || typeof entry !== 'object') {
    return false;
  }
  const value = (entry as { isHoldout?: unknown }).isHoldout;
  return value === true || value === 1 || value === '1';
}
