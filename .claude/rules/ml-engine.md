---
globs: src/shared/ml/**, src/background/ml-engine.ts, tools/ml_replay/**
---

# ML Engine Rules

## Arquitetura do Modelo
- WideDeepLiteBinary: componente wide (linear) + deep lite (embedding -> hidden)
- Config: dimensions, embeddingDim, hiddenDim, lrWide, lrDeep, l2, clipGradient
- State: wideWeights[], wideAccum[], embeddings[], hiddenWeights[], hiddenBias[]
- Ativacao: sigmoid
- Persistencia IndexedDB: schema `single-neural-lite-v4`

## Feature Extraction
- FeatureVectorizer: hashing trick com 131,072 dimensoes
- Input: hostname, title, description, keywords, headings, ogType, schemaTypes, pathTokens
- Features comportamentais: hasVideoPlayer, hasInfiniteScroll, hasAutoplayMedia, hasFeedLayout, etc.
- Features quantitativas: externalLinksCount, activeMs, scrollDepth, interactionCount

## Natural Signals (6 categorias semanticas)
- Attention: tabSwitches10m, activeMinutes10m, revisits10m, returnLatencyMs7d, signalStability7d
- Context: scheduleFit, vscodeActiveMs15m, vscodeShare15m
- CONCEPT_VECTOR_DIMENSIONS = 256, MAX_SIGNAL_SAMPLES = 256
- Janelas temporais: 10m, 15m, 7d

## Calibracao
- Temperature scaling no split de calibracao (NUNCA no split de treino)
- ECE (Expected Calibration Error): bins=10, clampProbability
- Reliability bins: lowerBound, upperBound, count, averageConfidence, averageAccuracy

## Validation Gate
- Metricas: macroF1, precisionProductive, falseProductiveRate, ece, brier
- Comparacao com baseline: deltaMacroF1, bootstrap CI (lower/upper), McNemar p-value
- Gate deve PASSAR antes de relaxar thresholds (guarded -> normal)
- Sempre capturar ValidationBaselineSnapshot antes de mudancas

## Regras criticas
- Splits: explicit labels -> train/calibration/test (deterministico); implicit -> train only
- Pseudo-labels: high-confidence, temporal stability, daily limit, quarantine on contradiction
- Ablation obrigatoria: `no_attention` para features `nat:attention:*`
- Leakage check ANTES de qualquer claim de metrica
- Active learning: threshold proximity, depois uncertainty
