import { calculateExpectedCalibrationError } from './plattScaler.js';

export interface ValidationSample {
  label: 0 | 1;
  weight?: number;
  baselinePrediction: 0 | 1;
  modelPrediction: 0 | 1;
  modelProbability: number;
}

export interface ValidationBaselineSnapshot {
  macroF1: number;
  precisionProductive: number;
  falseProductiveRate: number;
  sampleSize: number;
  capturedAt: number;
}

export interface ValidationSummary {
  sampleSize: number;
  macroF1: number;
  precisionProductive: number;
  falseProductiveRate: number;
  ece: number;
  brier: number;
  deltaMacroF1: number;
  deltaMacroF1CiLower: number;
  deltaMacroF1CiUpper: number;
  mcnemarPValue: number;
  gatePassed: boolean;
}

export interface ValidationGateConfig {
  bootstrapIterations?: number;
  bootstrapSeed?: number;
  minSamples?: number;
}

export interface ValidationGateResult {
  baseline: ValidationBaselineSnapshot;
  summary: ValidationSummary;
}

interface BinaryConfusion {
  tp: number;
  fp: number;
  tn: number;
  fn: number;
}

interface WeightedMetrics {
  confusion: BinaryConfusion;
  macroF1: number;
  precisionProductive: number;
  falseProductiveRate: number;
}

const DEFAULT_CONFIG: Required<ValidationGateConfig> = {
  bootstrapIterations: 1000,
  bootstrapSeed: 12345,
  minSamples: 50
};

export function evaluateValidationGate(
  samples: ValidationSample[],
  previousBaseline?: ValidationBaselineSnapshot | null,
  config?: ValidationGateConfig
): ValidationGateResult {
  const options = { ...DEFAULT_CONFIG, ...(config ?? {}) };
  const usable = normalizeSamples(samples);
  const fallbackBaseline = previousBaseline ?? createEmptyBaseline();

  if (!usable.length) {
    return {
      baseline: fallbackBaseline,
      summary: {
        sampleSize: 0,
        macroF1: 0,
        precisionProductive: 0,
        falseProductiveRate: 0,
        ece: 0,
        brier: 0,
        deltaMacroF1: 0,
        deltaMacroF1CiLower: 0,
        deltaMacroF1CiUpper: 0,
        mcnemarPValue: 1,
        gatePassed: false
      }
    };
  }

  const currentMetrics = computeWeightedMetrics(
    usable.map((sample) => ({
      label: sample.label,
      prediction: sample.modelPrediction,
      weight: sample.weight
    }))
  );

  const baselineFromSamples = buildBaselineSnapshotFromSamples(usable);
  const baseline = chooseBaseline(fallbackBaseline, baselineFromSamples, options.minSamples);

  const deltaMacroF1 = currentMetrics.macroF1 - baseline.macroF1;
  const bootstrap = bootstrapDeltaMacroF1(usable, options.bootstrapIterations, options.bootstrapSeed);
  const mcnemarPValue = computeMcNemarPValue(usable);
  const brier = computeWeightedBrier(usable);
  const ece = calculateExpectedCalibrationError(
    usable.map((sample) => clampProbability(sample.modelProbability)),
    usable.map((sample) => sample.label),
    10
  );

  const falseProductiveImprovement = baseline.falseProductiveRate - currentMetrics.falseProductiveRate;
  const relativeFprImprovement = baseline.falseProductiveRate > 0
    ? falseProductiveImprovement / baseline.falseProductiveRate
    : 0;
  const precisionDrop = currentMetrics.precisionProductive - baseline.precisionProductive;

  const enoughSamples = usable.length >= options.minSamples;
  const fprGate = falseProductiveImprovement >= 0.01 || relativeFprImprovement >= 0.10;
  const precisionGate = precisionDrop >= -0.01;
  const macroF1Gate = bootstrap.lower >= 0;
  const mcnemarGate = mcnemarPValue < 0.05 && falseProductiveImprovement > 0;

  return {
    baseline,
    summary: {
      sampleSize: usable.length,
      macroF1: currentMetrics.macroF1,
      precisionProductive: currentMetrics.precisionProductive,
      falseProductiveRate: currentMetrics.falseProductiveRate,
      ece,
      brier,
      deltaMacroF1,
      deltaMacroF1CiLower: bootstrap.lower,
      deltaMacroF1CiUpper: bootstrap.upper,
      mcnemarPValue,
      gatePassed: enoughSamples && fprGate && precisionGate && macroF1Gate && mcnemarGate
    }
  };
}

export function buildBaselineSnapshotFromSamples(
  samples: ValidationSample[],
  capturedAt = Date.now()
): ValidationBaselineSnapshot {
  const usable = normalizeSamples(samples);
  const metrics = computeWeightedMetrics(
    usable.map((sample) => ({
      label: sample.label,
      prediction: sample.baselinePrediction,
      weight: sample.weight
    }))
  );
  return {
    macroF1: metrics.macroF1,
    precisionProductive: metrics.precisionProductive,
    falseProductiveRate: metrics.falseProductiveRate,
    sampleSize: usable.length,
    capturedAt
  };
}

function chooseBaseline(
  previous: ValidationBaselineSnapshot,
  fromSamples: ValidationBaselineSnapshot,
  minSamples: number
): ValidationBaselineSnapshot {
  if (previous.sampleSize >= minSamples) {
    return previous;
  }
  if (fromSamples.sampleSize >= minSamples) {
    return fromSamples;
  }
  if (fromSamples.sampleSize > previous.sampleSize) {
    return fromSamples;
  }
  return previous;
}

