import type {
  DomainCategory,
  DomainMetadata,
  DomainSuggestion,
  ExtensionSettings,
  MlModelStatus,
  MlModelValidationStatus,
  SuggestionReasonStructured
} from '../shared/types.js';
import { formatDateKey, isWithinWorkSchedule } from '../shared/utils/time.js';
import { normalizeDomain } from '../shared/utils/domain.js';
import {
  classifyDomain as classifyDomainHeuristic,
  type ClassificationInput
} from '../shared/domain-classifier.js';
import { FeatureExtractor, type FeatureMap } from '../shared/ml/featureExtractor.js';
import { FeatureVectorizer, hashFeature, type SparseVector } from '../shared/ml/vectorizer.js';
import {
  ModelStore,
  deriveWideWarmStart,
  type LegacyStoredModelState,
  type StoredModelState,
  type StoredModelStateV2,
  type StoredModelStateV3
} from '../shared/ml/modelStore.js';
import { WideDeepLiteBinary, type WideDeepLiteInitState } from '../shared/ml/wideDeepLite.js';
import { PlattScaler, type CalibrationSample } from '../shared/ml/plattScaler.js';
import { MlTrainingStore, type StoredTrainingExample } from '../shared/ml/trainingStore.js';
import {
  aggregateDomainBehavior,
  buildBehaviorFeatureMap,
  deriveImplicitLabel,
  type DomainBehaviorStats
} from '../shared/ml/behaviorSignals.js';
import {
  buildBaselineSnapshotFromSamples,
  evaluateValidationGate,
  type ValidationBaselineSnapshot,
  type ValidationSample,
  type ValidationSummary
} from '../shared/ml/validationGate.js';

const MODEL_META_KEY = 'sg:ml-model-meta';

const MODEL_DIMENSIONS = 1 << 17;
const MODEL_EMBEDDING_DIM = 8;
const MODEL_HIDDEN_DIM = 16;
const MODEL_LR_WIDE = 0.03;
const MODEL_LR_DEEP = 0.01;
const MODEL_L2 = 1e-4;
const MODEL_CLIP_GRADIENT = 1.0;
const MODEL_MIN_FEATURE_COUNT = 5;

const GUARDED_POSITIVE_THRESHOLD = 0.78;
const GUARDED_NEGATIVE_THRESHOLD = 0.28;
const NORMAL_POSITIVE_THRESHOLD = 0.7;
const NORMAL_NEGATIVE_THRESHOLD = 0.3;

const TRAIN_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const TRAIN_MAX_EXAMPLES = 25_000;
const TRAIN_HOLDOUT_RATIO = 0.2;
const TRAIN_MAX_HOLDOUT = 2_000;
const EXPLICIT_SAMPLE_WEIGHT = 1.0;
const IMPLICIT_DOMAIN_COOLDOWN_MS = 6 * 60 * 60 * 1000;
const IMPLICIT_BEHAVIOR_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

interface ModelPrediction {
  probability: number;
  rawScore: number;
  classification: DomainCategory;
  confidence: number;
  reasons: string[];
  reasonsStructured: SuggestionReasonStructured[];
  vector: SparseVector;
}

type ReasonSource = 'content' | 'behavior' | 'heuristic';

interface ReasonCandidate {
  feature: string;
  score: number;
  weight: number;
  source: ReasonSource;
}

export interface CachedMlSuggestion {
  suggestion: DomainSuggestion;
  probability: number;
  prediction: ModelPrediction;
}

interface MlContext {
  extractor: FeatureExtractor;
  model: WideDeepLiteBinary;
  vectorizer: FeatureVectorizer;
  calibration: PlattScaler;
  guardrailStage: 'guarded' | 'normal';
  validationBaseline: ValidationBaselineSnapshot | null;
  validationSnapshot: ValidationSummary | null;
  store: ModelStore;
  trainingStore: MlTrainingStore;
  totalUpdates: number;
  explicitUpdates: number;
  implicitUpdates: number;
  lastUpdated: number;
  explicitSinceCalibration: number;
  lastCalibrationDayKey?: string;
}

export class MlSuggestionEngine {
  private context: MlContext | null = null;
  private contextPromise: Promise<MlContext> | null = null;

