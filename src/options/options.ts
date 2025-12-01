import { ExtensionSettings, WorkInterval } from '../shared/types.js';
import { getDefaultSettings, getDefaultWorkSchedule, getSettings, saveSettings } from '../shared/storage.js';
import { normalizeDomain } from '../shared/utils/domain.js';

type DomainListKey = 'productiveDomains' | 'procrastinationDomains';

const weightsForm = document.getElementById('weightsForm') as HTMLFormElement;
const productiveForm = document.getElementById('productiveForm') as HTMLFormElement;
const procrastinationForm = document.getElementById('procrastinationForm') as HTMLFormElement;
const productiveInput = document.getElementById('productiveInput') as HTMLInputElement;
const procrastinationInput = document.getElementById('procrastinationInput') as HTMLInputElement;
const productiveListEl = document.getElementById('productiveList') as HTMLUListElement;
const procrastinationListEl = document.getElementById('procrastinationList') as HTMLUListElement;
const procrastinationWeightEl = document.getElementById('procrastinationWeight') as HTMLInputElement;
const tabSwitchWeightEl = document.getElementById('tabSwitchWeight') as HTMLInputElement;
const inactivityWeightEl = document.getElementById('inactivityWeight') as HTMLInputElement;
const inactivityThresholdEl = document.getElementById('inactivityThreshold') as HTMLInputElement;
const openAiKeyInput = document.getElementById('openAiKey') as HTMLInputElement;
const criticalThresholdEl = document.getElementById('criticalThreshold') as HTMLInputElement;
const resetButton = document.getElementById('resetButton') as HTMLButtonElement;
const statusMessageEl = document.getElementById('statusMessage') as HTMLParagraphElement;
const backToPopupButton = document.getElementById('backToPopupButton') as HTMLButtonElement | null;
const workScheduleListEl = document.getElementById('workScheduleList') as HTMLDivElement;
const addWorkIntervalButton = document.getElementById('addWorkIntervalButton') as HTMLButtonElement;

let currentSettings: ExtensionSettings | null = null;
let statusTimeout: number | undefined;
let procrastinationHighlightDone = false;

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

  resetButton.addEventListener('click', () => {
    if (!confirm('Isto restaura todos os valores padrão. Continuar?')) {
      return;
    }
    currentSettings = getDefaultSettings();
    void persistSettings('Padrões restaurados.');
    renderForms();
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
    void persistSettings('Horários atualizados.');
  });
}

async function hydrate(): Promise<void> {
  currentSettings = await getSettings();
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
  openAiKeyInput.value = currentSettings.openAiKey ?? '';
  criticalThresholdEl.value = (
    currentSettings.criticalScoreThreshold ?? 90
  ).toString();
  renderWorkSchedule();

  renderDomainList('productiveDomains', productiveListEl);
  renderDomainList('procrastinationDomains', procrastinationListEl);
}

function renderDomainList(key: DomainListKey, container: HTMLUListElement): void {
  if (!currentSettings) {
    return;
  }

  container.innerHTML = '';
  const domains = currentSettings[key];

  if (!domains.length) {
    const li = document.createElement('li');
    li.textContent = 'Nenhum domínio cadastrado.';
    container.appendChild(li);
    return;
  }

  for (const domain of domains) {
    const li = document.createElement('li');
    li.textContent = domain;
    const button = document.createElement('button');
    button.textContent = 'Remover';
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
    showStatus('A soma dos pesos precisa ser 1.', true);
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
  currentSettings.criticalScoreThreshold = Math.min(
    100,
    Math.max(0, parseInt(criticalThresholdEl.value, 10))
  );
  currentSettings.workSchedule = sanitizeWorkSchedule(currentSettings.workSchedule);
  await persistSettings('Pesos atualizados.');
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
    showStatus('Informe um domínio válido.', true);
    return;
  }

  const domains = currentSettings[key];
  if (domains.includes(normalized)) {
    showStatus('Esse domínio já está na lista.', true);
    input.value = '';
    return;
  }

  domains.push(normalized);
  domains.sort();
  input.value = '';
  renderDomainList(key, key === 'productiveDomains' ? productiveListEl : procrastinationListEl);
  await persistSettings('Lista atualizada.');
}

async function removeDomain(key: DomainListKey, domain: string): Promise<void> {
  if (!currentSettings) {
    return;
  }

  currentSettings[key] = currentSettings[key].filter((item) => item !== domain);
  renderDomainList(key, key === 'productiveDomains' ? productiveListEl : procrastinationListEl);
  await persistSettings('Domínio removido.');
}

async function persistSettings(message: string): Promise<void> {
  if (!currentSettings) {
    return;
  }

  await saveSettings(currentSettings);
  showStatus(message);
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
    toLabel.textContent = 'até';

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.textContent = 'Remover';
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
  void persistSettings('Horários atualizados.');
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
  void persistSettings('Horários atualizados.');
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
