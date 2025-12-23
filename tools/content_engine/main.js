#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '../..');
const BLOG_ROOT = path.join(ROOT, 'site', 'blog');
const POSTS_DIR = path.join(BLOG_ROOT, 'posts');
const INDEX_PATH = path.join(BLOG_ROOT, 'index.json');
const SOURCES_PATH = path.join(__dirname, 'sources.json');
const STATE_PATH = path.join(__dirname, 'state', 'posted.json');

const CATEGORY_OPTIONS = ['procrastinacao', 'foco-atencao', 'dev-performance', 'trabalho-remoto'];
const MIN_SCORE = 1;
const DEFAULT_WINDOW_DAYS = 14;
const RETRIES = 2;
const TIMEOUT_MS = 30000;
const DRY_RUN = process.argv.includes('--dry-run') || process.env.DRY_RUN === 'true';
const LLM_PROVIDER = process.env.LLM_PROVIDER || 'openai';

async function readJson(file, fallback) {
  try {
    const raw = await fs.readFile(file, 'utf-8');
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
}

async function writeJson(file, data) {
  const dir = path.dirname(file);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(data, null, 2)}\n`, 'utf-8');
}

function slugify(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function withinWindow(dateStr, days) {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return false;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return date.getTime() >= cutoff;
}

function scoreItem(item, keywords) {
  const haystack = `${item.title || ''} ${item.summary || ''}`.toLowerCase();
  return keywords.reduce((score, keyword) => {
    const normalized = keyword.toLowerCase();
    return haystack.includes(normalized) ? score + 1 : score;
  }, 0);
}

function decodeHtml(value) {
  if (!value) return '';
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

function extractTag(block, tag) {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return match ? decodeHtml(match[1].trim()) : '';
}

function extractLink(block) {
  const attrLink = block.match(/<link[^>]*href="([^"]+)"[^>]*>/i);
  if (attrLink) return attrLink[1];
  return extractTag(block, 'link');
}

function parseFeedContent(xml) {
  const items = [];
  const itemPattern = /<item>([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = itemPattern.exec(xml))) {
    const block = match[1];
    items.push({
      title: extractTag(block, 'title'),
      link: extractLink(block),
      published: extractTag(block, 'pubDate') || extractTag(block, 'updated') || extractTag(block, 'published'),
      summary: extractTag(block, 'description') || extractTag(block, 'content'),
    });
  }

  const entryPattern = /<entry>([\s\S]*?)<\/entry>/gi;
  while ((match = entryPattern.exec(xml))) {
    const block = match[1];
    items.push({
      title: extractTag(block, 'title'),
      link: extractLink(block),
      published: extractTag(block, 'updated') || extractTag(block, 'published'),
      summary: extractTag(block, 'summary') || extractTag(block, 'content'),
    });
  }

  return items.filter((item) => item.title && item.link);
}

async function loadConfig() {
  const cfg = await readJson(SOURCES_PATH, null);
  if (!cfg || !Array.isArray(cfg.feeds) || cfg.feeds.length === 0) {
    throw new Error('Configuração inválida em sources.json');
  }
  if (!Array.isArray(cfg.keywords) || cfg.keywords.length === 0) {
    throw new Error('Nenhuma keyword definida em sources.json');
  }
  return cfg;
}

async function loadPosted() {
  return readJson(STATE_PATH, { entries: [] });
}

function alreadyPosted(url, posted) {
  return posted.entries.some((entry) => entry.source_url === url);
}

async function fetchCandidates(config, posted) {
  const windowDays = Number(config.window_days) || DEFAULT_WINDOW_DAYS;
  const candidates = [];

  for (const feed of config.feeds) {
    try {
      const response = await fetch(feed.url, { headers: { Accept: 'application/rss+xml,application/atom+xml,text/xml' } });
      if (!response.ok) {
        console.warn(`Feed ${feed.url} retornou ${response.status}`);
        continue;
      }

      const xml = await response.text();
      const items = parseFeedContent(xml);

      for (const item of items) {
        const published = item.published;
        if (!published || !withinWindow(published, windowDays)) continue;
        if (alreadyPosted(item.link, posted)) continue;

        const score = scoreItem(item, config.keywords);
        candidates.push({
          feed: feed.name,
          link: item.link,
          title: item.title || 'Sem título',
          summary: item.summary || '',
          published,
          score,
        });
      }
    } catch (error) {
      console.warn(`Falha ao ler feed ${feed.url}: ${error.message}`);
    }
  }

  return candidates.sort((a, b) => b.score - a.score);
}

function buildPrompt(candidate) {
  return `Você é o Saul Goodman escrevendo sobre foco, procrastinação e performance dev.
Fonte selecionada: ${candidate.title} (${candidate.link}) publicada em ${candidate.published}.
Resumo do item: ${candidate.summary?.slice(0, 400) || 'sem resumo'}.
Resuma e reescreva em PT-BR com sarcasmo elegante, sem coach e sem propaganda.
Estrutura obrigatória em Markdown com frontmatter YAML:
---
title: <título provocativo>
date: ${new Date().toISOString().slice(0, 10)}
category: escolha entre procrastinacao | foco-atencao | dev-performance | trabalho-remoto
tags: [3-5 tags curtas]
source_title: "${candidate.title}"
source_url: "${candidate.link}"
source_published_at: ${candidate.published || new Date().toISOString()}
excerpt: resumo curto (até 200 caracteres)
---

Conteúdo (800-1200 palavras) com as seções:
1) Título provocativo (H1)
2) Abertura sarcástica (1 parágrafo)
3) Contexto real (resumo da notícia/estudo)
4) Tradução pro mundo digital (abas, redes, VS Code, remoto)
5) Análise do Saul (interpretação + confronto elegante)
6) Conclusão em tom de julgamento (1-2 frases)
7) Metadados no final listando category, tags, source_title, source_url, source_published_at.

