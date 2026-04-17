import {
  DomainCategory,
  ExtensionSettings,
  LocalePreference,
  MlReviewCandidate,
  RuntimeMessageResponse,
  SupportedLocale,
  WorkInterval
} from '../shared/types.js';
import { getDefaultSettings, getDefaultWorkSchedule, getSettings, saveSettings } from '../shared/storage.js';
import { normalizeDomain } from '../shared/utils/domain.js';
import { createI18n, I18nService, resolveLocale, SUPPORTED_LOCALES } from '../shared/i18n.js';
import { buildLearningTokens } from '../shared/domain-classifier.js';
import { translateSuggestionReason } from '../shared/utils/suggestion-reasons.js';
import { getTodayKey } from '../shared/utils/time.js';
import {
  ensureHostPermission,
  ensureLocalhostPermission,
  isLocalhostUrl
} from '../shared/utils/permissions.js';

type DomainListKey = 'productiveDomains' | 'procrastinationDomains';

const weightsForm = document.getElementById('weightsForm') as HTMLFormElement;
const productiveForm = document.getElementById('productiveForm') as HTMLFormElement;
const procrastinationForm = document.getElementById('procrastinationForm') as HTMLFormElement;
const productiveInput = document.getElementById('productiveInput') as HTMLInputElement;
const procrastinationInput = document.getElementById('procrastinationInput') as HTMLInputElement;
const productiveListEl = document.getElementById('productiveList') as HTMLUListElement;
const procrastinationListEl = document.getElementById('procrastinationList') as HTMLUListElement;
const domainFilterInput = document.getElementById('domainFilterInput') as HTMLInputElement | null;
const reviewQueueListEl = document.getElementById(
  'mlReviewQueueList'
) as HTMLUListElement | null;
const reviewQueueEmptyEl = document.getElementById(
  'mlReviewQueueEmpty'
) as HTMLParagraphElement | null;
const blockProcrastinationEl = document.getElementById('blockProcrastination') as HTMLInputElement;
const procrastinationWeightEl = document.getElementById('procrastinationWeight') as HTMLInputElement;
const tabSwitchWeightEl = document.getElementById('tabSwitchWeight') as HTMLInputElement;
const inactivityWeightEl = document.getElementById('inactivityWeight') as HTMLInputElement;
const inactivityThresholdEl = document.getElementById('inactivityThreshold') as HTMLInputElement;
const localeSelectEl = document.getElementById('localeSelect') as HTMLSelectElement;
const openAiKeyInput = document.getElementById('openAiKey') as HTMLInputElement;
const vscodeIntegrationEnabledEl = document.getElementById(
  'vscodeIntegrationEnabled'
) as HTMLInputElement;
const vscodeLocalApiUrlEl = document.getElementById('vscodeLocalApiUrl') as HTMLInputElement;
const vscodePairingKeyEl = document.getElementById('vscodePairingKey') as HTMLInputElement;
const generateVscodeKeyButton = document.getElementById('generateVscodeKey') as HTMLButtonElement;
const copyVscodeKeyButton = document.getElementById('copyVscodeKey') as HTMLButtonElement;
const testVscodeConnectionButton = document.getElementById(
  'testVscodeConnection'
) as HTMLButtonElement;
const vscodeTestStatusEl = document.getElementById('vscodeTestStatus') as HTMLParagraphElement;
const criticalThresholdEl = document.getElementById('criticalThreshold') as HTMLInputElement;
const criticalSoundEnabledEl = document.getElementById('criticalSoundEnabled') as HTMLInputElement;
const holidayAutoEnabledEl = document.getElementById('holidayAutoEnabled') as HTMLInputElement;
const holidayCountryCodeEl = document.getElementById('holidayCountryCode') as HTMLInputElement;
const enableAutoClassificationEl = document.getElementById(
  'enableAutoClassification'
) as HTMLInputElement;
const enableAISuggestionsEl = document.getElementById('enableAISuggestions') as HTMLInputElement;
const suggestionCooldownEl = document.getElementById('suggestionCooldownHours') as HTMLInputElement;
const resetButton = document.getElementById('resetButton') as HTMLButtonElement;
const statusMessageEl = document.getElementById('statusMessage') as HTMLParagraphElement;
const backToPopupButton = document.getElementById('backToPopupButton') as HTMLButtonElement | null;
const workScheduleListEl = document.getElementById('workScheduleList') as HTMLDivElement;
const addWorkIntervalButton = document.getElementById('addWorkIntervalButton') as HTMLButtonElement;
const installVscodeExtensionButton = document.getElementById(
  'installVscodeExtensionButton'
) as HTMLButtonElement | null;
const DEFAULT_VSCODE_URL = 'http://127.0.0.1:3123';
const VSCODE_MARKETPLACE_URL =
  'https://marketplace.visualstudio.com/items?itemName=Donotavio.saul-goodman-vscode';
const NAGER_HOST_PERMISSION = 'https://date.nager.at/*';
const LOCALE_LABELS: Record<SupportedLocale, string> = {
  'pt-BR': 'Português (Brasil)',
  'en-US': 'English (US)',
  'es-419': 'Español',
  fr: 'Français',
  de: 'Deutsch',
  it: 'Italiano',
  tr: 'Türkçe',
  'zh-CN': '中文',
  hi: 'हिन्दी',
  ar: 'العربية',
  bn: 'বাংলা',
  ru: 'Русский',
  ur: 'اردو'
};

