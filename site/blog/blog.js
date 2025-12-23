const scriptUrl = document.currentScript?.src || import.meta.url;
const blogBase = new URL('./', scriptUrl);
const indexUrl = new URL('index.json', blogBase);
const postsBase = new URL('posts/', blogBase);

const BLOG_TRANSLATIONS = {
  pt: {
    languageLabel: 'Selecionar idioma',
    navProcess: 'Processo',
    navDemo: 'Demonstração',
    navClients: 'Clientes',
    navBlog: 'Blog',
    navCta: 'Instalar',
    blogHeroEyebrow: 'Blog do Saul Goodman',
    blogHeroTitle: 'Opiniões jurídicas sobre procrastinação digital',
    blogHeroLead:
      'Relatos sarcásticos sobre foco, atenção e performance dev. Artigos semanais escritos no tom Saul, direto ao ponto, sem coach barato.',
    blogCategoryAll: 'Todos',
    categoryEyebrow: 'Categoria',
    categoryProcrastinacaoTitle: 'Procrastinação sob investigação',
    categoryProcrastinacaoLead:
      'Casos reais de atrasos, preguiça digital e tab hunting que o Saul adora processar.',
    categoryFocoTitle: 'Foco & Atenção em julgamento',
    categoryFocoLead:
      'Pesquisas e tretas do dia a dia sobre manter a cabeça no código sem sucumbir ao feed.',
    categoryDevTitle: 'Performance dev com réu confesso',
    categoryDevLead: 'Produtividade realista para quem vive entre VS Code, PRs e reuniões remotas.',
    categoryRemotoTitle: 'Trabalho remoto sem álibi',
    categoryRemotoLead: 'Histórias e achados sobre home office, Slack aberto e a arte de não sumir do Zoom.',
    breadcrumbBlog: 'Blog',
    breadcrumbArticle: 'Artigo',
    postLoadingTitle: 'Carregando artigo...',
    postLoadingBody: 'Carregando...',
    readArticle: 'Ler artigo',
    blogEmptyState: 'Nenhum artigo publicado por aqui ainda.',
    blogError: 'Erro ao carregar blog',
    postNotFound: 'Post não encontrado.',
    postInvalid: 'Post inválido ou sem metadados.',
    postLoadError: 'Erro ao carregar este artigo.',
    metaCategory: 'Categoria',
    metaTags: 'Tags',
    metaSource: 'Fonte',
    metaSourceUrl: 'URL da fonte',
    metaPublishedAt: 'Publicado em',
  },
  en: {
    languageLabel: 'Select language',
    navProcess: 'Process',
    navDemo: 'Demo',
    navClients: 'Clients',
    navBlog: 'Blog',
    navCta: 'Install',
    blogHeroEyebrow: 'Saul Goodman Blog',
    blogHeroTitle: 'Legal takes on digital procrastination',
    blogHeroLead:
      "Sarcastic takes on focus, attention, and dev performance. Weekly articles written in Saul's tone—no coach vibe.",
    blogCategoryAll: 'All',
    categoryEyebrow: 'Category',
    categoryProcrastinacaoTitle: 'Procrastination under investigation',
    categoryProcrastinacaoLead: 'Real cases of delay, digital laziness, and tab hunting Saul loves to prosecute.',
    categoryFocoTitle: 'Focus & Attention on trial',
    categoryFocoLead: 'Daily studies and drama about keeping your head in the code without surrendering to feeds.',
    categoryDevTitle: 'Dev performance with a guilty plea',
    categoryDevLead: 'Practical productivity for anyone juggling VS Code, PRs, and remote meetings.',
    categoryRemotoTitle: 'Remote work with no alibi',
    categoryRemotoLead: 'Stories about home office, Slack presence, and avoiding a Zoom disappearance.',
    breadcrumbBlog: 'Blog',
    breadcrumbArticle: 'Article',
    postLoadingTitle: 'Loading article...',
    postLoadingBody: 'Loading...',
    readArticle: 'Read article',
    blogEmptyState: 'No articles published here yet.',
    blogError: 'Failed to load blog',
    postNotFound: 'Post not found.',
    postInvalid: 'Invalid post or missing metadata.',
    postLoadError: 'Error while loading this article.',
    metaCategory: 'Category',
    metaTags: 'Tags',
    metaSource: 'Source',
    metaSourceUrl: 'Source URL',
    metaPublishedAt: 'Published at',
  },
  es: {
    languageLabel: 'Seleccionar idioma',
    navProcess: 'Proceso',
    navDemo: 'Demostración',
    navClients: 'Clientes',
    navBlog: 'Blog',
    navCta: 'Instalar',
    blogHeroEyebrow: 'Blog de Saul Goodman',
    blogHeroTitle: 'Opiniones legales sobre la procrastinación digital',
    blogHeroLead:
      'Relatos sarcásticos sobre foco, atención y performance dev. Artículos semanales en tono Saul, sin coach barato.',
    blogCategoryAll: 'Todos',
    categoryEyebrow: 'Categoría',
    categoryProcrastinacaoTitle: 'Procrastinación bajo investigación',
    categoryProcrastinacaoLead: 'Casos reales de retrasos, pereza digital y caza de pestañas que Saul disfruta procesar.',
    categoryFocoTitle: 'Enfoque y Atención en juicio',
    categoryFocoLead: 'Estudios y dramas diarios sobre mantener la cabeza en el código sin caer en el feed.',
    categoryDevTitle: 'Rendimiento dev con confesión',
    categoryDevLead: 'Productividad realista para quienes viven entre VS Code, PRs y reuniones remotas.',
    categoryRemotoTitle: 'Trabajo remoto sin coartada',
    categoryRemotoLead: 'Historias y hallazgos sobre home office, Slack abierto y el arte de no desaparecer de Zoom.',
    breadcrumbBlog: 'Blog',
    breadcrumbArticle: 'Artículo',
    postLoadingTitle: 'Cargando artículo...',
    postLoadingBody: 'Cargando...',
    readArticle: 'Leer artículo',
    blogEmptyState: 'Aún no hay artículos publicados aquí.',
    blogError: 'Error al cargar el blog',
    postNotFound: 'Artículo no encontrado.',
    postInvalid: 'Artículo inválido o sin metadatos.',
    postLoadError: 'Error al cargar este artículo.',
    metaCategory: 'Categoría',
    metaTags: 'Etiquetas',
    metaSource: 'Fuente',
    metaSourceUrl: 'URL de la fuente',
    metaPublishedAt: 'Publicado el',
  },
};

