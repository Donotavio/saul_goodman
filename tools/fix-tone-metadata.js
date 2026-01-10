#!/usr/bin/env node
/**
 * Remove campo 'tone' hardcoded dos posts existentes para permitir detecção automática.
 * Uso: node tools/fix-tone-metadata.js [--dry-run]
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const POSTS_DIR = path.join(ROOT, 'site', 'blog', 'posts');
const DRY_RUN = process.argv.includes('--dry-run');

async function findMarkdownFiles(dir) {
  const files = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await findMarkdownFiles(fullPath));
    } else if (entry.name.endsWith('.md')) {
      files.push(fullPath);
    }
  }
  
  return files;
}

function removeToneFromFrontmatter(content) {
  const lines = content.split('\n');
  const result = [];
  let inFrontmatter = false;
  let frontmatterStart = -1;
  let modified = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    if (line.trim() === '---') {
      if (!inFrontmatter && frontmatterStart === -1) {
        frontmatterStart = i;
        inFrontmatter = true;
        result.push(line);
      } else if (inFrontmatter) {
        inFrontmatter = false;
        result.push(line);
      } else {
        result.push(line);
      }
      continue;
    }
    
    if (inFrontmatter && line.match(/^tone:\s*["']?(incredulo|like|nao-corte)["']?\s*$/i)) {
      modified = true;
      continue; // Skip this line
    }
    
    result.push(line);
  }
  
  return { content: result.join('\n'), modified };
}

async function processFile(filePath) {
  const content = await fs.readFile(filePath, 'utf-8');
  const { content: newContent, modified } = removeToneFromFrontmatter(content);
  
  if (!modified) {
    return { path: filePath, status: 'unchanged' };
  }
  
  if (DRY_RUN) {
    return { path: filePath, status: 'would-fix' };
  }
  
  await fs.writeFile(filePath, newContent, 'utf-8');
  return { path: filePath, status: 'fixed' };
}

async function run() {
  console.log(`Buscando posts em ${POSTS_DIR}...`);
  console.log(DRY_RUN ? '[DRY RUN MODE]\n' : '');
  
  const files = await findMarkdownFiles(POSTS_DIR);
  console.log(`Encontrados ${files.length} arquivos markdown\n`);
  
  const results = { fixed: 0, unchanged: 0, errors: 0 };
  
  for (const file of files) {
    try {
      const result = await processFile(file);
      const relativePath = path.relative(ROOT, result.path);
      
      if (result.status === 'fixed' || result.status === 'would-fix') {
        results.fixed++;
        console.log(`✓ ${relativePath}`);
      } else {
        results.unchanged++;
      }
    } catch (error) {
      results.errors++;
      console.error(`✗ ${path.relative(ROOT, file)}: ${error.message}`);
    }
  }
  
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`Resultado:`);
  console.log(`  ${DRY_RUN ? 'Seriam corrigidos' : 'Corrigidos'}: ${results.fixed}`);
  console.log(`  Sem alteração: ${results.unchanged}`);
  console.log(`  Erros: ${results.errors}`);
  
  if (DRY_RUN && results.fixed > 0) {
    console.log(`\nPara aplicar as mudanças, execute:`);
    console.log(`  node tools/fix-tone-metadata.js`);
  }
}

run().catch((error) => {
  console.error('Erro:', error.message);
  process.exitCode = 1;
});
