import fs from 'node:fs/promises';
import path from 'node:path';
import { buildReliabilityBins } from '../../src/shared/ml/calibrationMetrics.js';
import { featureNameContainsAttentionSignal } from '../../src/shared/ml/featureScenarios.js';
import {
  TemperatureScaler,
  type CalibrationSample,
  type TemperatureCalibrationFitResult
} from '../../src/shared/ml/temperatureScaler.js';
import {
  buildBaselineSnapshotFromSamples,
  evaluateValidationGate,
  type ValidationBaselineSnapshot,
  type ValidationSample,
  type ValidationSummary
} from '../../src/shared/ml/validationGate.js';
import { WideDeepLiteBinary } from '../../src/shared/ml/wideDeepLite.js';
import type { SparseVector } from '../../src/shared/ml/vectorizer.js';
import type { CalibrationReliabilityBin } from '../../src/shared/ml/calibrationMetrics.js';

type TrainingSource = 'explicit' | 'implicit';
type TrainingSplit = 'train' | 'calibration' | 'test';
type ScenarioName = 'baseline' | 'trained' | 'natural' | 'natural+self';
type ScenarioStatus = 'computed' | 'skipped_missing_fields' | 'skipped_missing_feature_names';
type SplitMethod = 'provided_dataset' | 'chronological_explicit' | 'stratified_seeded';

interface CliOptions {
  inputPath: string;
  outDir: string;
  name?: string;
  seed: number;
  trainRatio: number;
  bootstrapIterations: number;
  minSamples: number;
  dimensions?: number;
  minFeatureCount: number;
}

interface InputDataset {
  rows: unknown[];
  featureDictionary: Map<number, string>;
}

interface NormalizedSample {
  rowIndex: number;
  label: 0 | 1;
  vector: SparseVector;
  featureNames?: string[];
  source: TrainingSource;
  split?: TrainingSplit;
  weight: number;
  timestamp: number | null;
  baselinePrediction: 0 | 1;
  baselineScore?: number;
  naturalPrediction?: 0 | 1;
  naturalProbability?: number;
  naturalSelfPrediction?: 0 | 1;
  naturalSelfProbability?: number;
}

interface DatasetSummary {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  invalidReasons: Record<string, number>;
  missingTimestampRows: number;
  labelCounts: {
    productive: number;
    procrastination: number;
  };
  sourceCounts: {
    explicit: number;
    implicit: number;
  };
  hasFeatureNames: boolean;
}

interface SplitSummary {
  method: SplitMethod;
  trainSize: number;
  calibrationSize: number;
  testSize: number;
  trainLabelCounts: LabelCounts;
  calibrationLabelCounts: LabelCounts;
  testLabelCounts: LabelCounts;
}

interface LabelCounts {
  productive: number;
  procrastination: number;
}

interface DimensionSummary {
  provided?: number;
  resolved: number;
  maxObservedIndex: number;
  autoAdjustedFromProvided: boolean;
}

interface ScenarioComparison {
  deltaFalseProductiveRate: number;
  deltaPrecisionProductive: number;
  deltaMacroF1: number;
}

interface ScenarioReport {
  name: ScenarioName;
  status: ScenarioStatus;
  sampleSize: number;
  summary?: ValidationSummary;
  baseline?: ValidationBaselineSnapshot;
  comparisonToBaseline?: ScenarioComparison;
  missingCount?: number;
  missingFields?: string[];
  reliabilityBins?: CalibrationReliabilityBin[];
}

interface AttentionAblationReport {
  status: 'computed' | 'skipped_missing_feature_names';
  attentionRisk: boolean;
  full?: ScenarioReport;
  noAttention?: ScenarioReport;
  reason?: string;
}

interface ReplayReport {
  runName: string;
  generatedAt: string;
  inputPath: string;
  outputDir: string;
  config: {
    seed: number;
    trainRatio: number;
    calibrationRatio: number;
    testRatio: number;
    bootstrapIterations: number;
    minSamples: number;
    minFeatureCount: number;
    dimensions?: number;
  };
  dataset: DatasetSummary;
  split: SplitSummary;
  model: {
    dimensions: number;
    embeddingDim: number;
    hiddenDim: number;
    lrWide: number;
    lrDeep: number;
    l2: number;
    clipGradient: number;
  };
  dimensions: DimensionSummary;
  calibration: TemperatureCalibrationFitResult;
  scenarios: ScenarioReport[];
  attentionAblation: AttentionAblationReport;
  warnings: string[];
}

interface ParsedDataset {
  validRows: NormalizedSample[];
  summary: DatasetSummary;
}

interface SplitResult {
  method: SplitMethod;
  trainRows: NormalizedSample[];
  calibrationRows: NormalizedSample[];
  testRows: NormalizedSample[];
}

interface ScoredRow {
  row: NormalizedSample;
  score: number;
}

interface TrainedScenarioResult {
  scenario: ScenarioReport;
  calibration: TemperatureCalibrationFitResult;
  testSamples: ValidationSample[];
}

const DEFAULT_OUT_DIR = 'artifacts/ml-replay';
const DEFAULT_SEED = 4242;
const DEFAULT_TRAIN_RATIO = 0.7;
const DEFAULT_BOOTSTRAP_ITERATIONS = 1000;
const DEFAULT_MIN_SAMPLES = 50;
const DEFAULT_MIN_FEATURE_COUNT = 5;

const MODEL_EMBEDDING_DIM = 8;
const MODEL_HIDDEN_DIM = 16;
const MODEL_LR_WIDE = 0.03;
const MODEL_LR_DEEP = 0.01;
const MODEL_L2 = 1e-4;
const MODEL_CLIP_GRADIENT = 1.0;

const EXPLICIT_SAMPLE_WEIGHT = 1.0;
const IMPLICIT_SAMPLE_WEIGHT = 0.1;
const MAX_ALLOWED_INDEX = 5_000_000;

