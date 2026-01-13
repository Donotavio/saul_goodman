import path from 'node:path';
import type { DevtoolsMcpClient } from '../mcp/client.js';
import type { ScenarioContext, ScenarioResult } from './types.js';
import { extractJson, saveJsonArtifact } from './helpers.js';

export async function runSiteScenario(
  client: DevtoolsMcpClient,
  ctx: ScenarioContext
): Promise<ScenarioResult> {
  const pageUrl = `${ctx.baseUrl}/site/index.html`;
  const screenshotPath = path.join(
    ctx.artifactsDir,
    'screenshots',
    `${ctx.viewportName}-site.png`
  );
  const errors: string[] = [];
  const warnings: string[] = [];
  const details: string[] = [];

  await client.newPage(pageUrl, 20000);
  await client.waitFor('Saul Goodman', 10000);

  // Console errors
  const consoleRes = await client.listConsoleMessages();
  const consolePayload = extractJson<{ messages?: Array<{ type?: string; text?: string }> }>(
    consoleRes
  );
  const consoleErrors =
    consolePayload?.messages?.filter((m) => m.type === 'error' || m.type === 'exception') ?? [];
  const consolePath = saveJsonArtifact(ctx, 'site', 'console', consolePayload ?? {});
  if (consoleErrors.length > 0) {
    errors.push(`Console errors: ${consoleErrors.length}`);
  }

  // Network failures
  const networkRes = await client.listNetworkRequests();
  const networkPayload = extractJson<{ requests?: Array<{ status?: number; url?: string }> }>(
    networkRes
  );
  const failed =
    networkPayload?.requests?.filter((r) => {
      const statusOk = typeof r.status === 'number' && r.status >= 400;
      const url = r.url ?? '';
      // ignore third-party trackers/fonts
      const isThirdParty =
        url.includes('googletagmanager.com') ||
        url.includes('google-analytics.com') ||
        url.includes('gstatic.com');
      return statusOk && !isThirdParty;
    }) ?? [];
  const networkPath = saveJsonArtifact(ctx, 'site', 'network', networkPayload ?? {});
  if (failed.length > 0) {
    errors.push(`Requests com status >=400: ${failed.length}`);
  }

  const check = await client.evaluateScript(
    `() => {
      const hero = document.querySelector('h1');
      const cta = document.querySelector('a.cta-primary, a[href*="chrome.google.com"], a[href*="saul_goodman"]');
      const blogPreview = document.getElementById('blog-preview-list');
      const previewCards = blogPreview ? blogPreview.querySelectorAll('article').length : 0;
      return {
        hero: hero?.textContent?.trim() ?? '',
        hasCta: Boolean(cta),
        previewCards
      };
    }`
  );
  const payload = extractJson(check) as
    | { hero?: string; hasCta?: boolean; previewCards?: number }
    | undefined;

  if (!payload?.hero) {
    warnings.push('Hero não encontrado.');
  }
  if (!payload?.hasCta) {
    warnings.push('CTA principal não encontrado.');
  }
  if ((payload?.previewCards ?? 0) === 0) {
    warnings.push('Nenhum card de blog preview renderizado.');
  }

  await client.takeScreenshot(screenshotPath, { fullPage: true });
  details.push(
    `Hero: "${payload?.hero ?? '--'}", blog cards: ${payload?.previewCards ?? 0}`
  );

  return {
    name: 'site',
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
