import path from 'node:path';
import fs from 'node:fs';
import { HARNESS_PAGES } from '../config.js';
import type { DevtoolsMcpClient } from '../mcp/client.js';
import type { ScenarioContext, ScenarioResult } from './types.js';
import crypto from 'node:crypto';

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

function hashFile(filePath: string): string {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash('sha1').update(buf).digest('hex');
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
  const metrics: Record<string, unknown> = {};

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

    if (fs.existsSync(tracePath)) {
      const stats = fs.statSync(tracePath);
      metrics[target.key] = {
        tracePath,
        bytes: stats.size,
        hash: hashFile(tracePath)
      };
    }
  }

  // Perf baseline compare
  const baselinePath = path.join(
    ctx.artifactsDir,
    '..',
    'baselines',
    `perf.${ctx.viewportName}.json`
  );
  try {
    const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf-8'));
    for (const key of Object.keys(metrics)) {
      const current = metrics[key] as { bytes?: number };
      const prev = baseline[key];
      if (prev?.bytes && current?.bytes) {
        const delta = (current.bytes - prev.bytes) / prev.bytes;
        if (delta > 0.3) {
          warnings.push(`Trace ${key} aumentou ${Math.round(delta * 100)}% vs baseline.`);
        }
      }
    }
    details.push(`Perf baseline comparado: ${baselinePath}`);
  } catch {
    if (ctx.updateBaseline) {
      fs.writeFileSync(baselinePath, JSON.stringify(metrics, null, 2), 'utf-8');
      details.push('Baseline de perf atualizado.');
    } else {
      warnings.push('Baseline de perf ausente. Rode com --update-baseline para criar.');
    }
  }

  if (ctx.updateBaseline) {
    fs.writeFileSync(baselinePath, JSON.stringify(metrics, null, 2), 'utf-8');
  }

  return {
    name: 'perf',
    viewport: ctx.viewportName,
    passed: errors.length === 0,
    errors,
    warnings,
    metrics,
    artifacts,
    details
  };
}
