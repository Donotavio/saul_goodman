export interface CalibrationReliabilityBin {
  index: number;
  lowerBound: number;
  upperBound: number;
  count: number;
  averageConfidence: number;
  averageAccuracy: number;
}

export function calculateExpectedCalibrationError(
  probabilities: number[],
  labels: Array<0 | 1>,
  bins = 10
): number {
  const reliabilityBins = buildReliabilityBins(probabilities, labels, bins);
  if (!reliabilityBins.length) {
    return 0;
  }
  const total = reliabilityBins.reduce((acc, bin) => acc + bin.count, 0);
  if (total <= 0) {
    return 0;
  }
  return reliabilityBins.reduce((acc, bin) =>
    acc + (bin.count / total) * Math.abs(bin.averageConfidence - bin.averageAccuracy), 0
  );
}

export function buildReliabilityBins(
  probabilities: number[],
  labels: Array<0 | 1>,
  bins = 10
): CalibrationReliabilityBin[] {
  if (!probabilities.length || probabilities.length !== labels.length) {
    return [];
  }

  const safeBins = Math.max(1, Math.min(50, Math.floor(bins) || 10));
  const bucketData = Array.from({ length: safeBins }, (_, index) => ({
    index,
    lowerBound: index / safeBins,
    upperBound: (index + 1) / safeBins,
    count: 0,
    confidenceSum: 0,
    accuracySum: 0
  }));

  for (let i = 0; i < probabilities.length; i += 1) {
    const probability = clampProbability(probabilities[i]);
    const label = labels[i];
    const index = Math.min(safeBins - 1, Math.floor(probability * safeBins));
    const bucket = bucketData[index];
    bucket.count += 1;
    bucket.confidenceSum += probability;
    bucket.accuracySum += label;
  }

  return bucketData.map((bucket) => ({
    index: bucket.index,
    lowerBound: bucket.lowerBound,
    upperBound: bucket.upperBound,
    count: bucket.count,
    averageConfidence: bucket.count > 0 ? bucket.confidenceSum / bucket.count : 0,
    averageAccuracy: bucket.count > 0 ? bucket.accuracySum / bucket.count : 0
  }));
}

export function clampProbability(value: number): number {
  if (!Number.isFinite(value)) {
    return 0.5;
  }
  return Math.max(0, Math.min(value, 1));
}
