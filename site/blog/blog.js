const scriptUrl = typeof document !== 'undefined' && document.currentScript?.src
  ? document.currentScript.src
  : import.meta.url;
const blogBase = new URL('./', scriptUrl);
const indexUrl = new URL('index.json', blogBase);
const postsBase = new URL('posts/', blogBase);

const LOCALES_BASE = new URL('./_locales/', blogBase);

const DEFAULT_LANGUAGE = 'pt';
const SUPPORTED_LANGUAGES = [
  'pt',
  'en',
  'es',
  'fr',
  'de',
  'it',
  'tr',
  'zh',
  'hi',
  'ar',
  'bn',
  'ru',
  'ur',
];

const LOCALE_DIR_BY_LANGUAGE = {
  pt: 'pt_BR',
  en: 'en_US',
  es: 'es_419',
  fr: 'fr',
  de: 'de',
  it: 'it',
  tr: 'tr',
  zh: 'zh_CN',
  hi: 'hi',
  ar: 'ar',
  bn: 'bn',
  ru: 'ru',
  ur: 'ur',
};

const localeMessagesCache = {};
let currentLanguage = DEFAULT_LANGUAGE;
let currentMessages = {};
let fallbackMessages = {};

function flattenChromeMessages(raw) {
  const result = {};
  if (!raw || typeof raw !== 'object') return result;
  for (const [key, value] of Object.entries(raw)) {
    if (value && typeof value.message === 'string') {
      result[key] = value.message;
    }
  }
  return result;
}

async function loadMessagesForLanguage(lang) {
  const normalized = SUPPORTED_LANGUAGES.includes(lang) ? lang : DEFAULT_LANGUAGE;
  if (localeMessagesCache[normalized]) return localeMessagesCache[normalized];
  const dir = LOCALE_DIR_BY_LANGUAGE[normalized] || LOCALE_DIR_BY_LANGUAGE[DEFAULT_LANGUAGE];
  const url = new URL(dir + '/messages.json', LOCALES_BASE);
  const raw = await fetchJson(url);
  const flat = flattenChromeMessages(raw);
  localeMessagesCache[normalized] = flat;
  return flat;
}

function t(key) {
  return currentMessages[key] || fallbackMessages[key] || key;
}

async function setLanguage(lang) {
  const normalized = SUPPORTED_LANGUAGES.includes(lang) ? lang : DEFAULT_LANGUAGE;
  currentLanguage = normalized;
  try {
    currentMessages = await loadMessagesForLanguage(currentLanguage);
  } catch {
    currentMessages = {};
  }
  try {
    fallbackMessages = await loadMessagesForLanguage(DEFAULT_LANGUAGE);
  } catch {
    fallbackMessages = {};
  }
  applyTranslations();
}

const BLOG_CATEGORY_LABEL_KEYS = {
  'procrastinacao': 'blogCategoryLabelProcrastinacao',
  'foco-atencao': 'blogCategoryLabelFocoAtencao',
  'dev-performance': 'blogCategoryLabelDevPerformance',
  'trabalho-remoto': 'blogCategoryLabelTrabalhoRemoto',
  'ux-design': 'blogCategoryLabelUxDesign',
  'marketing': 'blogCategoryLabelMarketing',
  'produto': 'blogCategoryLabelProduto',
  'carreira': 'blogCategoryLabelCarreira',
  'negocios': 'blogCategoryLabelNegocios',
};

const CATEGORY_TITLE_KEYS = {
  'procrastinacao': 'categoryProcrastinacaoTitle',
  'foco-atencao': 'categoryFocoTitle',
  'dev-performance': 'categoryDevTitle',
  'trabalho-remoto': 'categoryRemotoTitle',
  'ux-design': 'categoryUxTitle',
  'marketing': 'categoryMarketingTitle',
  'produto': 'categoryProdutoTitle',
  'carreira': 'categoryCarreiraTitle',
  'negocios': 'categoryNegociosTitle',
};

const CATEGORY_LEAD_KEYS = {
  'procrastinacao': 'categoryProcrastinacaoLead',
  'foco-atencao': 'categoryFocoLead',
  'dev-performance': 'categoryDevLead',
  'trabalho-remoto': 'categoryRemotoLead',
  'ux-design': 'categoryUxLead',
  'marketing': 'categoryMarketingLead',
  'produto': 'categoryProdutoLead',
  'carreira': 'categoryCarreiraLead',
  'negocios': 'categoryNegociosLead',
};

const CATEGORY_TAGLINE_KEYS = {
  'procrastinacao': 'mediaTaglineProcrastinacao',
  'foco-atencao': 'mediaTaglineFoco',
  'dev-performance': 'mediaTaglineDev',
  'trabalho-remoto': 'mediaTaglineRemoto',
  'ux-design': 'mediaTaglineUx',
  'marketing': 'mediaTaglineMarketing',
  'produto': 'mediaTaglineProduto',
  'carreira': 'mediaTaglineCarreira',
  'negocios': 'mediaTaglineNegocios',
};

const VALID_CATEGORIES = Object.keys(CATEGORY_TITLE_KEYS);

const DATE_LOCALE = {
  pt: 'pt-BR',
  en: 'en-US',
  es: 'es-ES',
  fr: 'fr-FR',
  de: 'de-DE',
  it: 'it-IT',
  tr: 'tr-TR',
  zh: 'zh-CN',
  hi: 'hi-IN',
  ar: 'ar',
  bn: 'bn',
  ru: 'ru-RU',
  ur: 'ur',
};

const assetsBase = new URL('../assets/', blogBase);
const BLOG_LOGO = new URL('logotipo_saul_goodman.png', assetsBase).toString();
const TONE_ARTWORK = {
  'incredulo': {
    src: new URL('saul_incredulo.png', assetsBase).toString(),
    altKey: 'blogToneAltIncredulo',
  },
  'like': {
    src: new URL('saul_like.png', assetsBase).toString(),
    altKey: 'blogToneAltLike',
  },
  'nao-corte': {
    src: new URL('saul_nao_corte.png', assetsBase).toString(),
    altKey: 'blogToneAltNaoCorte',
  },
};

function normalizeTone(value) {
  if (!value || typeof value !== 'string') return '';
  return value.toLowerCase().trim();
}

function inferTone(meta = {}) {
  const explicit = normalizeTone(meta.tone || meta.mood);
  if (explicit && TONE_ARTWORK[explicit]) {
    return explicit;
  }
  const tags = Array.isArray(meta.tags) ? meta.tags.map((tag) => normalizeTone(tag)) : [];
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
  const haystack = `${meta.title || ''} ${meta.excerpt || ''}`.toLowerCase();
  for (const tone of Object.keys(TONE_TEXT_HINTS)) {
    const hints = TONE_TEXT_HINTS[tone];
    if (hints.some((hint) => haystack.includes(hint))) {
      return tone;
    }
  }
  if (meta.category === 'trabalho-remoto') return 'nao-corte';
  if (meta.category === 'foco-atencao') return 'like';
  if (meta.category === 'dev-performance') return 'like';
  if (meta.category === 'ux-design') return 'like';
  return 'incredulo';
}

