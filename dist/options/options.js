import { getDefaultSettings, getSettings, saveSettings } from '../shared/storage.js';
import { normalizeDomain } from '../shared/utils/domain.js';
const weightsForm = document.getElementById('weightsForm');
const productiveForm = document.getElementById('productiveForm');
const procrastinationForm = document.getElementById('procrastinationForm');
const productiveInput = document.getElementById('productiveInput');
const procrastinationInput = document.getElementById('procrastinationInput');
const productiveListEl = document.getElementById('productiveList');
const procrastinationListEl = document.getElementById('procrastinationList');
const procrastinationWeightEl = document.getElementById('procrastinationWeight');
const tabSwitchWeightEl = document.getElementById('tabSwitchWeight');
const inactivityWeightEl = document.getElementById('inactivityWeight');
const inactivityThresholdEl = document.getElementById('inactivityThreshold');
const openAiKeyInput = document.getElementById('openAiKey');
const resetButton = document.getElementById('resetButton');
const statusMessageEl = document.getElementById('statusMessage');
let currentSettings = null;
let statusTimeout;
document.addEventListener('DOMContentLoaded', () => {
    attachListeners();
    void hydrate();
});
function attachListeners() {
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
        const target = event.target;
        if (target?.dataset.domain) {
            void removeDomain('productiveDomains', target.dataset.domain);
        }
    });
    procrastinationListEl.addEventListener('click', (event) => {
        const target = event.target;
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
}
async function hydrate() {
    currentSettings = await getSettings();
    renderForms();
}
function renderForms() {
    if (!currentSettings) {
        return;
    }
    procrastinationWeightEl.value = currentSettings.weights.procrastinationWeight.toString();
    tabSwitchWeightEl.value = currentSettings.weights.tabSwitchWeight.toString();
    inactivityWeightEl.value = currentSettings.weights.inactivityWeight.toString();
    inactivityThresholdEl.value = Math.round(currentSettings.inactivityThresholdMs / 1000).toString();
    openAiKeyInput.value = currentSettings.openAiKey ?? '';
    renderDomainList('productiveDomains', productiveListEl);
    renderDomainList('procrastinationDomains', procrastinationListEl);
}
function renderDomainList(key, container) {
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
async function handleWeightsSubmit() {
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
    await persistSettings('Pesos atualizados.');
}
async function handleDomainSubmit(key, input) {
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
async function removeDomain(key, domain) {
    if (!currentSettings) {
        return;
    }
    currentSettings[key] = currentSettings[key].filter((item) => item !== domain);
    renderDomainList(key, key === 'productiveDomains' ? productiveListEl : procrastinationListEl);
    await persistSettings('Domínio removido.');
}
async function persistSettings(message) {
    if (!currentSettings) {
        return;
    }
    await saveSettings(currentSettings);
    showStatus(message);
    chrome.runtime.sendMessage({ type: 'settings-updated' }).catch(() => { });
}
function showStatus(message, isError = false) {
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
