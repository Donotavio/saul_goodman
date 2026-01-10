import { ExtensionSettings, LocalePreference, SupportedLocale, WorkInterval } from '../shared/types.js';
import { getDefaultSettings, getDefaultWorkSchedule, getSettings, saveSettings } from '../shared/storage.js';
import { normalizeDomain } from '../shared/utils/domain.js';
import { createI18n, I18nService, resolveLocale, SUPPORTED_LOCALES } from '../shared/i18n.js';

type DomainListKey = 'productiveDomains' | 'procrastinationDomains';

const weightsForm = document.getElementById('weightsForm') as HTMLFormElement;
const productiveForm = document.getElementById('productiveForm') as HTMLFormElement;
const procrastinationForm = document.getElementById('procrastinationForm') as HTMLFormElement;
const productiveInput = document.getElementById('productiveInput') as HTMLInputElement;
const procrastinationInput = document.getElementById('procrastinationInput') as HTMLInputElement;
const productiveListEl = document.getElementById('productiveList') as HTMLUListElement;
const procrastinationListEl = document.getElementById('procrastinationList') as HTMLUListElement;
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
  localeSelectEl.innerHTML = desired
    .map((value) => {
      if (value === 'auto') {
        return `<option value="auto" data-i18n="options_language_auto">${translateOrFallback(
          'options_language_auto',
          'Automático (navegador)'
        )}</option>`;
      }
      const label = LOCALE_LABELS[value as SupportedLocale] ?? value;
      return `<option value="${value}">${label}</option>`;
    })
    .join('');
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

  blockProcrastinationEl?.addEventListener('change', () => {
    if (!currentSettings) {
      return;
    }
    currentSettings.blockProcrastination = blockProcrastinationEl.checked;
    void persistSettings('options_status_blocklist_saved');
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
    if (!currentSettings) {
      return;
    }
    currentSettings.holidayAutoEnabled = holidayAutoEnabledEl.checked;
    void persistSettings('options_status_holiday_saved');
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

  const message = i18n?.t(messageKey, substitutions) ?? fallback;
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

function getTodayKey(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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
  renderWorkSchedule();

  renderDomainList('productiveDomains', productiveListEl);
  renderDomainList('procrastinationDomains', procrastinationListEl);
}

function translateOrFallback(key: string, fallback: string): string {
  const translated = i18n?.t(key);
  if (!translated || translated === key) {
    return fallback;
  }
  return translated;
}

function renderDomainList(key: DomainListKey, container: HTMLUListElement): void {
  if (!currentSettings) {
    return;
  }

  container.innerHTML = '';
  const domains = currentSettings[key];

  if (!domains.length) {
    const li = document.createElement('li');
    li.textContent = translateOrFallback('options_domain_empty', 'No domains yet.');
    container.appendChild(li);
    return;
  }

  for (const domain of domains) {
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
  input.value = '';
  renderDomainList(key, key === 'productiveDomains' ? productiveListEl : procrastinationListEl);
  await persistSettings('options_status_list_updated');
}

async function removeDomain(key: DomainListKey, domain: string): Promise<void> {
  if (!currentSettings) {
    return;
  }

  currentSettings[key] = currentSettings[key].filter((item) => item !== domain);
  renderDomainList(key, key === 'productiveDomains' ? productiveListEl : procrastinationListEl);
  await persistSettings('options_status_domain_removed');
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
  const popupUrl = chrome.runtime.getURL('src/popup/popup.html');
  if (!chrome?.tabs?.create) {
    window.location.href = popupUrl;
    return;
  }
  chrome.tabs.create({ url: popupUrl }, () => {
    if (chrome.runtime.lastError) {
      window.location.href = popupUrl;
      return;
    }
    closeCurrentTab();
  });
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
  updateVscodeSettingsFromInputs();
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
