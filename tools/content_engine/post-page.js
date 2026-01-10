import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '../..');
const BLOG_DIR = path.join(ROOT, 'site', 'blog');
const SITE_BASE_URL = 'https://donotavio.github.io/saul_goodman';
const BLOG_BASE_URL = `${SITE_BASE_URL}/blog`;
const RSS_URL = `${BLOG_BASE_URL}/rss.xml`;
const BLOG_TITLE = 'Blog do Saul Goodman';
const BLOG_DESCRIPTION =
  'Relatos sarcásticos sobre foco, atenção e performance dev. Artigos semanais escritos no tom Saul Goodman, direto ao ponto.';
const GA_MEASUREMENT_ID = 'G-JM4SE32S0M';
const GTM_CONTAINER_ID = 'GTM-PXR32RVF';
const CATEGORY_TONE = {
  'procrastinacao': 'incredulo',
  'foco-atencao': 'like',
  'dev-performance': 'like',
  'trabalho-remoto': 'nao-corte',
  'ux-design': 'like',
};
const TONE_IMAGE = {
  'incredulo': 'saul_incredulo.png',
  'like': 'saul_like.png',
  'nao-corte': 'saul_nao_corte.png',
  'default': 'logotipo_saul_goodman.png',
};
const TONE_TAG_HINTS = {
  'nao-corte': ['trabalho-remoto', 'remote', 'remoto', 'burnout', 'alerta', 'culpa', 'pressao', 'pressão'],
  'like': [
    'produtividade',
    'foco',
    'performance',
    'qualidade',
    'devops',
    'inspiração',
    'dica',
    'sucesso',
    'ux',
    'design',
    'ui',
  ],
  'incredulo': ['sarcasmo', 'humor', 'vilao', 'vilão', 'procrastinacao', 'procrastinação', 'caos'],
};
const TONE_TEXT_HINTS = {
  'nao-corte': ['trabalho remoto', 'home office', 'remoto', 'culpa', 'julgamento', 'pressão'],
  'like': ['foco', 'produtivo', 'ganhar', 'melhorar', 'dica', 'workflow', 'ux', 'design', 'ui'],
  'incredulo': ['procrastina', 'caos', 'bagunça', 'sarcasmo'],
};

export function buildPostUrl(relativePath) {
  return `./posts/${relativePath.replace(/\.md$/, '/')}`;
}

function buildPostCanonicalUrl(relativePath) {
  const normalized = relativePath.replace(/\.md$/, '');
  return `${BLOG_BASE_URL}/posts/${normalized}/`;
}

function escapeAttribute(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/'/g, '&#39;');
}

