import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

const DEFAULT_OUT_DIR = path.resolve('artifacts/ml-replay');
const DFINDEXEDDB_VERSION = '20260210';
const TOOL_CACHE_DIR = path.resolve('tools/.cache/ml-replay-dfindexeddb');
const VENV_DIR = path.join(TOOL_CACHE_DIR, 'venv');
const DFINDEXEDDB_BIN = path.join(VENV_DIR, 'bin', 'dfindexeddb');
const PIP_BIN = path.join(VENV_DIR, 'bin', 'pip');

type TrainingSource = 'explicit' | 'implicit';
type TrainingSplit = 'train' | 'calibration' | 'test';

interface CliOptions {
  chromeUserDataDir: string;
  profile?: string;
  extensionId?: string;
  outputPath?: string;
  name?: string;
}

interface ExtensionCandidate {
  profile: string;
  extensionId: string;
  localSettingsDir: string;
  indexedDbDir: string;
  lastModifiedMs: number;
}

interface ParsedIndexedDbRecord {
  key?: Record<string, unknown>;
  value?: Record<string, unknown> | string | number | null;
  database_id?: number;
  object_store_id?: number;
  sequence_number?: number;
}

interface ExportedSample {
  createdAt: number;
  timestamp: number;
  domain: string;
  source: TrainingSource;
  split: TrainingSplit;
  label: 0 | 1;
  weight: number;
  vector: {
    indices: number[];
    values: number[];
  };
  featureNames?: string[];
  baselinePrediction?: 0 | 1;
  baselineScore?: number;
  naturalPrediction?: 0 | 1;
  naturalProbability?: number;
  naturalSelfPrediction?: 0 | 1;
  naturalSelfProbability?: number;
}

interface ExportPayload {
  samples: ExportedSample[];
  metadata: {
    exportedAt: string;
    chromeUserDataDir: string;
    profile: string;
    extensionId: string;
    indexedDbDir: string;
    localSettingsDir: string;
    exporter: {
      tool: string;
      dfindexeddbVersion: string;
    };
    counts: {
      examples: number;
      behaviorEvents: number;
      metaEntries: number;
    };
  };
}

async function main(): Promise<void> {
  const options = parseCliArgs(process.argv.slice(2));
  const candidate = await resolveCandidate(options);
  const dfindexeddb = await ensureDfIndexedDb();
  const records = await readIndexedDbRecords(dfindexeddb, candidate.indexedDbDir);
  const payload = buildExportPayload(records, candidate, options.chromeUserDataDir);

  if (!payload.samples.length) {
    throw new Error('Nenhuma amostra exportavel encontrada no IndexedDB da extensao.');
  }

  const outputPath = options.outputPath
    ? path.resolve(options.outputPath)
    : path.resolve(DEFAULT_OUT_DIR, `${resolveRunName(options.name, candidate)}.json`);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8');

  printSummary(payload, outputPath);
}

function parseCliArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    chromeUserDataDir: defaultChromeUserDataDir()
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
      case '--chrome-user-data-dir':
        options.chromeUserDataDir = path.resolve(nextValue());
        break;
      case '--profile':
        options.profile = nextValue().trim();
        break;
      case '--extension-id':
        options.extensionId = nextValue().trim();
        break;
      case '--output':
        options.outputPath = path.resolve(nextValue());
        break;
      case '--name':
        options.name = nextValue().trim();
        break;
      default:
        throw new Error(`Argumento nao reconhecido: ${arg}`);
    }
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

function printUsage(): void {
  console.log(
    [
      'Uso:',
      '  tsx tools/ml_replay/export_chrome_profile.ts [opcoes]',
      '',
      'Opcoes:',
      `  --chrome-user-data-dir <path>   Diretorio de perfis do Chrome (default: ${defaultChromeUserDataDir()})`,
      '  --profile <nome>                Perfil do Chrome (ex.: Default, Profile 1)',
      '  --extension-id <id>             ID da extensao alvo',
      '  --output <path>                 Caminho do JSON exportado',
      '  --name <texto>                  Prefixo do nome do arquivo exportado',
      '  --help                          Mostra esta ajuda'
    ].join('\n')
  );
}

