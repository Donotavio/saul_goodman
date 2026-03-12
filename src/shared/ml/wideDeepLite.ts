import type { SparseVector } from './vectorizer.js';

export interface WideDeepLiteConfig {
  dimensions: number;
  embeddingDim: number;
  hiddenDim: number;
  lrWide: number;
  lrDeep: number;
  l2: number;
  clipGradient: number;
}

export interface WideDeepLiteState {
  dimensions: number;
  embeddingDim: number;
  hiddenDim: number;
  lrWide: number;
  lrDeep: number;
  l2: number;
  clipGradient: number;
  wideWeights: number[];
  wideAccum: number[];
  wideBias: number;
  wideBiasAccum: number;
  embeddings: number[];
  embeddingsAccum: number[];
  hiddenWeights: number[];
  hiddenAccum: number[];
  hiddenBias: number[];
  hiddenBiasAccum: number[];
  outWeights: number[];
  outWeightsAccum: number[];
  outBias: number;
  outBiasAccum: number;
}

export interface WideDeepLiteInitState {
  wideWeights?: Float32Array;
  wideBias?: number;
  wideAccum?: Float32Array;
  wideBiasAccum?: number;
  embeddings?: Float32Array;
  embeddingsAccum?: Float32Array;
  hiddenWeights?: Float32Array;
  hiddenAccum?: Float32Array;
  hiddenBias?: Float32Array;
  hiddenBiasAccum?: Float32Array;
  outWeights?: Float32Array;
  outWeightsAccum?: Float32Array;
  outBias?: number;
  outBiasAccum?: number;
  seed?: number;
}

export interface WideDeepLiteUpdateResult {
  probability: number;
  loss: number;
}

interface ForwardCache {
  score: number;
  probability: number;
  pooled: Float32Array;
  hiddenPre: Float32Array;
  hiddenAct: Float32Array;
}

const EPSILON = 1e-8;

/**
 * Lightweight online wide+deep model for sparse vectors.
 * - Wide branch: linear hashed features.
 * - Deep branch: sparse embeddings + one hidden ReLU layer.
 * - Optimizer: AdaGrad with per-parameter accumulators.
 */
export class WideDeepLiteBinary {
  private readonly config: WideDeepLiteConfig;
  private readonly dimensions: number;
  private readonly embeddingDim: number;
  private readonly hiddenDim: number;

  private readonly wideWeights: Float32Array;
  private readonly wideAccum: Float32Array;
  private wideBias: number;
  private wideBiasAccum: number;

  private readonly embeddings: Float32Array;
  private readonly embeddingsAccum: Float32Array;

  private readonly hiddenWeights: Float32Array;
  private readonly hiddenAccum: Float32Array;
  private readonly hiddenBias: Float32Array;
  private readonly hiddenBiasAccum: Float32Array;

  private readonly outWeights: Float32Array;
  private readonly outWeightsAccum: Float32Array;
  private outBias: number;
  private outBiasAccum: number;

  constructor(config: WideDeepLiteConfig, state?: WideDeepLiteInitState) {
    this.config = config;
    this.dimensions = config.dimensions;
    this.embeddingDim = config.embeddingDim;
    this.hiddenDim = config.hiddenDim;

    const embeddingSize = this.dimensions * this.embeddingDim;
    const hiddenWeightSize = this.hiddenDim * this.embeddingDim;

    this.wideWeights = ensureArray(state?.wideWeights, this.dimensions);
    this.wideAccum = ensureArray(state?.wideAccum, this.dimensions);
    this.wideBias = Number.isFinite(state?.wideBias) ? (state?.wideBias as number) : 0;
    this.wideBiasAccum = Number.isFinite(state?.wideBiasAccum) ? (state?.wideBiasAccum as number) : 0;

    this.embeddings = ensureArray(state?.embeddings, embeddingSize);
    this.embeddingsAccum = ensureArray(state?.embeddingsAccum, embeddingSize);
    this.hiddenWeights = ensureArray(state?.hiddenWeights, hiddenWeightSize);
    this.hiddenAccum = ensureArray(state?.hiddenAccum, hiddenWeightSize);
    this.hiddenBias = ensureArray(state?.hiddenBias, this.hiddenDim);
    this.hiddenBiasAccum = ensureArray(state?.hiddenBiasAccum, this.hiddenDim);
    this.outWeights = ensureArray(state?.outWeights, this.hiddenDim);
    this.outWeightsAccum = ensureArray(state?.outWeightsAccum, this.hiddenDim);
    this.outBias = Number.isFinite(state?.outBias) ? (state?.outBias as number) : 0;
    this.outBiasAccum = Number.isFinite(state?.outBiasAccum) ? (state?.outBiasAccum as number) : 0;

    if (!state?.embeddings) {
      this.initializeEmbeddings(state?.seed);
    }
    if (!state?.hiddenWeights) {
      this.initializeHiddenWeights(state?.seed);
    }
    if (!state?.outWeights) {
      this.initializeOutputWeights(state?.seed);
    }
  }

