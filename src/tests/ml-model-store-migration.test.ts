/// <reference path="../types/node-test.d.ts" />
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveWideWarmStart,
  type LegacyStoredModelState,
  type StoredModelStateV2,
  type StoredModelStateV3
} from '../shared/ml/modelStore.js';

function computeFtrlWeight(
  z: number,
  n: number,
  alpha: number,
  beta: number,
  l1: number,
  l2: number
): number {
  if (Math.abs(z) <= l1) {
    return 0;
  }
  const sign = z < 0 ? -1 : 1;
  const numerator = -(z - sign * l1);
  const denominator = (beta + Math.sqrt(n)) / alpha + l2;
  return numerator / denominator;
}

test('deriveWideWarmStart copies legacy logistic weights and bias', () => {
  const legacy: LegacyStoredModelState = {
    version: 1,
    dimensions: 4,
    weights: [0.2, -0.1, 0.5, 0.0],
    bias: -0.25,
    featureCounts: [10, 10, 10, 10],
    totalUpdates: 12,
    lastUpdated: Date.now()
  };

  const warm = deriveWideWarmStart(legacy, 8);
  assert.equal(warm.source, 'legacy');
  assert.equal(warm.wideBias, legacy.bias);
  assert.ok(Math.abs(warm.wideWeights[0] - legacy.weights[0]) < 1e-6);
  assert.ok(Math.abs(warm.wideWeights[2] - legacy.weights[2]) < 1e-6);
  assert.equal(warm.wideWeights[7], 0);
});

test('deriveWideWarmStart converts FTRL state into dense wide weights', () => {
  const alpha = 0.05;
  const beta = 1;
  const l1 = 1e-6;
  const l2 = 1e-4;

  const state: StoredModelStateV2 = {
    version: 2,
    schema: 'dual-model-v2',
    legacy: {
      version: 1,
      dimensions: 4,
      weights: [0, 0, 0, 0],
      bias: 0,
      featureCounts: [0, 0, 0, 0],
      totalUpdates: 0,
      lastUpdated: 0
    },
    v2: {
      dimensions: 4,
      alpha,
      beta,
      l1,
      l2,
      z: [1.2, -0.7, 0.0000001, 0.4],
      n: [9, 4, 1, 0.5],
      biasZ: -0.9,
      biasN: 2
    },
    v2FeatureCounts: [0, 0, 0, 0],
    calibration: { a: 1, b: 0, ece: 0, fittedAt: 0, holdoutSize: 0 },
    rollout: {
      stage: 'shadow',
      installBucket: 1,
      shadowStartedAt: 0,
      stageStartedAt: 0,
      lastGateEvaluationAt: 0
    },
    shadow: {
      explicitCount: 0,
      v1: { tp: 0, fp: 0, tn: 0, fn: 0 },
      v2: { tp: 0, fp: 0, tn: 0, fn: 0 },
      lastUpdated: 0
    },
    totalUpdates: 0,
    explicitUpdates: 0,
    implicitUpdates: 0,
    lastUpdated: 0,
    explicitSinceCalibration: 0
  };

  const warm = deriveWideWarmStart(state, 4);
  assert.equal(warm.source, 'v2');
  assert.ok(Math.abs(warm.wideWeights[0] - computeFtrlWeight(1.2, 9, alpha, beta, l1, l2)) < 1e-6);
  assert.ok(Math.abs(warm.wideWeights[1] - computeFtrlWeight(-0.7, 4, alpha, beta, l1, l2)) < 1e-6);
  assert.ok(Math.abs(warm.wideWeights[2] - computeFtrlWeight(0.0000001, 1, alpha, beta, l1, l2)) < 1e-6);
  assert.ok(Math.abs(warm.wideBias - computeFtrlWeight(-0.9, 2, alpha, beta, l1, l2)) < 1e-6);
});

test('single v3 model state does not keep legacy v1/v2 payload', () => {
  const state: StoredModelStateV3 = {
    version: 3,
    schema: 'single-neural-lite-v3',
    model: {
      dimensions: 8,
      embeddingDim: 2,
      hiddenDim: 3,
      lrWide: 0.03,
      lrDeep: 0.01,
      l2: 1e-4,
      clipGradient: 1,
      wideWeights: Array(8).fill(0),
      wideAccum: Array(8).fill(0),
      wideBias: 0,
      wideBiasAccum: 0,
      embeddings: Array(16).fill(0),
      embeddingsAccum: Array(16).fill(0),
      hiddenWeights: Array(6).fill(0),
      hiddenAccum: Array(6).fill(0),
      hiddenBias: Array(3).fill(0),
      hiddenBiasAccum: Array(3).fill(0),
      outWeights: Array(3).fill(0),
      outWeightsAccum: Array(3).fill(0),
      outBias: 0,
      outBiasAccum: 0
    },
    featureCounts: Array(8).fill(0),
    calibration: { a: 1, b: 0, ece: 0, fittedAt: 0, holdoutSize: 0 },
    guardrailStage: 'guarded',
    validationBaseline: null,
    validation: null,
    totalUpdates: 0,
    explicitUpdates: 0,
    implicitUpdates: 0,
    lastUpdated: 0,
    explicitSinceCalibration: 0
  };

  assert.equal('legacy' in state, false);
  assert.equal('v2' in state, false);
});
