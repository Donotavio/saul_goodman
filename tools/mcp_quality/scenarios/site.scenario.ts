import path from 'node:path';
import type { DevtoolsMcpClient } from '../mcp/client.js';
import type { ScenarioContext, ScenarioResult } from './types.js';
import { extractJson } from './helpers.js';

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
    errors.push('Hero não encontrado.');
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
    details
  };
}