  async buildSuggestion(
    metadata: DomainMetadata,
    settings: ExtensionSettings,
    now = Date.now()
  ): Promise<CachedMlSuggestion> {
    const context = await this.getContext();
    const normalizedDomain = normalizeDomain(metadata.hostname);
    const behaviorStats = await this.recordAndAggregateBehavior(context, metadata, settings, now);
    const features = this.buildFeatureMap(context, metadata, settings, behaviorStats);
    const prediction = this.predict(context, features);

    const suggestion: DomainSuggestion = {
      domain: normalizedDomain,
      classification: prediction.classification,
      confidence: prediction.confidence,
      reasons: prediction.reasons,
      reasonsStructured: prediction.reasonsStructured,
      timestamp: now
    };

    await this.tryImplicitTraining(context, normalizedDomain, behaviorStats, prediction, now);

    return {
      suggestion,
      probability: prediction.probability,
      prediction
    };
  }

  async applyExplicitFeedback(
    domain: string,
    classification: DomainCategory,
    cached?: CachedMlSuggestion
  ): Promise<void> {
    if (classification !== 'productive' && classification !== 'procrastination') {
      return;
    }
    const context = await this.getContext();
    const label: 0 | 1 = classification === 'productive' ? 1 : 0;

    const fallbackFeatures = context.extractor.extract({ hostname: domain });
    const fallbackPrediction = this.predict(context, fallbackFeatures);
    const prediction = cached?.prediction ?? fallbackPrediction;

    context.vectorizer.incrementCounts(prediction.vector.indices);
    const trainVector = this.applyMinFeatureThreshold(prediction.vector, context.vectorizer);
    context.model.update(trainVector, label, EXPLICIT_SAMPLE_WEIGHT);

    context.totalUpdates += 1;
    context.explicitUpdates += 1;
    context.explicitSinceCalibration += 1;
    context.lastUpdated = Date.now();

    await context.trainingStore.addTrainingExample(
      this.toStoredExample(
        domain,
        'explicit',
        label,
        EXPLICIT_SAMPLE_WEIGHT,
        prediction.vector,
        this.classToBinary(prediction.classification, prediction.probability),
        prediction.rawScore
      ),
      {
        maxExamples: TRAIN_MAX_EXAMPLES,
        retentionMs: TRAIN_RETENTION_MS,
        holdoutRatio: TRAIN_HOLDOUT_RATIO,
        maxHoldout: TRAIN_MAX_HOLDOUT
      }
    );

    await this.maybeRecalibrate(context);
    await this.maybeEvaluateValidation(context);
    await this.persistContext(context);
  }

  async getStatus(): Promise<MlModelStatus | null> {
    try {
      const context = await this.getContext();
      if (!context.validationSnapshot) {
        await this.maybeEvaluateValidation(context);
      }

      const counts = context.vectorizer.getCounts();
      let activeFeatures = 0;
      for (let i = 0; i < counts.length; i += 1) {
        if (counts[i] >= context.vectorizer.minFeatureCount) {
          activeFeatures += 1;
        }
      }

      const calibrationState = context.calibration.getState();
      const validation = context.validationSnapshot;
      const thresholds = this.getDecisionThresholds(context.guardrailStage);

      const validationPayload: MlModelValidationStatus | null = validation
        ? {
            sampleSize: validation.sampleSize,
            macroF1: validation.macroF1,
            precisionProductive: validation.precisionProductive,
            falseProductiveRate: validation.falseProductiveRate,
            ece: validation.ece,
            brier: validation.brier,
            deltaMacroF1: validation.deltaMacroF1,
            deltaMacroF1CiLower: validation.deltaMacroF1CiLower,
            deltaMacroF1CiUpper: validation.deltaMacroF1CiUpper,
            mcnemarPValue: validation.mcnemarPValue,
            gatePassed: validation.gatePassed
          }
        : null;

      return {
        version: 3,
        dimensions: MODEL_DIMENSIONS,
        totalUpdates: context.totalUpdates,
        explicitUpdates: context.explicitUpdates,
        implicitUpdates: context.implicitUpdates,
        lastUpdated: context.lastUpdated,
        activeFeatures,
        learningRate: MODEL_LR_WIDE,
        l2: MODEL_L2,
        minFeatureCount: context.vectorizer.minFeatureCount,
        bias: context.model.getWideBias(),
        guardrailStage: context.guardrailStage,
        thresholds,
        calibration: {
          a: calibrationState.a,
          b: calibrationState.b,
          ece: calibrationState.ece,
          fittedAt: calibrationState.fittedAt,
          holdoutSize: calibrationState.holdoutSize
        },
        validation: validationPayload,
        falseProductiveRate: validation?.falseProductiveRate,
        precisionProductive: validation?.precisionProductive,
        deltaMacroF1: validation?.deltaMacroF1,
        mcnemarPValue: validation?.mcnemarPValue,
        ece: validation?.ece ?? calibrationState.ece
      };
    } catch (error) {
      console.warn('Falha ao obter status avançado do modelo ML', error);
      return null;
    }
  }

