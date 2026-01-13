import path from 'node:path';
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
  const payload = firstJson(checkResult) as
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
    details
  };
}
