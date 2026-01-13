import fs from 'node:fs/promises';
import path from 'node:path';

interface PageSpec {
  src: string;
  dest: string;
}

const ROOT = path.resolve('.');
const PAGES: PageSpec[] = [
  { src: 'src/popup/popup.html', dest: 'tools/mcp_quality/harness/popup.html' },
  { src: 'src/options/options.html', dest: 'tools/mcp_quality/harness/options.html' },
  { src: 'src/report/report.html', dest: 'tools/mcp_quality/harness/report.html' }
];

function toRepoPath(file: string): string {
  return path.resolve(ROOT, file);
}

function rewriteAssets(html: string): string {
  return (
    html
      // CSS
      .replace(/href="\\.?\\.\\/popup\\.css"/g, 'href="/src/popup/popup.css"')
      .replace(/href="\\.?\\.\\/options\\.css"/g, 'href="/src/options/options.css"')
      .replace(/href="\\.?\\.\\/report\\.css"/g, 'href="/src/report/report.css"')
      // vendor/shared scripts
      .replace(/src="\\.\\.\\/vendor\\//g, 'src="/src/vendor/')
      .replace(/src="\\.\\.\\/shared\\//g, 'src="/src/shared/')
      // dist entrypoints
      .replace(/src="\\.\\.\\/\\.\\.\\/dist\\//g, 'src="/dist/')
      // icons and images
      .replace(/href="\\.\\.\\/img\\//g, 'href="/src/img/')
      .replace(/src="\\.\\.\\/img\\//g, 'src="/src/img/')
      // site/blog assets if present
      .replace(/src="\\.\\.\\/\\.\\.\\/site\\//g, 'src="/site/')
      .replace(/href="\\.\\.\\/\\.\\.\\/site\\//g, 'href="/site/')
  );
}

function injectStub(html: string): string {
  if (html.includes('chrome-stub.js')) {
    return html;
  }
  const stubSnippet =
    '    <script>window.__MCP_FORCE_CHROME_STUB__ = true;</script>\n' +
    '    <script src="./chrome-stub.js"></script>\n';

  const scriptIndex = html.indexOf('<script');
  if (scriptIndex === -1) {
    return html.replace('</head>', `${stubSnippet}</head>`);
  }
  return `${html.slice(0, scriptIndex)}${stubSnippet}${html.slice(scriptIndex)}`;
}

async function syncPage(spec: PageSpec): Promise<void> {
  const srcPath = toRepoPath(spec.src);
  const destPath = toRepoPath(spec.dest);
  const original = await fs.readFile(srcPath, 'utf-8');
  const rewritten = injectStub(rewriteAssets(original));
  await fs.mkdir(path.dirname(destPath), { recursive: true });
  await fs.writeFile(destPath, rewritten, 'utf-8');
  // eslint-disable-next-line no-console
  console.log(`[sync-harness] Updated ${spec.dest}`);
}

async function main(): Promise<void> {
  await Promise.all(PAGES.map(syncPage));
}

void main().catch((error) => {
  console.error('[sync-harness] Failed:', error);
  process.exitCode = 1;
});
