import path from 'node:path';
import { HARNESS_PAGES } from '../config.js';
import type { DevtoolsMcpClient } from '../mcp/client.js';
import type { ScenarioContext, ScenarioResult } from './types.js';
import { extractJson } from './helpers.js';

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

  // Aguarda hidratação inicial preencher os campos.
  await client.evaluateScript(
    `async () => {
      for (let i = 0; i < 30; i++) {
        const input = document.getElementById('inactivityThreshold');
        if (input && input.value) {
          return true;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      return false;
    }`
  );

  // Captura settings atuais
  const initialSettingsResult = await client.evaluateScript(
    `async () => {
      const data = await chrome.storage.local.get('sg:settings');
      return data['sg:settings'];
    }`
  );
  const initialSettings = extractJson<Record<string, unknown> | undefined>(initialSettingsResult);

  const newThresholdSeconds = 120;
  const updateResult = await client.evaluateScript(
    `async () => {
      const form = document.getElementById('weightsForm');
      const input = document.getElementById('inactivityThreshold');
      if (!form || !input) {
        return { ok: false, reason: 'missing elements' };
      }
      input.value = '${newThresholdSeconds}';
      form.requestSubmit();
      await new Promise((resolve) => setTimeout(resolve, 800));
      const data = await chrome.storage.local.get('sg:settings');
      return { ok: true, stored: data['sg:settings']?.inactivityThresholdMs };
    }`
  );
  const updatePayload = extractJson<{ ok?: boolean; stored?: number; reason?: string } | undefined>(
    updateResult
  );
  const expectedMs = newThresholdSeconds * 1000;
  const storedMs = updatePayload?.stored;
  if (!updatePayload?.ok) {
    errors.push(`Falha ao submeter formulário de pesos.${updatePayload?.reason ? ` ${updatePayload.reason}` : ''}`);
  } else if (typeof storedMs !== 'number' || Math.abs(storedMs - expectedMs) > 1) {
    errors.push(`Persistência falhou: esperado ${expectedMs}, obtido ${storedMs ?? 'n/a'}`);
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
  const reloadedThreshold = extractJson<number | null | undefined>(afterReload);
  if (reloadedThreshold !== newThresholdSeconds) {
    errors.push(
      `Persistência falhou: esperado ${newThresholdSeconds}, obtido ${reloadedThreshold ?? 'n/a'}`
    );
  }

  if (initialSettings?.localePreference === undefined) {
    warnings.push('Locale preference não carregado na coleta inicial.');
  }

  await client.takeScreenshot(screenshotPath, { fullPage: true });

  details.push(
    `inactivityThreshold inicial: ${
      (initialSettings?.inactivityThresholdMs as number | undefined) ?? 'n/a'
    }, atualizado para ${newThresholdSeconds}s`
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
