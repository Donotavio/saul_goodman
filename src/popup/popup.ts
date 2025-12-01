import { DailyMetrics, DomainStats, PopupData, RuntimeMessageType } from '../shared/types.js';
import { CriticalSirenPlayer } from '../shared/critical-audio.js';
import { formatDuration } from '../shared/utils/time.js';

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
const clearButton = document.getElementById('clearButton') as HTMLButtonElement;
const optionsButton = document.getElementById('optionsButton') as HTMLButtonElement;
const chartCanvas = document.getElementById('productivityChart') as HTMLCanvasElement;
const csvExportButton = document.getElementById('csvExportButton') as HTMLButtonElement;
const pdfExportButton = document.getElementById('pdfExportButton') as HTMLButtonElement;
const reportButton = document.getElementById('reportButton') as HTMLButtonElement;
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
if (criticalSoundButton) {
  criticalSoundButton.textContent = 'Tocar sirene agora';
}

let productivityChart: ChartInstance = null;
let latestData: PopupData | null = null;
let criticalCountdownTimer: number | null = null;
let criticalCountdownValue = 45;
let criticalOverlayDismissed = false;
let criticalSoundEnabledSetting = false;
let lastCriticalState = false;
const sirenPlayer = new CriticalSirenPlayer();

const messageTemplates: Array<{ max: number; text: string }> = [
  { max: 25, text: 'Cliente de ouro! Continue assim que eu consigo cobrar cache cheio.' },
  { max: 50, text: 'Ainda dá pra dizer que é expediente. Não me force a ligar pro seu foco.' },
  { max: 75, text: 'Vejo sinais de fuga de responsabilidade. Hora de voltar pro jogo.' },
  { max: 100, text: 'Você está brincando com fogo. E eu cobro por hora para apagar incêndios.' }
];

const criticalMessages = [
  'Cliente, com índice 90 nem eu consigo te defender. Vai custar honorários de risco!',
  'Esse tremor? É o juiz batendo o martelo na sua produtividade.',
  'Pare de procrastinar ou preparo um comercial no horário nobre contando sua história.',
  'Me ajuda a te defender: fecha essas abas antes que eu cobre em dólar.'
];

document.addEventListener('DOMContentLoaded', () => {
  attachListeners();
  void hydrate();
});

function attachListeners(): void {
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
  reportButton.addEventListener('click', () => {
    void chrome.tabs.create({ url: chrome.runtime.getURL('src/report/report.html') });
  });
  criticalCloseButton?.addEventListener('click', () => {
    criticalOverlayEl?.classList.add('hidden');
    criticalOverlayDismissed = true;
  });
  criticalSoundButton?.addEventListener('click', () => {
    sirenPlayer.playBursts(4).catch(() => {});
  });
  criticalReportButton?.addEventListener('click', () => {
    void chrome.tabs.create({ url: chrome.runtime.getURL('src/report/report.html') });
  });
  criticalOptionsButton?.addEventListener('click', () => {
    const url = chrome.runtime.getURL('src/options/options.html#vilains');
    void chrome.tabs.create({ url });
  });
}

async function hydrate(): Promise<void> {
  try {
    const data = await sendRuntimeMessage<PopupData>('metrics-request');
    if (!data || !data.metrics) {
      throw new Error('Sem dados disponíveis');
    }
    latestData = data;
    criticalSoundEnabledSetting = Boolean(data.settings?.criticalSoundEnabled);
    renderSummary(data.metrics);
    renderScore(data.metrics.currentIndex);
    renderKpis(data.metrics);
    renderTopDomains(data.metrics.domains);
    renderChart(data.metrics);
    lastSyncEl.textContent = `Atualizado às ${new Date(data.metrics.lastUpdated).toLocaleTimeString(
      data.settings?.locale ?? 'pt-BR'
    )}`;
  } catch (error) {
    console.error(error);
    scoreMessageEl.textContent = 'Ops! Não consegui falar com o escritório.';
  }
}

function renderSummary(metrics: DailyMetrics): void {
  productiveTimeEl.textContent = formatDuration(metrics.productiveMs);
  procrastinationTimeEl.textContent = formatDuration(metrics.procrastinationMs);
  inactiveTimeEl.textContent = formatDuration(metrics.inactiveMs);
}

function renderKpis(metrics: DailyMetrics): void {
  const kpis = calculateKpis(metrics);

  focusRateEl.textContent = formatPercentage(kpis.focusRate);
  tabSwitchRateEl.textContent = formatRate(kpis.tabSwitchRate);
  inactivePercentEl.textContent = formatPercentage(kpis.inactivePercent);
  productivityRatioEl.textContent = formatProductivityRatio(kpis.productivityRatio);

  if (kpis.topFocus) {
    topFocusDomainEl.textContent = kpis.topFocus.domain;
    topFocusTimeEl.textContent = formatDuration(kpis.topFocus.milliseconds);
  } else {
    topFocusDomainEl.textContent = '--';
    topFocusTimeEl.textContent = 'Sem dados';
  }

  if (kpis.topProcrastination) {
    topProcrastinationDomainEl.textContent = kpis.topProcrastination.domain;
    topProcrastinationTimeEl.textContent = formatDuration(kpis.topProcrastination.milliseconds);
  } else {
    topProcrastinationDomainEl.textContent = '--';
    topProcrastinationTimeEl.textContent = 'Sem dados';
  }
}

