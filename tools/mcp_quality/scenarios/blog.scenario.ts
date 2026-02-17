import path from 'node:path';
import type { DevtoolsMcpClient } from '../mcp/client.js';
import type { ScenarioContext, ScenarioResult } from './types.js';
import { extractJson, saveJsonArtifact } from './helpers.js';

const ALLOWED_EXTERNAL_HOSTS = ['googletagmanager.com', 'google-analytics.com', 'gstatic.com'];

function isAllowedExternalHost(urlValue: string): boolean {
  try {
    const hostname = new URL(urlValue).hostname.toLowerCase();
    return ALLOWED_EXTERNAL_HOSTS.some(
      (allowedHost) => hostname === allowedHost || hostname.endsWith(`.${allowedHost}`)
    );
  } catch {
    return false;
  }
}

export async function runBlogScenario(
  client: DevtoolsMcpClient,
  ctx: ScenarioContext
): Promise<ScenarioResult> {
  const pageUrl = `${ctx.baseUrl}/site/blog/index.html`;
  const screenshotPath = path.join(
    ctx.artifactsDir,
    'screenshots',
    `${ctx.viewportName}-blog.png`
  );
  const errors: string[] = [];
  const warnings: string[] = [];
  const details: string[] = [];

  await client.newPage(pageUrl, 20000);
  await client.waitFor('Blog do Saul Goodman', 10000);

  // Console errors
  const consoleRes = await client.listConsoleMessages();
  const consolePayload = extractJson<{ messages?: Array<{ type?: string; text?: string }> }>(
    consoleRes
  );
  const consoleErrors =
    consolePayload?.messages?.filter((m) => m.type === 'error' || m.type === 'exception') ?? [];
  const consolePath = saveJsonArtifact(ctx, 'blog', 'console', consolePayload ?? {});
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
      const isThirdParty = isAllowedExternalHost(url);
      return statusOk && !isThirdParty;
    }) ?? [];
  const networkPath = saveJsonArtifact(ctx, 'blog', 'network', networkPayload ?? {});
  if (failed.length > 0) {
    errors.push(`Requests com status >=400: ${failed.length}`);
  }

  const check = await client.evaluateScript(
    `() => {
      const header = document.querySelector('h1');
      const posts = Array.from(document.querySelectorAll('.post-card, article'));
      const firstTitle = posts[0]?.textContent?.trim() ?? '';
      const filters = document.querySelectorAll('[data-category]');
      return {
        header: header?.textContent?.trim() ?? '',
        postCount: posts.length,
        firstTitle,
        filterCount: filters.length
      };
    }`
  );
  const payload = extractJson(check) as
    | { header?: string; postCount?: number; firstTitle?: string; filterCount?: number }
    | undefined;

  if ((payload?.postCount ?? 0) === 0) {
    warnings.push('Nenhum post listado no blog.');
  }
  if (!payload?.header) {
    warnings.push('Título principal do blog não encontrado.');
  }
  if ((payload?.filterCount ?? 0) === 0) {
    warnings.push('Filtros/categorias não renderizados.');
  }

  await client.takeScreenshot(screenshotPath, { fullPage: true });
  details.push(
    `Posts: ${payload?.postCount ?? 0}, primeiro título: "${payload?.firstTitle ?? '--'}"`
  );

  return {
    name: 'blog',
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
