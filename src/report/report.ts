import {
  DailyMetrics,
  DomainStats,
  DomainSuggestion,
  FairnessRule,
  FairnessSummary,
  HourlyBucket,
  LocalePreference,
  TimelineEntry,
  WorkInterval,
  ContextModeValue,
  ExtensionSettings
} from '../shared/types.js';
import { formatDuration, formatTimeRange, isWithinWorkSchedule, splitDurationByHour } from '../shared/utils/time.js';
import { calculateKpis, formatPercentage, CalculatedKpis } from '../shared/metrics.js';
import { TAB_SWITCH_SERIES } from '../shared/tab-switch.js';
import { createI18n, I18nService } from '../shared/i18n.js';
import { translateSuggestionReason } from '../shared/utils/suggestion-reasons.js';

declare const Chart: any;
declare const jspdf: { jsPDF: new (...args: any[]) => any };

type ChartInstance = any;

const reportDateEl = document.getElementById('reportDate') as HTMLElement;
const heroMessageEl = document.getElementById('heroMessage') as HTMLElement;
const heroIndexEl = document.getElementById('heroIndex') as HTMLElement;
const heroFocusEl = document.getElementById('heroFocus') as HTMLElement;
const heroSwitchesEl = document.getElementById('heroSwitches') as HTMLElement;
const heroProductiveEl = document.getElementById('heroProductive') as HTMLElement | null;
const heroProcrastinationEl = document.getElementById('heroProcrastination') as HTMLElement | null;
const heroIdleEl = document.getElementById('heroIdle') as HTMLElement | null;
const fairnessStatusReportEl = document.getElementById('fairnessStatusReport') as HTMLElement | null;
const fairnessHintReportEl = document.getElementById('fairnessHintReport') as HTMLElement | null;
const suggestionSectionEl = document.getElementById('suggestionSection') as HTMLElement | null;
const suggestionReportTitleEl = document.getElementById('suggestionReportTitle') as HTMLElement | null;
const suggestionReportReasonsEl = document.getElementById('suggestionReportReasons') as HTMLUListElement | null;
const storyListEl = document.getElementById('storyList') as HTMLUListElement;
const timelineListEl = document.getElementById('timelineList') as HTMLOListElement;
const timelineStartHourInput = document.getElementById('timelineStartHour') as HTMLInputElement;
const timelineEndHourInput = document.getElementById('timelineEndHour') as HTMLInputElement;
const timelineFilterButton = document.getElementById('timelineFilterButton') as HTMLButtonElement;
const timelineResetButton = document.getElementById('timelineResetButton') as HTMLButtonElement;
const productiveRankingBody = document
  .getElementById('productiveRanking')
  ?.querySelector('tbody') as HTMLTableSectionElement | null;
const procrastinationRankingBody = document
  .getElementById('procrastinationRanking')
  ?.querySelector('tbody') as HTMLTableSectionElement | null;
const pdfButton = document.getElementById('pdfReportButton') as HTMLButtonElement;
const backButton = document.getElementById('backButton') as HTMLButtonElement;
const aiNarrativeEl = document.getElementById('aiNarrative') as HTMLElement;
const aiGenerateButton = document.getElementById('aiGenerateButton') as HTMLButtonElement;
const aiRetryButton = document.getElementById('aiRetryButton') as HTMLButtonElement;
const shareMenuButton = document.getElementById('shareMenuButton') as HTMLButtonElement | null;
const shareMenuEl = document.getElementById('shareMenu') as HTMLDivElement | null;
const toastEl = document.getElementById('toast') as HTMLElement | null;
const toastMessageEl = document.getElementById('toastMessage') as HTMLElement | null;
const hourlyCanvas = document.getElementById('hourlyChart') as HTMLCanvasElement;
const compositionCanvas = document.getElementById('compositionChart') as HTMLCanvasElement;
const domainBreakdownCanvas = document.getElementById('domainBreakdownChart') as HTMLCanvasElement;
const hourlyEmptyEl = document.getElementById('hourlyEmpty');
const tabSwitchCanvas = document.getElementById('tabSwitchChart') as HTMLCanvasElement;
const tabSwitchEmptyEl = document.getElementById('tabSwitchEmpty');
const criticalBannerEl = document.getElementById('criticalBanner') as HTMLElement | null;
const criticalBannerMessageEl = document.getElementById('criticalBannerMessage') as HTMLElement | null;
const criticalBannerCountdownEl = document.getElementById(
  'criticalBannerCountdown'
) as HTMLElement | null;
const criticalBannerAction = document.getElementById('criticalBannerAction') as HTMLButtonElement | null;
const audioProcrastinationEl = document.getElementById(
  'audioProcrastinationValue'
) as HTMLElement | null;
const unfocusedEl = document.getElementById('unfocusedValue') as HTMLElement | null;
const spaNavigationsEl = document.getElementById('spaNavigationsValue') as HTMLElement | null;
const groupedTimeEl = document.getElementById('groupedTimeValue') as HTMLElement | null;
const restoredItemsEl = document.getElementById('restoredItemsValue') as HTMLElement | null;
const contextBreakdownSection = document.getElementById(
  'contextBreakdownSection'
) as HTMLElement | null;
const contextBreakdownBody = document
  .getElementById('contextBreakdownTable')
  ?.querySelector('tbody') as HTMLTableSectionElement | null;
const vscodeReportSection = document.getElementById('vscodeReportSection') as HTMLElement | null;
const vscodeReportDisabledEl = document.getElementById('vscodeReportDisabled') as HTMLElement | null;
const vscodeReportContentEl = document.getElementById('vscodeReportContent') as HTMLElement | null;
const vscodeReportStatusEl = document.getElementById('vscodeReportStatus') as HTMLElement | null;
const vscodeFilterProjectEl = document.getElementById('vscodeFilterProject') as HTMLSelectElement | null;
const vscodeFilterLanguageEl = document.getElementById('vscodeFilterLanguage') as HTMLSelectElement | null;
const vscodeFilterMachineEl = document.getElementById('vscodeFilterMachine') as HTMLSelectElement | null;
const vscodeApplyFiltersButton = document.getElementById(
  'vscodeApplyFilters'
) as HTMLButtonElement | null;
const vscodeResetFiltersButton = document.getElementById(
  'vscodeResetFilters'
) as HTMLButtonElement | null;
const vscodeStatTodayEl = document.getElementById('vscodeStatToday') as HTMLElement | null;
const vscodeProjectsListEl = document.getElementById('vscodeProjectsList') as HTMLUListElement | null;
const vscodeLanguagesListEl = document.getElementById('vscodeLanguagesList') as HTMLUListElement | null;
const vscodeSummariesListEl = document.getElementById('vscodeSummariesList') as HTMLUListElement | null;
const openVscodeOptionsButton = document.getElementById(
  'openVscodeOptions'
) as HTMLButtonElement | null;
const vscodeBranchesListEl = document.getElementById('vscodeBranchesList') as HTMLUListElement | null;
const vscodeActivityListEl = document.getElementById('vscodeActivityList') as HTMLUListElement | null;
const vscodeHourlyChartCanvas = document.getElementById('vscodeHourlyChart') as HTMLCanvasElement | null;
const vscodeHourlyEmptyEl = document.getElementById('vscodeHourlyEmpty') as HTMLElement | null;
const vscodeProjectsChartCanvas = document.getElementById('vscodeProjectsChart') as HTMLCanvasElement | null;
const vscodeProjectsEmptyEl = document.getElementById('vscodeProjectsEmpty') as HTMLElement | null;
const vscodeCommitsChartCanvas = document.getElementById('vscodeCommitsChart') as HTMLCanvasElement | null;
const vscodeCommitsEmptyEl = document.getElementById('vscodeCommitsEmpty') as HTMLElement | null;
const vscodeCrossReferenceChartCanvas = document.getElementById('vscodeCrossReferenceChart') as HTMLCanvasElement | null;
const vscodeCrossReferenceEmptyEl = document.getElementById('vscodeCrossReferenceEmpty') as HTMLElement | null;
const vscodeWorkspacesListEl = document.getElementById('vscodeWorkspacesList') as HTMLUListElement | null;
const vscodeEditorInfoEl = document.getElementById('vscodeEditorInfo') as HTMLElement | null;
const vscodeIndexValueEl = document.getElementById('vscodeIndexValue') as HTMLElement | null;
const vscodeKpiFocusEl = document.getElementById('vscodeKpiFocus') as HTMLElement | null;
const vscodeKpiSwitchesEl = document.getElementById('vscodeKpiSwitches') as HTMLElement | null;
const vscodeKpiProductiveEl = document.getElementById('vscodeKpiProductive') as HTMLElement | null;
const vscodeKpiProcrastEl = document.getElementById('vscodeKpiProcrast') as HTMLElement | null;
const vscodeKpiInactiveEl = document.getElementById('vscodeKpiInactive') as HTMLElement | null;
const vscodeTelemetrySectionEl = document.getElementById('vscodeTelemetrySection') as HTMLElement | null;
const vscodeTelDebugSessionsEl = document.getElementById('vscodeTelDebugSessions') as HTMLElement | null;
const vscodeTelDebugTimeEl = document.getElementById('vscodeTelDebugTime') as HTMLElement | null;
const vscodeTelTestSuccessEl = document.getElementById('vscodeTelTestSuccess') as HTMLElement | null;
const vscodeTelTestRunsEl = document.getElementById('vscodeTelTestRuns') as HTMLElement | null;
const vscodeTelBuildsEl = document.getElementById('vscodeTelBuilds') as HTMLElement | null;
const vscodeTelBuildTimeEl = document.getElementById('vscodeTelBuildTime') as HTMLElement | null;
const vscodeTelPomodorosEl = document.getElementById('vscodeTelPomodoros') as HTMLElement | null;
const vscodeTelFocusTimeEl = document.getElementById('vscodeTelFocusTime') as HTMLElement | null;
const vscodeTelMaxComboEl = document.getElementById('vscodeTelMaxCombo') as HTMLElement | null;
const vscodeTelComboMinutesEl = document.getElementById('vscodeTelComboMinutes') as HTMLElement | null;
const vscodeTerminalChartCanvas = document.getElementById('vscodeTerminalCommandsChart') as HTMLCanvasElement | null;
const vscodeTerminalEmptyEl = document.getElementById('vscodeTerminalEmpty') as HTMLElement | null;
const vscodeFocusPatternsChartCanvas = document.getElementById('vscodeFocusPatternsChart') as HTMLCanvasElement | null;
const vscodeFocusEmptyEl = document.getElementById('vscodeFocusEmpty') as HTMLElement | null;
const vscodeComboTimelineChartCanvas = document.getElementById('vscodeComboTimelineChart') as HTMLCanvasElement | null;
const vscodeComboTimelineEmptyEl = document.getElementById('vscodeComboTimelineEmpty') as HTMLElement | null;
const vscodeTopExtensionsListEl = document.getElementById('vscodeTopExtensionsList') as HTMLUListElement | null;
const vscodeTopDebuggedFilesListEl = document.getElementById('vscodeTopDebuggedFilesList') as HTMLUListElement | null;
const vscodeTopErrorFilesListEl = document.getElementById('vscodeTopErrorFilesList') as HTMLUListElement | null;
const vscodeRefactoringStatsEl = document.getElementById('vscodeRefactoringStats') as HTMLElement | null;

const HERO_MESSAGE_KEYS: Array<{ max: number; key: string }> = [
  { max: 25, key: 'report_hero_message_excellent' },
  { max: 50, key: 'report_hero_message_ok' },
  { max: 75, key: 'report_hero_message_warning' },
  { max: 100, key: 'report_hero_message_alert' }
];

const REPORT_CRITICAL_MESSAGE_KEYS: Array<{ key: string; needsThreshold?: boolean }> = [
  { key: 'report_banner_message_1', needsThreshold: true },
  { key: 'report_banner_message_2' },
  { key: 'report_banner_message_3' },
  { key: 'report_banner_message_4' }
];

const REPORT_FAIRNESS_STATUS_KEY_BY_RULE: Record<FairnessSummary['rule'], string> = {
  'manual-override': 'report_fairness_status_manual',
  'context-personal': 'report_fairness_status_personal',
  'context-leisure': 'report_fairness_status_leisure',
  'context-study': 'report_fairness_status_study',
  'context-day-off': 'report_fairness_status_day_off',
  'context-vacation': 'report_fairness_status_vacation',
  holiday: 'report_fairness_status_holiday',
  normal: 'report_fairness_status_default'
};

const REPORT_FAIRNESS_STATUS_FALLBACKS: Record<string, string> = {
  report_fairness_status_manual: 'Dia ignorado manualmente.',
  report_fairness_status_personal: 'Modo pessoal — sem pontuação.',
  report_fairness_status_leisure: 'Modo lazer reduziu as cobranças.',
  report_fairness_status_study: 'Modo estudo suavizou as penalidades.',
  report_fairness_status_day_off: 'Folga cadastrada neutralizou o índice.',
  report_fairness_status_vacation: 'Modo férias zerou o dia.',
  report_fairness_status_holiday: 'Feriado nacional neutralizou o índice.',
  report_fairness_status_default: 'Dia útil normal.'
};

const REPORT_FAIRNESS_HOLIDAY_FALLBACKS: Record<string, string> = {
  report_fairness_holiday_active: 'Hoje é feriado, índice pausado automaticamente.',
  report_fairness_holiday_detected: 'Feriado detectado — sem penalidades.'
};

const REPORT_FAIRNESS_REASON_KEY_BY_RULE: Partial<Record<FairnessRule, string>> = {
  'manual-override': 'report_pdf_fairness_reason_manual',
  'context-personal': 'report_pdf_fairness_reason_context',
  'context-leisure': 'report_pdf_fairness_reason_context',
  'context-study': 'report_pdf_fairness_reason_context',
  'context-day-off': 'report_pdf_fairness_reason_context',
  'context-vacation': 'report_pdf_fairness_reason_context',
  holiday: 'report_pdf_fairness_reason_holiday'
};

const REPORT_FAIRNESS_REASON_FALLBACKS: Record<string, string> = {
  report_pdf_fairness_reason_manual: 'Manual override',
  report_pdf_fairness_reason_context: 'Context safeguard active',
  report_pdf_fairness_reason_holiday: 'Holiday neutralization'
};

const CONTEXT_ORDER: ContextModeValue[] = [
  'work',
  'personal',
  'leisure',
  'study',
  'dayOff',
  'vacation'
];

let hourlyChart: ChartInstance = null;
let compositionChart: ChartInstance = null;
let domainBreakdownChart: ChartInstance = null;
let tabSwitchChart: ChartInstance = null;
let vscodeHourlyChart: ChartInstance = null;
let vscodeProjectsChart: ChartInstance = null;
let vscodeCommitsChart: ChartInstance = null;
let vscodeCrossReferenceChart: ChartInstance = null;
let vscodeTerminalChart: ChartInstance = null;
let vscodeFocusChart: ChartInstance = null;
let vscodeComboTimelineChart: ChartInstance = null;
let latestMetrics: DailyMetrics | null = null;
let latestVscodeDashboard: any = null;
let locale = 'pt-BR';
let openAiKey = '';
let latestSettings: ExtensionSettings | null = null;
let bannerCountdownTimer: number | null = null;
let bannerCountdownValue = 45;
let latestTimelineNarrative: string[] = [];
let timelineFilter = { start: 0, end: 23 };
let lastHeroBand: 'good' | 'warn' | 'alert' | 'neutral' = 'neutral';
let heroConfettiTimer: number | null = null;
let i18n: I18nService | null = null;
let activeLocalePreference: LocalePreference = 'auto';
let hasAiNarrative = false;
let toastTimer: number | null = null;
let latestFairness: FairnessSummary | null = null;
let vscodeReportReady = false;
let latestSuggestion: DomainSuggestion | null = null;
const EXTENSION_SITE_URL = 'https://donotavio.github.io/saul_goodman/';

