import {
  DailyMetrics,
  DomainStats,
  DomainSuggestion,
  FairnessSummary,
  LocalePreference,
  MlModelStatus,
  PopupData,
  RuntimeMessageType,
  SupportedLocale,
  ContextModeValue,
  ContextHistory
} from '../shared/types.js';
import { formatDuration } from '../shared/utils/time.js';
import {
  calculateKpis,
  CalculatedKpis,
  formatPercentage,
  formatRate,
  formatProductivityRatio
} from '../shared/metrics.js';
import { getScoreBand, pickScoreMessageKey } from '../shared/score.js';
import { createI18n, I18nService } from '../shared/i18n.js';
import { setManualOverride } from '../shared/utils/manual-override.js';
import { setContextMode } from '../shared/utils/context.js';
import { LocalStorageKey, readLocalStorage } from '../shared/utils/storage.js';
import { buildDetailedCsvSection } from '../shared/utils/csv-detail.js';
import { translateSuggestionReason } from '../shared/utils/suggestion-reasons.js';

declare const Chart: any;
type ChartInstance = any;
type JsPdfConstructor = new (...args: any[]) => {
  setFontSize: (size: number) => void;
  text: (text: string, x: number, y: number) => void;
  setFont: (family?: string, style?: string) => void;
  addImage: (imageData: string, format: string, x: number, y: number, width: number, height: number) => void;
  addPage: () => void;
  save: (filename: string) => void;
};

declare const jspdf: { jsPDF: JsPdfConstructor };

const scoreValueEl = document.getElementById('scoreValue') as HTMLElement;
const scoreMessageEl = document.getElementById('scoreMessage') as HTMLElement;
const lastSyncEl = document.getElementById('lastSync') as HTMLElement;
const productiveTimeEl = document.getElementById('productiveTime') as HTMLElement;
const procrastinationTimeEl = document.getElementById('procrastinationTime') as HTMLElement;
const inactiveTimeEl = document.getElementById('inactiveTime') as HTMLElement;
const domainsListEl = document.getElementById('domainsList') as HTMLOListElement;
const refreshButton = document.getElementById('refreshButton') as HTMLButtonElement;
const optionsButton = document.getElementById('optionsButton') as HTMLButtonElement;
const chartCanvas = document.getElementById('productivityChart') as HTMLCanvasElement;
const csvExportButton = document.getElementById('csvExportButton') as HTMLButtonElement;
const pdfExportButton = document.getElementById('pdfExportButton') as HTMLButtonElement;
const reportButton = document.getElementById('reportButton') as HTMLButtonElement;
const releaseNotesButton = document.getElementById('releaseNotesButton') as HTMLButtonElement | null;
const suggestionCardEl = document.getElementById('suggestionCard') as HTMLDivElement | null;
const suggestionTitleEl = document.getElementById('suggestionTitle') as HTMLElement | null;
const suggestionConfidenceEl = document.getElementById('suggestionConfidence') as HTMLElement | null;
const suggestionReasonsEl = document.getElementById('suggestionReasons') as HTMLUListElement | null;
const suggestionDomainEl = document.getElementById('suggestionDomain') as HTMLElement | null;
const suggestionClassificationEl = document.getElementById(
  'suggestionClassification'
) as HTMLElement | null;
const suggestionPrevButton = document.getElementById(
  'suggestionPrevButton'
) as HTMLButtonElement | null;
const suggestionNextButton = document.getElementById(
  'suggestionNextButton'
) as HTMLButtonElement | null;
const suggestionCounterEl = document.getElementById('suggestionCounter') as HTMLElement | null;
const suggestionProductiveButton = document.getElementById(
  'suggestionProductiveButton'
) as HTMLButtonElement | null;
const suggestionProcrastinationButton = document.getElementById(
  'suggestionProcrastinationButton'
) as HTMLButtonElement | null;
const suggestionIgnoreButton = document.getElementById(
  'suggestionIgnoreButton'
) as HTMLButtonElement | null;
const suggestionManualButton = document.getElementById(
  'suggestionManualButton'
) as HTMLButtonElement | null;
const mlCardEl = document.getElementById('mlCard') as HTMLDivElement | null;
const mlStatusBadgeEl = document.getElementById('mlStatusBadge') as HTMLSpanElement | null;
const mlUpdatesEl = document.getElementById('mlUpdates') as HTMLElement | null;
const mlActiveFeaturesEl = document.getElementById('mlActiveFeatures') as HTMLElement | null;
const mlLastUpdatedEl = document.getElementById('mlLastUpdated') as HTMLElement | null;
const mlBiasEl = document.getElementById('mlBias') as HTMLElement | null;
const focusRateEl = document.getElementById('focusRateValue') as HTMLElement;
const tabSwitchRateEl = document.getElementById('tabSwitchRateValue') as HTMLElement;
const inactivePercentEl = document.getElementById('inactivePercentValue') as HTMLElement;
const productivityRatioEl = document.getElementById('productivityRatioValue') as HTMLElement;
const topFocusDomainEl = document.getElementById('topFocusDomain') as HTMLElement;
const topFocusTimeEl = document.getElementById('topFocusTime') as HTMLElement;
const topProcrastinationDomainEl = document.getElementById(
  'topProcrastinationDomain'
) as HTMLElement;
const topProcrastinationTimeEl = document.getElementById(
  'topProcrastinationTime'
) as HTMLElement;
const criticalOverlayEl = document.getElementById('criticalOverlay') as HTMLDivElement | null;
const criticalMessageEl = document.getElementById('criticalMessage') as HTMLParagraphElement | null;
const criticalCountdownEl = document.getElementById('criticalCountdown') as HTMLSpanElement | null;
const criticalCloseButton = document.getElementById('criticalCloseButton') as HTMLButtonElement | null;
const criticalSoundButton = document.getElementById('criticalSoundButton') as HTMLButtonElement | null;
const criticalReportButton = document.getElementById('criticalReportButton') as HTMLButtonElement | null;
const criticalOptionsButton = document.getElementById('criticalOptionsButton') as HTMLButtonElement | null;
const blogSectionEl = document.getElementById('blogCard') as HTMLElement | null;
const blogCategoryEl = document.getElementById('blogCategoryLabel') as HTMLElement | null;
const blogReasonEl = document.getElementById('blogReason') as HTMLElement | null;
const blogTitleEl = document.getElementById('blogTitle') as HTMLElement | null;
const blogExcerptEl = document.getElementById('blogExcerpt') as HTMLElement | null;
const blogTagsEl = document.getElementById('blogTags') as HTMLUListElement | null;
const blogStatusEl = document.getElementById('blogRecommendationStatus') as HTMLElement | null;
const blogContentEl = document.getElementById('blogRecommendationContent') as HTMLElement | null;
const blogReadButton = document.getElementById('blogReadButton') as HTMLButtonElement | null;
const blogOpenButton = document.getElementById('blogOpenBlogButton') as HTMLButtonElement | null;
const manualOverrideToggle = document.getElementById('manualOverrideToggle') as HTMLInputElement | null;
const contextSelect = document.getElementById('contextSelect') as HTMLSelectElement | null;
const fairnessStatusEl = document.getElementById('fairnessStatus') as HTMLElement | null;
const holidayStatusEl = document.getElementById('holidayStatus') as HTMLElement | null;
const manifestInfo = chrome.runtime.getManifest?.() ?? { homepage_url: undefined };
const DEFAULT_SITE_BASE = 'https://donotavio.github.io/saul_goodman';
const HOMEPAGE_BASE = (manifestInfo.homepage_url ?? DEFAULT_SITE_BASE).replace(/\/+$/, '');
const BLOG_ROOT_URL = `${HOMEPAGE_BASE}/blog`;
const BLOG_HOME_URL = `${BLOG_ROOT_URL}/`;
const BLOG_INDEX_REMOTE_URL = `${BLOG_ROOT_URL}/index.json`;
const BLOG_INDEX_FALLBACK_URL = chrome.runtime.getURL('site/blog/index.json');
type BlogCategory = 'procrastinacao' | 'foco-atencao' | 'dev-performance' | 'trabalho-remoto';

