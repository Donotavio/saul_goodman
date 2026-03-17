import {
  buildBaselineSnapshotFromSamples,
  evaluateValidationGate,
  type ValidationBaselineSnapshot,
  type ValidationSummary,
  type ValidationSample
} from './validationGate.js';
import { clamp } from './utils.js';

export interface ReplaySample {
  timestamp: number;
  label: 0 | 1;
  weight?: number;
  baselinePrediction: 0 | 1;
  naturalPrediction: 0 | 1;
  naturalProbability: number;
  naturalSelfPrediction?: 0 | 1;
  naturalSelfProbability?: number;
}

export interface ReplayScenarioMetrics {
  name: 'baseline' | 'natural' | 'natural+self';
  summary: ValidationSummary;
  baseline: ValidationBaselineSnapshot;
}

export interface ReplayHarnessResult {
  sampleSize: number;
  scenarios: ReplayScenarioMetrics[];
}

export async function runReplayAblation(
  samples: ReplaySample[],
  options?: {
    bootstrapIterations?: number;
    bootstrapSeed?: number;
    minSamples?: number;
  }
): Promise<ReplayHarnessResult> {
  const ordered = [...samples]
    .filter((sample) => Number.isFinite(sample.timestamp))
    .sort((a, b) => a.timestamp - b.timestamp);

  const baselineSamples: ValidationSample[] = ordered.map((sample) => ({
    label: sample.label,
    weight: sample.weight ?? 1,
    baselinePrediction: sample.baselinePrediction,
    modelPrediction: sample.baselinePrediction,
    modelProbability: sample.baselinePrediction === 1 ? 0.8 : 0.2
  }));
  const baseline = buildBaselineSnapshotFromSamples(baselineSamples, Date.now());

  const naturalSamples: ValidationSample[] = ordered.map((sample) => ({
    label: sample.label,
    weight: sample.weight ?? 1,
    baselinePrediction: sample.baselinePrediction,
    modelPrediction: sample.naturalPrediction,
    modelProbability: clamp(sample.naturalProbability, 0, 1)
  }));
  const natural = await evaluateValidationGate(naturalSamples, baseline, {
    bootstrapIterations: options?.bootstrapIterations ?? 1000,
    bootstrapSeed: options?.bootstrapSeed ?? 4242,
    minSamples: options?.minSamples ?? 50
  });

  const naturalSelfSamples: ValidationSample[] = ordered.map((sample) => ({
    label: sample.label,
    weight: sample.weight ?? 1,
    baselinePrediction: sample.baselinePrediction,
    modelPrediction: sample.naturalSelfPrediction ?? sample.naturalPrediction,
    modelProbability: clamp(sample.naturalSelfProbability ?? sample.naturalProbability, 0, 1)
  }));
  const naturalSelf = await evaluateValidationGate(naturalSelfSamples, baseline, {
    bootstrapIterations: options?.bootstrapIterations ?? 1000,
    bootstrapSeed: (options?.bootstrapSeed ?? 4242) + 1,
    minSamples: options?.minSamples ?? 50
  });

  return {
    sampleSize: ordered.length,
    scenarios: [
      {
        name: 'baseline',
        baseline,
        summary: baselineAsSummary(baseline, ordered.length)
      },
      {
        name: 'natural',
        baseline: natural.baseline,
        summary: natural.summary
      },
      {
        name: 'natural+self',
        baseline: naturalSelf.baseline,
        summary: naturalSelf.summary
      }
    ]
  };
}

function baselineAsSummary(baseline: ValidationBaselineSnapshot, sampleSize: number): ValidationSummary {
  return {
    sampleSize,
    macroF1: baseline.macroF1,
    precisionProductive: baseline.precisionProductive,
    falseProductiveRate: baseline.falseProductiveRate,
    ece: 0,
    brier: 0,
    deltaMacroF1: 0,
    deltaMacroF1CiLower: 0,
    deltaMacroF1CiUpper: 0,
    mcnemarPValue: 1,
    gatePassed: false
  };
}