  private async getContext(): Promise<MlContext> {
    if (this.context) {
      return this.context;
    }
    if (this.contextPromise) {
      return this.contextPromise;
    }

    this.contextPromise = (async () => {
      const store = new ModelStore();
      const trainingStore = new MlTrainingStore();
      let stored: StoredModelState | null = null;
      try {
        stored = await store.load();
      } catch (error) {
        console.warn('Falha ao carregar estado ML v3', error);
      }

      const storedV3 = extractV3State(stored);
      const storedV2 = extractV2State(stored);
      const legacyStored = extractLegacyState(stored);

      const warmStart = deriveWideWarmStart(stored, MODEL_DIMENSIONS);
      const model = new WideDeepLiteBinary(
        {
          dimensions: MODEL_DIMENSIONS,
          embeddingDim: MODEL_EMBEDDING_DIM,
          hiddenDim: MODEL_HIDDEN_DIM,
          lrWide: MODEL_LR_WIDE,
          lrDeep: MODEL_LR_DEEP,
          l2: MODEL_L2,
          clipGradient: MODEL_CLIP_GRADIENT
        },
        storedV3 ? toWideDeepInitState(storedV3) : {
          wideWeights: warmStart.wideWeights,
          wideBias: warmStart.wideBias,
          seed: 42
        }
      );

      const vectorizerCounts = deriveFeatureCounts(storedV3, storedV2, legacyStored);
      const vectorizer = new FeatureVectorizer(
        { dimensions: MODEL_DIMENSIONS, minFeatureCount: MODEL_MIN_FEATURE_COUNT },
        vectorizerCounts
      );

      const calibration = new PlattScaler(
        storedV3?.calibration ??
          storedV2?.calibration ??
          undefined
      );

      const context: MlContext = {
        extractor: new FeatureExtractor(),
        model,
        vectorizer,
        calibration,
        guardrailStage: storedV3?.guardrailStage ?? 'guarded',
        validationBaseline: storedV3?.validationBaseline ?? null,
        validationSnapshot: storedV3?.validation ?? null,
        store,
        trainingStore,
        totalUpdates: storedV3?.totalUpdates ?? storedV2?.totalUpdates ?? legacyStored?.totalUpdates ?? 0,
        explicitUpdates: storedV3?.explicitUpdates ?? storedV2?.explicitUpdates ?? 0,
        implicitUpdates: storedV3?.implicitUpdates ?? storedV2?.implicitUpdates ?? 0,
        lastUpdated: storedV3?.lastUpdated ?? storedV2?.lastUpdated ?? legacyStored?.lastUpdated ?? 0,
        explicitSinceCalibration:
          storedV3?.explicitSinceCalibration ?? storedV2?.explicitSinceCalibration ?? 0,
        lastCalibrationDayKey: storedV3?.lastCalibrationDayKey ?? storedV2?.lastCalibrationDayKey
      };

      if (!context.validationBaseline) {
        context.validationBaseline = await this.buildBaselineFromHoldout(trainingStore);
      }
      await this.maybeEvaluateValidation(context);

      this.context = context;

      if (stored && !storedV3) {
        await this.persistContext(context);
      }

      return context;
    })();

    return this.contextPromise;
  }

