import type { DomainMetadata, ExtensionSettings, DailyMetrics } from '../types.js';
import type { FeatureMap } from './featureExtractor.js';
import type { DomainBehaviorStats } from './behaviorSignals.js';
import { safeDivide, clamp } from './utils.js';

const CONCEPT_VECTOR_DIMENSIONS = 256;
const MAX_SIGNAL_SAMPLES = 256;

export interface NaturalAttentionSnapshot {
  tabSwitches10m: number;
  activeMinutes10m: number;
  revisits10m: number;
  returnLatencyMs7d: number;
  signalStability7d: number;
}

export interface NaturalContextSnapshot {
  scheduleFit: number;
  vscodeActiveMs15m: number;
  vscodeShare15m: number;
}

export interface NaturalSignalStatsState {
  signalSamples: Record<string, number[]>;
  topConceptTotal: number;
  topConceptCovered: number;
}

export interface NaturalReasonDescriptor {
  feature: string;
  family: string;
  evidenceType: 'intent' | 'attention' | 'engagement' | 'task_progress' | 'context' | 'reliability';
  conceptKey?: string;
  conceptLabel?: string;
  text: string;
}

export interface NaturalConceptScore {
  key: string;
  label: string;
  score: number;
}

export interface NaturalSignalComputationResult {
  features: FeatureMap;
  descriptors: Record<string, NaturalReasonDescriptor>;
  topConcepts: NaturalConceptScore[];
  intentEntropy: number;
  metadataQualityScore: number;
  stats: NaturalSignalStatsState;
}

export interface NaturalSignalInput {
  metadata: DomainMetadata;
  behavior: DomainBehaviorStats;
  settings: ExtensionSettings;
  attention: NaturalAttentionSnapshot;
  context: NaturalContextSnapshot;
  metrics?: DailyMetrics | null;
}

interface ConceptConfig {
  key: string;
  label: string;
  seeds: string[];
}

interface DenseVector {
  values: Float32Array;
  norm: number;
}

const CONCEPTS: ConceptConfig[] = [
  {
    key: 'work_legal',
    label: 'pesquisa juridica',
    seeds: [
      'juridico',
      'juridica',
      'law',
      'legal',
      'tribunal',
      'processo',
      'peticao',
      'jurisprudencia',
      'codigo civil',
      'court filing',
      'abogado',
      'derecho',
      'boletin judicial'
    ]
  },
  {
    key: 'work_knowledge',
    label: 'estudo e conhecimento',
    seeds: [
      'documentacao',
      'docs',
      'api',
      'reference',
      'tutorial',
      'manual',
      'research',
      'paper',
      'lecture',
      'course',
      'aprendizado',
      'aprendizaje',
      'knowledge base'
    ]
  },
  {
    key: 'collaboration',
    label: 'colaboracao de trabalho',
    seeds: [
      'slack',
      'teams',
      'meet',
      'email',
      'calendar',
      'reuniao',
      'meeting',
      'chat interno',
      'kanban',
      'jira',
      'asignacion',
      'colaboracion',
      'standup'
    ]
  },
  {
    key: 'admin_ops',
    label: 'operacao administrativa',
    seeds: [
      'dashboard',
      'admin',
      'settings',
      'billing',
      'invoice',
      'fatura',
      'crm',
      'ticket',
      'monitoring',
      'status page',
      'gestion',
      'operaciones',
      'planilha'
    ]
  },
  {
    key: 'social_entertainment',
    label: 'consumo social e entretenimento',
    seeds: [
      'feed',
      'shorts',
      'reels',
      'stories',
      'video curto',
      'stream',
      'watch',
      'meme',
      'viral',
      'social',
      'entretenimiento',
      'for you',
      'timeline'
    ]
  },
  {
    key: 'commerce',
    label: 'navegacao de compras',
    seeds: [
      'shop',
      'checkout',
      'cart',
      'produto',
      'oferta',
      'sale',
      'desconto',
      'marketplace',
      'sku',
      'price',
      'comprar',
      'compras',
      'tienda'
    ]
  }
];

const CONCEPT_PROTOTYPES: Array<{ key: string; label: string; vector: DenseVector }> = CONCEPTS.map((concept) => ({
  key: concept.key,
  label: concept.label,
  vector: buildTextVector(concept.seeds.join(' '))
}));