const CATEGORY_LABELS = {
  pt: {
    'procrastinacao': 'Procrastinação',
    'foco-atencao': 'Foco & Atenção',
    'dev-performance': 'Performance Dev',
    'trabalho-remoto': 'Trabalho Remoto',
  },
  en: {
    'procrastinacao': 'Procrastination',
    'foco-atencao': 'Focus & Attention',
    'dev-performance': 'Dev Performance',
    'trabalho-remoto': 'Remote Work',
  },
  es: {
    'procrastinacao': 'Procrastinación',
    'foco-atencao': 'Enfoque y Atención',
    'dev-performance': 'Rendimiento Dev',
    'trabalho-remoto': 'Trabajo Remoto',
  },
};

const CATEGORY_TITLE_KEYS = {
  'procrastinacao': 'categoryProcrastinacaoTitle',
  'foco-atencao': 'categoryFocoTitle',
  'dev-performance': 'categoryDevTitle',
  'trabalho-remoto': 'categoryRemotoTitle',
};

const DATE_LOCALE = {
  pt: 'pt-BR',
  en: 'en-US',
  es: 'es-ES',
};

const CATEGORY_IMAGES = {
  'procrastinacao': '/assets/saul_incredulo.png',
  'foco-atencao': '/assets/saul_like.png',
  'dev-performance': '/assets/saul_nao_corte.png',
  'trabalho-remoto': '/assets/logotipo_saul_goodman.png',
};