  private async persistContext(context: MlContext): Promise<void> {
    const modelState = context.model.getState();
    const calibrationState = context.calibration.getState();

    const state: StoredModelStateV3 = {
      version: 3,
      schema: 'single-neural-lite-v3',
      model: modelState,
      featureCounts: Array.from(context.vectorizer.getCounts()),
      calibration: {
        a: calibrationState.a,
        b: calibrationState.b,
        fittedAt: calibrationState.fittedAt,
        holdoutSize: calibrationState.holdoutSize,
        ece: calibrationState.ece
      },
      guardrailStage: context.guardrailStage,
      validationBaseline: context.validationBaseline,
      validation: context.validationSnapshot,
      totalUpdates: context.totalUpdates,
      explicitUpdates: context.explicitUpdates,
      implicitUpdates: context.implicitUpdates,
      lastUpdated: context.lastUpdated,
      explicitSinceCalibration: context.explicitSinceCalibration,
      lastCalibrationDayKey: context.lastCalibrationDayKey
    };

    try {
      await context.store.save(state);
    } catch (error) {
      console.warn('Falha ao persistir estado ML v3', error);
    }

    try {
      await chrome.storage.local.set({
        [MODEL_META_KEY]: {
          version: state.version,
          stage: context.guardrailStage,
          lastUpdated: context.lastUpdated,
          totalUpdates: context.totalUpdates
        }
      });
    } catch (error) {
      console.warn('Falha ao atualizar metadados do modelo v3', error);
    }
  }

  private buildFeatureMap(
    context: MlContext,
    metadata: DomainMetadata,
    settings: ExtensionSettings,
    behaviorStats: DomainBehaviorStats
  ): FeatureMap {
    const features = context.extractor.extract(metadata);
    const behaviorFeatures = buildBehaviorFeatureMap(behaviorStats);
    Object.entries(behaviorFeatures).forEach(([feature, value]) => {
      features[feature] = (features[feature] ?? 0) + value;
    });

    const heuristic = classifyDomainHeuristic(toHeuristicInput(metadata), settings.learningSignals);
    addFeature(features, `heur:class:${heuristic.classification}`);
    addFeature(features, `heur:confidence_bucket:${bucketConfidence(heuristic.confidence)}`);
    const strongSignalCount = heuristic.reasons.filter((reason) =>
      /Host conhecido|Layout de feed|Editor/i.test(reason)
    ).length;
    addFeature(features, `heur:strong_signal_bucket:${bucketCount(strongSignalCount, [0, 1, 2, 4])}`);
    return features;
  }

  private predict(context: MlContext, features: FeatureMap): ModelPrediction {
    const vector = context.vectorizer.vectorize(features, {
      updateCounts: false,
      applyMinCount: false
    });
    const scoreVector = this.applyMinFeatureThreshold(vector, context.vectorizer);
    const rawScore = context.model.predictScore(scoreVector);
    const probability = context.calibration.transform(rawScore);

    const thresholds = this.getDecisionThresholds(context.guardrailStage);
    const classification = classifyFromThresholds(
      probability,
      thresholds.productive,
      thresholds.procrastination
    );
    const confidence = Math.round(Math.max(probability, 1 - probability) * 100);
    const reasonPayload = this.buildReasonPayload(
      features,
      context.vectorizer,
      (index) => context.model.getWideWeight(index),
      classification,
      4
    );

    return {
      probability,
      rawScore,
      classification,
      confidence,
      reasons: reasonPayload.reasons,
      reasonsStructured: reasonPayload.reasonsStructured,
      vector
    };
  }

  private buildReasonPayload(
    features: FeatureMap,
    vectorizer: FeatureVectorizer,
    getWeight: (index: number) => number,
    classification: DomainCategory,
    limit: number
  ): { reasons: string[]; reasonsStructured: SuggestionReasonStructured[] } {
    const contributions: ReasonCandidate[] = [];
    const counts = vectorizer.getCounts();

    Object.entries(features).forEach(([feature, value]) => {
      if (!Number.isFinite(value) || value === 0) {
        return;
      }
      const { index, sign } = hashFeature(feature, vectorizer.dimensions);
      if ((counts[index] ?? 0) < vectorizer.minFeatureCount) {
        return;
      }
      const weight = (getWeight(index) ?? 0) * sign;
      const score = weight * value;
      if (score === 0) {
        return;
      }
      contributions.push({
        feature,
        score,
        weight,
        source: inferReasonSource(feature)
      });
    });

    if (!contributions.length) {
      return {
        reasons: ['Sinais insuficientes para explicar a decisão.'],
        reasonsStructured: []
      };
    }

    contributions.sort((a, b) => Math.abs(b.score) - Math.abs(a.score));
    const primarySign = classification === 'productive' ? 1 : -1;
    const supportive = classification === 'neutral'
      ? contributions
      : contributions.filter((entry) => entry.score * primarySign > 0);
    const opposing = classification === 'neutral'
      ? []
      : contributions.filter((entry) => entry.score * primarySign < 0);

    const selectedSupportive = classification === 'neutral'
      ? supportive.slice(0, limit)
      : this.pickBalancedReasons(supportive, limit);
    const fallbackSelected = selectedSupportive.length ? selectedSupportive : contributions.slice(0, limit);

    const reasons = fallbackSelected.map((entry) => toReasonText(entry, false));
    const reasonsStructured = fallbackSelected.map((entry) => toStructuredReason(entry, false));

    if (opposing.length) {
      const counter = opposing[0];
      reasons.push(toReasonText(counter, true));
      reasonsStructured.push(toStructuredReason(counter, true));
    }

    return {
      reasons: reasons.slice(0, limit + 1),
      reasonsStructured: reasonsStructured.slice(0, limit + 1)
    };
  }

