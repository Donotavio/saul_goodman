import type { DailyMetrics } from '../types.js';

/**
 * Resets VS Code metrics fields to a neutral state.
 * @returns true when any field changed.
 */
export function clearVscodeMetrics(metrics: DailyMetrics): boolean {
  let changed = false;

  if (typeof metrics.vscodeActiveMs !== 'number' || metrics.vscodeActiveMs !== 0) {
    metrics.vscodeActiveMs = 0;
    changed = true;
  }

  if (typeof metrics.vscodeSessions !== 'number' || metrics.vscodeSessions !== 0) {
    metrics.vscodeSessions = 0;
    changed = true;
  }

  if (typeof metrics.vscodeSwitches !== 'number' || metrics.vscodeSwitches !== 0) {
    metrics.vscodeSwitches = 0;
    changed = true;
  }

  if (!Array.isArray(metrics.vscodeSwitchHourly) || metrics.vscodeSwitchHourly.some((v) => v !== 0)) {
    metrics.vscodeSwitchHourly = Array.from({ length: 24 }, () => 0);
    changed = true;
  }

  if (Array.isArray(metrics.vscodeTimeline) && metrics.vscodeTimeline.length) {
    metrics.vscodeTimeline = [];
    changed = true;
  }

  return changed;
}

/**
 * Computes the next sync timestamp value based on the result.
 */
export function nextSyncTimestamp(previous: number, success: boolean, now: number): number {
  return success ? now : previous;
}