async function main(): Promise<void> {
  const options = parseCliArgs(process.argv.slice(2));
  const input = await loadInputRows(options.inputPath);
  const parsed = parseDatasetRows(input.rows);

  if (!parsed.validRows.length) {
    throw new Error('Nenhuma amostra valida encontrada no dataset JSON.');
  }

  const dimensions = resolveDimensions(parsed.validRows, options.dimensions);
  const split = splitDataset(parsed.validRows, options.trainRatio, options.seed);
  const splitSummary = summarizeSplit(split);

  const baselineSamples = split.testRows.map((row) => toBaselineValidationSample(row));
  const baselineSnapshot = buildBaselineSnapshotFromSamples(baselineSamples, Date.now());
  const baselineEvaluation = await evaluateValidationGate(baselineSamples, baselineSnapshot, {
    bootstrapIterations: options.bootstrapIterations,
    bootstrapSeed: options.seed,
    minSamples: options.minSamples
  });
  const baselineScenario: ScenarioReport = {
    name: 'baseline',
    status: 'computed',
    sampleSize: baselineSamples.length,
    baseline: baselineEvaluation.baseline,
    summary: baselineEvaluation.summary,
    reliabilityBins: buildScenarioReliabilityBins(baselineSamples)
  };

  const trained = await runTrainedScenario({
    trainRows: split.trainRows,
    calibrationRows: split.calibrationRows,
    testRows: split.testRows,
    dimensions: dimensions.resolved,
    minFeatureCount: options.minFeatureCount,
    seed: options.seed,
    baseline: baselineSnapshot,
    gateConfig: {
      bootstrapIterations: options.bootstrapIterations,
      bootstrapSeed: options.seed,
      minSamples: options.minSamples
    }
  });

  const naturalScenario = await evaluateOptionalScenario(
    'natural',
    split.testRows,
    baselineSnapshot,
    {
      bootstrapIterations: options.bootstrapIterations,
      bootstrapSeed: options.seed + 1,
      minSamples: options.minSamples
    },
    ['naturalPrediction', 'naturalProbability'],
    (row) => row.naturalPrediction,
    (row) => row.naturalProbability
  );

  const naturalSelfScenario = await evaluateOptionalScenario(
    'natural+self',
    split.testRows,
    baselineSnapshot,
    {
      bootstrapIterations: options.bootstrapIterations,
      bootstrapSeed: options.seed + 2,
      minSamples: options.minSamples
    },
    ['naturalSelfPrediction', 'naturalSelfProbability'],
    (row) => row.naturalSelfPrediction,
    (row) => row.naturalSelfProbability
  );

  const attentionAblation = await runAttentionAblation({
    split,
    dimensions: dimensions.resolved,
    minFeatureCount: options.minFeatureCount,
    seed: options.seed + 17,
    baseline: baselineSnapshot,
    gateConfig: {
      bootstrapIterations: options.bootstrapIterations,
      bootstrapSeed: options.seed + 17,
      minSamples: options.minSamples
    },
    featureDictionary: input.featureDictionary
  });

  const warnings: string[] = [];
  if (split.testRows.length < options.minSamples) {
    warnings.push(
      `Independent test split abaixo do minimo: ${split.testRows.length}/${options.minSamples}.`
    );
  }
  if (split.calibrationRows.length < 25) {
    warnings.push(
      `Calibration split pequeno: ${split.calibrationRows.length} amostras. Temperature scaling pode permanecer identitario.`
    );
  }
  if (parsed.summary.labelCounts.productive === 0 || parsed.summary.labelCounts.procrastination === 0) {
    warnings.push(
      'Dataset sem cobertura das duas classes. Qualquer conclusao sobre calibracao, threshold e ganho do modelo fica invalida.'
    );
  }
  if (splitSummary.testLabelCounts.productive === 0 || splitSummary.testLabelCounts.procrastination === 0) {
    warnings.push(
      'Test split sem cobertura das duas classes. O gate independente perde validade estatistica.'
    );
  }

  const runName = resolveRunName(options.name, options.inputPath);
  const outputDir = path.resolve(options.outDir, runName);
  await fs.mkdir(outputDir, { recursive: true });

  const report: ReplayReport = {
    runName,
    generatedAt: new Date().toISOString(),
    inputPath: options.inputPath,
    outputDir,
    config: {
      seed: options.seed,
      trainRatio: options.trainRatio,
      calibrationRatio: (1 - options.trainRatio) / 2,
      testRatio: (1 - options.trainRatio) / 2,
      bootstrapIterations: options.bootstrapIterations,
      minSamples: options.minSamples,
      minFeatureCount: options.minFeatureCount,
      dimensions: options.dimensions
    },
    dataset: {
      ...parsed.summary,
      hasFeatureNames: parsed.summary.hasFeatureNames || input.featureDictionary.size > 0
    },
    split: splitSummary,
    model: {
      dimensions: dimensions.resolved,
      embeddingDim: MODEL_EMBEDDING_DIM,
      hiddenDim: MODEL_HIDDEN_DIM,
      lrWide: MODEL_LR_WIDE,
      lrDeep: MODEL_LR_DEEP,
      l2: MODEL_L2,
      clipGradient: MODEL_CLIP_GRADIENT
    },
    dimensions,
    calibration: trained.calibration,
    scenarios: [baselineScenario, trained.scenario, naturalScenario, naturalSelfScenario],
    attentionAblation,
    warnings
  };

  const reportJsonPath = path.join(outputDir, 'report.json');
  const reportMdPath = path.join(outputDir, 'report.md');
  await fs.writeFile(reportJsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
  await fs.writeFile(reportMdPath, buildMarkdownReport(report), 'utf-8');

  printSummary(report, reportJsonPath, reportMdPath);
}

function parseCliArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    inputPath: '',
    outDir: DEFAULT_OUT_DIR,
    seed: DEFAULT_SEED,
    trainRatio: DEFAULT_TRAIN_RATIO,
    bootstrapIterations: DEFAULT_BOOTSTRAP_ITERATIONS,
    minSamples: DEFAULT_MIN_SAMPLES,
    minFeatureCount: DEFAULT_MIN_FEATURE_COUNT
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }

    const [flag, inlineValue] = splitArg(arg);
    const nextValue = (): string => {
      if (inlineValue !== undefined) {
        return inlineValue;
      }
      const upcoming = argv[i + 1];
      if (!upcoming || upcoming.startsWith('--')) {
        throw new Error(`Valor ausente para ${flag}`);
      }
      i += 1;
      return upcoming;
    };

    switch (flag) {
      case '--input':
        options.inputPath = path.resolve(nextValue());
        break;
      case '--out-dir':
        options.outDir = path.resolve(nextValue());
        break;
      case '--name':
        options.name = nextValue().trim();
        break;
      case '--seed':
        options.seed = parseIntegerArg(nextValue(), '--seed', 1);
        break;
      case '--train-ratio':
        options.trainRatio = parseFloatArg(nextValue(), '--train-ratio', 0.5, 0.9);
        break;
      case '--bootstrap-iterations':
        options.bootstrapIterations = parseIntegerArg(nextValue(), '--bootstrap-iterations', 1);
        break;
      case '--min-samples':
        options.minSamples = parseIntegerArg(nextValue(), '--min-samples', 1);
        break;
      case '--dimensions':
        options.dimensions = parseIntegerArg(nextValue(), '--dimensions', 1);
        break;
      case '--min-feature-count':
        options.minFeatureCount = parseIntegerArg(nextValue(), '--min-feature-count', 1);
        break;
      default:
        throw new Error(`Argumento nao reconhecido: ${arg}`);
    }
  }

  if (!options.inputPath) {
    throw new Error('Informe --input path/do/dataset.json');
  }
  return options;
}