  private pickBalancedReasons(candidates: ReasonCandidate[], limit: number): ReasonCandidate[] {
    const selected: ReasonCandidate[] = [];
    const used = new Set<ReasonCandidate>();

    const pickBySource = (source: ReasonSource, max: number): void => {
      const sourceCandidates = candidates.filter((candidate) => candidate.source === source);
      for (let i = 0; i < sourceCandidates.length && max > 0; i += 1) {
        const candidate = sourceCandidates[i];
        if (used.has(candidate)) {
          continue;
        }
        selected.push(candidate);
        used.add(candidate);
        max -= 1;
      }
    };

    pickBySource('behavior', Math.min(2, limit));
    pickBySource('content', Math.min(2, Math.max(0, limit - selected.length)));

    if (selected.length < limit) {
      pickBySource('heuristic', Math.max(0, limit - selected.length));
    }

    if (selected.length < limit) {
      for (let i = 0; i < candidates.length && selected.length < limit; i += 1) {
        const candidate = candidates[i];
        if (used.has(candidate)) {
          continue;
        }
        selected.push(candidate);
        used.add(candidate);
      }
    }

    return selected;
  }

  private async recordAndAggregateBehavior(
    context: MlContext,
    metadata: DomainMetadata,
    settings: ExtensionSettings,
    now: number
  ): Promise<DomainBehaviorStats> {
    const domain = normalizeDomain(metadata.hostname);
    const outOfSchedule = !isWithinWorkSchedule(new Date(now), settings.workSchedule ?? []);
    await context.trainingStore.recordBehaviorEvent({
      domain,
      timestamp: now,
      activeMs: Math.max(0, metadata.activeMs ?? 0),
      interactionCount: Math.max(0, metadata.interactionCount ?? 0),
      hasFeedLayout: Boolean(metadata.hasFeedLayout),
      hasAutoplayMedia: Boolean(metadata.hasAutoplayMedia),
      hasShortsPattern: Boolean(metadata.hasShortsPattern),
      audible: Boolean(metadata.sessionAudible),
      outOfSchedule
    });
    await context.trainingStore.pruneBehavior(now - IMPLICIT_BEHAVIOR_RETENTION_MS);
    const events = await context.trainingStore.getBehaviorEvents(domain, now - 14 * 24 * 60 * 60 * 1000);
    return aggregateDomainBehavior(events, now);
  }

  private async tryImplicitTraining(
    context: MlContext,
    domain: string,
    behaviorStats: DomainBehaviorStats,
    prediction: ModelPrediction,
    now: number
  ): Promise<void> {
    const decision = deriveImplicitLabel(behaviorStats);
    if (!decision) {
      return;
    }

    const cooldownKey = `implicit:last:${domain}`;
    const lastImplicit = await context.trainingStore.getMeta<number>(cooldownKey);
    if (lastImplicit && now - lastImplicit < IMPLICIT_DOMAIN_COOLDOWN_MS) {
      return;
    }

    context.vectorizer.incrementCounts(prediction.vector.indices);
    const trainVector = this.applyMinFeatureThreshold(prediction.vector, context.vectorizer);
    context.model.update(trainVector, decision.label, decision.weight);

    context.totalUpdates += 1;
    context.implicitUpdates += 1;
    context.lastUpdated = now;

    await context.trainingStore.addTrainingExample(
      this.toStoredExample(
        domain,
        'implicit',
        decision.label,
        decision.weight,
        prediction.vector,
        this.classToBinary(prediction.classification, prediction.probability),
        prediction.rawScore
      ),
      {
        maxExamples: TRAIN_MAX_EXAMPLES,
        retentionMs: TRAIN_RETENTION_MS,
        holdoutRatio: TRAIN_HOLDOUT_RATIO,
        maxHoldout: TRAIN_MAX_HOLDOUT
      }
    );

    await context.trainingStore.setMeta(cooldownKey, now);
    await this.maybeRecalibrate(context);
    await this.maybeEvaluateValidation(context);
    await this.persistContext(context);
  }

