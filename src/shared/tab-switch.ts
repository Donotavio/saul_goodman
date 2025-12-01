import { DomainCategory, TabSwitchBreakdown, TabSwitchHourlyBucket } from './types.js';

export type TabSwitchKey = keyof TabSwitchBreakdown;

const CATEGORY_TOKEN: Record<DomainCategory, string> = {
  productive: 'productive',
  procrastination: 'procrastination',
  neutral: 'neutral'
};

export const TAB_SWITCH_SERIES: Array<{ key: TabSwitchKey; label: string; color: string }> = [
  { key: 'productiveToProductive', label: 'Prod → Prod', color: '#0a7e07' },
  { key: 'productiveToProcrastination', label: 'Prod → Proc', color: '#ff6b6b' },
  { key: 'productiveToNeutral', label: 'Prod → Neutro', color: '#bdbdbd' },
  { key: 'procrastinationToProductive', label: 'Proc → Prod', color: '#4caf50' },
  { key: 'procrastinationToProcrastination', label: 'Proc → Proc', color: '#c62828' },
  { key: 'procrastinationToNeutral', label: 'Proc → Neutro', color: '#ffb74d' },
  { key: 'neutralToProductive', label: 'Neutro → Prod', color: '#7cb342' },
  { key: 'neutralToProcrastination', label: 'Neutro → Proc', color: '#ff8a65' },
  { key: 'neutralToNeutral', label: 'Neutro → Neutro', color: '#9e9e9e' }
];

const VALID_KEYS = new Set<TabSwitchKey>(TAB_SWITCH_SERIES.map((item) => item.key));

export function getTabSwitchKey(from: DomainCategory, to: DomainCategory): TabSwitchKey | null {
  const key = `${CATEGORY_TOKEN[from]}To${capitalize(CATEGORY_TOKEN[to])}` as TabSwitchKey;
  if (VALID_KEYS.has(key)) {
    return key;
  }
  return null;
}

export function recordTabSwitchCounts(
  breakdown: TabSwitchBreakdown,
  hourly: TabSwitchHourlyBucket[],
  timestamp: number,
  fromCategory: DomainCategory,
  toCategory: DomainCategory
): TabSwitchKey | null {
  const key = getTabSwitchKey(fromCategory, toCategory);
  if (!key) {
    return null;
  }

  breakdown[key] += 1;

  const hour = new Date(timestamp).getHours();
  const bucket = hourly?.[hour];
  if (bucket) {
    bucket[key] += 1;
  }

  return key;
}

function capitalize(value: string): string {
  if (!value.length) {
    return value;
  }
  return value[0].toUpperCase() + value.slice(1);
}
