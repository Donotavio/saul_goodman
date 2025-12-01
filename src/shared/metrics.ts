import { DailyMetrics, DomainStats } from './types.js';

export interface CalculatedKpis {
  focusRate: number | null;
  tabSwitchRate: number | null;
  inactivePercent: number | null;
  productivityRatio: number | null;
  topFocus: DomainStats | null;
  topProcrastination: DomainStats | null;
}

export function calculateKpis(metrics: DailyMetrics): CalculatedKpis {
  const totalTracked = metrics.productiveMs + metrics.procrastinationMs + metrics.inactiveMs;
  const focusRate = totalTracked > 0 ? (metrics.productiveMs / totalTracked) * 100 : null;
  const inactivePercent = totalTracked > 0 ? (metrics.inactiveMs / totalTracked) * 100 : null;
  const trackedHours = totalTracked / 3600000;
  const tabSwitchRate = trackedHours > 0 ? metrics.tabSwitches / trackedHours : null;
  const productivityRatio =
    metrics.productiveMs > 0
      ? metrics.procrastinationMs === 0
        ? Infinity
        : metrics.productiveMs / metrics.procrastinationMs
      : null;

  const topFocus = getTopDomainByCategory(metrics.domains, 'productive');
  const topProcrastination = getTopDomainByCategory(metrics.domains, 'procrastination');

  return {
    focusRate,
    tabSwitchRate,
    inactivePercent,
    productivityRatio,
    topFocus,
    topProcrastination
  };
}

export function getTopDomainByCategory(
  domains: Record<string, DomainStats>,
  category: DomainStats['category']
): DomainStats | null {
  const filtered = Object.values(domains).filter((domain) => domain.category === category);
  if (!filtered.length) {
    return null;
  }
  return filtered.sort((a, b) => b.milliseconds - a.milliseconds)[0];
}

export function formatPercentage(value: number | null): string {
  if (value === null || Number.isNaN(value)) {
    return '--';
  }
  return `${value.toFixed(0)}%`;
}

export function formatRate(value: number | null): string {
  if (value === null || Number.isNaN(value)) {
    return '--';
  }
  return `${value.toFixed(1)}/h`;
}

export function formatProductivityRatio(value: number | null): string {
  if (value === null || Number.isNaN(value)) {
    return '--';
  }
  if (!Number.isFinite(value)) {
    return '∞:1';
  }
  return `${value.toFixed(1)}:1`;
}