  private async maybeRecalibrate(context: MlContext): Promise<void> {
    const now = Date.now();
    const todayKey = formatDateKey(new Date(now));
    const requiresDailyCalibration = context.lastCalibrationDayKey !== todayKey;
    const requiresExplicitCalibration = context.explicitSinceCalibration >= 50;
    if (!requiresDailyCalibration && !requiresExplicitCalibration) {
      return;
    }

    const holdout = await context.trainingStore.getHoldoutExamples(TRAIN_MAX_HOLDOUT);
    const samples: CalibrationSample[] = holdout.map((entry) => {
      const rawVector: SparseVector = {
        indices: entry.vector.indices,
        values: entry.vector.values
      };
      const thresholdedVector = this.applyMinFeatureThreshold(rawVector, context.vectorizer);
      return {
        score: context.model.predictScore(thresholdedVector),
        label: entry.label,
        weight: entry.weight
      };
    });

    context.calibration.fit(samples);
    context.explicitSinceCalibration = 0;
    context.lastCalibrationDayKey = todayKey;
  }

  private async maybeEvaluateValidation(context: MlContext): Promise<void> {
    const holdout = await context.trainingStore.getHoldoutExamples(TRAIN_MAX_HOLDOUT);
    if (!holdout.length) {
      return;
    }

    const samples: ValidationSample[] = holdout.map((entry) => {
      const rawVector: SparseVector = {
        indices: entry.vector.indices,
        values: entry.vector.values
      };
      const thresholdedVector = this.applyMinFeatureThreshold(rawVector, context.vectorizer);
      const score = context.model.predictScore(thresholdedVector);
      const probability = context.calibration.transform(score);
      return {
        label: entry.label,
        weight: entry.weight,
        baselinePrediction: resolveBaselinePrediction(entry),
        modelPrediction: probability >= 0.5 ? 1 : 0,
        modelProbability: probability
      };
    });

    const evaluation = evaluateValidationGate(samples, context.validationBaseline, {
      bootstrapIterations: 1000,
      bootstrapSeed: 4242,
      minSamples: 50
    });

    context.validationBaseline = evaluation.baseline;
    context.validationSnapshot = evaluation.summary;

    if (context.guardrailStage === 'guarded' && evaluation.summary.gatePassed) {
      context.guardrailStage = 'normal';
    }
  }

  private async buildBaselineFromHoldout(
    trainingStore: MlTrainingStore
  ): Promise<ValidationBaselineSnapshot | null> {
    const holdout = await trainingStore.getHoldoutExamples(TRAIN_MAX_HOLDOUT);
    if (!holdout.length) {
      return null;
    }

    const samples: ValidationSample[] = holdout.map((entry) => ({
      label: entry.label,
      weight: entry.weight,
      baselinePrediction: resolveBaselinePrediction(entry),
      modelPrediction: resolveBaselinePrediction(entry),
      modelProbability: 0.5
    }));

    return buildBaselineSnapshotFromSamples(samples, Date.now());
  }

  private toStoredExample(
    domain: string,
    source: 'explicit' | 'implicit',
    label: 0 | 1,
    weight: number,
    vector: SparseVector,
    baselinePrediction: 0 | 1,
    baselineScore: number
  ): Omit<StoredTrainingExample, 'id' | 'isHoldout'> {
    return {
      createdAt: Date.now(),
      domain: normalizeDomain(domain),
      source,
      label,
      weight,
      vector: {
        indices: vector.indices.slice(),
        values: vector.values.slice()
      },
      baselinePrediction,
      baselineScore
    };
  }