Mantenha voz de Saul Goodman: ácido, esperto, mas não agressivo.`;
}

async function callLLM(prompt) {
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) throw new Error('LLM_API_KEY ausente');

  const model = process.env.LLM_MODEL || 'gpt-4o-mini';
  const base = process.env.LLM_BASE_URL || (LLM_PROVIDER === 'openai' ? 'https://api.openai.com/v1' : 'https://api.openai.com/v1');
  const baseUrl = base.endsWith('/') ? base : `${base}/`;
  const endpoint = 'chat/completions';
  const url = `${baseUrl}${endpoint}`;

  let lastError;
  for (let attempt = 0; attempt <= RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: 'Você é Saul Goodman escrevendo artigos de blog sarcásticos em PT-BR.' },
            { role: 'user', content: prompt },
          ],
          temperature: 0.7,
          max_tokens: 1200,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) {
        lastError = new Error(`LLM falhou: ${response.status} ${await response.text()}`);
        continue;
      }

      const payload = await response.json();
      const content = payload.choices?.[0]?.message?.content;
      if (content) return content.trim();
      lastError = new Error('Resposta do LLM vazia');
    } catch (error) {
      lastError = error.name === 'AbortError' ? new Error('LLM timeout') : error;
    }
  }

  throw lastError || new Error('Falha desconhecida ao chamar LLM');
}

function extractFrontmatter(markdown) {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)/);
  if (!match) throw new Error('Conteúdo sem frontmatter');
  const frontmatter = match[1];
  const body = match[2].trim();
  const data = {};

  for (const line of frontmatter.split(/\r?\n/)) {
    const [rawKey, ...rawValue] = line.split(':');
    if (!rawKey || rawValue.length === 0) continue;
    const key = rawKey.trim();
    const value = rawValue.join(':').trim();
    if (value.startsWith('[') && value.endsWith(']')) {
      data[key] = value
        .slice(1, -1)
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean);
    } else {
      data[key] = value.replace(/^"|"$/g, '');
    }
  }

  return { data, body };
}

function validateGenerated(content) {
  const { data, body } = extractFrontmatter(content);
  const required = ['title', 'date', 'category', 'tags', 'source_title', 'source_url', 'source_published_at'];
  for (const key of required) {
    if (!data[key] || (Array.isArray(data[key]) && data[key].length === 0)) {
      throw new Error(`Frontmatter incompleto: falta ${key}`);
    }
  }

  if (!CATEGORY_OPTIONS.includes(data.category)) {
    throw new Error(`Categoria inválida: ${data.category}`);
  }

  if (!body || body.length < 400) {
    throw new Error('Corpo muito curto, geração suspeita');
  }

  if (!data.excerpt) {
    const clean = body.replace(/[#*_`>-]/g, '').replace(/\s+/g, ' ').trim();
    data.excerpt = clean.split(' ').slice(0, 40).join(' ');
  }

  return { metadata: data, body, markdown: content.trim() };
}

