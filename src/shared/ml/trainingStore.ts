import type { DomainBehaviorEvent } from './behaviorSignals.js';

export type TrainingSource = 'explicit' | 'implicit';
export type TrainingSplit = 'train' | 'calibration' | 'test';

export interface SerializedSparseVector {
  indices: number[];
  values: number[];
}

export interface StoredTrainingExample {
  id?: number;
  createdAt: number;
  domain: string;
  source: TrainingSource;
  split: TrainingSplit;
  label: 0 | 1;
  weight: number;
  vector: SerializedSparseVector;
  featureNames?: string[];
  baselinePrediction?: 0 | 1;
  baselineScore?: number;
  naturalPrediction?: 0 | 1;
  naturalProbability?: number;
  naturalSelfPrediction?: 0 | 1;
  naturalSelfProbability?: number;
  v1Prediction?: 0 | 1;
  v2Prediction?: 0 | 1;
  v2Score?: number;
  isHoldout?: boolean;
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
}

const DEFAULT_DB_NAME = 'sg-ml-training';
const DEFAULT_EXAMPLES_STORE = 'examples';
const DEFAULT_BEHAVIOR_STORE = 'behavior';
const DEFAULT_META_STORE = 'meta';
const DEFAULT_VERSION = 3;

const TRAIN_SPLIT_THRESHOLD = 70;
const CALIBRATION_SPLIT_THRESHOLD = 85;
const MAX_CURSOR_TIMESTAMP = Number.MAX_SAFE_INTEGER;