  predictScore(vector: SparseVector): number {
    return this.forward(vector).score;
  }

  predictProbability(vector: SparseVector): number {
    return this.forward(vector).probability;
  }

  update(vector: SparseVector, label: 0 | 1, sampleWeight = 1): WideDeepLiteUpdateResult {
    const weight = clampWeight(sampleWeight);
    const cache = this.forward(vector);
    const baseError = (cache.probability - label) * weight;
    const error = clampValue(baseError, this.config.clipGradient);

    // Wide branch bias.
    this.applyAdaGradBias(
      () => this.wideBias,
      (value) => {
        this.wideBias = value;
      },
      () => this.wideBiasAccum,
      (value) => {
        this.wideBiasAccum = value;
      },
      error + this.config.l2 * this.wideBias,
      this.config.lrWide
    );

    for (let i = 0; i < vector.indices.length; i += 1) {
      const index = vector.indices[i];
      if (index < 0 || index >= this.dimensions) {
        continue;
      }
      const inputValue = vector.values[i];
      if (!Number.isFinite(inputValue) || inputValue === 0) {
        continue;
      }
      const gradient = clampValue(
        error * inputValue + this.config.l2 * (this.wideWeights[index] ?? 0),
        this.config.clipGradient
      );
      applyAdaGradToArray(this.wideWeights, this.wideAccum, index, gradient, this.config.lrWide);
    }

    // Deep output layer gradients.
    const dHidden = new Float32Array(this.hiddenDim);
    for (let h = 0; h < this.hiddenDim; h += 1) {
      const outWeight = this.outWeights[h] ?? 0;
      const gradOutWeight = clampValue(
        error * cache.hiddenAct[h] + this.config.l2 * outWeight,
        this.config.clipGradient
      );
      applyAdaGradToArray(this.outWeights, this.outWeightsAccum, h, gradOutWeight, this.config.lrDeep);
      dHidden[h] = error * outWeight;
    }

    this.applyAdaGradBias(
      () => this.outBias,
      (value) => {
        this.outBias = value;
      },
      () => this.outBiasAccum,
      (value) => {
        this.outBiasAccum = value;
      },
      clampValue(error + this.config.l2 * this.outBias, this.config.clipGradient),
      this.config.lrDeep
    );

    // Hidden layer and pooled gradient.
    const dPooled = new Float32Array(this.embeddingDim);
    for (let h = 0; h < this.hiddenDim; h += 1) {
      if (cache.hiddenPre[h] <= 0) {
        continue;
      }
      const dHiddenPre = dHidden[h];
      const gradHiddenBias = clampValue(
        dHiddenPre + this.config.l2 * (this.hiddenBias[h] ?? 0),
        this.config.clipGradient
      );
      applyAdaGradToArray(this.hiddenBias, this.hiddenBiasAccum, h, gradHiddenBias, this.config.lrDeep);

      for (let j = 0; j < this.embeddingDim; j += 1) {
        const weightIndex = h * this.embeddingDim + j;
        const hiddenWeight = this.hiddenWeights[weightIndex] ?? 0;
        const gradHiddenWeight = clampValue(
          dHiddenPre * cache.pooled[j] + this.config.l2 * hiddenWeight,
          this.config.clipGradient
        );
        applyAdaGradToArray(
          this.hiddenWeights,
          this.hiddenAccum,
          weightIndex,
          gradHiddenWeight,
          this.config.lrDeep
        );

        dPooled[j] += dHiddenPre * hiddenWeight;
      }
    }

    // Backprop pooled gradient into sparse embeddings.
    for (let i = 0; i < vector.indices.length; i += 1) {
      const index = vector.indices[i];
      if (index < 0 || index >= this.dimensions) {
        continue;
      }
      const inputValue = vector.values[i];
      if (!Number.isFinite(inputValue) || inputValue === 0) {
        continue;
      }
      const baseOffset = index * this.embeddingDim;
      for (let j = 0; j < this.embeddingDim; j += 1) {
        const embeddingIndex = baseOffset + j;
        const embeddingValue = this.embeddings[embeddingIndex] ?? 0;
        const gradEmbedding = clampValue(
          dPooled[j] * inputValue + this.config.l2 * embeddingValue,
          this.config.clipGradient
        );
        applyAdaGradToArray(
          this.embeddings,
          this.embeddingsAccum,
          embeddingIndex,
          gradEmbedding,
          this.config.lrDeep
        );
      }
    }

    const baseLoss = -label * Math.log(Math.max(cache.probability, 1e-12)) -
      (1 - label) * Math.log(Math.max(1 - cache.probability, 1e-12));
    return {
      probability: cache.probability,
      loss: baseLoss * weight
    };
  }

