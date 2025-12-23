import { ExtensionSettings, LocalePreference, WorkInterval } from '../shared/types.js';
import { getDefaultSettings, getDefaultWorkSchedule, getSettings, saveSettings } from '../shared/storage.js';
import { normalizeDomain } from '../shared/utils/domain.js';
import { createI18n, I18nService, resolveLocale } from '../shared/i18n.js';

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
const criticalThresholdEl = document.getElementById('criticalThreshold') as HTMLInputElement;
const criticalSoundEnabledEl = document.getElementById('criticalSoundEnabled') as HTMLInputElement;
const resetButton = document.getElementById('resetButton') as HTMLButtonElement;
const statusMessageEl = document.getElementById('statusMessage') as HTMLParagraphElement;
const backToPopupButton = document.getElementById('backToPopupButton') as HTMLButtonElement | null;
const workScheduleListEl = document.getElementById('workScheduleList') as HTMLDivElement;
const addWorkIntervalButton = document.getElementById('addWorkIntervalButton') as HTMLButtonElement;

let currentSettings: ExtensionSettings | null = null;
let statusTimeout: number | undefined;
let procrastinationHighlightDone = false;
let i18n: I18nService | null = null;

document.addEventListener('DOMContentLoaded', () => {
  attachListeners();
  void hydrate();
});

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
}

async function hydrate(): Promise<void> {
  currentSettings = await getSettings();
  await refreshTranslations();
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
        : 'http://127.0.0.1:3123';
  }
  if (vscodePairingKeyEl) {
    vscodePairingKeyEl.value = currentSettings.vscodePairingKey ?? '';
  }
  criticalThresholdEl.value = (
    currentSettings.criticalScoreThreshold ?? 90
  ).toString();
  criticalSoundEnabledEl.checked = Boolean(currentSettings.criticalSoundEnabled);
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
  if (vscodeIntegrationEnabledEl) {
    currentSettings.vscodeIntegrationEnabled = vscodeIntegrationEnabledEl.checked;
  }
  if (vscodeLocalApiUrlEl) {
    const url = vscodeLocalApiUrlEl.value.trim();
    currentSettings.vscodeLocalApiUrl = url.length > 0 ? url : 'http://127.0.0.1:3123';
  }
  if (vscodePairingKeyEl) {
    const key = vscodePairingKeyEl.value.trim();
    currentSettings.vscodePairingKey = key.length > 0 ? key : '';
  }
  currentSettings.criticalScoreThreshold = Math.min(
    100,
    Math.max(0, parseInt(criticalThresholdEl.value, 10))
  );
  currentSettings.criticalSoundEnabled = criticalSoundEnabledEl.checked;
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
  chrome.runtime.sendMessage({ type: 'settings-updated' }).catch(() => {});
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

function returnToPopup(): void {
  const popupUrl = chrome.runtime.getURL('src/popup/popup.html');
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