function getToneArtwork(meta = {}) {
  const tone = inferTone(meta);
  const artwork = TONE_ARTWORK[tone] || { src: BLOG_LOGO, altKey: 'blogLogoAlt' };
  return {
    src: artwork.src,
    alt: artwork.altKey ? t(artwork.altKey) : '',
    tone,
  };
}

function resolveImageUrl(value) {
  if (!value) return '';
  try {
    return new URL(value, blogBase).toString();
  } catch {
    return '';
  }
}

function getSocialImage(meta = {}) {
  const explicit = meta.image || meta.social_image || meta.hero_image;
  const resolved = resolveImageUrl(explicit);
  if (resolved) return resolved;
  return getToneArtwork(meta).src;
}

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

let allPostsCache = [];
let fullIndexCache = null;
let activeTagFilter = '';
let searchQuery = '';
const WORDS_PER_MINUTE = 225;
const readingTimeCache = {};
let storedReadingTimes = null;

function persistReadingTimeToCaches(key, minutes, words) {
  const apply = (post) => {
    if (!post) return;
    if (minutes) post.reading_time = minutes;
    if (words) post.body_word_count = words;
  };
  if (Array.isArray(fullIndexCache)) {
    fullIndexCache.forEach((post) => {
      if (normalizePostKey(post.markdown || post.path || post.url) === key) apply(post);
    });
  }
  if (Array.isArray(allPostsCache)) {
    allPostsCache.forEach((post) => {
      if (normalizePostKey(post.markdown || post.path || post.url) === key) apply(post);
    });
  }
}

function getCategoryLabel(value) {
  if (!value) return '';
  const key = BLOG_CATEGORY_LABEL_KEYS[value];
  return key ? t(key) : value;
}

function getLocalizedValue(source, key, lang = currentLanguage) {
  if (!source) return undefined;
  const localizedKey = `${key}_${lang}`;
  return source[localizedKey] || source[key];
}

function normalizeTagKey(tag) {
  return tag
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function normalizeTagList(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((tag) => (typeof tag === 'string' ? tag.trim() : String(tag))).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);
  }
  return [];
}

function getLocalizedTags(source, lang = currentLanguage) {
  if (!source) return [];
  const localizedKey = `tags_${lang}`;
  const localizedRaw = Object.prototype.hasOwnProperty.call(source || {}, localizedKey)
    ? source[localizedKey]
    : undefined;
  const localizedList = normalizeTagList(localizedRaw);
  if (localizedList.length) return localizedList;
  return normalizeTagList(source.tags);
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

function extractLocalizedBodies(body) {
  const sections = {};
  const markerRegex = new RegExp(`<!--lang:(${SUPPORTED_LANGUAGES.join('|')})-->`, 'gi');
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

function updateCategoryLabels() {
  document.querySelectorAll('[data-category-chip]').forEach((chip) => {
    const key = chip.getAttribute('data-category-chip');
    if (!key) return;
    if (key === 'all') {
      chip.textContent = t('blogCategoryAll');
    } else {
      chip.textContent = getCategoryLabel(key);
    }
  });
  document.querySelectorAll('[data-category-label]').forEach((element) => {
    const key = element.getAttribute('data-category-label');
    if (!key) return;
    element.textContent = getCategoryLabel(key);
  });
}

function updateMediaCopy(category) {
  const titleEl = document.querySelector('[data-media-title]');
  if (titleEl) {
    const key = CATEGORY_TITLE_KEYS[category];
    titleEl.textContent = key ? t(key) : getCategoryLabel(category);
  }
  const taglineEl = document.querySelector('[data-media-tagline]');
  if (taglineEl) {
    const key = CATEGORY_TAGLINE_KEYS[category];
    taglineEl.textContent = key ? t(key) : '';
  }
}

function normalizeLanguage(value) {
  if (!value) return DEFAULT_LANGUAGE;
  const lower = value.toLowerCase();
  if (lower.startsWith('pt')) return 'pt';
  if (lower.startsWith('en')) return 'en';
  if (lower.startsWith('es')) return 'es';
  if (lower.startsWith('fr')) return 'fr';
  if (lower.startsWith('de')) return 'de';
  if (lower.startsWith('it')) return 'it';
  if (lower.startsWith('tr')) return 'tr';
  if (lower.startsWith('zh')) return 'zh';
  if (lower.startsWith('hi')) return 'hi';
  if (lower.startsWith('ar')) return 'ar';
  if (lower.startsWith('bn')) return 'bn';
  if (lower.startsWith('ru')) return 'ru';
  if (lower.startsWith('ur')) return 'ur';
  return DEFAULT_LANGUAGE;
}

function getCategoryFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('category') || '';
  const normalized = raw.trim().toLowerCase();
  return VALID_CATEGORIES.includes(normalized) ? normalized : null;
}

function detectLanguage() {
  try {
    const stored = localStorage.getItem('saul-language');
    if (stored) {
      const normalized = normalizeLanguage(stored);
      if (SUPPORTED_LANGUAGES.includes(normalized)) return normalized;
    }
  } catch (error) {
    // localStorage might be unavailable (Safari private mode). Ignore.
  }
  if (Array.isArray(navigator.languages)) {
    for (const lang of navigator.languages) {
      const normalized = normalizeLanguage(lang);
      if (SUPPORTED_LANGUAGES.includes(normalized)) return normalized;
    }
  }
  const navigatorLang = normalizeLanguage(navigator.language || navigator.userLanguage || '');
  return SUPPORTED_LANGUAGES.includes(navigatorLang) ? navigatorLang : DEFAULT_LANGUAGE;
}

function getHtmlLang(value) {
  if (value === 'pt') return 'pt-BR';
  if (value === 'es') return 'es-419';
  if (value === 'zh') return 'zh-CN';
  return value;
}

function getLanguageLabel(value) {
  const labels = {
    pt: 'PT',
    en: 'EN',
    es: 'ES',
    fr: 'FR',
    de: 'DE',
    it: 'IT',
    tr: 'TR',
    zh: '中文',
    hi: 'हिंदी',
    ar: 'العربية',
    bn: 'বাংলা',
    ru: 'RU',
    ur: 'اردو',
  };
  return labels[value] || String(value || '').toUpperCase();
}

function ensureLanguageSelectorOptions() {
  const selector = document.getElementById('blog-language-select');
  if (!selector) return;

  const existingValues = new Set(
    Array.from(selector.querySelectorAll('option')).map((opt) => opt.value)
  );

  if (
    SUPPORTED_LANGUAGES.every((lang) => existingValues.has(lang)) &&
    selector.querySelectorAll('option').length === SUPPORTED_LANGUAGES.length
  ) {
    return;
  }

  selector.innerHTML = '';
  SUPPORTED_LANGUAGES.forEach((lang) => {
    const option = document.createElement('option');
    option.value = lang;
    option.textContent = getLanguageLabel(lang);
    selector.appendChild(option);
  });
}

function applyTranslations() {
  document.documentElement.lang = getHtmlLang(currentLanguage);
  ensureLanguageSelectorOptions();

  document.querySelectorAll('[data-i18n]').forEach((element) => {
    const key = element.getAttribute('data-i18n');
    if (!key) return;
    element.textContent = t(key);
  });

  const selector = document.getElementById('blog-language-select');
  if (selector) {
    if (selector.value !== currentLanguage) {
      selector.value = currentLanguage;
    }
    selector.setAttribute('aria-label', t('languageLabel'));
  }

  document.querySelectorAll('[data-i18n-placeholder]').forEach((element) => {
    const key = element.getAttribute('data-i18n-placeholder');
    if (!key) return;
    element.setAttribute('placeholder', t(key));
  });

  const srLabel = document.querySelector('label[for="blog-language-select"]');
  if (srLabel) {
    srLabel.textContent = t('languageLabel');
  }

  updateCategoryLabels();

  const view = document.body.dataset.blogView;
  if (view === 'post') {
    // Preserve existing title on post pages; renderPost will set a localized title after loading content.
  } else {
    const category = document.body.dataset.blogCategory;
    if (category && CATEGORY_TITLE_KEYS[category]) {
      document.title = `${t(CATEGORY_TITLE_KEYS[category])} — ${t('blogHeroEyebrow')}`;
    } else {
      document.title = t('blogHeroEyebrow');
    }
    updateListingSeo();
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
    void setLanguage(value).then(() => {
      renderCurrentView();
    });
  });
}

