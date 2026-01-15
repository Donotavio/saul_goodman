/// <reference path="../types/node-test.d.ts" />
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const aggregationPath = pathToFileURL(
  path.join(process.cwd(), 'saul-daemon', 'src', 'vscode-aggregation.cjs')
).href;

test('buildDurations splits on gaps and group changes', async () => {
  const { buildDurations } = await import(aggregationPath);
  const base = Date.UTC(2024, 0, 1, 10, 0, 0);
  const heartbeats = [
    {
      id: 'a',
      time: base,
      entityType: 'file',
      entity: 'hash-1',
      project: 'saul',
      language: 'ts',
      category: 'coding',
      editor: 'vscode',
      machineId: 'm1',
      isWrite: true
    },
    {
      id: 'b',
      time: base + 60_000,
      entityType: 'file',
      entity: 'hash-1',
      project: 'saul',
      language: 'ts',
      category: 'coding',
      editor: 'vscode',
      machineId: 'm1',
      isWrite: false
    },
    {
      id: 'c',
      time: base + 120_000,
      entityType: 'file',
      entity: 'hash-2',
      project: 'saul',
      language: 'ts',
      category: 'coding',
      editor: 'vscode',
      machineId: 'm1',
      isWrite: false
    },
    {
      id: 'd',
      time: base + 8 * 60_000,
      entityType: 'file',
      entity: 'hash-2',
      project: 'saul',
      language: 'ts',
      category: 'coding',
      editor: 'vscode',
      machineId: 'm1',
      isWrite: true
    }
  ];

  const durations = buildDurations(heartbeats, {
    gapMs: 5 * 60_000,
    graceMs: 60_000
  });

  assert.equal(durations.length, 3);
  assert.equal(durations[0].startTime, base);
  assert.equal(durations[0].endTime, base + 120_000);
  assert.equal(durations[0].durationMs, 120_000);
  assert.equal(durations[1].startTime, base + 120_000);
  assert.equal(durations[1].endTime, base + 180_000);
  assert.equal(durations[1].durationMs, 60_000);
  assert.equal(durations[2].startTime, base + 8 * 60_000);
  assert.equal(durations[2].endTime, base + 9 * 60_000);
  assert.equal(durations[2].durationMs, 60_000);
});

test('buildDurations aggregates metadata per segment', async () => {
  const { buildDurations } = await import(aggregationPath);
  const base = Date.UTC(2024, 0, 1, 12, 0, 0);
  const heartbeats = [
    {
      id: 'e',
      time: base,
      entityType: 'file',
      entity: 'hash-3',
      project: 'saul',
      language: 'ts',
      category: 'coding',
      editor: 'vscode',
      machineId: 'm1',
      metadata: { linesAdded: 3, linesRemoved: 1 }
    },
    {
      id: 'f',
      time: base + 30_000,
      entityType: 'file',
      entity: 'hash-3',
      project: 'saul',
      language: 'ts',
      category: 'coding',
      editor: 'vscode',
      machineId: 'm1',
      metadata: { linesAdded: 2, linesRemoved: 4, branch: 'main' }
    }
  ];

  const [duration] = buildDurations(heartbeats, {
    gapMs: 5 * 60_000,
    graceMs: 0
  });

  assert.equal(duration.metadata.linesAdded, 5);
  assert.equal(duration.metadata.linesRemoved, 5);
  assert.equal(duration.metadata.branch, 'main');
});