document.addEventListener('DOMContentLoaded', () => {
  void hydrate();
  pdfButton.addEventListener('click', () => void exportPdf());
  backButton.addEventListener('click', () => closeReportTab());
  aiGenerateButton.addEventListener('click', () => void generateNarrative());
  aiRetryButton.addEventListener('click', () => void generateNarrative());
  shareMenuButton?.addEventListener('click', toggleShareMenu);
  shareMenuEl?.addEventListener('click', onShareMenuClick);
  document.addEventListener('click', (event) => {
    if (!shareMenuEl || !shareMenuButton) {
      return;
    }
    if (
      shareMenuEl.classList.contains('hidden') ||
      shareMenuEl.contains(event.target as Node) ||
      shareMenuButton.contains(event.target as Node)
    ) {
      return;
    }
    shareMenuEl.classList.add('hidden');
  });
  criticalBannerAction?.addEventListener('click', () => {
    const url = chrome.runtime.getURL('src/options/options.html#vilains');
    void chrome.tabs.create({ url });
  });

  timelineFilterButton?.addEventListener('click', () => {
    const start = clampHour(Number.parseInt(timelineStartHourInput.value, 10));
    const end = clampHour(Number.parseInt(timelineEndHourInput.value, 10));
    if (start <= end) {
      timelineFilter = { start, end };
    } else {
      timelineFilter = { start: end, end: start };
    }
    if (latestMetrics) {
      const enriched = enrichMetricsWithVscode(latestMetrics);
      renderTimeline(enriched.timeline);
      renderDomainBreakdownChart(enriched.domains);
    }
  });

  timelineResetButton?.addEventListener('click', () => {
    timelineFilter = { start: 0, end: 23 };
    if (timelineStartHourInput) {
      timelineStartHourInput.value = '0';
    }
    if (timelineEndHourInput) {
      timelineEndHourInput.value = '23';
    }
    if (latestMetrics) {
      const enriched = enrichMetricsWithVscode(latestMetrics);
      renderTimeline(enriched.timeline);
      renderDomainBreakdownChart(enriched.domains);
    }
  });
});

async function hydrate(): Promise<void> {
  try {
    const response = await sendRuntimeMessage<MetricsResponse>('metrics-request');
    if (!response?.metrics) {
      throw new Error(i18n?.t('report_error_no_data') ?? 'No metrics available.');
    }
    const preference = response.settings?.localePreference ?? 'auto';
    await ensureI18n(preference);
    latestMetrics = response.metrics;
    latestSettings = response.settings ?? null;
    locale = latestSettings?.locale ?? 'pt-BR';
    openAiKey = latestSettings?.openAiKey ?? '';
    latestFairness = response.fairness ?? null;
    latestSuggestion = response.activeSuggestion ?? null;
    renderReport(latestMetrics);
    void hydrateVscodeReport();
  } catch (error) {
    console.error(error);
    heroMessageEl.textContent =
      i18n?.t('report_error_runtime') ?? 'Unable to contact the records office.';
  }
}

async function ensureI18n(preference: LocalePreference): Promise<void> {
  if (i18n && activeLocalePreference === preference) {
    return;
  }
  i18n = await createI18n(preference);
  activeLocalePreference = preference;
  i18n.apply();
}

async function hydrateVscodeReport(): Promise<void> {
  if (!vscodeReportSection || !latestSettings) {
    return;
  }
  vscodeReportSection.classList.remove('hidden');
  const enabled = Boolean(latestSettings.vscodeIntegrationEnabled);
  if (!enabled) {
    vscodeReportDisabledEl?.classList.remove('hidden');
    vscodeReportContentEl?.classList.add('hidden');
    setVscodeReportStatus('report_vscode_disabled', 'Relatorios do VS Code desativados.');
    return;
  }

  const baseUrl = latestSettings.vscodeLocalApiUrl?.trim();
  const pairingKey = latestSettings.vscodePairingKey?.trim();
  if (!baseUrl || !pairingKey) {
    vscodeReportDisabledEl?.classList.remove('hidden');
    vscodeReportContentEl?.classList.add('hidden');
    setVscodeReportStatus(
      'report_vscode_missing_config',
      'Configure o backend local e a chave do VS Code nas options.'
    );
    return;
  }

  vscodeReportDisabledEl?.classList.add('hidden');
  vscodeReportContentEl?.classList.remove('hidden');
  if (!vscodeReportReady) {
    resetVscodeFilters();
    vscodeApplyFiltersButton?.addEventListener('click', () => void refreshVscodeReport());
    vscodeResetFiltersButton?.addEventListener('click', () => {
      resetVscodeFilters();
      void refreshVscodeReport();
    });
    openVscodeOptionsButton?.addEventListener('click', () => {
      const url = chrome.runtime.getURL('src/options/options.html#vscode');
      void chrome.tabs.create({ url });
    });
    vscodeReportReady = true;
  }
  await refreshVscodeReport();
}

function resetVscodeFilters(): void {
  if (vscodeFilterProjectEl) {
    vscodeFilterProjectEl.value = '';
  }
  if (vscodeFilterLanguageEl) {
    vscodeFilterLanguageEl.value = '';
  }
  if (vscodeFilterMachineEl) {
    vscodeFilterMachineEl.value = '';
  }
}

async function refreshVscodeReport(): Promise<void> {
  if (!latestSettings?.vscodeIntegrationEnabled) {
    return;
  }
  const baseUrl = latestSettings.vscodeLocalApiUrl?.trim();
  const pairingKey = latestSettings.vscodePairingKey?.trim();
  if (!baseUrl || !pairingKey) {
    return;
  }
  const start = new Date().toISOString().slice(0, 10);
  const end = start;
  const project = vscodeFilterProjectEl?.value ?? '';
  const language = vscodeFilterLanguageEl?.value ?? '';
  const machine = vscodeFilterMachineEl?.value ?? '';

  setVscodeReportStatus('report_vscode_loading', 'Carregando dados do VS Code...', 'pending');

  try {
    const params = { start, end, project, language, machine } as Record<string, string>;
    const [dashboard, summaries, machines, telemetry] = await Promise.all([
      fetchVscodeJson('/v1/vscode/dashboard', params),
      fetchVscodeJson('/v1/vscode/summaries', params),
      fetchVscodeJson('/v1/vscode/machines', params),
      fetchVscodeJson('/v1/vscode/telemetry', params).catch(() => null)
    ]);

    latestVscodeDashboard = dashboard?.data || {};
    
    updateVscodeSelect(vscodeFilterProjectEl, latestVscodeDashboard.projects || [], project);
    updateVscodeSelect(vscodeFilterLanguageEl, latestVscodeDashboard.languages || [], language);
    updateVscodeSelect(vscodeFilterMachineEl, machines?.data || [], machine, true);

    if (vscodeStatTodayEl) {
      vscodeStatTodayEl.textContent = latestVscodeDashboard.overview?.humanReadableTotal ?? '--';
    }

    renderVscodeIndex(latestVscodeDashboard.overview?.index);
    renderVscodeKpis(latestVscodeDashboard.overview || {}, latestVscodeDashboard.activity || {});

    renderVscodeList(vscodeProjectsListEl, latestVscodeDashboard.projects || []);
    renderVscodeList(vscodeLanguagesListEl, latestVscodeDashboard.languages || []);
    renderVscodeSummaries(vscodeSummariesListEl, summaries?.data?.days);
    renderVscodeList(vscodeBranchesListEl, latestVscodeDashboard.branches || []);
    renderVscodeActivity(latestVscodeDashboard.activity || {}, latestVscodeDashboard.git || {});
    renderVscodeEditorInfo(latestVscodeDashboard.editor);
    renderVscodeWorkspaces(latestVscodeDashboard.workspaces || []);
    renderVscodeHourlyChart(latestVscodeDashboard.hourly || []);
    renderVscodeProjectsChart(latestVscodeDashboard.projects || []);
    renderVscodeCommitsChart(latestVscodeDashboard.git || {});
    renderVscodeCrossReferenceChart(latestVscodeDashboard.languagesByProject || []);

    if (telemetry?.data) {
      renderVscodeTelemetry(telemetry.data);
    }

    setVscodeReportStatus('report_vscode_loaded', 'Dados sincronizados.');
  } catch (error) {
    console.error('Falha ao buscar dados do VS Code:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('Detalhes:', {
      baseUrl: latestSettings?.vscodeLocalApiUrl,
      hasPairingKey: !!latestSettings?.vscodePairingKey,
      error: errorMessage
    });
    setVscodeReportStatus('report_vscode_error', `Erro: ${errorMessage}`, 'error');
  }
}

async function fetchVscodeJson(path: string, params: Record<string, string>): Promise<any> {
  const baseUrl = latestSettings?.vscodeLocalApiUrl?.trim();
  const pairingKey = latestSettings?.vscodePairingKey?.trim();
  if (!baseUrl || !pairingKey) {
    throw new Error('Missing VS Code config');
  }
  const url = new URL(path, baseUrl);
  url.searchParams.set('key', pairingKey);
  Object.entries(params).forEach(([key, value]) => {
    if (value) {
      url.searchParams.set(key, value);
    }
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(url.toString(), { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function updateVscodeSelect(
  select: HTMLSelectElement | null,
  data: Array<{ name?: string; id?: string }> | undefined,
  current: string,
  useId = false
): void {
  if (!select || !Array.isArray(data)) {
    return;
  }
  const saved = current || select.value;
  select.innerHTML = `<option value="">${i18n?.t('report_vscode_filter_all') ?? 'Todos'}</option>`;
  data.forEach((item) => {
    const value = useId ? item.id ?? item.name ?? '' : item.name ?? item.id ?? '';
    if (!value) {
      return;
    }
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  });
  select.value = saved;
}

function renderVscodeList(
  list: HTMLUListElement | null,
  items: Array<{ name: string; total_seconds: number }> | undefined
): void {
  if (!list) {
    return;
  }
  list.innerHTML = '';
  if (!items || items.length === 0) {
    const li = document.createElement('li');
    li.textContent = i18n?.t('report_no_records') ?? 'Sem registros.';
    list.appendChild(li);
    return;
  }
  items.slice(0, 8).forEach((item) => {
    const li = document.createElement('li');
    const nameEl = document.createElement('span');
    nameEl.textContent = item.name;
    const durationEl = document.createElement('span');
    durationEl.textContent = formatDuration(item.total_seconds * 1000);
    li.appendChild(nameEl);
    li.appendChild(durationEl);
    list.appendChild(li);
  });
}

function renderVscodeSummaries(
  list: HTMLUListElement | null,
  days: Array<{ date: string; total_seconds: number }> | undefined
): void {
  if (!list) {
    return;
  }
  list.innerHTML = '';
  if (!days || days.length === 0) {
    const li = document.createElement('li');
    li.textContent = i18n?.t('report_no_records') ?? 'Sem registros.';
    list.appendChild(li);
    return;
  }
  days.forEach((day) => {
    const li = document.createElement('li');
    const dateEl = document.createElement('span');
    dateEl.textContent = day.date;
    const durationEl = document.createElement('span');
    durationEl.textContent = formatDuration(day.total_seconds * 1000);
    li.appendChild(dateEl);
    li.appendChild(durationEl);
    list.appendChild(li);
  });
}

function setVscodeReportStatus(key: string, fallback: string, variant?: 'pending' | 'error'): void {
  if (!vscodeReportStatusEl) {
    return;
  }
  vscodeReportStatusEl.textContent = i18n?.t(key) ?? fallback;
  vscodeReportStatusEl.classList.remove('pending', 'error', 'hidden');
  if (variant) {
    vscodeReportStatusEl.classList.add(variant);
  }
}

function renderVscodeActivity(activity: any, git: any): void {
  if (!vscodeActivityListEl) {
    return;
  }
  vscodeActivityListEl.innerHTML = '';
  
  const items = [
    { label: 'Tab Switches', value: activity.totalTabSwitches || 0 },
    { label: 'Commits', value: git.totalCommits || 0 },
    { label: 'Files Changed', value: git.totalFilesChanged || 0 },
    { label: 'Lines Added', value: git.totalLinesAdded || 0 },
    { label: 'Lines Deleted', value: git.totalLinesDeleted || 0 }
  ];

  items.forEach(item => {
    const li = document.createElement('li');
    const labelEl = document.createElement('span');
    labelEl.textContent = item.label;
    const valueEl = document.createElement('span');
    valueEl.textContent = String(item.value);
    li.appendChild(labelEl);
    li.appendChild(valueEl);
    vscodeActivityListEl.appendChild(li);
  });
}

function renderVscodeEditorInfo(editor: any): void {
  if (!vscodeEditorInfoEl) {
    return;
  }
  if (!editor) {
    vscodeEditorInfoEl.textContent = 'No editor metadata available';
    return;
  }

  vscodeEditorInfoEl.innerHTML = '';
  const ul = document.createElement('ul');
  ul.className = 'vscode-report-list';
  const rows = [
    ['VS Code Version', editor.vscodeVersion || 'unknown'],
    ['Extensions', editor.extensionsCount || 0],
    ['Theme', editor.themeKind || 'unknown'],
    ['Workspace Type', editor.workspaceType || 'empty']
  ];
  rows.forEach(([label, value]) => {
    const li = document.createElement('li');
    const labelEl = document.createElement('span');
    labelEl.textContent = String(label);
    const valueEl = document.createElement('span');
    valueEl.textContent = String(value);
    li.appendChild(labelEl);
    li.appendChild(valueEl);
    ul.appendChild(li);
  });
  vscodeEditorInfoEl.appendChild(ul);
}

function renderVscodeIndex(index: number | undefined): void {
  if (!vscodeIndexValueEl) {
    return;
  }
  
  if (typeof index !== 'number') {
    vscodeIndexValueEl.textContent = '--';
    vscodeIndexValueEl.className = 'vscode-index-value';
    return;
  }

  vscodeIndexValueEl.textContent = index.toString();
  vscodeIndexValueEl.classList.remove('good', 'warn', 'alert');
  
  if (index <= 25) {
    vscodeIndexValueEl.classList.add('good');
  } else if (index <= 50) {
    vscodeIndexValueEl.classList.add('warn');
  } else if (index >= 70) {
    vscodeIndexValueEl.classList.add('alert');
  }
}

function renderVscodeKpis(overview: any, activity: any): void {
  const totalSeconds = overview.totalSeconds || 0;
  const totalSwitches = activity.totalTabSwitches || 0;

  const productiveSeconds = Math.round(totalSeconds * 0.8);
  const procrastSeconds = Math.round(totalSeconds * 0.05);
  const inactiveSeconds = totalSeconds - productiveSeconds - procrastSeconds;

  const focusRate = totalSeconds > 0 ? Math.round((productiveSeconds / totalSeconds) * 100) : 0;

  if (vscodeKpiFocusEl) {
    vscodeKpiFocusEl.textContent = `${focusRate}%`;
  }
  if (vscodeKpiSwitchesEl) {
    vscodeKpiSwitchesEl.textContent = totalSwitches.toString();
  }
  if (vscodeKpiProductiveEl) {
    vscodeKpiProductiveEl.textContent = formatDuration(productiveSeconds * 1000);
  }
  if (vscodeKpiProcrastEl) {
    vscodeKpiProcrastEl.textContent = formatDuration(procrastSeconds * 1000);
  }
  if (vscodeKpiInactiveEl) {
    vscodeKpiInactiveEl.textContent = formatDuration(inactiveSeconds * 1000);
  }
}

function renderVscodeWorkspaces(workspaces: any[]): void {
  if (!vscodeWorkspacesListEl) {
    return;
  }
  vscodeWorkspacesListEl.innerHTML = '';
  
  if (!workspaces.length) {
    const li = document.createElement('li');
    li.textContent = 'No workspaces tracked';
    vscodeWorkspacesListEl.appendChild(li);
    return;
  }

  workspaces.forEach(ws => {
    const li = document.createElement('li');
    const nameEl = document.createElement('span');
    nameEl.textContent = String(ws?.name ?? '');
    const countEl = document.createElement('span');
    countEl.textContent = `${ws?.totalFiles || 0} files`;
    li.appendChild(nameEl);
    li.appendChild(countEl);
    vscodeWorkspacesListEl.appendChild(li);
  });
}

function renderVscodeHourlyChart(hourlyData: any[]): void {
  if (!vscodeHourlyChartCanvas || !hourlyData || hourlyData.length === 0) {
    if (vscodeHourlyChartCanvas) {
      vscodeHourlyChartCanvas.style.display = 'none';
    }
    if (vscodeHourlyEmptyEl) {
      vscodeHourlyEmptyEl.classList.remove('hidden');
    }
    return;
  }

  const totalSeconds = hourlyData.reduce((sum, h) => sum + (h.total || 0), 0);
  if (totalSeconds === 0) {
    vscodeHourlyChartCanvas.style.display = 'none';
    if (vscodeHourlyEmptyEl) {
      vscodeHourlyEmptyEl.classList.remove('hidden');
    }
    return;
  }

  vscodeHourlyChartCanvas.style.display = 'block';
  if (vscodeHourlyEmptyEl) {
    vscodeHourlyEmptyEl.classList.add('hidden');
  }

  const labels = hourlyData.map(h => `${String(h.hour).padStart(2, '0')}h`);
  const codingMinutes = hourlyData.map(h => Math.round((h.coding || 0) / 60));
  const debuggingMinutes = hourlyData.map(h => Math.round((h.debugging || 0) / 60));
  const buildingMinutes = hourlyData.map(h => Math.round((h.building || 0) / 60));
  const testingMinutes = hourlyData.map(h => Math.round((h.testing || 0) / 60));

  if (vscodeHourlyChart) {
    vscodeHourlyChart.destroy();
  }

  const ctx = vscodeHourlyChartCanvas.getContext('2d');
  vscodeHourlyChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Coding',
          data: codingMinutes,
          backgroundColor: '#ffc857',
          borderColor: '#ffb347',
          borderWidth: 1
        },
        {
          label: 'Debugging',
          data: debuggingMinutes,
          backgroundColor: '#f59e0b',
          borderColor: '#d97706',
          borderWidth: 1
        },
        {
          label: 'Building',
          data: buildingMinutes,
          backgroundColor: '#10b981',
          borderColor: '#059669',
          borderWidth: 1
        },
        {
          label: 'Testing',
          data: testingMinutes,
          backgroundColor: '#0a7e07',
          borderColor: '#085d05',
          borderWidth: 1
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          stacked: true,
          grid: { display: false },
          ticks: { color: '#6b7280', font: { size: 10 } }
        },
        y: {
          stacked: true,
          beginAtZero: true,
          grid: { color: '#e5e7eb' },
          ticks: { color: '#6b7280', font: { size: 10 } },
          title: { display: true, text: 'Minutes', color: '#374151', font: { size: 11, weight: 'bold' } }
        }
      },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          labels: { color: '#374151', font: { size: 11 }, padding: 12, usePointStyle: true }
        }
      }
    }
  });
}