let currentSettings: ExtensionSettings | null = null;
let statusTimeout: number | undefined;
let procrastinationHighlightDone = false;
let i18n: I18nService | null = null;
let reviewCandidateList: MlReviewCandidate[] = [];

document.addEventListener('DOMContentLoaded', () => {
  attachListeners();
  void hydrate();
});

function populateLocaleSelect(): void {
  if (!localeSelectEl) return;
  const desired = ['auto', ...SUPPORTED_LOCALES];
  const current = Array.from(localeSelectEl.options).map((opt) => opt.value);
  const shouldRefresh =
    desired.length !== current.length || desired.some((value, index) => current[index] !== value);
  if (!shouldRefresh) return;
  localeSelectEl.textContent = '';
  for (const value of desired) {
    const opt = document.createElement('option');
    opt.value = value;
    if (value === 'auto') {
      opt.setAttribute('data-i18n', 'options_language_auto');
      opt.textContent = translateOrFallback('options_language_auto', 'Automático (navegador)');
    } else {
      opt.textContent = LOCALE_LABELS[value as SupportedLocale] ?? value;
    }
    localeSelectEl.appendChild(opt);
  }
}

function attachListeners(): void {
  weightsForm.addEventListener('submit', (event) => {
    event.preventDefault();
    void handleWeightsSubmit();
  });

  productiveForm.addEventListener('submit', (event) => {
    event.preventDefault();
    void handleDomainSubmit('productiveDomains', productiveInput);
  });

  procrastinationForm.addEventListener('submit', (event) => {
    event.preventDefault();
    void handleDomainSubmit('procrastinationDomains', procrastinationInput);
  });

  localeSelectEl?.addEventListener('change', () => {
    void handleLocaleChange();
  });

  productiveListEl.addEventListener('click', (event) => {
    const target = event.target as HTMLButtonElement;
    if (target?.dataset.domain) {
      void removeDomain('productiveDomains', target.dataset.domain);
    }
  });

  procrastinationListEl.addEventListener('click', (event) => {
    const target = event.target as HTMLButtonElement;
    if (target?.dataset.domain) {
      void removeDomain('procrastinationDomains', target.dataset.domain);
    }
  });

  domainFilterInput?.addEventListener('input', () => {
    renderDomainList('productiveDomains', productiveListEl);
    renderDomainList('procrastinationDomains', procrastinationListEl);
    renderReviewQueue();
  });

  reviewQueueListEl?.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;
    const button = target?.closest('button[data-action]') as HTMLButtonElement | null;
    if (!button?.dataset.domain || !button.dataset.action) {
      return;
    }
    const domain = button.dataset.domain;
    if (button.dataset.action === 'ignore') {
      void handleReviewIgnore(domain);
      return;
    }
    const classification = button.dataset.classification as DomainCategory | undefined;
    if (classification === 'productive' || classification === 'procrastination') {
      void handleReviewApply(domain, classification);
    }
  });

  blockProcrastinationEl?.addEventListener('change', () => {
    if (!currentSettings) {
      return;
    }
    currentSettings.blockProcrastination = blockProcrastinationEl.checked;
    void persistSettings('options_status_blocklist_saved');
  });
  enableAutoClassificationEl?.addEventListener('change', () => {
    if (!currentSettings) {
      return;
    }
    currentSettings.enableAutoClassification = enableAutoClassificationEl.checked;
    void persistSettings('options_status_auto_classification_saved');
  });
  enableAISuggestionsEl?.addEventListener('change', () => {
    if (!currentSettings) {
      return;
    }
    currentSettings.enableAISuggestions = enableAISuggestionsEl.checked;
    void persistSettings('options_status_auto_classification_saved');
  });
  suggestionCooldownEl?.addEventListener('change', () => {
    if (!currentSettings) {
      return;
    }
    const hours = Math.max(1, Number.parseInt(suggestionCooldownEl.value, 10) || 24);
    currentSettings.suggestionCooldownMs = hours * 3600000;
    suggestionCooldownEl.value = hours.toString();
    void persistSettings('options_status_auto_classification_saved');
  });

  resetButton.addEventListener('click', () => {
    const confirmMessage =
      i18n?.t('options_confirm_reset') ?? 'This will restore the default values. Continue?';
    if (!confirm(confirmMessage)) {
      return;
    }
    currentSettings = getDefaultSettings();
    if (currentSettings) {
      currentSettings.locale = resolveLocale(currentSettings.localePreference ?? 'auto');
    }
    void (async () => {
      await persistSettings('options_status_defaults_restored');
      await refreshTranslations();
      renderForms();
    })();
  });

  backToPopupButton?.addEventListener('click', () => {
    returnToPopup();
  });
  installVscodeExtensionButton?.addEventListener('click', () => {
    openExternalLink(VSCODE_MARKETPLACE_URL);
  });
  addWorkIntervalButton.addEventListener('click', () => {
    if (!currentSettings) {
      return;
    }
    const schedule = currentSettings.workSchedule ?? [];
    const nextStart = schedule.length ? schedule[schedule.length - 1].end : '09:00';
    const nextEnd = '10:00';
    currentSettings.workSchedule = sanitizeWorkSchedule([...schedule, { start: nextStart, end: nextEnd }]);
    renderWorkSchedule();
    void persistSettings('options_status_schedule_updated');
  });
  generateVscodeKeyButton?.addEventListener('click', () => {
    const newKey = generatePairingKey();
    if (vscodePairingKeyEl) {
      vscodePairingKeyEl.value = newKey;
    }
    if (currentSettings) {
      currentSettings.vscodePairingKey = newKey;
      void persistSettings('options_vscode_key_generated');
    } else {
      showStatus(newKey);
    }
  });
  copyVscodeKeyButton?.addEventListener('click', () => {
    void copyPairingKey();
  });
  testVscodeConnectionButton?.addEventListener('click', () => {
    void testVscodeConnection();
  });
  vscodeIntegrationEnabledEl?.addEventListener('change', () => {
    void handleVscodeSettingsChange();
  });
  vscodeLocalApiUrlEl?.addEventListener('change', () => {
    void handleVscodeSettingsChange();
  });
  vscodeLocalApiUrlEl?.addEventListener('blur', () => {
    void handleVscodeSettingsChange();
  });
  vscodePairingKeyEl?.addEventListener('change', () => {
    void handleVscodeSettingsChange();
  });
  vscodePairingKeyEl?.addEventListener('blur', () => {
    void handleVscodeSettingsChange();
  });
  criticalThresholdEl?.addEventListener('change', () => {
    void handleCriticalSettingsChange();
  });
  criticalThresholdEl?.addEventListener('blur', () => {
    void handleCriticalSettingsChange();
  });
  criticalSoundEnabledEl?.addEventListener('change', () => {
    void handleCriticalSettingsChange();
  });
  holidayAutoEnabledEl?.addEventListener('change', () => {
    void handleHolidayToggle();
  });
  holidayCountryCodeEl?.addEventListener('change', () => {
    handleHolidayCountryChange();
  });
}

