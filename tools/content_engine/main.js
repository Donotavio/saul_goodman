#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPostUrl, writePostPage, writeRssFeed } from './post-page.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '../..');
const BLOG_ROOT = path.join(ROOT, 'site', 'blog');
const POSTS_DIR = path.join(BLOG_ROOT, 'posts');
const INDEX_PATH = path.join(BLOG_ROOT, 'index.json');
const SOURCES_PATH = path.join(__dirname, 'sources.json');
const STATE_PATH = path.join(__dirname, 'state', 'posted.json');

const CATEGORY_OPTIONS = [
  'procrastinacao',
  'foco-atencao',
  'dev-performance',
  'trabalho-remoto',
  'marketing',
  'produto',
  'ux-design',
  'carreira',
  'negocios',
];
const CATEGORY_KEYWORD_HINTS = {
  'procrastinacao': 'procrastinacao',
  'procrastinação': 'procrastinacao',
  'procrastinar': 'procrastinacao',
  'multitarefa': 'procrastinacao',
  'multitasking': 'procrastinacao',
  'distração': 'procrastinacao',
  'distraction': 'procrastinacao',
  'dopamina': 'procrastinacao',
  'foco': 'foco-atencao',
  'focada': 'foco-atencao',
  'atenção': 'foco-atencao',
  'atencao': 'foco-atencao',
  'concentracao': 'foco-atencao',
  'concentração': 'foco-atencao',
  'mindfulness': 'foco-atencao',
  'produtividade': 'dev-performance',
  'produtivo': 'dev-performance',
  'desenvolvimento': 'dev-performance',
  'dev': 'dev-performance',
  'engenharia': 'dev-performance',
  'engenharia de software': 'dev-performance',
  'tecnologia': 'dev-performance',
  'ux': 'ux-design',
  'programação': 'dev-performance',
  'programacao': 'dev-performance',
  'sprint': 'dev-performance',
  'trabalho remoto': 'trabalho-remoto',
  'remote work': 'trabalho-remoto',
  'home office': 'trabalho-remoto',
  'async': 'trabalho-remoto',
  'distributed': 'trabalho-remoto',
  'marketing': 'marketing',
  'marketing digital': 'marketing',
  'marketing de conteúdo': 'marketing',
  'marketing de conteudo': 'marketing',
  'seo': 'marketing',
  'content marketing': 'marketing',
  'gestão de marketing': 'marketing',
  'gestao de marketing': 'marketing',
  'produto': 'produto',
  'gestão de produto': 'produto',
  'gestao de produto': 'produto',
  'product management': 'produto',
  'product manager': 'produto',
  'roadmap': 'produto',
  'ux design': 'ux-design',
  'design ux': 'ux-design',
  'design': 'ux-design',
  'designer': 'ux-design',
  'ui': 'ux-design',
  'interface': 'ux-design',
  'carreira': 'carreira',
  'carreira tech': 'carreira',
  'liderança': 'carreira',
  'lideranca': 'carreira',
  'mentoria': 'carreira',
  'mentor': 'carreira',
  'coach': 'carreira',
  'coaching': 'carreira',
  'gestão de pessoas': 'carreira',
  'gestao de pessoas': 'carreira',
  'negócios': 'negocios',
  'negocios': 'negocios',
  'negócio': 'negocios',
  'negocio': 'negocios',
  'empreendedorismo': 'negocios',
  'empreendedor': 'negocios',
  'empreendedores': 'negocios',
  'startup': 'negocios',
  'inovação': 'negocios',
  'inovacao': 'negocios',
  'business': 'negocios',
  'saúde mental': 'foco-atencao',
  'saude mental': 'foco-atencao',
  'bem-estar': 'foco-atencao',
  'bem estar': 'foco-atencao',
};
const FALLBACK_CATEGORY_RULES = [
  { category: 'procrastinacao', regex: /(procrastin|multitask|distraction|dopamine)/i },
  { category: 'foco-atencao', regex: /(focus|aten[cç][aã]o|concentr|mindfulness)/i },
  { category: 'trabalho-remoto', regex: /(remote work|home office|async|distributed|trabalho remoto)/i },
  { category: 'marketing', regex: /(marketing|content|seo)/i },
  { category: 'produto', regex: /(produto|gest[aã]o de produto|roadmap)/i },
  { category: 'ux-design', regex: /(ux|design|interface|ui)/i },
  { category: 'carreira', regex: /(carreira|lideran[cç]a|coach)/i },
  { category: 'negocios', regex: /(neg[oó]cios|empreendedor)/i },
  { category: 'dev-performance', regex: /(dev|developer|code|engineering|sprint|deploy|pull request|commit)/i },
];
const FEED_CATEGORY_HINTS = [
  { pattern: /remotive/i, category: 'trabalho-remoto' },
  { pattern: /remote jobs/i, category: 'trabalho-remoto' },
  { pattern: /productivity|lifehack|asian efficiency|freedom/i, category: 'foco-atencao' },
  { pattern: /dev\.to|hacker news|time doctor|ali abdaal|springworks|virtual work/i, category: 'dev-performance' },
  { pattern: /uxdesign|ux collective|nngroup|nielsen norman/i, category: 'ux-design' },
  { pattern: /mind\s?the\s?product|mindtheproduct|\bproduct\b/i, category: 'produto' },
  { pattern: /hubspot|rock content|rd station|marketing/i, category: 'marketing' },
  { pattern: /career|leadership|lideran[cç]a|coaching/i, category: 'carreira' },
  { pattern: /harvard business|hbr|fast company|fastcompany|neg[oó]cios|empreendedor/i, category: 'negocios' },
];
const TONE_OPTIONS = ['incredulo', 'like', 'nao-corte'];
const TONE_TAG_HINTS = {
  'incredulo': ['sarcasmo', 'humor', 'vilao', 'vilão', 'procrastinacao', 'procrastinação'],
  'like': ['produtividade', 'foco', 'performance', 'qualidade', 'devops', 'inspiração', 'dica'],
  'nao-corte': ['trabalho-remoto', 'remote', 'remoto', 'alerta', 'culpa', 'pressao', 'pressão'],
};
const TONE_TEXT_HINTS = {
  'nao-corte': ['trabalho remoto', 'home office', 'remoto', 'culpa', 'julgamento', 'pressão'],
  'like': ['produtivo', 'foco', 'ganho', 'melhorar', 'dica', 'workflow'],
  'incredulo': ['procrastina', 'caos', 'bagunça', 'sarcasmo'],
};
const MIN_SCORE = 1;
const DEFAULT_WINDOW_DAYS = 14;
const RETRIES = 2;
const TIMEOUT_MS = 30000;
const DRY_RUN = process.argv.includes('--dry-run') || process.env.DRY_RUN === 'true';
const LLM_PROVIDER = process.env.LLM_PROVIDER || 'openai';
const TRANSLATION_TARGETS = [
  { code: 'en', label: 'inglês', display: 'English' },
  { code: 'es', label: 'espanhol', display: 'Español' },
  { code: 'fr', label: 'francês', display: 'Français' },
  { code: 'de', label: 'alemão', display: 'Deutsch' },
  { code: 'it', label: 'italiano', display: 'Italiano' },
  { code: 'tr', label: 'turco', display: 'Türkçe' },
  { code: 'zh', label: 'chinês (simplificado)', display: '中文' },
  { code: 'hi', label: 'hindi', display: 'हिन्दी' },
  { code: 'ar', label: 'árabe', display: 'العربية' },
  { code: 'bn', label: 'bengali', display: 'বাংলা' },
  { code: 'ru', label: 'russo', display: 'Русский' },
  { code: 'ur', label: 'urdu', display: 'اردو' },
];
const TRANSLATION_CODES = TRANSLATION_TARGETS.map((target) => target.code);

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

