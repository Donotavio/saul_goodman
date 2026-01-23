import type { McpCallResult } from '../mcp/client.js';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { ScenarioContext } from './types.js';

/**
 * Extracts the first JSON-ish payload from an MCP tool result.
 * Tries native json entries, then looks for a ```json ...``` block, then raw JSON string.
 */
export function extractJson<T = unknown>(result: McpCallResult): T | undefined {
  if (result.json.length > 0) {
    return result.json[0] as T;
  }

  for (const text of result.text) {
    const fenced = text.match(/```json\s*([\s\S]*?)```/i);
    if (fenced?.[1]) {
      try {
        return JSON.parse(fenced[1]) as T;
      } catch (_error) {
        // ignore
      }
    }
    try {
      return JSON.parse(text.trim()) as T;
    } catch (_error) {
      // ignore
    }
  }

  return undefined;
}

export interface ScreenshotCompareResult {
  expected?: string;
  actual: string;
  diff?: string;
  matches: boolean;
}

function fileHash(filePath: string): string {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash('sha1').update(buf).digest('hex');
}

export function compareScreenshot(
  actualPath: string,
  baselineDir: string,
  name: string,
  updateBaseline: boolean
): ScreenshotCompareResult {
  const expectedPath = path.join(baselineDir, `${name}.png`);
  if (!fs.existsSync(actualPath)) {
    return { actual: actualPath, matches: false };
  }
  if (!fs.existsSync(expectedPath)) {
    if (updateBaseline) {
      fs.mkdirSync(baselineDir, { recursive: true });
      fs.copyFileSync(actualPath, expectedPath);
      return { actual: actualPath, expected: expectedPath, matches: true };
    }
    return { actual: actualPath, expected: expectedPath, matches: false };
  }

  const expectedHash = fileHash(expectedPath);
  const actualHash = fileHash(actualPath);
  if (expectedHash === actualHash) {
    return { actual: actualPath, expected: expectedPath, matches: true };
  }

  const diffPath = path.join(path.dirname(actualPath), `${name}-diff.txt`);
  fs.writeFileSync(
    diffPath,
    `expected: ${expectedPath}\nactual: ${actualPath}\nexpectedHash: ${expectedHash}\nactualHash: ${actualHash}\n`,
    'utf-8'
  );
  if (updateBaseline) {
    fs.copyFileSync(actualPath, expectedPath);
  }
  return { actual: actualPath, expected: expectedPath, diff: diffPath, matches: updateBaseline };
}

export function saveJsonArtifact(
  ctx: ScenarioContext,
  scenario: string,
  suffix: string,
  data: unknown
): string {
  const dir = path.join(ctx.artifactsDir, 'logs');
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `${ctx.viewportName}-${scenario}-${suffix}.json`);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  return filePath;
}
