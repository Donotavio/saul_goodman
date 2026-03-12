import type { SparseVector } from './vectorizer.js';

export interface FtrlProximalConfig {
  dimensions: number;
  alpha: number;
  beta: number;
  l1: number;
  l2: number;
}

export interface FtrlBiasState {
  z: number;
  n: number;
}

export interface FtrlUpdateResult {
  probability: number;
  loss: number;
}

/**
 * Binary FTRL-Proximal model for sparse vectors.
 */
export class FtrlProximalBinary {
  private readonly dimensions: number;
  private readonly alpha: number;
  private readonly beta: number;
  private readonly l1: number;
  private readonly l2: number;
  private readonly z: Float32Array;
  private readonly n: Float32Array;
  private biasZ: number;
  private biasN: number;

  constructor(
    config: FtrlProximalConfig,
    z?: Float32Array,
    n?: Float32Array,
    bias?: FtrlBiasState
  ) {
    this.dimensions = config.dimensions;
    this.alpha = config.alpha;
    this.beta = config.beta;
    this.l1 = config.l1;
    this.l2 = config.l2;
    this.z = z && z.length === this.dimensions ? z : new Float32Array(this.dimensions);
    this.n = n && n.length === this.dimensions ? n : new Float32Array(this.dimensions);
    this.biasZ = Number.isFinite(bias?.z) ? (bias?.z as number) : 0;
    this.biasN = Number.isFinite(bias?.n) ? (bias?.n as number) : 0;
  }

  predictScore(vector: SparseVector): number {
    let score = this.computeWeight(this.biasZ, this.biasN);
    for (let i = 0; i < vector.indices.length; i += 1) {
      const index = vector.indices[i];
      if (index < 0 || index >= this.dimensions) {
        continue;
      }
      score += this.computeWeight(this.z[index] ?? 0, this.n[index] ?? 0) * vector.values[i];
    }
    return score;
  }

  predictProbability(vector: SparseVector): number {
    return sigmoid(this.predictScore(vector));
  }

  update(vector: SparseVector, label: 0 | 1, sampleWeight = 1): FtrlUpdateResult {
    const weight = clampWeight(sampleWeight);
    const score = this.predictScore(vector);
    const probability = sigmoid(score);
    const error = (probability - label) * weight;

    this.applyGradientToBias(error);

    for (let i = 0; i < vector.indices.length; i += 1) {
      const index = vector.indices[i];
      if (index < 0 || index >= this.dimensions) {
        continue;
      }
      const value = vector.values[i];
      if (!Number.isFinite(value) || value === 0) {
        continue;
      }
      const gradient = error * value;
      this.applyGradient(index, gradient);
    }

    const baseLoss = -label * Math.log(Math.max(probability, 1e-12)) -
      (1 - label) * Math.log(Math.max(1 - probability, 1e-12));
    return {
      probability,
      loss: baseLoss * weight
    };
  }

  getWeightsSnapshot(): Float32Array {
    const weights = new Float32Array(this.dimensions);
    for (let i = 0; i < this.dimensions; i += 1) {
      weights[i] = this.computeWeight(this.z[i] ?? 0, this.n[i] ?? 0);
    }
    return weights;
  }

  getWeight(index: number): number {
    if (index < 0 || index >= this.dimensions) {
      return 0;
    }
    return this.computeWeight(this.z[index] ?? 0, this.n[index] ?? 0);
  }

  getBiasWeight(): number {
    return this.computeWeight(this.biasZ, this.biasN);
  }

  getZ(): Float32Array {
    return this.z;
  }

  getN(): Float32Array {
    return this.n;
  }

  getBiasState(): FtrlBiasState {
    return { z: this.biasZ, n: this.biasN };
  }

  private applyGradient(index: number, gradient: number): void {
    if (!Number.isFinite(gradient) || gradient === 0) {
      return;
    }
    const nPrev = this.n[index] ?? 0;
    const zPrev = this.z[index] ?? 0;
    const weight = this.computeWeight(zPrev, nPrev);
    const nNext = nPrev + gradient * gradient;
    const sigma = (Math.sqrt(nNext) - Math.sqrt(nPrev)) / this.alpha;
    const zNext = zPrev + gradient - sigma * weight;

    this.n[index] = Number.isFinite(nNext) ? nNext : nPrev;
    this.z[index] = Number.isFinite(zNext) ? zNext : zPrev;
  }

  private applyGradientToBias(gradient: number): void {
    if (!Number.isFinite(gradient) || gradient === 0) {
      return;
    }
    const nPrev = this.biasN;
    const zPrev = this.biasZ;
    const weight = this.computeWeight(zPrev, nPrev);
    const nNext = nPrev + gradient * gradient;
    const sigma = (Math.sqrt(nNext) - Math.sqrt(nPrev)) / this.alpha;
    const zNext = zPrev + gradient - sigma * weight;

    this.biasN = Number.isFinite(nNext) ? nNext : nPrev;
    this.biasZ = Number.isFinite(zNext) ? zNext : zPrev;
  }

  private computeWeight(z: number, n: number): number {
    if (!Number.isFinite(z) || !Number.isFinite(n)) {
      return 0;
    }
    if (Math.abs(z) <= this.l1) {
      return 0;
    }
    const sign = z < 0 ? -1 : 1;
    const numerator = -(z - sign * this.l1);
    const denominator = (this.beta + Math.sqrt(n)) / this.alpha + this.l2;
    if (!Number.isFinite(denominator) || denominator <= 0) {
      return 0;
    }
    const result = numerator / denominator;
    return Number.isFinite(result) ? result : 0;
  }
}

function sigmoid(value: number): number {
  if (value >= 0) {
    const exp = Math.exp(-value);
    return 1 / (1 + exp);
  }
  const exp = Math.exp(value);
  return exp / (1 + exp);
}

function clampWeight(value: number): number {
  if (!Number.isFinite(value)) {
    return 1;
  }
  return Math.max(0, Math.min(value, 10));
}