function createCategoryScoreboard() {
  const board = {};
  CATEGORY_OPTIONS.forEach((category) => {
    board[category] = 0;
  });
  return board;
}

function scoreItem(item, keywords) {
  const haystack = `${item.title || ''} ${item.summary || ''}`.toLowerCase();
  const categoryScores = createCategoryScoreboard();
  const total = keywords.reduce((score, keyword) => {
    const normalized = keyword.toLowerCase();
    if (haystack.includes(normalized)) {
      const hint = CATEGORY_KEYWORD_HINTS[normalized];
      if (hint && categoryScores[hint] !== undefined) {
        categoryScores[hint] += 1;
      }
      return score + 1;
    }
    return score;
  }, 0);
  return { total, categoryScores };
}

function inferCategory(item, categoryScores, feedName) {
  const entries = Object.entries(categoryScores || {}).sort((a, b) => b[1] - a[1]);
  if (entries.length && entries[0][1] > 0) {
    return { category: entries[0][0], reason: 'keyword' };
  }
  const normalizedFeed = (feedName || '').toLowerCase();
  for (const hint of FEED_CATEGORY_HINTS) {
    if (hint.pattern.test(normalizedFeed)) {
      return { category: hint.category, reason: 'feed' };
    }
  }
  const text = `${item.title || ''} ${item.summary || ''}`.toLowerCase();
  for (const rule of FALLBACK_CATEGORY_RULES) {
    if (rule.regex.test(text)) {
      return { category: rule.category, reason: 'fallback' };
    }
  }
  return { category: 'dev-performance', reason: 'default' };
}

