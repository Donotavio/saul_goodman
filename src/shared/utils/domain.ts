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

function domainMatches(host: string, candidate: string): boolean {
  const normalizedCandidate = normalizeDomain(candidate);
  if (!normalizedCandidate) {
    return false;
  }

  if (host === normalizedCandidate) {
    return true;
  }

  return host.endsWith(`.${normalizedCandidate}`);
}

export function classifyDomain(domain: string, settings: ExtensionSettings): DomainCategory {
  const normalizedHost = normalizeDomain(domain);
  if (!normalizedHost) {
    return 'neutral';
  }

  if (settings.productiveDomains.some((candidate) => domainMatches(normalizedHost, candidate))) {
    return 'productive';
  }

  if (
    settings.procrastinationDomains.some((candidate) => domainMatches(normalizedHost, candidate))
  ) {
    return 'procrastination';
  }

  return 'neutral';
}

export function sortDomainsByTime(domains: Record<string, { milliseconds: number }>): string[] {
  return Object.entries(domains)
    .sort(([, a], [, b]) => b.milliseconds - a.milliseconds)
    .map(([domain]) => domain);
}
