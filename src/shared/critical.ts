import { ExtensionSettings } from './types.js';
import { classifyDomain, extractDomain } from './utils/domain.js';

export function shouldTriggerCriticalForUrl(
  url: string | undefined,
  settings: ExtensionSettings
): boolean {
  if (!url) {
    return false;
  }
  const domain = extractDomain(url);
  if (!domain) {
    return false;
  }
  const category = classifyDomain(domain, settings);
  return category !== 'productive';
}