function normalizeTone(value) {
  if (!value || typeof value !== 'string') return '';
  const normalized = value.toLowerCase().trim();
  return TONE_OPTIONS.includes(normalized) ? normalized : '';
}

function detectTone(metadata, candidateCategory = '') {
  const explicit = normalizeTone(metadata.tone || metadata.mood);
  if (explicit) return explicit;
  const tags = Array.isArray(metadata.tags)
    ? metadata.tags.map((tag) => tag.toLowerCase())
    : [];
  for (const tone of TONE_OPTIONS) {
    const hints = TONE_TAG_HINTS[tone] || [];
    if (tags.some((tag) => hints.includes(tag))) {
      return tone;
    }
  }
  const haystack = `${metadata.title || ''} ${metadata.excerpt || ''}`.toLowerCase();
  for (const tone of TONE_OPTIONS) {
    const hints = TONE_TEXT_HINTS[tone] || [];
    if (hints.some((hint) => haystack.includes(hint))) {
      return tone;
    }
  }
  if (candidateCategory === 'trabalho-remoto') return 'nao-corte';
  if (candidateCategory === 'foco-atencao') return 'like';
  if (candidateCategory === 'dev-performance') return 'like';
  return 'incredulo';
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
  const state = await readJson(STATE_PATH, { entries: [], last_category_index: -1 });
  if (!Array.isArray(state.entries)) state.entries = [];
  if (typeof state.last_category_index !== 'number') state.last_category_index = -1;
  return state;
}

function alreadyPosted(url, posted) {
  return posted.entries.some((entry) => entry.source_url === url);
}

async function fetchCandidates(config, posted) {
  const windowDays = Number(config.window_days) || DEFAULT_WINDOW_DAYS;
  const candidates = [];

  for (const feed of config.feeds) {
    try {
      const response = await fetch(feed.url, {
        headers: {
          Accept: 'application/rss+xml,application/atom+xml,text/xml',
          'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0 Safari/537.36',
        },
      });
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

        const { total: score, categoryScores } = scoreItem(item, config.keywords);
        const { category: categoryHint, reason: categoryReason } = inferCategory(item, categoryScores, feed.name);
        let finalScore = score;
        if (finalScore < MIN_SCORE) {
          if (categoryReason === 'feed' || categoryReason === 'fallback') {
            finalScore = MIN_SCORE;
          }
        }
        candidates.push({
          feed: feed.name,
          link: item.link,
          title: item.title || 'Sem título',
          summary: item.summary || '',
          published,
          score: finalScore,
          categoryHint,
        });
      }
    } catch (error) {
      console.warn(`Falha ao ler feed ${feed.url}: ${error.message}`);
    }
  }

  return candidates.sort((a, b) => b.score - a.score);
}

