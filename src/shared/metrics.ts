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
  const vscodeMs = metrics.vscodeActiveMs ?? 0;
  const productiveMs = metrics.productiveMs + vscodeMs;
  const totalTracked = productiveMs + metrics.procrastinationMs + metrics.inactiveMs;
  const focusRate = totalTracked > 0 ? (productiveMs / totalTracked) * 100 : null;
  const inactivePercent = totalTracked > 0 ? (metrics.inactiveMs / totalTracked) * 100 : null;
  const trackedHours = totalTracked / 3600000;
  const tabSwitchRate = trackedHours > 0 ? metrics.tabSwitches / trackedHours : null;
  const productivityRatio =
    productiveMs > 0
      ? metrics.procrastinationMs === 0
        ? Infinity
        : productiveMs / metrics.procrastinationMs
      : null;

  const domainsWithVscode: Record<string, DomainStats> =
    vscodeMs > 0
      ? {
          ...metrics.domains,
          '__vscode:ide': {
            domain: 'VS Code (IDE)',
            category: 'productive',
            milliseconds: vscodeMs
          }
        }
      : metrics.domains;

  const topFocus = getTopDomainByCategory(domainsWithVscode, 'productive');
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