  getWideWeight(index: number): number {
    if (index < 0 || index >= this.dimensions) {
      return 0;
    }
    return this.wideWeights[index] ?? 0;
  }

  getWideWeights(): Float32Array {
    return this.wideWeights;
  }

  getWideBias(): number {
    return this.wideBias;
  }

  getState(): WideDeepLiteState {
    return {
      dimensions: this.dimensions,
      embeddingDim: this.embeddingDim,
      hiddenDim: this.hiddenDim,
      lrWide: this.config.lrWide,
      lrDeep: this.config.lrDeep,
      l2: this.config.l2,
      clipGradient: this.config.clipGradient,
      wideWeights: Array.from(this.wideWeights),
      wideAccum: Array.from(this.wideAccum),
      wideBias: this.wideBias,
      wideBiasAccum: this.wideBiasAccum,
      embeddings: Array.from(this.embeddings),
      embeddingsAccum: Array.from(this.embeddingsAccum),
      hiddenWeights: Array.from(this.hiddenWeights),
      hiddenAccum: Array.from(this.hiddenAccum),
      hiddenBias: Array.from(this.hiddenBias),
      hiddenBiasAccum: Array.from(this.hiddenBiasAccum),
      outWeights: Array.from(this.outWeights),
      outWeightsAccum: Array.from(this.outWeightsAccum),
      outBias: this.outBias,
      outBiasAccum: this.outBiasAccum
    };
  }

  private forward(vector: SparseVector): ForwardCache {
    let wideScore = this.wideBias;
    const pooled = new Float32Array(this.embeddingDim);

    for (let i = 0; i < vector.indices.length; i += 1) {
      const index = vector.indices[i];
      if (index < 0 || index >= this.dimensions) {
        continue;
      }
      const inputValue = vector.values[i];
      if (!Number.isFinite(inputValue) || inputValue === 0) {
        continue;
      }
      wideScore += (this.wideWeights[index] ?? 0) * inputValue;
      const baseOffset = index * this.embeddingDim;
      for (let j = 0; j < this.embeddingDim; j += 1) {
        pooled[j] += (this.embeddings[baseOffset + j] ?? 0) * inputValue;
      }
    }

    const hiddenPre = new Float32Array(this.hiddenDim);
    const hiddenAct = new Float32Array(this.hiddenDim);

    for (let h = 0; h < this.hiddenDim; h += 1) {
      let total = this.hiddenBias[h] ?? 0;
      const rowOffset = h * this.embeddingDim;
      for (let j = 0; j < this.embeddingDim; j += 1) {
        total += (this.hiddenWeights[rowOffset + j] ?? 0) * pooled[j];
      }
      hiddenPre[h] = total;
      hiddenAct[h] = total > 0 ? total : 0;
    }

    let deepScore = this.outBias;
    for (let h = 0; h < this.hiddenDim; h += 1) {
      deepScore += (this.outWeights[h] ?? 0) * hiddenAct[h];
    }

    const score = wideScore + deepScore;
    const probability = sigmoid(score);
    return {
      score,
      probability,
      pooled,
      hiddenPre,
      hiddenAct
    };
  }

