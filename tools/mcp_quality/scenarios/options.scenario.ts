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

export async function runOptionsScenario(
  client: DevtoolsMcpClient,
  ctx: ScenarioContext
): Promise<ScenarioResult> {
  const pageUrl = `${ctx.baseUrl}${HARNESS_PAGES.options}`;
  const screenshotPath = path.join(
    ctx.artifactsDir,
    'screenshots',
    `${ctx.viewportName}-options.png`
  );
  const errors: string[] = [];
  const warnings: string[] = [];
  const details: string[] = [];

  await client.newPage(pageUrl, 15000);
  await client.waitFor('Configurações', 10000);

  // Captura settings atuais
  const initialSettingsResult = await client.evaluateScript(
    `async () => {
      const data = await chrome.storage.local.get('sg:settings');
      return data['sg:settings'];
    }`
  );
  const initialSettings = firstJson(initialSettingsResult) as Record<string, unknown> | undefined;

  const newThreshold = 90000;
  const updateResult = await client.evaluateScript(
    `async (threshold) => {
      const form = document.getElementById('weightsForm');
      const input = document.getElementById('inactivityThreshold');
      if (!form || !input) {
        return { ok: false, reason: 'missing elements' };
      }
      input.value = String(threshold);
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await new Promise((resolve) => setTimeout(resolve, 300));
      const data = await chrome.storage.local.get('sg:settings');
      return { ok: true, stored: data['sg:settings']?.inactivityThresholdMs };
    }`,
    [newThreshold]
  );
  const updatePayload = firstJson(updateResult) as { ok?: boolean; stored?: number } | undefined;
  if (!updatePayload?.ok) {
    errors.push('Falha ao submeter formulário de pesos.');
  }

  // Recarrega para validar persistência
  await client.reload(5000);
  await client.waitFor('Configurações', 8000);
  const afterReload = await client.evaluateScript(
    `() => {
      const input = document.getElementById('inactivityThreshold');
      return input ? Number(input.value) : null;
    }`
  );
  const reloadedThreshold = firstJson(afterReload) as number | null | undefined;
  if (reloadedThreshold !== newThreshold) {
    errors.push(`Persistência falhou: esperado ${newThreshold}, obtido ${reloadedThreshold ?? 'n/a'}`);
  }

  if (initialSettings?.localePreference === undefined) {
    warnings.push('Locale preference não carregado na coleta inicial.');
  }

  await client.takeScreenshot(screenshotPath, { fullPage: true });

  details.push(
    `inactivityThreshold inicial: ${
      (initialSettings?.inactivityThresholdMs as number | undefined) ?? 'n/a'
    }, atualizado para ${newThreshold}`
  );

  return {
    name: 'options',
    viewport: ctx.viewportName,
    passed: errors.length === 0,
    errors,
    warnings,
    screenshotPath,
    details
  };
}
