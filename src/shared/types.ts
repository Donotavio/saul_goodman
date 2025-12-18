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
  windowUnfocusedMs?: number;
  audibleProcrastinationMs?: number;
  spaNavigations?: number;
  groupedMs?: number;
  restoredItems?: number;

  /**
   * Tempo total ativo no VS Code (em milissegundos) no dia corrente.
   */
  vscodeActiveMs?: number;

  /**
   * Quantidade de sessões de foco no VS Code no dia corrente.
   */
  vscodeSessions?: number;

  /**
   * Linha do tempo de sessões no VS Code para compor a narrativa.
   */
  vscodeTimeline?: TimelineEntry[];
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

export type SupportedLocale = 'pt-BR' | 'en-US' | 'es-419';
export type LocalePreference = 'auto' | SupportedLocale;

export interface ExtensionSettings {
  productiveDomains: string[];
  procrastinationDomains: string[];
  weights: WeightConfig;
  inactivityThresholdMs: number;
  locale: SupportedLocale;
  localePreference?: LocalePreference;
  openAiKey?: string;
  criticalScoreThreshold?: number;
  workSchedule?: WorkInterval[];
  criticalSoundEnabled?: boolean;

  /**
   * Ativa/desativa a integração com VS Code via backend local.
   */
  vscodeIntegrationEnabled?: boolean;

  /**
   * URL base da API HTTP local do SaulDaemon.
   * Exemplo: http://127.0.0.1:3123
   */
  vscodeLocalApiUrl?: string;

  /**
   * Chave de pareamento entre Chrome e VS Code, usada pelo backend para vincular eventos.
   */
  vscodePairingKey?: string;
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
  openAiKey?: string;
  criticalScoreThreshold?: number;
  workSchedule?: WorkInterval[];
  vscodeIntegrationEnabled?: boolean;
  vscodeLocalApiUrl?: string;
  vscodePairingKey?: string;
}
