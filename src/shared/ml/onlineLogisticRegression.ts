import type { SparseVector } from './vectorizer.js';

export interface OnlineLogisticRegressionConfig {
  dimensions: number;
  learningRate: number;
  l2: number;
}

export interface UpdateResult {
  probability: number;
  loss: number;
}

/**
 * Modelo de regressão logística binária com atualização online.
 */
export class OnlineLogisticRegression {
  private readonly dimensions: number;
  private readonly learningRate: number;
  private readonly l2: number;
  private readonly weights: Float32Array;
  private bias: number;

  constructor(
    config: OnlineLogisticRegressionConfig,
    weights?: Float32Array,
    bias?: number
  ) {
    this.dimensions = config.dimensions;
    this.learningRate = config.learningRate;
    this.l2 = config.l2;
    this.weights = weights ?? new Float32Array(this.dimensions);
    this.bias = bias ?? 0;
  }

  /**
   * Retorna a probabilidade prevista de classe positiva.
   *
   * @param vector Vetor esparso de features.
   * @returns Probabilidade de classe 1.
   */
  predictProbability(vector: SparseVector): number {
    const score = this.score(vector);
    return sigmoid(score);
  }

  /**
   * Atualiza pesos via gradiente estocástico.
   *
   * @param vector Vetor esparso de features.
   * @param label Classe alvo (0 ou 1).
   * @returns Probabilidade e perda log-loss.
   */
  update(vector: SparseVector, label: 0 | 1): UpdateResult {
    const probability = this.predictProbability(vector);
    const error = probability - label;
    this.bias -= this.learningRate * error;

    for (let i = 0; i < vector.indices.length; i += 1) {
      const index = vector.indices[i];
      const value = vector.values[i];
      const weight = this.weights[index] ?? 0;
      const decay = 1 - this.learningRate * this.l2;
      this.weights[index] = weight * decay - this.learningRate * error * value;
    }

    const loss = -label * Math.log(Math.max(probability, 1e-12)) -
      (1 - label) * Math.log(Math.max(1 - probability, 1e-12));
    return { probability, loss };
  }

  /**
   * Retorna o vetor de pesos interno.
   */
  getWeights(): Float32Array {
    return this.weights;
  }

  /**
   * Retorna o bias atual.
   */
  getBias(): number {
    return this.bias;
  }

  /**
   * Atualiza o bias explicitamente.
   *
   * @param bias Novo valor de bias.
   */
  setBias(bias: number): void {
    this.bias = bias;
  }

  private score(vector: SparseVector): number {
    let total = this.bias;
    for (let i = 0; i < vector.indices.length; i += 1) {
      const index = vector.indices[i];
      total += (this.weights[index] ?? 0) * vector.values[i];
    }
    return total;
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
