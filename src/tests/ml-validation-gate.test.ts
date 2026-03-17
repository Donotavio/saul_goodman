/// <reference path="../types/node-test.d.ts" />
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateValidationGate,
  buildBaselineSnapshotFromSamples,
  type ValidationSample
} from '../shared/ml/validationGate.js';

function makeSamplesBetterModel(total = 240): ValidationSample[] {
  const samples: ValidationSample[] = [];

  for (let i = 0; i < total; i += 1) {
    const isPositive = i % 2 === 0;
    const baselinePrediction: 0 | 1 = isPositive ? 1 : i % 5 === 1 ? 1 : 0;
    const modelPrediction: 0 | 1 = isPositive ? 1 : i % 11 === 1 ? 1 : 0;
    const modelProbability = modelPrediction === 1 ? 0.82 : 0.18;

    samples.push({
      label: isPositive ? 1 : 0,
      baselinePrediction,
      modelPrediction,
      modelProbability,
      weight: 1
    });
  }

  return samples;
}

test('validation gate passes when false productive errors are significantly reduced', async () => {
  const samples = makeSamplesBetterModel();
  const baseline = buildBaselineSnapshotFromSamples(samples, Date.UTC(2026, 2, 12));

  const result = await evaluateValidationGate(samples, baseline, {
    bootstrapIterations: 400,
    bootstrapSeed: 99,
    minSamples: 100
  });

  assert.equal(result.summary.sampleSize, samples.length);
  assert.ok(result.summary.falseProductiveRate < baseline.falseProductiveRate);
  assert.ok(result.summary.deltaMacroF1 >= 0);
  assert.ok(result.summary.deltaMacroF1CiLower >= 0);
  assert.equal(result.summary.gatePassed, true);
});

test('validation gate fails when model increases false productive errors', async () => {
  const samples = makeSamplesBetterModel().map((sample) => ({
    ...sample,
    modelPrediction: sample.label === 0 && sample.baselinePrediction === 0 ? 1 : sample.modelPrediction,
    modelProbability: sample.label === 0 ? 0.76 : sample.modelProbability
  }));
  const baseline = buildBaselineSnapshotFromSamples(samples, Date.UTC(2026, 2, 12));

  const result = await evaluateValidationGate(samples, baseline, {
    bootstrapIterations: 300,
    bootstrapSeed: 123,
    minSamples: 80
  });

  assert.ok(result.summary.falseProductiveRate >= baseline.falseProductiveRate);
  assert.equal(result.summary.gatePassed, false);
});
