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
  tabSwitchBreakdown: TabSwitchBreakdown;
  tabSwitchHourly: TabSwitchHourlyBucket[];
  domains: Record<string, DomainStats>;
  currentIndex: number;
  lastUpdated: number;
  hourly: HourlyBucket[];
  timeline: TimelineEntry[];
  overtimeProductiveMs?: number;
}

export interface TabSwitchBreakdown {
  productiveToProductive: number;
  productiveToProcrastination: number;
  productiveToNeutral: number;
  procrastinationToProductive: number;
  procrastinationToProcrastination: number;
  procrastinationToNeutral: number;
  neutralToProductive: number;
  neutralToProcrastination: number;
  neutralToNeutral: number;
}

export interface TabSwitchHourlyBucket extends TabSwitchBreakdown {
  hour: number;
}

export interface WeightConfig {
  procrastinationWeight: number;
  tabSwitchWeight: number;
  inactivityWeight: number;
}

export interface WorkInterval {
  start: string;
  end: string;
}

export interface ExtensionSettings {
  productiveDomains: string[];
  procrastinationDomains: string[];
  weights: WeightConfig;
  inactivityThresholdMs: number;
  locale: 'pt-BR';
  openAiKey?: string;
  criticalScoreThreshold?: number;
  workSchedule?: WorkInterval[];
  criticalSoundEnabled?: boolean;
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

export type ToastMood = 'positive' | 'negative';

export interface ScoreToastPayload {
  mood: ToastMood;
  message: string;
  score: number;
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
  openAiKey?: string;
  criticalScoreThreshold?: number;
  workSchedule?: WorkInterval[];
}