interface BlogPost {
  title: string;
  url: string;
  markdown: string;
  date: string;
  category: BlogCategory;
  tags?: string[];
  excerpt?: string;
  [key: string]: string | string[] | BlogCategory | undefined;
}

const BLOG_CATEGORY_LABELS: Record<'pt' | 'en' | 'es', Record<BlogCategory, string>> = {
  pt: {
    'procrastinacao': 'Procrastinação',
    'foco-atencao': 'Foco & Atenção',
    'dev-performance': 'Performance Dev',
    'trabalho-remoto': 'Trabalho Remoto'
  },
  en: {
    'procrastinacao': 'Procrastination',
    'foco-atencao': 'Focus & Attention',
    'dev-performance': 'Dev Performance',
    'trabalho-remoto': 'Remote Work'
  },
  es: {
    'procrastinacao': 'Procrastinación',
    'foco-atencao': 'Enfoque y Atención',
    'dev-performance': 'Rendimiento Dev',
    'trabalho-remoto': 'Trabajo Remoto'
  }
};

const BLOG_REASON_KEYS: Record<BlogCategory, string> = {
  'procrastinacao': 'popup_blog_reason_procrastinacao',
  'foco-atencao': 'popup_blog_reason_foco',
  'dev-performance': 'popup_blog_reason_dev',
  'trabalho-remoto': 'popup_blog_reason_remoto'
};

const BLOG_LOCALE_SUFFIX: Record<SupportedLocale, 'pt' | 'en' | 'es'> = {
  'pt-BR': 'pt',
  'en-US': 'en',
  'es-419': 'es',
  fr: 'en',
  de: 'en',
  it: 'en',
  tr: 'en',
  'zh-CN': 'en',
  hi: 'en',
  ar: 'en',
  bn: 'en',
  ru: 'en',
  ur: 'en'
};

let productivityChart: ChartInstance = null;
let latestData: PopupData | null = null;
let criticalCountdownTimer: number | null = null;
let criticalCountdownValue = 45;
let criticalOverlayDismissed = false;
let criticalSoundEnabledSetting = false;
let lastCriticalState = false;
let lastCriticalScoreNotified = -Infinity;
let currentCriticalThreshold = 90;
let lastScoreBand: 'good' | 'warn' | 'alert' | 'neutral' = 'neutral';
let badgeConfettiTimer: number | null = null;
const sirenPlayer = typeof CriticalSirenPlayer !== 'undefined' ? new CriticalSirenPlayer() : null;
let i18n: I18nService | null = null;
let activeLocalePreference: LocalePreference = 'auto';
let latestKpis: CalculatedKpis | null = null;
let latestFairness: FairnessSummary | null = null;
let cachedBlogPosts: BlogPost[] | null = null;
let blogFetchPromise: Promise<BlogPost[] | null> | null = null;
let blogSelectedPostUrl: string | null = null;
let currentSuggestion: DomainSuggestion | null = null;
let suggestionList: DomainSuggestion[] = [];
let suggestionIndex = 0;

const POPUP_CRITICAL_MESSAGE_KEYS: Array<{ key: string; needsThreshold?: boolean }> = [
  { key: 'popup_critical_message_1', needsThreshold: true },
  { key: 'popup_critical_message_2' },
  { key: 'popup_critical_message_3' },
  { key: 'popup_critical_message_4' }
];

const FAIRNESS_STATUS_KEY_BY_RULE: Record<FairnessSummary['rule'], string> = {
  'manual-override': 'popup_fairness_status_manual',
  'context-personal': 'popup_fairness_status_personal',
  'context-leisure': 'popup_fairness_status_leisure',
  'context-study': 'popup_fairness_status_study',
  'context-day-off': 'popup_fairness_status_day_off',
  'context-vacation': 'popup_fairness_status_vacation',
  holiday: 'popup_fairness_status_holiday',
  normal: 'popup_fairness_status_default'
};

const FAIRNESS_STATUS_FALLBACKS: Record<string, string> = {
  popup_fairness_status_manual: 'Dia ignorado por você.',
  popup_fairness_status_personal: 'Modo pessoal ativo, sem pontuação.',
  popup_fairness_status_leisure: 'Modo lazer reduz a pressão.',
  popup_fairness_status_study: 'Modo estudo suaviza o índice.',
  popup_fairness_status_day_off: 'Folga cadastrada — índice suavizado.',
  popup_fairness_status_vacation: 'Modo férias suaviza o índice.',
  popup_fairness_status_holiday: 'Feriado nacional neutralizando o dia.',
  popup_fairness_status_default: 'Dia útil normal.'
};

const FAIRNESS_HOLIDAY_FALLBACKS: Record<string, string> = {
  popup_fairness_holiday_active: 'Saul ignorou o índice porque hoje é feriado.',
  popup_fairness_holiday_detected: 'Feriado detectado — sem penalizar este dia.'
};

// BUG-011: Cleanup timers when popup closes
window.addEventListener('pagehide', () => {
  if (criticalCountdownTimer) {
    window.clearInterval(criticalCountdownTimer);
    criticalCountdownTimer = null;
  }
  if (badgeConfettiTimer) {
    window.clearTimeout(badgeConfettiTimer);
    badgeConfettiTimer = null;
  }
  if (sirenPlayer) {
    sirenPlayer.stop();
  }
});

document.addEventListener('DOMContentLoaded', () => {
  attachListeners();
  void hydrate();
});

