import type { FeatureMap } from './featureExtractor.js';
import { hashFeature, type SparseVector } from './vectorizer.js';

export type ReplayFeatureScenario = 'natural' | 'natural+self';

export const FEATURE_NAME_DELIMITER = '|';

export function projectFeatureMap(
  features: FeatureMap,
  scenario: ReplayFeatureScenario
): FeatureMap {
  const projected: FeatureMap = {};
  Object.entries(features).forEach(([feature, value]) => {
    if (!Number.isFinite(value) || value === 0) {
      return;
    }
    if (!shouldIncludeFeatureInScenario(feature, scenario)) {
      return;
    }
    projected[feature] = value;
  });
  return projected;
}

export function shouldIncludeFeatureInScenario(
  feature: string,
  scenario: ReplayFeatureScenario
): boolean {
  if (scenario === 'natural') {
    return isNaturalScenarioFeature(feature);
  }
  return isNaturalSelfScenarioFeature(feature);
}

export function isNaturalScenarioFeature(feature: string): boolean {
  return feature.startsWith('sem:') || feature.startsWith('nat:');
}

export function isNaturalSelfScenarioFeature(feature: string): boolean {
  return isNaturalScenarioFeature(feature) || feature.startsWith('beh:');
}

export function buildVectorFeatureNames(
  features: FeatureMap,
  vector: SparseVector,
  dimensions: number
): string[] {
  const namesByIndex = new Map<number, Set<string>>();

  Object.entries(features).forEach(([feature, value]) => {
    if (!Number.isFinite(value) || value === 0) {
      return;
    }
    const { index } = hashFeature(feature, dimensions);
    const bucket = namesByIndex.get(index) ?? new Set<string>();
    bucket.add(feature);
    namesByIndex.set(index, bucket);
  });

  return vector.indices.map((index) => {
    const bucket = namesByIndex.get(index);
    if (!bucket || !bucket.size) {
      return '';
    }
    return Array.from(bucket).sort().join(FEATURE_NAME_DELIMITER);
  });
}

export function featureNameContainsAttentionSignal(featureName: string): boolean {
  if (!featureName.trim()) {
    return false;
  }
  return splitFeatureNames(featureName).some((entry) => (
    entry.startsWith('nat:attention:') || entry === 'nat:reliability:signal_stability_7d'
  ));
}

export function splitFeatureNames(featureName: string): string[] {
  return featureName
    .split(FEATURE_NAME_DELIMITER)
    .map((entry) => entry.trim())
    .filter(Boolean);
}