function defaultChromeUserDataDir(): string {
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'Google', 'Chrome');
  }
  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA;
    if (!localAppData) {
      throw new Error('LOCALAPPDATA nao definido para localizar o perfil do Chrome.');
    }
    return path.join(localAppData, 'Google', 'Chrome', 'User Data');
  }
  return path.join(os.homedir(), '.config', 'google-chrome');
}

async function resolveCandidate(options: CliOptions): Promise<ExtensionCandidate> {
  const chromeUserDataDir = options.chromeUserDataDir;
  const hasProfile = Boolean(options.profile);
  const hasExtensionId = Boolean(options.extensionId);

  if (hasProfile && hasExtensionId) {
    const candidate = await buildCandidate(chromeUserDataDir, options.profile as string, options.extensionId as string);
    if (!candidate) {
      throw new Error('Nao encontrei armazenamento compatível para o profile/extension-id informados.');
    }
    return candidate;
  }

  const discovered = await discoverCandidates(chromeUserDataDir, options.profile, options.extensionId);
  if (!discovered.length) {
    throw new Error('Nenhuma extensao com sg:settings + sg-ml-training foi encontrada no perfil do Chrome.');
  }
  discovered.sort((left, right) => right.lastModifiedMs - left.lastModifiedMs);
  return discovered[0];
}

async function discoverCandidates(
  chromeUserDataDir: string,
  profileFilter?: string,
  extensionFilter?: string
): Promise<ExtensionCandidate[]> {
  const profiles = await listProfileDirs(chromeUserDataDir, profileFilter);
  const candidates: ExtensionCandidate[] = [];

  for (const profile of profiles) {
    const localSettingsRoot = path.join(chromeUserDataDir, profile, 'Local Extension Settings');
    const indexedDbRoot = path.join(chromeUserDataDir, profile, 'IndexedDB');
    const localSettingsDirs = await listDirectories(localSettingsRoot);

    for (const extensionId of localSettingsDirs) {
      if (extensionFilter && extensionId !== extensionFilter) {
        continue;
      }
      const localSettingsDir = path.join(localSettingsRoot, extensionId);
      const indexedDbDir = path.join(indexedDbRoot, `chrome-extension_${extensionId}_0.indexeddb.leveldb`);
      if (!(await exists(indexedDbDir))) {
        continue;
      }
      const [hasSettings, hasTrainingDb] = await Promise.all([
        directoryContainsNeedle(localSettingsDir, 'sg:settings'),
        directoryContainsNeedle(indexedDbDir, 'sg-ml-training')
      ]);
      if (!hasSettings || !hasTrainingDb) {
        continue;
      }
      const lastModifiedMs = await directoryMtime(indexedDbDir);
      candidates.push({
        profile,
        extensionId,
        localSettingsDir,
        indexedDbDir,
        lastModifiedMs
      });
    }
  }

  return candidates;
}

async function buildCandidate(
  chromeUserDataDir: string,
  profile: string,
  extensionId: string
): Promise<ExtensionCandidate | null> {
  const localSettingsDir = path.join(chromeUserDataDir, profile, 'Local Extension Settings', extensionId);
  const indexedDbDir = path.join(
    chromeUserDataDir,
    profile,
    'IndexedDB',
    `chrome-extension_${extensionId}_0.indexeddb.leveldb`
  );
  if (!(await exists(localSettingsDir)) || !(await exists(indexedDbDir))) {
    return null;
  }
  return {
    profile,
    extensionId,
    localSettingsDir,
    indexedDbDir,
    lastModifiedMs: await directoryMtime(indexedDbDir)
  };
}

async function listProfileDirs(root: string, filter?: string): Promise<string[]> {
  const entries = await listDirectories(root);
  const profiles = entries.filter((entry) => entry === 'Default' || entry.startsWith('Profile '));
  if (filter) {
    return profiles.filter((entry) => entry === filter);
  }
  return profiles;
}