function setVscodeTestStatus(
  messageKey: string,
  fallback: string,
  variant: 'idle' | 'pending' | 'success' | 'error',
  substitutions?: Array<string | number> | Record<string, string | number>
): void {
  if (!vscodeTestStatusEl) {
    return;
  }

  const translated = i18n?.t(messageKey, substitutions);
  const message = translated && translated !== messageKey ? translated : fallback;
  vscodeTestStatusEl.textContent = message;
  vscodeTestStatusEl.classList.remove('pending', 'success', 'error');

  if (variant !== 'idle') {
    vscodeTestStatusEl.classList.add('visible');
  } else {
    vscodeTestStatusEl.classList.remove('visible');
  }

  if (variant !== 'idle') {
    vscodeTestStatusEl.classList.add(variant);
  }
}

async function testVscodeConnection(): Promise<void> {
  if (!testVscodeConnectionButton) {
    return;
  }

  if (!vscodeIntegrationEnabledEl?.checked) {
    setVscodeTestStatus(
      'options_vscode_test_disabled',
      'Ative a integração com VS Code antes de testar.',
      'error'
    );
    return;
  }

  const baseUrl = (vscodeLocalApiUrlEl?.value.trim() || DEFAULT_VSCODE_URL).trim();
  const pairingKey = vscodePairingKeyEl?.value.trim() ?? '';

  if (!isLocalhostUrl(baseUrl)) {
    setVscodeTestStatus(
      'options_vscode_test_invalid_url',
      'URL inválida. Use algo como http://127.0.0.1:3123.',
      'error'
    );
    return;
  }

  if (!(await ensureLocalhostPermission())) {
    setVscodeTestStatus(
      'options_vscode_permission_denied',
      'Permissão para acessar o SaulDaemon negada.',
      'error'
    );
    return;
  }

  let summaryUrl: URL;
  let healthUrl: URL;
  try {
    summaryUrl = new URL('/v1/tracking/vscode/summary', baseUrl);
    healthUrl = new URL('/health', baseUrl);
  } catch {
    setVscodeTestStatus(
      'options_vscode_test_invalid_url',
      'URL inválida. Use algo como http://127.0.0.1:3123.',
      'error'
    );
    return;
  }

  setVscodeTestStatus('options_vscode_test_running', 'Testando conexão...', 'pending');

  testVscodeConnectionButton.disabled = true;
  testVscodeConnectionButton.setAttribute('aria-busy', 'true');

  const fetchWithTimeout = async (url: URL) => {
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), 4000);
    try {
      return await fetch(url.toString(), { signal: ctrl.signal });
    } finally {
      window.clearTimeout(timer);
    }
  };

  try {
    if (!pairingKey) {
      setVscodeTestStatus(
        'options_vscode_test_missing_key',
        'Preencha a chave de pareamento antes de testar.',
        'error'
      );
      return;
    }

    // 1. Health probe
    try {
      const healthResponse = await fetchWithTimeout(healthUrl);
      if (!healthResponse.ok) {
        const reason = `status ${healthResponse.status}`;
        setVscodeTestStatus(
          'options_vscode_test_health_error',
          `Falha ao acessar ${healthUrl.origin}/health (${reason}).`,
          'error',
          { reason, origin: healthUrl.origin }
        );
        return;
      }
    } catch (error) {
      if ((error as DOMException)?.name === 'AbortError') {
        setVscodeTestStatus(
          'options_vscode_test_timeout',
          'SaulDaemon não respondeu a tempo.',
          'error'
        );
      } else {
        const reason = (error as Error)?.message ?? 'erro desconhecido';
        setVscodeTestStatus(
          'options_vscode_test_health_error',
          `Falha ao acessar ${healthUrl.origin}/health (${reason}).`,
          'error',
          { reason, origin: healthUrl.origin }
        );
      }
      return;
    }

    // 2. Summary with key
    summaryUrl.searchParams.set('date', getTodayKey());
    summaryUrl.searchParams.set('key', pairingKey);

    let response: Response;
    try {
      response = await fetchWithTimeout(summaryUrl);
    } catch (error) {
      if ((error as DOMException)?.name === 'AbortError') {
        setVscodeTestStatus(
          'options_vscode_test_timeout',
          'SaulDaemon não respondeu a tempo.',
          'error'
        );
      } else {
        const reason = (error as Error)?.message ?? 'erro desconhecido';
        setVscodeTestStatus(
          'options_vscode_test_error',
          `Falha ao conectar ao SaulDaemon (${reason}).`,
          'error',
          { reason }
        );
      }
      return;
    }

    if (response.status === 401) {
      setVscodeTestStatus(
        'options_vscode_test_unauthorized',
        'Chave incorreta. Ajuste para a mesma chave usada no VS Code.',
        'error'
      );
      return;
    }

    if (!response.ok) {
      const reason = `status ${response.status}`;
      setVscodeTestStatus(
        'options_vscode_test_error',
        `Falha ao conectar ao SaulDaemon (${reason}).`,
        'error',
        { reason }
      );
      return;
    }

    const summary = (await response.json()) as {
      totalActiveMs?: number;
      sessions?: number;
      switches?: number;
    };

    setVscodeTestStatus(
      'options_vscode_test_success',
      `SaulDaemon respondeu em ${summaryUrl.origin}.`,
      'success',
      {
        origin: summaryUrl.origin,
        sessions: summary?.sessions ?? 0,
        minutes: Math.round((summary?.totalActiveMs ?? 0) / 60000)
      }
    );
  } finally {
    testVscodeConnectionButton.disabled = false;
    testVscodeConnectionButton.removeAttribute('aria-busy');
    if (vscodeTestStatusEl && !vscodeTestStatusEl.classList.contains('visible')) {
      vscodeTestStatusEl.classList.add('visible');
    }
  }
}

