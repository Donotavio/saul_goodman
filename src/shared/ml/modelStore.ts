import type { CalibrationState } from './plattScaler.js';
import type { RolloutState, ShadowMetrics } from './rollout.js';
import type { WideDeepLiteState } from './wideDeepLite.js';
import type {
  ValidationBaselineSnapshot,
  ValidationSummary
} from './validationGate.js';

export interface LegacyStoredModelState {
  version: number;
  dimensions: number;
  weights: number[];
  bias: number;
  featureCounts: number[];
  totalUpdates: number;
  lastUpdated: number;
}

export interface FtrlStoredState {
  dimensions: number;
  alpha: number;
  beta: number;
  l1: number;
  l2: number;
  z: number[];
  n: number[];
  biasZ: number;
  biasN: number;
}

export interface StoredModelStateV2 {
  version: number;
  schema: 'dual-model-v2';
  legacy: LegacyStoredModelState;
  v2: FtrlStoredState;
  v2FeatureCounts: number[];
  calibration: CalibrationState;
  rollout: RolloutState;
  shadow: ShadowMetrics;
  totalUpdates: number;
  explicitUpdates: number;
  implicitUpdates: number;
  lastUpdated: number;
  explicitSinceCalibration: number;
  lastCalibrationDayKey?: string;
}

export interface StoredModelStateV3 {
  version: number;
  schema: 'single-neural-lite-v3';
  model: WideDeepLiteState;
  featureCounts: number[];
  calibration: CalibrationState;
  guardrailStage: 'guarded' | 'normal';
  validationBaseline?: ValidationBaselineSnapshot | null;
  validation?: ValidationSummary | null;
  totalUpdates: number;
  explicitUpdates: number;
  implicitUpdates: number;
  lastUpdated: number;
  explicitSinceCalibration: number;
  lastCalibrationDayKey?: string;
}

export type StoredModelState = LegacyStoredModelState | StoredModelStateV2 | StoredModelStateV3;

export interface ModelStoreConfig {
  dbName?: string;
  storeName?: string;
  modelKey?: string;
  version?: number;
}

export interface WideWarmStart {
  source: 'none' | 'legacy' | 'v2' | 'v3';
  wideWeights: Float32Array;
  wideBias: number;
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

export function deriveWideWarmStart(
  stored: StoredModelState | null,
  dimensions: number
): WideWarmStart {
  const wideWeights = new Float32Array(dimensions);

  if (!stored) {
    return {
      source: 'none',
      wideWeights,
      wideBias: 0
    };
  }

  if (isV3State(stored)) {
    const size = Math.min(dimensions, stored.model.dimensions, stored.model.wideWeights.length);
    for (let i = 0; i < size; i += 1) {
      wideWeights[i] = stored.model.wideWeights[i] ?? 0;
    }
    return {
      source: 'v3',
      wideWeights,
      wideBias: stored.model.wideBias ?? 0
    };
  }

  if (isV2State(stored)) {
    const state = stored.v2;
    const size = Math.min(dimensions, state.dimensions, state.z.length, state.n.length);
    for (let i = 0; i < size; i += 1) {
      const z = state.z[i] ?? 0;
      const n = state.n[i] ?? 0;
      wideWeights[i] = computeFtrlWeight(z, n, state.alpha, state.beta, state.l1, state.l2);
    }
    return {
      source: 'v2',
      wideWeights,
      wideBias: computeFtrlWeight(
        state.biasZ ?? 0,
        state.biasN ?? 0,
        state.alpha,
        state.beta,
        state.l1,
        state.l2
      )
    };
  }

  const legacy = stored as LegacyStoredModelState;
  const size = Math.min(dimensions, legacy.dimensions, legacy.weights.length);
  for (let i = 0; i < size; i += 1) {
    wideWeights[i] = legacy.weights[i] ?? 0;
  }
  return {
    source: 'legacy',
    wideWeights,
    wideBias: legacy.bias ?? 0
  };
}

function isV2State(state: StoredModelState): state is StoredModelStateV2 {
  return 'schema' in state && state.schema === 'dual-model-v2';
}

function isV3State(state: StoredModelState): state is StoredModelStateV3 {
  return 'schema' in state && state.schema === 'single-neural-lite-v3';
}

function computeFtrlWeight(
  z: number,
  n: number,
  alpha: number,
  beta: number,
  l1: number,
  l2: number
): number {
  if (!Number.isFinite(z) || !Number.isFinite(n)) {
    return 0;
  }
  if (Math.abs(z) <= l1) {
    return 0;
  }
  const sign = z < 0 ? -1 : 1;
  const numerator = -(z - sign * l1);
  const denominator = (beta + Math.sqrt(Math.max(0, n))) / alpha + l2;
  if (!Number.isFinite(denominator) || denominator <= 0) {
    return 0;
  }
  const value = numerator / denominator;
  return Number.isFinite(value) ? value : 0;
}
