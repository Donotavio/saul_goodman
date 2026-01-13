import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  DEFAULT_ARTIFACTS_DIR,
  DEFAULT_SCENARIOS,
  DEFAULT_VIEWPORTS,
  HARNESS_PAGES,
  type ScenarioName
} from './config.js';
import { DevtoolsMcpClient } from './mcp/client.js';
import { runOptionsScenario } from './scenarios/options.scenario.js';
import { runPerfScenario } from './scenarios/perf.scenario.js';
import { runPopupScenario } from './scenarios/popup.scenario.js';
import { runReportScenario } from './scenarios/report.scenario.js';
import type { ScenarioContext, ScenarioResult } from './scenarios/types.js';

const MIN_NODE_MAJOR = 18;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_HOST = '127.0.0.1';

if (Number.parseInt(process.versions.node.split('.')[0] ?? '0', 10) < MIN_NODE_MAJOR) {
  console.error(`[mcp-quality] Node ${MIN_NODE_MAJOR}+ required. Found ${process.versions.node}.`);
  process.exit(1);
}

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.aac': 'audio/aac',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.pdf': 'application/pdf'
};

function getContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] ?? 'application/octet-stream';
}

async function tryResolveFile(requestUrl: string, rootDir: string): Promise<string | null> {
  const parsed = new URL(requestUrl, 'http://localhost');
  const decodedPath = decodeURIComponent(parsed.pathname);
  const requestedPath = path.join(rootDir, decodedPath);
  const normalized = path.normalize(requestedPath);
  if (!normalized.startsWith(rootDir)) {
    return null;
  }

  let candidate = normalized;
  try {
    const stats = await fs.stat(candidate);
    if (stats.isDirectory()) {
      candidate = path.join(candidate, 'index.html');
    }
  } catch (_error) {
    // stat failed, try adding html if no extension and file missing
    if (!path.extname(candidate)) {
      const htmlCandidate = `${candidate}.html`;
      try {
        await fs.access(htmlCandidate);
        candidate = htmlCandidate;
      } catch (_innerError) {
        return null;
      }
    } else {
      return null;
    }
  }

  try {
    await fs.access(candidate);
    return candidate;
  } catch (_error) {
    return null;
  }
}

async function serveFile(filePath: string, res: ServerResponse): Promise<void> {
  try {
    const content = await fs.readFile(filePath);
    res.statusCode = 200;
    res.setHeader('Content-Type', getContentType(filePath));
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.end(content);
  } catch (error) {
    res.statusCode = 500;
    res.end(`Failed to read file: ${(error as Error).message}`);
  }
}

function sendNotFound(res: ServerResponse): void {
  res.statusCode = 404;
  res.end('Not found');
}

function requestListener(rootDir: string) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    if (!req.url || req.method === 'OPTIONS') {
      res.statusCode = 204;
      return res.end();
    }

    const resolved = await tryResolveFile(req.url, rootDir);
    if (!resolved) {
      return sendNotFound(res);
    }

    return serveFile(resolved, res);
  };
}

export interface StaticServer {
  port: number;
  host: string;
  baseUrl: string;
  close: () => Promise<void>;
}

export async function startStaticServer(options: {
  host?: string;
  port?: number;
  rootDir?: string;
} = {}): Promise<StaticServer> {
  const host = options.host ?? DEFAULT_HOST;
  const port = options.port ?? 0;
  const rootDir = options.rootDir ?? REPO_ROOT;
  const server = createServer(requestListener(rootDir));

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => resolve());
  });

  const address = server.address();
  const resolvedPort = typeof address === 'object' && address ? address.port : port;
  const baseUrl = `http://${host}:${resolvedPort}`;
  return {
    port: resolvedPort,
    host,
    baseUrl,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      })
  };
}

type ViewportKey = 'desktop' | 'mobile';

interface CliOptions {
  viewports: ViewportKey[];
  only: ScenarioName[];
  updateBaseline: boolean;
  allowWarnings: boolean;
  networkOffline: boolean;
  artifactsDir: string;
  baseUrl?: string;
}

const SCENARIO_RUNNERS: Record<
  ScenarioName,
  (client: DevtoolsMcpClient, ctx: ScenarioContext) => Promise<ScenarioResult>
> = {
  popup: runPopupScenario,
  options: runOptionsScenario,
  report: runReportScenario,
  perf: runPerfScenario
};