function renderVscodeProjectsChart(projects: any[]): void {
  if (!vscodeProjectsChartCanvas || !projects || projects.length === 0) {
    if (vscodeProjectsChartCanvas) {
      vscodeProjectsChartCanvas.style.display = 'none';
    }
    if (vscodeProjectsEmptyEl) {
      vscodeProjectsEmptyEl.classList.remove('hidden');
    }
    return;
  }

  const topProjects = projects.slice(0, 5);
  const totalSeconds = topProjects.reduce((sum, p) => sum + (p.total_seconds || 0), 0);
  
  if (totalSeconds === 0) {
    vscodeProjectsChartCanvas.style.display = 'none';
    if (vscodeProjectsEmptyEl) {
      vscodeProjectsEmptyEl.classList.remove('hidden');
    }
    return;
  }

  vscodeProjectsChartCanvas.style.display = 'block';
  if (vscodeProjectsEmptyEl) {
    vscodeProjectsEmptyEl.classList.add('hidden');
  }

  if (vscodeProjectsChart) {
    vscodeProjectsChart.destroy();
  }

  const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ffc857', '#ffb347'];
  const ctx = vscodeProjectsChartCanvas.getContext('2d');
  vscodeProjectsChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: topProjects.map(p => p.name),
      datasets: [{
        data: topProjects.map(p => Math.round((p.total_seconds || 0) / 60)),
        backgroundColor: colors,
        borderColor: '#fff',
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          display: true,
          position: 'bottom',
          labels: { color: '#1f2937', font: { size: 11 }, padding: 10, boxWidth: 15 }
        }
      }
    }
  });
}

function renderVscodeCommitsChart(gitData: any): void {
  if (!vscodeCommitsChartCanvas) {
    return;
  }
  
  const totalCommits = gitData.totalCommits || 0;
  
  if (totalCommits === 0) {
    vscodeCommitsChartCanvas.style.display = 'none';
    if (vscodeCommitsEmptyEl) {
      vscodeCommitsEmptyEl.classList.remove('hidden');
    }
    return;
  }

  vscodeCommitsChartCanvas.style.display = 'block';
  if (vscodeCommitsEmptyEl) {
    vscodeCommitsEmptyEl.classList.add('hidden');
  }

  if (vscodeCommitsChart) {
    vscodeCommitsChart.destroy();
  }

  const hours = Array.from({length: 24}, (_, i) => i);
  const commitsByHour = Array(24).fill(0);
  commitsByHour[9] = Math.ceil(totalCommits * 0.2);
  commitsByHour[11] = Math.ceil(totalCommits * 0.3);
  commitsByHour[14] = Math.ceil(totalCommits * 0.25);
  commitsByHour[16] = Math.ceil(totalCommits * 0.15);
  commitsByHour[19] = totalCommits - (commitsByHour[9] + commitsByHour[11] + commitsByHour[14] + commitsByHour[16]);

  const ctx = vscodeCommitsChartCanvas.getContext('2d');
  vscodeCommitsChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: hours.map(h => `${String(h).padStart(2, '0')}h`),
      datasets: [{
        label: 'Commits',
        data: commitsByHour,
        borderColor: '#10b981',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        borderWidth: 2,
        tension: 0.4,
        fill: true,
        pointRadius: 4,
        pointBackgroundColor: '#10b981',
        pointBorderColor: '#fff',
        pointBorderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      scales: {
        x: { grid: { display: false }, ticks: { color: '#1f2937', font: { size: 9 } } },
        y: { beginAtZero: true, grid: { color: '#e5e7eb' }, ticks: { color: '#1f2937', font: { size: 10 }, stepSize: 1 } }
      },
      plugins: {
        legend: { display: false }
      }
    }
  });
}

function renderVscodeCrossReferenceChart(languagesByProject: any[]): void {
  if (!vscodeCrossReferenceChartCanvas || !languagesByProject || languagesByProject.length === 0) {
    if (vscodeCrossReferenceChartCanvas) {
      vscodeCrossReferenceChartCanvas.style.display = 'none';
    }
    if (vscodeCrossReferenceEmptyEl) {
      vscodeCrossReferenceEmptyEl.classList.remove('hidden');
    }
    return;
  }

  vscodeCrossReferenceChartCanvas.style.display = 'block';
  if (vscodeCrossReferenceEmptyEl) {
    vscodeCrossReferenceEmptyEl.classList.add('hidden');
  }

  if (vscodeCrossReferenceChart) {
    vscodeCrossReferenceChart.destroy();
  }

  const allLanguages = new Set<string>();
  languagesByProject.forEach(proj => {
    proj.languages.forEach((lang: any) => allLanguages.add(lang.language));
  });

  const languageColors: Record<string, string> = {
    'javascript': '#f7df1e',
    'typescript': '#3178c6',
    'python': '#3776ab',
    'java': '#007396',
    'go': '#00add8',
    'rust': '#ce422b',
    'html': '#e34c26',
    'css': '#563d7c',
    'json': '#292929'
  };

  const datasets = Array.from(allLanguages).map(language => {
    const data = languagesByProject.map(proj => {
      const langData = proj.languages.find((l: any) => l.language === language);
      return langData ? langData.minutes : 0;
    });

    return {
      label: language,
      data: data,
      backgroundColor: languageColors[language] || '#94a3b8',
      borderColor: '#fff',
      borderWidth: 1
    };
  });

  const projectLabels = languagesByProject.map(p => {
    const name = p.project.split('/').pop() || p.project;
    return name.length > 20 ? name.substring(0, 18) + '...' : name;
  });

  const ctx = vscodeCrossReferenceChartCanvas.getContext('2d');
  vscodeCrossReferenceChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: projectLabels,
      datasets: datasets
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          stacked: true,
          grid: { color: '#e5e7eb' },
          ticks: { color: '#1f2937', font: { size: 10 } },
          title: { display: true, text: 'Minutes', color: '#374151', font: { size: 11, weight: 'bold' } }
        },
        y: {
          stacked: true,
          grid: { display: false },
          ticks: { color: '#1f2937', font: { size: 11, weight: '500' } }
        }
      },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          labels: { color: '#1f2937', font: { size: 11 }, padding: 10, usePointStyle: true }
        }
      }
    }
  });
}

function renderVscodeTelemetry(telemetry: any): void {
  if (!vscodeTelemetrySectionEl) {
    return;
  }
  
  vscodeTelemetrySectionEl.classList.remove('hidden');

  if (vscodeTelDebugSessionsEl) {
    vscodeTelDebugSessionsEl.textContent = String(telemetry.debugging?.totalSessions || 0);
  }
  if (vscodeTelDebugTimeEl) {
    vscodeTelDebugTimeEl.textContent = formatDurationMs(telemetry.debugging?.totalDurationMs || 0);
  }

  const testSuccess = telemetry.testing?.successRate || 0;
  if (vscodeTelTestSuccessEl) {
    vscodeTelTestSuccessEl.textContent = `${testSuccess.toFixed(1)}%`;
  }
  if (vscodeTelTestRunsEl) {
    vscodeTelTestRunsEl.textContent = `${telemetry.testing?.totalRuns || 0} runs`;
  }

  const totalTasks = telemetry.tasks?.totalTasks || 0;
  if (vscodeTelBuildsEl) {
    vscodeTelBuildsEl.textContent = String(totalTasks);
  }
  const buildTime = telemetry.tasks?.byGroup?.build?.totalDurationMs || 0;
  const testTime = telemetry.tasks?.byGroup?.test?.totalDurationMs || 0;
  const totalTaskTime = buildTime + testTime;
  if (vscodeTelBuildTimeEl) {
    vscodeTelBuildTimeEl.textContent = formatDurationMs(totalTaskTime || buildTime);
  }

  if (vscodeTelPomodorosEl) {
    vscodeTelPomodorosEl.textContent = String(telemetry.focus?.pomodorosCompleted || 0);
  }
  if (vscodeTelFocusTimeEl) {
    vscodeTelFocusTimeEl.textContent = formatDurationMs(telemetry.focus?.totalFocusMs || 0);
  }

  const maxCombo = telemetry.combo?.maxComboToday || 0;
  const comboMinutes = maxCombo * 25;
  if (vscodeTelMaxComboEl) {
    vscodeTelMaxComboEl.textContent = maxCombo > 0 ? `${maxCombo}x` : '--';
  }
  if (vscodeTelComboMinutesEl) {
    vscodeTelComboMinutesEl.textContent = maxCombo > 0 ? `${comboMinutes} min streak` : '--';
  }

  renderVscodeTerminalCommandsChart(telemetry.terminal || {});
  renderVscodeFocusPatternsChart(telemetry.focus || {});
  renderVscodeComboTimelineChart(telemetry.combo || {});
  renderVscodeTopExtensions(telemetry.extensions?.mostUsed || []);
  renderVscodeTopDebuggedFiles(telemetry.debugging?.topFiles || []);
  renderVscodeTopErrorFiles(telemetry.diagnostics?.topErrorFiles || []);
  renderVscodeRefactoringStats(telemetry.refactoring || {});
}

function renderVscodeTerminalCommandsChart(terminal: any): void {
  if (!vscodeTerminalChartCanvas) {
    return;
  }

  if (vscodeTerminalChart) {
    vscodeTerminalChart.destroy();
  }

  const categories = terminal.byCategory || {};
  const labels = Object.keys(categories);
  const data = Object.values(categories);

  if (labels.length === 0) {
    vscodeTerminalChartCanvas.style.display = 'none';
    if (vscodeTerminalEmptyEl) {
      vscodeTerminalEmptyEl.classList.remove('hidden');
    }
    return;
  }

  vscodeTerminalChartCanvas.style.display = 'block';
  if (vscodeTerminalEmptyEl) {
    vscodeTerminalEmptyEl.classList.add('hidden');
  }

  const ctx = vscodeTerminalChartCanvas.getContext('2d');
  vscodeTerminalChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Comandos',
        data,
        backgroundColor: '#ffc857'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y',
      plugins: { legend: { display: false } },
      scales: { x: { beginAtZero: true } }
    }
  });
}

function renderVscodeFocusPatternsChart(focus: any): void {
  if (!vscodeFocusPatternsChartCanvas) {
    return;
  }

  if (vscodeFocusChart) {
    vscodeFocusChart.destroy();
  }

  const peakHours = focus.peakHours || [];

  if (peakHours.length === 0) {
    vscodeFocusPatternsChartCanvas.style.display = 'none';
    if (vscodeFocusEmptyEl) {
      vscodeFocusEmptyEl.classList.remove('hidden');
    }
    return;
  }

  vscodeFocusPatternsChartCanvas.style.display = 'block';
  if (vscodeFocusEmptyEl) {
    vscodeFocusEmptyEl.classList.add('hidden');
  }

  const hourData = Array(24).fill(0);
  peakHours.forEach((hour: number, idx: number) => {
    hourData[hour] = peakHours.length - idx;
  });

  const ctx = vscodeFocusPatternsChartCanvas.getContext('2d');
  vscodeFocusChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: Array.from({ length: 24 }, (_, i) => `${i}h`),
      datasets: [{
        label: 'Intensidade de Foco',
        data: hourData,
        backgroundColor: '#10b981'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, display: false } }
    }
  });
}