const BLOG_LOGO = '/assets/logotipo_saul_goodman.png';

const supportedLanguages = Object.keys(BLOG_TRANSLATIONS);
const defaultLanguage = 'pt';
let currentLanguage = defaultLanguage;

function getDictionary(lang = currentLanguage) {
  return BLOG_TRANSLATIONS[lang] || BLOG_TRANSLATIONS[defaultLanguage];
}

function t(key, lang = currentLanguage) {
  const dictionary = getDictionary(lang);
  return dictionary[key] || BLOG_TRANSLATIONS[defaultLanguage][key] || key;
}

function getCategoryLabel(value, lang = currentLanguage) {
  if (!value) return '';
  const labels = CATEGORY_LABELS[lang] || CATEGORY_LABELS[defaultLanguage];
  return labels[value] || value;
}

function getLocalizedValue(source, key, lang = currentLanguage) {
  if (!source) return undefined;
  const localizedKey = `${key}_${lang}`;
  return source[localizedKey] || source[key];
}

function stripMetadataSection(markdown = '') {
  const markers = ['**Metadados**', '**Metadatos**', '**Metadata**'];
  let result = markdown;
  markers.forEach((marker) => {
    const idx = result.lastIndexOf(marker);
    if (idx !== -1) {
      result = result.slice(0, idx).trim();
    }
  });
  return result.trim();
}

function getCategoryArtwork(category) {
  const src = CATEGORY_IMAGES[category] || BLOG_LOGO;
  const alt = `${getCategoryLabel(category)} — Saul Goodman`;
  return { src, alt };
}

function extractLocalizedBodies(body) {
  const sections = {};
  const markerRegex = /<!--lang:(pt|en|es)-->/gi;
  let match;
  let lastIndex = 0;
  let currentLang = 'pt';
  while ((match = markerRegex.exec(body)) !== null) {
    const chunk = body.slice(lastIndex, match.index);
    if (chunk.trim()) {
      sections[currentLang] = (sections[currentLang] || '') + chunk.trim();
    }
    currentLang = match[1].toLowerCase();
    lastIndex = markerRegex.lastIndex;
  }
  const tail = body.slice(lastIndex);
  if (tail.trim()) {
    sections[currentLang] = (sections[currentLang] || '') + tail.trim();
  }
  if (!sections.pt && sections[currentLang] && currentLang !== 'pt') {
    sections.pt = body;
  }
  Object.keys(sections).forEach((lang) => {
    sections[lang] = stripMetadataSection(sections[lang]);
  });
  return sections;
}

function updateCategoryLabels(lang = currentLanguage) {
  document.querySelectorAll('[data-category-chip]').forEach((chip) => {
    const key = chip.getAttribute('data-category-chip');
    if (!key) return;
    if (key === 'all') {
      chip.textContent = t('blogCategoryAll', lang);
    } else {
      chip.textContent = getCategoryLabel(key, lang);
    }
  });
  document.querySelectorAll('[data-category-label]').forEach((element) => {
    const key = element.getAttribute('data-category-label');
    if (!key) return;
    element.textContent = getCategoryLabel(key, lang);
  });
}

function normalizeLanguage(value) {
  if (!value) return defaultLanguage;
  const lower = value.toLowerCase();
  if (lower.startsWith('pt')) return 'pt';
  if (lower.startsWith('en')) return 'en';
  if (lower.startsWith('es')) return 'es';
  return lower;
}

function detectLanguage() {
  try {
    const stored = localStorage.getItem('saul-language');
    if (stored) {
      const normalized = normalizeLanguage(stored);
      if (supportedLanguages.includes(normalized)) return normalized;
    }
  } catch (error) {
    // localStorage might be unavailable (Safari private mode). Ignore.
  }
  if (Array.isArray(navigator.languages)) {
    for (const lang of navigator.languages) {
      const normalized = normalizeLanguage(lang);
      if (supportedLanguages.includes(normalized)) return normalized;
    }
  }
  const navigatorLang = normalizeLanguage(navigator.language || navigator.userLanguage || '');
  return supportedLanguages.includes(navigatorLang) ? navigatorLang : defaultLanguage;
}