async function ensureIndexFile() {
  const current = await readJson(INDEX_PATH, null);
  if (current) return current;
  const fallback = { posts: [] };
  if (DRY_RUN) {
    console.log('[dry-run] Índice ausente; usando fallback em memória');
    return fallback;
  }
  await writeJson(INDEX_PATH, fallback);
  return fallback;
}

function ensureExcerpt(metadata, body) {
  if (metadata.excerpt) return metadata.excerpt;
  const clean = body.replace(/[#*_`>-]/g, '').replace(/\s+/g, ' ').trim();
  return clean.split(' ').slice(0, 40).join(' ');
}

async function savePost(markdown, metadata) {
  const date = metadata.date || new Date().toISOString().slice(0, 10);
  const year = date.slice(0, 4);
  const slug = slugify(metadata.title || 'artigo');
  const filename = `${date}-${slug}.md`;
  const dir = path.join(POSTS_DIR, year);
  const fullPath = path.join(dir, filename);
  const relativePath = path.posix.join(year, filename);

  if (DRY_RUN) {
    console.log(`[dry-run] Geraria post em ${relativePath}`);
    return { fullPath, relativePath };
  }

  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(fullPath, `${markdown.trim()}\n`, 'utf-8');
  console.log(`Post salvo em ${relativePath}`);
  return { fullPath, relativePath };
}

async function updateIndex(metadata, markdownPath, body = '') {
  const index = await ensureIndexFile();
  const entry = {
    title: metadata.title,
    url: `./post.html?post=${markdownPath}`,
    markdown: markdownPath,
    date: metadata.date,
    category: metadata.category,
    tags: metadata.tags,
    excerpt: ensureExcerpt(metadata, body),
    source_title: metadata.source_title,
    source_url: metadata.source_url,
    source_published_at: metadata.source_published_at,
  };

  index.posts = index.posts.filter((p) => p.markdown !== markdownPath);
  index.posts.push(entry);
  index.posts.sort((a, b) => new Date(b.date) - new Date(a.date));

  if (DRY_RUN) {
    console.log('[dry-run] Índice atualizado na memória');
    return entry;
  }

  await writeJson(INDEX_PATH, index);
  console.log('index.json atualizado');
  return entry;
}

async function updateState(posted, sourceUrl, markdownPath) {
  const updated = {
    entries: [
      ...posted.entries,
      {
        source_url: sourceUrl,
        stored_as: markdownPath,
        created_at: new Date().toISOString(),
      },
    ],
  };

  if (DRY_RUN) {
    console.log('[dry-run] Estado não persistido');
    return updated;
  }

  await writeJson(STATE_PATH, updated);
  return updated;
}

async function run() {
  console.log('Iniciando content engine...');
  console.log(`LLM provider: ${LLM_PROVIDER}`);
  const config = await loadConfig();
  const posted = await loadPosted();
  const candidates = await fetchCandidates(config, posted);

  if (!candidates.length) {
    console.log('Nenhum item recente encontrado nos feeds.');
    return;
  }

  const best = candidates.find((c) => c.score >= MIN_SCORE);
  if (!best) {
    console.log('Nenhum item atingiu o threshold de relevância.');
    return;
  }

  console.log(`Selecionado: ${best.title} (score ${best.score})`);

  const prompt = buildPrompt(best);
  const generated = await callLLM(prompt);
  const { metadata, markdown, body } = validateGenerated(generated);

  const { relativePath } = await savePost(markdown, metadata);
  await updateIndex(metadata, relativePath, body);
  await updateState(posted, metadata.source_url, relativePath);

  console.log('Artigo gerado com sucesso.');
}

run().catch((error) => {
  console.error('Falha ao rodar content engine:', error.message);
  process.exitCode = 1;
});