  private applyAdaGradBias(
    getValue: () => number,
    setValue: (next: number) => void,
    getAccum: () => number,
    setAccum: (next: number) => void,
    gradient: number,
    lr: number
  ): void {
    if (!Number.isFinite(gradient) || gradient === 0) {
      return;
    }
    const safeGrad = gradient;
    const prevAccum = getAccum();
    const nextAccum = prevAccum + safeGrad * safeGrad;
    const denom = Math.sqrt(nextAccum) + EPSILON;
    const current = getValue();
    const next = current - (lr * safeGrad) / denom;

    if (Number.isFinite(nextAccum)) {
      setAccum(nextAccum);
    }
    if (Number.isFinite(next)) {
      setValue(next);
    }
  }

  private initializeEmbeddings(seed?: number): void {
    const random = seededRandom(seed ?? 17);
    const scale = 0.01;
    for (let i = 0; i < this.embeddings.length; i += 1) {
      this.embeddings[i] = (random() * 2 - 1) * scale;
    }
  }

  private initializeHiddenWeights(seed?: number): void {
    const random = seededRandom((seed ?? 17) + 97);
    const scale = Math.sqrt(2 / Math.max(1, this.embeddingDim));
    for (let i = 0; i < this.hiddenWeights.length; i += 1) {
      this.hiddenWeights[i] = (random() * 2 - 1) * scale;
    }
  }

  private initializeOutputWeights(seed?: number): void {
    const random = seededRandom((seed ?? 17) + 211);
    const scale = Math.sqrt(2 / Math.max(1, this.hiddenDim));
    for (let i = 0; i < this.outWeights.length; i += 1) {
      this.outWeights[i] = (random() * 2 - 1) * scale;
    }
  }
}

function applyAdaGradToArray(
  values: Float32Array,
  accum: Float32Array,
  index: number,
  gradient: number,
  lr: number
): void {
  if (!Number.isFinite(gradient) || gradient === 0) {
    return;
  }
  const prevAccum = accum[index] ?? 0;
  const nextAccum = prevAccum + gradient * gradient;
  const denom = Math.sqrt(nextAccum) + EPSILON;
  const current = values[index] ?? 0;
  const next = current - (lr * gradient) / denom;

  if (Number.isFinite(nextAccum)) {
    accum[index] = nextAccum;
  }
  if (Number.isFinite(next)) {
    values[index] = next;
  }
}

function ensureArray(source: Float32Array | undefined, length: number): Float32Array {
  if (source && source.length === length) {
    return source;
  }
  return new Float32Array(length);
}

function clampWeight(value: number): number {
  if (!Number.isFinite(value)) {
    return 1;
  }
  return Math.max(0, Math.min(value, 10));
}

function clampValue(value: number, clip: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const safeClip = Number.isFinite(clip) && clip > 0 ? clip : 1;
  if (value > safeClip) {
    return safeClip;
  }
  if (value < -safeClip) {
    return -safeClip;
  }
  return value;
}

function sigmoid(value: number): number {
  if (value >= 0) {
    const exp = Math.exp(-value);
    return 1 / (1 + exp);
  }
  const exp = Math.exp(value);
  return exp / (1 + exp);
}

function seededRandom(seed: number): () => number {
  let state = Math.floor(seed) || 1;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}