async function listDirectories(dir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch {
    return [];
  }
}

async function exists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function directoryContainsNeedle(dir: string, needle: string): Promise<boolean> {
  const needleBuffer = Buffer.from(needle, 'utf-8');
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) {
        continue;
      }
      const filePath = path.join(dir, entry.name);
      const buffer = await fs.readFile(filePath);
      if (buffer.includes(needleBuffer)) {
        return true;
      }
    }
  } catch {
    return false;
  }
  return false;
}

async function directoryMtime(dir: string): Promise<number> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    let latest = 0;
    for (const entry of entries) {
      const stats = await fs.stat(path.join(dir, entry.name));
      latest = Math.max(latest, stats.mtimeMs);
    }
    return latest;
  } catch {
    return 0;
  }
}

async function ensureDfIndexedDb(): Promise<string> {
  if (await exists(DFINDEXEDDB_BIN)) {
    return DFINDEXEDDB_BIN;
  }

  await fs.mkdir(TOOL_CACHE_DIR, { recursive: true });
  runOrThrow('python3', ['-m', 'venv', VENV_DIR], 'Falha ao criar venv para dfindexeddb.');
  runOrThrow(PIP_BIN, ['install', `dfindexeddb==${DFINDEXEDDB_VERSION}`], 'Falha ao instalar dfindexeddb.');
  return DFINDEXEDDB_BIN;
}

function runOrThrow(command: string, args: string[], errorMessage: string): string {
  const result = spawnSync(command, args, {
    encoding: 'utf-8',
    maxBuffer: 100 * 1024 * 1024
  });
  if (result.status !== 0) {
    const stderr = result.stderr?.trim();
    const stdout = result.stdout?.trim();
    throw new Error([errorMessage, stderr || stdout || `Comando falhou: ${command}`].join('\n'));
  }
  return result.stdout ?? '';
}

async function readIndexedDbRecords(dfindexeddb: string, indexedDbDir: string): Promise<ParsedIndexedDbRecord[]> {
  const stdout = runOrThrow(
    dfindexeddb,
    ['db', '-s', indexedDbDir, '-f', 'chromium', '-o', 'jsonl', '--use_sequence_number'],
    'Falha ao ler IndexedDB com dfindexeddb.'
  );

  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('{'))
    .map((line) => JSON.parse(line) as ParsedIndexedDbRecord);
}