async function hydrate(): Promise<void> {
  currentSettings = await getSettings();
  await refreshTranslations();
  populateLocaleSelect();
  renderForms();
  await loadSuggestions();
  if (window.location.hash === '#vilains' && !procrastinationHighlightDone) {
    focusProcrastinationSection();
    procrastinationHighlightDone = true;
  }
}

function renderForms(): void {
  if (!currentSettings) {
    return;
  }

  procrastinationWeightEl.value = currentSettings.weights.procrastinationWeight.toString();
  tabSwitchWeightEl.value = currentSettings.weights.tabSwitchWeight.toString();
  inactivityWeightEl.value = currentSettings.weights.inactivityWeight.toString();
  inactivityThresholdEl.value = Math.round(currentSettings.inactivityThresholdMs / 1000).toString();
  if (localeSelectEl) {
    localeSelectEl.value = currentSettings.localePreference ?? 'auto';
  }
  openAiKeyInput.value = currentSettings.openAiKey ?? '';
  if (vscodeIntegrationEnabledEl) {
    vscodeIntegrationEnabledEl.checked = Boolean(currentSettings.vscodeIntegrationEnabled);
  }
  if (vscodeLocalApiUrlEl) {
    vscodeLocalApiUrlEl.value =
      currentSettings.vscodeLocalApiUrl && currentSettings.vscodeLocalApiUrl.trim().length > 0
        ? currentSettings.vscodeLocalApiUrl
        : DEFAULT_VSCODE_URL;
  }
  if (vscodePairingKeyEl) {
    vscodePairingKeyEl.value = currentSettings.vscodePairingKey ?? '';
  }
  criticalThresholdEl.value = (
    currentSettings.criticalScoreThreshold ?? 90
  ).toString();
  criticalSoundEnabledEl.checked = Boolean(currentSettings.criticalSoundEnabled);
  if (holidayAutoEnabledEl) {
    holidayAutoEnabledEl.checked = Boolean(currentSettings.holidayAutoEnabled);
  }
  if (holidayCountryCodeEl) {
    holidayCountryCodeEl.value = (currentSettings.holidayCountryCode ?? '').toUpperCase();
  }
  if (blockProcrastinationEl) {
    blockProcrastinationEl.checked = Boolean(currentSettings.blockProcrastination);
  }
  if (enableAutoClassificationEl) {
    enableAutoClassificationEl.checked = Boolean(currentSettings.enableAutoClassification);
  }
  if (enableAISuggestionsEl) {
    enableAISuggestionsEl.checked = Boolean(currentSettings.enableAISuggestions);
    enableAISuggestionsEl.disabled = true;
  }
  if (suggestionCooldownEl) {
    const hours = Math.round((currentSettings.suggestionCooldownMs ?? 86_400_000) / 3600000);
    suggestionCooldownEl.value = hours.toString();
  }
  renderWorkSchedule();

  renderDomainList('productiveDomains', productiveListEl);
  renderDomainList('procrastinationDomains', procrastinationListEl);
  renderReviewQueue();
}

