import { DailyMetrics, DomainStats, HourlyBucket, TimelineEntry } from '../shared/types.js';
import { formatDuration, formatTimeRange } from '../shared/utils/time.js';

declare const Chart: any;
declare const jspdf: { jsPDF: new (...args: any[]) => any };

type ChartInstance = any;

const reportDateEl = document.getElementById('reportDate') as HTMLElement;
const heroMessageEl = document.getElementById('heroMessage') as HTMLElement;
const heroIndexEl = document.getElementById('heroIndex') as HTMLElement;
const heroFocusEl = document.getElementById('heroFocus') as HTMLElement;
const heroSwitchesEl = document.getElementById('heroSwitches') as HTMLElement;
const storyListEl = document.getElementById('storyList') as HTMLUListElement;
const timelineListEl = document.getElementById('timelineList') as HTMLOListElement;
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
const hourlyCanvas = document.getElementById('hourlyChart') as HTMLCanvasElement;
const compositionCanvas = document.getElementById('compositionChart') as HTMLCanvasElement;
const hourlyEmptyEl = document.getElementById('hourlyEmpty');
const criticalBannerEl = document.getElementById('criticalBanner') as HTMLElement | null;
const criticalBannerMessageEl = document.getElementById('criticalBannerMessage') as HTMLElement | null;
const criticalBannerCountdownEl = document.getElementById(
  'criticalBannerCountdown'
) as HTMLElement | null;
const criticalBannerAction = document.getElementById('criticalBannerAction') as HTMLButtonElement | null;

const messageTemplates: Array<{ max: number; text: string }> = [
  {
    max: 25,
    text: 'Agenda impecável. Saul poderia usar você como caso de sucesso em propaganda.'
  },
  {
    max: 50,
    text: 'Oscilações aceitáveis. Ainda dá para dizer aos jurados que você trabalhou.'
  },
  {
    max: 75,
    text: 'O dia teve recaídas visíveis. Hora de chamar reforços e cortar distrações.'
  },
  {
    max: 100,
    text: 'O veredito é claro: procrastinação no banco dos réus. Precisamos de um plano urgente.'
  }
];

const criticalMessages = [
  'Nem eu consigo convencer o júri com esse índice. Hora de cortar as distrações!',
  'Se continuar assim, mando um outdoor avisando o seu chefe.',
  'Este terremoto é o eco das suas abas procrastinatórias. Feche-as já.',
  'A conta está aumentando: foco agora ou cobramos honorários extras.'
];

let hourlyChart: ChartInstance = null;
let compositionChart: ChartInstance = null;
let latestMetrics: DailyMetrics | null = null;
let locale = 'pt-BR';
let openAiKey = '';
let latestSettings: { locale?: string; openAiKey?: string; criticalScoreThreshold?: number } | null =
  null;
let bannerCountdownTimer: number | null = null;
let bannerCountdownValue = 45;

document.addEventListener('DOMContentLoaded', () => {
  void hydrate();
  pdfButton.addEventListener('click', () => void exportPdf());
  backButton.addEventListener('click', () => closeReportTab());
  aiGenerateButton.addEventListener('click', () => void generateNarrative());
  aiRetryButton.addEventListener('click', () => void generateNarrative());
  criticalBannerAction?.addEventListener('click', () => {
    const url = chrome.runtime.getURL('src/options/options.html#vilains');
    void chrome.tabs.create({ url });
  });
});

async function hydrate(): Promise<void> {
  try {
    const response = await sendRuntimeMessage<MetricsResponse>('metrics-request');
    if (!response?.metrics) {
      throw new Error('Sem métricas disponíveis.');
    }
    latestMetrics = response.metrics;
    latestSettings = response.settings ?? null;
    locale = latestSettings?.locale ?? 'pt-BR';
    openAiKey = latestSettings?.openAiKey ?? '';
    renderReport(latestMetrics);
  } catch (error) {
    console.error(error);
    heroMessageEl.textContent = 'Não consegui conversar com o escritório de registros.';
  }
}