function renderCurrentView() {
  const view = document.body.dataset.blogView;
  if (view === 'post') {
    renderPost();
  } else {
    const categoryParam = typeof window !== 'undefined' ? getCategoryFromUrl() : null;
    if (categoryParam) {
      document.body.dataset.blogCategory = categoryParam;
      highlightActiveCategory(categoryParam);
      updateActiveCategoryLabel(categoryParam);
    }
    renderIndex();
  }
}

function highlightActiveCategory(category) {
  document.querySelectorAll('.category-chip').forEach((chip) => {
    const key = chip.getAttribute('data-category-chip');
    chip.classList.toggle('active', !!category && key === category);
  });
}

function updateActiveCategoryLabel(category) {
  const label = document.getElementById('active-category-label');
  const clearBtn = document.getElementById('category-clear');
  if (!label || !clearBtn) return;
  if (category) {
    label.textContent = `${t('categoryActiveLabel')}: ${getCategoryLabel(category)}`;
    label.hidden = false;
    clearBtn.hidden = false;
  } else {
    label.hidden = true;
    clearBtn.hidden = true;
  }
}

function bindSearch() {
  const input = document.getElementById('blog-search-input');
  const reset = document.getElementById('blog-search-reset');
  if (input) {
    input.addEventListener('input', (event) => {
      searchQuery = (event.target.value || '').toString();
      applyFilters();
    });
  }
  if (reset) {
    reset.addEventListener('click', () => {
      searchQuery = '';
      activeTagFilter = '';
      if (input) input.value = '';
      updateCategoryFromQuery(null);
      applyFilters();
    });
  }
}

function bindNewsletterForm() {
  const form = document.getElementById('newsletter-form');
  if (!form) return;
  const emailInput = form.querySelector('input[type="email"]');
  const success = document.getElementById('newsletter-feedback');
  const error = document.getElementById('newsletter-error');
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const value = (emailInput?.value || '').trim();
    const isValid = /\S+@\S+\.\S+/.test(value);
    if (!isValid) {
      if (error) error.hidden = false;
      if (success) success.hidden = true;
      return;
    }
    if (error) error.hidden = true;
    if (success) success.hidden = false;
    try {
      localStorage.setItem('saul-newsletter-email', value);
    } catch (_) {
      // ignore storage errors
    }
  });
}

function updateCategoryFromQuery(category) {
  const newCategory = VALID_CATEGORIES.includes(category || '') ? category : '';
  document.body.dataset.blogCategory = newCategory || '';
  highlightActiveCategory(newCategory);
  updateActiveCategoryLabel(newCategory);
  const url = new URL(window.location.href);
  if (newCategory) {
    url.searchParams.set('category', newCategory);
  } else {
    url.searchParams.delete('category');
  }
  window.history.replaceState({}, '', url.toString());
}