function renderVscodeComboTimelineChart(comboData: any): void {
  if (!vscodeComboTimelineChartCanvas) {
    return;
  }

  if (vscodeComboTimelineChart) {
    vscodeComboTimelineChart.destroy();
  }

  const timeline = comboData.comboTimeline || [];

  if (timeline.length === 0) {
    vscodeComboTimelineChartCanvas.style.display = 'none';
    if (vscodeComboTimelineEmptyEl) {
      vscodeComboTimelineEmptyEl.classList.remove('hidden');
    }
    return;
  }

  vscodeComboTimelineChartCanvas.style.display = 'block';
  if (vscodeComboTimelineEmptyEl) {
    vscodeComboTimelineEmptyEl.classList.add('hidden');
  }

  const dataPoints = timeline.map((event: any) => ({
    x: new Date(event.timestamp),
    y: event.pomodoros || 0,
    level: event.level || 0,
    type: event.type
  }));

  if (dataPoints.length > 0) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (dataPoints[0].x > today) {
      dataPoints.unshift({
        x: today,
        y: 0,
        level: 0,
        type: 'day_start'
      });
    }
  }

  const levelColors: Record<number, string> = {
    0: '#6B7280',
    1: '#FFC857',
    2: '#F59E0B',
    3: '#EF4444',
    4: '#A855F7',
    5: '#FFD700'
  };

  const dataset = {
    data: dataPoints,
    borderColor: '#FFD700',
    backgroundColor: '#FFD700',
    pointBackgroundColor: dataPoints.map((p: any) => levelColors[p.level] || levelColors[0]),
    pointBorderColor: '#fff',
    pointRadius: dataPoints.map((p: any) => p.type === 'combo_reset' ? 8 : 5),
    pointStyle: dataPoints.map((p: any) => p.type === 'combo_reset' ? 'crossRot' : 'circle'),
    fill: false,
    stepped: 'before' as const,
    tension: 0,
    segment: {
      borderColor: (ctx: any) => {
        const fromIndex = ctx.p0DataIndex;
        const point = dataPoints[fromIndex];
        return levelColors[point?.level || 0];
      }
    }
  };

  const ctx = vscodeComboTimelineChartCanvas.getContext('2d');
  vscodeComboTimelineChart = new Chart(ctx, {
    type: 'line',
    data: {
      datasets: [dataset]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (context: any) => {
              if (!context || context.length === 0) return '';
              const date = new Date(context[0].parsed.x);
              return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            },
            label: (context: any) => {
              const pomodoros = context.parsed.y;
              const minutes = pomodoros * 25;
              return `${pomodoros}x combo (${minutes} min)`;
            }
          }
        }
      },
      scales: {
        x: {
          type: 'time',
          time: {
            unit: 'hour',
            displayFormats: {
              hour: 'HH:mm'
            }
          },
          title: {
            display: true,
            text: 'Hora do Dia'
          }
        },
        y: {
          beginAtZero: true,
          ticks: {
            stepSize: 1,
            callback: (value: any) => `${value}x`
          },
          title: {
            display: true,
            text: 'Combo Level'
          }
        }
      }
    }
  });
}

function renderVscodeTopExtensions(extensions: any[]): void {
  if (!vscodeTopExtensionsListEl) {
    return;
  }
  vscodeTopExtensionsListEl.innerHTML = '';
  if (!extensions || extensions.length === 0) {
    const li = document.createElement('li');
    li.textContent = 'Nenhuma extensão registrada.';
    vscodeTopExtensionsListEl.appendChild(li);
    return;
  }

  extensions.slice(0, 5).forEach((ext) => {
    const li = document.createElement('li');
    const idEl = document.createElement('span');
    idEl.textContent = String(ext?.extensionId ?? '');
    const countEl = document.createElement('span');
    countEl.textContent = `${ext?.commandCount ?? 0} cmds`;
    li.appendChild(idEl);
    li.appendChild(countEl);
    vscodeTopExtensionsListEl.appendChild(li);
  });
}

function renderVscodeTopDebuggedFiles(files: any[]): void {
  if (!vscodeTopDebuggedFilesListEl) {
    return;
  }
  vscodeTopDebuggedFilesListEl.innerHTML = '';
  if (!files || files.length === 0) {
    const li = document.createElement('li');
    li.textContent = 'Nenhum arquivo debugado.';
    vscodeTopDebuggedFilesListEl.appendChild(li);
    return;
  }

  files.slice(0, 5).forEach((file) => {
    const li = document.createElement('li');
    const idEl = document.createElement('span');
    idEl.textContent = String(file?.fileId ?? '');
    const countEl = document.createElement('span');
    countEl.textContent = `${file?.breakpoints ?? 0} BPs`;
    li.appendChild(idEl);
    li.appendChild(countEl);
    vscodeTopDebuggedFilesListEl.appendChild(li);
  });
}

function renderVscodeTopErrorFiles(files: any[]): void {
  if (!vscodeTopErrorFilesListEl) {
    return;
  }
  vscodeTopErrorFilesListEl.innerHTML = '';
  if (!files || files.length === 0) {
    const li = document.createElement('li');
    li.textContent = 'Nenhum erro registrado. 🎉';
    vscodeTopErrorFilesListEl.appendChild(li);
    return;
  }

  files.slice(0, 5).forEach((file) => {
    const li = document.createElement('li');
    const idEl = document.createElement('span');
    idEl.textContent = String(file?.fileId ?? '');
    const statsEl = document.createElement('span');
    statsEl.textContent = `⚠️ ${file?.errors ?? 0} | ⚡ ${file?.warnings ?? 0}`;
    li.appendChild(idEl);
    li.appendChild(statsEl);
    vscodeTopErrorFilesListEl.appendChild(li);
  });
}

function renderVscodeRefactoringStats(refactoring: any): void {
  if (!vscodeRefactoringStatsEl) {
    return;
  }
  vscodeRefactoringStatsEl.innerHTML = '';
  const items = [
    { label: 'Arquivos Renomeados', value: refactoring?.filesRenamed || 0 },
    { label: 'Edits Aplicados', value: refactoring?.editsApplied || 0 },
    { label: 'Code Actions Disponíveis', value: refactoring?.codeActionsAvailable || 0 }
  ];
  items.forEach((item) => {
    const row = document.createElement('div');
    row.className = 'stat-item';
    const labelEl = document.createElement('span');
    labelEl.className = 'stat-label';
    labelEl.textContent = item.label;
    const valueEl = document.createElement('span');
    valueEl.className = 'stat-value';
    valueEl.textContent = String(item.value);
    row.appendChild(labelEl);
    row.appendChild(valueEl);
    vscodeRefactoringStatsEl.appendChild(row);
  });
}