function translateOrFallback(key: string, fallback: string): string {
  const translated = i18n?.t(key);
  if (!translated || translated === key) {
    return fallback;
  }
  return translated;
}

function getDomainFilter(): string {
  return (domainFilterInput?.value ?? '').trim().toLowerCase();
}

function renderDomainList(key: DomainListKey, container: HTMLUListElement): void {
  if (!currentSettings) {
    return;
  }

  container.innerHTML = '';
  const domains = currentSettings[key];
  const filter = getDomainFilter();
  const visibleDomains = filter
    ? domains.filter((domain) => domain.toLowerCase().includes(filter))
    : domains;

  if (!visibleDomains.length) {
    if (!filter) {
      const li = document.createElement('li');
      li.textContent = translateOrFallback('options_domain_empty', 'No domains yet.');
      container.appendChild(li);
    }
    return;
  }

  for (const domain of visibleDomains) {
    const li = document.createElement('li');
    li.textContent = domain;
    const button = document.createElement('button');
    button.textContent = translateOrFallback('options_domain_remove', 'Remove');
    button.dataset.domain = domain;
    li.appendChild(button);
    container.appendChild(li);
  }
}

async function handleWeightsSubmit(): Promise<void> {
  if (!currentSettings) {
    return;
  }

  const procrastinationWeight = parseFloat(procrastinationWeightEl.value);
  const tabSwitchWeight = parseFloat(tabSwitchWeightEl.value);
  const inactivityWeight = parseFloat(inactivityWeightEl.value);
  const sum = procrastinationWeight + tabSwitchWeight + inactivityWeight;

  if (Math.abs(sum - 1) > 0.01) {
    showStatus(i18n?.t('options_weights_sum_error') ?? 'A soma dos pesos precisa ser 1.', true);
    return;
  }

  currentSettings.weights = {
    procrastinationWeight,
    tabSwitchWeight,
    inactivityWeight
  };

  const thresholdSeconds = Math.max(10, parseInt(inactivityThresholdEl.value, 10));
  currentSettings.inactivityThresholdMs = thresholdSeconds * 1000;
  currentSettings.openAiKey = openAiKeyInput.value.trim();
  updateVscodeSettingsFromInputs();
  updateCriticalSettingsFromInputs();
  currentSettings.workSchedule = sanitizeWorkSchedule(currentSettings.workSchedule);
  await persistSettings('options_status_weights_saved');
}

function bumpLearningFromDomain(domain: string, category: DomainCategory): void {
  if (!currentSettings) {
    return;
  }
  const learning = currentSettings.learningSignals ?? { version: 1, tokens: {} };
  const now = Date.now();
  const tokens = buildLearningTokens({
    hostname: domain,
    hasInfiniteScroll: false,
    hasVideoPlayer: false
  });

  for (const token of tokens) {
    const stat = learning.tokens[token] ?? { productive: 0, procrastination: 0, lastUpdated: now };
    if (category === 'productive') {
      stat.productive += 1;
    } else if (category === 'procrastination') {
      stat.procrastination += 1;
    }
    stat.lastUpdated = now;
    learning.tokens[token] = stat;
  }

  const entries = Object.entries(learning.tokens);
  const MAX_LEARNING_TOKENS = 5000;
  if (entries.length > MAX_LEARNING_TOKENS) {
    entries
      .sort(([, a], [, b]) => (a.lastUpdated ?? 0) - (b.lastUpdated ?? 0))
      .slice(0, entries.length - MAX_LEARNING_TOKENS)
      .forEach(([token]) => delete learning.tokens[token]);
  }

  currentSettings.learningSignals = learning;
}

async function handleDomainSubmit(key: DomainListKey, input: HTMLInputElement): Promise<void> {
  if (!currentSettings) {
    return;
  }

  const rawValue = input.value.trim();
  if (!rawValue) {
    return;
  }

  const normalized = normalizeDomain(rawValue);
  if (!normalized) {
    showStatus(i18n?.t('options_domain_invalid') ?? 'Enter a valid domain.', true);
    return;
  }

  const domains = currentSettings[key];
  if (domains.includes(normalized)) {
    showStatus(i18n?.t('options_domain_duplicate') ?? 'Domain already listed.', true);
    input.value = '';
    return;
  }

  domains.push(normalized);
  domains.sort();
  const category: DomainCategory = key === 'productiveDomains' ? 'productive' : 'procrastination';
  bumpLearningFromDomain(normalized, category);
  input.value = '';
  renderDomainList(key, key === 'productiveDomains' ? productiveListEl : procrastinationListEl);
  renderReviewQueue();
  await persistSettings('options_status_list_updated');
  chrome.runtime.sendMessage({
    type: 'record-explicit-feedback',
    payload: {
      domain: normalized,
      classification: category
    }
  }).catch((error) => {
    console.warn('[options] Falha ao registrar feedback explicito do modelo:', error);
  });
}