function escapeText(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function toIsoDate(value) {
  if (!value) return '';
  const trimmed = String(value).trim();
  if (!trimmed) return '';
  const dateOnlyMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const date = dateOnlyMatch ? new Date(`${trimmed}T00:00:00Z`) : new Date(trimmed);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function normalizeTone(value) {
  if (!value || typeof value !== 'string') return '';
  return value.toLowerCase().trim();
}

function resolveTone(metadata = {}) {
  const explicit = normalizeTone(metadata.tone || metadata.mood);
  if (explicit && TONE_IMAGE[explicit]) {
    return explicit;
  }

  const tags = Array.isArray(metadata.tags) ? metadata.tags.map((tag) => normalizeTone(tag)) : [];
  if (tags.length) {
    const foldedTags = tags.map((tag) =>
      tag.normalize ? tag.normalize('NFD').replace(/[\u0300-\u036f]/g, '') : tag
    );
    for (const tone of Object.keys(TONE_TAG_HINTS)) {
      const hints = TONE_TAG_HINTS[tone];
      if (hints.some((hint) => foldedTags.includes(hint))) {
        return tone;
      }
    }
  }

  const haystack = `${metadata.title || ''} ${metadata.excerpt || ''}`.toLowerCase();
  for (const tone of Object.keys(TONE_TEXT_HINTS)) {
    const hints = TONE_TEXT_HINTS[tone];
    if (hints.some((hint) => haystack.includes(hint))) {
      return tone;
    }
  }

  if (CATEGORY_TONE[metadata.category]) return CATEGORY_TONE[metadata.category];

  return 'incredulo';
}

function resolveImageUrl(tone) {
  const filename = TONE_IMAGE[tone] || TONE_IMAGE.default;
  return `${SITE_BASE_URL}/assets/${filename}`;
}

function toRssDate(value) {
  if (!value) return '';
  const iso = toIsoDate(value);
  if (!iso) return '';
  return new Date(iso).toUTCString();
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function wrapCdata(value) {
  const sanitized = String(value || '').replace(/]]>/g, ']]]]><![CDATA[>');
  return `<![CDATA[${sanitized}]]>`;
}

function indentJson(json, indent = 6) {
  const padding = ' '.repeat(indent);
  return json
    .split('\n')
    .map((line) => `${padding}${line}`)
    .join('\n');
}

function buildPostPageHtml({
  relativePath,
  title,
  description,
  imageUrl,
  publishedTime,
  canonicalUrl,
  tone,
}) {
  const pageTitle = `${title} - ${BLOG_TITLE}`;
  const escapedTitle = escapeText(pageTitle);
  const escapedTitleAttribute = escapeAttribute(pageTitle);
  const escapedDescription = escapeAttribute(description);
  const escapedCanonical = escapeAttribute(canonicalUrl);
  const escapedImage = escapeAttribute(imageUrl);
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: title,
    description: description || undefined,
    image: imageUrl ? [imageUrl] : undefined,
    datePublished: publishedTime || undefined,
    author: {
      '@type': 'Organization',
      name: 'Saul Goodman',
    },
    publisher: {
      '@type': 'Organization',
      name: 'Saul Goodman',
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': canonicalUrl,
    },
  };
  const jsonLdContent = indentJson(JSON.stringify(jsonLd, null, 2));
  const heroImage = `../../../../assets/${TONE_IMAGE[tone] || TONE_IMAGE.default}`;

  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapedTitle}</title>
    <!-- Google Tag Manager -->
    <script>
      (function (w, d, s, l, i) {
        w[l] = w[l] || [];
        w[l].push({
          'gtm.start': new Date().getTime(),
          event: 'gtm.js',
        });
        const f = d.getElementsByTagName(s)[0];
        const j = d.createElement(s);
        const dl = l != 'dataLayer' ? '&l=' + l : '';
        j.async = true;
        j.src = 'https://www.googletagmanager.com/gtm.js?id=' + i + dl;
        f.parentNode.insertBefore(j, f);
      })(window, document, 'script', 'dataLayer', '${GTM_CONTAINER_ID}');
    </script>
    <!-- End Google Tag Manager -->
    <meta name="description" content="${escapedDescription}" />
    <meta name="robots" content="index,follow" />
    <link rel="canonical" href="${escapedCanonical}" />
    <link rel="alternate" type="application/rss+xml" title="${BLOG_TITLE}" href="${RSS_URL}" />
    <meta property="og:type" content="article" />
    <meta property="og:title" content="${escapedTitleAttribute}" />
    <meta property="og:description" content="${escapedDescription}" />
    <meta property="og:url" content="${escapedCanonical}" />
    <meta property="og:image" content="${escapedImage}" />
    <meta property="og:site_name" content="Saul Goodman" />
    <meta property="article:published_time" content="${escapeAttribute(publishedTime)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapedTitleAttribute}" />
    <meta name="twitter:description" content="${escapedDescription}" />
    <meta name="twitter:image" content="${escapedImage}" />
    <script async src="https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}"></script>
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag() {
        dataLayer.push(arguments);
      }
      gtag('js', new Date());
      gtag('config', '${GA_MEASUREMENT_ID}');
    </script>
    <link rel="icon" type="image/png" href="../../../../assets/logotipo_saul_goodman.png" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Archivo+Black&display=swap"
      rel="stylesheet"
    />
    <script>
      (function () {
        const p = location.pathname;
        if (!p.endsWith('/') && !p.split('/').pop().includes('.')) {
          location.replace(p + '/' + location.search + location.hash);
        }
      })();
    </script>
    <link rel="stylesheet" href="../../../../style.css" />
    <link rel="stylesheet" href="../../../blog.css" />
    <script type="application/ld+json" id="post-jsonld">