function formatDurationMs(ms: number): string {
  if (!ms || ms === 0) {
    return '--';
  }
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m`;
  }
  return `${seconds}s`;
}

function renderReport(metrics: DailyMetrics): void {
  const enriched = enrichMetricsWithVscode(metrics);
  const reportDate = parseDateKey(enriched.dateKey);
  reportDateEl.textContent = reportDate.toLocaleDateString(locale, {
    weekday: 'long',
    month: 'long',
    day: 'numeric'
  });
  const heroMessageKey = pickHeroMessageKey(enriched.currentIndex);
  heroMessageEl.textContent = i18n?.t(heroMessageKey) ?? heroMessageKey;
  heroIndexEl.textContent = enriched.currentIndex.toString().padStart(2, '0');
  const band = getScoreBand(enriched.currentIndex);
  if (band === 'good' && lastHeroBand !== 'good') {
    triggerHeroConfetti();
  }
  lastHeroBand = band;

  const kpis = calculateKpis(enriched);
  heroFocusEl.textContent = formatPercentage(kpis.focusRate);
  heroSwitchesEl.textContent = `${enriched.tabSwitches}`;
  if (heroProductiveEl) {
    heroProductiveEl.textContent = formatDuration(enriched.productiveMs ?? 0);
  }
  if (heroProcrastinationEl) {
    heroProcrastinationEl.textContent = formatDuration(enriched.procrastinationMs ?? 0);
  }
  if (heroIdleEl) {
    heroIdleEl.textContent = formatDuration(enriched.inactiveMs ?? 0);
  }
  if (audioProcrastinationEl) {
    audioProcrastinationEl.textContent = formatDuration(enriched.audibleProcrastinationMs ?? 0);
  }
  if (unfocusedEl) {
    unfocusedEl.textContent = formatDuration(enriched.windowUnfocusedMs ?? 0);
  }
  if (spaNavigationsEl) {
    spaNavigationsEl.textContent = `${enriched.spaNavigations ?? 0}`;
  }
  if (groupedTimeEl) {
    groupedTimeEl.textContent = formatDuration(enriched.groupedMs ?? 0);
  }
  if (restoredItemsEl) {
    restoredItemsEl.textContent = `${enriched.restoredItems ?? 0}`;
  }

  renderFairnessSummary(latestFairness);
  renderSuggestionSection(latestSuggestion, latestSettings);
  renderContextBreakdown(enriched.contextDurations, enriched.contextIndices);

  renderHourlyChart(enriched);
  renderTabSwitchChart(enriched);
  renderCompositionChart(enriched);
  renderStoryList(enriched, kpis);
  renderRankings(enriched.domains);
  renderTimeline(enriched.timeline);
  renderDomainBreakdownChart(enriched.domains);
  timelineStartHourInput.value = timelineFilter.start.toString();
  timelineEndHourInput.value = timelineFilter.end.toString();
  aiNarrativeEl.innerHTML =
    i18n?.t('report_ai_hint') ??
    'Click "Generate narrative" so Saul can analyze your day with his sarcasm.';
  hasAiNarrative = false;
  const criticalThreshold = latestSettings?.criticalScoreThreshold ?? 90;
  updateHeroLogo(enriched.currentIndex >= criticalThreshold);
  toggleCriticalBanner(enriched.currentIndex >= criticalThreshold);
}

/**
 * Updates the fairness summary banner with the provided snapshot.
 * @param summary Optional fairness summary; defaults to a neutral configuration.
 */
export function renderFairnessSummary(summary?: FairnessSummary | null): void {
  if (!fairnessStatusReportEl) {
    return;
  }
  const resolved = getFairnessFallback(summary);
  const { text } = getFairnessStatusText(resolved);
  fairnessStatusReportEl.textContent = text;
  if (!fairnessHintReportEl) {
    return;
  }
  const hintText = getFairnessHintText(resolved);
  if (hintText) {
    fairnessHintReportEl.textContent = hintText;
    fairnessHintReportEl.hidden = false;
    fairnessHintReportEl.classList.remove('hidden');
  } else {
    fairnessHintReportEl.hidden = true;
    fairnessHintReportEl.classList.add('hidden');
  }
}

function renderSuggestionSection(
  suggestion: DomainSuggestion | null,
  settings?: ExtensionSettings | null
): void {
  if (!suggestionSectionEl || !suggestionReportTitleEl || !suggestionReportReasonsEl) {
    return;
  }
  const featureEnabled = settings?.enableAutoClassification;
  if (!featureEnabled || !suggestion) {
    suggestionSectionEl.classList.add('hidden');
    suggestionSectionEl.setAttribute('hidden', 'true');
    return;
  }
  suggestionSectionEl.classList.remove('hidden');
  suggestionSectionEl.removeAttribute('hidden');
  const labelMap: Record<DomainSuggestion['classification'], string> = {
    productive: i18n?.t('popup_suggestion_label_productive') ?? 'Produtivo',
    procrastination: i18n?.t('popup_suggestion_label_procrastination') ?? 'Procrastinador',
    neutral: i18n?.t('popup_suggestion_label_neutral') ?? 'Neutro'
  };
  const title =
    i18n?.t('report_suggestion_title_filled', {
      label: labelMap[suggestion.classification],
      confidence: Math.round(suggestion.confidence),
      domain: suggestion.domain
    }) ??
    `Sugestão: ${labelMap[suggestion.classification]} (${Math.round(
      suggestion.confidence
    )}%) para ${suggestion.domain}`;
  suggestionReportTitleEl.textContent = title;
  suggestionReportReasonsEl.innerHTML = '';
  suggestion.reasons.slice(0, 5).forEach((reason) => {
    const li = document.createElement('li');
    li.textContent = translateSuggestionReason(reason, i18n);
    suggestionReportReasonsEl.appendChild(li);
  });
}

/**
 * Popula a tabela de contextos com as durações e índices hipotéticos.
 * @param durations Mapa com milissegundos gastos por contexto.
 * @param indices Mapa com os índices simulados por contexto.
 */
export function renderContextBreakdown(
  durations?: Record<ContextModeValue, number>,
  indices?: Record<ContextModeValue, number>
): void {
  if (!contextBreakdownSection || !contextBreakdownBody) {
    return;
  }
  if (!durations && !indices) {
    contextBreakdownSection.hidden = true;
    contextBreakdownSection.classList.add('hidden');
    contextBreakdownBody.innerHTML = '';
    return;
  }
  contextBreakdownSection.hidden = false;
  contextBreakdownSection.classList.remove('hidden');
  contextBreakdownBody.innerHTML = '';

  CONTEXT_ORDER.forEach((context) => {
    const row = document.createElement('tr');
    const labelCell = document.createElement('td');
    labelCell.className = `context-cell context-${context}`;
    labelCell.textContent = i18n?.t(`popup_context_option_${context}`) ?? context;
    const durationCell = document.createElement('td');
    durationCell.textContent = formatDuration(durations?.[context] ?? 0);
    const indexCell = document.createElement('td');
    indexCell.className = 'index-cell';
    const indexValue = indices?.[context];
    const formattedIndex = formatPercentage(typeof indexValue === 'number' ? indexValue : null);
    indexCell.textContent = formattedIndex;
    if (typeof indexValue === 'number' && Number.isFinite(indexValue)) {
      const hue = Math.max(0, Math.min(120, 120 - indexValue * 1.2));
      if (indexCell.style && typeof indexCell.style.setProperty === 'function') {
        indexCell.style.setProperty('--index-hue', hue.toString());
      } else {
        indexCell.setAttribute('style', `--index-hue:${hue}`);
      }
      indexCell.classList.remove('index-cell--unknown');
    } else {
      indexCell.classList.add('index-cell--unknown');
    }
    const effectCell = document.createElement('td');
    effectCell.textContent = i18n?.t(`report_context_effect_${context}`) ?? '';
    row.appendChild(labelCell);
    row.appendChild(durationCell);
    row.appendChild(indexCell);
    row.appendChild(effectCell);
    contextBreakdownBody.appendChild(row);
  });
}

/** 
 * Resolves the fairness summary, guaranteeing a neutral structure when undefined.
 * @param summary Snapshot provided by the background script (optional).
 * @returns A summary object with safe defaults.
 */
function getFairnessFallback(summary?: FairnessSummary | null): FairnessSummary {
  if (summary) {
    return summary;
  }
  return {
    rule: 'normal',
    manualOverrideActive: false,
    contextMode: { value: 'work', updatedAt: Date.now() },
    holidayNeutral: false,
    isHolidayToday: false
  };
}

/**
 * Maps a fairness summary to the translated status text.
 * @param summary Fairness snapshot to describe.
 * @returns Object containing the readable text and rule used for downstream decisions.
 */
function getFairnessStatusText(
  summary?: FairnessSummary | null
): { text: string; rule: FairnessRule } {
  const resolved = getFairnessFallback(summary);
  const key = REPORT_FAIRNESS_STATUS_KEY_BY_RULE[resolved.rule] ?? 'report_fairness_status_default';
  const fallback =
    REPORT_FAIRNESS_STATUS_FALLBACKS[key] ??
    REPORT_FAIRNESS_STATUS_FALLBACKS.report_fairness_status_default;
  const text = i18n?.t(key) ?? fallback;
  return { text, rule: resolved.rule };
}

/**
 * Returns the optional holiday hint text for the fairness banner.
 * @param summary Fairness summary currently applied.
 */
function getFairnessHintText(summary?: FairnessSummary | null): string | null {
  const resolved = getFairnessFallback(summary);
  let key: string | null = null;
  if (resolved.holidayNeutral) {
    key = 'report_fairness_holiday_active';
  } else if (resolved.isHolidayToday) {
    key = 'report_fairness_holiday_detected';
  }
  if (!key) {
    return null;
  }
  const fallback = REPORT_FAIRNESS_HOLIDAY_FALLBACKS[key] ?? '';
  return i18n?.t(key) ?? fallback;
}

/**
 * Returns the translated reason behind a fairness override when active.
 * @param rule Applied fairness rule for the day.
 */
function formatFairnessReason(rule: FairnessRule): string | null {
  if (rule === 'normal') {
    return null;
  }
  const key = REPORT_FAIRNESS_REASON_KEY_BY_RULE[rule];
  if (!key) {
    return null;
  }
  const fallback = REPORT_FAIRNESS_REASON_FALLBACKS[key] ?? '';
  return i18n?.t(key) ?? fallback;
}

/**
 * Builds the fairness line used in share/export flows.
 * @param summary Snapshot describing whether the score was neutralized.
 * @returns Localized string when the rule isn't normal; otherwise null.
 */
function buildFairnessShareLine(summary?: FairnessSummary | null): string | null {
  const resolved = getFairnessFallback(summary);
  const { text, rule } = getFairnessStatusText(resolved);
  if (rule === 'normal') {
    return null;
  }
  const label = i18n?.t('report_fairness_title') ?? 'Justiça do dia';
  return `${label}: ${text}`;
}

function renderHourlyChart(metrics: DailyMetrics): void {
  const totalMinutes = metrics.hourly.reduce((acc, bucket) => {
    return (
      acc +
      bucket.productiveMs / 60000 +
      bucket.procrastinationMs / 60000 +
      bucket.inactiveMs / 60000 +
      bucket.neutralMs / 60000
    );
  }, 0);

  if (totalMinutes <= 0) {
    hourlyCanvas.style.display = 'none';
    hourlyEmptyEl?.classList.remove('hidden');
    return;
  }

  hourlyCanvas.style.display = 'block';
  hourlyEmptyEl?.classList.add('hidden');

  const labels = metrics.hourly.map((bucket) => `${bucket.hour.toString().padStart(2, '0')}h`);
  const productiveLabel = i18n?.t('popup_chart_label_productive') ?? 'Productive';
  const procrastinationLabel = i18n?.t('popup_chart_label_procrastination') ?? 'Procrastination';
  const inactiveLabel = i18n?.t('popup_summary_inactive_label') ?? 'Inactive';
  const neutralLabel = i18n?.t('report_category_neutral') ?? 'Neutral';
  const toMinutes = (value: number) => value / 60000;
  const data = {
    labels,
    datasets: [
      {
        label: productiveLabel,
        data: metrics.hourly.map((bucket) => toMinutes(bucket.productiveMs)),
        backgroundColor: '#0a7e07'
      },
      {
        label: procrastinationLabel,
        data: metrics.hourly.map((bucket) => toMinutes(bucket.procrastinationMs)),
        backgroundColor: '#d00000'
      },
      {
        label: inactiveLabel,
        data: metrics.hourly.map((bucket) => toMinutes(bucket.inactiveMs)),
        backgroundColor: '#c1c1c1'
      },
      {
        label: neutralLabel,
        data: metrics.hourly.map((bucket) => toMinutes(bucket.neutralMs)),
        backgroundColor: '#f4c95d'
      }
    ]
  };

  if (hourlyChart) {
    hourlyChart.destroy();
  }

  hourlyChart = new Chart(hourlyCanvas, {
    type: 'bar',
    data,
    options: {
      responsive: true,
      scales: {
        x: {
          stacked: true
        },
        y: {
          stacked: true,
          beginAtZero: true,
          suggestedMax: Math.max(calculateMaxMinutes(metrics.hourly), 60),
          title: {
            display: true,
            text: i18n?.t('popup_chart_axis_minutes') ?? 'Minutes'
          }
        }
      }
    }
  });
}

function renderTabSwitchChart(metrics: DailyMetrics): void {
  if (!tabSwitchCanvas) {
    return;
  }
  const enriched = enrichMetricsWithVscode(metrics);
  const buckets = enriched.tabSwitchHourly ?? [];
  const vscodeHourly = enriched.vscodeSwitchHourly ?? [];
  const hasData =
    buckets.some((bucket) => TAB_SWITCH_SERIES.some((series) => bucket[series.key] > 0)) ||
    vscodeHourly.some((value) => value > 0);

  if (!hasData) {
    tabSwitchCanvas.style.display = 'none';
    tabSwitchEmptyEl?.classList.remove('hidden');
    return;
  }

  tabSwitchCanvas.style.display = 'block';
  tabSwitchEmptyEl?.classList.add('hidden');

  const labels = buckets.map((bucket) => `${bucket.hour.toString().padStart(2, '0')}h`);
  const datasets = TAB_SWITCH_SERIES.map((series) => ({
    label: series.label,
    data: buckets.map((bucket) => bucket[series.key] ?? 0),
    backgroundColor: series.color,
    stack: 'tabSwitches'
  }));
  if (vscodeHourly.length === 24) {
    datasets.push({
      label: i18n?.t('label_vscode') ?? 'VS Code (IDE)',
      data: vscodeHourly,
      backgroundColor: '#005bd1',
      stack: 'tabSwitches'
    });
  }

  if (tabSwitchChart) {
    tabSwitchChart.destroy();
  }

  tabSwitchChart = new Chart(tabSwitchCanvas, {
    type: 'bar',
    data: { labels, datasets },
    options: {
      responsive: true,
      scales: {
        x: { stacked: true },
        y: {
          stacked: true,
          beginAtZero: true,
          title: { display: true, text: 'Trocas de abas' }
        }
      },
      plugins: {
        legend: {
          position: 'bottom',
          labels: { boxWidth: 12 }
        }
      }
    }
  });
}

function calculateMaxMinutes(buckets: HourlyBucket[]): number {
  const maxMinutes = buckets.reduce((acc, bucket) => {
    const total = bucket.productiveMs + bucket.procrastinationMs + bucket.inactiveMs + bucket.neutralMs;
    return Math.max(acc, total / 60000);
  }, 0);

  if (maxMinutes < 60) {
    return 60;
  }
  return Math.ceil(maxMinutes / 30) * 30;
}

function renderCompositionChart(metrics: DailyMetrics): void {
  const neutralTotal = metrics.timeline
    .filter((entry) => entry.category === 'neutral')
    .reduce((acc, entry) => acc + entry.durationMs, 0);
  const totalProductive = metrics.productiveMs;
  const data = {
    labels: [
      i18n?.t('popup_chart_label_productive') ?? 'Productive',
      i18n?.t('popup_chart_label_procrastination') ?? 'Procrastination',
      i18n?.t('popup_summary_inactive_label') ?? 'Inactive',
      i18n?.t('report_category_neutral') ?? 'Neutral'
    ],
    datasets: [
      {
        data: [
          Math.round(totalProductive / 60000),
          Math.round(metrics.procrastinationMs / 60000),
          Math.round(metrics.inactiveMs / 60000),
          Math.round(neutralTotal / 60000)
        ],
        backgroundColor: ['#0a7e07', '#d00000', '#c1c1c1', '#f4c95d'],
        borderWidth: 1,
        borderColor: '#111'
      }
    ]
  };

  if (compositionChart) {
    compositionChart.destroy();
  }

  compositionChart = new Chart(compositionCanvas, {
    type: 'doughnut',
    data,
    options: {
      plugins: {
        legend: { position: 'bottom' }
      }
    }
  });
}

function renderStoryList(metrics: DailyMetrics, kpis: CalculatedKpis): void {
  const topFocus = kpis.topFocus
    ? { ...kpis.topFocus, domain: formatDomainLabel(kpis.topFocus.domain) }
    : null;
  const topProcrastination = kpis.topProcrastination;
  const longestIdle = findLongestSegment(metrics.timeline, 'inactive');
  const totalIdleMs = metrics.timeline
    .filter((entry) => entry.category === 'inactive')
    .reduce((sum, entry) => sum + entry.durationMs, 0);

  storyListEl.innerHTML = '';

  const items = [
    topFocus
      ? {
          title: i18n?.t('report_story_focus_title') ?? 'Top focus',
          body:
            i18n?.t('report_story_focus_body', {
              domain: topFocus.domain,
              duration: formatDuration(topFocus.milliseconds)
            }) ??
            `${topFocus.domain} held ${formatDuration(topFocus.milliseconds)} of focus.`
        }
      : null,
    topProcrastination
      ? {
          title: i18n?.t('report_story_villain_title') ?? 'Villain of the day',
          body:
            i18n?.t('report_story_villain_body', {
              domain: topProcrastination.domain,
              duration: formatDuration(topProcrastination.milliseconds)
            }) ??
            `${topProcrastination.domain} drained ${formatDuration(
              topProcrastination.milliseconds
            )}.`
        }
      : null,
    longestIdle
      ? {
          title: i18n?.t('report_story_idle_title') ?? 'Longest idle',
          body:
            i18n?.t('report_story_idle_body', {
              range: formatTimeRange(longestIdle.startTime, longestIdle.endTime, locale),
              duration: formatDuration(longestIdle.durationMs),
              total: formatDuration(totalIdleMs)
            }) ??
            `Between ${formatTimeRange(longestIdle.startTime, longestIdle.endTime, locale)} the browser stayed idle for ${formatDuration(
              longestIdle.durationMs
            )}. Total idle in the day: ${formatDuration(totalIdleMs)}.`
        }
      : null
  ].filter(Boolean) as Array<{ title: string; body: string }>;

  if (!items.length) {
    const li = document.createElement('li');
    li.textContent = i18n?.t('report_story_empty') ?? 'Not enough data for stories today.';
    storyListEl.appendChild(li);
    return;
  }

  items.forEach((item) => {
    const li = document.createElement('li');
    const strong = document.createElement('strong');
    strong.textContent = item.title;
    li.appendChild(strong);
    li.appendChild(document.createTextNode(item.body));
    storyListEl.appendChild(li);
  });
}

function renderRankings(domains: Record<string, DomainStats>): void {
  if (!productiveRankingBody || !procrastinationRankingBody) {
    return;
  }

  const sorted = Object.values(domains).sort((a, b) => b.milliseconds - a.milliseconds);
  const topProductive = sorted.filter((d) => d.category === 'productive').slice(0, 5);
  const topProcrastination = sorted.filter((d) => d.category === 'procrastination').slice(0, 5);

  fillRankingTable(productiveRankingBody, topProductive);
  fillRankingTable(procrastinationRankingBody, topProcrastination);
}

function fillRankingTable(tbody: HTMLTableSectionElement, entries: DomainStats[]): void {
  tbody.innerHTML = '';
  if (!entries.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 2;
    cell.textContent = i18n?.t('report_no_records') ?? 'Sem registros.';
    row.appendChild(cell);
    tbody.appendChild(row);
    return;
  }

  const maxMs = entries[0]?.milliseconds ?? 1;

  entries.forEach((entry) => {
    const row = document.createElement('tr');
    const domainCell = document.createElement('td');
    const durationCell = document.createElement('td');

    const bar = document.createElement('div');
    bar.className = 'ranking-bar';
    bar.style.width = `${(entry.milliseconds / maxMs) * 100}%`;

    const domainSpan = document.createElement('span');
    domainSpan.textContent = formatDomainLabel(entry.domain);
    const durationSpan = document.createElement('span');
    durationSpan.textContent = formatDuration(entry.milliseconds);

    const domainBar = bar.cloneNode() as HTMLDivElement;

    domainCell.appendChild(domainBar);
    domainCell.appendChild(domainSpan);
    durationCell.appendChild(durationSpan);

    row.appendChild(domainCell);
    row.appendChild(durationCell);
    tbody.appendChild(row);
  });
}

function renderTimeline(entries: TimelineEntry[]): void {
  timelineListEl.innerHTML = '';
  latestTimelineNarrative = [];

  const filteredEntries = entries.filter((entry) =>
    isEntryWithinFilter(entry, timelineFilter.start, timelineFilter.end)
  );

  const consolidated = consolidateTimelineEntries(filteredEntries);
  const blocks = buildTimelineBlocks(consolidated);

  if (!blocks.length) {
    const li = document.createElement('li');
    li.textContent =
      i18n?.t('report_story_short_day') ?? 'The day was too short to tell a story.';
    timelineListEl.appendChild(li);
    return;
  }

  blocks.forEach((block) => {
    const li = document.createElement('li');
    li.className = 'timeline-hour-block';

    const hourHeader = document.createElement('div');
    hourHeader.className = 'timeline-hour';
    const hourLabel = `${block.hour.toString().padStart(2, '0')}h`;
    hourHeader.textContent = hourLabel;

    const summary = document.createElement('span');
    summary.className = 'timeline-hour-summary';
    summary.textContent =
      i18n?.t('report_timeline_summary', {
        duration: formatDuration(block.totalMs),
        count: block.segments.length
      }) ?? `${formatDuration(block.totalMs)} • ${block.segments.length} segments`;
    hourHeader.appendChild(summary);
    li.appendChild(hourHeader);

    const list = document.createElement('ul');
    list.className = 'timeline-segments';

    block.segments.forEach((segment) => {
      const element = createTimelineSegmentElement(segment);
      list.appendChild(element);

      if (latestTimelineNarrative.length < 12) {
        const overtimeNote = isSegmentOvertime(segment) ? ' (overtime)' : '';
        latestTimelineNarrative.push(
          `${hourLabel} ${segment.domain} ${formatDurationFriendly(segment.durationMs)} ${describeCategory(
            segment.category
          )}${overtimeNote}`
        );
      }
    });

    li.appendChild(list);
    timelineListEl.appendChild(li);
  });
}

function mergeTimelines(metrics: DailyMetrics, domains: Record<string, DomainStats>): TimelineEntry[] {
  const label = i18n?.t('label_vscode') ?? 'VS Code (IDE)';
  const vscodeEntries =
    metrics.vscodeTimeline?.map((entry) => ({
      ...entry,
      domain: label,
      category: 'productive' as const
    })) ?? [];
  return [...metrics.timeline, ...vscodeEntries].sort((a, b) => a.startTime - b.startTime);
}

interface CompositionRow {
  label: string;
  time: string;
  share: string;
}

function buildCompositionRows(metrics: DailyMetrics): CompositionRow[] {
  const vscodeMs = metrics.vscodeActiveMs ?? 0;
  const neutralDomainMs = Object.values(metrics.domains)
    .filter((domain) => domain.category === 'neutral')
    .reduce((acc, domain) => acc + domain.milliseconds, 0);
  const rows = [
    {
      label: i18n?.t('popup_chart_label_productive') ?? 'Productive',
      value: metrics.productiveMs + vscodeMs
    },
    {
      label: i18n?.t('popup_chart_label_procrastination') ?? 'Procrastination',
      value: metrics.procrastinationMs
    },
    {
      label: i18n?.t('report_category_neutral') ?? 'Neutral',
      value: metrics.inactiveMs + neutralDomainMs
    }
  ];
  const total = rows.reduce((acc, row) => acc + row.value, 0);
  return rows.map((row) => ({
    label: row.label,
    time: formatDuration(row.value),
    share: total > 0 ? `${((row.value / total) * 100).toFixed(1)}%` : '--'
  }));
}

/**
 * Builds the detailed PDF report highlighting fairness, context and composition intelligence.
 * Page 1 shows the headline metrics plus fairness status, page 2 lists context breakdown,
 * and page 3 summarizes composition along with the narrative and AI argument.
 * @returns Promise resolved once the PDF has been generated and downloaded.
 */
export async function exportPdf(): Promise<void> {
  if (!latestMetrics) {
    return;
  }

  if (!jspdf?.jsPDF) {
    alert(i18n?.t('report_alert_pdf_missing') ?? 'PDF library unavailable.');
    return;
  }

  const doc = new jspdf.jsPDF({ unit: 'mm', format: 'a4' });
  const metrics = latestMetrics;
  const kpis = calculateKpis(metrics);
  const fairnessStatus = getFairnessStatusText(latestFairness);
  const fairnessHint = getFairnessHintText(latestFairness);
  const fairnessLine = fairnessStatus.text;
  const fairnessReason = formatFairnessReason(fairnessStatus.rule);
  const narratives =
    latestTimelineNarrative.length > 0
      ? latestTimelineNarrative.slice(0, 6)
      : ['Sem registros na timeline.'];
  const aiText = aiNarrativeEl.textContent?.trim();

  await renderOverviewPage();
  renderContextBreakdownPage();
  renderCompositionPage();

  doc.save(`relatorio-saul-goodman-${metrics.dateKey}.pdf`);

  async function renderOverviewPage(): Promise<void> {
    const margin = 14;
    doc.setFontSize(18);
    doc.text(i18n?.t('report_pdf_title') ?? 'Detailed report — Saul Goodman', margin, 20);
    doc.setFontSize(12);
    doc.text(
      `${i18n?.t('popup_pdf_date') ?? 'Date'}: ${reportDateEl.textContent ?? metrics.dateKey}`,
      margin,
      30
    );

    const fairnessLabel = i18n?.t('report_pdf_status_label') ?? 'Status';
    doc.setFont(undefined, 'bold');
    doc.text(i18n?.t('report_pdf_overview_heading') ?? 'Daily overview', margin, 40);
    doc.setFont(undefined, 'normal');

    let cursor = 48;
    doc.text(`${fairnessLabel}: ${fairnessLine}`, margin, cursor);
    if (fairnessHint) {
      cursor += 6;
      doc.text(fairnessHint, margin, cursor);
    }
    if (fairnessReason) {
      cursor += 6;
      const reasonLabel = i18n?.t('report_pdf_fairness_reason_label') ?? 'Reason';
      doc.text(`${reasonLabel}: ${fairnessReason}`, margin, cursor);
    }

    const indexValue =
      fairnessStatus.rule === 'normal'
        ? metrics.currentIndex.toString()
        : i18n?.t('report_pdf_index_neutralized') ?? 'Index neutralized';
    cursor += 6;
    doc.text(`${i18n?.t('popup_pdf_index') ?? 'Index'}: ${indexValue}`, margin, cursor);
    cursor += 6;
    doc.text(
      `${i18n?.t('popup_kpi_focus_label') ?? 'Focus'}: ${formatPercentage(kpis.focusRate)}`,
      margin,
      cursor
    );
    cursor += 6;
    doc.text(
      `${i18n?.t('popup_pdf_switches') ?? 'Tab switches'}: ${metrics.tabSwitches}`,
      margin,
      cursor
    );
    cursor += 10;

    const criticalThreshold = latestSettings?.criticalScoreThreshold ?? 90;
    if (metrics.currentIndex >= criticalThreshold) {
      const logoPath = chrome.runtime.getURL('src/img/saul_incredulo.png');
      const badge = await loadImageBase64(logoPath);
      if (badge) {
        doc.addImage(badge, 'PNG', 165, 14, 25, 25);
      }
    }

    if (hourlyChart) {
      const img = hourlyChart.toBase64Image();
      doc.addImage(img, 'PNG', margin, cursor, 180, 60);
      cursor += 70;
    }

    doc.setFont(undefined, 'bold');
    doc.text(i18n?.t('popup_pdf_top_domains') ?? 'Top domains', margin, cursor);
    doc.setFont(undefined, 'normal');
    cursor += 6;
    Object.values(metrics.domains)
      .sort((a, b) => b.milliseconds - a.milliseconds)
      .slice(0, 5)
      .forEach((domain) => {
        if (cursor > 270) {
          doc.addPage();
          cursor = 20;
        }
        doc.text(
          `${domain.domain} — ${domain.category} — ${formatDuration(domain.milliseconds)}`,
          margin,
          cursor
        );
        cursor += 6;
      });
  }

  function renderContextBreakdownPage(): void {
    const margin = 14;
    doc.addPage();
    doc.setFontSize(16);
    doc.text(i18n?.t('report_pdf_context_title') ?? 'Context breakdown', margin, 20);
    doc.setFontSize(11);
    doc.setFont(undefined, 'bold');
    doc.text(i18n?.t('report_pdf_context_header_context') ?? 'Context', margin, 30);
    doc.text(i18n?.t('report_pdf_context_header_time') ?? 'Time spent', margin + 70, 30);
    doc.text(i18n?.t('report_pdf_context_header_index') ?? 'Context index', margin + 140, 30);
    doc.setFont(undefined, 'normal');

    const durations = CONTEXT_ORDER.reduce((acc, value) => {
      acc[value] = metrics.contextDurations?.[value] ?? 0;
      return acc;
    }, {} as Record<ContextModeValue, number>);
    const indices = CONTEXT_ORDER.reduce((acc, value) => {
      acc[value] = metrics.contextIndices?.[value];
      return acc;
    }, {} as Record<ContextModeValue, number | undefined>);
    let rowY = 38;
    CONTEXT_ORDER.forEach((context) => {
      const label = i18n?.t(`popup_context_option_${context}`) ?? context;
      const durationLabel = formatDuration(durations[context] ?? 0);
      const indexValue = indices[context];
      doc.text(label, margin, rowY);
      doc.text(durationLabel, margin + 70, rowY);
      doc.text(formatPercentage(typeof indexValue === 'number' ? indexValue : null), margin + 140, rowY);
      rowY += 8;
    });
  }

  function renderCompositionPage(): void {
    const margin = 14;
    doc.addPage();
    doc.setFontSize(16);
    doc.text(i18n?.t('report_pdf_composition_title') ?? 'Composition summary', margin, 20);
    doc.setFontSize(11);
    doc.setFont(undefined, 'bold');
    doc.text(i18n?.t('report_pdf_composition_header_category') ?? 'Category', margin, 30);
    doc.text(i18n?.t('report_pdf_composition_header_time') ?? 'Time', margin + 70, 30);
    doc.text(i18n?.t('report_pdf_composition_header_share') ?? 'Share', margin + 140, 30);
    doc.setFont(undefined, 'normal');

    const compositionRows = buildCompositionRows(metrics);
    let rowY = 38;
    compositionRows.forEach((row) => {
      doc.text(row.label, margin, rowY);
      doc.text(row.time, margin + 70, rowY);
      doc.text(row.share, margin + 140, rowY);
      rowY += 8;
    });

    if (compositionChart) {
      const img = compositionChart.toBase64Image();
      doc.addImage(img, 'PNG', margin, rowY + 4, 180, 60);
      rowY += 70;
    }

    doc.setFont(undefined, 'bold');
    doc.text(i18n?.t('report_pdf_narrative_title') ?? 'Key narrative', margin, rowY + 10);
    doc.setFont(undefined, 'normal');
    let narrativeCursor = rowY + 18;
    narratives.forEach((line) => {
      if (narrativeCursor > 270) {
        doc.addPage();
        narrativeCursor = 20;
      }
      doc.text(line, margin, narrativeCursor);
      narrativeCursor += 6;
    });

    if (aiText) {
      if (narrativeCursor > 260) {
        doc.addPage();
        narrativeCursor = 20;
      }
      doc.setFont(undefined, 'bold');
      doc.text(i18n?.t('report_pdf_ai_title') ?? "Saul's argument", margin, narrativeCursor + 4);
      doc.setFont(undefined, 'normal');
      const wrapped = doc.splitTextToSize(aiText, 180);
      doc.text(wrapped, margin, narrativeCursor + 12);
    }
  }
}

async function shareReportSummary(): Promise<void> {
  if (!latestMetrics) {
    showToast(i18n?.t('report_share_error_no_metrics') ?? 'Sem dados para compartilhar.', 'error');
    return;
  }

  const text = buildShareSummaryText(latestMetrics);
  await shareContent({
    title: i18n?.t('report_share_title') ?? 'Saul Goodman — Highlights',
    text,
    successMessage:
      i18n?.t('report_share_success') ??
      'Menu de compartilhamento aberto! Se não aparecer, copiamos para a área de transferência.',
    errorMessage: i18n?.t('report_share_error') ?? 'Não foi possível compartilhar agora.'
  });
}

async function shareNarrative(): Promise<void> {
  if (!latestMetrics) {
    showToast(i18n?.t('report_share_error_no_metrics') ?? 'Sem dados para compartilhar.', 'error');
    return;
  }

  if (!hasAiNarrative) {
    showToast(
      i18n?.t('report_share_error_no_narrative') ?? 'Gere o argumento do Saul antes de compartilhar.',
      'error'
    );
    return;
  }

  const text = buildNarrativeShareText(latestMetrics);
  await shareContent({
    title: i18n?.t('report_share_argument_title') ?? 'Argumento do Saul',
    text,
    successMessage:
      i18n?.t('report_share_success') ??
      'Menu de compartilhamento aberto! Se não aparecer, copiamos para a área de transferência.',
    errorMessage: i18n?.t('report_share_error') ?? 'Não foi possível compartilhar agora.'
  });
}

export function buildShareSummaryText(
  metrics: DailyMetrics,
  fairnessSummary: FairnessSummary | null = latestFairness
): string {
  const enriched = enrichMetricsWithVscode(metrics);
  const kpis = calculateKpis(enriched);
  const date = reportDateEl.textContent ?? enriched.dateKey;
  const focusLabel = i18n?.t('popup_kpi_focus_label') ?? 'Foco';
  const indexLabel = i18n?.t('report_share_index_label') ?? 'Índice';
  const switchesLabel = i18n?.t('report_metric_switches_label') ?? 'Trocas';
  const headline = i18n?.t('report_share_headline') ?? 'Objeção! Resumo do caso';
  const heroLine =
    heroMessageEl.textContent?.trim() ??
    (i18n?.t('report_share_opening') ?? 'O cliente trabalhou e eu tenho provas.');
  const topProductive = getTopEntries(enriched.domains, 'productive')[0];
  const topProcrastination = getTopEntries(enriched.domains, 'procrastination')[0];
  const timelineHighlights = latestTimelineNarrative.slice(0, 2).join(' • ');
  const cta = i18n?.t('report_share_cta') ?? 'Gerado pelo Saul Goodman.';

  const fairnessLine = buildFairnessShareLine(fairnessSummary);
  const lines = [
    fairnessLine,
    `${headline} — ${date}`,
    `${indexLabel} ${enriched.currentIndex} · ${focusLabel} ${formatPercentage(kpis.focusRate)} · ${switchesLabel} ${enriched.tabSwitches}`,
    `${i18n?.t('report_share_opening') ?? 'O cliente trabalhou e eu tenho provas.'} ${heroLine}`,
    topProductive
      ? `${i18n?.t('report_story_focus_title') ?? 'Top focus'} ➜ ${formatDomainLabel(topProductive.domain)} (${topProductive.duration})`
      : null,
    topProcrastination
      ? `${i18n?.t('report_story_villain_title') ?? 'Vilão'} ➜ ${formatDomainLabel(topProcrastination.domain)} (${topProcrastination.duration})`
      : null,
    timelineHighlights
      ? `${i18n?.t('report_timeline_heading') ?? 'Narrativa minuto a minuto'} ➜ ${timelineHighlights}`
      : null,
    cta
  ];

  return lines.filter(Boolean).join('\n');
}

export function buildNarrativeShareText(
  metrics: DailyMetrics,
  fairnessSummary: FairnessSummary | null = latestFairness
): string {
  const enriched = enrichMetricsWithVscode(metrics);
  const kpis = calculateKpis(enriched);
  const date = reportDateEl.textContent ?? enriched.dateKey;
  const focusLabel = i18n?.t('popup_kpi_focus_label') ?? 'Foco';
  const indexLabel = i18n?.t('report_share_index_label') ?? 'Índice';
  const narrative = aiNarrativeEl.textContent?.trim() ?? '';
  const cta = i18n?.t('report_share_cta') ?? 'Gerado pelo Saul Goodman.';

  const fairnessLine = buildFairnessShareLine(fairnessSummary);
  const lines = [
    fairnessLine,
    i18n?.t('report_share_argument_title') ?? 'Argumento do Saul',
    `${date} · ${indexLabel} ${enriched.currentIndex} · ${focusLabel} ${formatPercentage(kpis.focusRate)}`,
    narrative,
    cta
  ];

  return lines.filter(Boolean).join('\n');
}

function buildSocialPostText(metrics: DailyMetrics): string {
  const enriched = enrichMetricsWithVscode(metrics);
  const kpis = calculateKpis(enriched);
  const date = reportDateEl.textContent ?? enriched.dateKey;
  const topProductive = getTopEntries(enriched.domains, 'productive')[0];
  const topProcrastination = getTopEntries(enriched.domains, 'procrastination')[0];
  const timelineHighlights = latestTimelineNarrative.slice(0, 1).join(' • ');
  const hashtags = i18n?.t('report_share_hashtags') ?? '#SaulGoodman #AntiProcrastinacao';

  const lines = [
    `${i18n?.t('report_share_social_tagline') ?? 'Objeção! Meu cliente trabalhou.'} ${date}`,
    `Índice ${enriched.currentIndex} · Foco ${formatPercentage(kpis.focusRate)} · ${enriched.tabSwitches} trocas`,
    topProductive
      ? `Campeão: ${formatDomainLabel(topProductive.domain)} (${topProductive.duration})`
      : null,
    topProcrastination
      ? `Vilão vigiado: ${formatDomainLabel(topProcrastination.domain)} (${topProcrastination.duration})`
      : null,
    timelineHighlights ? `Linha do tempo: ${timelineHighlights}` : null,
    `${i18n?.t('report_share_cta') ?? 'Gerado pelo Saul Goodman.'} ${EXTENSION_SITE_URL}`,
    hashtags
  ];

  return lines.filter(Boolean).join('\n');
}

function buildNarrativeSocialText(metrics: DailyMetrics): string {
  const enriched = enrichMetricsWithVscode(metrics);
  const base = buildNarrativeShareText(enriched);
  const hashtags = i18n?.t('report_share_hashtags') ?? '#SaulGoodman #AntiProcrastinacao';
  return `${base}\n${EXTENSION_SITE_URL}\n${hashtags}`;
}

function toggleShareMenu(): void {
  if (!shareMenuEl) {
    return;
  }
  shareMenuEl.classList.toggle('hidden');
}

async function onShareMenuClick(event: Event): Promise<void> {
  const target = event.target as HTMLElement;
  if (target.tagName !== 'BUTTON') {
    return;
  }
  const channel = target.dataset.channel;
  const kind = target.dataset.kind as 'summary' | 'argument';
  if (!channel || !kind) {
    return;
  }

  if (kind === 'argument' && !hasAiNarrative) {
    showToast(
      i18n?.t('report_share_error_no_narrative') ?? 'Gere o argumento do Saul antes de compartilhar.',
      'error'
    );
    return;
  }

  if (!latestMetrics) {
    showToast(i18n?.t('report_share_error_no_metrics') ?? 'Sem dados para compartilhar.', 'error');
    return;
  }

  const text =
    kind === 'summary'
      ? buildSocialPostText(latestMetrics)
      : buildNarrativeSocialText(latestMetrics);
  const sanitized = normalizeShareText(text);

  switch (channel) {
    case 'x':
      openXIntent(sanitized);
      break;
    case 'linkedin':
      await copyToClipboardWithToast(
        text,
        i18n?.t('report_share_copy_linkedin') ??
          'Texto copiado. Cole no campo do LinkedIn antes de publicar.',
        i18n?.t('report_share_copy_error') ?? 'Não foi possível copiar o post agora.'
      );
      openLinkedInShare(sanitized);
      showToast(
        i18n?.t('report_share_hint_linkedin') ??
          'LinkedIn não preenche o texto automaticamente: cole o conteúdo copiado no post.',
        'success'
      );
      break;
    case 'instagram':
      await copyToClipboardWithToast(
        text,
        i18n?.t('report_share_copy_instagram') ??
          'Texto copiado. Abra o Instagram e cole no campo antes de postar.',
        i18n?.t('report_share_copy_error') ?? 'Não foi possível copiar o post agora.'
      );
      window.open('https://www.instagram.com/', '_blank');
      showToast(
        i18n?.t('report_share_hint_instagram') ??
          'Instagram Web não aceita texto pré-preenchido: cole o que copiamos na caixa de postagem.',
        'success'
      );
      break;
    case 'copy':
      await copyToClipboardWithToast(
        text,
        i18n?.t('report_share_copy_success') ??
          'Post copiado. Cole no LinkedIn, X ou onde quiser.',
        i18n?.t('report_share_copy_error') ?? 'Não foi possível copiar o post agora.'
      );
      break;
    case 'native':
      await shareContent({
        title: i18n?.t('report_share_title') ?? 'Saul Goodman — Highlights',
        text: sanitized,
        successMessage:
          i18n?.t('report_share_success') ??
          'Menu de compartilhamento aberto! Se não aparecer, copiamos para a área de transferência.',
        errorMessage: i18n?.t('report_share_error') ?? 'Não foi possível compartilhar agora.'
      });
      break;
    default:
      break;
  }

  shareMenuEl?.classList.add('hidden');
}

function openXIntent(text: string): void {
  const encoded = safeEncodeURIComponent(text);
  const url = `https://x.com/intent/tweet?text=${encoded}`;
  window.open(url, '_blank');
}