function renderReport(metrics: DailyMetrics): void {
  const reportDate = parseDateKey(metrics.dateKey);
  reportDateEl.textContent = reportDate.toLocaleDateString(locale, {
    weekday: 'long',
    month: 'long',
    day: 'numeric'
  });
  heroMessageEl.textContent = pickScoreMessage(metrics.currentIndex);
  heroIndexEl.textContent = metrics.currentIndex.toString().padStart(2, '0');

  const kpis = calculateKpis(metrics);
  heroFocusEl.textContent = formatPercentage(kpis.focusRate);
  heroSwitchesEl.textContent = `${metrics.tabSwitches}`;

  renderHourlyChart(metrics);
  renderCompositionChart(metrics);
  renderStoryList(metrics, kpis);
  renderRankings(metrics.domains);
  renderTimeline(metrics.timeline);
  aiNarrativeEl.innerHTML =
    'Clique em \"Gerar narrativa\" para Saul analisar seu expediente com seu humor ácido.';
  const criticalThreshold = latestSettings?.criticalScoreThreshold ?? 90;
  toggleCriticalBanner(metrics.currentIndex >= criticalThreshold);
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
  const data = {
    labels,
    datasets: [
      {
        label: 'Produtivo',
        data: metrics.hourly.map((bucket) => Math.round(bucket.productiveMs / 60000)),
        backgroundColor: '#0a7e07'
      },
      {
        label: 'Procrastinação',
        data: metrics.hourly.map((bucket) => Math.round(bucket.procrastinationMs / 60000)),
        backgroundColor: '#d00000'
      },
      {
        label: 'Inatividade',
        data: metrics.hourly.map((bucket) => Math.round(bucket.inactiveMs / 60000)),
        backgroundColor: '#c1c1c1'
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
            text: 'Minutos'
          }
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
  const data = {
    labels: ['Produtivo', 'Procrastinação', 'Inatividade', 'Neutro'],
    datasets: [
      {
        data: [
          Math.round(metrics.productiveMs / 60000),
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
  const topFocus = kpis.topFocus;
  const topProcrastination = kpis.topProcrastination;
  const longestIdle = findLongestSegment(metrics.timeline, 'inactive');

  storyListEl.innerHTML = '';

  const items = [
    topFocus
      ? {
          title: 'Campeão produtivo',
          body: `${topFocus.domain} segurou ${formatDuration(topFocus.milliseconds)} de foco.`
        }
      : null,
    topProcrastination
      ? {
          title: 'Vilão do dia',
          body: `${topProcrastination.domain} drenou ${formatDuration(
            topProcrastination.milliseconds
          )}.`
        }
      : null,
    longestIdle
      ? {
          title: 'Maior silêncio',
          body: `Entre ${formatTimeRange(longestIdle.startTime, longestIdle.endTime, locale)} o navegador ficou parado por ${formatDuration(
            longestIdle.durationMs
          )}.`
        }
      : null
  ].filter(Boolean) as Array<{ title: string; body: string }>;

  if (!items.length) {
    const li = document.createElement('li');
    li.textContent = 'Sem histórias suficientes para hoje.';
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
    cell.textContent = 'Sem registros.';
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
    domainSpan.textContent = entry.domain;
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
  const meaningful = entries
    .filter((entry) => entry.durationMs >= 5 * 60 * 1000)
    .sort((a, b) => a.startTime - b.startTime)
    .slice(0, 10);

  if (!meaningful.length) {
    const li = document.createElement('li');
    li.textContent = 'O dia foi curto demais para contar uma história.';
    timelineListEl.appendChild(li);
    return;
  }

  meaningful.forEach((entry) => {
    const li = document.createElement('li');
    const span = document.createElement('span');
    span.textContent = formatTimeRange(entry.startTime, entry.endTime, locale);
    li.appendChild(span);
    li.appendChild(
      document.createTextNode(
        `${entry.domain} • ${formatDuration(entry.durationMs)} • ${describeCategory(entry.category)}`
      )
    );
    timelineListEl.appendChild(li);
  });
}

async function exportPdf(): Promise<void> {
  if (!latestMetrics) {
    return;
  }

  if (!jspdf?.jsPDF) {
    alert('Biblioteca de PDF indisponível.');
    return;
  }

  const doc = new jspdf.jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const metrics = latestMetrics;
  const kpis = calculateKpis(metrics);

  doc.setFontSize(18);
  doc.text('Relatório detalhado — Saul Goodman', 14, 18);
  doc.setFontSize(12);
  doc.text(`Data: ${reportDateEl.textContent}`, 14, 26);
  doc.text(`Índice: ${metrics.currentIndex}`, 14, 34);
  doc.text(`Foco ativo: ${formatPercentage(kpis.focusRate)}`, 14, 40);
  doc.text(`Trocas de abas: ${metrics.tabSwitches}`, 14, 46);

  if (hourlyChart) {
    const img = hourlyChart.toBase64Image();
    doc.addImage(img, 'PNG', 14, 52, 180, 75);
  }

  if (compositionChart) {
    const img = compositionChart.toBase64Image();
    doc.addImage(img, 'PNG', 205, 52, 90, 80);
  }

  doc.setFontSize(12);
  doc.text('Narrativa chave:', 14, 140);

  const narratives = Array.from(timelineListEl.querySelectorAll('li'))
    .slice(0, 6)
    .map((li) => li.textContent?.trim())
    .filter(Boolean) as string[];

  let cursorY = 148;
  narratives.forEach((line) => {
    doc.text(line, 14, cursorY);
    cursorY += 6;
  });

  const aiText = aiNarrativeEl.textContent?.trim();
  if (aiText) {
    doc.text('Argumento do Saul:', 205, 140);
    const wrapped = doc.splitTextToSize(aiText, 90);
    doc.text(wrapped, 205, 148);
  }

  doc.save(`relatorio-saul-goodman-${metrics.dateKey}.pdf`);
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
    inactivePercent,
    tabSwitchRate,
    productivityRatio,
    topFocus,
    topProcrastination
  };
}

function getTopDomainByCategory(
  domains: Record<string, DomainStats>,
  category: DomainStats['category']
): DomainStats | null {
  const filtered = Object.values(domains).filter((domain) => domain.category === category);
  if (!filtered.length) {
    return null;
  }
  return filtered.sort((a, b) => b.milliseconds - a.milliseconds)[0];
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

function formatPercentage(value: number | null): string {
  if (value === null || Number.isNaN(value)) {
    return '--';
  }
  return `${value.toFixed(0)}%`;
}

function pickScoreMessage(score: number): string {
  for (const template of messageTemplates) {
    if (score <= template.max) {
      return template.text;
    }
  }
  return messageTemplates[messageTemplates.length - 1].text;
}

function describeCategory(category: TimelineEntry['category']): string {
  switch (category) {
    case 'productive':
      return 'Produtivo';
    case 'procrastination':
      return 'Procrastinação';
    case 'neutral':
      return 'Neutro';
    case 'inactive':
      return 'Inatividade';
    default:
      return 'Atividade';
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
        reject(new Error(response.error ?? 'Erro desconhecido'));
      }
    });
  });
}

interface CalculatedKpis {
  focusRate: number | null;
  inactivePercent: number | null;
  tabSwitchRate: number | null;
  productivityRatio: number | null;
  topFocus: DomainStats | null;
  topProcrastination: DomainStats | null;
}

async function generateNarrative(): Promise<void> {
  if (!latestMetrics) {
    aiNarrativeEl.textContent = 'Sem métricas para contar uma história hoje.';
    return;
  }

  if (!openAiKey) {
    aiNarrativeEl.textContent = 'Configure sua chave OpenAI nas opções antes de gerar a narrativa.';
    aiRetryButton.classList.remove('hidden');
    return;
  }

  aiGenerateButton.disabled = true;
  aiRetryButton.classList.add('hidden');
  aiNarrativeEl.textContent = 'Saul está analisando as provas...';

  try {
    const payload = buildAiPayload(latestMetrics);
    const narrative = await requestAiNarrative(payload);
    if (!narrative) {
      throw new Error('Resposta vazia da IA');
    }
    aiNarrativeEl.innerHTML = formatAiNarrative(narrative);
  } catch (error) {
    console.error('Erro na narrativa IA', error);
    aiNarrativeEl.textContent =
      'Saul não conseguiu convencer o juiz digital. Tente novamente mais tarde.';
    aiRetryButton.classList.remove('hidden');
  } finally {
    aiGenerateButton.disabled = false;
  }
}

function buildAiPayload(metrics: DailyMetrics): AiPromptPayload {
  const kpis = calculateKpis(metrics);
  const timelineSnippets = metrics.timeline
    .sort((a, b) => a.startTime - b.startTime)
    .slice(0, 10)
    .map((entry) => ({
      domain: entry.domain,
      category: entry.category,
      duration: formatDuration(entry.durationMs),
      range: formatTimeRange(entry.startTime, entry.endTime, locale)
    }));

  return {
    date: reportDateEl.textContent ?? metrics.dateKey,
    index: metrics.currentIndex,
    focusRate: formatPercentage(kpis.focusRate),
    tabSwitches: metrics.tabSwitches,
    topProductive: getTopEntries(metrics.domains, 'productive'),
    topProcrastination: getTopEntries(metrics.domains, 'procrastination'),
    timeline: timelineSnippets
  };
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

async function requestAiNarrative(payload: AiPromptPayload): Promise<string> {
  const apiKey = openAiKey;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY não configurada.');
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
          content:
            'Você é Saul Goodman, advogado com humor sarcástico e vendedor nato. Conte a história do dia do usuário usando os dados fornecidos, como se estivesse defendendo o cliente.'
        },
        {
          role: 'user',
          content: `Conte uma narrativa curta (2 parágrafos) com os dados:\n${JSON.stringify(payload)}`
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
}

interface OpenAiResponse {
  choices: Array<{
    message?: { content?: string };
  }>;
}

interface MetricsResponse {
  metrics: DailyMetrics;
  settings?: { locale?: string; openAiKey?: string; criticalScoreThreshold?: number };
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

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function toggleCriticalBanner(isCritical: boolean): void {
  if (!criticalBannerEl) {
    return;
  }
  if (isCritical) {
    document.body.classList.add('earthquake');
    criticalBannerEl.classList.remove('hidden');
    const message = criticalMessages[Math.floor(Math.random() * criticalMessages.length)];
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
          'Hora de agir: feche as abas vilãs e volte quando estiver no controle.';
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