export function createEmptyNaturalSignalStats(): NaturalSignalStatsState {
  return {
    signalSamples: {},
    topConceptTotal: 0,
    topConceptCovered: 0
  };
}

export function normalizeNaturalSignalStats(
  input: NaturalSignalStatsState | null | undefined
): NaturalSignalStatsState {
  if (!input || typeof input !== 'object') {
    return createEmptyNaturalSignalStats();
  }
  const signalSamples: Record<string, number[]> = {};
  Object.entries(input.signalSamples ?? {}).forEach(([key, values]) => {
    if (!Array.isArray(values)) {
      return;
    }
    signalSamples[key] = values
      .filter((value) => Number.isFinite(value))
      .slice(-MAX_SIGNAL_SAMPLES)
      .map((value) => Number(value));
  });
  return {
    signalSamples,
    topConceptTotal: Number.isFinite(input.topConceptTotal) ? Math.max(0, input.topConceptTotal) : 0,
    topConceptCovered: Number.isFinite(input.topConceptCovered) ? Math.max(0, input.topConceptCovered) : 0
  };
}

export function buildNaturalSignalFeatures(
  input: NaturalSignalInput,
  currentStats: NaturalSignalStatsState | null | undefined
): NaturalSignalComputationResult {
  const stats = normalizeNaturalSignalStats(currentStats);
  const features: FeatureMap = {};
  const descriptors: Record<string, NaturalReasonDescriptor> = {};

  const pageText = buildPageText(input.metadata);
  const pageVector = buildTextVector(pageText);
  const concepts = scoreConcepts(pageVector);
  const topConcepts = concepts.slice(0, 3);
  const intentEntropy = calculateEntropy(concepts.map((entry) => entry.score));

  topConcepts.forEach((concept) => {
    const feature = `sem:intent:${concept.key}`;
    const value = clamp(concept.score, 0, 1);
    addFeature(features, feature, value);
    descriptors[feature] = {
      feature,
      family: 'intent',
      evidenceType: 'intent',
      conceptKey: concept.key,
      conceptLabel: concept.label,
      text: `Intencao predominante: ${concept.label}`
    };
  });

  const topConcept = topConcepts[0];
  if (topConcept) {
    const indicator = `sem:intent:top:${topConcept.key}`;
    addFeature(features, indicator, 1);
    descriptors[indicator] = {
      feature: indicator,
      family: 'intent',
      evidenceType: 'intent',
      conceptKey: topConcept.key,
      conceptLabel: topConcept.label,
      text: `Conceito dominante: ${topConcept.label}`
    };
  }

  addFeature(features, 'sem:intent_entropy', clamp(intentEntropy, 0, 1));
  descriptors['sem:intent_entropy'] = {
    feature: 'sem:intent_entropy',
    family: 'intent',
    evidenceType: 'intent',
    text: 'Ambiguidade de intencao observada na pagina'
  };

  const rawSignals: Record<string, number> = {
    'nat:engagement:dwell_log': Math.log1p(Math.max(0, input.metadata.activeMs ?? 0) / 1000),
    'nat:engagement:interaction_rate': safeDivide(
      Math.max(0, input.metadata.interactionCount ?? 0),
      Math.max(1, Math.max(0, input.metadata.activeMs ?? 0) / 60_000)
    ),
    'nat:engagement:scroll_completion': clamp(input.metadata.scrollDepth ?? 0, 0, 1),
    'nat:engagement:audible_ratio_14d': clamp(input.behavior.audibleRatio14d, 0, 1),
    'nat:attention:switch_rate_10m': safeDivide(
      input.attention.tabSwitches10m,
      Math.max(1, input.attention.activeMinutes10m)
    ),
    'nat:attention:focus_continuity_10m': 1 - clamp(
      safeDivide(input.attention.tabSwitches10m, Math.max(1, input.attention.activeMinutes10m)),
      0,
      1
    ),
    'nat:attention:return_latency_7d': Math.log1p(Math.max(0, input.attention.returnLatencyMs7d) / 60_000),
    'nat:attention:fragmentation_index': safeDivide(
      input.attention.tabSwitches10m,
      Math.max(1, input.attention.revisits10m + 1)
    ),
    'nat:task_progress:edit_density': input.metadata.hasRichEditor
      ? safeDivide(
          Math.max(0, input.metadata.interactionCount ?? 0),
          Math.max(1, Math.max(0, input.metadata.activeMs ?? 0) / 60_000)
        )
      : 0,
    'nat:task_progress:form_progress_proxy': input.metadata.hasFormFields
      ? clamp(
          safeDivide(
            Math.max(0, input.metadata.interactionCount ?? 0),
            Math.max(1, Math.max(0, input.metadata.activeMs ?? 0) / 30_000)
          ),
          0,
          1
        )
      : 0,
    'nat:task_progress:completion_proxy': clamp(
      ((input.metadata.scrollDepth ?? 0) + clamp(Math.log1p(Math.max(0, input.metadata.activeMs ?? 0) / 1000) / 8, 0, 1)) / 2,
      0,
      1
    ),
    'nat:context:schedule_fit': clamp(input.context.scheduleFit, 0, 1),
    'nat:context:out_of_schedule_ratio_14d': clamp(input.behavior.outOfScheduleRatio14d, 0, 1),
    'nat:context:vscode_active_15m': Math.log1p(Math.max(0, input.context.vscodeActiveMs15m) / 1000),
    'nat:context:vscode_share_15m': clamp(input.context.vscodeShare15m, 0, 1),
    'nat:reliability:metadata_quality_score': estimateMetadataQuality(input.metadata),
    'nat:reliability:signal_stability_7d': clamp(input.attention.signalStability7d, 0, 1)
  };

  const normalizedSignals = normalizeContinuousSignals(rawSignals, stats);
  Object.entries(normalizedSignals.values).forEach(([feature, value]) => {
    addFeature(features, feature, value);
  });

  Object.entries(rawSignals).forEach(([feature]) => {
    descriptors[feature] = {
      feature,
      family: resolveFamily(feature),
      evidenceType: resolveEvidenceType(feature),
      text: resolveNaturalExplanation(feature)
    };
  });

  const nextStats = normalizedSignals.stats;
  nextStats.topConceptTotal += 1;
  if ((topConcept?.score ?? 0) >= 0.35) {
    nextStats.topConceptCovered += 1;
  }

  return {
    features,
    descriptors,
    topConcepts,
    intentEntropy,
    metadataQualityScore: rawSignals['nat:reliability:metadata_quality_score'] ?? 0,
    stats: nextStats
  };
}