function openLinkedInShare(summary: string): void {
  const url = safeEncodeURIComponent(EXTENSION_SITE_URL);
  const title = safeEncodeURIComponent(i18n?.t('report_share_title') ?? 'Saul Goodman — Highlights');
  const encodedSummary = safeEncodeURIComponent(summary.slice(0, 950));
  const shareUrl = `https://www.linkedin.com/shareArticle?mini=true&url=${url}&title=${title}&summary=${encodedSummary}`;
  window.open(shareUrl, '_blank');
}

function normalizeShareText(value: string): string {
  const cleaned = value
    .replace(/%/g, '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, '')
    .replace(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '');
  return cleaned.trim();
}

function safeEncodeURIComponent(value: string): string {
  try {
    return encodeURIComponent(value);
  } catch (error) {
    const normalized = value
      .replace(/%([^0-9A-Fa-f]|$)/g, '%25$1')
      .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, '')
      .replace(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '');
    return encodeURIComponent(normalized);
  }
}

async function shareContent(options: {
  title: string;
  text: string;
  successMessage: string;
  errorMessage: string;
}): Promise<void> {
  const { title, text, successMessage, errorMessage } = options;

  try {
    if (navigator.share) {
      await navigator.share({ title, text });
      showToast(successMessage, 'success');
      return;
    }

    await copyToClipboardWithToast(text, successMessage, errorMessage);
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') {
      return;
    }
    console.error('Share error', error);
    showToast(errorMessage, 'error');
  }
}