function attachListeners(): void {
  refreshButton.addEventListener('click', () => void hydrate());
  optionsButton.addEventListener('click', () => {
    void chrome.runtime.openOptionsPage();
  });
  csvExportButton.addEventListener('click', () => void handleCsvExport());
  pdfExportButton.addEventListener('click', () => void handlePdfExport());
  reportButton.addEventListener('click', () => {
    void chrome.tabs.create({ url: chrome.runtime.getURL('src/report/report.html') });
  });
  releaseNotesButton?.addEventListener('click', () => void triggerReleaseNotes());
  criticalCloseButton?.addEventListener('click', () => {
    criticalOverlayEl?.classList.add('hidden');
    criticalOverlayDismissed = true;
  });
  criticalSoundButton?.addEventListener('click', () => {
    sirenPlayer?.playBursts(4).catch(() => {});
  });
  criticalReportButton?.addEventListener('click', () => {
    void chrome.tabs.create({ url: chrome.runtime.getURL('src/report/report.html') });
  });
  criticalOptionsButton?.addEventListener('click', () => {
    const url = chrome.runtime.getURL('src/options/options.html#vilains');
    void chrome.tabs.create({ url });
  });
  blogOpenButton?.addEventListener('click', () => {
    void chrome.tabs.create({ url: BLOG_HOME_URL });
  });
  blogReadButton?.addEventListener('click', () => {
    if (!blogSelectedPostUrl) {
      return;
    }
    void chrome.tabs.create({ url: blogSelectedPostUrl });
  });
  suggestionPrevButton?.addEventListener('click', () => moveSuggestion(-1));
  suggestionNextButton?.addEventListener('click', () => moveSuggestion(1));
  suggestionProductiveButton?.addEventListener('click', () =>
    void handleSuggestionDecision('productive')
  );
  suggestionProcrastinationButton?.addEventListener('click', () =>
    void handleSuggestionDecision('procrastination')
  );
  suggestionIgnoreButton?.addEventListener('click', () => void handleSuggestionIgnore());
  suggestionManualButton?.addEventListener('click', () => void openManualClassification());
  manualOverrideToggle?.addEventListener('change', () => {
    const enabled = manualOverrideToggle.checked;
    void handleManualOverrideToggle(enabled);
  });
  contextSelect?.addEventListener('change', () => {
    const value = (contextSelect?.value as ContextModeValue) ?? 'work';
    void handleContextChange(value);
  });
}

async function handleManualOverrideToggle(enabled: boolean): Promise<void> {
  if (!manualOverrideToggle) {
    return;
  }
  manualOverrideToggle.disabled = true;
  manualOverrideToggle.setAttribute('aria-busy', 'true');
  try {
    await setManualOverride(enabled);
    await hydrate();
  } catch (error) {
    console.error('Failed to toggle manual override', error);
    manualOverrideToggle.checked = !enabled;
  } finally {
    manualOverrideToggle.disabled = false;
    manualOverrideToggle.removeAttribute('aria-busy');
  }
}

async function handleContextChange(value: ContextModeValue): Promise<void> {
  if (!contextSelect) {
    return;
  }
  const normalized: ContextModeValue = [
    'work',
    'personal',
    'leisure',
    'study',
    'dayOff',
    'vacation'
  ].includes(value)
    ? value
    : 'work';
  contextSelect.disabled = true;
  contextSelect.setAttribute('aria-busy', 'true');
  try {
    await setContextMode(normalized);
    await hydrate();
  } catch (error) {
    console.error('Failed to update context mode', error);
    if (latestFairness?.contextMode?.value) {
      contextSelect.value = latestFairness.contextMode.value;
    } else {
      contextSelect.value = 'work';
    }
  } finally {
    contextSelect.disabled = false;
    contextSelect.removeAttribute('aria-busy');
  }
}

async function hydrate(): Promise<void> {
  try {
    const data = await sendRuntimeMessage<PopupData>('metrics-request');
    if (!data || !data.metrics) {
      throw new Error(i18n?.t('popup_error_no_data') ?? 'No data available');
    }
    const preference = data.settings?.localePreference ?? 'auto';
    await ensureI18n(preference);
    latestData = data;
    latestFairness = data.fairness ?? null;
    suggestionList = buildSuggestionList(data);
    suggestionIndex = 0;
    currentSuggestion = suggestionList[0] ?? null;
    criticalSoundEnabledSetting = Boolean(data.settings?.criticalSoundEnabled);
    renderSummary(data.metrics);
    renderScore(data.metrics.currentIndex);
    renderKpis(data.metrics);
    renderTopDomains(data.metrics);
    renderChart(data.metrics);
    renderFairness(latestFairness);
    renderSuggestionCard(currentSuggestion, data.settings, suggestionList.length, suggestionIndex);
    renderMlStatus(data.mlModel ?? null, data.settings?.locale ?? 'en-US');
    void loadBlogSuggestion(data.metrics);
    const formattedTime = new Date(data.metrics.lastUpdated).toLocaleTimeString(
      data.settings?.locale ?? 'en-US'
    );
    lastSyncEl.textContent =
      i18n?.t('popup_last_sync', { time: formattedTime }) ?? `Updated at ${formattedTime}`;
  } catch (error) {
    console.error(error);
    scoreMessageEl.textContent =
      i18n?.t('popup_error_runtime') ?? 'Oops! Unable to reach the office.';
  }
}

function buildSuggestionList(data: PopupData): DomainSuggestion[] {
  const combined: DomainSuggestion[] = [
    ...(data.activeSuggestion ? [data.activeSuggestion] : []),
    ...(data.suggestions ?? [])
  ].filter((item): item is DomainSuggestion => Boolean(item));

  const seen = new Set<string>();
  const sorted = combined.sort((a, b) => b.timestamp - a.timestamp);
  const deduped: DomainSuggestion[] = [];
  for (const entry of sorted) {
    const key = entry.domain;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(entry);
  }
  return deduped;
}

async function ensureI18n(preference: LocalePreference): Promise<void> {
  if (i18n && activeLocalePreference === preference) {
    return;
  }
  i18n = await createI18n(preference);
  activeLocalePreference = preference;
  i18n.apply();
}

function moveSuggestion(delta: number): void {
  if (!suggestionList.length) {
    return;
  }
  suggestionIndex = (suggestionIndex + delta + suggestionList.length) % suggestionList.length;
  currentSuggestion = suggestionList[suggestionIndex] ?? null;
  renderSuggestionCard(currentSuggestion, latestData?.settings, suggestionList.length, suggestionIndex);
}