export function computeVscodeActiveMs15m(metrics: DailyMetrics | null | undefined, now: number): number {
  if (!metrics || !Array.isArray(metrics.vscodeTimeline) || !metrics.vscodeTimeline.length) {
    return 0;
  }
  const since = now - 15 * 60 * 1000;
  return metrics.vscodeTimeline.reduce((acc, entry) => {
    const start = Number.isFinite(entry.startTime) ? entry.startTime : 0;
    const end = Number.isFinite(entry.endTime) ? entry.endTime : start;
    if (end <= since || start >= now) {
      return acc;
    }
    const overlap = Math.max(0, Math.min(end, now) - Math.max(start, since));
    return acc + overlap;
  }, 0);
}

function normalizeContinuousSignals(
  raw: Record<string, number>,
  previous: NaturalSignalStatsState
): { values: Record<string, number>; stats: NaturalSignalStatsState } {
  const values: Record<string, number> = {};
  const stats: NaturalSignalStatsState = {
    signalSamples: { ...previous.signalSamples },
    topConceptTotal: previous.topConceptTotal,
    topConceptCovered: previous.topConceptCovered
  };

  Object.entries(raw).forEach(([key, rawValue]) => {
    const value = Number.isFinite(rawValue) ? rawValue : 0;
    const samples = Array.isArray(stats.signalSamples[key]) ? [...(stats.signalSamples[key] ?? [])] : [];
    const normalized = zScoreWithWinsorization(value, samples);
    values[key] = normalized;
    samples.push(value);
    stats.signalSamples[key] = samples.slice(-MAX_SIGNAL_SAMPLES);
  });

  return { values, stats };
}