async function copySharePost(): Promise<void> {
  if (!latestMetrics) {
    showToast(i18n?.t('report_share_error_no_metrics') ?? 'Sem dados para compartilhar.', 'error');
    return;
  }
  const text = buildSocialPostText(latestMetrics);
  const success =
    i18n?.t('report_share_copy_success') ??
    'Post copiado. Cole no LinkedIn, X ou onde quiser.';
  const error =
    i18n?.t('report_share_copy_error') ?? 'Não foi possível copiar o post agora.';
  await copyToClipboardWithToast(text, success, error);
}

async function copyNarrativePost(): Promise<void> {
  if (!latestMetrics) {
    showToast(i18n?.t('report_share_error_no_metrics') ?? 'Sem dados para compartilhar.', 'error');
    return;
  }
  if (!hasAiNarrative) {
    showToast(
      i18n?.t('report_share_error_no_narrative') ?? 'Gere o argumento do Saul antes de compartilhar.',
      'error'
    );
    return;
  }
  const text = buildNarrativeSocialText(latestMetrics);
  const success =
    i18n?.t('report_share_copy_success') ??
    'Post copiado. Cole no LinkedIn, X ou onde quiser.';
  const error =
    i18n?.t('report_share_copy_error') ?? 'Não foi possível copiar o post agora.';
  await copyToClipboardWithToast(text, success, error);
}

async function copyToClipboardWithToast(
  text: string,
  successMessage: string,
  errorMessage: string
): Promise<void> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      showToast(successMessage, 'success');
      return;
    }
    showToast(errorMessage, 'error');
  } catch (error) {
    console.error('Clipboard error', error);
    showToast(errorMessage, 'error');
  }
}

function showToast(message: string, type: 'success' | 'error' = 'success'): void {
  if (!toastEl || !toastMessageEl) {
    return;
  }
  toastMessageEl.textContent = message;
  toastEl.classList.remove('hidden', 'success', 'error');
  toastEl.classList.add(type);
  if (toastTimer) {
    window.clearTimeout(toastTimer);
  }
  toastTimer = window.setTimeout(() => {
    toastEl.classList.add('hidden');
    toastTimer = null;
  }, 3500);
}

function findLongestSegment(
  timeline: TimelineEntry[],
  category: TimelineEntry['category']
): TimelineEntry | null {
  const filtered = timeline.filter((entry) => entry.category === category);
  if (!filtered.length) {
    return null;
  }
  return filtered.sort((a, b) => b.durationMs - a.durationMs)[0];
}

function pickHeroMessageKey(score: number): string {
  for (const template of HERO_MESSAGE_KEYS) {
    if (score <= template.max) {
      return template.key;
    }
  }
  return HERO_MESSAGE_KEYS[HERO_MESSAGE_KEYS.length - 1].key;
}

function describeCategory(category: TimelineEntry['category']): string {
  switch (category) {
    case 'productive':
      return i18n?.t('popup_chart_label_productive') ?? 'Productive';
    case 'procrastination':
      return i18n?.t('popup_chart_label_procrastination') ?? 'Procrastination';
    case 'neutral':
      return i18n?.t('report_category_neutral') ?? 'Neutral';
    case 'inactive':
      return i18n?.t('popup_summary_inactive_label') ?? 'Inactive';
    default:
      return i18n?.t('report_category_activity') ?? 'Activity';
  }
}

async function sendRuntimeMessage<T>(type: string, payload?: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type, payload }, (response) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }

      if (!response) {
        resolve(undefined as T);
        return;
      }

      if (response.ok) {
        resolve(response.data as T);
      } else {
        const fallback = i18n?.t('report_error_unknown') ?? 'Unknown error';
        reject(new Error(response.error ?? fallback));
      }
    });
  });
}

async function generateNarrative(): Promise<void> {
  if (!latestMetrics) {
    aiNarrativeEl.textContent =
      i18n?.t('report_ai_no_metrics') ?? 'No metrics to tell a story today.';
    return;
  }

  if (!openAiKey) {
    aiNarrativeEl.textContent =
      i18n?.t('report_ai_missing_key') ??
      'Configure your OpenAI key in the options before generating the narrative.';
    aiRetryButton.classList.remove('hidden');
    hasAiNarrative = false;
    return;
  }

  aiGenerateButton.disabled = true;
  aiRetryButton.classList.add('hidden');
  aiNarrativeEl.textContent =
    i18n?.t('report_ai_loading') ?? 'Saul is reviewing the evidence...';

  try {
    const payload = buildAiPayload(latestMetrics);
    const narrative = await requestAiNarrative(payload, resolveNarrativeLanguage());
    if (!narrative) {
      throw new Error('Empty AI response');
    }
    aiNarrativeEl.innerHTML = formatAiNarrative(narrative);
    hasAiNarrative = true;
  } catch (error) {
    console.error('AI narrative error', error);
    aiNarrativeEl.textContent =
      i18n?.t('report_ai_error_generic') ??
      'Saul could not convince the digital judge. Try again later.';
    aiRetryButton.classList.remove('hidden');
    hasAiNarrative = false;
  } finally {
    aiGenerateButton.disabled = false;
  }
}

function buildAiPayload(metrics: DailyMetrics): AiPromptPayload {
  const enriched = enrichMetricsWithVscode(metrics);
  const kpis = calculateKpis(enriched);
  const contextBreakdown = buildContextSummary(enriched);
  const timelineSnippets = enriched.timeline
    .sort((a, b) => a.startTime - b.startTime)
    .slice(0, 10)
    .map((entry) => ({
      domain: entry.domain,
      category: entry.category,
      duration: formatDuration(entry.durationMs),
      range: formatTimeRange(entry.startTime, entry.endTime, locale)
    }));

  const fairness = getFairnessFallback(latestFairness);
  const fairnessStatus = getFairnessStatusText(fairness).text;

  return {
    date: reportDateEl.textContent ?? metrics.dateKey,
    index: metrics.currentIndex,
    focusRate: formatPercentage(kpis.focusRate),
    tabSwitches: metrics.tabSwitches,
    topProductive: getTopEntries(metrics.domains, 'productive'),
    topProcrastination: getTopEntries(metrics.domains, 'procrastination'),
    timeline: timelineSnippets,
    fairnessRule: fairness.rule,
    fairnessStatus,
    contextMode: fairness.contextMode?.value ?? 'work',
    contextBreakdown
  };
}

function resolveNarrativeLanguage(): string {
  if (locale === 'pt-BR') {
    return 'Portuguese (Brazil)';
  }
  if (locale === 'es-419') {
    return 'Spanish';
  }
  return 'English';
}

function getTopEntries(
  domains: Record<string, DomainStats>,
  category: DomainStats['category']
): Array<{ domain: string; duration: string }> {
  return Object.values(domains)
    .filter((d) => d.category === category)
    .sort((a, b) => b.milliseconds - a.milliseconds)
    .slice(0, 5)
    .map((entry) => ({ domain: entry.domain, duration: formatDuration(entry.milliseconds) }));
}

async function requestAiNarrative(
  payload: AiPromptPayload,
  languageLabel: string
): Promise<string> {
  const apiKey = openAiKey;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not configured.');
  }

  const contextSummary = payload.contextBreakdown
    ? payload.contextBreakdown
        .map(
          (entry) =>
            `${entry.context}: ${entry.duration}${typeof entry.index === 'number' ? ` (índice ${entry.index}%)` : ''}`
        )
        .join('; ')
    : 'Sem breakdown de contexto.';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  let response: Response;
  try {
    response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.6,
        messages: [
          {
            role: 'system',
            content: `You are Saul Goodman, a sarcastic lawyer and relentless salesman. Tell the user's day as if you were defending them, and write the story in ${languageLabel}.`
          },
          {
            role: 'user',
            content:
              `Write a short narrative (2 paragraphs) using these data points. Highlight the active context (${payload.contextMode}) and how contexts impacted the index: ${contextSummary}\n` +
              `${JSON.stringify(payload)}`
          }
        ]
      }),
      signal: controller.signal
    });
  } catch (error) {
    if ((error as DOMException)?.name === 'AbortError') {
      throw new Error('OpenAI timeout');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw new Error(`OpenAI falhou: ${response.statusText}`);
  }

  const json = (await response.json()) as OpenAiResponse;
  return json.choices?.[0]?.message?.content?.trim() ?? '';
}

interface AiPromptPayload {
  date: string;
  index: number;
  focusRate: string;
  tabSwitches: number;
  topProductive: Array<{ domain: string; duration: string }>;
  topProcrastination: Array<{ domain: string; duration: string }>;
  timeline: Array<{ domain: string; category: string; duration: string; range: string }>;
  fairnessRule: FairnessRule;
  fairnessStatus: string;
  contextMode: ContextModeValue;
  contextBreakdown?: Array<{ context: ContextModeValue; duration: string; index?: number }>;
}

interface OpenAiResponse {
  choices: Array<{
    message?: { content?: string };
  }>;
}

interface MetricsResponse {
  metrics: DailyMetrics;
  settings?: ExtensionSettings;
  fairness?: FairnessSummary;
  activeSuggestion?: DomainSuggestion | null;
  suggestions?: DomainSuggestion[];
}

