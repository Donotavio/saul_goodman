import path from 'node:path';
import { HARNESS_PAGES } from '../config.js';
import type { DevtoolsMcpClient } from '../mcp/client.js';
import type { ScenarioContext, ScenarioResult } from './types.js';
import { extractJson, saveJsonArtifact } from './helpers.js';

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

  const consoleRes = await client.listConsoleMessages();
  const consolePayload = extractJson<{ messages?: Array<{ type?: string; text?: string }> }>(
    consoleRes
  );
  const consoleErrors =
    consolePayload?.messages?.filter((m) => m.type === 'error' || m.type === 'exception') ?? [];
  const consolePath = saveJsonArtifact(ctx, 'popup', 'console', consolePayload ?? {});
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
  const networkPath = saveJsonArtifact(ctx, 'popup', 'network', networkPayload ?? {});
  if (failed.length > 0 && !ctx.allowWarnings) {
    errors.push(`Requests com status >=400: ${failed.length}`);
  } else if (failed.length > 0) {
    warnings.push(`Requests com status >=400: ${failed.length}`);
  }

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
  const checkPayload = extractJson(checkResult) as
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
    artifacts: {
      console: consolePath,
      network: networkPath
    },
    details
  };
}
