import type { HolidayCacheEntry, HolidaysCache } from '../types.js';

const NAGER_BASE_URL = 'https://date.nager.at/api/v3/PublicHolidays';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface NagerHoliday {
  date: string;
  localName: string;
  name: string;
  countryCode: string;
  fixed: boolean;
  global: boolean;
  counties?: string[] | null;
  launchYear?: number | null;
  types?: Array<'Public' | string>;
}

export interface HolidayResolutionParams {
  dateKey: string;
  countryCode?: string;
  enabled?: boolean;
  cache: HolidaysCache;
  now?: number;
  fetcher?: typeof fetch;
}

export interface HolidayResolutionResult {
  isHoliday: boolean;
  cache: HolidaysCache;
  source: 'none' | 'cache' | 'api';
  cacheKey?: string;
}

export function buildHolidayCacheKey(year: number, countryCode: string): string {
  return `${countryCode.toUpperCase()}-${year}`;
}

export function isCacheExpired(entry: HolidayCacheEntry | undefined, now = Date.now()): boolean {
  if (!entry) {
    return true;
  }
  return now - entry.fetchedAt > CACHE_TTL_MS;
}

export function listCachedDates(cache: HolidaysCache, key: string): string[] {
  return cache[key]?.dates ?? [];
}

export async function fetchPublicHolidays(
  year: number,
  countryCode: string,
  fetcher: typeof fetch = fetch
): Promise<string[]> {
  try {
    const response = await fetcher(`${NAGER_BASE_URL}/${year}/${countryCode.toUpperCase()}`);
    if (!response.ok) {
      return [];
    }
    const payload = (await response.json()) as NagerHoliday[];
    return payload
      .filter((holiday) => holiday.global !== false && (!holiday.types || holiday.types.includes('Public')))
      .map((holiday) => holiday.date)
      .filter((date) => typeof date === 'string');
  } catch {
    return [];
  }
}

export async function resolveHolidayNeutralState(
  params: HolidayResolutionParams
): Promise<HolidayResolutionResult> {
  const { dateKey, countryCode, enabled, cache } = params;
  const now = params.now ?? Date.now();
  const fetcher = params.fetcher ?? fetch;
  if (!enabled || !countryCode) {
    return { isHoliday: false, cache, source: 'none' };
  }
  const year = Number.parseInt(dateKey.slice(0, 4), 10);
  if (Number.isNaN(year)) {
    return { isHoliday: false, cache, source: 'none' };
  }
  const normalizedCode = countryCode.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalizedCode)) {
    return { isHoliday: false, cache, source: 'none' };
  }
  const cacheKey = buildHolidayCacheKey(year, normalizedCode);
  const entry = cache[cacheKey];
  if (entry && !isCacheExpired(entry, now)) {
    const isHoliday = entry.dates.includes(dateKey);
    return { isHoliday, cache, source: 'cache', cacheKey };
  }
  const dates = await fetchPublicHolidays(year, normalizedCode, fetcher);
  const nextCache: HolidaysCache = {
    ...cache,
    [cacheKey]: {
      fetchedAt: now,
      dates
    }
  };
  const isHoliday = dates.includes(dateKey);
  return { isHoliday, cache: nextCache, source: 'api', cacheKey };
}
