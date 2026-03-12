/// <reference path="../types/node-test.d.ts" />
import test from 'node:test';
import assert from 'node:assert/strict';
import { FtrlProximalBinary } from '../shared/ml/ftrlProximal.js';
import { OnlineLogisticRegression } from '../shared/ml/onlineLogisticRegression.js';
import type { SparseVector } from '../shared/ml/vectorizer.js';

const VECTOR: SparseVector = { indices: [3], values: [1] };

test('ftrl update reacts more strongly to explicit weight than implicit weight', () => {
  const implicitModel = new FtrlProximalBinary({
    dimensions: 64,
    alpha: 0.05,
    beta: 1,
    l1: 1e-6,
    l2: 1e-4
  });
  const explicitModel = new FtrlProximalBinary({
    dimensions: 64,
    alpha: 0.05,
    beta: 1,
    l1: 1e-6,
    l2: 1e-4
  });

  const base = implicitModel.predictProbability(VECTOR);
  implicitModel.update(VECTOR, 1, 0.25);
  explicitModel.update(VECTOR, 1, 1.0);

  const implicitDelta = implicitModel.predictProbability(VECTOR) - base;
  const explicitDelta = explicitModel.predictProbability(VECTOR) - base;

  assert.ok(explicitDelta > implicitDelta);
});

test('legacy logistic update also honors sample weights', () => {
  const implicitModel = new OnlineLogisticRegression({
    dimensions: 64,
    learningRate: 0.05,
    l2: 0.0005
  });
  const explicitModel = new OnlineLogisticRegression({
    dimensions: 64,
    learningRate: 0.05,
    l2: 0.0005
  });

  const base = implicitModel.predictProbability(VECTOR);
  implicitModel.update(VECTOR, 0, 0.25);
  explicitModel.update(VECTOR, 0, 1.0);

  const implicitDelta = base - implicitModel.predictProbability(VECTOR);
  const explicitDelta = base - explicitModel.predictProbability(VECTOR);

  assert.ok(explicitDelta > implicitDelta);
});
