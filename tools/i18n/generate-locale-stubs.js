#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '../..');
const SITE_DIR = path.join(ROOT, 'site');

const LOCALES = [
  'pt-BR',
  'en-US',
  'es-419',
  'fr',
  'de',
  'it',
  'tr',
  'zh-CN',
  'hi',
  'ar',
  'bn',
  'ru',
  'ur',
];

const STUB_TEMPLATE = (locale) => `<!doctype html>
<html lang="${locale}">
  <head>
    <meta charset="utf-8" />
    <title>Loading…</title>
    <meta http-equiv="refresh" content="0;url=/" />
    <script>
      (function() {
        var locale = '${locale}';
        try {
          document.cookie = 'saul_lang=' + encodeURIComponent(locale) + '; path=/; max-age=' + 60 * 60 * 24 * 365 + '; SameSite=Lax';
        } catch (error) {
          // ignore
        }
        var parts = (location.pathname || '').split('/').filter(Boolean);
        var idx = parts.indexOf(locale);
        if (idx !== -1) {
          parts.splice(idx, 1);
        }
        var targetPath = '/' + parts.join('/') + (location.pathname.endsWith('/') ? '/' : '');
        var target = targetPath + (location.search || '') + (location.hash || '');
        window.location.replace(target || '/');
      })();
    </script>
  </head>
  <body></body>
</html>
`;

async function listHtmlFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const results = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (LOCALES.includes(entry.name)) continue;
      results.push(...(await listHtmlFiles(fullPath)));
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      results.push(fullPath);
    }
  }
  return results;
}

async function writeStub(locale, relativePath) {
  const destination = path.join(SITE_DIR, locale, relativePath);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.writeFile(destination, STUB_TEMPLATE(locale), 'utf-8');
}

async function main() {
  const htmlFiles = await listHtmlFiles(SITE_DIR);
  const relativeFiles = htmlFiles.map((file) => path.relative(SITE_DIR, file));
  for (const locale of LOCALES) {
    for (const rel of relativeFiles) {
      await writeStub(locale, rel);
    }
  }
  console.log(
    `[i18n] Generated locale stubs for ${LOCALES.length} locales and ${relativeFiles.length} HTML files.`
  );
}

main().catch((error) => {
  console.error('[i18n] Failed to generate locale stubs:', error);
  process.exitCode = 1;
});
