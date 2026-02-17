export interface StoredModelState {
  version: number;
  dimensions: number;
  weights: number[];
  bias: number;
  featureCounts: number[];
  totalUpdates: number;
  lastUpdated: number;
}

export interface ModelStoreConfig {
  dbName?: string;
  storeName?: string;
  modelKey?: string;
  version?: number;
}

const DEFAULT_DB_NAME = 'sg-ml-models';
const DEFAULT_STORE_NAME = 'models';
const DEFAULT_MODEL_KEY = 'domain-classifier';
const DEFAULT_VERSION = 1;

/**
 * Persistência de modelos no IndexedDB sem dependências externas.
 */
export class ModelStore {
  private readonly dbName: string;
  private readonly storeName: string;
  private readonly modelKey: string;
  private readonly version: number;
  private dbPromise: Promise<IDBDatabase> | null = null;

  constructor(config?: ModelStoreConfig) {
    this.dbName = config?.dbName ?? DEFAULT_DB_NAME;
    this.storeName = config?.storeName ?? DEFAULT_STORE_NAME;
    this.modelKey = config?.modelKey ?? DEFAULT_MODEL_KEY;
    this.version = config?.version ?? DEFAULT_VERSION;
  }

  /**
   * Carrega o modelo persistido, se existir.
   */
  async load(): Promise<StoredModelState | null> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.storeName, 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.get(this.modelKey);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        resolve((request.result as StoredModelState | undefined) ?? null);
      };
    });
  }

  /**
   * Persiste o estado completo do modelo.
   *
   * @param state Estado serializado do modelo.
   */
  async save(state: StoredModelState): Promise<void> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.storeName, 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.put(state, this.modelKey);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  /**
   * Remove o modelo persistido.
   */
  async clear(): Promise<void> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.storeName, 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.delete(this.modelKey);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
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
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName);
        }
      };
      request.onsuccess = () => resolve(request.result);
    });

    return this.dbPromise;
  }
}
