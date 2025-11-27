import { formatDuration } from '../shared/utils/time.js';
const scoreValueEl = document.getElementById('scoreValue');
const scoreMessageEl = document.getElementById('scoreMessage');
const lastSyncEl = document.getElementById('lastSync');
const productiveTimeEl = document.getElementById('productiveTime');
const procrastinationTimeEl = document.getElementById('procrastinationTime');
const inactiveTimeEl = document.getElementById('inactiveTime');
const domainsListEl = document.getElementById('domainsList');
const refreshButton = document.getElementById('refreshButton');
const clearButton = document.getElementById('clearButton');
const optionsButton = document.getElementById('optionsButton');
const chartCanvas = document.getElementById('productivityChart');
const csvExportButton = document.getElementById('csvExportButton');
const pdfExportButton = document.getElementById('pdfExportButton');
const focusRateEl = document.getElementById('focusRateValue');
const tabSwitchRateEl = document.getElementById('tabSwitchRateValue');
const inactivePercentEl = document.getElementById('inactivePercentValue');
const productivityRatioEl = document.getElementById('productivityRatioValue');
const topFocusDomainEl = document.getElementById('topFocusDomain');
const topFocusTimeEl = document.getElementById('topFocusTime');
const topProcrastinationDomainEl = document.getElementById('topProcrastinationDomain');
const topProcrastinationTimeEl = document.getElementById('topProcrastinationTime');
let productivityChart = null;
let latestData = null;
const messageTemplates = [
    { max: 25, text: 'Cliente de ouro! Continue assim que eu consigo cobrar cache cheio.' },
    { max: 50, text: 'Ainda dá pra dizer que é expediente. Não me force a ligar pro seu foco.' },
    { max: 75, text: 'Vejo sinais de fuga de responsabilidade. Hora de voltar pro jogo.' },
    { max: 100, text: 'Você está brincando com fogo. E eu cobro por hora para apagar incêndios.' }
];
document.addEventListener('DOMContentLoaded', () => {
    attachListeners();
    void hydrate();
});
function attachListeners() {
    refreshButton.addEventListener('click', () => void hydrate());
    clearButton.addEventListener('click', () => {
        if (!confirm('Tem certeza? Isso zera apenas o dia atual.')) {
            return;
        }
        void sendRuntimeMessage('clear-data').then(() => hydrate());
    });
    optionsButton.addEventListener('click', () => {
        void chrome.runtime.openOptionsPage();
    });
    csvExportButton.addEventListener('click', () => handleCsvExport());
    pdfExportButton.addEventListener('click', () => void handlePdfExport());
}
async function hydrate() {
    try {
        const data = await sendRuntimeMessage('metrics-request');
        if (!data || !data.metrics) {
            throw new Error('Sem dados disponíveis');
        }
        latestData = data;
        renderSummary(data.metrics);
        renderScore(data.metrics.currentIndex);
        renderKpis(data.metrics);
        renderTopDomains(data.metrics.domains);
        renderChart(data.metrics);
        lastSyncEl.textContent = `Atualizado às ${new Date(data.metrics.lastUpdated).toLocaleTimeString(data.settings?.locale ?? 'pt-BR')}`;
    }
    catch (error) {
        console.error(error);
        scoreMessageEl.textContent = 'Ops! Não consegui falar com o escritório.';
    }
}
function renderSummary(metrics) {
    productiveTimeEl.textContent = formatDuration(metrics.productiveMs);
    procrastinationTimeEl.textContent = formatDuration(metrics.procrastinationMs);
    inactiveTimeEl.textContent = formatDuration(metrics.inactiveMs);
}
function renderKpis(metrics) {
    const kpis = calculateKpis(metrics);
    focusRateEl.textContent = formatPercentage(kpis.focusRate);
    tabSwitchRateEl.textContent = formatRate(kpis.tabSwitchRate);
    inactivePercentEl.textContent = formatPercentage(kpis.inactivePercent);
    productivityRatioEl.textContent = formatProductivityRatio(kpis.productivityRatio);
    if (kpis.topFocus) {
        topFocusDomainEl.textContent = kpis.topFocus.domain;
        topFocusTimeEl.textContent = formatDuration(kpis.topFocus.milliseconds);
    }
    else {
        topFocusDomainEl.textContent = '--';
        topFocusTimeEl.textContent = 'Sem dados';
    }
    if (kpis.topProcrastination) {
        topProcrastinationDomainEl.textContent = kpis.topProcrastination.domain;
        topProcrastinationTimeEl.textContent = formatDuration(kpis.topProcrastination.milliseconds);
    }
    else {
        topProcrastinationDomainEl.textContent = '--';
        topProcrastinationTimeEl.textContent = 'Sem dados';
    }
}
function renderScore(score) {
    scoreValueEl.textContent = score.toString();
    scoreMessageEl.textContent = pickScoreMessage(score);
    scoreValueEl.classList.toggle('alert', score >= 70);
}
function pickScoreMessage(score) {
    for (const template of messageTemplates) {
        if (score <= template.max) {
            return template.text;
        }
    }
    return messageTemplates[messageTemplates.length - 1].text;
}
function renderTopDomains(domains) {
    domainsListEl.innerHTML = '';
    const sorted = Object.values(domains)
        .sort((a, b) => b.milliseconds - a.milliseconds)
        .slice(0, 5);
    if (!sorted.length) {
        const li = document.createElement('li');
        li.textContent = 'Sem dados para hoje.';
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
function renderChart(metrics) {
    const data = {
        labels: ['Produtivo', 'Procrastinação'],
        datasets: [
            {
                label: 'Minutos',
                backgroundColor: ['#0a7e07', '#d00000'],
                borderColor: '#111',
                borderWidth: 1,
                data: [
                    Math.round(metrics.productiveMs / 60000),
                    Math.round(metrics.procrastinationMs / 60000)
                ]
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
                    beginAtZero: true
                }
            }
        }
    });
}
async function sendRuntimeMessage(type, payload) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type, payload }, (response) => {
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
                return;
            }
            if (!response) {
                resolve(undefined);
                return;
            }
            if (response.ok) {
                resolve(response.data);
            }
            else {
                reject(new Error(response.error ?? 'Erro desconhecido'));
            }
        });
    });
}
function calculateKpis(metrics) {
    const totalTracked = metrics.productiveMs + metrics.procrastinationMs + metrics.inactiveMs;
    const focusRate = totalTracked > 0 ? (metrics.productiveMs / totalTracked) * 100 : null;
    const inactivePercent = totalTracked > 0 ? (metrics.inactiveMs / totalTracked) * 100 : null;
    const trackedHours = totalTracked / 3600000;
    const tabSwitchRate = trackedHours > 0 ? metrics.tabSwitches / trackedHours : null;
    const productivityRatio = metrics.productiveMs > 0
        ? metrics.procrastinationMs === 0
            ? Infinity
            : metrics.productiveMs / metrics.procrastinationMs
        : null;
    const topFocus = getTopDomainByCategory(metrics.domains, 'productive');
    const topProcrastination = getTopDomainByCategory(metrics.domains, 'procrastination');
    return {
        focusRate,
        tabSwitchRate,
        inactivePercent,
        productivityRatio,
        topFocus,
        topProcrastination
    };
}
function getTopDomainByCategory(domains, category) {
    const filtered = Object.values(domains).filter((d) => d.category === category);
    if (!filtered.length) {
        return null;
    }
    return filtered.sort((a, b) => b.milliseconds - a.milliseconds)[0];
}
function formatPercentage(value) {
    if (value === null || Number.isNaN(value)) {
        return '--';
    }
    return `${value.toFixed(0)}%`;
}
function formatRate(value) {
    if (value === null || Number.isNaN(value)) {
        return '--';
    }
    return `${value.toFixed(1)}/h`;
}
function formatProductivityRatio(value) {
    if (value === null || Number.isNaN(value)) {
        return '--';
    }
    if (!Number.isFinite(value)) {
        return '∞:1';
    }
    return `${value.toFixed(1)}:1`;
}
function formatMinutesValue(ms) {
    return (ms / 60000).toFixed(1);
}
function handleCsvExport() {
    if (!latestData) {
        alert('Ainda não há dados carregados. Abra algumas abas e tente novamente.');
        return;
    }
    const kpis = calculateKpis(latestData.metrics);
    const csvContent = buildCsv(latestData.metrics, kpis);
    downloadTextFile(csvContent, `saul-goodman-${latestData.metrics.dateKey}.csv`, 'text/csv;charset=utf-8;');
}
function buildCsv(metrics, kpis) {
    const lines = [];
    lines.push('Resumo geral');
    lines.push('Data,Índice,Produtivo (min),Procrastinação (min),Inatividade (min),Trocas de abas');
    lines.push([
        metrics.dateKey,
        metrics.currentIndex,
        formatMinutesValue(metrics.productiveMs),
        formatMinutesValue(metrics.procrastinationMs),
        formatMinutesValue(metrics.inactiveMs),
        metrics.tabSwitches
    ].join(','));
    lines.push('');
    lines.push('Indicadores extras');
    lines.push([
        'Foco ativo (%)',
        'Trocas por hora',
        'Tempo ocioso (%)',
        'Prod x Proc',
        'Imersão campeã',
        'Tempo',
        'Vilão do dia',
        'Tempo'
    ].join(','));
    lines.push([
        formatPercentage(kpis.focusRate),
        formatRate(kpis.tabSwitchRate),
        formatPercentage(kpis.inactivePercent),
        formatProductivityRatio(kpis.productivityRatio),
        kpis.topFocus?.domain ?? '--',
        kpis.topFocus ? formatDuration(kpis.topFocus.milliseconds) : '--',
        kpis.topProcrastination?.domain ?? '--',
        kpis.topProcrastination ? formatDuration(kpis.topProcrastination.milliseconds) : '--'
    ].join(','));
    lines.push('');
    lines.push('Top domínios');
    lines.push('Domínio,Categoria,Minutos');
    Object.values(metrics.domains)
        .sort((a, b) => b.milliseconds - a.milliseconds)
        .slice(0, 10)
        .forEach((domain) => {
        lines.push([domain.domain, domain.category, formatMinutesValue(domain.milliseconds)].join(','));
    });
    return lines.join('\n');
}
function downloadTextFile(content, filename, mime) {
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
async function handlePdfExport() {
    if (!latestData) {
        alert('Ainda não há dados carregados. Abra algumas abas e tente novamente.');
        return;
    }
    if (!jspdf?.jsPDF) {
        alert('Módulo de PDF indisponível.');
        return;
    }
    const metrics = latestData.metrics;
    const kpis = calculateKpis(metrics);
    const doc = new jspdf.jsPDF({ unit: 'mm', format: 'a4' });
    doc.setFontSize(18);
    doc.text('Relatório Saul Goodman', 14, 20);
    doc.setFontSize(11);
    doc.text(`Data: ${metrics.dateKey}`, 14, 30);
    doc.text(`Índice: ${metrics.currentIndex}`, 14, 36);
    doc.setFont(undefined, 'bold');
    doc.text('Resumo diário', 14, 48);
    doc.setFont(undefined, 'normal');
    doc.text(`Produtivo: ${formatDuration(metrics.productiveMs)}`, 14, 54);
    doc.text(`Procrastinação: ${formatDuration(metrics.procrastinationMs)}`, 14, 60);
    doc.text(`Inatividade: ${formatDuration(metrics.inactiveMs)}`, 14, 66);
    doc.text(`Trocas de abas: ${metrics.tabSwitches}`, 14, 72);
    doc.setFont(undefined, 'bold');
    doc.text('Indicadores extras', 14, 84);
    doc.setFont(undefined, 'normal');
    doc.text(`Foco ativo: ${formatPercentage(kpis.focusRate)}`, 14, 90);
    doc.text(`Trocas por hora: ${formatRate(kpis.tabSwitchRate)}`, 14, 96);
    doc.text(`Tempo ocioso: ${formatPercentage(kpis.inactivePercent)}`, 14, 102);
    doc.text(`Prod x Proc: ${formatProductivityRatio(kpis.productivityRatio)}`, 14, 108);
    doc.text(`Imersão campeã: ${kpis.topFocus ? `${kpis.topFocus.domain} (${formatDuration(kpis.topFocus.milliseconds)})` : 'Sem dados'}`, 14, 114);
    doc.text(`Vilão do dia: ${kpis.topProcrastination
        ? `${kpis.topProcrastination.domain} (${formatDuration(kpis.topProcrastination.milliseconds)})`
        : 'Sem dados'}`, 14, 120);
    const chartImage = productivityChart && typeof productivityChart.toBase64Image === 'function'
        ? productivityChart.toBase64Image()
        : null;
    let yOffset = 130;
    if (chartImage) {
        doc.addImage(chartImage, 'PNG', 14, 130, 180, 80);
        yOffset = 220;
    }
    doc.setFont(undefined, 'bold');
    doc.text('Top domínios', 14, yOffset);
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
        doc.text(`${domain.domain} — ${domain.category} — ${formatDuration(domain.milliseconds)}`, 14, cursor);
        cursor += 6;
    });
    doc.save(`saul-goodman-${metrics.dateKey}.pdf`);
}