${jsonLdContent}
    </script>
  </head>
  <body data-blog-view="post" data-blog-post="${escapeAttribute(relativePath)}">
    <!-- Google Tag Manager (noscript) -->
    <noscript>
      <iframe
        src="https://www.googletagmanager.com/ns.html?id=${GTM_CONTAINER_ID}"
        height="0"
        width="0"
        style="display: none; visibility: hidden;"
      ></iframe>
    </noscript>
    <!-- End Google Tag Manager (noscript) -->
    <nav class="site-nav">
      <a class="brand" href="../../../../index.html#home">Saul Goodman</a>
      <div class="nav-actions">
        <div class="nav-links">
          <a href="../../../index.html" data-i18n="navBlog">Blog</a>
          <a href="../../../procrastinacao/" data-category-label="procrastinacao">Procrastinação</a>
          <a href="../../../foco-atencao/" data-category-label="foco-atencao">Foco &amp; Atenção</a>
          <a href="../../../dev-performance/" data-category-label="dev-performance">Performance Dev</a>
          <a href="../../../trabalho-remoto/" data-category-label="trabalho-remoto">Trabalho Remoto</a>
          <a href="../../../ux-design/" data-category-label="ux-design">UX &amp; Design</a>
          <a href="../../../marketing/" data-category-label="marketing">Marketing</a>
          <a href="../../../produto/" data-category-label="produto">Produto</a>
          <a href="../../../carreira/" data-category-label="carreira">Carreira</a>
          <a href="../../../negocios/" data-category-label="negocios">Negócios</a>
        </div>
        <div class="language-switcher">
          <label class="sr-only" for="blog-language-select" data-i18n="languageLabel">Selecionar idioma</label>
          <select id="blog-language-select" aria-label="Selecionar idioma">
            <option value="pt">PT</option>
            <option value="en">EN</option>
            <option value="es">ES</option>
          </select>
        </div>
        <div class="sponsor-button">
          <iframe
            src="https://github.com/sponsors/Donotavio/button"
            title="Sponsor Donotavio"
            height="32"
            width="132"
            style="border: 0; border-radius: 6px;"
          ></iframe>
        </div>
        <a class="nav-cta" href="https://chromewebstore.google.com/detail/fllkkpfaajgppbnlfoebeendceckcffe/" target="_blank" rel="noreferrer">
          <span data-i18n="navCta">Instalar</span>
        </a>
      </div>
    </nav>

    <main class="post-page">
      <p class="breadcrumb"><a href="../../../index.html" data-i18n="breadcrumbBlog">Blog</a> › <span class="current" data-i18n="breadcrumbArticle">Artigo</span></p>
      <header class="post-header">
        <div class="post-media">
          <div class="post-media-copy">
            <p class="post-media-eyebrow" data-i18n="categoryEyebrow">Categoria</p>
            <h2 class="post-media-title" data-media-title>Procrastinação sob investigação</h2>
            <p class="post-media-tagline" data-media-tagline>Abas vilãs sob defesa de Saul.</p>
          </div>
          <div class="post-media-art">
            <img class="post-category-image" src="${heroImage}" alt="Ilustração Saul" />
            <div class="post-logo-wrap">
              <img class="post-logo" src="../../../../assets/logotipo_saul_goodman.png" alt="Logo Saul Goodman" />
            </div>
          </div>
        </div>
        <h1 data-i18n="postLoadingTitle">Carregando artigo...</h1>
        <div class="blog-meta">...</div>
      </header>
      <section class="post-layout">
        <article class="post-body" data-i18n="postLoadingBody">Carregando...</article>
        <aside class="post-sidebar">
          <div class="post-share">
            <p class="share-title" data-i18n="shareTitle">Compartilhar</p>
            <button class="share-btn" data-share="twitter" type="button" data-i18n="shareTwitter">X</button>
            <button class="share-btn" data-share="linkedin" type="button" data-i18n="shareLinkedin">LinkedIn</button>
            <button class="share-btn" data-share="copy" type="button" data-i18n="shareCopy">Copiar link</button>
            <span class="share-feedback" hidden data-i18n="shareCopied">Link copiado!</span>
          </div>
          <div class="extension-cta">
            <p class="extension-title" data-i18n="extensionsTitle">Instale as extensões do Saul</p>
            <p class="extension-copy" data-i18n="extensionsCopy">Leve o Saul para o Chrome e para o VS Code e mantenha o foco.</p>
            <div class="extension-actions">
              <a
                class="extension-btn chrome"
                href="https://chromewebstore.google.com/detail/fllkkpfaajgppbnlfoebeendceckcffe/"
                target="_blank"
                rel="noreferrer"
                data-i18n="extensionsChromeCta"
              >
                Extensão Chrome
              </a>
              <a
                class="extension-btn vscode"
                href="https://marketplace.visualstudio.com/items?itemName=Donotavio.saul-goodman-vscode"
                target="_blank"
                rel="noreferrer"
                data-i18n="extensionsVscodeCta"
              >
                Extensão VS Code
              </a>
            </div>
          </div>
          <div class="metadata-panel"></div>
        </aside>
      </section>
    </main>

    <script type="module" src="../../../blog.js"></script>
  </body>