function selectCandidate(candidates, lastCategoryIndex = -1) {
  if (!candidates.length) return null;
  const grouped = new Map();
  candidates.forEach((candidate) => {
    const category = candidate.categoryHint || 'dev-performance';
    if (!grouped.has(category)) grouped.set(category, []);
    grouped.get(category).push(candidate);
  });

  const totalCategories = CATEGORY_OPTIONS.length;
  let currentIndex = typeof lastCategoryIndex === 'number' ? lastCategoryIndex : -1;
  for (let i = 0; i < totalCategories; i += 1) {
    currentIndex = (currentIndex + 1) % totalCategories;
    const category = CATEGORY_OPTIONS[currentIndex];
    const bucket = grouped.get(category);
    if (bucket && bucket.length && bucket[0].score >= MIN_SCORE) {
      return { candidate: bucket[0], rotationIndex: currentIndex };
    }
  }

  const fallback = candidates.find((entry) => entry.score >= MIN_SCORE);
  if (!fallback) return null;
  const fallbackIndex = CATEGORY_OPTIONS.indexOf(fallback.categoryHint);
  return {
    candidate: fallback,
    rotationIndex: fallbackIndex >= 0 ? fallbackIndex : lastCategoryIndex,
  };
}

function buildPrompt(candidate) {
  const category = candidate.categoryHint || 'dev-performance';
  return `Você é o Saul Goodman escrevendo sobre produtividade, marketing, UX/design, carreiras, negócios, procrastinação, foco e performance dev.
Fonte selecionada: ${candidate.title} (${candidate.link}) publicada em ${candidate.published}.
Resumo do item: ${candidate.summary?.slice(0, 400) || 'sem resumo'}.
Resuma e reescreva em PT-BR com sarcasmo elegante, sem coach e sem propaganda.
Categoria obrigatória no frontmatter: ${category}.
Estrutura obrigatória em Markdown com frontmatter YAML:
---
title: <título provocativo>
date: ${new Date().toISOString().slice(0, 10)}
category: ${category}
tone: escolha entre incredulo | like | nao-corte para refletir o tom visual
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

Não repita metadados no corpo; use apenas o frontmatter para detalhes técnicos.

Mantenha voz de Saul Goodman: ácido, esperto, mas não agressivo.`;
}

async function callLLM(prompt, options = {}) {
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) throw new Error('LLM_API_KEY ausente');

  const model = process.env.LLM_MODEL || 'gpt-4o-mini';
  const base =
    process.env.LLM_BASE_URL ||
    (LLM_PROVIDER === 'openai' ? 'https://api.openai.com/v1' : 'https://api.openai.com/v1');
  const baseUrl = base.endsWith('/') ? base : `${base}/`;
  const endpoint = 'chat/completions';
  const url = `${baseUrl}${endpoint}`;

  const payload = {
    model,
    messages: [
      {
        role: 'system',
        content:
          options.systemPrompt ||
          'Você é Saul Goodman escrevendo artigos de blog sarcásticos em PT-BR.',
      },
      { role: 'user', content: prompt },
    ],
    temperature: typeof options.temperature === 'number' ? options.temperature : 0.7,
    max_tokens: options.maxTokens || 1200,
  };

  // Em modelos OpenAI compatíveis, isso força JSON válido no conteúdo.
  if (options.responseFormat === 'json') {
    payload.response_format = { type: 'json_object' };
  }

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
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) {
        lastError = new Error(`LLM falhou: ${response.status} ${await response.text()}`);
        continue;
      }

      const responsePayload = await response.json();
      const content = responsePayload.choices?.[0]?.message?.content;
      if (content) return content.trim();
      lastError = new Error('Resposta do LLM vazia');
    } catch (error) {
      lastError = error.name === 'AbortError' ? new Error('LLM timeout') : error;
    }
  }

  throw lastError || new Error('Falha desconhecida ao chamar LLM');
}

function parseJsonBlock(text) {
  const cleaned = text.trim().replace(/```json/gi, '```').replace(/```/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch (error) {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Resposta JSON inválida');
    return JSON.parse(match[0]);
  }
}