function applyTranslations(lang) {
  currentLanguage = supportedLanguages.includes(lang) ? lang : defaultLanguage;
  const dictionary = getDictionary(currentLanguage);
  document.documentElement.lang = currentLanguage === 'pt' ? 'pt-BR' : currentLanguage;
  document.querySelectorAll('[data-i18n]').forEach((element) => {
    const key = element.getAttribute('data-i18n');
    const text = dictionary[key];
    if (typeof text === 'string') {
      element.textContent = text;
    }
  });
  const selector = document.getElementById('blog-language-select');
  if (selector) {
    if (selector.value !== currentLanguage) {
      selector.value = currentLanguage;
    }
    selector.setAttribute('aria-label', dictionary.languageLabel);
  }
  const srLabel = document.querySelector('label[for="blog-language-select"]');
  if (srLabel) {
    srLabel.textContent = dictionary.languageLabel;
  }
  updateCategoryLabels(currentLanguage);

  const view = document.body.dataset.blogView;
  if (view === 'post') {
    document.title = `${t('breadcrumbArticle')} — ${t('blogHeroEyebrow')}`;
  } else {
    const category = document.body.dataset.blogCategory;
    if (category && CATEGORY_TITLE_KEYS[category]) {
      document.title = `${t(CATEGORY_TITLE_KEYS[category])} — ${t('blogHeroEyebrow')}`;
    } else {
      document.title = t('blogHeroEyebrow');
    }
  }
}

function bindLanguageSelector() {
  const selector = document.getElementById('blog-language-select');
  if (!selector) return;
  selector.addEventListener('change', (event) => {
    const value = normalizeLanguage(event.target.value);
    try {
      localStorage.setItem('saul-language', value);
    } catch (error) {
      // ignore
    }
    applyTranslations(value);
    renderCurrentView();
  });
}

