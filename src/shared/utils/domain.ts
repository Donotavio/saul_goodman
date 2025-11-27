import { DomainCategory, ExtensionSettings } from '../types.js';

const DOMAIN_REGEX = /^(?:https?:\/\/)?(?:www\.)?([^/?#]+)/i;

export function extractDomain(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.hostname;
  } catch {
    const match = url.match(DOMAIN_REGEX);
    return match ? match[1] : null;
  }
}

export function normalizeDomain(domain: string): string {
  return domain.trim().toLowerCase();
}

export function classifyDomain(domain: string, settings: ExtensionSettings): DomainCategory {
  const normalized = normalizeDomain(domain);

  if (settings.productiveDomains.some((d) => normalized.endsWith(normalizeDomain(d)))) {
    return 'productive';
  }

  if (settings.procrastinationDomains.some((d) => normalized.endsWith(normalizeDomain(d)))) {
    return 'procrastination';
  }

  return 'neutral';
}

export function sortDomainsByTime(domains: Record<string, { milliseconds: number }>): string[] {
  return Object.entries(domains)
    .sort(([, a], [, b]) => b.milliseconds - a.milliseconds)
    .map(([domain]) => domain);
}
