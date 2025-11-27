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
const pdfButton = document.getElementById('pdfReportButton') as HTMLButtonElement;
const backButton = document.getElementById('backButton') as HTMLButtonElement;
const hourlyCanvas = document.getElementById('hourlyChart') as HTMLCanvasElement;
const compositionCanvas = document.getElementById('compositionChart') as HTMLCanvasElement;
const hourlyEmptyEl = document.getElementById('hourlyEmpty');

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

let hourlyChart: ChartInstance = null;
let compositionChart: ChartInstance = null;
let latestMetrics: DailyMetrics | null = null;
let locale = 'pt-BR';

document.addEventListener('DOMContentLoaded', () => {
  void hydrate();
  pdfButton.addEventListener('click', () => void exportPdf());
  backButton.addEventListener('click', () => window.close());
});

async function hydrate(): Promise<void> {
  try {
    const response = await sendRuntimeMessage<MetricsResponse>('metrics-request');
    if (!response?.metrics) {
      throw new Error('Sem métricas disponíveis.');
    }
    latestMetrics = response.metrics;
    locale = response.settings?.locale ?? 'pt-BR';
    renderReport(latestMetrics);
  } catch (error) {
    console.error(error);
    heroMessageEl.textContent = 'Não consegui conversar com o escritório de registros.';
  }
}

function renderReport(metrics: DailyMetrics): void {
  reportDateEl.textContent = new Date(metrics.dateKey).toLocaleDateString(locale, {
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
  renderTimeline(metrics.timeline);
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

interface MetricsResponse {
  metrics: DailyMetrics;
  settings?: { locale?: string };
}
