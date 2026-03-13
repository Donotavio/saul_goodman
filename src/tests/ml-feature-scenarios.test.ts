/// <reference path="../types/node-test.d.ts" />
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildVectorFeatureNames,
  featureNameContainsAttentionSignal,
  projectFeatureMap,
  splitFeatureNames
} from '../shared/ml/featureScenarios.js';
import { FeatureVectorizer } from '../shared/ml/vectorizer.js';

test('projectFeatureMap keeps only semantic and natural signals for natural scenario', () => {
  const projected = projectFeatureMap(
    {
      'sem:intent:docs': 1,
      'nat:attention:switch_rate_10m': 0.4,
      'beh:freq1d:<=1': 1,
      'host:example.com': 1,
      'heur:class:productive': 1
    },
    'natural'
  );

  assert.deepEqual(projected, {
    'sem:intent:docs': 1,
    'nat:attention:switch_rate_10m': 0.4
  });
});

test('projectFeatureMap keeps behavior signals for natural+self scenario', () => {
  const projected = projectFeatureMap(
    {
      'sem:intent:docs': 1,
      'nat:context:schedule_fit': 1,
      'beh:freq7d:<=2': 1,
      'host:example.com': 1
    },
    'natural+self'
  );

  assert.deepEqual(projected, {
    'sem:intent:docs': 1,
    'nat:context:schedule_fit': 1,
    'beh:freq7d:<=2': 1
  });
});

test('buildVectorFeatureNames and attention detection handle joined feature names', () => {
  const features = {
    'host:example.com': 1,
    'nat:attention:switch_rate_10m': 0.75,
    'beh:freq7d:<=2': 1
  };
  const vectorizer = new FeatureVectorizer({ dimensions: 128, minFeatureCount: 1 });
  const vector = vectorizer.vectorize(features, {
    updateCounts: false,
    applyMinCount: false
  });

  const featureNames = buildVectorFeatureNames(features, vector, vectorizer.dimensions);
  assert.equal(featureNames.length, vector.indices.length);
  assert.ok(featureNames.some((entry) => entry.includes('host:example.com')));
  assert.ok(featureNames.some((entry) => entry.includes('nat:attention:switch_rate_10m')));
  assert.ok(featureNames.some((entry) => featureNameContainsAttentionSignal(entry)));
  assert.deepEqual(
    splitFeatureNames('host:example.com|nat:attention:switch_rate_10m'),
    ['host:example.com', 'nat:attention:switch_rate_10m']
  );
});
