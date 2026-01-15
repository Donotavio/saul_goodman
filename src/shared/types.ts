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

  /**
   * Trocas de contexto do VS Code (por sessão) no dia.
   */
  vscodeSwitches?: number;

  /** 
   * Trocas de contexto do VS Code por hora.
   */
  vscodeSwitchHourly?: number[];

  /**
   * Duração acumulada por contexto (ms) para o dia corrente.
   */
  contextDurations?: Record<ContextModeValue, number>;

  /**
   * Índice recalculado para cada contexto considerando o dia inteiro nesse modo.
   */
  contextIndices?: Record<ContextModeValue, number>;
}

export interface ApiStats {
  index: number;
  updatedAt: number;
  productiveMs: number;
  procrastinationMs: number;
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

export type SupportedLocale =
  | 'pt-BR'
  | 'en-US'
  | 'es-419'
  | 'fr'
  | 'de'
  | 'it'
  | 'tr'
  | 'zh-CN'
  | 'hi'
  | 'ar'
  | 'bn'
  | 'ru'
  | 'ur';
export type LocalePreference = 'auto' | SupportedLocale;

export interface ExtensionSettings {
  productiveDomains: string[];
  procrastinationDomains: string[];
  blockProcrastination?: boolean;
  weights: WeightConfig;
  learningSignals?: LearningSignals;
  inactivityThresholdMs: number;
  enableAutoClassification?: boolean;
  enableAISuggestions?: boolean;
  suggestionCooldownMs?: number;
  suggestionsHistory?: Record<string, SuggestionHistoryEntry>;
  locale: SupportedLocale;
  localePreference?: LocalePreference;
  openAiKey?: string;
  criticalScoreThreshold?: number;
  workSchedule?: WorkInterval[];
  criticalSoundEnabled?: boolean;
  holidayAutoEnabled?: boolean;
  holidayCountryCode?: string;

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
  fairness?: FairnessSummary;
  suggestions?: DomainSuggestion[];
  activeSuggestion?: DomainSuggestion | null;
}

export type RuntimeMessageType =
  | 'activity-ping'
  | 'metrics-request'
  | 'clear-data'
  | 'settings-updated'
  | 'release-notes'
  | 'apply-suggestion'
  | 'ignore-suggestion'
  | 'open-extension-page';

export interface PopupData {
  metrics: DailyMetrics;
  settings: ExtensionSettings;
  fairness?: FairnessSummary;
  suggestions?: DomainSuggestion[];
  activeSuggestion?: DomainSuggestion | null;
}

export interface ManualOverrideState {
  enabled: boolean;
  date: string;
}

export type ContextModeValue = 'work' | 'personal' | 'leisure' | 'study' | 'dayOff' | 'vacation';

export interface ContextModeState {
  value: ContextModeValue;
  updatedAt: number;
}

/**
 * Intervalo contínuo em que um contexto permaneceu ativo.
 */
export interface ContextSegment {
  value: ContextModeValue;
  start: number;
  end?: number;
}

/**
 * Histórico diário de segmentos de contexto.
 */
export type ContextHistory = ContextSegment[];

export interface HolidaySettingsSnapshot {
  enabled: boolean;
  countryCode?: string;
}

export interface HolidayCacheEntry {
  fetchedAt: number;
  dates: string[];
}

export type HolidaysCache = Record<string, HolidayCacheEntry>;

export type FairnessRule =
  | 'manual-override'
  | 'context-personal'
  | 'context-leisure'
  | 'context-study'
  | 'context-day-off'
  | 'context-vacation'
  | 'holiday'
  | 'normal';

export interface FairnessSummary {
  rule: FairnessRule;
  manualOverrideActive: boolean;
  contextMode: ContextModeState;
  holidayNeutral: boolean;
  isHolidayToday: boolean;
}

export interface DomainMetadata {
  hostname: string;
  title?: string;
  description?: string;
  keywords?: string[];
  ogType?: string;
  hasVideoPlayer: boolean;
  hasInfiniteScroll: boolean;
  hasAutoplayMedia?: boolean;
  hasFeedLayout?: boolean;
  hasFormFields?: boolean;
  hasRichEditor?: boolean;
  hasLargeTable?: boolean;
  hasShortsPattern?: boolean;
  schemaTypes?: string[];
  headings?: string[];
  pathTokens?: string[];
  language?: string;
}

export interface LearningTokenStat {
  productive: number;
  procrastination: number;
  lastUpdated: number;
}

export interface LearningWeights {
  host: number;
  root: number;
  kw: number;
  og: number;
  path: number;
  schema: number;
  lang: number;
  flag: number;
}

export interface LearningSignals {
  version?: number;
  tokens: Record<string, LearningTokenStat>;
  weights?: LearningWeights;
}

export interface DomainSuggestion {
  domain: string;
  classification: DomainCategory;
  confidence: number;
  reasons: string[];
  timestamp: number;
  learningTokens?: string[];
}

export interface SuggestionHistoryEntry {
  lastSuggestedAt: number;
  ignoredUntil?: number;
  decidedAt?: number;
  decidedAs?: DomainCategory | 'ignored';
}


export interface DomainListChange {
  domain: string;
  category: DomainCategory;
  action: 'add' | 'remove';
}

export interface OptionsFormState {
  productiveDomains: string[];
  procrastinationDomains: string[];
  blockProcrastination?: boolean;
  weights: WeightConfig;
  inactivityThresholdMs: number;
  openAiKey?: string;
  criticalScoreThreshold?: number;
  workSchedule?: WorkInterval[];
  vscodeIntegrationEnabled?: boolean;
  vscodeLocalApiUrl?: string;
  vscodePairingKey?: string;
}
