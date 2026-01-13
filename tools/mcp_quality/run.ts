import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { HARNESS_PAGES } from './config.js';

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

async function main(): Promise<void> {
  const server = await startStaticServer();
  // eslint-disable-next-line no-console
  console.log(`[mcp-quality] Static server ready at ${server.baseUrl}`);
  Object.entries(HARNESS_PAGES).forEach(([name, pathValue]) => {
    // eslint-disable-next-line no-console
    console.log(`- ${name}: ${server.baseUrl}${pathValue}`);
  });
}

const isDirectRun = import.meta.url === pathToFileURL(process.argv[1] ?? '').href;
if (isDirectRun) {
  main().catch((error) => {
    console.error('[mcp-quality] Failed to start server', error);
    process.exitCode = 1;
  });
}
