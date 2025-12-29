import {
  ContextHistory,
  ContextModeValue,
  DailyMetrics,
  FairnessSummary,
  TimelineEntry
} from '../types.js';

export type CsvFairnessRule = 'manual' | 'context' | 'holiday' | 'normal';

export interface DetailedCsvLabels {
  sectionTitle: string;
  startTime: string;
  endTime: string;
  duration: string;
  domain: string;
  category: string;
  context: string;
  fairnessRule: string;
}

export interface BuildDetailedCsvSectionOptions {
  metrics: DailyMetrics;
  labels: DetailedCsvLabels;
  contextHistory?: ContextHistory;
  fairness?: FairnessSummary | null;
  domainLabelFormatter?: (domain: string) => string;
}

/**
 * Builds the detailed CSV section by expanding every known timeline entry.
 * Each row maps to a slice of browsing or VS Code activity with resolved context and fairness rule.
 * @param options Metrics and localization data required to describe the timeline.
 * @returns Ordered lines ready to be concatenated to the CSV payload.
 */
export function buildDetailedCsvSection(options: BuildDetailedCsvSectionOptions): string[] {
  const formatter = options.domainLabelFormatter ?? ((value: string) => value);
  const fairnessRule = mapFairnessRule(options.fairness);
  const fallbackContext = options.fairness?.contextMode?.value ?? 'work';
  const history = Array.isArray(options.contextHistory) ? options.contextHistory : undefined;
  const entries = collectTimelineEntries(options.metrics);
  const lines: string[] = [];

  lines.push(options.labels.sectionTitle);
  lines.push(
    [
      options.labels.startTime,
      options.labels.endTime,
      options.labels.duration,
      options.labels.domain,
      options.labels.category,
      options.labels.context,
      options.labels.fairnessRule
    ].join(',')
  );

  entries.forEach((entry) => {
    const start = normalizeTimestamp(entry.startTime);
    const end = normalizeTimestamp(resolveEndTime(entry));
    const context = resolveContextForTimestamp(start, history, fallbackContext);
    const category = normalizeCategory(entry.category);
    lines.push(
      [
        new Date(start).toISOString(),
        new Date(end).toISOString(),
        entry.durationMs.toString(),
        formatter(entry.domain),
        category,
        context,
        fairnessRule
      ].join(',')
    );
  });

  return lines;
}

/**
 * Maps the fairness summary into one of the CSV rule tags.
 * @param summary Snapshot provided by the background page.
 * @returns Normalized rule identifier with four possible values.
 */
export function mapFairnessRule(summary?: FairnessSummary | null): CsvFairnessRule {
  const rule = summary?.rule;
  if (rule === 'manual-override') {
    return 'manual';
  }
  if (rule === 'holiday') {
    return 'holiday';
  }
  if (rule && rule.startsWith('context-')) {
    return 'context';
  }
  return 'normal';
}

function collectTimelineEntries(metrics: DailyMetrics): TimelineEntry[] {
  const base = Array.isArray(metrics.timeline) ? [...metrics.timeline] : [];
  const vscodeEntries =
    metrics.vscodeTimeline?.map((entry) => ({
      ...entry,
      category: entry.category ?? 'productive',
      domain: entry.domain ?? 'VS Code (IDE)'
    })) ?? [];
  return [...base, ...vscodeEntries].sort((a, b) => a.startTime - b.startTime);
}

function normalizeCategory(category: TimelineEntry['category']): 'productive' | 'procrastination' | 'neutral' {
  if (category === 'productive' || category === 'procrastination') {
    return category;
  }
  return 'neutral';
}

function normalizeTimestamp(value?: number): number {
  if (typeof value === 'number' && !Number.isNaN(value)) {
    return value;
  }
  return Date.now();
}

function resolveEndTime(entry: TimelineEntry): number {
  if (typeof entry.endTime === 'number') {
    return entry.endTime;
  }
  if (typeof entry.durationMs === 'number') {
    return normalizeTimestamp(entry.startTime) + entry.durationMs;
  }
  return normalizeTimestamp(entry.startTime);
}

export function resolveContextForTimestamp(
  timestamp: number,
  history: ContextHistory | undefined,
  fallback: ContextModeValue
): ContextModeValue {
  if (!history?.length) {
    return fallback;
  }
  for (const segment of history) {
    const end = typeof segment.end === 'number' ? segment.end : Number.MAX_SAFE_INTEGER;
    if (timestamp >= segment.start && timestamp <= end) {
      return segment.value;
    }
  }
  const last = [...history].reverse().find((segment) => segment.start <= timestamp);
  return last?.value ?? fallback;
}