function zScoreWithWinsorization(value: number, samples: number[]): number {
  if (samples.length < 20) {
    return clamp(value / 5, -2, 2);
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const p01 = percentile(sorted, 0.01);
  const p99 = percentile(sorted, 0.99);
  const winsorized = clamp(value, p01, p99);
  const mean = sorted.reduce((acc, sample) => acc + sample, 0) / sorted.length;
  const variance = sorted.reduce((acc, sample) => acc + (sample - mean) * (sample - mean), 0) / sorted.length;
  const std = Math.sqrt(Math.max(variance, 1e-6));
  const z = (winsorized - mean) / std;
  return clamp(z / 3, -2, 2);
}

function percentile(sorted: number[], q: number): number {
  if (!sorted.length) {
    return 0;
  }
  const position = clamp(q, 0, 1) * (sorted.length - 1);
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  if (lowerIndex === upperIndex) {
    return sorted[lowerIndex] ?? 0;
  }
  const lower = sorted[lowerIndex] ?? 0;
  const upper = sorted[upperIndex] ?? 0;
  const fraction = position - lowerIndex;
  return lower + (upper - lower) * fraction;
}

function scoreConcepts(pageVector: DenseVector): NaturalConceptScore[] {
  return CONCEPT_PROTOTYPES
    .map((concept) => {
      const cosine = cosineSimilarity(pageVector, concept.vector);
      const score = clamp((cosine + 1) / 2, 0, 1);
      return {
        key: concept.key,
        label: concept.label,
        score
      };
    })
    .sort((a, b) => b.score - a.score);
}

function cosineSimilarity(a: DenseVector, b: DenseVector): number {
  if (a.norm <= 0 || b.norm <= 0) {
    return 0;
  }
  let dot = 0;
  for (let i = 0; i < a.values.length; i += 1) {
    dot += (a.values[i] ?? 0) * (b.values[i] ?? 0);
  }
  return dot / (a.norm * b.norm);
}

function buildTextVector(text: string): DenseVector {
  const tokens = tokenize(text);
  const ngrams = buildNgrams(tokens);
  const values = new Float32Array(CONCEPT_VECTOR_DIMENSIONS);
  ngrams.forEach((ngram) => {
    const { index, sign } = hashToken(ngram, CONCEPT_VECTOR_DIMENSIONS);
    values[index] = (values[index] ?? 0) + sign;
  });
  let normSquared = 0;
  for (let i = 0; i < values.length; i += 1) {
    const value = values[i] ?? 0;
    normSquared += value * value;
  }
  return {
    values,
    norm: Math.sqrt(normSquared)
  };
}

function buildPageText(metadata: DomainMetadata): string {
  const parts: string[] = [];
  parts.push(metadata.hostname ?? '');
  parts.push(metadata.title ?? '');
  parts.push(metadata.description ?? '');
  if (Array.isArray(metadata.keywords)) {
    parts.push(metadata.keywords.join(' '));
  }
  if (Array.isArray(metadata.headings)) {
    parts.push(metadata.headings.join(' '));
  }
  if (Array.isArray(metadata.pathTokens)) {
    parts.push(metadata.pathTokens.join(' '));
  }
  if (Array.isArray(metadata.schemaTypes)) {
    parts.push(metadata.schemaTypes.join(' '));
  }
  if (metadata.language) {
    parts.push(metadata.language);
  }
  return parts.join(' ');
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/gu)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && token.length <= 40)
    .slice(0, 240);
}

function buildNgrams(tokens: string[]): string[] {
  const grams: string[] = [];
  tokens.forEach((token) => {
    grams.push(token);
  });
  for (let i = 0; i < tokens.length - 1; i += 1) {
    grams.push(`${tokens[i]}_${tokens[i + 1]}`);
  }
  return grams.slice(0, 400);
}

function hashToken(value: string, dimensions: number): { index: number; sign: number } {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  const normalized = hash >>> 0;
  return {
    index: normalized % dimensions,
    sign: (normalized & 1) === 0 ? 1 : -1
  };
}