function bootstrapDeltaMacroF1(
  samples: Array<Required<ValidationSample>>,
  iterations: number,
  seed: number
): { lower: number; upper: number } {
  if (!samples.length || iterations <= 0) {
    return { lower: 0, upper: 0 };
  }
  const rng = createSeededRandom(seed);
  const n = samples.length;
  const deltas: number[] = [];

  for (let i = 0; i < iterations; i += 1) {
    const resample: Required<ValidationSample>[] = [];
    for (let j = 0; j < n; j += 1) {
      const index = Math.floor(rng() * n);
      resample.push(samples[Math.max(0, Math.min(n - 1, index))]);
    }

    const modelMetrics = computeWeightedMetrics(
      resample.map((sample) => ({
        label: sample.label,
        prediction: sample.modelPrediction,
        weight: sample.weight
      }))
    );
    const baselineMetrics = computeWeightedMetrics(
      resample.map((sample) => ({
        label: sample.label,
        prediction: sample.baselinePrediction,
        weight: sample.weight
      }))
    );
    deltas.push(modelMetrics.macroF1 - baselineMetrics.macroF1);
  }

  deltas.sort((a, b) => a - b);
  const lowerIndex = Math.max(0, Math.floor(0.025 * (deltas.length - 1)));
  const upperIndex = Math.max(0, Math.floor(0.975 * (deltas.length - 1)));
  return {
    lower: deltas[lowerIndex] ?? 0,
    upper: deltas[upperIndex] ?? 0
  };
}

function computeWeightedBrier(samples: Array<Required<ValidationSample>>): number {
  let weightedError = 0;
  let totalWeight = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const sample = samples[i];
    const weight = sample.weight;
    const probability = clampProbability(sample.modelProbability);
    const diff = probability - sample.label;
    weightedError += weight * diff * diff;
    totalWeight += weight;
  }
  if (totalWeight <= 0) {
    return 0;
  }
  return weightedError / totalWeight;
}

function computeMcNemarPValue(samples: Array<Required<ValidationSample>>): number {
  let b = 0;
  let c = 0;

  for (let i = 0; i < samples.length; i += 1) {
    const sample = samples[i];
    const baselineCritical = sample.label === 0 && sample.baselinePrediction === 1;
    const modelCritical = sample.label === 0 && sample.modelPrediction === 1;
    if (baselineCritical && !modelCritical) {
      b += 1;
    } else if (!baselineCritical && modelCritical) {
      c += 1;
    }
  }

  const total = b + c;
  if (total <= 0) {
    return 1;
  }

  const chiSquare = Math.pow(Math.abs(b - c) - 1, 2) / total;
  return chiSquareSurvival1df(chiSquare);
}

function chiSquareSurvival1df(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 1;
  }
  // For 1 degree of freedom: survival = erfc(sqrt(x/2)).
  const z = Math.sqrt(value / 2);
  return erfc(z);
}

function erfc(x: number): number {
  const z = Math.abs(x);
  const t = 1 / (1 + 0.5 * z);
  const tau = t * Math.exp(
    -z * z -
      1.26551223 +
      t * (1.00002368 +
        t * (0.37409196 +
          t * (0.09678418 +
            t * (-0.18628806 +
              t * (0.27886807 +
                t * (-1.13520398 +
                  t * (1.48851587 + t * (-0.82215223 + t * 0.17087277))))))))
  );
  return x >= 0 ? tau : 2 - tau;
}

function computeWeightedMetrics(
  samples: Array<{ label: 0 | 1; prediction: 0 | 1; weight: number }>
): WeightedMetrics {
  let tp = 0;
  let fp = 0;
  let tn = 0;
  let fn = 0;

  for (let i = 0; i < samples.length; i += 1) {
    const sample = samples[i];
    const weight = clampWeight(sample.weight);
    if (sample.prediction === 1 && sample.label === 1) tp += weight;
    if (sample.prediction === 1 && sample.label === 0) fp += weight;
    if (sample.prediction === 0 && sample.label === 0) tn += weight;
    if (sample.prediction === 0 && sample.label === 1) fn += weight;
  }

  const precisionPositive = safeDivide(tp, tp + fp);
  const recallPositive = safeDivide(tp, tp + fn);
  const f1Positive = f1(precisionPositive, recallPositive);

  const precisionNegative = safeDivide(tn, tn + fn);
  const recallNegative = safeDivide(tn, tn + fp);
  const f1Negative = f1(precisionNegative, recallNegative);

  const macroF1 = (f1Positive + f1Negative) / 2;
  const falseProductiveRate = safeDivide(fp, fp + tn);

  return {
    confusion: { tp, fp, tn, fn },
    macroF1,
    precisionProductive: precisionPositive,
    falseProductiveRate
  };
}

function normalizeSamples(samples: ValidationSample[]): Array<Required<ValidationSample>> {
  return samples
    .filter((sample) => sample && typeof sample === 'object')
    .map((sample) => ({
      label: sample.label === 1 ? 1 : 0,
      baselinePrediction: sample.baselinePrediction === 1 ? 1 : 0,
      modelPrediction: sample.modelPrediction === 1 ? 1 : 0,
      modelProbability: clampProbability(sample.modelProbability),
      weight: clampWeight(sample.weight)
    }));
}

function createEmptyBaseline(): ValidationBaselineSnapshot {
  return {
    macroF1: 0,
    precisionProductive: 0,
    falseProductiveRate: 1,
    sampleSize: 0,
    capturedAt: 0
  };
}

function safeDivide(numerator: number, denominator: number): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
    return 0;
  }
  return numerator / denominator;
}

function f1(precision: number, recall: number): number {
  if (precision <= 0 || recall <= 0) {
    return 0;
  }
  return (2 * precision * recall) / (precision + recall);
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

function createSeededRandom(seed: number): () => number {
  let state = Math.max(1, Math.floor(seed) || 1);
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}
