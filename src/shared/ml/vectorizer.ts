import type { FeatureMap } from './featureExtractor.js';

export interface SparseVector {
  indices: number[];
  values: number[];
}

export interface FeatureVectorizerConfig {
  dimensions?: number;
  minFeatureCount?: number;
}

export interface FeatureContribution {
  feature: string;
  weight: number;
  value: number;
  score: number;
}

const DEFAULT_DIMENSIONS = 1 << 16;
const DEFAULT_MIN_COUNT = 2;

/**
 * Converte features categóricas em vetores esparsos via feature hashing.
 */
export class FeatureVectorizer {
  readonly dimensions: number;
  readonly minFeatureCount: number;
  private readonly counts: Uint32Array;

  constructor(config?: FeatureVectorizerConfig, counts?: Uint32Array) {
    this.dimensions = config?.dimensions ?? DEFAULT_DIMENSIONS;
    this.minFeatureCount = config?.minFeatureCount ?? DEFAULT_MIN_COUNT;
    this.counts = counts && counts.length === this.dimensions ? counts : new Uint32Array(this.dimensions);
  }

  /**
   * Gera o vetor esparso com atualização opcional de frequência.
   *
   * @param features Mapa de features para converter.
   * @param updateCounts Se true, incrementa frequência observada.
   * @returns Vetor esparso com índices e valores.
   */
  vectorize(features: FeatureMap, updateCounts = true): SparseVector {
    const accumulator = new Map<number, number>();

    Object.entries(features).forEach(([feature, value]) => {
      if (!Number.isFinite(value) || value === 0) {
        return;
      }
      const { index, sign } = hashFeature(feature, this.dimensions);
      if (updateCounts) {
        const current = this.counts[index] ?? 0;
        this.counts[index] = current === 0xffffffff ? current : current + 1;
      }
      if (this.counts[index] < this.minFeatureCount) {
        return;
      }
      const signedValue = value * sign;
      accumulator.set(index, (accumulator.get(index) ?? 0) + signedValue);
    });

    const indices = Array.from(accumulator.keys()).sort((a, b) => a - b);
    const values = indices.map((index) => accumulator.get(index) ?? 0);
    return { indices, values };
  }

  /**
   * Lista as maiores contribuições para explicabilidade local.
   *
   * @param features Features brutas de entrada.
   * @param weights Vetor de pesos do modelo.
   * @param limit Quantidade máxima de contribuições.
   * @returns Lista ordenada por impacto absoluto.
   */
  explain(features: FeatureMap, weights: Float32Array, limit = 5): FeatureContribution[] {
    const contributions: FeatureContribution[] = [];

    Object.entries(features).forEach(([feature, value]) => {
      if (!Number.isFinite(value) || value === 0) {
        return;
      }
      const { index, sign } = hashFeature(feature, this.dimensions);
      if (this.counts[index] < this.minFeatureCount) {
        return;
      }
      const weight = weights[index] ?? 0;
      const score = weight * value * sign;
      if (score === 0) {
        return;
      }
      contributions.push({ feature, weight: weight * sign, value, score });
    });

    return contributions
      .sort((a, b) => Math.abs(b.score) - Math.abs(a.score))
      .slice(0, limit);
  }

  /**
   * Retorna o vetor de frequências atual para persistência.
   */
  getCounts(): Uint32Array {
    return this.counts;
  }
}

export function hashFeature(feature: string, dimensions: number): { index: number; sign: number } {
  const hash = fnv1a(feature);
  return {
    index: hash % dimensions,
    sign: (hash & 1) === 0 ? 1 : -1
  };
}

function fnv1a(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