function renderSuggestionCard(
  suggestion: DomainSuggestion | null,
  settings?: { enableAutoClassification?: boolean },
  totalCount?: number,
  currentIndexValue?: number
): void {
  if (!suggestionCardEl || !suggestionTitleEl || !suggestionReasonsEl || !suggestionConfidenceEl) {
    return;
  }
  const total = totalCount ?? suggestionList.length;
  const activeIndex = currentIndexValue ?? suggestionIndex;
  const featureEnabled = settings?.enableAutoClassification;
  if (!featureEnabled || !suggestion) {
    suggestionCardEl.classList.add('hidden');
    if (suggestionCounterEl) {
      suggestionCounterEl.textContent = '';
    }
    suggestionPrevButton?.setAttribute('disabled', 'true');
    suggestionNextButton?.setAttribute('disabled', 'true');
    return;
  }
  suggestionCardEl.classList.remove('hidden');
  const labelMap: Record<DomainSuggestion['classification'], string> = {
    productive: i18n?.t('popup_suggestion_label_productive') ?? 'PRODUTIVO',
    procrastination: i18n?.t('popup_suggestion_label_procrastination') ?? 'PROCRASTINADOR',
    neutral: i18n?.t('popup_suggestion_label_neutral') ?? 'NEUTRO'
  };
  const titleTemplate =
    i18n?.t('popup_suggestion_title_filled', {
      label: labelMap[suggestion.classification]
    }) ?? `Este site parece ser ${labelMap[suggestion.classification]}`;
  suggestionTitleEl.textContent = titleTemplate;
  if (suggestionClassificationEl) {
    suggestionClassificationEl.textContent = labelMap[suggestion.classification];
    const baseClass = 'suggestion-classification';
    const variant =
      suggestion.classification === 'productive'
        ? 'success'
        : suggestion.classification === 'procrastination'
        ? 'danger'
        : 'neutral';
    suggestionClassificationEl.className = `${baseClass} ${variant}`;
  }
  if (suggestionDomainEl) {
    suggestionDomainEl.textContent = suggestion.domain;
  }
  if (suggestionCounterEl) {
    if (total > 1) {
      suggestionCounterEl.textContent = `${activeIndex + 1}/${total}`;
    } else {
      suggestionCounterEl.textContent = '';
    }
  }
  if (suggestionPrevButton && suggestionNextButton) {
    const enableNav = total > 1;
    suggestionPrevButton.disabled = !enableNav;
    suggestionNextButton.disabled = !enableNav;
  }
  const confidenceTemplate =
    i18n?.t('popup_suggestion_confidence_filled', {
      confidence: Math.round(suggestion.confidence)
    }) ?? `Confiança ${Math.round(suggestion.confidence)}%`;
  suggestionConfidenceEl.textContent = confidenceTemplate;
  suggestionReasonsEl.innerHTML = '';
  suggestion.reasons.slice(0, 4).forEach((reason) => {
    const li = document.createElement('li');
    li.textContent = translateSuggestionReason(reason, i18n);
    suggestionReasonsEl.appendChild(li);
  });
}

function renderMlStatus(status: MlModelStatus | null, locale: SupportedLocale): void {
  if (!mlCardEl || !mlStatusBadgeEl || !mlUpdatesEl || !mlActiveFeaturesEl || !mlLastUpdatedEl || !mlBiasEl) {
    return;
  }

  const formatNumber = (value: number): string => value.toLocaleString(locale ?? 'en-US');
  mlStatusBadgeEl.classList.remove('training', 'cold', 'unavailable');

  if (!status) {
    mlStatusBadgeEl.textContent = i18n?.t('popup_ml_status_unavailable') ?? 'Unavailable';
    mlStatusBadgeEl.classList.add('unavailable');
    mlUpdatesEl.textContent = '--';
    mlActiveFeaturesEl.textContent = '--';
    mlLastUpdatedEl.textContent = '--';
    mlBiasEl.textContent = '--';
    return;
  }

  const maturity = resolveModelMaturity(status.totalUpdates, status.activeFeatures);
  mlStatusBadgeEl.textContent = maturity.label;
  mlStatusBadgeEl.classList.add(maturity.className);

  mlUpdatesEl.textContent = formatNumber(status.totalUpdates);
  mlActiveFeaturesEl.textContent = formatNumber(status.activeFeatures);
  mlBiasEl.textContent = status.bias.toFixed(3);
  if (status.lastUpdated > 0) {
    mlLastUpdatedEl.textContent = new Date(status.lastUpdated).toLocaleString(locale ?? 'en-US');
  } else {
    mlLastUpdatedEl.textContent = i18n?.t('popup_ml_never') ?? 'Never';
  }
}

function resolveModelMaturity(
  totalUpdates: number,
  activeFeatures: number
): { label: string; className: string } {
  if (totalUpdates < 5 || activeFeatures < 20) {
    return {
      label: i18n?.t('popup_ml_status_cold_start') ?? 'Cold start',
      className: 'cold'
    };
  }
  if (totalUpdates < 30 || activeFeatures < 100) {
    return {
      label: i18n?.t('popup_ml_status_warming') ?? 'Warming',
      className: 'training'
    };
  }
  return {
    label: i18n?.t('popup_ml_status_ready') ?? 'Ready',
    className: 'training'
  };
}

async function handleSuggestionDecision(target: 'productive' | 'procrastination'): Promise<void> {
  if (!currentSuggestion) {
    return;
  }
  setSuggestionBusy(true);
  try {
    await sendRuntimeMessage('apply-suggestion', {
      domain: currentSuggestion.domain,
      classification: target
    });
    await hydrate();
  } catch (error) {
    console.error('Failed to apply suggestion', error);
  } finally {
    setSuggestionBusy(false);
  }
}

async function handleSuggestionIgnore(): Promise<void> {
  if (!currentSuggestion) {
    return;
  }
  setSuggestionBusy(true);
  try {
    await sendRuntimeMessage('ignore-suggestion', { domain: currentSuggestion.domain });
    await hydrate();
  } catch (error) {
    console.error('Failed to ignore suggestion', error);
  } finally {
    setSuggestionBusy(false);
  }
}

function openManualClassification(): void {
  const url = chrome.runtime.getURL('src/options/options.html#vilains');
  void chrome.tabs.create({ url });
}

function setSuggestionBusy(busy: boolean): void {
  [
    suggestionProductiveButton,
    suggestionProcrastinationButton,
    suggestionIgnoreButton,
    suggestionManualButton
  ].forEach((button) => {
    if (!button) {
      return;
    }
    button.disabled = busy;
    if (busy) {
      button.setAttribute('aria-busy', 'true');
    } else {
      button.removeAttribute('aria-busy');
    }
  });
}

function renderSummary(metrics: DailyMetrics): void {
  const vscodeMs = metrics.vscodeActiveMs ?? 0;
  const totalProductive = metrics.productiveMs + vscodeMs;
  productiveTimeEl.textContent = formatDuration(totalProductive);
  procrastinationTimeEl.textContent = formatDuration(metrics.procrastinationMs);
  inactiveTimeEl.textContent = formatDuration(metrics.inactiveMs);
}

