/// <reference path="../types/node-test.d.ts" />
import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyDomain, type ClassificationResult } from '../shared/domain-classifier.js';

function resultFor(
  hostname: string,
  overrides: Partial<Parameters<typeof classifyDomain>[0]> = {}
): ClassificationResult {
  return classifyDomain({
    hostname,
    hasVideoPlayer: false,
    hasInfiniteScroll: false,
    ...overrides
  });
}

test('known productive hosts win decisively', () => {
  const res = resultFor('docs.google.com');
  assert.equal(res.classification, 'productive');
  assert.ok(res.confidence >= 60);
  assert.ok(res.reasons.some((r) => r.includes('Host conhecido')));
});

test('known procrastination hosts win decisively', () => {
  const res = resultFor('youtube.com');
  assert.equal(res.classification, 'procrastination');
  assert.ok(res.confidence >= 60);
});

test('keywords tilt classification when host is unknown', () => {
  const res = resultFor('example.com', { title: 'Amazing video stream with shorts' });
  assert.equal(res.classification, 'procrastination');
  assert.ok(res.reasons.some((r) => r.includes('Palavra-chave')));
});

test('structure signals influence procrastination', () => {
  const res = resultFor('news.example', { hasVideoPlayer: true, hasInfiniteScroll: true });
  assert.equal(res.classification, 'procrastination');
  assert.ok(res.confidence >= 40);
});

test('og:type hints productive content', () => {
  const res = resultFor('blog.example', { ogType: 'article' });
  assert.equal(res.classification, 'productive');
});

test('neutral when signals balance', () => {
  const res = resultFor('mixed.example', {
    title: 'project dashboard',
    description: 'watch amazing clips'
  });
  assert.equal(res.classification, 'neutral');
  assert.ok(res.confidence <= 60);
});
