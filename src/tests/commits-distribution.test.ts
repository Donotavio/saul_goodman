/// <reference path="../types/node-test.d.ts" />
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildSyntheticCommitsByHour } = require('../../vscode-extension/src/reports/commit-distribution.js');

test('documents_current_behavior_commits_distribution_is_synthetic', () => {
  const totalCommits = 10;
  const distribution = buildSyntheticCommitsByHour(totalCommits);

  assert.equal(distribution.length, 24);
  assert.equal(distribution[9], Math.ceil(totalCommits * 0.2));
  assert.equal(distribution[11], Math.ceil(totalCommits * 0.3));
  assert.equal(distribution[14], Math.ceil(totalCommits * 0.25));
  assert.equal(distribution[16], Math.ceil(totalCommits * 0.15));
  assert.equal(
    distribution[19],
    totalCommits - (distribution[9] + distribution[11] + distribution[14] + distribution[16])
  );
  assert.equal(distribution.reduce((sum: number, value: number) => sum + value, 0), totalCommits);
});