function buildExportPayload(
  records: ParsedIndexedDbRecord[],
  candidate: ExtensionCandidate,
  chromeUserDataDir: string
): ExportPayload {
  const databaseIds = new Map<string, number>();
  const objectStoreNames = new Map<number, string>();

  for (const record of records) {
    const keyType = asString(record.key?.__type__);
    if (keyType === 'DatabaseNameKey') {
      const databaseName = asString(record.key?.database_name);
      const databaseId = asNumber(record.value);
      if (databaseName && Number.isFinite(databaseId)) {
        databaseIds.set(databaseName, databaseId as number);
      }
      continue;
    }
  }

  const trainingDbId = databaseIds.get('sg-ml-training');
  if (!Number.isFinite(trainingDbId)) {
    throw new Error('Nao foi possivel localizar o banco sg-ml-training no IndexedDB exportado.');
  }

  for (const record of records) {
    const keyType = asString(record.key?.__type__);
    if (record.database_id !== trainingDbId || keyType !== 'ObjectStoreMetaDataKey') {
      continue;
    }
    if (asNumber(record.key?.metadata_type) !== 0) {
      continue;
    }
    const objectStoreId = asNumber(record.key?.object_store_id);
    const objectStoreName = asString(record.value);
    if (Number.isFinite(objectStoreId) && objectStoreName) {
      objectStoreNames.set(objectStoreId as number, objectStoreName);
    }
  }

  const examplesStoreId = findStoreId(objectStoreNames, 'examples');
  const behaviorStoreId = findStoreId(objectStoreNames, 'behavior');
  const metaStoreId = findStoreId(objectStoreNames, 'meta');

  const activeRecords = new Map<string, ParsedIndexedDbRecord>();
  for (const record of records) {
    const keyType = asString(record.key?.__type__);
    if (record.database_id !== trainingDbId || keyType !== 'ObjectStoreDataKey') {
      continue;
    }
    const objectStoreId = asNumber(record.object_store_id ?? record.key?.key_prefix?.object_store_id);
    if (!Number.isFinite(objectStoreId)) {
      continue;
    }
    const primaryKey = JSON.stringify(record.key?.encoded_user_key?.value ?? null);
    const dedupeKey = `${objectStoreId}:${primaryKey}`;
    const existing = activeRecords.get(dedupeKey);
    if (!existing || (asNumber(record.sequence_number) ?? -1) > (asNumber(existing.sequence_number) ?? -1)) {
      activeRecords.set(dedupeKey, record);
    }
  }

  const samples: ExportedSample[] = [];
  let behaviorEvents = 0;
  let metaEntries = 0;

  for (const record of activeRecords.values()) {
    const objectStoreId = asNumber(record.object_store_id ?? record.key?.key_prefix?.object_store_id);
    if (!Number.isFinite(objectStoreId)) {
      continue;
    }
    if (objectStoreId === examplesStoreId) {
      const sample = toExportedSample(record);
      if (sample) {
        samples.push(sample);
      }
      continue;
    }
    if (objectStoreId === behaviorStoreId) {
      behaviorEvents += 1;
      continue;
    }
    if (objectStoreId === metaStoreId) {
      metaEntries += 1;
    }
  }

  samples.sort((left, right) => left.createdAt - right.createdAt);

  return {
    samples,
    metadata: {
      exportedAt: new Date().toISOString(),
      chromeUserDataDir,
      profile: candidate.profile,
      extensionId: candidate.extensionId,
      indexedDbDir: candidate.indexedDbDir,
      localSettingsDir: candidate.localSettingsDir,
      exporter: {
        tool: 'tools/ml_replay/export_chrome_profile.ts',
        dfindexeddbVersion: DFINDEXEDDB_VERSION
      },
      counts: {
        examples: samples.length,
        behaviorEvents,
        metaEntries
      }
    }
  };
}

function findStoreId(storeNames: Map<number, string>, targetName: string): number {
  for (const [storeId, storeName] of storeNames.entries()) {
    if (storeName === targetName) {
      return storeId;
    }
  }
  return -1;
}

function toExportedSample(record: ParsedIndexedDbRecord): ExportedSample | null {
  const payload = asRecord((record.value as Record<string, unknown> | undefined)?.value);
  if (!payload) {
    return null;
  }

  const createdAt = asNumber(payload.createdAt);
  const domain = asString(payload.domain);
  const source = parseSource(payload.source);
  const split = parseSplit(payload.split);
  const label = parseBinary(payload.label);
  const weight = asNumber(payload.weight) ?? 1;
  const vectorPayload = asRecord(payload.vector);
  const indices = decodeNumericArray(vectorPayload?.indices);
  const values = decodeNumericArray(vectorPayload?.values);
  const featureNames = decodeStringArray(payload.featureNames);
  const baselinePrediction = parseBinary(payload.baselinePrediction);
  const baselineScore = asNumber(payload.baselineScore);
  const naturalPrediction = parseBinary(payload.naturalPrediction);
  const naturalProbability = asNumber(payload.naturalProbability);
  const naturalSelfPrediction = parseBinary(payload.naturalSelfPrediction);
  const naturalSelfProbability = asNumber(payload.naturalSelfProbability);

  if (
    !Number.isFinite(createdAt) ||
    !domain ||
    !source ||
    !split ||
    label === undefined ||
    !indices.length ||
    indices.length !== values.length
  ) {
    return null;
  }

  return {
    createdAt: createdAt as number,
    timestamp: createdAt as number,
    domain,
    source,
    split,
    label,
    weight: Number.isFinite(weight) && (weight as number) > 0 ? (weight as number) : 1,
    vector: {
      indices,
      values
    },
    featureNames: featureNames.length === indices.length ? featureNames : undefined,
    baselinePrediction,
    baselineScore: Number.isFinite(baselineScore) ? (baselineScore as number) : undefined,
    naturalPrediction,
    naturalProbability: Number.isFinite(naturalProbability) ? (naturalProbability as number) : undefined,
    naturalSelfPrediction,
    naturalSelfProbability: Number.isFinite(naturalSelfProbability)
      ? (naturalSelfProbability as number)
      : undefined
  };
}