function parseCliArgs(argv: string[]): CliOptions {
  const defaults: CliOptions = {
    viewports: ['desktop', 'mobile'],
    only: [...DEFAULT_SCENARIOS],
    updateBaseline: false,
    allowWarnings: false,
    networkOffline: false,
    artifactsDir: DEFAULT_ARTIFACTS_DIR
  };

  for (const arg of argv) {
    if (arg === '--update-baseline') {
      defaults.updateBaseline = true;
      continue;
    }
    if (arg === '--allow-warnings') {
      defaults.allowWarnings = true;
      continue;
    }
    if (arg === '--network-offline') {
      defaults.networkOffline = true;
      continue;
    }
    if (arg.startsWith('--viewports=')) {
      const raw = arg.split('=')[1] ?? '';
      const values = raw.split(',').map((v) => v.trim()).filter(Boolean) as ViewportKey[];
      const filtered = values.filter((v) => v === 'desktop' || v === 'mobile');
      if (filtered.length > 0) {
        defaults.viewports = filtered;
      }
      continue;
    }
    if (arg.startsWith('--only=')) {
      const raw = arg.split('=')[1] ?? '';
      const values = raw.split(',').map((v) => v.trim()).filter(Boolean) as ScenarioName[];
      const valid = values.filter((v) => (SCENARIO_RUNNERS as Record<string, unknown>)[v]);
      if (valid.length > 0) {
        defaults.only = valid;
      }
      continue;
    }
    if (arg.startsWith('--artifacts-dir=')) {
      const raw = arg.split('=')[1];
      if (raw) {
        defaults.artifactsDir = path.resolve(raw);
      }
      continue;
    }
    if (arg.startsWith('--base-url=')) {
      const raw = arg.split('=')[1];
      if (raw) {
        defaults.baseUrl = raw.replace(/\/$/, '');
      }
    }
  }

  return defaults;
}

async function prepareArtifactDirs(root: string): Promise<void> {
  const dirs = [
    root,
    path.join(root, 'screenshots'),
    path.join(root, 'traces'),
    path.join(root, 'logs')
  ];
  await Promise.all(dirs.map((dir) => fs.mkdir(dir, { recursive: true })));
}

async function writeSummaries(results: ScenarioResult[], artifactsDir: string): Promise<void> {
  const summaryPath = path.join(artifactsDir, 'summary.json');
  const markdownPath = path.join(artifactsDir, 'summary.md');

  const payload = {
    createdAt: new Date().toISOString(),
    results
  };
  await fs.writeFile(summaryPath, JSON.stringify(payload, null, 2), 'utf-8');

  const lines: string[] = ['# MCP Quality Suite', '', `Total cenários: ${results.length}`, ''];
  for (const result of results) {
    lines.push(
      `- ${result.name} (${result.viewport}): ${result.passed ? '✅' : '❌'}${
        result.errors?.length ? ` — ${result.errors.join('; ')}` : ''
      }`
    );
  }
  await fs.writeFile(markdownPath, lines.join('\n'), 'utf-8');
}

async function main(): Promise<void> {
  const cli = parseCliArgs(process.argv.slice(2));
  await prepareArtifactDirs(cli.artifactsDir);

  const server = cli.baseUrl ? null : await startStaticServer();
  const baseUrl = cli.baseUrl ?? server?.baseUrl;
  if (!baseUrl) {
    throw new Error('Base URL not defined.');
  }

  // eslint-disable-next-line no-console
  console.log(`[mcp-quality] Base URL: ${baseUrl}`);
  // eslint-disable-next-line no-console
  console.log(
    `[mcp-quality] Running scenarios: ${cli.only.join(', ')} | viewports: ${cli.viewports.join(', ')}`
  );

  const allResults: ScenarioResult[] = [];
  for (const viewportName of cli.viewports) {
    const client = new DevtoolsMcpClient();
    await client.connect({
      headless: true,
      isolated: true,
      viewport: DEFAULT_VIEWPORTS[viewportName]
    });
    if (cli.networkOffline) {
      await client.emulate({ networkConditions: 'Offline' });
    }

    const ctx: ScenarioContext = {
      client,
      baseUrl,
      artifactsDir: cli.artifactsDir,
      viewportName,
      viewport: DEFAULT_VIEWPORTS[viewportName],
      allowWarnings: cli.allowWarnings,
      updateBaseline: cli.updateBaseline
    };

    for (const scenario of cli.only) {
      const runner = SCENARIO_RUNNERS[scenario];
      if (!runner) {
        // eslint-disable-next-line no-console
        console.warn(`[mcp-quality] Scenario ${scenario} not implemented.`);
        continue;
      }
      try {
        const result = await runner(client, ctx);
        allResults.push(result);
        // eslint-disable-next-line no-console
        console.log(
          `[mcp-quality] ${scenario} (${viewportName}): ${result.passed ? 'ok' : 'fail'}`
        );
      } catch (error) {
        allResults.push({
          name: scenario,
          viewport: viewportName,
          passed: false,
          errors: [(error as Error).message],
          warnings: []
        });
        // eslint-disable-next-line no-console
        console.error(`[mcp-quality] ${scenario} (${viewportName}) falhou`, error);
      }
    }

    await client.dispose();
  }

  await writeSummaries(allResults, cli.artifactsDir);
  await server?.close();
}

const isDirectRun = import.meta.url === pathToFileURL(process.argv[1] ?? '').href;
if (isDirectRun) {
  main().catch((error) => {
    console.error('[mcp-quality] Failed to start server', error);
    process.exitCode = 1;
  });
}
