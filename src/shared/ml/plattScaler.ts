export interface CalibrationSample {
  score: number;
  label: 0 | 1;
  weight?: number;
}

export interface CalibrationState {
  a: number;
  b: number;
  fittedAt: number;
  holdoutSize: number;
  ece: number;
}

export interface CalibrationFitResult extends CalibrationState {
  changed: boolean;
}

/**
 * Platt scaling over model score (logit).
 */
export class PlattScaler {
  private a: number;
  private b: number;
  private fittedAt: number;
  private holdoutSize: number;
  private ece: number;

  constructor(state?: Partial<CalibrationState>) {
    this.a = Number.isFinite(state?.a) ? (state?.a as number) : 1;
    this.b = Number.isFinite(state?.b) ? (state?.b as number) : 0;
    this.fittedAt = Number.isFinite(state?.fittedAt) ? (state?.fittedAt as number) : 0;
    this.holdoutSize = Number.isFinite(state?.holdoutSize) ? (state?.holdoutSize as number) : 0;
    this.ece = Number.isFinite(state?.ece) ? (state?.ece as number) : 0;
  }

  isFitted(): boolean {
    return this.fittedAt > 0;
  }

  transform(score: number): number {
    return sigmoid(this.a * score + this.b);
  }

  fit(samples: CalibrationSample[]): CalibrationFitResult {
    const usable = samples
      .filter((sample) => Number.isFinite(sample.score))
      .map((sample) => ({
        score: sample.score,
        label: sample.label,
        weight: clampWeight(sample.weight)
      }));

    if (usable.length < 25) {
      return this.getState(false);
    }

    let a = this.a;
    let b = this.b;
    const learningRate = 0.01;
    const regularization = 1e-4;
    const epochs = 250;

    for (let epoch = 0; epoch < epochs; epoch += 1) {
      let gradA = 0;
      let gradB = 0;

      for (let i = 0; i < usable.length; i += 1) {
        const sample = usable[i];
        const prediction = sigmoid(a * sample.score + b);
        const error = (prediction - sample.label) * sample.weight;
        gradA += error * sample.score;
        gradB += error;
      }

      gradA = gradA / usable.length + regularization * a;
      gradB = gradB / usable.length + regularization * b;
      a -= learningRate * gradA;
      b -= learningRate * gradB;

      // Keep monotonicity: higher score must not map to lower probability.
      if (!Number.isFinite(a) || a < 1e-6) {
        a = 1e-6;
      }
      if (!Number.isFinite(b)) {
        b = 0;
      }
    }

    this.a = a;
    this.b = b;
    this.fittedAt = Date.now();
    this.holdoutSize = usable.length;
    this.ece = calculateExpectedCalibrationError(
      usable.map((sample) => this.transform(sample.score)),
      usable.map((sample) => sample.label),
      10
    );

    return this.getState(true);
  }

  getState(changed = false): CalibrationFitResult {
    return {
      a: this.a,
      b: this.b,
      fittedAt: this.fittedAt,
      holdoutSize: this.holdoutSize,
      ece: this.ece,
      changed
    };
  }
}

export function calculateExpectedCalibrationError(
  probabilities: number[],
  labels: Array<0 | 1>,
  bins = 10
): number {
  if (!probabilities.length || probabilities.length !== labels.length) {
    return 0;
  }
  const safeBins = Math.max(1, Math.min(50, bins));
  const bucketData = Array.from({ length: safeBins }, () => ({
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

  let weightedError = 0;
  for (let i = 0; i < bucketData.length; i += 1) {
    const bucket = bucketData[i];
    if (bucket.count === 0) {
      continue;
    }
    const avgConfidence = bucket.confidenceSum / bucket.count;
    const avgAccuracy = bucket.accuracySum / bucket.count;
    weightedError += (bucket.count / probabilities.length) * Math.abs(avgConfidence - avgAccuracy);
  }
  return weightedError;
}

function sigmoid(value: number): number {
  if (value >= 0) {
    const exp = Math.exp(-value);
    return 1 / (1 + exp);
  }
  const exp = Math.exp(value);
  return exp / (1 + exp);
}

function clampProbability(value: number): number {
  if (!Number.isFinite(value)) {
    return 0.5;
  }
  return Math.max(0, Math.min(value, 1));
}

function clampWeight(value: number | undefined): number {
  if (!Number.isFinite(value)) {
    return 1;
  }
  return Math.max(0.05, Math.min(value as number, 10));
}