function splitArg(arg: string): [string, string | undefined] {
  const eq = arg.indexOf('=');
  if (eq === -1) {
    return [arg, undefined];
  }
  return [arg.slice(0, eq), arg.slice(eq + 1)];
}

function parseIntegerArg(value: string, name: string, min: number): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < min) {
    throw new Error(`${name} deve ser inteiro >= ${min}`);
  }
  return parsed;
}

function parseFloatArg(value: string, name: string, min: number, max: number): number {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} deve estar entre ${min} e ${max}`);
  }
  return parsed;
}

function printUsage(): void {
  console.log(
    [
      'Uso:',
      '  tsx tools/ml_replay/run.ts --input dataset.json [opcoes]',
      '',
      'Opcoes:',
      '  --input <path>                 Dataset JSON (obrigatorio)',
      `  --out-dir <path>               Diretorio base de saida (default: ${DEFAULT_OUT_DIR})`,
      '  --name <texto>                 Nome da execucao',
      `  --seed <n>                     Seed deterministica (default: ${DEFAULT_SEED})`,
      `  --train-ratio <0..1>           Fracao de treino explicito (default: ${DEFAULT_TRAIN_RATIO})`,
      `  --bootstrap-iterations <n>     Iteracoes bootstrap (default: ${DEFAULT_BOOTSTRAP_ITERATIONS})`,
      `  --min-samples <n>              Minimo de amostras para gate (default: ${DEFAULT_MIN_SAMPLES})`,
      '  --dimensions <n>               Dimensao do vetor (opcional; auto por max index)',
      `  --min-feature-count <n>        Frequencia minima por feature (default: ${DEFAULT_MIN_FEATURE_COUNT})`,
      '  --help                         Mostra esta ajuda'
    ].join('\n')
  );
}

async function loadInputRows(inputPath: string): Promise<InputDataset> {
  const content = await fs.readFile(inputPath, 'utf-8');
  const parsed = JSON.parse(content) as unknown;

  if (Array.isArray(parsed)) {
    return {
      rows: parsed,
      featureDictionary: new Map<number, string>()
    };
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('JSON de entrada deve ser um array ou objeto com propriedade "samples".');
  }
  const record = parsed as {
    samples?: unknown[];
    featureDictionary?: Record<string, unknown>;
    featureNamesByIndex?: Record<string, unknown>;
  };
  if (!Array.isArray(record.samples)) {
    throw new Error('JSON de entrada deve ser um array ou objeto com propriedade "samples".');
  }
  return {
    rows: record.samples,
    featureDictionary: parseFeatureDictionary(record.featureDictionary ?? record.featureNamesByIndex)
  };
}

function parseFeatureDictionary(value: Record<string, unknown> | undefined): Map<number, string> {
  const dictionary = new Map<number, string>();
  if (!value) {
    return dictionary;
  }
  Object.entries(value).forEach(([rawIndex, rawName]) => {
    const index = Number.parseInt(rawIndex, 10);
    if (!Number.isFinite(index) || typeof rawName !== 'string' || !rawName.trim()) {
      return;
    }
    dictionary.set(index, rawName.trim());
  });
  return dictionary;
}

function parseDatasetRows(rows: unknown[]): ParsedDataset {
  const validRows: NormalizedSample[] = [];
  const invalidReasons: Record<string, number> = {};

  rows.forEach((row, rowIndex) => {
    const parsed = parseRow(row, rowIndex);
    if (!parsed) {
      bump(invalidReasons, 'invalid_row');
      return;
    }
    if ('invalidReason' in parsed) {
      bump(invalidReasons, parsed.invalidReason);
      return;
    }
    validRows.push(parsed);
  });

  let productive = 0;
  let procrastination = 0;
  let explicit = 0;
  let implicit = 0;
  let missingTimestampRows = 0;
  let hasFeatureNames = false;

  validRows.forEach((sample) => {
    if (sample.label === 1) productive += 1;
    else procrastination += 1;
    if (sample.source === 'explicit') explicit += 1;
    else implicit += 1;
    if (!Number.isFinite(sample.timestamp)) {
      missingTimestampRows += 1;
    }
    if (sample.featureNames?.length) {
      hasFeatureNames = true;
    }
  });

  return {
    validRows,
    summary: {
      totalRows: rows.length,
      validRows: validRows.length,
      invalidRows: rows.length - validRows.length,
      invalidReasons,
      missingTimestampRows,
      labelCounts: {
        productive,
        procrastination
      },
      sourceCounts: {
        explicit,
        implicit
      },
      hasFeatureNames
    }
  };
}

function parseRow(row: unknown, rowIndex: number): NormalizedSample | { invalidReason: string } | null {
  if (!row || typeof row !== 'object') {
    return { invalidReason: 'row_not_object' };
  }
  const record = row as Record<string, unknown>;
  const label = parseBinary(record.label);
  if (label === undefined) {
    return { invalidReason: 'invalid_label' };
  }

  const vector = parseVector(record.vector);
  if (!vector) {
    return { invalidReason: 'invalid_vector' };
  }

  const featureNames = parseFeatureNames(record.featureNames, vector.indices.length);
  const source = parseSource(record.source);
  const split = parseSplit(record.split);
  const fallbackWeight = source === 'explicit' ? EXPLICIT_SAMPLE_WEIGHT : IMPLICIT_SAMPLE_WEIGHT;
  const weight = parsePositiveNumber(record.weight) ?? fallbackWeight;
  const timestamp = parseTimestamp(record.createdAt) ?? parseTimestamp(record.timestamp);

  const baselineScore = parseFiniteNumber(record.baselineScore);
  let baselinePrediction = parseBinary(record.baselinePrediction);
  if (baselinePrediction === undefined && Number.isFinite(baselineScore)) {
    baselinePrediction = (baselineScore as number) >= 0 ? 1 : 0;
  }
  if (baselinePrediction === undefined) {
    baselinePrediction = 0;
  }

  const naturalProbability = parseProbability(record.naturalProbability);
  let naturalPrediction = parseBinary(record.naturalPrediction);
  if (naturalPrediction === undefined && Number.isFinite(naturalProbability)) {
    naturalPrediction = (naturalProbability as number) >= 0.5 ? 1 : 0;
  }

  const naturalSelfProbability = parseProbability(record.naturalSelfProbability);
  let naturalSelfPrediction = parseBinary(record.naturalSelfPrediction);
  if (naturalSelfPrediction === undefined && Number.isFinite(naturalSelfProbability)) {
    naturalSelfPrediction = (naturalSelfProbability as number) >= 0.5 ? 1 : 0;
  }

  return {
    rowIndex,
    label,
    vector,
    featureNames,
    source,
    split,
    weight,
    timestamp,
    baselinePrediction,
    baselineScore: Number.isFinite(baselineScore) ? (baselineScore as number) : undefined,
    naturalPrediction,
    naturalProbability,
    naturalSelfPrediction,
    naturalSelfProbability
  };
}

function parseVector(value: unknown): SparseVector | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const vector = value as Record<string, unknown>;
  if (!Array.isArray(vector.indices) || !Array.isArray(vector.values)) {
    return null;
  }
  if (vector.indices.length !== vector.values.length || vector.indices.length === 0) {
    return null;
  }

  const indices: number[] = [];
  const values: number[] = [];
  for (let i = 0; i < vector.indices.length; i += 1) {
    const index = parseNonNegativeInteger(vector.indices[i]);
    const numericValue = parseFiniteNumber(vector.values[i]);
    if (!Number.isFinite(index) || !Number.isFinite(numericValue)) {
      return null;
    }
    if ((index as number) > MAX_ALLOWED_INDEX) {
      return null;
    }
    if ((numericValue as number) === 0) {
      continue;
    }
    indices.push(index as number);
    values.push(numericValue as number);
  }

  if (!indices.length) {
    return null;
  }
  return { indices, values };
}

function parseFeatureNames(value: unknown, expectedLength: number): string[] | undefined {
  if (!Array.isArray(value) || value.length !== expectedLength) {
    return undefined;
  }
  const names = value.map((item) => (typeof item === 'string' ? item.trim() : ''));
  return names.some((item) => item.length > 0) ? names : undefined;
}

function parseSource(value: unknown): TrainingSource {
  if (typeof value === 'string' && value.trim().toLowerCase() === 'implicit') {
    return 'implicit';
  }
  return 'explicit';
}

function parseSplit(value: unknown): TrainingSplit | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === 'train' || normalized === 'calibration' || normalized === 'test') {
    return normalized;
  }
  return undefined;
}

function parseBinary(value: unknown): 0 | 1 | undefined {
  if (value === 0 || value === '0' || value === false) {
    return 0;
  }
  if (value === 1 || value === '1' || value === true) {
    return 1;
  }
  return undefined;
}

function parsePositiveNumber(value: unknown): number | undefined {
  const numeric = parseFiniteNumber(value);
  if (!Number.isFinite(numeric) || (numeric as number) <= 0) {
    return undefined;
  }
  return numeric as number;
}

function parseProbability(value: unknown): number | undefined {
  const numeric = parseFiniteNumber(value);
  if (!Number.isFinite(numeric)) {
    return undefined;
  }
  return clamp(numeric as number, 0, 1);
}

function parseFiniteNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function parseNonNegativeInteger(value: unknown): number | undefined {
  const numeric = parseFiniteNumber(value);
  if (!Number.isFinite(numeric)) {
    return undefined;
  }
  const floored = Math.floor(numeric as number);
  if (floored < 0 || floored !== numeric) {
    return undefined;
  }
  return floored;
}

function parseTimestamp(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const asNumber = Number(value);
    if (Number.isFinite(asNumber)) {
      return asNumber;
    }
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function resolveDimensions(rows: NormalizedSample[], provided?: number): DimensionSummary {
  let maxObservedIndex = 0;
  rows.forEach((row) => {
    row.vector.indices.forEach((index) => {
      if (index > maxObservedIndex) {
        maxObservedIndex = index;
      }
    });
  });

  const minimumRequired = maxObservedIndex + 1;
  const resolved = Number.isFinite(provided) ? Math.max(provided as number, minimumRequired) : minimumRequired;

  return {
    provided,
    resolved,
    maxObservedIndex,
    autoAdjustedFromProvided: Number.isFinite(provided) && (provided as number) < minimumRequired
  };
}

function splitDataset(rows: NormalizedSample[], trainRatio: number, seed: number): SplitResult {
  const explicitRows = rows.filter((row) => row.source === 'explicit');
  const canUseProvidedSplit = Boolean(explicitRows.length) && explicitRows.every((row) => row.split);
  if (canUseProvidedSplit) {
    return providedDatasetSplit(rows);
  }

  const implicitRows = rows.filter((row) => row.source === 'implicit');
  const allExplicitHaveTimestamps = explicitRows.every((row) => Number.isFinite(row.timestamp));
  const explicitSplit = allExplicitHaveTimestamps
    ? chronologicalExplicitSplit(explicitRows, trainRatio)
    : stratifiedExplicitSplit(explicitRows, trainRatio, seed);
  return {
    method: allExplicitHaveTimestamps ? 'chronological_explicit' : 'stratified_seeded',
    trainRows: [...explicitSplit.trainRows, ...implicitRows],
    calibrationRows: explicitSplit.calibrationRows,
    testRows: explicitSplit.testRows
  };
}

function providedDatasetSplit(rows: NormalizedSample[]): SplitResult {
  return {
    method: 'provided_dataset',
    trainRows: rows.filter((row) => resolveProvidedSplit(row) === 'train'),
    calibrationRows: rows.filter((row) => resolveProvidedSplit(row) === 'calibration'),
    testRows: rows.filter((row) => resolveProvidedSplit(row) === 'test')
  };
}

function resolveProvidedSplit(row: NormalizedSample): TrainingSplit {
  if (row.split) {
    return row.split;
  }
  return row.source === 'implicit' ? 'train' : 'train';
}

function chronologicalExplicitSplit(rows: NormalizedSample[], trainRatio: number): SplitResult {
  const sorted = [...rows].sort((left, right) => {
    const leftTimestamp = left.timestamp ?? 0;
    const rightTimestamp = right.timestamp ?? 0;
    if (leftTimestamp !== rightTimestamp) {
      return leftTimestamp - rightTimestamp;
    }
    return left.rowIndex - right.rowIndex;
  });
  const { trainCount, calibrationCount } = resolveSplitCounts(sorted.length, trainRatio);
  return {
    method: 'chronological_explicit',
    trainRows: sorted.slice(0, trainCount),
    calibrationRows: sorted.slice(trainCount, trainCount + calibrationCount),
    testRows: sorted.slice(trainCount + calibrationCount)
  };
}

function stratifiedExplicitSplit(rows: NormalizedSample[], trainRatio: number, seed: number): SplitResult {
  const productive = rows.filter((row) => row.label === 1);
  const procrastination = rows.filter((row) => row.label === 0);
  const rng = createSeededRandom(seed);
  const splitGroup = (group: NormalizedSample[]): SplitResult => {
    const shuffled = [...group];
    shuffleInPlace(shuffled, rng);
    const { trainCount, calibrationCount } = resolveSplitCounts(shuffled.length, trainRatio);
    return {
      method: 'stratified_seeded',
      trainRows: shuffled.slice(0, trainCount),
      calibrationRows: shuffled.slice(trainCount, trainCount + calibrationCount),
      testRows: shuffled.slice(trainCount + calibrationCount)
    };
  };

  const productiveSplit = splitGroup(productive);
  const procrastinationSplit = splitGroup(procrastination);
  const trainRows = [...productiveSplit.trainRows, ...procrastinationSplit.trainRows];
  const calibrationRows = [...productiveSplit.calibrationRows, ...procrastinationSplit.calibrationRows];
  const testRows = [...productiveSplit.testRows, ...procrastinationSplit.testRows];
  shuffleInPlace(trainRows, rng);
  shuffleInPlace(calibrationRows, rng);
  shuffleInPlace(testRows, rng);
  return {
    method: 'stratified_seeded',
    trainRows,
    calibrationRows,
    testRows
  };
}

function resolveSplitCounts(total: number, trainRatio: number): { trainCount: number; calibrationCount: number } {
  const trainCount = Math.max(0, Math.min(total, Math.floor(total * trainRatio)));
  const remaining = Math.max(0, total - trainCount);
  const calibrationCount = Math.floor(remaining / 2);
  return { trainCount, calibrationCount };
}

function summarizeSplit(split: SplitResult): SplitSummary {
  return {
    method: split.method,
    trainSize: split.trainRows.length,
    calibrationSize: split.calibrationRows.length,
    testSize: split.testRows.length,
    trainLabelCounts: countLabels(split.trainRows),
    calibrationLabelCounts: countLabels(split.calibrationRows),
    testLabelCounts: countLabels(split.testRows)
  };
}

function countLabels(rows: NormalizedSample[]): LabelCounts {
  let productive = 0;
  let procrastination = 0;
  rows.forEach((row) => {
    if (row.label === 1) productive += 1;
    else procrastination += 1;
  });
  return { productive, procrastination };
}

function runTrainedScenario(args: {
  trainRows: NormalizedSample[];
  calibrationRows: NormalizedSample[];
  testRows: NormalizedSample[];
  dimensions: number;
  minFeatureCount: number;
  seed: number;
  baseline: ValidationBaselineSnapshot;
  gateConfig: {
    bootstrapIterations: number;
    bootstrapSeed: number;
    minSamples: number;
  };
  vectorMask?: (row: NormalizedSample) => SparseVector;
}): Promise<TrainedScenarioResult> {
  const model = new WideDeepLiteBinary(
    {
      dimensions: args.dimensions,
      embeddingDim: MODEL_EMBEDDING_DIM,
      hiddenDim: MODEL_HIDDEN_DIM,
      lrWide: MODEL_LR_WIDE,
      lrDeep: MODEL_LR_DEEP,
      l2: MODEL_L2,
      clipGradient: MODEL_CLIP_GRADIENT
    },
    {
      seed: args.seed
    }
  );

  const counts = new Uint32Array(args.dimensions);
  trainModel(args.trainRows, model, counts, args.minFeatureCount, args.dimensions, args.vectorMask);

  const calibrationPredictions = scoreRows(
    args.calibrationRows,
    model,
    counts,
    args.minFeatureCount,
    args.dimensions,
    args.vectorMask
  );
  const calibrator = new TemperatureScaler();
  const calibration = calibrator.fit(
    calibrationPredictions.map((entry) => ({
      score: entry.score,
      label: entry.row.label,
      weight: entry.row.weight
    }))
  );

  const testPredictions = scoreRows(
    args.testRows,
    model,
    counts,
    args.minFeatureCount,
    args.dimensions,
    args.vectorMask
  );
  const testSamples = testPredictions.map((entry) => {
    const probability = calibrator.transform(entry.score);
    return {
      label: entry.row.label,
      weight: entry.row.weight,
      baselinePrediction: entry.row.baselinePrediction,
      modelPrediction: probability >= 0.5 ? 1 : 0,
      modelProbability: probability
    } satisfies ValidationSample;
  });

  const evaluation = await evaluateValidationGate(testSamples, args.baseline, args.gateConfig);
  return {
    calibration,
    testSamples,
    scenario: {
      name: 'trained',
      status: 'computed',
      sampleSize: testSamples.length,
      baseline: evaluation.baseline,
      summary: evaluation.summary,
      comparisonToBaseline: compareWithBaseline(evaluation.summary, args.baseline),
      reliabilityBins: buildScenarioReliabilityBins(testSamples)
    }
  };
}

function trainModel(
  rows: NormalizedSample[],
  model: WideDeepLiteBinary,
  counts: Uint32Array,
  minFeatureCount: number,
  dimensions: number,
  vectorMask?: (row: NormalizedSample) => SparseVector
): void {
  rows.forEach((row) => {
    const vector = vectorMask ? vectorMask(row) : row.vector;
    incrementCounts(counts, vector.indices, dimensions);
    const filtered = applyMinFeatureThreshold(vector, counts, minFeatureCount, dimensions);
    model.update(filtered, row.label, row.weight);
  });
}

function scoreRows(
  rows: NormalizedSample[],
  model: WideDeepLiteBinary,
  counts: Uint32Array,
  minFeatureCount: number,
  dimensions: number,
  vectorMask?: (row: NormalizedSample) => SparseVector
): ScoredRow[] {
  return rows.map((row) => {
    const vector = vectorMask ? vectorMask(row) : row.vector;
    const filtered = applyMinFeatureThreshold(vector, counts, minFeatureCount, dimensions);
    return {
      row,
      score: model.predictScore(filtered)
    };
  });
}

function incrementCounts(counts: Uint32Array, indices: number[], dimensions: number): void {
  indices.forEach((index) => {
    if (!Number.isFinite(index)) {
      return;
    }
    const intIndex = Math.floor(index);
    if (intIndex < 0 || intIndex >= dimensions) {
      return;
    }
    const current = counts[intIndex] ?? 0;
    counts[intIndex] = current === 0xffffffff ? current : current + 1;
  });
}

function applyMinFeatureThreshold(
  vector: SparseVector,
  counts: Uint32Array,
  minFeatureCount: number,
  dimensions: number
): SparseVector {
  const indices: number[] = [];
  const values: number[] = [];
  for (let i = 0; i < vector.indices.length; i += 1) {
    const index = vector.indices[i];
    if (index < 0 || index >= dimensions) {
      continue;
    }
    if ((counts[index] ?? 0) < minFeatureCount) {
      continue;
    }
    indices.push(index);
    values.push(vector.values[i]);
  }
  return { indices, values };
}

function toBaselineValidationSample(row: NormalizedSample): ValidationSample {
  return {
    label: row.label,
    weight: row.weight,
    baselinePrediction: row.baselinePrediction,
    modelPrediction: row.baselinePrediction,
    modelProbability: baselineProbability(row)
  };
}

function baselineProbability(row: NormalizedSample): number {
  if (Number.isFinite(row.baselineScore)) {
    return sigmoid(row.baselineScore as number);
  }
  return row.baselinePrediction === 1 ? 0.8 : 0.2;
}

function evaluateOptionalScenario(
  name: 'natural' | 'natural+self',
  rows: NormalizedSample[],
  baseline: ValidationBaselineSnapshot,
  gateConfig: {
    bootstrapIterations: number;
    bootstrapSeed: number;
    minSamples: number;
  },
  missingFields: string[],
  getPrediction: (row: NormalizedSample) => 0 | 1 | undefined,
  getProbability: (row: NormalizedSample) => number | undefined
): Promise<ScenarioReport> {
  const samples: ValidationSample[] = [];
  let missingCount = 0;

  rows.forEach((row) => {
    const prediction = getPrediction(row);
    const probability = getProbability(row);
    if ((prediction !== 0 && prediction !== 1) || !Number.isFinite(probability)) {
      missingCount += 1;
      return;
    }
    samples.push({
      label: row.label,
      weight: row.weight,
      baselinePrediction: row.baselinePrediction,
      modelPrediction: prediction,
      modelProbability: probability as number
    });
  });

  if (!samples.length || missingCount > 0) {
    return {
      name,
      status: 'skipped_missing_fields',
      sampleSize: samples.length,
      missingCount,
      missingFields
    };
  }

  const evaluation = await evaluateValidationGate(samples, baseline, gateConfig);
  return {
    name,
    status: 'computed',
    sampleSize: samples.length,
    baseline: evaluation.baseline,
    summary: evaluation.summary,
    comparisonToBaseline: compareWithBaseline(evaluation.summary, baseline),
    reliabilityBins: buildScenarioReliabilityBins(samples)
  };
}

function runAttentionAblation(args: {
  split: SplitResult;
  dimensions: number;
  minFeatureCount: number;
  seed: number;
  baseline: ValidationBaselineSnapshot;
  gateConfig: {
    bootstrapIterations: number;
    bootstrapSeed: number;
    minSamples: number;
  };
  featureDictionary: Map<number, string>;
}): Promise<AttentionAblationReport> {
  const hasMaskingMetadata =
    args.featureDictionary.size > 0 ||
    [...args.split.trainRows, ...args.split.calibrationRows, ...args.split.testRows].some((row) => row.featureNames?.length);
  if (!hasMaskingMetadata) {
    return {
      status: 'skipped_missing_feature_names',
      attentionRisk: false,
      reason: 'Dataset nao fornece nomes de features para mascarar sinais de atencao.'
    };
  }

  const noAttention = await runTrainedScenario({
    ...args,
    trainRows: args.split.trainRows,
    calibrationRows: args.split.calibrationRows,
    testRows: args.split.testRows,
    vectorMask: (row) => stripAttentionFeatures(row, args.featureDictionary)
  });

  const full = await runTrainedScenario({
    ...args,
    trainRows: args.split.trainRows,
    calibrationRows: args.split.calibrationRows,
    testRows: args.split.testRows
  });

  const fullSummary = full.scenario.summary;
  const noAttentionSummary = noAttention.scenario.summary;
  const attentionRisk = Boolean(
    fullSummary &&
      noAttentionSummary &&
      (
        fullSummary.falseProductiveRate - noAttentionSummary.falseProductiveRate >= 0.005 ||
        noAttentionSummary.deltaMacroF1 - fullSummary.deltaMacroF1 >= 0.01
      )
  );

  return {
    status: 'computed',
    attentionRisk,
    full: full.scenario,
    noAttention: {
      ...noAttention.scenario,
      name: 'trained'
    }
  };
}

function stripAttentionFeatures(
  row: NormalizedSample,
  featureDictionary: Map<number, string>
): SparseVector {
  const indices: number[] = [];
  const values: number[] = [];
  for (let i = 0; i < row.vector.indices.length; i += 1) {
    const index = row.vector.indices[i];
    const featureName = row.featureNames?.[i] || featureDictionary.get(index) || '';
    if (featureNameContainsAttentionSignal(featureName)) {
      continue;
    }
    indices.push(index);
    values.push(row.vector.values[i]);
  }
  return { indices, values };
}

function compareWithBaseline(
  summary: ValidationSummary,
  baseline: ValidationBaselineSnapshot
): ScenarioComparison {
  return {
    deltaFalseProductiveRate: summary.falseProductiveRate - baseline.falseProductiveRate,
    deltaPrecisionProductive: summary.precisionProductive - baseline.precisionProductive,
    deltaMacroF1: summary.macroF1 - baseline.macroF1
  };
}

function buildScenarioReliabilityBins(samples: ValidationSample[]): CalibrationReliabilityBin[] {
  return buildReliabilityBins(
    samples.map((sample) => sample.modelProbability),
    samples.map((sample) => sample.label),
    10
  );
}

function resolveRunName(rawName: string | undefined, inputPath: string): string {
  if (rawName && rawName.trim()) {
    return slugify(rawName);
  }
  const base = path.basename(inputPath, path.extname(inputPath));
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+$/, '').replace('T', '-');
  return slugify(`${base}-${stamp}`);
}

function slugify(value: string): string {
  const cleaned = value.toLowerCase().trim().replace(/[^a-z0-9_-]+/g, '-').replace(/-+/g, '-');
  return cleaned.replace(/^-+|-+$/g, '') || 'ml-replay';
}

function buildMarkdownReport(report: ReplayReport): string {
  const lines: string[] = [];
  lines.push(`# ML Replay Report: ${report.runName}`);
  lines.push('');
  lines.push(`- Generated at: ${report.generatedAt}`);
  lines.push(`- Input: \`${report.inputPath}\``);
  lines.push(`- Output: \`${report.outputDir}\``);
  lines.push('');
  lines.push('## Dataset');
  lines.push('');
  lines.push(`- Total rows: ${report.dataset.totalRows}`);
  lines.push(`- Valid rows: ${report.dataset.validRows}`);
  lines.push(`- Invalid rows: ${report.dataset.invalidRows}`);
  lines.push(`- Missing timestamp rows: ${report.dataset.missingTimestampRows}`);
  lines.push(`- Label counts: productive=${report.dataset.labelCounts.productive}, procrastination=${report.dataset.labelCounts.procrastination}`);
  lines.push(`- Source counts: explicit=${report.dataset.sourceCounts.explicit}, implicit=${report.dataset.sourceCounts.implicit}`);
  lines.push(`- Has feature names: ${report.dataset.hasFeatureNames ? 'yes' : 'no'}`);
  if (Object.keys(report.dataset.invalidReasons).length) {
    lines.push('- Invalid reasons:');
    Object.entries(report.dataset.invalidReasons)
      .sort((a, b) => b[1] - a[1])
      .forEach(([reason, count]) => {
        lines.push(`  - ${reason}: ${count}`);
      });
  }
  lines.push('');
  lines.push('## Split and Model');
  lines.push('');
  lines.push(`- Split method: ${report.split.method}`);
  lines.push(`- Train/Calibration/Test: ${report.split.trainSize}/${report.split.calibrationSize}/${report.split.testSize}`);
  lines.push(`- Train labels: productive=${report.split.trainLabelCounts.productive}, procrastination=${report.split.trainLabelCounts.procrastination}`);
  lines.push(`- Calibration labels: productive=${report.split.calibrationLabelCounts.productive}, procrastination=${report.split.calibrationLabelCounts.procrastination}`);
  lines.push(`- Test labels: productive=${report.split.testLabelCounts.productive}, procrastination=${report.split.testLabelCounts.procrastination}`);
  lines.push(`- Dimensions: ${report.model.dimensions} (max index observed: ${report.dimensions.maxObservedIndex})`);
  lines.push(`- Min feature count: ${report.config.minFeatureCount}`);
  lines.push(`- Calibration changed: ${report.calibration.changed ? 'yes' : 'no'} (sampleSize=${report.calibration.sampleSize}, ece=${report.calibration.ece.toFixed(4)}, temperature=${report.calibration.temperature.toFixed(4)})`);
  if (report.warnings.length) {
    lines.push('');
    lines.push('## Warnings');
    lines.push('');
    report.warnings.forEach((warning) => {
      lines.push(`- ${warning}`);
    });
  }
  lines.push('');
  lines.push('## Scenario Summary');
  lines.push('');
  lines.push('| Scenario | Status | Samples | False productive rate | Precision productive | Delta macro-F1 | ECE | Gate |');
  lines.push('| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |');
  report.scenarios.forEach((scenario) => {
    if (scenario.status !== 'computed' || !scenario.summary) {
      lines.push(`| ${scenario.name} | ${scenario.status} | ${scenario.sampleSize} | -- | -- | -- | -- | -- |`);
      return;
    }
    lines.push(
      `| ${scenario.name} | computed | ${scenario.sampleSize} | ${formatPercent(scenario.summary.falseProductiveRate)} | ${formatPercent(scenario.summary.precisionProductive)} | ${scenario.summary.deltaMacroF1.toFixed(4)} | ${scenario.summary.ece.toFixed(4)} | ${scenario.summary.gatePassed ? 'pass' : 'fail'} |`
    );
  });
  lines.push('');
  lines.push('## Attention Ablation');
  lines.push('');
  if (report.attentionAblation.status !== 'computed') {
    lines.push(`- Status: ${report.attentionAblation.status}`);
    if (report.attentionAblation.reason) {
      lines.push(`- Reason: ${report.attentionAblation.reason}`);
    }
  } else {
    lines.push(`- Attention risk: ${report.attentionAblation.attentionRisk ? 'yes' : 'no'}`);
    lines.push(`- Full deltaMacroF1: ${(report.attentionAblation.full?.summary?.deltaMacroF1 ?? 0).toFixed(4)}`);
    lines.push(`- No-attention deltaMacroF1: ${(report.attentionAblation.noAttention?.summary?.deltaMacroF1 ?? 0).toFixed(4)}`);
    lines.push(`- Full FPR: ${formatPercent(report.attentionAblation.full?.summary?.falseProductiveRate ?? 0)}`);
    lines.push(`- No-attention FPR: ${formatPercent(report.attentionAblation.noAttention?.summary?.falseProductiveRate ?? 0)}`);
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function printSummary(report: ReplayReport, jsonPath: string, mdPath: string): void {
  console.log(`[ml-replay] Run: ${report.runName}`);
  console.log(`[ml-replay] Valid rows: ${report.dataset.validRows}/${report.dataset.totalRows}`);
  console.log(`[ml-replay] Split train/calibration/test: ${report.split.trainSize}/${report.split.calibrationSize}/${report.split.testSize}`);
  report.scenarios.forEach((scenario) => {
    if (scenario.status !== 'computed' || !scenario.summary) {
      console.log(`[ml-replay] ${scenario.name}: skipped (${scenario.status}, missing=${scenario.missingCount ?? 0})`);
      return;
    }
    console.log(
      `[ml-replay] ${scenario.name}: fpr=${formatPercent(scenario.summary.falseProductiveRate)} precision=${formatPercent(scenario.summary.precisionProductive)} deltaMacroF1=${scenario.summary.deltaMacroF1.toFixed(4)} gate=${scenario.summary.gatePassed ? 'pass' : 'fail'}`
    );
  });
  if (report.attentionAblation.status === 'computed') {
    console.log(`[ml-replay] attentionRisk: ${report.attentionAblation.attentionRisk ? 'yes' : 'no'}`);
  } else {
    console.log(`[ml-replay] attention ablation skipped: ${report.attentionAblation.reason ?? report.attentionAblation.status}`);
  }
  console.log(`[ml-replay] JSON report: ${jsonPath}`);
  console.log(`[ml-replay] Markdown report: ${mdPath}`);
}

function formatPercent(value: number): string {
  if (!Number.isFinite(value)) {
    return '--';
  }
  return `${(value * 100).toFixed(2)}%`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function sigmoid(value: number): number {
  if (value >= 0) {
    const exp = Math.exp(-value);
    return 1 / (1 + exp);
  }
  const exp = Math.exp(value);
  return exp / (1 + exp);
}

function createSeededRandom(seed: number): () => number {
  let state = Math.max(1, Math.floor(seed) || 1);
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

function shuffleInPlace<T>(items: T[], rng: () => number): void {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const temp = items[i];
    items[i] = items[j];
    items[j] = temp;
  }
}

function bump(map: Record<string, number>, key: string): void {
  map[key] = (map[key] ?? 0) + 1;
}

void main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[ml-replay] Failed: ${message}`);
  process.exitCode = 1;
});