  private classToBinary(classification: DomainCategory, probability?: number): 0 | 1 {
    if (classification === 'productive') {
      return 1;
    }
    if (classification === 'procrastination') {
      return 0;
    }
    return Number.isFinite(probability) && (probability as number) >= 0.5 ? 1 : 0;
  }

  private applyMinFeatureThreshold(vector: SparseVector, vectorizer: FeatureVectorizer): SparseVector {
    const counts = vectorizer.getCounts();
    const indices: number[] = [];
    const values: number[] = [];
    for (let i = 0; i < vector.indices.length; i += 1) {
      const index = vector.indices[i];
      if ((counts[index] ?? 0) < vectorizer.minFeatureCount) {
        continue;
      }
      indices.push(index);
      values.push(vector.values[i]);
    }
    return { indices, values };
  }

  private getDecisionThresholds(stage: 'guarded' | 'normal'): { productive: number; procrastination: number } {
    if (stage === 'guarded') {
      return {
        productive: GUARDED_POSITIVE_THRESHOLD,
        procrastination: GUARDED_NEGATIVE_THRESHOLD
      };
    }
    return {
      productive: NORMAL_POSITIVE_THRESHOLD,
      procrastination: NORMAL_NEGATIVE_THRESHOLD
    };
  }
}

function resolveBaselinePrediction(entry: StoredTrainingExample): 0 | 1 {
  if (entry.baselinePrediction === 0 || entry.baselinePrediction === 1) {
    return entry.baselinePrediction;
  }
  if (entry.v2Prediction === 0 || entry.v2Prediction === 1) {
    return entry.v2Prediction;
  }
  if (entry.v1Prediction === 0 || entry.v1Prediction === 1) {
    return entry.v1Prediction;
  }
  return 0;
}

function deriveFeatureCounts(
  storedV3: StoredModelStateV3 | null,
  storedV2: StoredModelStateV2 | null,
  legacy: LegacyStoredModelState | null
): Uint32Array {
  if (storedV3?.featureCounts?.length === MODEL_DIMENSIONS) {
    return Uint32Array.from(storedV3.featureCounts);
  }
  if (storedV2?.v2FeatureCounts?.length === MODEL_DIMENSIONS) {
    return Uint32Array.from(storedV2.v2FeatureCounts);
  }
  const counts = new Uint32Array(MODEL_DIMENSIONS);
  if (legacy?.featureCounts?.length) {
    const size = Math.min(MODEL_DIMENSIONS, legacy.featureCounts.length);
    for (let i = 0; i < size; i += 1) {
      counts[i] = legacy.featureCounts[i] ?? 0;
    }
  }
  return counts;
}

function toWideDeepInitState(storedV3: StoredModelStateV3): WideDeepLiteInitState {
  const model = storedV3.model;
  return {
    wideWeights: toFloat32Array(model.wideWeights, model.dimensions),
    wideAccum: toFloat32Array(model.wideAccum, model.dimensions),
    wideBias: model.wideBias,
    wideBiasAccum: model.wideBiasAccum,
    embeddings: toFloat32Array(model.embeddings, model.dimensions * model.embeddingDim),
    embeddingsAccum: toFloat32Array(model.embeddingsAccum, model.dimensions * model.embeddingDim),
    hiddenWeights: toFloat32Array(model.hiddenWeights, model.hiddenDim * model.embeddingDim),
    hiddenAccum: toFloat32Array(model.hiddenAccum, model.hiddenDim * model.embeddingDim),
    hiddenBias: toFloat32Array(model.hiddenBias, model.hiddenDim),
    hiddenBiasAccum: toFloat32Array(model.hiddenBiasAccum, model.hiddenDim),
    outWeights: toFloat32Array(model.outWeights, model.hiddenDim),
    outWeightsAccum: toFloat32Array(model.outWeightsAccum, model.hiddenDim),
    outBias: model.outBias,
    outBiasAccum: model.outBiasAccum,
    seed: 42
  };
}

function toFloat32Array(values: number[], expectedLength: number): Float32Array {
  if (!Array.isArray(values) || values.length !== expectedLength) {
    return new Float32Array(expectedLength);
  }
  return Float32Array.from(values);
}

function extractLegacyState(stored: StoredModelState | null): LegacyStoredModelState | null {
  if (!stored) {
    return null;
  }
  if ('schema' in stored) {
    if (stored.schema === 'dual-model-v2') {
      return stored.legacy;
    }
    return null;
  }
  return stored as LegacyStoredModelState;
}

