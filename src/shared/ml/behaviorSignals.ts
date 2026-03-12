import type { FeatureMap } from './featureExtractor.js';

export interface DomainBehaviorEvent {
  domain: string;
  timestamp: number;
  activeMs: number;
  interactionCount: number;
  hasFeedLayout: boolean;
  hasAutoplayMedia: boolean;
  hasShortsPattern: boolean;
  audible: boolean;
  outOfSchedule: boolean;
}

export interface DomainBehaviorStats {
  sessions1d: number;
  sessions7d: number;
  sessions14d: number;
  medianActiveMs14d: number;
  bounceRate14d: number;
  interactionRatePerMinute14d: number;
  audibleRatio14d: number;
  distractionRatio14d: number;
  outOfScheduleRatio14d: number;
}

export interface ImplicitLabelDecision {
  label: 0 | 1;
  weight: number;
  reason: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function aggregateDomainBehavior(
  events: DomainBehaviorEvent[],
  now = Date.now()
): DomainBehaviorStats {
  const valid = events
    .filter((event) => Number.isFinite(event.timestamp) && event.timestamp > 0)
    .sort((a, b) => a.timestamp - b.timestamp);

  const sessions1d = valid.filter((event) => now - event.timestamp <= DAY_MS).length;
  const sessions7d = valid.filter((event) => now - event.timestamp <= 7 * DAY_MS).length;
  const in14d = valid.filter((event) => now - event.timestamp <= 14 * DAY_MS);
  const sessions14d = in14d.length;
  const activeValues = in14d.map((event) => Math.max(0, event.activeMs)).sort((a, b) => a - b);
  const medianActiveMs14d = median(activeValues);
  const bounces = in14d.filter((event) => event.activeMs < 30_000).length;
  const bounceRate14d = sessions14d > 0 ? bounces / sessions14d : 0;
  const totalInteractions = in14d.reduce((acc, event) => acc + Math.max(0, event.interactionCount), 0);
  const totalMinutes = in14d.reduce((acc, event) => acc + Math.max(0, event.activeMs) / 60_000, 0);
  const interactionRatePerMinute14d = totalMinutes > 0 ? totalInteractions / totalMinutes : 0;
  const audibleRatio14d = ratio(in14d.filter((event) => event.audible).length, sessions14d);
  const distractionCount = in14d.filter(
    (event) => event.hasFeedLayout || event.hasAutoplayMedia || event.hasShortsPattern
  ).length;
  const distractionRatio14d = ratio(distractionCount, sessions14d);
  const outOfScheduleRatio14d = ratio(
    in14d.filter((event) => event.outOfSchedule).length,
    sessions14d
  );

  return {
    sessions1d,
    sessions7d,
    sessions14d,
    medianActiveMs14d,
    bounceRate14d,
    interactionRatePerMinute14d,
    audibleRatio14d,
    distractionRatio14d,
    outOfScheduleRatio14d
  };
}

export function deriveImplicitLabel(stats: DomainBehaviorStats): ImplicitLabelDecision | null {
  if (stats.sessions14d < 4) {
    return null;
  }

  if (
    stats.medianActiveMs14d >= 180_000 &&
    stats.interactionRatePerMinute14d >= 1.5 &&
    stats.distractionRatio14d < 0.5
  ) {
    return {
      label: 1,
      weight: 0.25,
      reason: 'implicit:productive'
    };
  }

  if (
    stats.medianActiveMs14d >= 120_000 &&
    (stats.distractionRatio14d >= 0.6 || stats.audibleRatio14d >= 0.3)
  ) {
    return {
      label: 0,
      weight: 0.25,
      reason: 'implicit:procrastination'
    };
  }

  return null;
}

export function buildBehaviorFeatureMap(stats: DomainBehaviorStats): FeatureMap {
  const features: FeatureMap = {};
  addFeature(features, `beh:freq1d:${bucketCount(stats.sessions1d, [0, 1, 3, 6, 12])}`);
  addFeature(features, `beh:freq7d:${bucketCount(stats.sessions7d, [0, 2, 5, 10, 20])}`);
  addFeature(features, `beh:freq14d:${bucketCount(stats.sessions14d, [0, 3, 7, 14, 28])}`);
  addFeature(features, `beh:median_active:${bucketDuration(stats.medianActiveMs14d)}`);
  addFeature(features, `beh:bounce_rate:${bucketRatio(stats.bounceRate14d)}`);
  addFeature(features, `beh:interaction_rate:${bucketInteraction(stats.interactionRatePerMinute14d)}`);
  addFeature(features, `beh:audible_ratio:${bucketRatio(stats.audibleRatio14d)}`);
  addFeature(features, `beh:distraction_ratio:${bucketRatio(stats.distractionRatio14d)}`);
  addFeature(features, `beh:overtime_ratio:${bucketRatio(stats.outOfScheduleRatio14d)}`);
  return features;
}

function addFeature(features: FeatureMap, name: string): void {
  const previous = features[name] ?? 0;
  features[name] = previous + 1;
}

function bucketCount(value: number, buckets: number[]): string {
  for (let i = 0; i < buckets.length; i += 1) {
    if (value <= buckets[i]) {
      return `<=${buckets[i]}`;
    }
  }
  return `>${buckets[buckets.length - 1]}`;
}

function bucketDuration(valueMs: number): string {
  const seconds = Math.max(0, valueMs) / 1000;
  if (seconds <= 30) return '<=30s';
  if (seconds <= 120) return '<=2m';
  if (seconds <= 600) return '<=10m';
  return '>10m';
}

function bucketRatio(value: number): string {
  if (value <= 0.1) return '<=0.1';
  if (value <= 0.25) return '<=0.25';
  if (value <= 0.5) return '<=0.5';
  if (value <= 0.75) return '<=0.75';
  return '>0.75';
}

function bucketInteraction(value: number): string {
  if (value <= 0.5) return '<=0.5';
  if (value <= 1.5) return '<=1.5';
  if (value <= 3) return '<=3';
  return '>3';
}

function median(values: number[]): number {
  if (!values.length) {
    return 0;
  }
  const half = Math.floor(values.length / 2);
  if (values.length % 2 === 0) {
    return (values[half - 1] + values[half]) / 2;
  }
  return values[half];
}

function ratio(value: number, total: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) {
    return 0;
  }
  return value / total;
}
