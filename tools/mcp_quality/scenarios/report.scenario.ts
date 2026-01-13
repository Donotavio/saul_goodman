import path from 'node:path';
import { HARNESS_PAGES } from '../config.js';
import type { DevtoolsMcpClient } from '../mcp/client.js';
import type { ScenarioContext, ScenarioResult } from './types.js';
import { extractJson, saveJsonArtifact } from './helpers.js';

export async function runReportScenario(
  client: DevtoolsMcpClient,
  ctx: ScenarioContext
): Promise<ScenarioResult> {
  const pageUrl = `${ctx.baseUrl}${HARNESS_PAGES.report}`;
  const screenshotPath = path.join(
    ctx.artifactsDir,
    'screenshots',
    `${ctx.viewportName}-report.png`
  );
  const errors: string[] = [];
  const warnings: string[] = [];
  const details: string[] = [];

  await client.newPage(pageUrl, 15000);
  await client.waitFor('Relatório', 10000);

  const consoleRes = await client.listConsoleMessages();
  const consolePayload = extractJson<{ messages?: Array<{ type?: string; text?: string }> }>(
    consoleRes
  );
  const consoleErrors =
    consolePayload?.messages?.filter((m) => m.type === 'error' || m.type === 'exception') ?? [];
  const consolePath = saveJsonArtifact(ctx, 'report', 'console', consolePayload ?? {});
  if (consoleErrors.length > 0 && !ctx.allowWarnings) {
    errors.push(`Console errors: ${consoleErrors.length}`);
  } else if (consoleErrors.length > 0) {
    warnings.push(`Console errors: ${consoleErrors.length}`);
  }

  const networkRes = await client.listNetworkRequests();
  const networkPayload = extractJson<{ requests?: Array<{ status?: number; url?: string }> }>(
    networkRes
  );
  const failed =
    networkPayload?.requests?.filter((r) => typeof r.status === 'number' && r.status >= 400) ?? [];
  const networkPath = saveJsonArtifact(ctx, 'report', 'network', networkPayload ?? {});
  if (failed.length > 0 && !ctx.allowWarnings) {
    errors.push(`Requests com status >=400: ${failed.length}`);
  } else if (failed.length > 0) {
    warnings.push(`Requests com status >=400: ${failed.length}`);
  }

  const checkResult = await client.evaluateScript(
    `() => {
      const hero = document.getElementById('heroIndex');
      const hourly = document.getElementById('hourlyChart');
      const composition = document.getElementById('compositionChart');
      const domain = document.getElementById('domainBreakdownChart');
      return {
        heroIndex: hero?.textContent ?? '',
        hourly: !!hourly,
        composition: !!composition,
        domain: !!domain,
        storyItems: Array.from(document.querySelectorAll('#storyList li')).length
      };
    }`
  );
  const payload = extractJson(checkResult) as
    | { heroIndex?: string; hourly?: boolean; composition?: boolean; domain?: boolean; storyItems?: number }
    | undefined;

  if (!payload?.hourly) {
    errors.push('Gráfico horário não encontrado.');
  }
  if (!payload?.composition) {
    errors.push('Gráfico de composição ausente.');
  }
  if (!payload?.domain) {
    warnings.push('Gráfico de domínios não renderizado.');
  }
  if ((payload?.storyItems ?? 0) <= 0) {
    warnings.push('Narrativa/story vazia.');
  }

  await client.takeScreenshot(screenshotPath, { fullPage: true });
  details.push(`Índice exibido: ${payload?.heroIndex ?? '--'}`);

  return {
    name: 'report',
    viewport: ctx.viewportName,
    passed: errors.length === 0,
    errors,
    warnings,
    screenshotPath,
    artifacts: {
      console: consolePath,
      network: networkPath
    },
    details
  };
}
