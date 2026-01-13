import type { ScenarioContext, ScenarioResult } from './types.js';

export async function runDaemonScenario(
  _client: unknown,
  ctx: ScenarioContext
): Promise<ScenarioResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const details: string[] = [];

  if (!ctx.daemon) {
    return {
      name: 'daemon',
      viewport: ctx.viewportName,
      passed: false,
      errors: ['Daemon não iniciado pelo runner.'],
      warnings
    };
  }

  const origin = ctx.daemon.origin;
  const key = ctx.daemon.key;

  async function fetchJson(url: string, options?: RequestInit) {
    const res = await fetch(url, options);
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  }

  const health = await fetchJson(`${origin}/health`);
  if (health.status !== 200 || !health.data?.ok) {
    errors.push(`Health falhou: status ${health.status}`);
  } else {
    details.push('Health OK');
  }

  const heartbeatRes = await fetch(`${origin}/v1/tracking/vscode/heartbeat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      key,
      sessionId: 'mcp-session',
      durationMs: 1500,
      timestamp: Date.now()
    })
  });
  if (heartbeatRes.status !== 204) {
    errors.push(`Heartbeat falhou: status ${heartbeatRes.status}`);
  } else {
    details.push('Heartbeat OK');
  }

  const summary = await fetchJson(`${origin}/v1/tracking/vscode/summary?key=${encodeURIComponent(key)}`);
  if (summary.status !== 200) {
    errors.push(`Summary falhou: status ${summary.status}`);
  } else {
    const total = summary.data?.totalActiveMs ?? 0;
    if (total <= 0) {
      warnings.push('Summary retornou totalActiveMs <= 0');
    }
    details.push(`Summary totalActiveMs=${total}`);
  }

  return {
    name: 'daemon',
    viewport: ctx.viewportName,
    passed: errors.length === 0,
    errors,
    warnings,
    artifacts: {
      stdout: ctx.daemon.logs?.stdout,
      stderr: ctx.daemon.logs?.stderr
    },
    details
  };
}