function estimateMetadataQuality(metadata: DomainMetadata): number {
  const checks = [
    Boolean(metadata.title && metadata.title.trim().length > 0),
    Boolean(metadata.description && metadata.description.trim().length > 0),
    Boolean(Array.isArray(metadata.keywords) && metadata.keywords.length > 0),
    Boolean(Array.isArray(metadata.headings) && metadata.headings.length > 0),
    Boolean(Array.isArray(metadata.pathTokens) && metadata.pathTokens.length > 0),
    Boolean(Array.isArray(metadata.schemaTypes) && metadata.schemaTypes.length > 0),
    Boolean(metadata.language),
    Number.isFinite(metadata.externalLinksCount),
    Number.isFinite(metadata.scrollDepth),
    Number.isFinite(metadata.interactionCount),
    Number.isFinite(metadata.activeMs),
    metadata.hasVideoPlayer || metadata.hasFeedLayout || metadata.hasFormFields || metadata.hasRichEditor
  ];
  const hits = checks.filter(Boolean).length;
  return safeDivide(hits, checks.length);
}

function resolveFamily(feature: string): string {
  if (feature.startsWith('nat:attention:')) return 'attention';
  if (feature.startsWith('nat:engagement:')) return 'engagement';
  if (feature.startsWith('nat:task_progress:')) return 'task_progress';
  if (feature.startsWith('nat:context:')) return 'context';
  if (feature.startsWith('nat:reliability:')) return 'reliability';
  return 'intent';
}

function resolveEvidenceType(
  feature: string
): 'intent' | 'attention' | 'engagement' | 'task_progress' | 'context' | 'reliability' {
  if (feature.startsWith('nat:attention:')) return 'attention';
  if (feature.startsWith('nat:engagement:')) return 'engagement';
  if (feature.startsWith('nat:task_progress:')) return 'task_progress';
  if (feature.startsWith('nat:context:')) return 'context';
  if (feature.startsWith('nat:reliability:')) return 'reliability';
  return 'intent';
}

function resolveNaturalExplanation(feature: string): string {
  switch (feature) {
    case 'nat:engagement:dwell_log':
      return 'Tempo de permanencia consistente na pagina';
    case 'nat:engagement:interaction_rate':
      return 'Taxa de interacao por minuto observada';
    case 'nat:engagement:scroll_completion':
      return 'Profundidade de leitura e rolagem da pagina';
    case 'nat:engagement:audible_ratio_14d':
      return 'Historico de sessoes com audio na ultima janela';
    case 'nat:attention:switch_rate_10m':
      return 'Frequencia de alternancia recente entre abas';
    case 'nat:attention:focus_continuity_10m':
      return 'Continuidade de foco no periodo recente';
    case 'nat:attention:return_latency_7d':
      return 'Latencia de retorno ao dominio nos ultimos dias';
    case 'nat:attention:fragmentation_index':
      return 'Fragmentacao do fluxo de atencao recente';
    case 'nat:task_progress:edit_density':
      return 'Densidade de edicao durante uso de editor';
    case 'nat:task_progress:form_progress_proxy':
      return 'Sinal de progresso em fluxo de formulario';
    case 'nat:task_progress:completion_proxy':
      return 'Sinal composto de progresso de leitura/tarefa';
    case 'nat:context:schedule_fit':
      return 'Acesso dentro do horario de trabalho configurado';
    case 'nat:context:out_of_schedule_ratio_14d':
      return 'Historico de uso fora de horario neste dominio';
    case 'nat:context:vscode_active_15m':
      return 'Atividade recente no VS Code em janela curta';
    case 'nat:context:vscode_share_15m':
      return 'Participacao relativa do VS Code no foco recente';
    case 'nat:reliability:metadata_quality_score':
      return 'Qualidade dos metadados coletados na pagina';
    case 'nat:reliability:signal_stability_7d':
      return 'Estabilidade dos sinais ao longo da semana';
    default:
      return 'Sinal natural do contexto de uso';
  }
}

function calculateEntropy(values: number[]): number {
  const positive = values.map((value) => Math.max(0, value));
  const total = positive.reduce((acc, value) => acc + value, 0);
  if (total <= 0) {
    return 1;
  }
  let entropy = 0;
  positive.forEach((value) => {
    if (value <= 0) {
      return;
    }
    const probability = value / total;
    entropy -= probability * Math.log(probability);
  });
  return entropy / Math.log(Math.max(2, positive.length));
}

function addFeature(features: FeatureMap, key: string, value: number): void {
  if (!Number.isFinite(value) || value === 0) {
    return;
  }
  features[key] = (features[key] ?? 0) + value;
}