</html>
`;
}

export async function writePostPage({ relativePath, metadata, excerpt, dryRun = false }) {
  if (!relativePath || !metadata?.title) return null;
  const normalized = relativePath.replace(/\.md$/, '');
  const canonicalUrl = buildPostCanonicalUrl(relativePath);
  const description = metadata.excerpt || excerpt || '';
  const publishedTime = toIsoDate(metadata.source_published_at || metadata.date);
  const tone = resolveTone(metadata);
  const imageUrl = resolveImageUrl(tone);
  const html = buildPostPageHtml({
    relativePath,
    title: metadata.title,
    description,
    imageUrl,
    publishedTime,
    canonicalUrl,
    tone,
  });
  const outputPath = path.join(BLOG_DIR, 'posts', normalized, 'index.html');

  if (dryRun) {
    return { outputPath, html };
  }

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${html.trim()}\n`, 'utf-8');
  return { outputPath, html };
}

export async function writeRssFeed(posts = [], dryRun = false) {
  const sorted = [...posts].sort((a, b) => {
    const left = toIsoDate(b.source_published_at || b.date);
    const right = toIsoDate(a.source_published_at || a.date);
    return new Date(left || 0) - new Date(right || 0);
  });
  const lastBuild = sorted.length
    ? toRssDate(sorted[0].source_published_at || sorted[0].date)
    : new Date().toUTCString();

  const items = sorted
    .map((post) => {
      const link = new URL(post.url, `${BLOG_BASE_URL}/`).toString();
      const pubDate = toRssDate(post.source_published_at || post.date);
      return [
        '    <item>',
        `      <title>${escapeXml(post.title)}</title>`,
        `      <link>${escapeXml(link)}</link>`,
        `      <guid isPermaLink="true">${escapeXml(link)}</guid>`,
        pubDate ? `      <pubDate>${escapeXml(pubDate)}</pubDate>` : '',
        `      <description>${wrapCdata(post.excerpt || '')}</description>`,
        '    </item>',
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n\n');

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    '  <channel>',
    `    <title>${escapeXml(BLOG_TITLE)}</title>`,
    `    <link>${escapeXml(`${BLOG_BASE_URL}/`)}</link>`,
    `    <description>${escapeXml(BLOG_DESCRIPTION)}</description>`,
    '    <language>pt-BR</language>',
    `    <lastBuildDate>${escapeXml(lastBuild)}</lastBuildDate>`,
    `    <atom:link href="${RSS_URL}" rel="self" type="application/rss+xml" />`,
    items,
    '  </channel>',
    '</rss>',
    '',
  ].join('\n');

  if (dryRun) {
    return { outputPath: path.join(BLOG_DIR, 'rss.xml'), xml };
  }

  await fs.writeFile(path.join(BLOG_DIR, 'rss.xml'), xml, 'utf-8');
  return { outputPath: path.join(BLOG_DIR, 'rss.xml'), xml };
}
