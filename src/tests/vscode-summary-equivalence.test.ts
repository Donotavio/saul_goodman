/// <reference path="../types/node-test.d.ts" />
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { normalizeVscodeTrackingSummary } from '../shared/vscode-summary.js';

const require = createRequire(import.meta.url);
const { splitDurationByDay } = require('../../saul-daemon/src/vscode-aggregation.cjs');

function legacyAggregate(durations: Array<{ startTime: number; endTime: number; project?: string; language?: string }>, startMs: number, endMs: number) {
  const timeline: Array<{ startTime: number; endTime: number; durationMs: number }> = [];
  const switchHourly = Array.from({ length: 24 }, () => 0);
  let totalActiveMs = 0;
  let sessions = 0;

  for (const duration of durations) {
    const project = (duration.project ?? '').trim();
    const language = (duration.language ?? '').trim();
    if (!project || project.toLowerCase() === 'unknown' || !language || language.toLowerCase() === 'unknown') {
      continue;
    }
    if (duration.endTime <= startMs || duration.startTime >= endMs) {
      continue;
    }
    sessions += 1;
    const hour = new Date(duration.startTime).getHours();
    if (switchHourly[hour] !== undefined) {
      switchHourly[hour] += 1;
    }
    const sliceStart = Math.max(duration.startTime, startMs);
    const sliceEnd = Math.min(duration.endTime, endMs);
    if (sliceEnd <= sliceStart) {
      continue;
    }
    const sliceDuration = sliceEnd - sliceStart;
    totalActiveMs += sliceDuration;
    timeline.push({ startTime: sliceStart, endTime: sliceEnd, durationMs: sliceDuration });
  }

  timeline.sort((a, b) => a.startTime - b.startTime);
  return { totalActiveMs, sessions, switches: sessions, switchHourly, timeline };
}

function buildTrackingSummaryPayload(durations: Array<{ startTime: number; endTime: number; project?: string; language?: string }>, startMs: number, endMs: number) {
  const timeline: Array<{ startTime: number; endTime: number; durationMs: number }> = [];
  const switchHourly = Array.from({ length: 24 }, () => 0);
  let totalActiveMs = 0;
  let sessions = 0;

  for (const duration of durations) {
    const project = (duration.project ?? '').trim();
    const language = (duration.language ?? '').trim();
    if (!project || project.toLowerCase() === 'unknown' || !language || language.toLowerCase() === 'unknown') {
      continue;
    }
    if (duration.endTime <= startMs || duration.startTime >= endMs) {
      continue;
    }
    sessions += 1;
    const hour = new Date(duration.startTime).getHours();
    if (switchHourly[hour] !== undefined) {
      switchHourly[hour] += 1;
    }
    const slices = splitDurationByDay(duration, startMs, endMs);
    for (const slice of slices) {
      totalActiveMs += slice.durationMs;
      timeline.push({
        startTime: slice.startTime,
        endTime: slice.endTime,
        durationMs: slice.durationMs
      });
    }
  }

  timeline.sort((a, b) => a.startTime - b.startTime);
  return { totalActiveMs, sessions, switches: sessions, switchHourly, timeline };
}

test('tracking summary matches legacy aggregation for fixed fixtures', () => {
  const startMs = 0;
  const endMs = 24 * 60 * 60 * 1000;
  const durations = [
    { startTime: 60 * 60 * 1000, endTime: 2 * 60 * 60 * 1000, project: 'proj', language: 'ts' },
    { startTime: 23 * 60 * 60 * 1000, endTime: 25 * 60 * 60 * 1000, project: 'proj', language: 'ts' },
    { startTime: 3 * 60 * 60 * 1000, endTime: 4 * 60 * 60 * 1000, project: 'unknown', language: 'ts' }
  ];

  const legacy = legacyAggregate(durations, startMs, endMs);
  const payload = buildTrackingSummaryPayload(durations, startMs, endMs);
  const normalized = normalizeVscodeTrackingSummary(payload);

  assert.equal(normalized.totalActiveMs, legacy.totalActiveMs);
  assert.equal(normalized.sessions, legacy.sessions);
  assert.deepEqual(normalized.switchHourly, legacy.switchHourly);
  assert.equal(normalized.timeline.length, legacy.timeline.length);
});
