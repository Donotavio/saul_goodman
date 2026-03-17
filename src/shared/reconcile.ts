import { DailyMetrics, DomainStats, ExtensionSettings } from './types.js';
import { classifyDomain } from './utils/domain.js';
import { splitDurationByHour, isWithinWorkSchedule } from './utils/time.js';
import { createEmptyHourly } from './storage.js';

export function reconcileMetricsFromTimeline(
  metrics: DailyMetrics,
  settings: ExtensionSettings
): void {
  // Reset campos que serao reconstruidos
  metrics.productiveMs = 0;
  metrics.procrastinationMs = 0;
  metrics.overtimeProductiveMs = 0;
  const domains: Record<string, DomainStats> = {};
  const hourly = createEmptyHourly();

  // Copiar buckets de inactiveMs preservados
  for (let h = 0; h < 24; h++) {
    hourly[h].inactiveMs = metrics.hourly?.[h]?.inactiveMs ?? 0;
  }

  for (const entry of metrics.timeline) {
    if (entry.category === 'inactive') {
      continue; // preservar inactiveMs como esta
    }

    const category = classifyDomain(entry.domain, settings);
    entry.category = category; // atualizar timeline in-place

    // Acumular tempo por categoria
    if (category === 'productive') {
      metrics.productiveMs += entry.durationMs;
      const isOvertime = !isWithinWorkSchedule(
        new Date(entry.startTime), settings.workSchedule ?? []
      );
      if (isOvertime) {
        metrics.overtimeProductiveMs += entry.durationMs;
      }
    } else if (category === 'procrastination') {
      metrics.procrastinationMs += entry.durationMs;
    }

    // Reconstruir domains record
    const stat = domains[entry.domain] ?? {
      domain: entry.domain,
      milliseconds: 0,
      category
    };
    stat.milliseconds += entry.durationMs;
    stat.category = category;
    domains[entry.domain] = stat;

    // Reconstruir hourly
    const segments = splitDurationByHour(entry.startTime, entry.durationMs);
    const field = category === 'productive' ? 'productiveMs'
      : category === 'procrastination' ? 'procrastinationMs'
      : 'neutralMs';
    for (const seg of segments) {
      if (hourly[seg.hour]) {
        hourly[seg.hour][field] += seg.milliseconds;
      }
    }
  }

  // Preservar dominios inativos que nao estao no timeline
  // (ex: __vscode:ide virtual — categoria pode ser 'inactive' em runtime)
  for (const [key, stat] of Object.entries(metrics.domains)) {
    if ((stat.category as string) === 'inactive' && !domains[key]) {
      domains[key] = stat;
    }
  }

  metrics.domains = domains;
  metrics.hourly = hourly;
}