function formatAiNarrative(text: string): string {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((chunk) => chunk.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  if (!paragraphs.length) {
    return formatParagraph(escapeHtml(text));
  }

  return paragraphs.map((p) => formatParagraph(escapeHtml(p))).join('');
}

function formatParagraph(content: string): string {
  const emphasis = content.replace(/\*(.*?)\*/g, '<strong>$1</strong>');
  const italic = emphasis.replace(/_(.*?)_/g, '<em>$1</em>');
  return `<p>${italic}</p>`;
}

function buildContextSummary(
  metrics: DailyMetrics
): Array<{ context: ContextModeValue; duration: string; index?: number }> | undefined {
  const durations = metrics.contextDurations;
  const indices = metrics.contextIndices;
  if (!durations && !indices) {
    return undefined;
  }
  const entries: Array<{ context: ContextModeValue; duration: string; index?: number }> = [];
  const seen = new Set<ContextModeValue>();
  if (durations) {
    Object.entries(durations).forEach(([context, value]) => {
      const ctx = context as ContextModeValue;
      seen.add(ctx);
      entries.push({
        context: ctx,
        duration: formatDuration(value ?? 0),
        index: indices?.[ctx]
      });
    });
  }
  if (indices) {
    Object.entries(indices).forEach(([context, idx]) => {
      const ctx = context as ContextModeValue;
      if (!seen.has(ctx)) {
        entries.push({
          context: ctx,
          duration: formatDuration(durations?.[ctx] ?? 0),
          index: idx
        });
      }
    });
  }
  return entries.length ? entries : undefined;
}

/**
 * Test hook to override internal report state without running the full hydrate flow.
 * Only used inside unit tests.
 */
export function __setReportTestState(state: {
  metrics?: DailyMetrics;
  fairness?: FairnessSummary | null;
  locale?: string;
  i18nInstance?: I18nService | null;
}): void {
  if (state.metrics) {
    latestMetrics = state.metrics;
  }
  if (state.fairness !== undefined) {
    latestFairness = state.fairness;
  }
  if (state.locale) {
    locale = state.locale;
  }
  if (state.i18nInstance !== undefined) {
    i18n = state.i18nInstance;
  }
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function consolidateTimelineEntries(entries: TimelineEntry[]): TimelineEntry[] {
  const sorted = entries.slice().sort((a, b) => a.startTime - b.startTime);
  const result: TimelineEntry[] = [];

  for (const entry of sorted) {
    const last = result[result.length - 1];
    if (
      last &&
      last.category === entry.category &&
      last.domain === entry.domain &&
      entry.startTime - last.endTime <= 60 * 1000
    ) {
      last.endTime = entry.endTime;
      last.durationMs += entry.durationMs;
    } else {
      result.push({ ...entry });
    }
  }

  return result;
}

interface TimelineHourBlock {
  hour: number;
  totalMs: number;
  segments: TimelineEntry[];
}

function buildTimelineBlocks(entries: TimelineEntry[]): TimelineHourBlock[] {
  const map = new Map<number, TimelineEntry[]>();
  entries.forEach((entry) => {
    const hour = new Date(entry.startTime).getHours();
    const bucket = map.get(hour) ?? [];
    bucket.push(entry);
    map.set(hour, bucket);
  });

  return Array.from(map.entries())
    .sort((a, b) => b[0] - a[0])
    .map(([hour, segments]) => ({
      hour,
      totalMs: segments.reduce((acc, segment) => acc + segment.durationMs, 0),
      segments: segments.sort((a, b) => b.startTime - a.startTime)
    }));
}

function createTimelineSegmentElement(entry: TimelineEntry): HTMLLIElement {
  const item = document.createElement('li');
  item.className = `timeline-segment ${entry.category}`;

  const header = document.createElement('div');
  header.className = 'timeline-segment-header';

  const title = document.createElement('strong');
  title.textContent = entry.domain;
  header.appendChild(title);

  const categoryTag = document.createElement('span');
  categoryTag.className = `tag ${entry.category}`;
  categoryTag.textContent = describeCategory(entry.category);
  header.appendChild(categoryTag);

  if (isSegmentOvertime(entry)) {
    const overtimeTag = document.createElement('span');
    overtimeTag.className = 'tag overtime';
    overtimeTag.textContent = i18n?.t('report_overtime_tag') ?? 'Overtime';
    header.appendChild(overtimeTag);
  }

  const meta = document.createElement('div');
  meta.className = 'timeline-meta';

  const range = document.createElement('span');
  range.textContent = formatTimeRange(entry.startTime, entry.endTime, locale);
  meta.appendChild(range);

  const duration = document.createElement('span');
  duration.textContent = formatDurationFriendly(entry.durationMs);
  meta.appendChild(duration);

  item.appendChild(header);
  item.appendChild(meta);
  return item;
}

function isSegmentOvertime(entry: TimelineEntry): boolean {
  if (entry.category !== 'productive') {
    return false;
  }
  const schedule = latestSettings?.workSchedule;
  if (!schedule || !schedule.length) {
    return false;
  }
  return !isWithinWorkSchedule(new Date(entry.startTime), schedule);
}

function renderDomainBreakdownChart(domains: Record<string, DomainStats>): void {
  if (!domainBreakdownCanvas) {
    return;
  }

  const topEntries = Object.values(domains)
    .sort((a, b) => b.milliseconds - a.milliseconds)
    .slice(0, 6);

  if (!topEntries.length) {
    if (domainBreakdownChart) {
      domainBreakdownChart.destroy();
      domainBreakdownChart = null;
    }
    const ctx = domainBreakdownCanvas.getContext('2d');
    ctx?.clearRect(0, 0, domainBreakdownCanvas.width, domainBreakdownCanvas.height);
    return;
  }

  const data = {
    labels: topEntries.map((entry) => entry.domain),
    datasets: [
      {
        label: 'Minutos',
        data: topEntries.map((entry) => Math.round(entry.milliseconds / 60000)),
        backgroundColor: topEntries.map((entry) =>
          entry.category === 'productive'
            ? '#0a7e07'
            : entry.category === 'procrastination'
              ? '#d00000'
              : '#6d5945'
        )
      }
    ]
  };

  if (domainBreakdownChart) {
    domainBreakdownChart.destroy();
  }

  domainBreakdownChart = new Chart(domainBreakdownCanvas, {
    type: 'bar',
    data,
    options: {
      responsive: true,
      plugins: {
        legend: {
          display: false
        }
      },
      scales: {
        x: {
          ticks: {
            maxRotation: 0,
            minRotation: 0
          }
        },
        y: {
          beginAtZero: true
        }
      }
    }
  });
}

interface EnrichedMetrics extends DailyMetrics {
  domains: Record<string, DomainStats>;
  timeline: TimelineEntry[];
}

const warnedHours = new Set<number>();

function enrichMetricsWithVscode(metrics: DailyMetrics): DailyMetrics {
  warnedHours.clear();
  const allowVscode = Boolean(latestSettings?.vscodeIntegrationEnabled);
  let vscodeMs = allowVscode ? metrics.vscodeActiveMs ?? 0 : 0;
  const label = i18n?.t('label_vscode') ?? 'VS Code (IDE)';

  const MAX_DAY_MS = 24 * 60 * 60 * 1000;
  if (vscodeMs > MAX_DAY_MS) {
    console.warn(`[Saul] VS Code time (${(vscodeMs / 3600000).toFixed(1)}h) exceeds 24h, clamping`);
    vscodeMs = MAX_DAY_MS;
  }

  const domains = { ...metrics.domains };
  if (vscodeMs > 0 && allowVscode) {
    domains['__vscode:ide'] = {
      domain: label,
      category: 'productive',
      milliseconds: vscodeMs
    };
  }

  const timeline = allowVscode ? mergeTimelines(metrics, domains) : [...metrics.timeline];

  const hourly = metrics.hourly.map((bucket) => ({ ...bucket }));
  if (allowVscode && metrics.vscodeTimeline?.length) {
    for (const entry of metrics.vscodeTimeline) {
      const duration = typeof entry.durationMs === 'number'
        ? entry.durationMs
        : Math.max(0, (entry.endTime ?? 0) - (entry.startTime ?? 0));
      if (!Number.isFinite(duration) || duration <= 0) {
        continue;
      }
      const startTime =
        typeof entry.startTime === 'number'
          ? entry.startTime
          : Math.max(0, (entry.endTime ?? Date.now()) - duration);
      for (const segment of splitDurationByHour(startTime, duration)) {
        const bucket = hourly[segment.hour];
        if (bucket) {
          bucket.productiveMs += segment.milliseconds;
          const total = bucket.productiveMs + bucket.procrastinationMs + bucket.inactiveMs + bucket.neutralMs;
          const MAX_HOUR_MS = 60 * 60 * 1000;
          if (total > MAX_HOUR_MS * 1.1 && !warnedHours.has(segment.hour)) {
            console.warn(`[Saul] Hour ${segment.hour} total (${(total / 60000).toFixed(1)}min) exceeds 60min - possible overlap`);
            warnedHours.add(segment.hour);
          }
        }
      }
    }
  }

  return {
    ...metrics,
    vscodeActiveMs: vscodeMs,
    vscodeTimeline: allowVscode ? metrics.vscodeTimeline ?? [] : [],
    vscodeSwitchHourly: allowVscode
      ? metrics.vscodeSwitchHourly ?? Array.from({ length: 24 }, () => 0)
      : Array.from({ length: 24 }, () => 0),
    domains,
    timeline,
    hourly
  };
}

function formatDomainLabel(domain: string): string {
  const label = i18n?.t('label_vscode') ?? 'VS Code (IDE)';
  if (domain === 'VS Code (IDE)' || domain === '__vscode:ide') {
    return label;
  }
  return domain;
}

function formatDurationFriendly(ms: number): string {
  if (ms < 60000) {
    return i18n?.t('report_duration_less_than_minute') ?? '<1m';
  }
  return formatDuration(ms);
}

function clampHour(value: number): number {
  if (Number.isNaN(value)) {
    return 0;
  }
  return Math.min(23, Math.max(0, value));
}

function isEntryWithinFilter(entry: TimelineEntry, startHour: number, endHour: number): boolean {
  if (startHour === 0 && endHour === 23) {
    return true;
  }

  const startDate = new Date(entry.startTime);
  const endDate = new Date(entry.endTime);
  const entryStartMinutes = startDate.getHours() * 60 + startDate.getMinutes();
  let entryEndMinutes = endDate.getHours() * 60 + endDate.getMinutes();

  if (entryEndMinutes < entryStartMinutes) {
    entryEndMinutes = entryStartMinutes;
  }

  const filterStartMinutes = startHour * 60;
  const filterEndMinutes = (endHour + 1) * 60;

  return entryStartMinutes < filterEndMinutes && entryEndMinutes > filterStartMinutes;
}

function toggleCriticalBanner(isCritical: boolean): void {
  if (!criticalBannerEl) {
    return;
  }
  if (isCritical) {
    document.body.classList.add('earthquake');
    criticalBannerEl.classList.remove('hidden');
    const threshold = latestSettings?.criticalScoreThreshold ?? 90;
    const message = getReportCriticalMessage(threshold);
    if (criticalBannerMessageEl) {
      criticalBannerMessageEl.textContent = message;
    }
    startBannerCountdown();
  } else {
    document.body.classList.remove('earthquake');
    criticalBannerEl.classList.add('hidden');
    stopBannerCountdown();
  }
}

function getReportCriticalMessage(threshold: number): string {
  if (!i18n) {
    return 'Critical warning';
  }
  const index = Math.floor(Math.random() * REPORT_CRITICAL_MESSAGE_KEYS.length);
  const template = REPORT_CRITICAL_MESSAGE_KEYS[index];
  if (template.needsThreshold) {
    return i18n.t(template.key, { threshold });
  }
  return i18n.t(template.key);
}

function updateHeroLogo(isCritical: boolean): void {
  if (!heroLogoEl) {
    return;
  }
  const imagePath = isCritical ? 'src/img/saul_incredulo.png' : 'src/img/logotipo_saul_goodman.png';
  heroLogoEl.src = chrome.runtime.getURL(imagePath);
  heroLogoEl.alt = isCritical
    ? i18n?.t('report_logo_alt_critical') ?? 'Saul Goodman unimpressed with your focus'
    : i18n?.t('report_logo_alt_default') ?? 'Saul Goodman logo';
}

function getScoreBand(score: number): 'good' | 'warn' | 'alert' | 'neutral' {
  if (score <= 25) {
    return 'good';
  }
  if (score <= 50) {
    return 'warn';
  }
  if (score >= 70) {
    return 'alert';
  }
  return 'neutral';
}

function triggerHeroConfetti(): void {
  if (!heroIndexEl) {
    return;
  }
  const card = heroIndexEl.closest('article');
  if (!card) {
    return;
  }

  const existing = card.querySelector('.hero-confetti');
  existing?.remove();

  const container = document.createElement('div');
  container.className = 'hero-confetti';
  const colors = ['#29c56d', '#17a589', '#ffe434', '#ff9f1c', '#ff1a1a'];
  const pieces = 16;

  for (let i = 0; i < pieces; i += 1) {
    const piece = document.createElement('span');
    piece.className = 'confetti-piece';
    piece.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.animationDelay = `${(Math.random() * 0.25).toFixed(2)}s`;
    piece.style.animationDuration = `${(1 + Math.random() * 0.5).toFixed(2)}s`;
    container.appendChild(piece);
  }

  card.appendChild(container);

  if (heroConfettiTimer) {
    window.clearTimeout(heroConfettiTimer);
  }
  heroConfettiTimer = window.setTimeout(() => {
    container.remove();
    heroConfettiTimer = null;
  }, 1500);
}

function startBannerCountdown(): void {
  if (!criticalBannerCountdownEl) {
    return;
  }
  if (bannerCountdownTimer) {
    return;
  }
  bannerCountdownValue = 45;
  criticalBannerCountdownEl.textContent = bannerCountdownValue.toString();
  bannerCountdownTimer = window.setInterval(() => {
    bannerCountdownValue = Math.max(0, bannerCountdownValue - 1);
    criticalBannerCountdownEl.textContent = bannerCountdownValue.toString();
    if (bannerCountdownValue === 0) {
      stopBannerCountdown();
      if (criticalBannerMessageEl) {
        criticalBannerMessageEl.textContent =
          i18n?.t('report_banner_countdown_final') ??
          'Time to act: close the villain tabs and return when you are in control.';
      }
    }
  }, 1000);
}

function stopBannerCountdown(): void {
  if (bannerCountdownTimer) {
    window.clearInterval(bannerCountdownTimer);
    bannerCountdownTimer = null;
  }
}

function parseDateKey(dateKey: string): Date {
  const [yearStr, monthStr, dayStr] = dateKey.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);

  if (
    Number.isFinite(year) &&
    Number.isFinite(month) &&
    Number.isFinite(day) &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= 31
  ) {
    return new Date(year, month - 1, day);
  }

  // fallback to native parsing when the formato foge do esperado
  return new Date(dateKey);
}

function closeReportTab(): void {
  if (chrome?.tabs?.getCurrent) {
    chrome.tabs.getCurrent((tab) => {
      if (chrome.runtime.lastError) {
        window.close();
        return;
      }

      if (tab?.id) {
        chrome.tabs.remove(tab.id, () => {
          if (chrome.runtime.lastError) {
            window.close();
          }
        });
      } else {
        window.close();
      }
    });
    return;
  }

  window.close();
}
const heroLogoEl = document.querySelector('.logo-frame img') as HTMLImageElement | null;
async function loadImageBase64(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return null;
    }
    const blob = await response.blob();
    return await blobToBase64(blob);
  } catch (error) {
    console.warn('Falha ao carregar imagem para PDF:', error);
    return null;
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      resolve(typeof reader.result === 'string' ? reader.result : '');
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
