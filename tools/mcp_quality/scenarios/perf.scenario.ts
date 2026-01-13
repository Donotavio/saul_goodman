import path from 'node:path';
import fs from 'node:fs';
import { HARNESS_PAGES } from '../config.js';
import type { DevtoolsMcpClient } from '../mcp/client.js';
import type { ScenarioContext, ScenarioResult } from './types.js';

function firstJson(result: { json: unknown[]; text: string[] }): unknown {
  if (result.json.length > 0) {
    return result.json[0];
  }
  for (const entry of result.text) {
    try {
      return JSON.parse(entry);
    } catch (_error) {
      // ignore
    }
  }
  return undefined;
}

interface PerfTarget {
  key: 'popup' | 'report';
  url: string;
}

export async function runPerfScenario(
  client: DevtoolsMcpClient,
  ctx: ScenarioContext
): Promise<ScenarioResult> {
  const tracesDir = path.join(ctx.artifactsDir, 'traces');
  fs.mkdirSync(tracesDir, { recursive: true });
  const targets: PerfTarget[] = [
    { key: 'popup', url: `${ctx.baseUrl}${HARNESS_PAGES.popup}` },
    { key: 'report', url: `${ctx.baseUrl}${HARNESS_PAGES.report}` }
  ];

  const errors: string[] = [];
  const warnings: string[] = [];
  const details: string[] = [];
  const artifacts: Record<string, string> = {};

  for (const target of targets) {
    const tracePath = path.join(tracesDir, `${ctx.viewportName}-${target.key}.json`);
    await client.newPage(target.url, 15000);
    await client.waitFor(target.key === 'popup' ? 'Índice' : 'Relatório', 10000);

    const startResult = await client.performanceStart(tracePath, {
      reload: true,
      autoStop: true
    });
    const startPayload = firstJson(startResult) as Record<string, unknown> | undefined;
    details.push(
      `${target.key}: trace iniciado (${tracePath})${startPayload ? ' com payload' : ''}`
    );

    await client.performanceStop(tracePath);
    artifacts[`${target.key}Trace`] = tracePath;
  }

  return {
    name: 'perf',
    viewport: ctx.viewportName,
    passed: errors.length === 0,
    errors,
    warnings,
    artifacts,
    details
  };
}