async function translateArticle(metadata, body, target) {
  const prompt = `Traduza o artigo abaixo para ${target.label} (${target.display}).
Preserve o markdown, mantenha o tom irônico de Saul sem soar agressivo e adapte referências culturais.

Retorne APENAS um JSON válido (sem crases, sem markdown) com as chaves:
- "title" (string)
- "excerpt" (string)
- "tags" (array de strings; traduza quando fizer sentido)
- "body" (string; markdown completo com as mesmas seções)

TÍTULO: ${metadata.title}
EXCERPT: ${metadata.excerpt}
TAGS: ${JSON.stringify(metadata.tags || [])}
ARTIGO:
${body}`;

  const call = async (extraInstruction) => {
    const response = await callLLM(extraInstruction ? `${prompt}\n\n${extraInstruction}` : prompt, {
      systemPrompt:
        'Você é um tradutor profissional. Responda com JSON válido e nada além disso.',
      maxTokens: 3200,
      temperature: 0.2,
      responseFormat: 'json',
    });
    return parseJsonBlock(response);
  };

  let json;
  try {
    json = await call();
  } catch (error) {
    json = await call(
      'IMPORTANTE: Sua última resposta veio com JSON inválido. Responda novamente com JSON estritamente válido.'
    );
  }

  const title = (json.title || json.headline || json.name || json.titulo || '').trim();
  const excerpt = (json.excerpt || json.summary || json.description || '').trim();
  const articleBody = (json.body || json.content || json.article || json.text || json.story || '').trim();
  const tags = Array.isArray(json.tags)
    ? json.tags.map((tag) => (typeof tag === 'string' ? tag.trim() : String(tag))).filter(Boolean)
    : [];
  if (!title || !articleBody) throw new Error('Tradução sem body ou title');
  return {
    lang: target.code,
    title,
    excerpt,
    tags,
    body: articleBody,
  };
}

async function generateTranslations(metadata, body) {
  if (DRY_RUN) return [];
  const results = [];
  for (const target of TRANSLATION_TARGETS) {
    try {
      console.log(`Traduzindo artigo para ${target.display}...`);
      const translated = await translateArticle(metadata, body, target);
      results.push(translated);
    } catch (error) {
      console.warn(`Falha na tradução (${target.code}): ${error.message}`);
    }
  }
  return results;
}

function buildFrontmatter(metadata) {
  const preferredOrder = [
    'title',
    ...TRANSLATION_CODES.map((code) => `title_${code}`),
    'date',
    'category',
    'tone',
    'tags',
    ...TRANSLATION_CODES.map((code) => `tags_${code}`),
    'source_title',
    'source_url',
    'source_published_at',
    'excerpt',
    ...TRANSLATION_CODES.map((code) => `excerpt_${code}`),
  ];
  const seen = new Set();
  const lines = [];

  const pushLine = (key, value) => {
    if (value === undefined || value === null || value === '') return;
    if (Array.isArray(value)) {
      const arr = value.map((item) => JSON.stringify(item)).join(', ');
      lines.push(`${key}: [${arr}]`);
    } else if (typeof value === 'string') {
      if (key === 'date') {
        lines.push(`${key}: ${value}`);
      } else {
        lines.push(`${key}: ${JSON.stringify(value)}`);
      }
    } else {
      lines.push(`${key}: ${value}`);
    }
    seen.add(key);
  };

  preferredOrder.forEach((key) => pushLine(key, metadata[key]));
  Object.keys(metadata)
    .filter((key) => !seen.has(key))
    .sort()
    .forEach((key) => pushLine(key, metadata[key]));

  return lines.join('\n');
}

function buildMarkdown(metadata, body, translations) {
  const frontmatter = buildFrontmatter(metadata);
  let content = `---\n${frontmatter}\n---\n\n${body.trim()}\n`;
  translations
    .filter((entry) => entry.body)
    .forEach((entry) => {
      content += `\n<!--lang:${entry.lang}-->\n${entry.body.trim()}\n`;
    });
  return `${content.trim()}\n`;
}