function bindCategoryChips() {
  const chips = document.querySelectorAll('.category-chip');
  if (!chips.length) return;
  chips.forEach((chip) => {
    chip.addEventListener('click', () => {
      const key = chip.getAttribute('data-category-chip') || '';
      const nextCategory = chip.classList.contains('active') ? '' : key;
      updateCategoryFromQuery(nextCategory);
      applyFilters();
    });
  });
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function sanitizeLinkHref(rawHref) {
  if (!rawHref) return null;
  const trimmed = rawHref.trim();
  if (!trimmed) return null;
  if (/^(javascript|data|vbscript):/i.test(trimmed)) return null;
  if (/^\/\//.test(trimmed)) return null;
  if (trimmed.startsWith('#')) return trimmed;
  try {
    const url = new URL(trimmed, blogBase);
    if (url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'mailto:') {
      return url.toString();
    }
    return null;
  } catch {
    return null;
  }
}

function inlineMarkdown(text) {
  const safe = escapeHtml(text);
  return safe
    .replace(/\[([^\]]+)]\(([^)]+)\)/g, (match, label, href) => {
      const sanitizedHref = sanitizeLinkHref(href);
      if (!sanitizedHref) return label;
      return `<a href="${sanitizedHref}" target="_blank" rel="noreferrer">${label}</a>`;
    })
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

  const flush = (key, rawValue) => {
    if (!key) return;
    const value = (rawValue || '').trim();
    if (!value) {
      data[key] = '';
      return;
    }
    if (value.startsWith('[') && value.endsWith(']')) {
      data[key] = value
        .slice(1, -1)
        .split(',')
        .map((v) => v.trim().replace(/^"|"$/g, '').replace(/^'|'$/g, ''))
        .filter(Boolean);
      return;
    }
    data[key] = value.replace(/^"|"$/g, '').replace(/^'|'$/g, '');
  };

  let currentKey = null;
  let buffer = [];
  let multiline = false;
  let expectedIndent = 0;

  const lines = frontmatter.split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^(\s*)([^:]+):(.*)$/);
    if (match) {
      if (currentKey !== null) {
        flush(currentKey, buffer.join('\n'));
      }
      const indent = match[1].length;
      currentKey = match[2].trim();
      const remainder = match[3].trim();
      buffer = [];
      multiline = remainder === '|' || remainder === '>';
      expectedIndent = Math.max(indent + 1, 2);
      if (multiline) {
        continue;
      }
      buffer.push(remainder);
    } else if (currentKey !== null) {
      if (!line.trim()) {
        buffer.push('');
        continue;
      }
      const indent = line.match(/^(\s*)/)?.[1]?.length || 0;
      if (multiline && indent >= expectedIndent) {
        buffer.push(line.slice(expectedIndent));
      } else if (indent > 0 && indent >= expectedIndent) {
        buffer.push(line.trim());
      } else {
        flush(currentKey, buffer.join(multiline ? '\n' : ' '));
        currentKey = null;
        buffer = [];
        multiline = false;
        expectedIndent = 0;
      }
    }
  }
  if (currentKey !== null) {
    flush(currentKey, buffer.join(multiline ? '\n' : ' '));
  }

  return { data, body };
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Falha ao carregar índice (${response.status})`);
  return response.json();
}

function loadStoredReadingTimes() {
  if (storedReadingTimes) return storedReadingTimes;
  try {
    const raw = localStorage.getItem('saul-reading-times');
    storedReadingTimes = raw ? JSON.parse(raw) : {};
  } catch {
    storedReadingTimes = {};
  }
  return storedReadingTimes;
}

function storeReadingTime(key, minutes, words) {
  if (!key) return;
  const map = loadStoredReadingTimes();
  map[key] = { minutes: minutes || null, words: words || null };
  try {
    localStorage.setItem('saul-reading-times', JSON.stringify(map));
  } catch {
    // ignore quota errors
  }
}

function applyStoredReadingTimes(posts) {
  const map = loadStoredReadingTimes();
  if (!map || !posts) return;
  posts.forEach((post) => {
    const key = normalizePostKey(post.markdown || post.path || post.url);
    if (key && map[key]) {
      const { minutes, words } = map[key];
      if (minutes) post.reading_time = minutes;
      if (words) post.body_word_count = words;
    }
  });
}

async function fetchText(url) {
  const response = await fetch(url, { headers: { Accept: 'text/plain' } });
  if (!response.ok) throw new Error(`Não foi possível carregar o post (${response.status})`);
  return response.text();
}

async function loadIndexData() {
  if (Array.isArray(fullIndexCache) && fullIndexCache.length) {
    applyStoredReadingTimes(fullIndexCache);
    return fullIndexCache;
  }
  const { posts = [] } = await fetchJson(indexUrl);
  applyStoredReadingTimes(posts);
  fullIndexCache = posts;
  return posts;
}

function parseDateValue(value) {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const dateOnlyMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnlyMatch) {
    const year = Number(dateOnlyMatch[1]);
    const month = Number(dateOnlyMatch[2]) - 1;
    const day = Number(dateOnlyMatch[3]);
    const date = new Date(Date.UTC(year, month, day));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(dateStr) {
  const date = parseDateValue(dateStr);
  if (!date) return dateStr;
  const locale = DATE_LOCALE[currentLanguage] || DATE_LOCALE[DEFAULT_LANGUAGE];
  return date.toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDateTime(dateStr) {
  const date = parseDateValue(dateStr);
  if (!date) return dateStr;
  const locale = DATE_LOCALE[currentLanguage] || DATE_LOCALE[DEFAULT_LANGUAGE];
  return date.toLocaleString(locale, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function getPostSortTime(post) {
  const raw = post?.date || post?.source_published_at;
  const parsed = parseDateValue(raw);
  return parsed ? parsed.getTime() : 0;
}

function countWords(text = '') {
  if (!text) return 0;
  return text
    .replace(/<[^>]+>/g, ' ')
    .split(/\s+/)
    .filter(Boolean).length;
}

function estimateReadingMinutesFromText(text = '') {
  const words = countWords(text);
  if (!words) return null;
  return Math.max(1, Math.ceil(words / WORDS_PER_MINUTE));
}

function resolveReadingMinutes(meta = {}) {
  if (typeof meta.reading_time === 'number') return Math.max(1, Math.round(meta.reading_time));
  if (typeof meta.word_count === 'number') {
    return Math.max(1, Math.ceil(meta.word_count / WORDS_PER_MINUTE));
  }
  if (typeof meta.body_word_count === 'number') {
    return Math.max(1, Math.ceil(meta.body_word_count / WORDS_PER_MINUTE));
  }
  return null;
}

function formatReadingMinutes(minutes, lang = currentLanguage) {
  if (!minutes) return '';
  const rounded = Math.max(1, Math.round(minutes));
  return `${rounded} ${t('readTimeUnit')}`;
}

function normalizeCanonicalUrl(value) {
  if (!value) return '';
  const url = new URL(value, window.location.href);
  url.hash = '';
  if (url.pathname.endsWith('/index.html')) {
    url.pathname = url.pathname.replace(/index\.html$/, '');
  }
  return url.toString();
}

function buildStaticPostPath(postPath) {
  if (!postPath) return '';
  const normalized = postPath.replace(/^\//, '').replace(/\.md$/, '');
  return `posts/${normalized}/`;
}

function buildMarkdownUrl(post) {
  const candidate = sanitizePostPath(post?.markdown || post?.path);
  if (!candidate) return null;
  try {
    return new URL(candidate, postsBase);
  } catch {
    return null;
  }
}

function buildCanonicalPostUrl(postPath) {
  const staticPath = buildStaticPostPath(postPath);
  if (staticPath) return new URL(staticPath, blogBase).toString();
  return normalizeCanonicalUrl(window.location.href);
}

function setMetaContent(selector, value) {
  if (!value && value !== '') return;
  const element = document.querySelector(selector);
  if (!element) return;
  element.setAttribute('content', value);
}

function setCanonicalUrl(value) {
  const canonical = document.querySelector('link[rel="canonical"]');
  if (!canonical || !value) return;
  canonical.setAttribute('href', value);
}

function updateSeoTags({ title, description, image, type, url, publishedTime } = {}) {
  if (title) {
    setMetaContent('meta[property="og:title"]', title);
    setMetaContent('meta[name="twitter:title"]', title);
  }
  if (description) {
    setMetaContent('meta[name="description"]', description);
    setMetaContent('meta[property="og:description"]', description);
    setMetaContent('meta[name="twitter:description"]', description);
  }
  if (image) {
    setMetaContent('meta[property="og:image"]', image);
    setMetaContent('meta[name="twitter:image"]', image);
  }
  if (type) {
    setMetaContent('meta[property="og:type"]', type);
  }
  if (url) {
    setMetaContent('meta[property="og:url"]', url);
    setCanonicalUrl(url);
  }
  if (typeof publishedTime !== 'undefined') {
    setMetaContent('meta[property="article:published_time"]', publishedTime || '');
  }
}

function updatePostJsonLd({ title, description, image, url, publishedTime } = {}) {
  const script = document.getElementById('post-jsonld');
  if (!script) return;
  const payload = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: title || document.title,
    description: description || undefined,
    image: image ? [image] : undefined,
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
      '@id': url || normalizeCanonicalUrl(window.location.href),
    },
  };
  script.textContent = JSON.stringify(payload);
}

function updateListingSeo() {
  const view = document.body.dataset.blogView;
  if (view === 'post') return;
  const category = document.body.dataset.blogCategory;
  const title = document.title;
  const description = category && CATEGORY_LEAD_KEYS[category]
    ? t(CATEGORY_LEAD_KEYS[category])
    : t('blogHeroLead');
  const image = category ? getSocialImage({ category }) : BLOG_LOGO;
  const url = normalizeCanonicalUrl(window.location.href);
  updateSeoTags({
    title,
    description,
    image,
    type: 'website',
    url,
    publishedTime: undefined,
  });
}

function buildPostLink(post) {
  const path = (post.markdown || post.path || '').replace(/^\//, '');
  if (path) {
    return new URL(buildStaticPostPath(path), blogBase).toString();
  }
  if (post.url) {
    const sanitized = sanitizeLinkHref(post.url);
    if (sanitized) return sanitized;
  }
  return '#';
}

function normalizePostKey(raw) {
  if (!raw) return '';
  return raw
    .replace(blogBase.href, '')
    .replace(/^\.?\/?posts\//, '')
    .replace(/\/index\.html$/, '')
    .replace(/\.md$/, '')
    .replace(/\/$/, '')
    .toLowerCase();
}

function findPostByParam(posts, postParam) {
  const targetKey = normalizePostKey(postParam);
  return posts.find((post) => normalizePostKey(post.markdown || post.path || post.url) === targetKey);
}

async function hydrateReadingTime(post) {
  const key = normalizePostKey(post?.markdown || post?.path || post?.url);
  if (!key) return null;
  if (readingTimeCache[key]) return readingTimeCache[key];
  const markdownUrl = buildMarkdownUrl(post);
  if (!markdownUrl) return null;
  try {
    const raw = await fetchText(markdownUrl);
    const { data, body } = parseFrontmatter(raw);
    const localizedBodies = extractLocalizedBodies(body);
    const selectedBody = localizedBodies.pt || localizedBodies.en || localizedBodies.es || body;
    const cleanedBody = stripMetadataSection(selectedBody);
    const words = countWords(cleanedBody);
    const minutes = estimateReadingMinutesFromText(cleanedBody);
    const payload = { minutes: minutes || null, words: words || 0 };
    if (minutes) post.reading_time = minutes;
    if (words) post.body_word_count = words;
    if (!post.category && data.category) post.category = data.category;
    persistReadingTimeToCaches(key, minutes, words);
    storeReadingTime(key, minutes, words);
    readingTimeCache[key] = payload;
    return payload;
  } catch (error) {
    console.warn('Failed to hydrate reading time for', markdownUrl?.toString?.(), error);
    return null;
  }
}

async function hydrateReadingTimes(posts, onUpdate) {
  const needs = (posts || []).filter((post) => !post.reading_time && !post.body_word_count && post.markdown);
  if (!needs.length) return;
  for (const post of needs) {
    await hydrateReadingTime(post);
  }
  if (typeof onUpdate === 'function') onUpdate();
}

function renderRelatedSection(posts, currentMeta, postParam) {
  const container = document.getElementById('related-grid');
  if (!container) return;
  if (!Array.isArray(posts) || !posts.length) {
    container.innerHTML = `<div class="empty-state">${t('blogEmptyState')}</div>`;
    return;
  }
  const targetKey = normalizePostKey(postParam);
  const currentTags = new Set(getLocalizedTags(currentMeta).map((tag) => normalizeTagKey(tag)));

  const scored = posts
    .filter((post) => normalizePostKey(post.markdown || post.path || post.url) !== targetKey)
    .map((post) => {
      let score = 0;
      if (post.category && currentMeta.category && post.category === currentMeta.category) score += 4;
      const tags = getLocalizedTags(post).map((tag) => normalizeTagKey(tag));
      const sharedTags = tags.filter((tag) => currentTags.has(tag)).length;
      score += sharedTags * 2;
      return { post, score };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return getPostSortTime(b.post) - getPostSortTime(a.post);
    });

  const distinct = [];
  const pickedCategories = new Set();
  for (const item of scored) {
    if (!pickedCategories.has(item.post.category)) {
      distinct.push(item);
      pickedCategories.add(item.post.category);
    }
    if (distinct.length >= 4) break;
  }
  const related = distinct.length ? distinct : scored.filter((item) => item.score > 0);
  const fallback = related.slice(0, 4).length ? related.slice(0, 4) : scored.slice(0, 4);
  container.innerHTML = '';
  if (!fallback.length) {
    container.innerHTML = `<div class="empty-state">${t('blogEmptyState')}</div>`;
    return;
  }
  fallback.forEach(({ post }) => {
    const card = document.createElement('article');
    card.className = 'related-card';
    const artwork = getToneArtwork(post);
    const tags = getLocalizedTags(post);
    const readingMinutes = resolveReadingMinutes(post);
    card.innerHTML = `
      <div class="related-thumb">
        <img src="${artwork.src}" alt="${artwork.alt}" loading="lazy" decoding="async" />
      </div>
      <div class="related-copy">
        <p class="blog-meta">${getCategoryLabel(post.category)} · ${formatDate(post.date)}${readingMinutes ? ` · ${formatReadingMinutes(readingMinutes)}` : ''}</p>
        <h4>${getLocalizedValue(post, 'title') || post.title || ''}</h4>
        <p>${getLocalizedValue(post, 'excerpt') || post.excerpt || ''}</p>
        <div class="related-tags">${tags.slice(0, 3).map((tag) => `<span>${tag}</span>`).join('')}</div>
        <a class="related-link" href="${buildPostLink(post)}">${t('readArticle')}</a>
      </div>
    `;
    container.appendChild(card);
  });
  const postsNeedingTime = fallback.map(({ post }) => post);
  hydrateReadingTimes(postsNeedingTime, () => renderRelatedSection(posts, currentMeta, postParam));
}

function renderPostNav(posts, postParam) {
  const prevLink = document.getElementById('post-nav-prev');
  const nextLink = document.getElementById('post-nav-next');
  if (!prevLink && !nextLink) return;
  const sorted = [...posts].sort((a, b) => getPostSortTime(b) - getPostSortTime(a));
  const targetKey = normalizePostKey(postParam);
  const index = sorted.findIndex((post) => normalizePostKey(post.markdown || post.path || post.url) === targetKey);
  const previous = sorted[index + 1];
  const next = index > 0 ? sorted[index - 1] : null;

  const bindLink = (element, post, labelKey) => {
    if (!element) return;
    if (!post) {
      element.hidden = true;
      return;
    }
    element.hidden = false;
    element.href = buildPostLink(post);
    const label = element.querySelector('.nav-label');
    const title = element.querySelector('.nav-title');
    if (label) label.textContent = t(labelKey);
    if (title) title.textContent = getLocalizedValue(post, 'title') || post.title || '';
  };

  bindLink(prevLink, previous, 'previousPost');
  bindLink(nextLink, next, 'nextPost');
}

function renderCards(posts, container) {
  container.innerHTML = '';
  if (!posts.length) {
    container.innerHTML = `<div class="empty-state">${t('blogEmptyState')}</div>`;
    return;
  }

  const sortedPosts = posts.sort((a, b) => getPostSortTime(b) - getPostSortTime(a));
  const updateMetaIfHydrated = (post, metaEl) => {
    const readingMinutes = resolveReadingMinutes(post);
    if (readingMinutes && metaEl && !metaEl.textContent.includes(t('readTimeUnit'))) {
      const parts = metaEl.textContent.split('·').map((part) => part.trim()).filter(Boolean);
      const alreadyHasTime = parts.some((part) => part.includes(t('readTimeUnit')));
      if (!alreadyHasTime) {
        parts.push(formatReadingMinutes(readingMinutes));
        metaEl.textContent = parts.join(' · ');
      }
    }
  };

  sortedPosts.forEach((post) => {
      const card = document.createElement('article');
      card.className = 'blog-card';

      const artwork = getToneArtwork(post);
      const thumb = document.createElement('div');
      thumb.className = 'blog-card-thumb';
      const thumbImg = document.createElement('img');
      thumbImg.src = artwork.src;
      thumbImg.alt = artwork.alt;
      thumbImg.loading = 'lazy';
      thumbImg.decoding = 'async';
      thumb.appendChild(thumbImg);
      card.appendChild(thumb);

      const title = document.createElement('h3');
      title.textContent = getLocalizedValue(post, 'title') || post.title;
      card.appendChild(title);

      const meta = document.createElement('div');
      meta.className = 'blog-meta';
      const readingMinutes = resolveReadingMinutes(post);
      const metaParts = [`${formatDate(post.date)}`, getCategoryLabel(post.category)];
      if (readingMinutes) {
        metaParts.push(formatReadingMinutes(readingMinutes));
      }
      meta.textContent = metaParts.filter(Boolean).join(' · ');
      card.appendChild(meta);

      const excerptText = getLocalizedValue(post, 'excerpt') || post.excerpt;
      if (excerptText) {
        const excerpt = document.createElement('p');
        excerpt.textContent = excerptText;
        card.appendChild(excerpt);
      }

      const tags = getLocalizedTags(post);
      if (tags.length) {
        const tagList = document.createElement('ul');
        tagList.className = 'tag-list';
        tags.forEach((tag) => {
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
      updateMetaIfHydrated(post, meta);
  });
}

function renderFeatured(post) {
  const container = document.getElementById('featured-card');
  if (!container) return;
  if (!post) {
    container.innerHTML = `<div class="empty-state">${t('blogEmptyState')}</div>`;
    return;
  }
  const artwork = getToneArtwork(post);
  const tags = getLocalizedTags(post);
  const link = buildPostLink(post);
  const readingMinutes = resolveReadingMinutes(post);
  const metaParts = [getCategoryLabel(post.category), formatDate(post.date)];
  if (readingMinutes) metaParts.push(formatReadingMinutes(readingMinutes));
  container.classList.remove('placeholder');
  container.innerHTML = `
    <div class="featured-copy">
      <div class="featured-meta">
        ${metaParts.map((part, index) => `<span>${index === 0 ? '' : '· '}${part}</span>`).join('')}
      </div>
      <h3>${getLocalizedValue(post, 'title') || post.title || ''}</h3>
      <p>${getLocalizedValue(post, 'excerpt') || post.excerpt || ''}</p>
      <div class="featured-tags">
        ${tags.map((tag) => `<span>${tag}</span>`).join('')}
      </div>
      <a class="featured-link" href="${link}">${t('readArticle')}</a>
    </div>
    <div class="featured-media">
      <img src="${artwork.src}" alt="${artwork.alt}" loading="lazy" decoding="async" />
    </div>
  `;
}

function buildListingJsonLd(posts) {
  const scriptId = 'listing-jsonld';
  let script = document.getElementById(scriptId);
  if (!script) {
    script = document.createElement('script');
    script.type = 'application/ld+json';
    script.id = scriptId;
    document.head.appendChild(script);
  }
  const items = posts.slice(0, 10).map((post, index) => ({
    '@type': 'ListItem',
    position: index + 1,
    url: buildPostLink(post),
    name: getLocalizedValue(post, 'title') || post.title,
  }));
  const payload = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: items,
  };
  script.textContent = JSON.stringify(payload);
}

function renderShareButtons() {
  const container = document.getElementById('index-share');
  if (!container) return;
  const feedback = container.querySelector('.share-feedback');
  if (feedback) {
    feedback.hidden = true;
    feedback.textContent = t('shareIndexCopied');
  }
  const url = window.location.href.split('#')[0];
  const shareLinks = {
    twitter: `https://twitter.com/intent/tweet?text=${encodeURIComponent(document.title)}&url=${encodeURIComponent(url)}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,
  };
  container.querySelectorAll('[data-share-index]').forEach((btn) => {
    const type = btn.getAttribute('data-share-index');
    btn.onclick = null;
    if (type === 'copy') {
      btn.onclick = async () => {
        try {
          if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(url);
            if (feedback) {
              feedback.hidden = false;
              setTimeout(() => {
                feedback.hidden = true;
              }, 1800);
            }
          } else {
            window.prompt(t('shareCopyPrompt'), url);
          }
        } catch {
          window.prompt(t('shareCopyPrompt'), url);
        }
      };
    } else if (shareLinks[type]) {
      btn.onclick = () => window.open(shareLinks[type], '_blank', 'noopener');
    }
  });
}