function renderFairness(summary?: FairnessSummary | null): void {
  if (!manualOverrideToggle || !contextSelect || !fairnessStatusEl) {
    return;
  }
  const fallback: FairnessSummary = summary ?? {
    rule: 'normal',
    manualOverrideActive: false,
    contextMode: { value: 'work', updatedAt: Date.now() },
    holidayNeutral: false,
    isHolidayToday: false
  };
  manualOverrideToggle.checked = fallback.manualOverrideActive;
  contextSelect.value = fallback.contextMode?.value ?? 'work';

  const statusKey = FAIRNESS_STATUS_KEY_BY_RULE[fallback.rule] ?? 'popup_fairness_status_default';
  fairnessStatusEl.textContent = translateFairnessStatus(statusKey);

  if (holidayStatusEl) {
    if (fallback.isHolidayToday) {
      holidayStatusEl.hidden = false;
      const holidayKey = fallback.holidayNeutral
        ? 'popup_fairness_holiday_active'
        : 'popup_fairness_holiday_detected';
      holidayStatusEl.textContent =
        i18n?.t(holidayKey) ?? FAIRNESS_HOLIDAY_FALLBACKS[holidayKey] ?? holidayKey;
    } else {
      holidayStatusEl.hidden = true;
    }
  }
}

function translateFairnessStatus(key: string): string {
  const translated = i18n?.t(key);
  if (translated && translated !== key) {
    return translated;
  }
  return FAIRNESS_STATUS_FALLBACKS[key] ?? key;
}

function renderKpis(metrics: DailyMetrics): void {
  const kpis = calculateKpis(metrics);
  latestKpis = kpis;
  const noDataLabel = i18n?.t('popup_status_no_data') ?? 'No data';

  focusRateEl.textContent = formatPercentage(kpis.focusRate);
  tabSwitchRateEl.textContent = formatRate(kpis.tabSwitchRate);
  inactivePercentEl.textContent = formatPercentage(kpis.inactivePercent);
  productivityRatioEl.textContent = formatProductivityRatio(kpis.productivityRatio);

  if (kpis.topFocus) {
    topFocusDomainEl.textContent = formatDomainLabel(kpis.topFocus.domain);
    topFocusTimeEl.textContent = formatDuration(kpis.topFocus.milliseconds);
  } else {
    topFocusDomainEl.textContent = '--';
    topFocusTimeEl.textContent = noDataLabel;
  }

  if (kpis.topProcrastination) {
    topProcrastinationDomainEl.textContent = kpis.topProcrastination.domain;
    topProcrastinationTimeEl.textContent = formatDuration(kpis.topProcrastination.milliseconds);
  } else {
    topProcrastinationDomainEl.textContent = '--';
    topProcrastinationTimeEl.textContent = noDataLabel;
  }
}

function renderScore(score: number): void {
  scoreValueEl.textContent = score.toString();
  const messageKey = pickScoreMessageKey(score);
  scoreMessageEl.textContent = i18n?.t(messageKey) ?? messageKey;
  const band = getScoreBand(score);
  scoreValueEl.classList.remove('alert', 'good', 'warn');
  if (band === 'alert') {
    scoreValueEl.classList.add('alert');
  } else if (band === 'good') {
    scoreValueEl.classList.add('good');
  } else if (band === 'warn') {
    scoreValueEl.classList.add('warn');
  }
  if (band === 'good' && lastScoreBand !== 'good') {
    triggerBadgeConfetti();
  }
  lastScoreBand = band;
  const threshold = latestData?.settings?.criticalScoreThreshold ?? 90;
  currentCriticalThreshold = threshold;
  if (score >= threshold && score > lastCriticalScoreNotified) {
    criticalOverlayDismissed = false;
  }
  toggleCriticalMode(score >= threshold);
  lastCriticalScoreNotified = score >= threshold ? score : -Infinity;
}

function triggerBadgeConfetti(): void {
  const badge = document.querySelector('.badge');
  if (!badge) {
    return;
  }

  const existing = badge.querySelector('.badge-confetti');
  existing?.remove();

  const container = document.createElement('div');
  container.className = 'badge-confetti';
  const colors = ['#29c56d', '#17a589', '#ffe434', '#ff9f1c', '#ff1a1a'];
  const pieces = 14;

  for (let i = 0; i < pieces; i += 1) {
    const piece = document.createElement('span');
    piece.className = 'confetti-piece';
    piece.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.animationDelay = `${(Math.random() * 0.2).toFixed(2)}s`;
    piece.style.animationDuration = `${(1 + Math.random() * 0.4).toFixed(2)}s`;
    container.appendChild(piece);
  }

  badge.appendChild(container);

  if (badgeConfettiTimer) {
    window.clearTimeout(badgeConfettiTimer);
  }
  badgeConfettiTimer = window.setTimeout(() => {
    container.remove();
    badgeConfettiTimer = null;
  }, 1400);
}

function renderTopDomains(metrics: DailyMetrics): void {
  domainsListEl.innerHTML = '';
  const domains = getDomainsWithVscode(metrics);
  const sorted = Object.values(domains)
    .sort((a, b) => b.milliseconds - a.milliseconds)
    .slice(0, 5);

  if (!sorted.length) {
    const li = document.createElement('li');
    li.textContent = i18n?.t('popup_status_no_domains') ?? 'No data for today.';
    domainsListEl.appendChild(li);
    return;
  }

  for (const domain of sorted) {
    const li = document.createElement('li');
    const nameSpan = document.createElement('span');
    const durationEm = document.createElement('em');

    nameSpan.textContent = domain.domain;
    durationEm.textContent = formatDuration(domain.milliseconds);
    durationEm.classList.add(domain.category);

    li.appendChild(nameSpan);
    li.appendChild(durationEm);
    domainsListEl.appendChild(li);
  }
}

function renderChart(metrics: DailyMetrics): void {
  const productiveLabel = i18n?.t('popup_chart_label_productive') ?? 'Productive';
  const procrastinationLabel = i18n?.t('popup_chart_label_procrastination') ?? 'Procrastination';
  const minutesLabel = i18n?.t('popup_chart_axis_minutes') ?? 'Minutes';
  const productiveMinutes = (metrics.productiveMs + (metrics.vscodeActiveMs ?? 0)) / 60000;
  const procrastinationMinutes = metrics.procrastinationMs / 60000;
  const maxValue = Math.max(productiveMinutes, procrastinationMinutes, 1);
  const data = {
    labels: [productiveLabel, procrastinationLabel],
    datasets: [
      {
        label: minutesLabel,
        backgroundColor: ['#0a7e07', '#d00000'],
        borderColor: '#111',
        borderWidth: 1,
        data: [productiveMinutes, procrastinationMinutes]
      }
    ]
  };

  if (productivityChart) {
    productivityChart.destroy();
  }

  productivityChart = new Chart(chartCanvas, {
    type: 'bar',
    data,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          suggestedMax: Math.max(1, Math.ceil(maxValue * 1.2 * 10) / 10),
          title: { display: true, text: minutesLabel }
        }
      }
    }
  });
}

