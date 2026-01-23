import type { TimelineEntry } from './types.js';

export interface VscodeTrackingSummaryPayload {
  totalActiveMs?: number;
  sessions?: number;
  switches?: number;
  switchHourly?: number[];
  timeline?: Array<{
    startTime?: number;
    endTime?: number;
    durationMs?: number;
  }>;
}

export interface NormalizedVscodeTrackingSummary {
  totalActiveMs: number;
  sessions: number;
  switches: number;
  switchHourly: number[];
  timeline: TimelineEntry[];
}

export interface VscodeSummaryNormalizeOptions {
  domainLabel?: string;
  category?: TimelineEntry['category'];
}

const DEFAULT_SWITCH_HOURLY = () => Array.from({ length: 24 }, () => 0);

export function normalizeVscodeTrackingSummary(
  payload: VscodeTrackingSummaryPayload,
  options: VscodeSummaryNormalizeOptions = {}
): NormalizedVscodeTrackingSummary {
  const domainLabel = options.domainLabel ?? 'VS Code (IDE)';
  const category = options.category ?? 'productive';
  const rawTimeline = Array.isArray(payload.timeline) ? payload.timeline : [];
  const timeline: TimelineEntry[] = [];
  let timelineTotalMs = 0;

  for (const entry of rawTimeline) {
    const startTime = entry?.startTime ?? 0;
    const endTime = entry?.endTime ?? 0;
    if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) {
      continue;
    }
    const durationMs = Number.isFinite(entry?.durationMs)
      ? Number(entry.durationMs)
      : Math.max(0, endTime - startTime);
    if (durationMs <= 0) {
      continue;
    }
    timelineTotalMs += durationMs;
    timeline.push({
      startTime,
      endTime,
      durationMs,
      domain: domainLabel,
      category
    });
  }

  timeline.sort((a, b) => a.startTime - b.startTime);

  const totalActiveMs = Number.isFinite(payload.totalActiveMs)
    ? Math.max(0, Number(payload.totalActiveMs))
    : timelineTotalMs;
  const sessions = Number.isFinite(payload.sessions)
    ? Math.max(0, Number(payload.sessions))
    : timeline.length;
  const switches = Number.isFinite(payload.switches)
    ? Math.max(0, Number(payload.switches))
    : sessions;
  const switchHourly =
    Array.isArray(payload.switchHourly) && payload.switchHourly.length === 24
      ? payload.switchHourly.map((value) => (Number.isFinite(value) ? Number(value) : 0))
      : DEFAULT_SWITCH_HOURLY();

  return {
    totalActiveMs,
    sessions,
    switches,
    switchHourly,
    timeline
  };
}