/**
 * Stores trainable examples, calibration/test splits, behavior events and metadata in IndexedDB.
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
    example: Omit<StoredTrainingExample, 'id' | 'split'>,
    options: AddTrainingOptions
  ): Promise<void> {
    await this.pruneExamples(Date.now() - options.retentionMs);

    const [totalSeen, count] = await Promise.all([
      this.getMeta<number>('examples:totalSeen'),
      this.countExamples()
    ]);

    const seen = (totalSeen ?? 0) + 1;
    const next: StoredTrainingExample = {
      ...example,
      split: determineSplit(example)
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

  async getCalibrationExamples(limit = 2000): Promise<StoredTrainingExample[]> {
    return this.getExamplesBySplit('calibration', limit);
  }

  async getTestExamples(limit = 2000): Promise<StoredTrainingExample[]> {
    return this.getExamplesBySplit('test', limit);
  }

  async countSplitExamples(split: TrainingSplit, source?: TrainingSource): Promise<number> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.examplesStore, 'readonly');
      const store = tx.objectStore(this.examplesStore);
      if (source && store.indexNames.contains('splitSourceCreatedAt')) {
        const range = IDBKeyRange.bound(
          [split, source, 0],
          [split, source, MAX_CURSOR_TIMESTAMP]
        );
        const request = store.index('splitSourceCreatedAt').count(range);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result ?? 0);
        return;
      }
      if (store.indexNames.contains('split')) {
        const request = store.index('split').count(split);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result ?? 0);
        return;
      }
      const request = store.getAll();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const entries = (request.result as StoredTrainingExample[]) ?? [];
        resolve(entries.filter((entry) => matchesSplit(entry, split, source)).length);
      };
    });
  }

  async getRecentExamples(limit = 5000): Promise<StoredTrainingExample[]> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.examplesStore, 'readonly');
      const store = tx.objectStore(this.examplesStore);
      const entries: StoredTrainingExample[] = [];
      const index = store.index('createdAt');
      const request = index.openCursor(null, 'prev');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor || entries.length >= limit) {
          resolve(entries);
          return;
        }
        entries.push(cursor.value as StoredTrainingExample);
        cursor.continue();
      };
    });
  }

  async getRecentExplicitExamplesByDomain(
    domain: string,
    sinceTimestamp: number,
    limit = 200
  ): Promise<StoredTrainingExample[]> {
    const normalizedDomain = (domain ?? '').trim().toLowerCase();
    const safeSince = Number.isFinite(sinceTimestamp) ? Math.max(0, sinceTimestamp) : 0;
    const safeLimit = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 0;
    if (!normalizedDomain || safeLimit <= 0) {
      return [];
    }

    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.examplesStore, 'readonly');
      const store = tx.objectStore(this.examplesStore);

      if (!store.indexNames.contains('domainCreatedAt')) {
        const request = store.getAll();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const entries = (request.result as StoredTrainingExample[])
            .filter((entry) => isExplicitExample(entry, normalizedDomain, safeSince))
            .sort((a, b) => b.createdAt - a.createdAt)
            .slice(0, safeLimit);
          resolve(entries);
        };
        return;
      }

      const index = store.index('domainCreatedAt');
      const range = IDBKeyRange.bound(
        [normalizedDomain, safeSince],
        [normalizedDomain, MAX_CURSOR_TIMESTAMP]
      );
      const entries: StoredTrainingExample[] = [];
      const request = index.openCursor(range, 'prev');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor || entries.length >= safeLimit) {
          resolve(entries);
          return;
        }
        const row = cursor.value as StoredTrainingExample;
        if (row.source === 'explicit') {
          entries.push(row);
        }
        cursor.continue();
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
      const range = IDBKeyRange.bound([domain, sinceTimestamp], [domain, MAX_CURSOR_TIMESTAMP]);
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

  async getBehaviorEventsSince(sinceTimestamp: number): Promise<DomainBehaviorEvent[]> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.behaviorStore, 'readonly');
      const store = tx.objectStore(this.behaviorStore);
      const index = store.index('timestamp');
      const range = IDBKeyRange.bound(sinceTimestamp, MAX_CURSOR_TIMESTAMP);
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

  async removeImplicitExamplesByDomain(domain: string): Promise<number> {
    const normalizedDomain = (domain ?? '').trim().toLowerCase();
    if (!normalizedDomain) return 0;
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.examplesStore, 'readwrite');
      const store = tx.objectStore(this.examplesStore);
      const request = store.openCursor();
      let removed = 0;
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) { resolve(removed); return; }
        const row = cursor.value as StoredTrainingExample;
        if (row.domain === normalizedDomain && row.source === 'implicit') {
          cursor.delete();
          removed += 1;
        }
        cursor.continue();
      };
    });
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

  private async getExamplesBySplit(
    split: TrainingSplit,
    limit: number,
    source?: TrainingSource
  ): Promise<StoredTrainingExample[]> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.examplesStore, 'readonly');
      const store = tx.objectStore(this.examplesStore);
      const entries: StoredTrainingExample[] = [];

      const indexName = source && store.indexNames.contains('splitSourceCreatedAt')
        ? 'splitSourceCreatedAt'
        : store.indexNames.contains('splitCreatedAt')
          ? 'splitCreatedAt'
          : null;
      if (!indexName) {
        const request = store.getAll();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const all = (request.result as StoredTrainingExample[]) ?? [];
          resolve(
            all
              .filter((entry) => matchesSplit(entry, split, source))
              .sort((a, b) => b.createdAt - a.createdAt)
              .slice(0, limit)
          );
        };
        return;
      }

      const index = store.index(indexName);
      const range = source
        ? IDBKeyRange.bound([split, source, 0], [split, source, MAX_CURSOR_TIMESTAMP])
        : IDBKeyRange.bound([split, 0], [split, MAX_CURSOR_TIMESTAMP]);
      const request = index.openCursor(range, 'prev');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor || entries.length >= limit) {
          resolve(entries);
          return;
        }
        entries.push(cursor.value as StoredTrainingExample);
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
    const allEntries = await new Promise<StoredTrainingExample[]>((resolve, reject) => {
      const tx = db.transaction(this.examplesStore, 'readonly');
      const store = tx.objectStore(this.examplesStore);
      const request = store.getAll();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve((request.result as StoredTrainingExample[]) ?? []);
    });

    if (!allEntries.length) {
      await this.addExample(example);
      return;
    }

    const sameDomainConflict = allEntries.find(
      (entry) => entry.domain === example.domain && entry.label !== example.label
    );
    const targetKey = sameDomainConflict?.id
      ?? allEntries[Math.floor(Math.random() * allEntries.length)].id;

    if (targetKey == null) {
      await this.addExample(example);
      return;
    }

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(this.examplesStore, 'readwrite');
      const store = tx.objectStore(this.examplesStore);
      const deleteRequest = store.delete(targetKey);
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
      request.onupgradeneeded = (event) => {
        const db = request.result;
        const upgradeTx = request.transaction;

        let examples: IDBObjectStore | null = null;
        if (!db.objectStoreNames.contains(this.examplesStore)) {
          examples = db.createObjectStore(this.examplesStore, {
            keyPath: 'id',
            autoIncrement: true
          });
        } else if (upgradeTx) {
          examples = upgradeTx.objectStore(this.examplesStore);
        }
        if (examples) {
          ensureIndex(examples, 'createdAt', 'createdAt');
          ensureIndex(examples, 'source', 'source');
          ensureIndex(examples, 'split', 'split');
          ensureIndex(examples, 'splitCreatedAt', ['split', 'createdAt']);
          ensureIndex(examples, 'splitSourceCreatedAt', ['split', 'source', 'createdAt']);
          ensureIndex(examples, 'domainCreatedAt', ['domain', 'createdAt']);
          if (event.oldVersion < 3) {
            migrateLegacyExamples(examples);
          }
        }

        let behavior: IDBObjectStore | null = null;
        if (!db.objectStoreNames.contains(this.behaviorStore)) {
          behavior = db.createObjectStore(this.behaviorStore, {
            keyPath: 'id',
            autoIncrement: true
          });
        } else if (upgradeTx) {
          behavior = upgradeTx.objectStore(this.behaviorStore);
        }
        if (behavior) {
          ensureIndex(behavior, 'timestamp', 'timestamp');
          ensureIndex(behavior, 'domainTimestamp', ['domain', 'timestamp']);
        }

        if (!db.objectStoreNames.contains(this.metaStore)) {
          db.createObjectStore(this.metaStore, { keyPath: 'key' });
        }
      };
      request.onsuccess = () => resolve(request.result);
    });
    this.dbPromise.catch(() => { this.dbPromise = null; });

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

export function determineSplit(example: Omit<StoredTrainingExample, 'id' | 'split'>): TrainingSplit {
  if (example.source === 'implicit') {
    return 'train';
  }
  const bucket = hashToPercent(normalizeForHash(example.domain));
  if (bucket < TRAIN_SPLIT_THRESHOLD) {
    return 'train';
  }
  if (bucket < CALIBRATION_SPLIT_THRESHOLD) {
    return 'calibration';
  }
  return 'test';
}

function matchesSplit(
  entry: StoredTrainingExample | null | undefined,
  split: TrainingSplit,
  source?: TrainingSource
): boolean {
  if (!entry || typeof entry !== 'object') {
    return false;
  }
  if (resolveStoredSplit(entry) !== split) {
    return false;
  }
  if (source && entry.source !== source) {
    return false;
  }
  return true;
}

export function resolveStoredSplit(entry: StoredTrainingExample | null | undefined): TrainingSplit {
  if (entry?.split === 'train' || entry?.split === 'calibration' || entry?.split === 'test') {
    return entry.split;
  }
  if (isHoldoutEntry(entry)) {
    return 'calibration';
  }
  if (entry?.domain) {
    return determineSplit(entry as Omit<StoredTrainingExample, 'id' | 'split'>);
  }
  return 'train';
}

function migrateLegacyExamples(store: IDBObjectStore): void {
  const request = store.openCursor();
  request.onsuccess = () => {
    const cursor = request.result;
    if (!cursor) {
      return;
    }
    const row = cursor.value as StoredTrainingExample;
    if (row.split === 'train' || row.split === 'calibration' || row.split === 'test') {
      cursor.continue();
      return;
    }
    const next: StoredTrainingExample = {
      ...row,
      split: resolveStoredSplit(row)
    };
    const updateRequest = cursor.update(next);
    updateRequest.onsuccess = () => cursor.continue();
    updateRequest.onerror = () => cursor.continue();
  };
}

function hashToPercent(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 100;
}

function normalizeForHash(value: string): string {
  return (value ?? '').trim().toLowerCase();
}

function isHoldoutEntry(entry: StoredTrainingExample | null | undefined): boolean {
  if (!entry || typeof entry !== 'object') {
    return false;
  }
  const value = (entry as { isHoldout?: unknown }).isHoldout;
  return value === true || value === 1 || value === '1';
}

function isExplicitExample(
  entry: StoredTrainingExample | null | undefined,
  normalizedDomain: string,
  sinceTimestamp: number
): boolean {
  if (!entry || typeof entry !== 'object') {
    return false;
  }
  if (entry.source !== 'explicit') {
    return false;
  }
  if (!entry.domain || entry.domain.trim().toLowerCase() !== normalizedDomain) {
    return false;
  }
  if (!Number.isFinite(entry.createdAt)) {
    return false;
  }
  return entry.createdAt >= sinceTimestamp;
}

function ensureIndex(
  store: IDBObjectStore,
  name: string,
  keyPath: string | string[],
  options: IDBIndexParameters = { unique: false }
): void {
  if (store.indexNames.contains(name)) {
    return;
  }
  store.createIndex(name, keyPath, options);
}