function extractV2State(stored: StoredModelState | null): StoredModelStateV2 | null {
  if (!stored) {
    return null;
  }
  if ('schema' in stored && stored.schema === 'dual-model-v2') {
    return stored;
  }
  return null;
}

function extractV3State(stored: StoredModelState | null): StoredModelStateV3 | null {
  if (!stored) {
    return null;
  }
  if ('schema' in stored && stored.schema === 'single-neural-lite-v3') {
    return stored;
  }
  return null;
}

function toHeuristicInput(metadata: DomainMetadata): ClassificationInput {
  return {
    hostname: metadata.hostname,
    title: metadata.title,
    description: metadata.description,
    keywords: metadata.keywords,
    ogType: metadata.ogType,
    hasVideoPlayer: Boolean(metadata.hasVideoPlayer),
    hasInfiniteScroll: Boolean(metadata.hasInfiniteScroll),
    hasAutoplayMedia: Boolean(metadata.hasAutoplayMedia),
    hasFeedLayout: Boolean(metadata.hasFeedLayout),
    hasFormFields: Boolean(metadata.hasFormFields),
    hasRichEditor: Boolean(metadata.hasRichEditor),
    hasLargeTable: Boolean(metadata.hasLargeTable),
    hasShortsPattern: Boolean(metadata.hasShortsPattern),
    schemaTypes: metadata.schemaTypes,
    headings: metadata.headings,
    pathTokens: metadata.pathTokens,
    language: metadata.language
  };
}

function classifyFromThresholds(
  probability: number,
  positiveThreshold: number,
  negativeThreshold: number
): DomainCategory {
  if (probability >= positiveThreshold) {
    return 'productive';
  }
  if (probability <= negativeThreshold) {
    return 'procrastination';
  }
  return 'neutral';
}

function addFeature(features: FeatureMap, feature: string): void {
  features[feature] = (features[feature] ?? 0) + 1;
}

function bucketCount(value: number, buckets: number[]): string {
  for (let i = 0; i < buckets.length; i += 1) {
    if (value <= buckets[i]) {
      return `<=${buckets[i]}`;
    }
  }
  return `>${buckets[buckets.length - 1]}`;
}

function bucketConfidence(confidence: number): string {
  if (confidence <= 40) return '<=40';
  if (confidence <= 60) return '<=60';
  if (confidence <= 80) return '<=80';
  return '>80';
}

function inferReasonSource(feature: string): ReasonSource {
  if (feature.startsWith('beh:')) {
    return 'behavior';
  }
  if (feature.startsWith('heur:')) {
    return 'heuristic';
  }
  return 'content';
}

function toReasonDirection(score: number): DomainCategory {
  return score >= 0 ? 'productive' : 'procrastination';
}

function toReasonImpact(weight: number): 'light' | 'medium' | 'strong' {
  const absolute = Math.abs(weight);
  if (absolute < 0.35) {
    return 'light';
  }
  if (absolute < 0.95) {
    return 'medium';
  }
  return 'strong';
}

function toReasonFamily(feature: string): string {
  const [prefix, family] = feature.split(':', 3);
  if (!prefix) {
    return 'signal';
  }
  if (prefix === 'beh') {
    return family ? `behavior:${family}` : 'behavior';
  }
  if (prefix === 'heur') {
    return family ? `heuristic:${family}` : 'heuristic';
  }
  return prefix;
}

function toReasonText(candidate: ReasonCandidate, counter: boolean): string {
  const direction = toReasonDirection(candidate.score) === 'productive' ? 'produtivo' : 'procrastinação';
  if (counter) {
    return `Contra-sinal: ${candidate.feature} aponta para ${direction}`;
  }
  return `Sinal: ${candidate.feature} favorece ${direction} (peso ${Math.abs(candidate.weight).toFixed(2)})`;
}

function toStructuredReason(candidate: ReasonCandidate, counter: boolean): SuggestionReasonStructured {
  return {
    family: toReasonFamily(candidate.feature),
    evidence: toReasonText(candidate, counter),
    direction: toReasonDirection(candidate.score),
    impact: toReasonImpact(candidate.weight),
    source: candidate.source,
    counter
  };
}
