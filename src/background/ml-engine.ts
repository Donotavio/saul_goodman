import type {
  DomainCategory,
  DomainMetadata,
  DomainSuggestion,
  ExtensionSettings,
  MlModelStatus,
  MlShadowStatus,
  MlVariant,
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
import { OnlineLogisticRegression } from '../shared/ml/onlineLogisticRegression.js';
import {
  ModelStore,
  type LegacyStoredModelState,
  type StoredModelState,
  type StoredModelStateV2
} from '../shared/ml/modelStore.js';
import { FtrlProximalBinary } from '../shared/ml/ftrlProximal.js';
import { PlattScaler, type CalibrationSample } from '../shared/ml/plattScaler.js';
import { MlTrainingStore, type StoredTrainingExample } from '../shared/ml/trainingStore.js';
import {
  aggregateDomainBehavior,
  buildBehaviorFeatureMap,
  deriveImplicitLabel,
  type DomainBehaviorStats
} from '../shared/ml/behaviorSignals.js';
import {
  createEmptyConfusion,
  createInitialRollout,
  evaluateGate,
  maybePromoteRollout,
  resolveVariantByRollout,
  updateConfusion,
  type ShadowMetrics,
  type RolloutState
} from '../shared/ml/rollout.js';

const MODEL_META_KEY = 'sg:ml-model-meta';

const LEGACY_DIMENSIONS = 1 << 16;
const LEGACY_LEARNING_RATE = 0.05;
const LEGACY_L2 = 0.0005;
const LEGACY_MIN_FEATURE_COUNT = 3;
const LEGACY_POSITIVE_THRESHOLD = 0.6;
const LEGACY_NEGATIVE_THRESHOLD = 0.4;

const V2_DIMENSIONS = 1 << 17;
const V2_ALPHA = 0.05;
const V2_BETA = 1.0;
const V2_L1 = 1e-6;
const V2_L2 = 1e-4;
const V2_MIN_FEATURE_COUNT = 5;
const V2_POSITIVE_THRESHOLD = 0.7;
const V2_NEGATIVE_THRESHOLD = 0.3;

const TRAIN_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const TRAIN_MAX_EXAMPLES = 25_000;
const TRAIN_HOLDOUT_RATIO = 0.2;
const TRAIN_MAX_HOLDOUT = 2_000;
const EXPLICIT_SAMPLE_WEIGHT = 1.0;
const IMPLICIT_DOMAIN_COOLDOWN_MS = 6 * 60 * 60 * 1000;
const IMPLICIT_BEHAVIOR_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

interface VariantPrediction {
  variant: MlVariant;
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
  activeVariant: MlVariant;
  predictionV1: VariantPrediction;
  predictionV2: VariantPrediction;
}

interface MlContext {
  extractor: FeatureExtractor;
  legacyModel: OnlineLogisticRegression;
  legacyVectorizer: FeatureVectorizer;
  v2Model: FtrlProximalBinary;
  v2Vectorizer: FeatureVectorizer;
  calibration: PlattScaler;
  rollout: RolloutState;
  shadow: ShadowMetrics;
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
    const predictionV1 = this.predictWithLegacy(context, features);
    const predictionV2 = this.predictWithV2(context, features);
    const activeVariant = resolveVariantByRollout(context.rollout);
    const activePrediction = activeVariant === 'v2' ? predictionV2 : predictionV1;

    const suggestion: DomainSuggestion = {
      domain: normalizedDomain,
      classification: activePrediction.classification,
      confidence: activePrediction.confidence,
      reasons: activePrediction.reasons,
      reasonsStructured: activePrediction.reasonsStructured,
      timestamp: now
    };

    await this.tryImplicitTraining(
      context,
      normalizedDomain,
      behaviorStats,
      predictionV1,
      predictionV2,
      now
    );

    return {
      suggestion,
      probability: activePrediction.probability,
      activeVariant,
      predictionV1,
      predictionV2
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
    const fallbackV1 = context.legacyVectorizer.vectorize(fallbackFeatures, {
      updateCounts: false,
      applyMinCount: false
    });
    const fallbackV2 = context.v2Vectorizer.vectorize(fallbackFeatures, {
      updateCounts: false,
      applyMinCount: false
    });
    const v1Vector = cached?.predictionV1.vector ?? fallbackV1;
    const v2Vector = cached?.predictionV2.vector ?? fallbackV2;

    context.legacyVectorizer.incrementCounts(v1Vector.indices);
    context.v2Vectorizer.incrementCounts(v2Vector.indices);
    const trainV1Vector = this.applyMinFeatureThreshold(v1Vector, context.legacyVectorizer);
    const trainV2Vector = this.applyMinFeatureThreshold(v2Vector, context.v2Vectorizer);
    context.legacyModel.update(trainV1Vector, label, EXPLICIT_SAMPLE_WEIGHT);
    context.v2Model.update(trainV2Vector, label, EXPLICIT_SAMPLE_WEIGHT);

    context.shadow.v1 = updateConfusion(
      context.shadow.v1,
      this.predictionToBinary(cached?.predictionV1),
      label
    );
    context.shadow.v2 = updateConfusion(
      context.shadow.v2,
      this.predictionToBinary(cached?.predictionV2),
      label
    );
    context.shadow.explicitCount += 1;
    context.shadow.lastUpdated = Date.now();

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
        v2Vector,
        cached?.predictionV1.classification ?? 'neutral',
        cached?.predictionV1.probability ?? 0.5,
        cached?.predictionV2.classification ?? 'neutral',
        cached?.predictionV2.probability ?? 0.5,
        cached?.predictionV2.rawScore ?? context.v2Model.predictScore(v2Vector)
      ),
      {
        maxExamples: TRAIN_MAX_EXAMPLES,
        retentionMs: TRAIN_RETENTION_MS,
        holdoutRatio: TRAIN_HOLDOUT_RATIO,
        maxHoldout: TRAIN_MAX_HOLDOUT
      }
    );

    await this.maybeRecalibrate(context);
    const promoted = maybePromoteRollout(context.rollout, context.shadow, Date.now());
    context.rollout = promoted.state;
    await this.persistContext(context);
  }

  async getStatus(): Promise<MlModelStatus | null> {
    try {
      const context = await this.getContext();
      const counts = context.v2Vectorizer.getCounts();
      let activeFeatures = 0;
      for (let i = 0; i < counts.length; i += 1) {
        if (counts[i] >= context.v2Vectorizer.minFeatureCount) {
          activeFeatures += 1;
        }
      }
      const gate = evaluateGate(context.shadow);
      const shadow: MlShadowStatus = {
        explicitCount: context.shadow.explicitCount,
        macroF1V1: gate.macroF1V1,
        macroF1V2: gate.macroF1V2,
        deltaMacroF1: gate.deltaMacroF1,
        precisionDropProductive: gate.precisionDropProductive,
        precisionDropProcrastination: gate.precisionDropProcrastination,
        gatePassed: gate.passed
      };
      const calibrationState = context.calibration.getState();

      return {
        version: 2,
        dimensions: V2_DIMENSIONS,
        totalUpdates: context.totalUpdates,
        explicitUpdates: context.explicitUpdates,
        implicitUpdates: context.implicitUpdates,
        lastUpdated: context.lastUpdated,
        activeFeatures,
        learningRate: V2_ALPHA,
        l2: V2_L2,
        minFeatureCount: context.v2Vectorizer.minFeatureCount,
        bias: context.v2Model.getBiasWeight(),
        activeVariant: resolveVariantByRollout(context.rollout),
        rolloutStage: context.rollout.stage,
        thresholds: {
          productive: V2_POSITIVE_THRESHOLD,
          procrastination: V2_NEGATIVE_THRESHOLD
        },
        calibration: {
          a: calibrationState.a,
          b: calibrationState.b,
          ece: calibrationState.ece,
          fittedAt: calibrationState.fittedAt,
          holdoutSize: calibrationState.holdoutSize
        },
        shadow
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
      const installBucket = await this.getOrCreateInstallBucket(trainingStore);
      let stored: StoredModelState | null = null;
      try {
        stored = await store.load();
      } catch (error) {
        console.warn('Falha ao carregar estado ML v2', error);
      }

      const now = Date.now();
      const legacyStored = extractLegacyState(stored);
      const legacyWeights = legacyStored?.dimensions === LEGACY_DIMENSIONS
        ? Float32Array.from(legacyStored.weights)
        : new Float32Array(LEGACY_DIMENSIONS);
      const legacyCounts = legacyStored?.dimensions === LEGACY_DIMENSIONS
        ? Uint32Array.from(legacyStored.featureCounts)
        : new Uint32Array(LEGACY_DIMENSIONS);
      const legacyModel = new OnlineLogisticRegression(
        {
          dimensions: LEGACY_DIMENSIONS,
          learningRate: LEGACY_LEARNING_RATE,
          l2: LEGACY_L2
        },
        legacyWeights,
        legacyStored?.bias ?? 0
      );
      const legacyVectorizer = new FeatureVectorizer(
        { dimensions: LEGACY_DIMENSIONS, minFeatureCount: LEGACY_MIN_FEATURE_COUNT },
        legacyCounts
      );

      const storedV2 = extractV2State(stored);
      const v2Model = new FtrlProximalBinary({
        dimensions: V2_DIMENSIONS,
        alpha: V2_ALPHA,
        beta: V2_BETA,
        l1: V2_L1,
        l2: V2_L2
      },
      storedV2?.v2?.dimensions === V2_DIMENSIONS ? Float32Array.from(storedV2.v2.z) : undefined,
      storedV2?.v2?.dimensions === V2_DIMENSIONS ? Float32Array.from(storedV2.v2.n) : undefined,
      storedV2?.v2
        ? {
            z: storedV2.v2.biasZ ?? 0,
            n: storedV2.v2.biasN ?? 0
          }
        : undefined);
      const v2Counts = storedV2?.v2FeatureCounts?.length === V2_DIMENSIONS
        ? Uint32Array.from(storedV2.v2FeatureCounts)
        : new Uint32Array(V2_DIMENSIONS);
      const v2Vectorizer = new FeatureVectorizer(
        { dimensions: V2_DIMENSIONS, minFeatureCount: V2_MIN_FEATURE_COUNT },
        v2Counts
      );
      const calibration = new PlattScaler(storedV2?.calibration ?? undefined);
      const rollout = storedV2?.rollout
        ? {
            ...storedV2.rollout,
            installBucket: Number.isFinite(storedV2.rollout.installBucket)
              ? storedV2.rollout.installBucket
              : installBucket
          }
        : createInitialRollout(now, installBucket);
      const shadow = storedV2?.shadow ?? {
        explicitCount: 0,
        v1: createEmptyConfusion(),
        v2: createEmptyConfusion(),
        lastUpdated: 0
      };

      const context: MlContext = {
        extractor: new FeatureExtractor(),
        legacyModel,
        legacyVectorizer,
        v2Model,
        v2Vectorizer,
        calibration,
        rollout,
        shadow,
        store,
        trainingStore,
        totalUpdates: storedV2?.totalUpdates ?? legacyStored?.totalUpdates ?? 0,
        explicitUpdates: storedV2?.explicitUpdates ?? 0,
        implicitUpdates: storedV2?.implicitUpdates ?? 0,
        lastUpdated: storedV2?.lastUpdated ?? legacyStored?.lastUpdated ?? 0,
        explicitSinceCalibration: storedV2?.explicitSinceCalibration ?? 0,
        lastCalibrationDayKey: storedV2?.lastCalibrationDayKey
      };
      this.context = context;
      return context;
    })();

    return this.contextPromise;
  }

  private async persistContext(context: MlContext): Promise<void> {
    const legacy: LegacyStoredModelState = {
      version: 1,
      dimensions: LEGACY_DIMENSIONS,
      weights: Array.from(context.legacyModel.getWeights()),
      bias: context.legacyModel.getBias(),
      featureCounts: Array.from(context.legacyVectorizer.getCounts()),
      totalUpdates: context.totalUpdates,
      lastUpdated: context.lastUpdated
    };
    const calibrationState = context.calibration.getState();
    const v2State: StoredModelStateV2 = {
      version: 2,
      schema: 'dual-model-v2',
      legacy,
      v2: {
        dimensions: V2_DIMENSIONS,
        alpha: V2_ALPHA,
        beta: V2_BETA,
        l1: V2_L1,
        l2: V2_L2,
        z: Array.from(context.v2Model.getZ()),
        n: Array.from(context.v2Model.getN()),
        biasZ: context.v2Model.getBiasState().z,
        biasN: context.v2Model.getBiasState().n
      },
      v2FeatureCounts: Array.from(context.v2Vectorizer.getCounts()),
      calibration: {
        a: calibrationState.a,
        b: calibrationState.b,
        fittedAt: calibrationState.fittedAt,
        holdoutSize: calibrationState.holdoutSize,
        ece: calibrationState.ece
      },
      rollout: context.rollout,
      shadow: context.shadow,
      totalUpdates: context.totalUpdates,
      explicitUpdates: context.explicitUpdates,
      implicitUpdates: context.implicitUpdates,
      lastUpdated: context.lastUpdated,
      explicitSinceCalibration: context.explicitSinceCalibration,
      lastCalibrationDayKey: context.lastCalibrationDayKey
    };

    try {
      await context.store.save(v2State);
    } catch (error) {
      console.warn('Falha ao persistir estado ML v2', error);
    }

    try {
      await chrome.storage.local.set({
        [MODEL_META_KEY]: {
          version: v2State.version,
          stage: context.rollout.stage,
          activeVariant: resolveVariantByRollout(context.rollout),
          lastUpdated: context.lastUpdated,
          totalUpdates: context.totalUpdates
        }
      });
    } catch (error) {
      console.warn('Falha ao atualizar metadados do modelo v2', error);
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

  private predictWithLegacy(context: MlContext, features: FeatureMap): VariantPrediction {
    const vector = context.legacyVectorizer.vectorize(features, {
      updateCounts: false,
      applyMinCount: false
    });
    const scoreVector = this.applyMinFeatureThreshold(vector, context.legacyVectorizer);
    const rawScore = context.legacyModel.predictScore(scoreVector);
    const probability = context.legacyModel.predictProbability(scoreVector);
    const classification = classifyFromThresholds(
      probability,
      LEGACY_POSITIVE_THRESHOLD,
      LEGACY_NEGATIVE_THRESHOLD
    );
    const confidence = Math.round(Math.max(probability, 1 - probability) * 100);
    const reasonPayload = this.buildReasonPayload(
      features,
      context.legacyVectorizer,
      (index) => context.legacyModel.getWeights()[index] ?? 0,
      classification,
      3
    );
    return {
      variant: 'v1',
      probability,
      rawScore,
      classification,
      confidence,
      reasons: reasonPayload.reasons,
      reasonsStructured: reasonPayload.reasonsStructured,
      vector
    };
  }

  private predictWithV2(context: MlContext, features: FeatureMap): VariantPrediction {
    const vector = context.v2Vectorizer.vectorize(features, {
      updateCounts: false,
      applyMinCount: false
    });
    const scoreVector = this.applyMinFeatureThreshold(vector, context.v2Vectorizer);
    const rawScore = context.v2Model.predictScore(scoreVector);
    const probability = context.calibration.transform(rawScore);
    const classification = classifyFromThresholds(
      probability,
      V2_POSITIVE_THRESHOLD,
      V2_NEGATIVE_THRESHOLD
    );
    const confidence = Math.round(Math.max(probability, 1 - probability) * 100);
    const reasonPayload = this.buildReasonPayload(
      features,
      context.v2Vectorizer,
      (index) => context.v2Model.getWeight(index),
      classification,
      4
    );
    return {
      variant: 'v2',
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
    predictionV1: VariantPrediction,
    predictionV2: VariantPrediction,
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

    context.legacyVectorizer.incrementCounts(predictionV1.vector.indices);
    context.v2Vectorizer.incrementCounts(predictionV2.vector.indices);
    const trainV1Vector = this.applyMinFeatureThreshold(predictionV1.vector, context.legacyVectorizer);
    const trainV2Vector = this.applyMinFeatureThreshold(predictionV2.vector, context.v2Vectorizer);
    context.legacyModel.update(trainV1Vector, decision.label, decision.weight);
    context.v2Model.update(trainV2Vector, decision.label, decision.weight);
    context.totalUpdates += 1;
    context.implicitUpdates += 1;
    context.lastUpdated = now;

    await context.trainingStore.addTrainingExample(
      this.toStoredExample(
        domain,
        'implicit',
        decision.label,
        decision.weight,
        predictionV2.vector,
        predictionV1.classification,
        predictionV1.probability,
        predictionV2.classification,
        predictionV2.probability,
        predictionV2.rawScore
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
      const thresholdedVector = this.applyMinFeatureThreshold(rawVector, context.v2Vectorizer);
      return {
        score: context.v2Model.predictScore(thresholdedVector),
        label: entry.label,
        weight: entry.weight
      };
    });
    context.calibration.fit(samples);
    context.explicitSinceCalibration = 0;
    context.lastCalibrationDayKey = todayKey;
  }

  private toStoredExample(
    domain: string,
    source: 'explicit' | 'implicit',
    label: 0 | 1,
    weight: number,
    vector: SparseVector,
    v1Classification: DomainCategory,
    v1Probability: number,
    v2Classification: DomainCategory,
    v2Probability: number,
    v2Score: number
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
      v1Prediction: this.classToBinary(v1Classification, v1Probability),
      v2Prediction: this.classToBinary(v2Classification, v2Probability),
      v2Score
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

  private predictionToBinary(prediction?: VariantPrediction): 0 | 1 {
    if (!prediction) {
      return 0;
    }
    return this.classToBinary(prediction.classification, prediction.probability);
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

  private async getOrCreateInstallBucket(store: MlTrainingStore): Promise<number> {
    const existing = await store.getMeta<number>('rollout:installBucket');
    if (Number.isFinite(existing)) {
      return Math.max(0, Math.min(99, Math.floor(existing as number)));
    }
    const bucket = Math.floor(Math.random() * 100);
    await store.setMeta('rollout:installBucket', bucket);
    return bucket;
  }
}

function extractLegacyState(stored: StoredModelState | null): LegacyStoredModelState | null {
  if (!stored) {
    return null;
  }
  if ('schema' in stored) {
    return stored.legacy;
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
