/// <reference path="../types/node-test.d.ts" />
import test from 'node:test';
import assert from 'node:assert/strict';
import { FeatureVectorizer, hashFeature } from '../shared/ml/vectorizer.js';

test('vectorizer does not update frequency counters during inference path', () => {
  const vectorizer = new FeatureVectorizer({ dimensions: 256, minFeatureCount: 2 });
  const features = {
    'host:example.com': 1,
    'beh:freq14d:<=7': 1
  };

  const before = vectorizer.getCounts();
  const hostIndex = hashFeature('host:example.com', vectorizer.dimensions).index;
  const behaviorIndex = hashFeature('beh:freq14d:<=7', vectorizer.dimensions).index;
  assert.equal(before[hostIndex], 0);
  assert.equal(before[behaviorIndex], 0);

  vectorizer.vectorize(features, { updateCounts: false, applyMinCount: false });

  const after = vectorizer.getCounts();
  assert.equal(after[hostIndex], 0);
  assert.equal(after[behaviorIndex], 0);
});

test('vectorizer increments counters only when explicitly requested', () => {
  const vectorizer = new FeatureVectorizer({ dimensions: 256, minFeatureCount: 2 });
  const features = {
    'host:example.com': 1
  };

  const first = vectorizer.vectorize(features, { updateCounts: true, applyMinCount: true });
  assert.equal(first.indices.length, 0);

  const second = vectorizer.vectorize(features, { updateCounts: true, applyMinCount: true });
  assert.equal(second.indices.length, 1);
});