async function removeDomain(key: DomainListKey, domain: string): Promise<void> {
  if (!currentSettings) {
    return;
  }

  currentSettings[key] = currentSettings[key].filter((item) => item !== domain);
  renderDomainList(key, key === 'productiveDomains' ? productiveListEl : procrastinationListEl);
  renderReviewQueue();
  await persistSettings('options_status_domain_removed');
}

async function loadSuggestions(): Promise<void> {
  try {
    const response = (await chrome.runtime.sendMessage({
      type: 'metrics-request'
    })) as { ok?: boolean; data?: RuntimeMessageResponse; error?: string } | undefined;
    if (!response?.ok || !response.data) {
      reviewCandidateList = [];
      renderReviewQueue();
      return;
    }
    reviewCandidateList = buildReviewCandidateList(response.data);
    renderReviewQueue();
  } catch (error) {
    console.warn('[options] Falha ao carregar sugestões:', error);
  }
}

function buildReviewCandidateList(data: RuntimeMessageResponse): MlReviewCandidate[] {
  const seen = new Set<string>();
  const deduped: MlReviewCandidate[] = [];
  for (const entry of data.reviewCandidates ?? []) {
    const key = entry.domain.trim().toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(entry);
  }
  return deduped;
}

function renderReviewQueue(): void {
  if (!reviewQueueListEl) {
    return;
  }

  reviewQueueListEl.innerHTML = '';
  const filter = getDomainFilter();
  const classified = new Set<string>([
    ...(currentSettings?.productiveDomains ?? []),
    ...(currentSettings?.procrastinationDomains ?? [])
  ]);
  reviewCandidateList.forEach((candidate) => {
    if (classified.has(candidate.domain)) {
      return;
    }
    if (filter && !candidate.domain.toLowerCase().includes(filter)) {
      return;
    }
    reviewQueueListEl.appendChild(buildReviewQueueItem(candidate));
  });

  if (reviewQueueEmptyEl) {
    reviewQueueEmptyEl.classList.toggle('visible', reviewQueueListEl.childElementCount === 0);
  }
}

function buildReviewQueueItem(candidate: MlReviewCandidate): HTMLLIElement {
  const item = document.createElement('li');
  item.className = 'review-queue-item';
  const header = document.createElement('div');
  header.className = 'recommendation-header';

  const headerLeft = document.createElement('div');
  headerLeft.className = 'recommendation-header-left';

  const labelMap: Record<DomainCategory, string> = {
    productive: i18n?.t('popup_suggestion_label_productive') ?? 'PRODUTIVO',
    procrastination: i18n?.t('popup_suggestion_label_procrastination') ?? 'PROCRASTINADOR',
    neutral: i18n?.t('popup_suggestion_label_neutral') ?? 'NEUTRO'
  };

  const classificationEl = document.createElement('span');
  classificationEl.className = `recommendation-classification ${candidate.suggestedClassification}`;
  classificationEl.textContent = labelMap[candidate.suggestedClassification];

  const domainEl = document.createElement('span');
  domainEl.className = 'recommendation-domain';
  domainEl.textContent = candidate.domain;

  headerLeft.appendChild(classificationEl);
  headerLeft.appendChild(domainEl);

  const confidenceEl = document.createElement('span');
  confidenceEl.className = 'recommendation-confidence';
  confidenceEl.textContent = `${Math.round(candidate.probability * 100)}%`;

  header.appendChild(headerLeft);
  header.appendChild(confidenceEl);
  item.appendChild(header);

  const meta = document.createElement('div');
  meta.className = 'review-queue-meta';
  meta.appendChild(buildMetaChip(describeQueueReason(candidate.queueReason)));
  meta.appendChild(buildMetaChip(`INCERTEZA ${Math.round(candidate.uncertainty * 100)}%`));
  item.appendChild(meta);

  const reasonsList = document.createElement('ul');
  reasonsList.className = 'recommendation-reasons';
  candidate.reasons.slice(0, 3).forEach((reason) => {
    const li = document.createElement('li');
    li.textContent = translateSuggestionReason(reason, i18n);
    reasonsList.appendChild(li);
  });
  item.appendChild(reasonsList);

  const actions = document.createElement('div');
  actions.className = 'review-queue-actions';
  actions.appendChild(buildReviewActionButton(
    i18n?.t('popup_suggestion_add_productive') ?? 'Produtivo',
    'apply',
    candidate.domain,
    'productive',
    'primary'
  ));
  actions.appendChild(buildReviewActionButton(
    i18n?.t('popup_suggestion_add_procrastination') ?? 'Procrastinador',
    'apply',
    candidate.domain,
    'procrastination',
    'danger'
  ));
  actions.appendChild(buildReviewActionButton(
    i18n?.t('popup_suggestion_ignore') ?? 'Ignorar',
    'ignore',
    candidate.domain
  ));
  item.appendChild(actions);

  return item;
}

function buildMetaChip(label: string): HTMLSpanElement {
  const chip = document.createElement('span');
  chip.className = 'review-queue-chip';
  chip.textContent = label;
  return chip;
}

function buildReviewActionButton(
  label: string,
  action: 'apply' | 'ignore',
  domain: string,
  classification?: 'productive' | 'procrastination',
  tone?: 'primary' | 'danger'
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.action = action;
  button.dataset.domain = domain;
  if (classification) {
    button.dataset.classification = classification;
  }
  if (tone) {
    button.classList.add(tone);
  }
  button.textContent = label;
  return button;
}