function renderCurrentView() {
  const view = document.body.dataset.blogView;
  if (view === 'post') {
    renderPost();
  } else {
    renderIndex();
  }
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function inlineMarkdown(text) {
  const safe = escapeHtml(text);
  return safe
    .replace(/\[([^\]]+)]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

function markdownToHtml(markdown) {
  const lines = markdown.trim().split(/\r?\n/);
  const html = [];
  let inList = false;

  const closeList = () => {
    if (inList) {
      html.push('</ul>');
      inList = false;
    }
  };

  for (const line of lines) {
    if (!line.trim()) {
      closeList();
      continue;
    }

    if (/^###\s+/.test(line)) {
      closeList();
      html.push(`<h3>${inlineMarkdown(line.replace(/^###\s+/, ''))}</h3>`);
      continue;
    }

    if (/^##\s+/.test(line)) {
      closeList();
      html.push(`<h2>${inlineMarkdown(line.replace(/^##\s+/, ''))}</h2>`);
      continue;
    }

    if (/^#\s+/.test(line)) {
      closeList();
      html.push(`<h1>${inlineMarkdown(line.replace(/^#\s+/, ''))}</h1>`);
      continue;
    }

    if (/^-\s+/.test(line)) {
      if (!inList) {
        html.push('<ul>');
        inList = true;
      }
      html.push(`<li>${inlineMarkdown(line.replace(/^-\s+/, ''))}</li>`);
      continue;
    }

    closeList();
    html.push(`<p>${inlineMarkdown(line)}</p>`);
  }

  closeList();
  return html.join('\n');
}

function parseFrontmatter(content) {
  if (!content.startsWith('---')) return { data: {}, body: content };

  const closingIndex = content.indexOf('\n---', 3);
  if (closingIndex === -1) return { data: {}, body: content };

  const frontmatter = content.slice(3, closingIndex).trim();
  const body = content.slice(closingIndex + 4).trim();
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
        .map((v) => v.trim().replace(/^"|"$/g, '').replace(/^'|'$/g, ''))
        .filter(Boolean);
    } else {
      data[key] = value.replace(/^"|"$/g, '').replace(/^'|'$/g, '');
    }
  }

  return { data, body };
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Falha ao carregar índice (${response.status})`);
  return response.json();
}

async function fetchText(url) {
  const response = await fetch(url, { headers: { Accept: 'text/plain' } });
  if (!response.ok) throw new Error(`Não foi possível carregar o post (${response.status})`);
  return response.text();
}

function formatDate(dateStr) {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return dateStr;
  const locale = DATE_LOCALE[currentLanguage] || DATE_LOCALE[defaultLanguage];
  return date.toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' });
}

function buildPostLink(post) {
  const path = (post.markdown || post.path || '').replace(/^\//, '') || post.url;
  if (!path) return '#';
  const url = new URL('post/', blogBase);
  url.searchParams.set('post', path);
  return url.toString();
}

function renderCards(posts, container) {
  container.innerHTML = '';
  if (!posts.length) {
    container.innerHTML = `<div class="empty-state">${t('blogEmptyState')}</div>`;
    return;
  }

  posts
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .forEach((post) => {
      const card = document.createElement('article');
      card.className = 'blog-card';

      const artwork = getCategoryArtwork(post.category);
      const thumb = document.createElement('div');
      thumb.className = 'blog-card-thumb';
      const thumbImg = document.createElement('img');
      thumbImg.src = artwork.src;
      thumbImg.alt = artwork.alt;
      thumb.appendChild(thumbImg);
      card.appendChild(thumb);

      const title = document.createElement('h3');
      title.textContent = getLocalizedValue(post, 'title') || post.title;
      card.appendChild(title);

      const meta = document.createElement('div');
      meta.className = 'blog-meta';
      meta.textContent = `${formatDate(post.date)} · ${getCategoryLabel(post.category)}`;
      card.appendChild(meta);

      const excerptText = getLocalizedValue(post, 'excerpt') || post.excerpt;
      if (excerptText) {
        const excerpt = document.createElement('p');
        excerpt.textContent = excerptText;
        card.appendChild(excerpt);
      }

      if (Array.isArray(post.tags) && post.tags.length) {
        const tagList = document.createElement('ul');
        tagList.className = 'tag-list';
        post.tags.forEach((tag) => {
          const li = document.createElement('li');
          li.textContent = tag;
          tagList.appendChild(li);
        });
        card.appendChild(tagList);
      }

      const link = document.createElement('a');
      link.className = 'read-more';
      link.href = buildPostLink(post);
      link.textContent = t('readArticle');
      card.appendChild(link);

      container.appendChild(card);
    });
}

async function renderIndex() {
  const category = document.body.dataset.blogCategory;
  try {
    const { posts = [] } = await fetchJson(indexUrl);
    const filtered = category ? posts.filter((p) => p.category === category) : posts;
    const listContainer = document.getElementById('blog-list');
    if (!listContainer) return;
    renderCards(filtered, listContainer);
  } catch (error) {
    const listContainer = document.getElementById('blog-list');
    if (listContainer)
      listContainer.innerHTML = `<div class="empty-state">${t('blogError')}: ${error.message}</div>`;
  }
}

function renderMetadata(meta, container) {
  const dl = document.createElement('dl');

  const add = (label, value) => {
    if (!value) return;
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = Array.isArray(value) ? value.join(', ') : value;
    dl.append(dt, dd);
  };

  add(t('metaCategory'), getCategoryLabel(meta.category));
  const tagValue = Array.isArray(meta.tags) ? meta.tags.join(', ') : meta.tags;
  add(t('metaTags'), tagValue);
  add(t('metaSource'), meta.source_title);
  add(t('metaSourceUrl'), meta.source_url);
  add(t('metaPublishedAt'), meta.source_published_at);

  container.innerHTML = '';
  container.appendChild(dl);
}

function sanitizePostPath(value) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('/') || trimmed.startsWith('\\')) return null;
  if (trimmed.startsWith('//')) return null;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) return null;

  const normalized = trimmed.replace(/^\.\/+/, '');
  let decoded;
  try {
    decoded = decodeURIComponent(normalized);
  } catch {
    return null;
  }
  if (!decoded || decoded.includes('..') || decoded.startsWith('/') || decoded.startsWith('\\')) return null;

  let candidate;
  try {
    candidate = new URL(normalized, postsBase);
  } catch {
    return null;
  }
  if (candidate.origin !== postsBase.origin) return null;
  if (!candidate.pathname.startsWith(postsBase.pathname)) return null;

  return normalized;
}

function updatePostMedia(category) {
  const artwork = getCategoryArtwork(category);
  const heroImage = document.querySelector('.post-category-image');
  if (heroImage) {
    heroImage.src = artwork.src;
    heroImage.alt = artwork.alt;
  }
  const heroLogo = document.querySelector('.post-logo');
  if (heroLogo) {
    heroLogo.src = BLOG_LOGO;
    heroLogo.alt = 'Saul Goodman logo';
  }
}

async function renderPost() {
  const params = new URLSearchParams(window.location.search);
  const postParam = sanitizePostPath(params.get('post'));
  const postContainer = document.querySelector('.post-body');
  const footer = document.querySelector('.metadata-footer');
  if (!postParam || !postContainer) {
    postContainer.innerHTML = `<div class="empty-state">${t('postNotFound')}</div>`;
    postContainer.removeAttribute('data-i18n');
    if (footer) footer.innerHTML = '';
    return;
  }

  try {
    const postUrl = new URL(postParam, postsBase);
    const raw = await fetchText(postUrl);
    const { data, body } = parseFrontmatter(raw);

    if (!data.title || !data.date) {
      postContainer.innerHTML = `<div class="empty-state">${t('postInvalid')}</div>`;
      postContainer.removeAttribute('data-i18n');
      if (footer) footer.innerHTML = '';
      return;
    }

    const header = document.querySelector('.post-header h1');
    const meta = document.querySelector('.post-header .blog-meta');
    const breadcrumbCurrent = document.querySelector('.breadcrumb .current');
    const localizedTitle = getLocalizedValue(data, 'title') || data.title;
    if (header) {
      header.textContent = localizedTitle;
      header.removeAttribute('data-i18n');
    }
    if (meta) meta.textContent = `${formatDate(data.date)} · ${getCategoryLabel(data.category)}`;
    if (breadcrumbCurrent) {
      breadcrumbCurrent.textContent = localizedTitle;
      breadcrumbCurrent.removeAttribute('data-i18n');
    }
    if (localizedTitle) document.title = `${localizedTitle} — ${t('blogHeroEyebrow')}`;
    updatePostMedia(data.category);

    const localizedBodies = extractLocalizedBodies(body);
    const selectedBody = localizedBodies[currentLanguage] || localizedBodies.pt || body;
    const cleanedBody = stripMetadataSection(selectedBody);
    postContainer.innerHTML = markdownToHtml(cleanedBody);
    postContainer.removeAttribute('data-i18n');

    if (footer) renderMetadata(data, footer);
  } catch (error) {
    console.error('Failed to load blog post', error);
    postContainer.innerHTML = `<div class="empty-state">${t('postLoadError')}: ${error.message}</div>`;
    postContainer.removeAttribute('data-i18n');
    if (footer) footer.innerHTML = '';
  }
}

function init() {
  const detected = detectLanguage();
  applyTranslations(detected);
  bindLanguageSelector();
  renderCurrentView();
}

document.addEventListener('DOMContentLoaded', init);
