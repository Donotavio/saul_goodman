/// <reference path="../types/node-test.d.ts" />
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReviewQueue } from '../shared/ml/reviewQueue.js';

test('review queue prioritizes threshold borderline items before uncertainty-only items', () => {
  const queue = buildReviewQueue(
    [
      {
        suggestion: {
          domain: 'borderline.example',
          classification: 'neutral',
          confidence: 62,
          reasons: ['A'],
          timestamp: 100
        },
        probability: 0.73
      },
      {
        suggestion: {
          domain: 'uncertain.example',
          classification: 'neutral',
          confidence: 51,
          reasons: ['B'],
          timestamp: 200
        },
        probability: 0.51
      }
    ],
    {
      productiveThreshold: 0.78,
      procrastinationThreshold: 0.28,
      limit: 20
    }
  );

  assert.equal(queue[0]?.domain, 'borderline.example');
  assert.equal(queue[0]?.queueReason, 'threshold_borderline');
  assert.equal(queue[1]?.queueReason, 'uncertainty_sampling');
});

test('review queue deduplicates by domain and keeps highest-priority candidate', () => {
  const queue = buildReviewQueue(
    [
      {
        suggestion: {
          domain: 'dup.example',
          classification: 'neutral',
          confidence: 54,
          reasons: ['A'],
          timestamp: 10
        },
        probability: 0.54
      },
      {
        suggestion: {
          domain: 'dup.example',
          classification: 'neutral',
          confidence: 70,
          reasons: ['B'],
          timestamp: 20
        },
        probability: 0.76
      }
    ],
    {
      productiveThreshold: 0.78,
      procrastinationThreshold: 0.28
    }
  );

  assert.equal(queue.length, 1);
  assert.equal(queue[0]?.queueReason, 'threshold_borderline');
  assert.equal(queue[0]?.timestamp, 20);
});
