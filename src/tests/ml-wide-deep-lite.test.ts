/// <reference path="../types/node-test.d.ts" />
import test from 'node:test';
import assert from 'node:assert/strict';
import { WideDeepLiteBinary } from '../shared/ml/wideDeepLite.js';
import type { SparseVector } from '../shared/ml/vectorizer.js';

const CONFIG = {
  dimensions: 128,
  embeddingDim: 4,
  hiddenDim: 6,
  lrWide: 0.03,
  lrDeep: 0.01,
  l2: 1e-4,
  clipGradient: 1.0
} as const;

const VECTOR: SparseVector = {
  indices: [2, 15, 70],
  values: [1, -0.5, 2]
};

test('wide-deep update reacts more strongly to explicit than implicit weight', () => {
  const implicitModel = new WideDeepLiteBinary(CONFIG, { seed: 7 });
  const explicitModel = new WideDeepLiteBinary(CONFIG, { seed: 7 });

  const base = implicitModel.predictProbability(VECTOR);
  implicitModel.update(VECTOR, 1, 0.25);
  explicitModel.update(VECTOR, 1, 1.0);

  const implicitDelta = implicitModel.predictProbability(VECTOR) - base;
  const explicitDelta = explicitModel.predictProbability(VECTOR) - base;

  assert.ok(explicitDelta > implicitDelta);
});

test('wide-deep keeps finite state under aggressive updates due clipping', () => {
  const model = new WideDeepLiteBinary(CONFIG, { seed: 11 });
  for (let i = 0; i < 200; i += 1) {
    model.update(VECTOR, i % 2 === 0 ? 1 : 0, 10);
  }

  const state = model.getState();
  const values = [
    ...state.wideWeights.slice(0, 8),
    ...state.hiddenWeights.slice(0, 8),
    ...state.outWeights.slice(0, 6),
    state.wideBias,
    state.outBias
  ];

  values.forEach((value) => {
    assert.equal(Number.isFinite(value), true);
  });

  const probability = model.predictProbability(VECTOR);
  assert.ok(probability >= 0 && probability <= 1);
});