function extractFrontmatter(markdown) {
  const normalized = markdown.replace(/^[\uFEFF]+/, '').replace(/\r\n?/g, '\n');
  const startIdx = normalized.indexOf('---\n');
  if (startIdx === -1) throw new Error('Conteúdo sem frontmatter');
  const slice = normalized.slice(startIdx + 4);
  const endIdx = slice.indexOf('\n---');
  if (endIdx === -1) throw new Error('Conteúdo sem frontmatter');
  const frontmatter = slice.slice(0, endIdx);
  const body = slice.slice(endIdx + 4).trim();
  const data = {};

  for (const line of frontmatter.split(/\n/)) {
    const [rawKey, ...rawValue] = line.split(':');
    if (!rawKey || rawValue.length === 0) continue;
    const key = rawKey.trim();
    const value = rawValue.join(':').trim();
    if (value.startsWith('[') && value.endsWith(']')) {
      data[key] = value
        .slice(1, -1)
        .split(',')
        .map((v) => v.trim().replace(/^"|"$/g, '').replace(/^'|'$/g, ''))
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

  return { metadata: data, body };
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

function getSortTime(value) {
  if (!value) return 0;
  const trimmed = String(value).trim();
  if (!trimmed) return 0;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const date = new Date(`${trimmed}T00:00:00Z`);
    return Number.isNaN(date.getTime()) ? 0 : date.getTime();
  }
  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function getPostSortTime(post) {
  return getSortTime(post.source_published_at || post.date);
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
  const excerpt = ensureExcerpt(metadata, body);
  const entry = {
    title: metadata.title,
    url: buildPostUrl(markdownPath),
    markdown: markdownPath,
    date: metadata.date,
    category: metadata.category,
    tags: metadata.tags,
    excerpt,
    source_title: metadata.source_title,
    source_url: metadata.source_url,
    source_published_at: metadata.source_published_at,
  };
  for (const code of TRANSLATION_CODES) {
    const titleKey = `title_${code}`;
    const excerptKey = `excerpt_${code}`;
    const tagsKey = `tags_${code}`;
    if (metadata[titleKey]) entry[titleKey] = metadata[titleKey];
    if (metadata[excerptKey]) entry[excerptKey] = metadata[excerptKey];
    if (metadata[tagsKey]) entry[tagsKey] = metadata[tagsKey];
  }
  if (metadata.tone) entry.tone = metadata.tone;

  index.posts = index.posts.filter((p) => p.markdown !== markdownPath);
  index.posts.push(entry);
  index.posts.sort((a, b) => getPostSortTime(b) - getPostSortTime(a));

  if (DRY_RUN) {
    console.log('[dry-run] Índice atualizado na memória');
    return entry;
  }

  await writePostPage({ relativePath: markdownPath, metadata, excerpt, dryRun: DRY_RUN });
  await writeRssFeed(index.posts, DRY_RUN);

  await writeJson(INDEX_PATH, index);
  console.log('index.json atualizado');
  return entry;
}

async function updateState(posted, sourceUrl, markdownPath, categoryIndex) {
  const nextIndex =
    typeof categoryIndex === 'number'
      ? categoryIndex
      : typeof posted.last_category_index === 'number'
        ? posted.last_category_index
        : -1;
  const updated = {
    ...posted,
    entries: [
      ...(posted.entries || []),
      {
        source_url: sourceUrl,
        stored_as: markdownPath,
        created_at: new Date().toISOString(),
      },
    ],
    last_category_index: nextIndex,
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

  const selection = selectCandidate(candidates, posted.last_category_index);
  if (!selection) {
    console.log('Nenhum item atingiu o threshold de relevância.');
    return;
  }

  const { candidate: best, rotationIndex } = selection;
  console.log(
    `Selecionado: ${best.title} (score ${best.score}) [categoria: ${best.categoryHint}]` +
      (typeof rotationIndex === 'number' ? ` (rotação idx ${rotationIndex})` : ''),
  );

  const prompt = buildPrompt(best);
  const generated = await callLLM(prompt);
  const { metadata, body } = validateGenerated(generated);
  if (best.categoryHint && metadata.category !== best.categoryHint) {
    metadata.category = best.categoryHint;
  }
  metadata.tone = detectTone(metadata, metadata.category || best.categoryHint);
  const translations = await generateTranslations(metadata, body);
  translations.forEach((entry) => {
    if (entry.title) metadata[`title_${entry.lang}`] = entry.title;
    if (entry.excerpt) metadata[`excerpt_${entry.lang}`] = entry.excerpt;
    if (Array.isArray(entry.tags) && entry.tags.length) {
      metadata[`tags_${entry.lang}`] = entry.tags;
    }
  });
  const finalMarkdown = buildMarkdown(metadata, body, translations);

  const { relativePath } = await savePost(finalMarkdown, metadata);
  await updateIndex(metadata, relativePath, body);
  await updateState(posted, metadata.source_url, relativePath, rotationIndex);

  console.log('Artigo gerado com sucesso.');
}

run().catch((error) => {
  console.error('Falha ao rodar content engine:', error.message);
  process.exitCode = 1;
});
