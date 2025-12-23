#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPostUrl, writePostPage, writeRssFeed } from './post-page.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '../..');
const BLOG_DIR = path.join(ROOT, 'site', 'blog');
const POSTS_DIR = path.join(BLOG_DIR, 'posts');
const INDEX_PATH = path.join(BLOG_DIR, 'index.json');
const DRY_RUN = process.argv.includes('--dry-run') || process.env.DRY_RUN === 'true';

function stripQuotes(value) {
  if (typeof value !== 'string') return value;
  return value.replace(/^['"]+/, '').replace(/['"]+$/, '');
}

function normalizeRelative(filePath) {
  const relative = path.relative(POSTS_DIR, filePath);
  return relative.split(path.sep).join('/');
}

async function readDirRecursive(dir) {
  let results = [];
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results = results.concat(await readDirRecursive(fullPath));
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        results.push(fullPath);
      }
    }
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  return results;
}

function parseFrontmatter(markdown) {
  const normalized = markdown.replace(/^[\uFEFF]+/, '').replace(/\r\n?/g, '\n');
  if (!normalized.startsWith('---\n')) {
    return { data: {}, body: normalized.trim() };
  }
  const slice = normalized.slice(4);
  const endIdx = slice.indexOf('\n---');
  if (endIdx === -1) {
    return { data: {}, body: normalized.trim() };
  }
  const frontmatter = slice.slice(0, endIdx);
  const body = slice.slice(endIdx + 4).trim();
  const data = {};

  for (const line of frontmatter.split('\n')) {
    if (!line.trim()) continue;
    const [rawKey, ...rawValue] = line.split(':');
    if (!rawKey || rawValue.length === 0) continue;
    const key = rawKey.trim();
    const value = rawValue.join(':').trim();
    if (value.startsWith('[') && value.endsWith(']')) {
      data[key] = value
        .slice(1, -1)
        .split(',')
        .map((part) => stripQuotes(part.trim()))
        .filter(Boolean);
    } else {
      data[key] = stripQuotes(value);
    }
  }

  return { data, body };
}

function coerceTags(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    return value
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);
  }
  return [];
}

function ensureExcerpt(metadata, body) {
  if (metadata.excerpt) return metadata.excerpt;
  const clean = body
    .replace(/<!--lang:[a-z-]+-->/gi, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/[#*_>`-]/g, '')
    .replace(/\r?\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return clean.split(' ').slice(0, 40).join(' ');
}

async function buildIndex() {
  const markdownFiles = await readDirRecursive(POSTS_DIR);
  if (!markdownFiles.length) {
    console.warn('[blog:index] Nenhum post encontrado em site/blog/posts.');
  }

  const posts = [];
  for (const file of markdownFiles) {
    const raw = await fs.readFile(file, 'utf-8');
    const { data, body } = parseFrontmatter(raw);
    if (!data.title || !data.date || !data.category) {
      console.warn(`[blog:index] Ignorando ${file} — frontmatter incompleto.`);
      continue;
    }

    const relativePath = normalizeRelative(file);
    const excerpt = ensureExcerpt(data, body);
    const metadata = { ...data, excerpt };
    const entry = {
      title: metadata.title,
      url: buildPostUrl(relativePath),
      markdown: relativePath,
      date: metadata.date,
      category: metadata.category,
      tags: coerceTags(metadata.tags),
      excerpt,
    };

    Object.keys(data).forEach((key) => {
      if (['title', 'date', 'category', 'tags', 'excerpt'].includes(key)) return;
      if (metadata[key] === undefined || metadata[key] === null || metadata[key] === '') return;
      entry[key] = metadata[key];
    });

    posts.push(entry);
    await writePostPage({ relativePath, metadata, excerpt, dryRun: DRY_RUN });
  }

  posts.sort((a, b) => new Date(b.date) - new Date(a.date));
  const payload = { posts };

  await writeRssFeed(posts, DRY_RUN);

  if (DRY_RUN) {
    console.log('[blog:index] (dry-run) Índice não salvo. Prévia:');
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  await fs.mkdir(path.dirname(INDEX_PATH), { recursive: true });
  await fs.writeFile(INDEX_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8');
  console.log(`[blog:index] index.json atualizado com ${posts.length} posts.`);
}

buildIndex().catch((error) => {
  console.error('[blog:index] Falha ao gerar índice:', error.message);
  process.exitCode = 1;
});