function describeQueueReason(reason: MlReviewCandidate['queueReason']): string {
  if (reason === 'threshold_borderline') {
    return 'BORDA DO THRESHOLD';
  }
  return 'UNCERTAINTY SAMPLING';
}

async function handleReviewApply(
  domain: string,
  classification: 'productive' | 'procrastination'
): Promise<void> {
  await chrome.runtime.sendMessage({
    type: 'apply-suggestion',
    payload: { domain, classification }
  });
  await hydrate();
}

async function handleReviewIgnore(domain: string): Promise<void> {
  await chrome.runtime.sendMessage({
    type: 'ignore-suggestion',
    payload: { domain }
  });
  await hydrate();
}

async function persistSettings(messageKey: string): Promise<void> {
  if (!currentSettings) {
    return;
  }

  await saveSettings(currentSettings);
  showStatus(i18n?.t(messageKey) ?? messageKey);
  chrome.runtime.sendMessage({ type: 'settings-updated' }).catch((error) => {
    console.warn('[options] Falha ao notificar background script:', error);
  });
}

function showStatus(message: string, isError = false): void {
  if (!statusMessageEl) {
    return;
  }

  statusMessageEl.textContent = message;
  statusMessageEl.classList.toggle('error', isError);
  statusMessageEl.classList.add('visible');

  if (statusTimeout) {
    window.clearTimeout(statusTimeout);
  }
  statusTimeout = window.setTimeout(() => {
    statusMessageEl.classList.remove('visible');
  }, 4000);
}

function focusProcrastinationSection(): void {
  procrastinationListEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  procrastinationListEl.classList.add('highlighted');
  window.setTimeout(() => {
    procrastinationListEl.classList.remove('highlighted');
  }, 3000);
}

function renderWorkSchedule(): void {
  if (!currentSettings) {
    return;
  }

  if (!currentSettings.workSchedule || !currentSettings.workSchedule.length) {
    currentSettings.workSchedule = getDefaultWorkSchedule();
  }

  const schedule = currentSettings.workSchedule;
  workScheduleListEl.innerHTML = '';

  schedule.forEach((interval, index) => {
    const row = document.createElement('div');
    row.className = 'schedule-row';

    const startInput = document.createElement('input');
    startInput.type = 'time';
    startInput.value = interval.start ?? '08:00';
    startInput.addEventListener('change', () => {
      updateScheduleInterval(index, { start: startInput.value, end: endInput.value });
    });

    const endInput = document.createElement('input');
    endInput.type = 'time';
    endInput.value = interval.end ?? '10:00';
    endInput.addEventListener('change', () => {
      updateScheduleInterval(index, { start: startInput.value, end: endInput.value });
    });

    const toLabel = document.createElement('span');
    toLabel.className = 'to-label';
    toLabel.textContent = translateOrFallback('options_schedule_to', 'to');

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.textContent = translateOrFallback('options_domain_remove', 'Remove');
    removeButton.disabled = schedule.length <= 1;
    removeButton.addEventListener('click', () => {
      removeScheduleInterval(index);
    });

    row.appendChild(startInput);
    row.appendChild(toLabel);
    row.appendChild(endInput);
    row.appendChild(removeButton);
    workScheduleListEl.appendChild(row);
  });
}

function updateScheduleInterval(index: number, interval: WorkInterval): void {
  if (!currentSettings?.workSchedule) {
    return;
  }
  currentSettings.workSchedule[index] = interval;
  currentSettings.workSchedule = sanitizeWorkSchedule(currentSettings.workSchedule);
  renderWorkSchedule();
  void persistSettings('options_status_schedule_updated');
}

function removeScheduleInterval(index: number): void {
  if (!currentSettings?.workSchedule) {
    return;
  }
  if (currentSettings.workSchedule.length <= 1) {
    return;
  }
  currentSettings.workSchedule.splice(index, 1);
  currentSettings.workSchedule = sanitizeWorkSchedule(currentSettings.workSchedule);
  renderWorkSchedule();
  void persistSettings('options_status_schedule_updated');
}

function sanitizeWorkSchedule(schedule?: WorkInterval[]): WorkInterval[] {
  const normalized = (schedule ?? [])
    .map((interval) => ({
      start: interval.start ?? '',
      end: interval.end ?? ''
    }))
    .filter((interval) => isValidTime(interval.start) && isValidTime(interval.end));

  if (!normalized.length) {
    return getDefaultWorkSchedule();
  }

  return normalized;
}

function isValidTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

async function refreshTranslations(): Promise<void> {
  const preference = currentSettings?.localePreference ?? 'auto';
  i18n = await createI18n(preference);
  i18n.apply();
}

async function handleLocaleChange(): Promise<void> {
  if (!currentSettings || !localeSelectEl) {
    return;
  }
  const preference = (localeSelectEl.value as LocalePreference) ?? 'auto';
  currentSettings.localePreference = preference;
  currentSettings.locale = resolveLocale(preference);
  await persistSettings('options_status_language_saved');
  await refreshTranslations();
  renderForms();
}