function renderScore(score: number): void {
  scoreValueEl.textContent = score.toString();
  scoreMessageEl.textContent = pickScoreMessage(score);
  scoreValueEl.classList.toggle('alert', score >= 70);
  const threshold = latestData?.settings?.criticalScoreThreshold ?? 90;
  toggleCriticalMode(score >= threshold);
}

function pickScoreMessage(score: number): string {
  for (const template of messageTemplates) {
    if (score <= template.max) {
      return template.text;
    }
  }
  return messageTemplates[messageTemplates.length - 1].text;
}

function renderTopDomains(domains: Record<string, DomainStats>): void {
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

function renderChart(metrics: DailyMetrics): void {
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
        reject(new Error(response.error ?? 'Erro desconhecido'));
      }
    });
  });
}

interface CalculatedKpis {
  focusRate: number | null;
  tabSwitchRate: number | null;
  inactivePercent: number | null;
  productivityRatio: number | null;
  topFocus: DomainStats | null;
  topProcrastination: DomainStats | null;
}

function calculateKpis(metrics: DailyMetrics): CalculatedKpis {
  const totalTracked = metrics.productiveMs + metrics.procrastinationMs + metrics.inactiveMs;
  const focusRate = totalTracked > 0 ? (metrics.productiveMs / totalTracked) * 100 : null;
  const inactivePercent = totalTracked > 0 ? (metrics.inactiveMs / totalTracked) * 100 : null;
  const trackedHours = totalTracked / 3600000;
  const tabSwitchRate = trackedHours > 0 ? metrics.tabSwitches / trackedHours : null;
  const productivityRatio =
    metrics.productiveMs > 0
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

function getTopDomainByCategory(
  domains: Record<string, DomainStats>,
  category: DomainStats['category']
): DomainStats | null {
  const filtered = Object.values(domains).filter((d) => d.category === category);
  if (!filtered.length) {
    return null;
  }
  return filtered.sort((a, b) => b.milliseconds - a.milliseconds)[0];
}

function formatPercentage(value: number | null): string {
  if (value === null || Number.isNaN(value)) {
    return '--';
  }
  return `${value.toFixed(0)}%`;
}

function formatRate(value: number | null): string {
  if (value === null || Number.isNaN(value)) {
    return '--';
  }
  return `${value.toFixed(1)}/h`;
}

function formatProductivityRatio(value: number | null): string {
  if (value === null || Number.isNaN(value)) {
    return '--';
  }
  if (!Number.isFinite(value)) {
    return '∞:1';
  }
  return `${value.toFixed(1)}:1`;
}

function formatMinutesValue(ms: number): string {
  return (ms / 60000).toFixed(1);
}

function handleCsvExport(): void {
  if (!latestData) {
    alert('Ainda não há dados carregados. Abra algumas abas e tente novamente.');
    return;
  }

  const kpis = calculateKpis(latestData.metrics);
  const csvContent = buildCsv(latestData.metrics, kpis);
  downloadTextFile(csvContent, `saul-goodman-${latestData.metrics.dateKey}.csv`, 'text/csv;charset=utf-8;');
}

function buildCsv(metrics: DailyMetrics, kpis: CalculatedKpis): string {
  const lines: string[] = [];
  lines.push('Resumo geral');
  lines.push('Data,Índice,Produtivo (min),Procrastinação (min),Inatividade (min),Trocas de abas');
  lines.push(
    [
      metrics.dateKey,
      metrics.currentIndex,
      formatMinutesValue(metrics.productiveMs),
      formatMinutesValue(metrics.procrastinationMs),
      formatMinutesValue(metrics.inactiveMs),
      metrics.tabSwitches
    ].join(',')
  );

  lines.push('');
  lines.push('Indicadores extras');
  lines.push(
    [
      'Foco ativo (%)',
      'Trocas por hora',
      'Tempo ocioso (%)',
      'Prod x Proc',
      'Imersão campeã',
      'Tempo',
      'Vilão do dia',
      'Tempo'
    ].join(',')
  );
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
  lines.push('Top domínios');
  lines.push('Domínio,Categoria,Minutos');
  Object.values(metrics.domains)
    .sort((a, b) => b.milliseconds - a.milliseconds)
    .slice(0, 10)
    .forEach((domain) => {
      lines.push(
        [domain.domain, domain.category, formatMinutesValue(domain.milliseconds)].join(',')
      );
    });

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
  doc.text(
    `Imersão campeã: ${
      kpis.topFocus ? `${kpis.topFocus.domain} (${formatDuration(kpis.topFocus.milliseconds)})` : 'Sem dados'
    }`,
    14,
    114
  );
  doc.text(
    `Vilão do dia: ${
      kpis.topProcrastination
        ? `${kpis.topProcrastination.domain} (${formatDuration(kpis.topProcrastination.milliseconds)})`
        : 'Sem dados'
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
      void sirenPlayer.playBursts(4);
    }
  } else {
    document.body.classList.remove('earthquake');
    hideCriticalOverlay();
    stopCriticalCountdown();
    sirenPlayer.stop();
    criticalOverlayDismissed = false;
  }
  lastCriticalState = isCritical;
}

function showCriticalOverlay(): void {
  if (!criticalOverlayEl) {
    return;
  }
  const message = criticalMessages[Math.floor(Math.random() * criticalMessages.length)];
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
          'Sem desculpas: quero três abas procrastinatórias fechadas imediatamente!';
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