function getDomainsWithVscode(metrics: DailyMetrics): Record<string, DomainStats> {
  const vscodeMs = metrics.vscodeActiveMs ?? 0;
  if (vscodeMs <= 0) {
    return metrics.domains;
  }
  const label = i18n?.t('label_vscode') ?? 'VS Code (IDE)';
  return {
    ...metrics.domains,
    '__vscode:ide': {
      domain: label,
      category: 'productive',
      milliseconds: vscodeMs
    }
  };
}

function formatDomainLabel(domain: string): string {
  const label = i18n?.t('label_vscode') ?? 'VS Code (IDE)';
  if (domain === 'VS Code (IDE)' || domain === '__vscode:ide') {
    return label;
  }
  return domain;
}

async function sendRuntimeMessage<T = RuntimeMessageType>(
  type: RuntimeMessageType,
  payload?: unknown
): Promise<T> {
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
        const fallback = i18n?.t('popup_error_unknown') ?? 'Unknown error';
        reject(new Error(response.error ?? fallback));
      }
    });
  });
}

function formatMinutesValue(ms: number): string {
  return (ms / 60000).toFixed(1);
}

async function handleCsvExport(): Promise<void> {
  if (!latestData) {
    alert(
      i18n?.t('popup_alert_no_data') ??
        'No data yet. Open some tabs and try again.'
    );
    return;
  }

  const contextHistory =
    (await readLocalStorage<ContextHistory>(LocalStorageKey.CONTEXT_HISTORY)) ?? [];
  const kpis = calculateKpis(latestData.metrics);
  const csvContent = buildCsv(latestData.metrics, kpis, {
    fairness: latestFairness,
    contextHistory
  });
  downloadTextFile(csvContent, `saul-goodman-${latestData.metrics.dateKey}.csv`, 'text/csv;charset=utf-8;');
}

interface BuildCsvOptions {
  fairness?: FairnessSummary | null;
  contextHistory?: ContextHistory;
}

function buildCsv(metrics: DailyMetrics, kpis: CalculatedKpis, options: BuildCsvOptions = {}): string {
  const lines: string[] = [];
  const vscodeMs = metrics.vscodeActiveMs ?? 0;
  const totalProductive = metrics.productiveMs + vscodeMs;
  lines.push(i18n?.t('popup_csv_summary_title') ?? 'General summary');
  const summaryHeaders = [
    i18n?.t('popup_csv_column_date') ?? 'Date',
    i18n?.t('popup_csv_column_index') ?? 'Index',
    i18n?.t('popup_csv_column_productive') ?? 'Productive (min)',
    i18n?.t('popup_csv_column_vscode') ?? 'VS Code (min)',
    i18n?.t('popup_csv_column_procrastination') ?? 'Procrastination (min)',
    i18n?.t('popup_csv_column_inactive') ?? 'Inactive (min)',
    i18n?.t('popup_csv_column_switches') ?? 'Tab switches'
  ];
  lines.push(summaryHeaders.join(','));
  lines.push(
    [
      metrics.dateKey,
      metrics.currentIndex,
      formatMinutesValue(totalProductive),
      formatMinutesValue(vscodeMs),
      formatMinutesValue(metrics.procrastinationMs),
      formatMinutesValue(metrics.inactiveMs),
      metrics.tabSwitches
    ].join(',')
  );

  lines.push('');
  lines.push(i18n?.t('popup_csv_kpis_title') ?? 'Extra indicators');
  const kpiHeaders = [
    i18n?.t('popup_csv_kpi_focus') ?? 'Active focus (%)',
    i18n?.t('popup_csv_kpi_switches') ?? 'Switches per hour',
    i18n?.t('popup_csv_kpi_idle') ?? 'Idle time (%)',
    i18n?.t('popup_csv_kpi_ratio') ?? 'Prod vs Proc',
    i18n?.t('popup_csv_kpi_champion') ?? 'Top focus domain',
    i18n?.t('popup_csv_kpi_time') ?? 'Time',
    i18n?.t('popup_csv_kpi_villain') ?? 'Villain of the day',
    i18n?.t('popup_csv_kpi_time') ?? 'Time'
  ];
  lines.push(kpiHeaders.join(','));
  lines.push(
    [
      formatPercentage(kpis.focusRate),
      formatRate(kpis.tabSwitchRate),
      formatPercentage(kpis.inactivePercent),
      formatProductivityRatio(kpis.productivityRatio),
      kpis.topFocus?.domain ?? '--',
      kpis.topFocus ? formatDuration(kpis.topFocus.milliseconds) : '--',
      kpis.topProcrastination?.domain ?? '--',
      kpis.topProcrastination ? formatDuration(kpis.topProcrastination.milliseconds) : '--'
    ].join(',')
  );

  lines.push('');
  lines.push(i18n?.t('popup_csv_top_domains_title') ?? 'Top domains');
  const domainHeaders = [
    i18n?.t('popup_csv_domain') ?? 'Domain',
    i18n?.t('popup_csv_category') ?? 'Category',
    i18n?.t('popup_csv_minutes') ?? 'Minutes'
  ];
  lines.push(domainHeaders.join(','));
  Object.values(getDomainsWithVscode(metrics))
    .sort((a, b) => b.milliseconds - a.milliseconds)
    .slice(0, 10)
    .forEach((domain) => {
      lines.push(
        [domain.domain, domain.category, formatMinutesValue(domain.milliseconds)].join(',')
      );
    });

  const detailedLines = buildDetailedCsvSection({
    metrics,
    contextHistory: options.contextHistory,
    fairness: options.fairness ?? null,
    domainLabelFormatter: formatDomainLabel,
    labels: {
      sectionTitle: i18n?.t('popup_csv_detailed_title') ?? 'Detailed activity timeline',
      startTime: i18n?.t('popup_csv_detailed_column_start') ?? 'Start time',
      endTime: i18n?.t('popup_csv_detailed_column_end') ?? 'End time',
      duration: i18n?.t('popup_csv_detailed_column_duration') ?? 'Duration (ms)',
      domain: i18n?.t('popup_csv_detailed_column_domain') ?? 'Domain',
      category: i18n?.t('popup_csv_detailed_column_category') ?? 'Category',
      context: i18n?.t('popup_csv_detailed_column_context') ?? 'Context',
      fairnessRule: i18n?.t('popup_csv_detailed_column_fairness') ?? 'Fairness rule'
    }
  });

  if (detailedLines.length) {
    lines.push('');
    lines.push(...detailedLines);
  }

  return lines.join('\n');
}

