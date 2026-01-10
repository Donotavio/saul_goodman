#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = path.resolve(__dirname, '../..');
const SOURCE = path.join(ROOT, '_locales');

const TARGETS = [path.join(ROOT, 'site', '_locales'), path.join(ROOT, 'site', 'blog', '_locales')];

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function copyDirRecursive(src, dest) {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDirRecursive(from, to);
    } else if (entry.isFile()) {
      await fs.copyFile(from, to);
    }
  }
}

async function main() {
  if (!(await exists(SOURCE))) {
    throw new Error(`Diretório de origem não encontrado: ${SOURCE}`);
  }

  for (const target of TARGETS) {
    await fs.rm(target, { recursive: true, force: true });
    await copyDirRecursive(SOURCE, target);
    console.log(`[i18n] Copiado _locales -> ${target}`);
  }
}

main().catch((error) => {
  console.error('[i18n] Falha ao copiar locales para o site:', error);
  process.exitCode = 1;
});