function decodeNumericArray(value: unknown): number[] {
  const normalized = decodeJsArray(value);
  return normalized
    .map((entry) => asNumber(entry))
    .filter((entry): entry is number => Number.isFinite(entry));
}

function decodeStringArray(value: unknown): string[] {
  const normalized = decodeJsArray(value);
  return normalized.map((entry) => (typeof entry === 'string' ? entry : ''));
}

function decodeJsArray(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value.filter((entry) => !isUndefinedMarker(entry));
  }
  const record = asRecord(value);
  if (!record || asString(record.__type__) !== 'JSArray') {
    return [];
  }

  const denseValues = Array.isArray(record.values) ? record.values : [];
  const properties = asRecord(record.properties) ?? {};
  const numericKeys = Object.keys(properties)
    .map((key) => Number.parseInt(key, 10))
    .filter((key) => Number.isFinite(key) && key >= 0)
    .sort((left, right) => left - right);
  const maxIndex = Math.max(denseValues.length - 1, numericKeys.length ? numericKeys[numericKeys.length - 1] : -1);

  const output: unknown[] = [];
  for (let index = 0; index <= maxIndex; index += 1) {
    const denseEntry = index < denseValues.length ? denseValues[index] : undefined;
    if (!isUndefinedMarker(denseEntry) && denseEntry !== undefined) {
      output.push(denseEntry);
      continue;
    }
    const propertyKey = String(index);
    if (Object.prototype.hasOwnProperty.call(properties, propertyKey) && !isUndefinedMarker(properties[propertyKey])) {
      output.push(properties[propertyKey]);
    }
  }
  return output;
}

function isUndefinedMarker(value: unknown): boolean {
  const record = asRecord(value);
  return Boolean(record && asString(record.__type__) === 'Undefined');
}

function parseSource(value: unknown): TrainingSource | null {
  const normalized = asString(value)?.toLowerCase();
  if (normalized === 'explicit' || normalized === 'implicit') {
    return normalized;
  }
  return null;
}

function parseSplit(value: unknown): TrainingSplit | null {
  const normalized = asString(value)?.toLowerCase();
  if (normalized === 'train' || normalized === 'calibration' || normalized === 'test') {
    return normalized;
  }
  return null;
}

function parseBinary(value: unknown): 0 | 1 | undefined {
  if (value === 0 || value === false || value === '0') {
    return 0;
  }
  if (value === 1 || value === true || value === '1') {
    return 1;
  }
  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  return undefined;
}

function resolveRunName(name: string | undefined, candidate: ExtensionCandidate): string {
  const prefix = slugify(name?.trim() || `${candidate.profile}-${candidate.extensionId}`);
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+$/, '').replace('T', '-');
  return `${prefix}-${stamp}`;
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '') || 'chrome-export';
}

function printSummary(payload: ExportPayload, outputPath: string): void {
  console.log(
    [
      `Export concluido: ${outputPath}`,
      `Perfil: ${payload.metadata.profile}`,
      `Extensao: ${payload.metadata.extensionId}`,
      `Amostras: ${payload.metadata.counts.examples}`,
      `Behavior events: ${payload.metadata.counts.behaviorEvents}`,
      `Meta entries: ${payload.metadata.counts.metaEntries}`
    ].join('\n')
  );
}

void main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