async function handleHolidayToggle(): Promise<void> {
  if (!currentSettings || !holidayAutoEnabledEl) {
    return;
  }
  if (holidayAutoEnabledEl.checked) {
    const granted = await ensureHostPermission(NAGER_HOST_PERMISSION);
    if (!granted) {
      holidayAutoEnabledEl.checked = false;
      currentSettings.holidayAutoEnabled = false;
      showStatus('Permissão para consultar feriados negada.', true);
      return;
    }
  }
  currentSettings.holidayAutoEnabled = holidayAutoEnabledEl.checked;
  await persistSettings('options_status_holiday_saved');
}

function handleHolidayCountryChange(): void {
  if (!currentSettings || !holidayCountryCodeEl) {
    return;
  }
  const raw = holidayCountryCodeEl.value.trim().toUpperCase();
  if (raw && !/^[A-Z]{2}$/.test(raw)) {
    showStatus(
      i18n?.t('options_holiday_country_error') ?? 'Informe apenas duas letras, ex.: BR.',
      true
    );
    holidayCountryCodeEl.value = (currentSettings.holidayCountryCode ?? '').toUpperCase();
    return;
  }
  currentSettings.holidayCountryCode = raw;
  void persistSettings('options_status_holiday_saved');
}

function returnToPopup(): void {
  // Mirror report behavior: simplesmente fecha a aba atual.
  closeCurrentTab();
}

function generatePairingKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `sg-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}

function updateVscodeSettingsFromInputs(): void {
  if (!currentSettings) {
    return;
  }
  if (vscodeIntegrationEnabledEl) {
    currentSettings.vscodeIntegrationEnabled = Boolean(vscodeIntegrationEnabledEl.checked);
  }
  if (vscodeLocalApiUrlEl) {
    const url = vscodeLocalApiUrlEl.value.trim();
    const sanitized = url.length > 0 ? url : DEFAULT_VSCODE_URL;
    currentSettings.vscodeLocalApiUrl = sanitized;
    if (url.length === 0) {
      vscodeLocalApiUrlEl.value = sanitized;
    }
  }
  if (vscodePairingKeyEl) {
    const key = vscodePairingKeyEl.value.trim();
    currentSettings.vscodePairingKey = key.length > 0 ? key : '';
  }
}

async function handleVscodeSettingsChange(): Promise<void> {
  if (!currentSettings) {
    return;
  }
  const previousUrl = currentSettings.vscodeLocalApiUrl;
  updateVscodeSettingsFromInputs();
  const baseUrl = currentSettings.vscodeLocalApiUrl?.trim() ?? '';
  if (baseUrl && !isLocalhostUrl(baseUrl)) {
    showStatus(
      i18n?.t('options_vscode_test_invalid_url') ??
        'URL inválida. Use algo como http://127.0.0.1:3123.',
      true
    );
    currentSettings.vscodeLocalApiUrl = previousUrl ?? DEFAULT_VSCODE_URL;
    if (vscodeLocalApiUrlEl) {
      vscodeLocalApiUrlEl.value = currentSettings.vscodeLocalApiUrl ?? DEFAULT_VSCODE_URL;
    }
    currentSettings.vscodeIntegrationEnabled = false;
    if (vscodeIntegrationEnabledEl) {
      vscodeIntegrationEnabledEl.checked = false;
    }
  } else if (currentSettings.vscodeIntegrationEnabled) {
    if (!(await ensureLocalhostPermission())) {
      showStatus('Permissão para acessar o SaulDaemon negada.', true);
      currentSettings.vscodeIntegrationEnabled = false;
      if (vscodeIntegrationEnabledEl) {
        vscodeIntegrationEnabledEl.checked = false;
      }
    }
  }
  await persistSettings('options_status_vscode_saved');
}

function updateCriticalSettingsFromInputs(): void {
  if (!currentSettings) {
    return;
  }
  if (criticalThresholdEl) {
    const raw = parseInt(criticalThresholdEl.value, 10);
    const sanitized = Number.isFinite(raw) ? Math.min(100, Math.max(0, raw)) : 0;
    criticalThresholdEl.value = sanitized.toString();
    currentSettings.criticalScoreThreshold = sanitized;
  }
  if (criticalSoundEnabledEl) {
    currentSettings.criticalSoundEnabled = Boolean(criticalSoundEnabledEl.checked);
  }
}

async function handleCriticalSettingsChange(): Promise<void> {
  if (!currentSettings) {
    return;
  }
  updateCriticalSettingsFromInputs();
  await persistSettings('options_status_critical_saved');
}

async function copyPairingKey(): Promise<void> {
  const value = vscodePairingKeyEl?.value?.trim() ?? '';
  if (!value) {
    showStatus(i18n?.t('options_vscode_key_copy_error') ?? 'Nenhuma chave para copiar.', true);
    return;
  }
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = value;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    showStatus(i18n?.t('options_vscode_key_copied') ?? 'Chave copiada.');
  } catch {
    showStatus(i18n?.t('options_vscode_key_copy_error') ?? 'Falha ao copiar a chave.', true);
  }
}

function openExternalLink(url: string): void {
  if (chrome?.tabs?.create) {
    void chrome.tabs.create({ url });
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

function closeCurrentTab(): void {
  if (!chrome?.tabs?.getCurrent) {
    window.close();
    return;
  }

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
}
