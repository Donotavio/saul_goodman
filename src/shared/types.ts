export type DomainCategory = 'productive' | 'procrastination' | 'neutral';

export interface DomainStats {
  domain: string;
  milliseconds: number;
  category: DomainCategory;
}

export interface HourlyBucket {
  hour: number;
  productiveMs: number;
  procrastinationMs: number;
  inactiveMs: number;
  neutralMs: number;
}

export interface TimelineEntry {
  startTime: number;
  endTime: number;
  durationMs: number;
  domain: string;
  category: DomainCategory | 'inactive';
}

export interface DailyMetrics {
  dateKey: string;
  productiveMs: number;
  procrastinationMs: number;
  inactiveMs: number;
  tabSwitches: number;
  domains: Record<string, DomainStats>;
  currentIndex: number;
  lastUpdated: number;
  hourly: HourlyBucket[];
  timeline: TimelineEntry[];
}

export interface WeightConfig {
  procrastinationWeight: number;
  tabSwitchWeight: number;
  inactivityWeight: number;
}

export interface ExtensionSettings {
  productiveDomains: string[];
  procrastinationDomains: string[];
  weights: WeightConfig;
  inactivityThresholdMs: number;
  locale: 'pt-BR';
}

export interface ActivityPingPayload {
  timestamp: number;
}

export interface RuntimeMessage<T = unknown> {
  type: RuntimeMessageType;
  payload?: T;
}

export interface RuntimeMessageResponse {
  metrics?: DailyMetrics;
  settings?: ExtensionSettings;
}

export type RuntimeMessageType =
  | 'activity-ping'
  | 'metrics-request'
  | 'clear-data'
  | 'settings-updated';

export interface PopupData {
  metrics: DailyMetrics;
  settings: ExtensionSettings;
}

export interface DomainListChange {
  domain: string;
  category: DomainCategory;
  action: 'add' | 'remove';
}

export interface OptionsFormState {
  productiveDomains: string[];
  procrastinationDomains: string[];
  weights: WeightConfig;
  inactivityThresholdMs: number;
}