function renderCategoryGrid(posts) {
  const container = document.getElementById('category-grid');
  if (!container) return;
  const counts = posts.reduce((acc, post) => {
    const key = post.category || 'unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const categories = Object.keys(CATEGORY_TITLE_KEYS);
  container.innerHTML = '';
  categories.forEach((category) => {
    const titleKey = CATEGORY_TITLE_KEYS[category];
    const leadKey = CATEGORY_LEAD_KEYS[category];
    const count = counts[category] || 0;
    const card = document.createElement('div');
    card.className = 'category-card';
    card.innerHTML = `
      <p class="eyebrow">${getCategoryLabel(category)}</p>
      <strong>${t(titleKey)}</strong>
      <p>${t(leadKey)}</p>
      <p class="count">${count} ${t('statsPosts')}</p>
    `;
    container.appendChild(card);
  });
}

function renderTagShelf(posts) {
  const container = document.getElementById('tag-shelf');
  if (!container) return;
  const counts = {};
  posts.forEach((post) => {
    getLocalizedTags(post).forEach((tag) => {
      counts[tag] = (counts[tag] || 0) + 1;
    });
  });
  const topTags = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12);
  container.innerHTML = '';
  if (!topTags.length) {
    container.innerHTML = `<div class="empty-state">${t('blogEmptyState')}</div>`;
    return;
  }
  topTags.forEach(([tag, count]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = `${tag} (${count})`;
    button.className = activeTagFilter === tag ? 'active' : '';
    button.onclick = () => {
      activeTagFilter = activeTagFilter === tag ? '' : tag;
      applyFilters();
    };
    container.appendChild(button);
  });
}

function renderStats(posts) {
  const container = document.getElementById('blog-stats');
  if (!container) return;
  const cards = container.querySelectorAll('.stat-card');
  const totalPosts = posts.length;
  const categories = new Set(posts.map((p) => p.category).filter(Boolean));
  const latest = posts.reduce((acc, post) => {
    const time = getPostSortTime(post);
    if (time > acc) return time;
    return acc;
  }, 0);
  const values = [
    { value: totalPosts, hint: t('statsPosts') },
    { value: categories.size, hint: t('statsCategories') },
    { value: latest ? formatDate(new Date(latest).toISOString()) : '—', hint: t('statsFresh') },
  ];
  cards.forEach((card, index) => {
    const valueEl = card.querySelector('.stat-value');
    const hintEl = card.querySelector('.stat-hint');
    if (valueEl) valueEl.textContent = values[index]?.value ?? '—';
    if (hintEl) hintEl.textContent = values[index]?.hint ?? '';
  });
}

async function renderIndex() {
  const category = document.body.dataset.blogCategory;
  try {
    const posts = await loadIndexData();
    fullIndexCache = posts;
    allPostsCache = category ? posts.filter((p) => p.category === category) : posts;
    applyFilters();
    renderShareButtons();
    buildListingJsonLd(allPostsCache);
    hydrateReadingTimes(allPostsCache, applyFilters);
  } catch (error) {
    const listContainer = document.getElementById('blog-list');
    if (listContainer)
      listContainer.innerHTML = `<div class="empty-state">${t('blogError')}: ${error.message}</div>`;
  }
}

function applyFilters() {
  const listContainer = document.getElementById('blog-list');
  if (!Array.isArray(allPostsCache) || !listContainer) return;
  const term = searchQuery.toLowerCase().trim();
  const filtered = allPostsCache.filter((post) => {
    const matchesTag = activeTagFilter
      ? getLocalizedTags(post).some((tag) => tag.toLowerCase() === activeTagFilter.toLowerCase())
      : true;
    if (!matchesTag) return false;
    if (!term) return true;
    const haystack = `${post.title || ''} ${post.excerpt || ''} ${(getLocalizedTags(post) || []).join(' ')}`.toLowerCase();
    return haystack.includes(term);
  });
  const sorted = filtered.sort((a, b) => getPostSortTime(b) - getPostSortTime(a));
  renderStats(sorted);
  renderCategoryGrid(sorted);
  renderTagShelf(sorted);
  renderFeatured(sorted[0]);
  renderCards(sorted.slice(1), listContainer);
}

function renderMetadata(meta, container) {
  const target = container || document.querySelector('.metadata-panel') || document.querySelector('.metadata-footer');
  if (!target) return;
  const dl = document.createElement('dl');

  const add = (label, value) => {
    if (!value) return;
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    if (value instanceof HTMLElement) {
      dd.appendChild(value);
    } else if (Array.isArray(value)) {
      dd.textContent = value.join(', ');
    } else {
      dd.textContent = value;
    }
    dl.append(dt, dd);
  };

  add(t('metaCategory'), getCategoryLabel(meta.category));
  const readingMinutes = resolveReadingMinutes(meta);
  if (readingMinutes) add(t('readingTimeLabel'), formatReadingMinutes(readingMinutes));
  const tagValue = getLocalizedTags(meta);
  if (tagValue.length) {
    const list = document.createElement('ul');
    tagValue.forEach((tag) => {
      const item = document.createElement('li');
      item.textContent = tag;
      list.appendChild(item);
    });
    add(t('metaTags'), list);
  } else {
    add(t('metaTags'), '—');
  }
  add(t('metaSource'), meta.source_title);
  add(t('metaSourceUrl'), meta.source_url);
  add(t('metaPublishedAt'), formatDate(meta.date));
  if (meta.source_published_at) {
    add(t('metaSourcePublishedAt'), formatDateTime(meta.source_published_at));
  }

  target.innerHTML = '';
  target.appendChild(dl);
}

function setupShareButtons(meta, localizedTitle, shareUrl) {
  const container = document.querySelector('.post-share');
  if (!container) return;
  const feedback = container.querySelector('.share-feedback');
  if (feedback) {
    feedback.hidden = true;
    feedback.textContent = t('shareCopied');
  }
  const url = shareUrl || window.location.href;
  const shareLinks = {
    twitter: `https://twitter.com/intent/tweet?text=${encodeURIComponent(localizedTitle)}&url=${encodeURIComponent(url)}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,
  };

  container.querySelectorAll('.share-btn').forEach((btn) => {
    const type = btn.dataset.share;
    btn.onclick = null;
    if (type === 'copy') {
      btn.onclick = async () => {
        try {
          if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(url);
            if (feedback) {
              feedback.hidden = false;
              setTimeout(() => {
                feedback.hidden = true;
              }, 2000);
            }
          } else {
            window.prompt(t('shareCopyPrompt'), url);
          }
        } catch (error) {
          window.prompt(t('shareCopyPrompt'), url);
        }
      };
    } else if (shareLinks[type]) {
      btn.onclick = () => window.open(shareLinks[type], '_blank', 'noopener');
    }
  });
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

function updatePostMedia(meta) {
  const artwork = getToneArtwork(meta);
  const heroImage = document.querySelector('.post-category-image');
  if (heroImage) {
    heroImage.src = artwork.src;
    heroImage.alt = artwork.alt;
  }
  const heroLogo = document.querySelector('.post-logo');
  if (heroLogo) {
    heroLogo.src = BLOG_LOGO;
    heroLogo.alt = t('blogLogoAlt');
  }
  updateMediaCopy(meta.category);
}

async function renderPost() {
  ensurePostLayout();
  const params = new URLSearchParams(window.location.search);
  const postParam =
    sanitizePostPath(params.get('post')) || sanitizePostPath(document.body.dataset.blogPost);
  const postContainer = document.querySelector('.post-body');
  const metadataPanel = document.querySelector('.metadata-panel');
  const footer = document.querySelector('.metadata-footer');
  if (!postParam || !postContainer) {
    postContainer.innerHTML = `<div class="empty-state">${t('postNotFound')}</div>`;
    postContainer.removeAttribute('data-i18n');
    if (metadataPanel) metadataPanel.innerHTML = '';
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
      if (metadataPanel) metadataPanel.innerHTML = '';
      if (footer) footer.innerHTML = '';
      return;
    }

    const header = document.querySelector('.post-header h1');
    const meta = document.querySelector('.post-header .blog-meta');
    const breadcrumbCurrent = document.querySelector('.breadcrumb .current');
    const localizedTitle = getLocalizedValue(data, 'title') || data.title;
    const localizedExcerpt = getLocalizedValue(data, 'excerpt') || data.excerpt;
    if (header) {
      header.textContent = localizedTitle;
      header.removeAttribute('data-i18n');
    }
    if (meta) {
      const metaParts = [`${formatDate(data.date)}`, getCategoryLabel(data.category)];
      const readingMinutes = resolveReadingMinutes(data);
      if (readingMinutes) metaParts.push(formatReadingMinutes(readingMinutes));
      meta.textContent = metaParts.filter(Boolean).join(' · ');
    }
    if (breadcrumbCurrent) {
      breadcrumbCurrent.textContent = localizedTitle;
      breadcrumbCurrent.removeAttribute('data-i18n');
    }
    if (localizedTitle) document.title = `${localizedTitle} — ${t('blogHeroEyebrow')}`;
    const artwork = getToneArtwork(data);
    const socialImage = getSocialImage(data);
    const publishedValue = data.date || data.source_published_at;
    const publishedDate = parseDateValue(publishedValue);
    const publishedTime = publishedDate ? publishedDate.toISOString() : '';
    const canonicalUrl = buildCanonicalPostUrl(postParam);
    updateSeoTags({
      title: document.title,
      description: localizedExcerpt,
      image: socialImage,
      type: 'article',
      url: canonicalUrl,
      publishedTime,
    });
    updatePostJsonLd({
      title: localizedTitle,
      description: localizedExcerpt,
      image: socialImage,
      url: canonicalUrl,
      publishedTime,
    });
    updatePostMedia(data);

    const localizedBodies = extractLocalizedBodies(body);
    const selectedBody = localizedBodies[currentLanguage] || localizedBodies.pt || body;
    const cleanedBody = stripMetadataSection(selectedBody);
    const computedMinutes = estimateReadingMinutesFromText(cleanedBody);
    const bodyWordCount = countWords(cleanedBody);
    if (computedMinutes && !data.reading_time) data.reading_time = computedMinutes;
    if (bodyWordCount && !data.body_word_count) data.body_word_count = bodyWordCount;
    const postMeta = document.getElementById('post-meta');
    if (postMeta) {
      const metaParts = [`${formatDate(data.date)}`, getCategoryLabel(data.category)];
      if (data.reading_time) metaParts.push(formatReadingMinutes(data.reading_time));
      postMeta.textContent = metaParts.filter(Boolean).join(' · ');
    }
    postContainer.innerHTML = markdownToHtml(cleanedBody);
    postContainer.removeAttribute('data-i18n');

    if (metadataPanel || footer) renderMetadata(data, metadataPanel || footer);
    const key = normalizePostKey(postParam);
    if (key) {
      persistReadingTimeToCaches(key, data.reading_time, data.body_word_count);
      storeReadingTime(key, data.reading_time, data.body_word_count);
    }
    try {
      const indexPosts = await loadIndexData();
      renderRelatedSection(indexPosts, data, postParam);
      renderPostNav(indexPosts, postParam);
    } catch (loadError) {
      console.warn('Failed to load related posts index', loadError);
    }
    setupShareButtons(data, localizedTitle, canonicalUrl);
  } catch (error) {
    console.error('Failed to load blog post', error);
    postContainer.innerHTML = `<div class="empty-state">${t('postLoadError')}: ${error.message}</div>`;
    postContainer.removeAttribute('data-i18n');
    if (metadataPanel) metadataPanel.innerHTML = '';
    if (footer) footer.innerHTML = '';
  }
}

function ensurePostLayout() {
  const postLayout = document.querySelector('.post-layout');
  if (!postLayout) return;
  let postMain = postLayout.querySelector('.post-main');
  let postBody = postLayout.querySelector('.post-body');
  const meta = document.querySelector('.post-header .blog-meta');
  if (meta && !meta.id) meta.id = 'post-meta';

  if (!postBody) {
    postBody = document.createElement('article');
    postBody.className = 'post-body';
    postBody.dataset.i18n = 'postLoadingBody';
    postBody.textContent = t('postLoadingBody');
  }

  if (!postMain) {
    postMain = document.createElement('div');
    postMain.className = 'post-main';
    postLayout.insertBefore(postMain, postLayout.firstElementChild);
  }

  if (!postMain.contains(postBody)) {
    postMain.insertBefore(postBody, postMain.firstChild);
  }

  let related = document.getElementById('related-posts');
  if (!related) {
    related = document.createElement('section');
    related.className = 'post-related';
    related.id = 'related-posts';
    related.innerHTML = `
      <h3 data-i18n="relatedTitle">${t('relatedTitle')}</h3>
      <div class="related-grid" id="related-grid"></div>
      <div class="post-nav">
        <a class="post-nav-link prev" id="post-nav-prev" href="#" hidden>
          <span class="nav-label" data-i18n="previousPost">${t('previousPost')}</span>
          <span class="nav-title"></span>
        </a>
        <a class="post-nav-link next" id="post-nav-next" href="#" hidden>
          <span class="nav-label" data-i18n="nextPost">${t('nextPost')}</span>
          <span class="nav-title"></span>
        </a>
      </div>
    `;
  }

  if (!postMain.contains(related)) {
    postMain.appendChild(related);
  }
}

async function init() {
  const detected = detectLanguage();
  await setLanguage(detected);
  bindLanguageSelector();
  bindSearch();
  bindNewsletterForm();
  bindCategoryChips();
  renderCurrentView();
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    void init();
  });
}

export {
  sanitizeLinkHref,
  inlineMarkdown,
  buildPostLink,
  parseFrontmatter,
  normalizeCanonicalUrl,
  getLocalizedTags,
};
