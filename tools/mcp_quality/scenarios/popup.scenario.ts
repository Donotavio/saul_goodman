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
      // ignore parsing failures
    }
  }
  return undefined;
}

export async function runPopupScenario(
  client: DevtoolsMcpClient,
  ctx: ScenarioContext
): Promise<ScenarioResult> {
  const pageUrl = `${ctx.baseUrl}${HARNESS_PAGES.popup}`;
  const screenshotPath = path.join(
    ctx.artifactsDir,
    'screenshots',
    `${ctx.viewportName}-popup.png`
  );
  const errors: string[] = [];
  const warnings: string[] = [];
  const details: string[] = [];

  await client.newPage(pageUrl, 15000);
  await client.waitFor('Índice', 10000);

  const checkResult = await client.evaluateScript(
    `() => {
      const required = ['scoreValue', 'productivityChart', 'domainsList', 'lastSync'];
      const presence = required.reduce((acc, id) => {
        acc[id] = Boolean(document.getElementById(id));
        return acc;
      }, {});
      return {
        presence,
        scoreText: document.getElementById('scoreValue')?.textContent ?? '',
        chartVisible: !!document.getElementById('productivityChart'),
        domainItems: Array.from(document.querySelectorAll('#domainsList li')).length
      };
    }`
  );
  const checkPayload = firstJson(checkResult) as
    | {
        presence: Record<string, boolean>;
        scoreText: string;
        chartVisible: boolean;
        domainItems: number;
      }
    | undefined;

  if (!checkPayload?.presence?.scoreValue) {
    errors.push('Elemento de score não encontrado.');
  }
  if (!checkPayload?.chartVisible) {
    errors.push('Canvas/gráfico não renderizado.');
  }
  if ((checkPayload?.domainItems ?? 0) <= 0) {
    warnings.push('Lista de domínios vazia (ok em dados de exemplo, mas verificar).');
  }
  if (!checkPayload?.presence?.lastSync) {
    warnings.push('Timestamp de última sincronização ausente.');
  }

  await client.takeScreenshot(screenshotPath, { fullPage: true });

  details.push(
    `Score: ${checkPayload?.scoreText ?? '--'}, domínios listados: ${
      checkPayload?.domainItems ?? 0
    }`
  );

  return {
    name: 'popup',
    viewport: ctx.viewportName,
    passed: errors.length === 0,
    errors,
    warnings,
    screenshotPath,
    details
  };
}
