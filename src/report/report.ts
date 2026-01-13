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
import {
  formatDuration,
  formatTimeRange,
  isWithinWorkSchedule,
  splitDurationByHour
} from '../shared/utils/time.js';
import {
  calculateKpis,
  CalculatedKpis,
  formatPercentage,
  formatRate,
  formatProductivityRatio
} from '../shared/metrics.js';
import { TAB_SWITCH_SERIES } from '../shared/tab-switch.js';
import { createI18n, I18nService } from '../shared/i18n.js';

declare const Chart: any;
declare const jspdf: { jsPDF: new (...args: any[]) => any };

type ChartInstance = any;

const reportDateEl = document.getElementById('reportDate') as HTMLElement;
const heroMessageEl = document.getElementById('heroMessage') as HTMLElement;
const heroIndexEl = document.getElementById('heroIndex') as HTMLElement;
const heroFocusEl = document.getElementById('heroFocus') as HTMLElement;
const heroSwitchesEl = document.getElementById('heroSwitches') as HTMLElement;
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
let latestMetrics: DailyMetrics | null = null;
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
    productive: 'Produtivo',
    procrastination: 'Procrastinador',
    neutral: 'Neutro'
  };
  suggestionReportTitleEl.textContent = `Sugestão: ${labelMap[suggestion.classification]} (${Math.round(
    suggestion.confidence
  )}%) para ${suggestion.domain}`;
  suggestionReportReasonsEl.innerHTML = '';
  suggestion.reasons.slice(0, 5).forEach((reason) => {
    const li = document.createElement('li');
    li.textContent = reason;
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
    labelCell.textContent = i18n?.t(`popup_context_option_${context}`) ?? context;
    const durationCell = document.createElement('td');
    durationCell.textContent = formatDuration(durations?.[context] ?? 0);
    const indexCell = document.createElement('td');
    const indexValue = indices?.[context];
    indexCell.textContent = formatPercentage(typeof indexValue === 'number' ? indexValue : null);
    row.appendChild(labelCell);
    row.appendChild(durationCell);
    row.appendChild(indexCell);
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
    fairnessStatus
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

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
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
          content: `Write a short narrative (2 paragraphs) using these data points:\n${JSON.stringify(
            payload
          )}`
        }
      ]
    })
  });

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
      segments: segments.sort((a, b) => a.startTime - b.startTime)
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
  productiveMs: number;
}

function enrichMetricsWithVscode(metrics: DailyMetrics): EnrichedMetrics {
  const vscodeMs = metrics.vscodeActiveMs ?? 0;
  const label = i18n?.t('label_vscode') ?? 'VS Code (IDE)';

  const domains = { ...metrics.domains };
  if (vscodeMs > 0) {
    domains['__vscode:ide'] = {
      domain: label,
      category: 'productive',
      milliseconds: (domains['__vscode:ide']?.milliseconds ?? 0) + vscodeMs
    };
  }

  const timeline = mergeTimelines(metrics, domains);

  const hourly = metrics.hourly.map((bucket) => ({ ...bucket }));
  if (metrics.vscodeTimeline?.length) {
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
        }
      }
    }
  }

  return {
    ...metrics,
    domains,
    timeline,
    hourly,
    productiveMs: metrics.productiveMs + vscodeMs
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
