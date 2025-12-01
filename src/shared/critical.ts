import { ExtensionSettings } from './types.js';
import { classifyDomain, extractDomain } from './utils/domain.js';

export function shouldTriggerCriticalForUrl(
  url: string | undefined,
  settings: ExtensionSettings
): boolean {
  if (!url) {
    return true;
  }

  if (!isSupportedScheme(url)) {
    return false;
  }

  const domain = extractDomain(url);
  if (!domain) {
    return true;
  }

  const category = classifyDomain(domain, settings);
  return category !== 'productive';
}

function isSupportedScheme(url: string): boolean {
  try {
    const parsed = new URL(url);
    const scheme = parsed.protocol;
    if (scheme === 'http:' || scheme === 'https:') {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}
