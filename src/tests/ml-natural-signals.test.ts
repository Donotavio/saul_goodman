/// <reference path="../types/node-test.d.ts" />
import test from 'node:test';
import assert from 'node:assert/strict';
import type { DomainMetadata, ExtensionSettings } from '../shared/types.js';
import {
  buildNaturalSignalFeatures,
  createEmptyNaturalSignalStats
} from '../shared/ml/naturalSignals.js';

const DEFAULT_SETTINGS: ExtensionSettings = {
  productiveDomains: [],
  procrastinationDomains: [],
  weights: {
    procrastinationWeight: 1,
    tabSwitchWeight: 1,
    inactivityWeight: 1
  },
  inactivityThresholdMs: 60_000,
  locale: 'pt-BR',
  enableAutoClassification: true,
  vscodeIntegrationEnabled: true
};

const DEFAULT_BEHAVIOR = {
  sessions1d: 2,
  sessions7d: 7,
  sessions14d: 12,
  medianActiveMs14d: 180_000,
  bounceRate14d: 0.1,
  interactionRatePerMinute14d: 1.8,
  audibleRatio14d: 0.05,
  distractionRatio14d: 0.2,
  outOfScheduleRatio14d: 0.1
};

const BASE_ATTENTION = {
  tabSwitches10m: 2,
  activeMinutes10m: 8,
  revisits10m: 1,
  returnLatencyMs7d: 2 * 60 * 60 * 1000,
  signalStability7d: 0.75
};

function makeMetadata(overrides: Partial<DomainMetadata> = {}): DomainMetadata {
  return {
    hostname: 'portal.juridico.com.br',
    title: 'Pesquisa de jurisprudencia e direito tributario',
    description: 'Analise de processo e peticao com base legal',
    keywords: ['juridico', 'jurisprudencia', 'tribunal'],
    headings: ['Direito do trabalho', 'Guia de peticao'],
    pathTokens: ['pesquisa', 'jurisprudencia'],
    schemaTypes: ['Article'],
    language: 'pt-BR',
    hasVideoPlayer: false,
    hasInfiniteScroll: false,
    hasAutoplayMedia: false,
    hasFeedLayout: false,
    hasFormFields: true,
    hasRichEditor: true,
    hasLargeTable: true,
    hasShortsPattern: false,
    externalLinksCount: 4,
    scrollDepth: 0.6,
    interactionCount: 12,
    activeMs: 240_000,
    ...overrides
  };
}

test('natural concept scorer captures legal-work intent from multilingual terms', () => {
  const result = buildNaturalSignalFeatures(
    {
      metadata: makeMetadata({
        title: 'Analisis de jurisprudencia y derecho civil',
        description: 'Court filing, peticao e tribunal de justicia'
      }),
      behavior: DEFAULT_BEHAVIOR,
      settings: DEFAULT_SETTINGS,
      attention: BASE_ATTENTION,
      context: {
        scheduleFit: 1,
        vscodeActiveMs15m: 90_000,
        vscodeShare15m: 0.4
      },
      metrics: null
    },
    createEmptyNaturalSignalStats()
  );

  assert.ok(result.topConcepts.length >= 1);
  const topConceptKeys = result.topConcepts.map((entry) => entry.key);
  assert.ok(topConceptKeys.includes('work_legal'));
  assert.ok(result.metadataQualityScore >= 0 && result.metadataQualityScore <= 1);
});

test('intent entropy increases when semantic intent is mixed', () => {
  const focused = buildNaturalSignalFeatures(
    {
      metadata: makeMetadata(),
      behavior: DEFAULT_BEHAVIOR,
      settings: DEFAULT_SETTINGS,
      attention: BASE_ATTENTION,
      context: {
        scheduleFit: 1,
        vscodeActiveMs15m: 120_000,
        vscodeShare15m: 0.5
      },
      metrics: null
    },
    createEmptyNaturalSignalStats()
  );

  const mixed = buildNaturalSignalFeatures(
    {
      metadata: makeMetadata({
        title: 'Feed de reels com ofertas e stories',
        description: 'Shopping, social feed, desconto, memes e watch live',
        keywords: ['feed', 'reels', 'shop', 'sale', 'social']
      }),
      behavior: {
        ...DEFAULT_BEHAVIOR,
        distractionRatio14d: 0.7,
        audibleRatio14d: 0.4
      },
      settings: DEFAULT_SETTINGS,
      attention: {
        ...BASE_ATTENTION,
        tabSwitches10m: 7,
        revisits10m: 3
      },
      context: {
        scheduleFit: 0,
        vscodeActiveMs15m: 15_000,
        vscodeShare15m: 0.1
      },
      metrics: null
    },
    focused.stats
  );

  assert.ok(mixed.intentEntropy >= focused.intentEntropy);
});

test('continuous natural features keep monotonic direction in low-history mode', () => {
  const coldStats = createEmptyNaturalSignalStats();
  const low = buildNaturalSignalFeatures(
    {
      metadata: makeMetadata({ interactionCount: 2, activeMs: 180_000 }),
      behavior: DEFAULT_BEHAVIOR,
      settings: DEFAULT_SETTINGS,
      attention: BASE_ATTENTION,
      context: {
        scheduleFit: 1,
        vscodeActiveMs15m: 30_000,
        vscodeShare15m: 0.2
      },
      metrics: null
    },
    coldStats
  );
  const high = buildNaturalSignalFeatures(
    {
      metadata: makeMetadata({ interactionCount: 20, activeMs: 180_000 }),
      behavior: DEFAULT_BEHAVIOR,
      settings: DEFAULT_SETTINGS,
      attention: BASE_ATTENTION,
      context: {
        scheduleFit: 1,
        vscodeActiveMs15m: 30_000,
        vscodeShare15m: 0.2
      },
      metrics: null
    },
    low.stats
  );

  const lowValue = low.features['nat:engagement:interaction_rate'] ?? 0;
  const highValue = high.features['nat:engagement:interaction_rate'] ?? 0;
  assert.ok(highValue > lowValue);
});
