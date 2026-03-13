/// <reference path="../types/node-test.d.ts" />
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveStoredSplit, type StoredTrainingExample } from '../shared/ml/trainingStore.js';

function makeExample(overrides: Partial<StoredTrainingExample>): StoredTrainingExample {
  return {
    createdAt: 1,
    domain: 'example.com',
    source: 'explicit',
    split: 'train',
    label: 1,
    weight: 1,
    vector: { indices: [1], values: [1] },
    ...overrides
  };
}

test('resolveStoredSplit preserves explicit split values', () => {
  assert.equal(resolveStoredSplit(makeExample({ split: 'train' })), 'train');
  assert.equal(resolveStoredSplit(makeExample({ split: 'calibration' })), 'calibration');
  assert.equal(resolveStoredSplit(makeExample({ split: 'test' })), 'test');
});

test('resolveStoredSplit maps legacy holdout rows to calibration', () => {
  const legacy = makeExample({
    split: undefined as unknown as 'train',
    isHoldout: true,
    v1Prediction: 0,
    v2Prediction: 1,
    v2Score: 0.12
  });

  assert.equal(resolveStoredSplit(legacy), 'calibration');
});

test('resolveStoredSplit keeps non-holdout legacy rows in train', () => {
  const legacy = makeExample({
    split: undefined as unknown as 'train',
    isHoldout: false,
    v1Prediction: 1,
    v2Prediction: 1,
    v2Score: 0.84
  });

  assert.equal(resolveStoredSplit(legacy), 'train');
});