function downloadTextFile(content: string, filename: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

async function handlePdfExport(): Promise<void> {
  if (!latestData) {
    alert(
      i18n?.t('popup_alert_no_data') ?? 'No data yet. Open some tabs and try again.'
    );
    return;
  }

  if (!jspdf?.jsPDF) {
    alert(i18n?.t('popup_alert_pdf_missing') ?? 'PDF module unavailable.');
    return;
  }

  const metrics = latestData.metrics;
  const kpis = calculateKpis(metrics);
  const doc = new jspdf.jsPDF({ unit: 'mm', format: 'a4' });

  doc.setFontSize(18);
  doc.text(i18n?.t('popup_pdf_title') ?? 'Saul Goodman report', 14, 20);
  doc.setFontSize(11);
  doc.text(`${i18n?.t('popup_pdf_date') ?? 'Date'}: ${metrics.dateKey}`, 14, 30);
  doc.text(`${i18n?.t('popup_pdf_index') ?? 'Index'}: ${metrics.currentIndex}`, 14, 36);

  doc.setFont(undefined, 'bold');
  doc.text(i18n?.t('popup_pdf_summary') ?? 'Daily summary', 14, 48);
  doc.setFont(undefined, 'normal');
  const vscodeMs = metrics.vscodeActiveMs ?? 0;
  const totalProductive = metrics.productiveMs + vscodeMs;
  doc.text(
    `${i18n?.t('popup_pdf_productive') ?? 'Productive'}: ${formatDuration(totalProductive)}`,
    14,
    54
  );
  if (vscodeMs > 0) {
    doc.text(`${i18n?.t('popup_pdf_vscode') ?? 'VS Code'}: ${formatDuration(vscodeMs)}`, 14, 60);
  }
  doc.text(
    `${i18n?.t('popup_pdf_procrastination') ?? 'Procrastination'}: ${formatDuration(metrics.procrastinationMs)}`,
    14,
    66
  );
  doc.text(
    `${i18n?.t('popup_pdf_inactive') ?? 'Inactive'}: ${formatDuration(metrics.inactiveMs)}`,
    14,
    72
  );
  doc.text(
    `${i18n?.t('popup_pdf_switches') ?? 'Tab switches'}: ${metrics.tabSwitches}`,
    14,
    78
  );

  doc.setFont(undefined, 'bold');
  doc.text(i18n?.t('popup_pdf_kpis') ?? 'Extra indicators', 14, 84);
  doc.setFont(undefined, 'normal');
  doc.text(
    `${i18n?.t('popup_kpi_focus_label') ?? 'Focus'}: ${formatPercentage(kpis.focusRate)}`,
    14,
    90
  );
  doc.text(
    `${i18n?.t('popup_kpi_switch_label') ?? 'Switches per hour'}: ${formatRate(kpis.tabSwitchRate)}`,
    14,
    96
  );
  doc.text(
    `${i18n?.t('popup_kpi_idle_label') ?? 'Idle time'}: ${formatPercentage(kpis.inactivePercent)}`,
    14,
    102
  );
  doc.text(
    `${i18n?.t('popup_kpi_ratio_label') ?? 'Prod vs Proc'}: ${formatProductivityRatio(kpis.productivityRatio)}`,
    14,
    108
  );
  doc.text(
    `${i18n?.t('popup_kpi_focus_domain_label') ?? 'Top focus'}: ${
      kpis.topFocus
        ? `${kpis.topFocus.domain} (${formatDuration(kpis.topFocus.milliseconds)})`
        : i18n?.t('popup_status_no_data') ?? 'No data'
    }`,
    14,
    114
  );
  doc.text(
    `${i18n?.t('popup_kpi_villain_label') ?? 'Villain'}: ${
      kpis.topProcrastination
        ? `${kpis.topProcrastination.domain} (${formatDuration(kpis.topProcrastination.milliseconds)})`
        : i18n?.t('popup_status_no_data') ?? 'No data'
    }`,
    14,
    120
  );

  const chartImage =
    productivityChart && typeof productivityChart.toBase64Image === 'function'
      ? productivityChart.toBase64Image()
      : null;

  let yOffset = 130;
  if (chartImage) {
    doc.addImage(chartImage, 'PNG', 14, 130, 180, 80);
    yOffset = 220;
  }

  doc.setFont(undefined, 'bold');
  doc.text(i18n?.t('popup_pdf_top_domains') ?? 'Top domains', 14, yOffset);
  doc.setFont(undefined, 'normal');
  let cursor = yOffset + 8;
  Object.values(metrics.domains)
    .sort((a, b) => b.milliseconds - a.milliseconds)
    .slice(0, 5)
    .forEach((domain) => {
      if (cursor > 280) {
        doc.addPage();
        cursor = 20;
      }
      doc.text(
        `${domain.domain} — ${domain.category} — ${formatDuration(domain.milliseconds)}`,
        14,
        cursor
      );
      cursor += 6;
    });

  doc.save(`saul-goodman-${metrics.dateKey}.pdf`);
}

function toggleCriticalMode(isCritical: boolean): void {
  if (isCritical) {
    document.body.classList.add('earthquake');
    if (!lastCriticalState) {
      criticalOverlayDismissed = false;
    }
    if (!criticalOverlayDismissed) {
      showCriticalOverlay();
    }
    startCriticalCountdown();
    if (criticalSoundEnabledSetting) {
      void sirenPlayer?.playBursts(4);
    }
  } else {
    document.body.classList.remove('earthquake');
    hideCriticalOverlay();
    stopCriticalCountdown();
    sirenPlayer?.stop();
    criticalOverlayDismissed = false;
  }
  lastCriticalState = isCritical;
}

function showCriticalOverlay(): void {
  if (!criticalOverlayEl) {
    return;
  }
  const message = getRandomCriticalMessage(currentCriticalThreshold);
  if (criticalMessageEl) {
    criticalMessageEl.textContent = message;
  }
  criticalOverlayEl.classList.remove('hidden');
}

function hideCriticalOverlay(): void {
  criticalOverlayEl?.classList.add('hidden');
}

function startCriticalCountdown(): void {
  if (!criticalCountdownEl) {
    return;
  }
  if (criticalCountdownTimer) {
    return;
  }
  criticalCountdownValue = 45;
  criticalCountdownEl.textContent = criticalCountdownValue.toString();
  criticalCountdownTimer = window.setInterval(() => {
    criticalCountdownValue = Math.max(0, criticalCountdownValue - 1);
    if (criticalCountdownEl) {
      criticalCountdownEl.textContent = criticalCountdownValue.toString();
    }
    if (criticalCountdownValue === 0) {
      stopCriticalCountdown();
      if (criticalMessageEl) {
        criticalMessageEl.textContent =
          i18n?.t('popup_critical_countdown_final') ??
          'No excuses: close three procrastination tabs now!';
      }
    }
  }, 1000);
}

function stopCriticalCountdown(): void {
  if (criticalCountdownTimer) {
    window.clearInterval(criticalCountdownTimer);
    criticalCountdownTimer = null;
  }
}

function getRandomCriticalMessage(threshold: number): string {
  if (!i18n) {
    return 'Critical focus warning';
  }
  const index = Math.floor(Math.random() * POPUP_CRITICAL_MESSAGE_KEYS.length);
  const template = POPUP_CRITICAL_MESSAGE_KEYS[index];
  if (template.needsThreshold) {
    return i18n.t(template.key, { threshold });
  }
  return i18n.t(template.key);
}

async function triggerReleaseNotes(): Promise<void> {
  if (releaseNotesButton) {
    releaseNotesButton.disabled = true;
    releaseNotesButton.setAttribute('aria-busy', 'true');
  }
  try {
    await sendRuntimeMessage('release-notes', { reset: true });
  } catch (error) {
    console.error(error);
    alert(
      i18n?.t('popup_release_notes_error') ??
        'Não consegui abrir as novidades. Recarregue a extensão e tente de novo.'
    );
  } finally {
    if (releaseNotesButton) {
      releaseNotesButton.disabled = false;
      releaseNotesButton.removeAttribute('aria-busy');
    }
  }
}

async function loadBlogSuggestion(metrics: DailyMetrics): Promise<void> {
  if (!blogSectionEl) {
    return;
  }
  showBlogStatus('popup_blog_loading');
  try {
    const posts = await fetchBlogPosts();
    if (!posts || posts.length === 0) {
      showBlogStatus('popup_blog_empty');
      return;
    }
    const category = inferBlogCategory(metrics);
    const selected = pickPostForCategory(posts, category);
    if (!selected) {
      showBlogStatus('popup_blog_empty');
      return;
    }
    renderBlogRecommendation(selected, category);
  } catch (error) {
    console.error('Failed to load blog recommendation', error);
    showBlogStatus('popup_blog_error');
  }
}

async function fetchBlogPosts(): Promise<BlogPost[] | null> {
  if (cachedBlogPosts) {
    return cachedBlogPosts;
  }
  if (blogFetchPromise) {
    return blogFetchPromise;
  }
  blogFetchPromise = (async () => {
    const sources = [BLOG_INDEX_REMOTE_URL, BLOG_INDEX_FALLBACK_URL];
    for (const source of sources) {
      try {
        const response = await fetch(source, { cache: 'no-store' });
        if (!response.ok) {
          continue;
        }
        const payload = (await response.json()) as { posts?: BlogPost[] };
        if (Array.isArray(payload.posts) && payload.posts.length > 0) {
          cachedBlogPosts = payload.posts;
          return cachedBlogPosts;
        }
      } catch (error) {
        console.warn('Blog index source failed', source, error);
      }
    }
    return null;
  })();
  const result = await blogFetchPromise;
  blogFetchPromise = null;
  return result;
}

function pickPostForCategory(posts: BlogPost[], category: BlogCategory): BlogPost | null {
  const sorted = [...posts].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
  const priorityOrder: BlogCategory[] = [
    category,
    'procrastinacao',
    'foco-atencao',
    'dev-performance',
    'trabalho-remoto'
  ];
  for (const cat of priorityOrder) {
    const match = sorted.find((post) => post.category === cat);
    if (match) {
      return match;
    }
  }
  return sorted[0] ?? null;
}

function inferBlogCategory(metrics: DailyMetrics): BlogCategory {
  const vscodeMs = metrics.vscodeActiveMs ?? 0;
  const productiveMinutes = (metrics.productiveMs + vscodeMs) / 60000;
  const procrastinationMinutes = metrics.procrastinationMs / 60000;
  const inactiveMinutes = metrics.inactiveMs / 60000;
  const focusRate = latestKpis?.focusRate ?? 0;
  const productivityRatio = latestKpis?.productivityRatio ?? 0;

  if (procrastinationMinutes >= productiveMinutes || productivityRatio < 1) {
    return 'procrastinacao';
  }
  if (inactiveMinutes >= 45 || focusRate < 0.55) {
    return 'foco-atencao';
  }
  if (vscodeMs >= 45 * 60000 || productivityRatio >= 1.4) {
    return 'dev-performance';
  }
  return 'trabalho-remoto';
}

function showBlogStatus(key: string): void {
  if (!blogStatusEl) {
    return;
  }
  blogStatusEl.textContent = i18n?.t(key) ?? key;
  blogStatusEl.hidden = false;
  blogContentEl?.setAttribute('hidden', 'true');
  if (blogReadButton) {
    blogReadButton.disabled = true;
  }
  blogSelectedPostUrl = null;
}

function renderBlogRecommendation(post: BlogPost, category: BlogCategory): void {
  if (!blogContentEl) {
    return;
  }
  const localeSuffix = getBlogLocaleSuffix();
  const categoryLabel = getBlogCategoryLabel(category, localeSuffix);
  if (blogCategoryEl) {
    blogCategoryEl.textContent =
      i18n?.t('popup_blog_category_prefix', { category: categoryLabel }) ??
      `Categoria: ${categoryLabel}`;
  }
  if (blogReasonEl) {
    const reasonKey = BLOG_REASON_KEYS[category];
    blogReasonEl.textContent = i18n?.t(reasonKey) ?? '';
  }
  if (blogTitleEl) {
    blogTitleEl.textContent = resolveLocalizedField(post, 'title', localeSuffix) ?? post.title;
  }
  if (blogExcerptEl) {
    blogExcerptEl.textContent =
      resolveLocalizedField(post, 'excerpt', localeSuffix) ?? post.excerpt ?? '';
  }
  if (blogTagsEl) {
    blogTagsEl.innerHTML = '';
    if (Array.isArray(post.tags) && post.tags.length > 0) {
      post.tags.forEach((tag) => {
        const li = document.createElement('li');
        li.textContent = tag;
        blogTagsEl.appendChild(li);
      });
    }
  }

  blogSelectedPostUrl = buildBlogPostUrl(post);
  blogContentEl.removeAttribute('hidden');
  if (blogStatusEl) {
    blogStatusEl.hidden = true;
  }
  if (blogReadButton) {
    blogReadButton.disabled = !blogSelectedPostUrl;
  }
}

function resolveLocalizedField(
  post: BlogPost,
  key: string,
  localeSuffix: 'pt' | 'en' | 'es'
): string | undefined {
  if (localeSuffix === 'pt') {
    return (post[key] as string | undefined) ?? undefined;
  }
  const localizedKey = `${key}_${localeSuffix}`;
  return (post[localizedKey] as string | undefined) ?? (post[key] as string | undefined);
}

function getBlogLocaleSuffix(): 'pt' | 'en' | 'es' {
  const locale = i18n?.locale ?? 'en-US';
  return BLOG_LOCALE_SUFFIX[locale] ?? 'en';
}

function getBlogCategoryLabel(category: BlogCategory, localeSuffix: 'pt' | 'en' | 'es'): string {
  const labels = BLOG_CATEGORY_LABELS[localeSuffix] ?? BLOG_CATEGORY_LABELS.en;
  return labels[category] ?? category;
}

function buildBlogPostUrl(post: BlogPost): string {
  if (post.url.startsWith('http://') || post.url.startsWith('https://')) {
    return post.url;
  }
  const clean = post.url.replace(/^\.\//, '');
  return new URL(clean, BLOG_HOME_URL).toString();
}
