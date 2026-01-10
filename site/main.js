import {
  DEFAULT_LANGUAGE,
  SUPPORTED_LANGUAGES,
  RTL_LANGUAGES,
  createI18nContext
} from './shared/i18n.js';

const scriptUrl = typeof document !== 'undefined' && document.currentScript?.src
  ? document.currentScript.src
  : '';
const siteBase = scriptUrl ? new URL('./', scriptUrl) : new URL('./', document.baseURI);

const LOCALES_BASES = [
  new URL('_locales/', siteBase),
  // fallback quando o site é servido a partir de um subdiretório
  new URL('../_locales/', siteBase),
];

// Create i18n context
const i18nContext = createI18nContext(LOCALES_BASES);
const { setLanguage, t } = i18nContext;
const richTextKeys = new Set([
  'feature4Item1',
  'faq2Answer',
  'trustCard1Body',
  'featurePrivacyBody',
  'codeconLead',
]);
const BLOG_PREVIEW_LIMIT = 3;
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
const BLOG_CATEGORY_TONES = {
  'procrastinacao': 'incredulo',
  'foco-atencao': 'like',
  'dev-performance': 'like',
  'trabalho-remoto': 'nao-corte',
};
const BLOG_TONE_ARTWORK = {
  'incredulo': 'assets/saul_incredulo-320.png',
  'like': 'assets/saul_like-320.png',
  'nao-corte': 'assets/saul_nao_corte-320.png',
  'default': 'assets/logotipo_saul_goodman-420.png',
};
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
const runWhenIdle = (task) => {
  if (typeof task !== 'function') return;
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(task, { timeout: 1500 });
    return;
  }
  window.setTimeout(task, 0);
};
const registerServiceWorker = () => {
  if (!('serviceWorker' in navigator)) return;
  const swUrl = new URL('sw.js', document.baseURI).toString();
  navigator.serviceWorker
    .register(swUrl)
    .catch((error) => console.error('Service worker registration failed', error));
};
let blogPreviewPosts = null;
let blogPreviewPromise = null;
let scrollRevealObserver;
let quakeHighlightObserver;
let stickyCtaLastState = false;
const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');


const parseDateValue = (value) => {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const dateOnlyMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnlyMatch) {
    const year = Number(dateOnlyMatch[1]);
    const month = Number(dateOnlyMatch[2]) - 1;
    const day = Number(dateOnlyMatch[3]);
    const date = new Date(year, month, day);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatBlogDate = (value) => {
  const date = parseDateValue(value);
  if (!date) return value;
  const locale = DATE_LOCALE[i18nContext.currentLanguage] || DATE_LOCALE[DEFAULT_LANGUAGE];
  return date.toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' });
};

const getPostSortTime = (post) => {
  const raw = post?.source_published_at || post?.date;
  const parsed = parseDateValue(raw);
  return parsed ? parsed.getTime() : 0;
};

const getLocalizedValue = (data, key) => {
  if (!data) return '';
  if (i18nContext.currentLanguage !== 'pt') {
    const localizedKey = `${key}_${i18nContext.currentLanguage}`;
    if (data[localizedKey]) return data[localizedKey];
  }
  return data[key] || '';
};

const getBlogCategoryLabel = (category) => {
  if (!category) return '';
  const key = BLOG_CATEGORY_LABEL_KEYS[category];
  return key ? t(key) : category;
};

const getBlogArtwork = (post) => {
  const tone = post?.tone || BLOG_CATEGORY_TONES[post?.category] || 'default';
  return BLOG_TONE_ARTWORK[tone] || BLOG_TONE_ARTWORK.default;
};

const buildBlogPostLink = (post) => {
  const path = (post?.markdown || post?.path || '').replace(/^\//, '');
  const blogBase = new URL('blog/', document.baseURI);
  if (path) {
    const normalized = path.replace(/\.md$/, '');
    return new URL(`posts/${normalized}/`, blogBase).toString();
  }
  if (post?.url) {
    return new URL(post.url, blogBase).toString();
  }
  return new URL('index.html', blogBase).toString();
};

const loadBlogPreviewPosts = async () => {
  if (blogPreviewPosts) return blogPreviewPosts;
  if (blogPreviewPromise) return blogPreviewPromise;
  const url = new URL('blog/index.json', document.baseURI).toString();
  blogPreviewPromise = fetch(url, { headers: { Accept: 'application/json' } })
    .then((response) => {
      if (!response.ok) throw new Error(`Falha ao carregar blog (${response.status})`);
      return response.json();
    })
    .then((data) => {
      blogPreviewPosts = Array.isArray(data?.posts) ? data.posts : [];
      return blogPreviewPosts;
    })
    .catch((error) => {
      console.error('Falha ao carregar blog', error);
      throw error;
    })
    .finally(() => {
      blogPreviewPromise = null;
    });
  return blogPreviewPromise;
};

const renderBlogPreview = async () => {
  const container = document.getElementById('blog-preview-list');
  if (!container) return;
  container.innerHTML = '';
  const loadingState = document.createElement('div');
  loadingState.className = 'blog-preview-state';
  loadingState.textContent = t('blogPreviewLoading');
  container.appendChild(loadingState);

  try {
    const posts = await loadBlogPreviewPosts();
    const ordered = [...posts].sort((a, b) => getPostSortTime(b) - getPostSortTime(a));
    const trimmed = ordered.slice(0, BLOG_PREVIEW_LIMIT);
    container.innerHTML = '';
    if (!trimmed.length) {
      const emptyState = document.createElement('div');
      emptyState.className = 'blog-preview-state';
      emptyState.textContent = t('blogPreviewEmpty');
      container.appendChild(emptyState);
      return;
    }

    trimmed.forEach((post) => {
      const card = document.createElement('article');
      card.className = 'blog-preview-card';
      registerRevealTarget(card);

      const image = document.createElement('img');
      image.src = getBlogArtwork(post);
      image.alt = t('blogPreviewImageAlt');
      image.width = 220;
      image.height = 220;
      image.loading = 'lazy';
      image.decoding = 'async';
      const match = image.src.match(/-(\d+)(?=\.png$)/);
      const baseWidth = match ? Number(match[1]) : 220;
      const fallbackImage = match ? image.src.replace(match[0], '') : image.src;
      const fallbackWidth = Math.max(baseWidth * 2, 800);
      image.srcset = match
        ? `${image.src} ${baseWidth}w, ${fallbackImage} ${fallbackWidth}w`
        : `${image.src} ${baseWidth}w`;
      image.sizes = '220px';
      card.appendChild(image);

      const meta = document.createElement('div');
      meta.className = 'blog-preview-meta';
      meta.textContent = `${formatBlogDate(post.date)} · ${getBlogCategoryLabel(post.category)}`;
      card.appendChild(meta);

      const title = document.createElement('h3');
      title.textContent = getLocalizedValue(post, 'title') || post.title || '';
      card.appendChild(title);

      const excerpt = getLocalizedValue(post, 'excerpt') || post.excerpt || '';
      if (excerpt) {
        const excerptEl = document.createElement('p');
        excerptEl.textContent = excerpt;
        card.appendChild(excerptEl);
      }

      const link = document.createElement('a');
      link.className = 'blog-preview-link';
      link.href = buildBlogPostLink(post);
      link.textContent = t('blogPreviewRead');
      card.appendChild(link);

      container.appendChild(card);
    });
  } catch (error) {
    container.innerHTML = '';
    const errorState = document.createElement('div');
    errorState.className = 'blog-preview-state';
    errorState.textContent = t('blogPreviewError');
    container.appendChild(errorState);
  }
};

const createLightbox = () => {
  const backdrop = document.createElement('div');
  backdrop.className = 'lightbox-backdrop';

  const content = document.createElement('div');
  content.className = 'lightbox-content';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'lightbox-close';
  closeBtn.type = 'button';
  closeBtn.dataset.i18n = 'lightboxClose';
  closeBtn.textContent = 'Fechar';

  const img = document.createElement('img');
  img.alt = '';

  const caption = document.createElement('div');
  caption.className = 'lightbox-caption';

  content.appendChild(closeBtn);
  content.appendChild(img);
  content.appendChild(caption);
  backdrop.appendChild(content);

  document.body.appendChild(backdrop);
  return backdrop;
};

let lightbox;
let introAudio;
let introAudioPlayed = false;
let introAudioEventsBound = false;
const introAudioSrc = 'assets/audio/voicy-better-call-saul.aac';
const quakeAudioSrc = 'assets/audio/terremoto-siren.aac';
const heroCrashGlassSrc = 'assets/audio/glass-breaking-sound-effect-240679.aac';
const heroCrashShockSrc = 'assets/audio/49-electroshockwav-46620.aac';
let quakeAudio;
let quakeTimeout;
let quakeOverlay;
let heroIntroDurationMs = 3400;
let heroFallbackDropTimer = 0;
let heroFailTimer = 0;
let heroDropTriggered = false;
let heroLightsStarted = false;
let heroScrollHandlerAttached = false;
const heroMotionQuery = window.matchMedia
  ? window.matchMedia('(max-width: 960px)')
  : { matches: true, addEventListener: () => { }, removeEventListener: () => { } };
let heroBulbs = [];
let heroBulbFailureInterval = 0;
let heroCopyImpactTimeout = 0;
let heroCrashAudio;
let heroShockAudio;
let heroCrashShockTimer = 0;
let heroCrashShockOnGlassEnd = null;
let heroCrashPrimed = false;

const prefersReducedMotion = () => {
  return window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)').matches : false;
};

const getHeroVisual = () => document.querySelector('.hero-visual');
const getHeroSign = () => document.querySelector('.hero-visual .hero-sign');

const applyHeroCrashPosture = () => {
  const hero = document.querySelector('.hero');
  hero?.classList.add('hero-has-crashed');
  const copy = document.querySelector('.hero-copy[data-impact-shake]');
  if (copy) {
    copy.classList.add('hero-copy-shaken');
  }
};

const resetHeroCrashPosture = () => {
  const hero = document.querySelector('.hero');
  hero?.classList.remove('hero-has-crashed');
  const copy = document.querySelector('.hero-copy[data-impact-shake]');
  if (copy) {
    copy.classList.remove('hero-copy-shaken', 'hero-copy-impact');
  }
};

const isHeroAnimationAllowed = () => {
  return !prefersReducedMotion() && !heroMotionQuery.matches && Boolean(getHeroVisual());
};

const setHeroGlowLevel = (value) => {
  const heroVisual = getHeroVisual();
  if (!heroVisual) {
    return;
  }
  const clamped = Math.max(0.05, Math.min(1, value));
  heroVisual.style.setProperty('--hero-glow-intensity', clamped.toFixed(2));
};

const buildHeroBulbs = () => {
  const container = document.querySelector('.hero-sign-bulbs');
  if (!container) {
    heroBulbs = [];
    return;
  }
  container.innerHTML = '';
  heroBulbs = [];
  const insetX = 4;
  const insetY = 3.5;
  const rightX = 100 - insetX;
  const bottomY = 100 - insetY;
  const cornerRadius = 10;
  const addBulb = (x, y) => {
    const bulb = document.createElement('span');
    bulb.className = 'bulb';
    bulb.style.setProperty('--x', x.toFixed(2));
    bulb.style.setProperty('--y', y.toFixed(2));
    bulb.style.setProperty('--bulb-delay', `${Math.random().toFixed(2)}s`);
    container.appendChild(bulb);
    heroBulbs.push(bulb);
  };
  const createLinear = (count, axis) => {
    if (count <= 0) {
      return;
    }
    for (let i = 0; i < count; i++) {
      const ratio = (i + 1) / (count + 1);
      if (axis === 'top') {
        addBulb(insetX + ratio * (rightX - insetX), insetY);
      } else if (axis === 'bottom') {
        addBulb(insetX + ratio * (rightX - insetX), bottomY);
      } else if (axis === 'left') {
        addBulb(insetX, insetY + ratio * (bottomY - insetY));
      } else if (axis === 'right') {
        addBulb(rightX, insetY + ratio * (bottomY - insetY));
      }
    }
  };
  createLinear(10, 'top');
  createLinear(10, 'bottom');
  createLinear(10, 'left');
  createLinear(10, 'right');
  const addCornerBulbs = (cx, cy, startAngle) => {
    const segments = 2;
    for (let i = 1; i <= segments; i++) {
      const angle = startAngle + (i / (segments + 1)) * 90;
      const rad = (angle * Math.PI) / 180;
      const x = cx + cornerRadius * Math.cos(rad);
      const y = cy + cornerRadius * Math.sin(rad);
      addBulb(x, y);
    }
  };
  addCornerBulbs(insetX + cornerRadius, insetY + cornerRadius, 180);
  addCornerBulbs(rightX - cornerRadius, insetY + cornerRadius, 270);
  addCornerBulbs(rightX - cornerRadius, bottomY - cornerRadius, 0);
  addCornerBulbs(insetX + cornerRadius, bottomY - cornerRadius, 90);
};

const resetHeroBulbState = () => {
  heroBulbs.forEach((bulb) => {
    bulb.className = 'bulb';
    bulb.style.setProperty('--bulb-delay', `${Math.random().toFixed(2)}s`);
  });
  setHeroGlowLevel(1);
};

const stopHeroBulbLoop = () => {
  window.clearTimeout(heroBulbFailureInterval);
  heroBulbFailureInterval = 0;
};

const updateHeroGlowFromBulbs = () => {
  if (!heroBulbs.length) {
    setHeroGlowLevel(0.25);
    return;
  }
  const alive = heroBulbs.filter((bulb) => !bulb.classList.contains('bulb-dead')).length;
  const ratio = alive / heroBulbs.length;
  setHeroGlowLevel(0.2 + 0.8 * ratio);
};

const degradeRandomBulb = () => {
  const candidates = heroBulbs.filter((bulb) => !bulb.classList.contains('bulb-dead'));
  if (!candidates.length) {
    return;
  }
  const target = candidates[Math.floor(Math.random() * candidates.length)];
  target.classList.add('bulb-glitch');
  window.setTimeout(() => {
    target.classList.remove('bulb-glitch');
    target.classList.add('bulb-dim');
    updateHeroGlowFromBulbs();
    window.setTimeout(() => {
      if (!target.classList.contains('bulb-dead')) {
        target.classList.add('bulb-dead');
        updateHeroGlowFromBulbs();
      }
    }, 220 + Math.random() * 420);
  }, 140 + Math.random() * 220);
};

const startHeroBulbLoop = () => {
  if (!heroBulbs.length) {
    buildHeroBulbs();
  }
  stopHeroBulbLoop();
  const base = Math.max(240, Math.round(heroIntroDurationMs / Math.max(heroBulbs.length, 1)));
  const schedule = () => {
    if (!heroBulbs.some((bulb) => !bulb.classList.contains('bulb-dead'))) {
      return;
    }
    const jitter = base * (0.6 + Math.random() * 0.7);
    heroBulbFailureInterval = window.setTimeout(() => {
      degradeRandomBulb();
      const alive = heroBulbs.filter((bulb) => !bulb.classList.contains('bulb-dead')).length;
      const ratio = alive / heroBulbs.length || 0;
      const accelerated = base * (0.4 + ratio);
      heroBulbFailureInterval = window.setTimeout(schedule, accelerated * (0.7 + Math.random() * 0.6));
    }, jitter);
  };
  schedule();
};

const killAllBulbs = () => {
  heroBulbs.forEach((bulb) => bulb.classList.add('bulb-dead'));
  updateHeroGlowFromBulbs();
  setHeroGlowLevel(0.2);
};

const triggerHeroCopyImpact = () => {
  const copy = document.querySelector('[data-impact-shake]');
  if (!copy) {
    return;
  }
  copy.classList.remove('hero-copy-impact');
  void copy.offsetWidth;
  copy.classList.add('hero-copy-impact');
  window.clearTimeout(heroCopyImpactTimeout);
  heroCopyImpactTimeout = window.setTimeout(() => {
    const hero = copy.closest('.hero');
    if (hero?.classList.contains('hero-has-crashed')) {
      return;
    }
    copy.classList.remove('hero-copy-impact');
  }, 800);
};

const updateHeroIntroDuration = (seconds) => {
  if (!Number.isFinite(seconds) || seconds <= 0.5) {
    return;
  }
  heroIntroDurationMs = Math.round(seconds * 1000);
  document.documentElement.style.setProperty('--hero-intro-duration', `${seconds}s`);
  resetHeroDropFallback();
};

const resetHeroDropFallback = (delay = Math.max(heroIntroDurationMs + 1200, 6000)) => {
  if (!isHeroAnimationAllowed()) {
    return;
  }
  window.clearTimeout(heroFallbackDropTimer);
  heroFallbackDropTimer = window.setTimeout(() => dropHeroSign('timeout'), delay);
};

const scheduleHeroLightFailure = () => {
  window.clearTimeout(heroFailTimer);
  if (!isHeroAnimationAllowed()) {
    return;
  }
  heroFailTimer = window.setTimeout(() => {
    const heroVisual = getHeroVisual();
    heroVisual?.classList.add('is-failing');
  }, Math.max(1200, heroIntroDurationMs * 0.65));
};

const startHeroLights = () => {
  if (heroLightsStarted || !isHeroAnimationAllowed()) {
    return;
  }
  const heroVisual = getHeroVisual();
  if (!heroVisual) {
    return;
  }
  heroLightsStarted = true;
  resetHeroBulbState();
  startHeroBulbLoop();
  heroVisual.classList.remove('is-static', 'is-crashed');
  heroVisual.classList.add('is-lit');
  scheduleHeroLightFailure();
  resetHeroDropFallback();
};

const handleHeroScrollDrop = () => {
  dropHeroSign('scroll');
};

const armHeroScrollDrop = () => {
  if (heroScrollHandlerAttached || !isHeroAnimationAllowed()) {
    return;
  }
  heroScrollHandlerAttached = true;
  window.addEventListener('scroll', handleHeroScrollDrop, { once: true, passive: true });
};

const dropHeroSign = (reason = 'manual') => {
  const heroVisual = getHeroVisual();
  const heroSign = getHeroSign();
  if (!heroVisual || !heroSign) {
    return;
  }
  stopHeroBulbLoop();
  window.clearTimeout(heroFailTimer);
  window.clearTimeout(heroFallbackDropTimer);
  if (!isHeroAnimationAllowed()) {
    heroScrollHandlerAttached = false;
    heroVisual.classList.add('is-crashed', 'is-static');
    killAllBulbs();
    return;
  }
  if (heroDropTriggered) {
    return;
  }
  heroDropTriggered = true;
  heroScrollHandlerAttached = false;
  heroVisual.classList.remove('is-lit');
  heroVisual.classList.add('is-failing', 'is-dropping');
  stopHeroCrashSounds();
  const onDropEnd = (event) => {
    if (event.target !== heroSign || event.animationName !== 'heroSignDrop') {
      return;
    }
    heroSign.removeEventListener('animationend', onDropEnd);
    heroVisual.classList.remove('is-dropping', 'is-swinging');
    heroVisual.classList.add('is-crashed');
    triggerHeroCopyImpact();
    killAllBulbs();
    applyHeroCrashPosture();
    playHeroCrashSequence();
  };
  heroSign.addEventListener('animationend', onDropEnd);
};

const initHeroSign = () => {
  const heroVisual = getHeroVisual();
  stopHeroBulbLoop();
  if (!heroVisual) {
    return;
  }
  resetHeroCrashPosture();
  heroVisual.classList.remove('is-crashed', 'is-dropping', 'is-lit', 'is-failing', 'is-static', 'is-swinging');
  const copy = document.querySelector('[data-impact-shake]');
  copy?.classList.remove('hero-copy-impact');
  heroDropTriggered = false;
  heroLightsStarted = false;
  window.clearTimeout(heroFailTimer);
  window.clearTimeout(heroFallbackDropTimer);
  stopHeroCrashSounds();
  if (!isHeroAnimationAllowed()) {
    heroScrollHandlerAttached = false;
    heroVisual.classList.add('is-crashed', 'is-static');
    setHeroGlowLevel(0.35);
    heroBulbs = [];
    return;
  }
  buildHeroBulbs();
  resetHeroBulbState();
  armHeroScrollDrop();
  resetHeroDropFallback();
  window.setTimeout(() => {
    if (!heroLightsStarted) {
      startHeroLights();
    }
  }, 900);
};

const setupLightbox = () => {
  const resolvePreviewSrc = (rawSrc) => {
    if (!rawSrc) return null;
    try {
      const url = new URL(rawSrc, window.location.href);
      const allowedProtocols = ['http:', 'https:'];
      const allowedPaths = ['/assets/', 'assets/'];
      if (!allowedProtocols.includes(url.protocol)) return null;
      if (!allowedPaths.some((prefix) => url.pathname.startsWith(prefix))) return null;
      return url.href;
    } catch {
      return null;
    }
  };

  lightbox = createLightbox();
  const imgEl = lightbox.querySelector('img');
  const captionEl = lightbox.querySelector('.lightbox-caption');
  const closeBtn = lightbox.querySelector('.lightbox-close');

  const close = () => lightbox.classList.remove('active');

  closeBtn.addEventListener('click', close);
  lightbox.addEventListener('click', (event) => {
    if (event.target === lightbox) {
      close();
    }
  });
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close();
  });

  document.querySelectorAll('.demo-actions a[data-preview]').forEach((link) => {
    link.addEventListener('click', (event) => {
      if (event.metaKey || event.ctrlKey) return; // allow open in new tab
      event.preventDefault();
      const src = link.getAttribute('data-preview');
      const caption = link.closest('.demo-figure')?.querySelector('figcaption')?.textContent || '';
      const safeSrc = resolvePreviewSrc(src);
      if (safeSrc) {
        imgEl.src = safeSrc;
        captionEl.textContent = caption;
        lightbox.classList.add('active');
      }
    });
  });
};

const rotateCarousel = (carousel, delta) => {
  const slides = Array.from(carousel.querySelectorAll('.demo-figure'));
  if (!slides.length) return;
  let currentIndex = slides.findIndex((el) => el.classList.contains('active'));
  if (currentIndex < 0) currentIndex = 0;
  const nextIndex = (currentIndex + delta + slides.length) % slides.length;
  slides.forEach((slide, idx) => slide.classList.toggle('active', idx === nextIndex));
  updateCarouselPreview(carousel);
};

const setupCarousels = () => {
  document.querySelectorAll('[data-carousel]').forEach((carousel) => {
    const slides = Array.from(carousel.querySelectorAll('.demo-figure'));
    if (!slides.length) return;
    if (!slides.some((slide) => slide.classList.contains('active'))) {
      slides[0].classList.add('active');
    }
    updateCarouselPreview(carousel);
  });

  document.addEventListener('click', (event) => {
    const btn = event.target.closest('.carousel-btn');
    if (!btn) return;
    const carousel = btn.closest('[data-carousel]');
    if (!carousel) return;
    event.preventDefault();
    const delta = btn.getAttribute('data-action') === 'next' ? 1 : -1;
    rotateCarousel(carousel, delta);
  });
};

const normalizeLanguage = (value) => {
  if (!value || typeof value !== 'string') return DEFAULT_LANGUAGE;
  const normalized = value.toLowerCase();
  if (normalized.startsWith('pt')) return 'pt';
  if (normalized.startsWith('en')) return 'en';
  if (normalized.startsWith('es')) return 'es';
  if (normalized.startsWith('fr')) return 'fr';
  if (normalized.startsWith('de')) return 'de';
  if (normalized.startsWith('it')) return 'it';
  if (normalized.startsWith('tr')) return 'tr';
  if (normalized.startsWith('zh')) return 'zh';
  if (normalized.startsWith('hi')) return 'hi';
  if (normalized.startsWith('ar')) return 'ar';
  if (normalized.startsWith('bn')) return 'bn';
  if (normalized.startsWith('ru')) return 'ru';
  if (normalized.startsWith('ur')) return 'ur';
  return DEFAULT_LANGUAGE;
};

const setMetaContent = (selector, value) => {
  if (!value) return;
  const element = document.querySelector(selector);
  if (!element) return;
  element.setAttribute('content', value);
};

const getHtmlLang = (lang) => {
  if (lang === 'pt') return 'pt-BR';
  if (lang === 'es') return 'es-419';
  if (lang === 'zh') return 'zh-CN';
  return lang;
};

const getLanguageLabel = (lang) => {
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
  return labels[lang] || String(lang || '').toUpperCase();
};

const ensureLanguageSelectorOptions = () => {
  const selector = document.getElementById('language-select');
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
};

const updateSiteSeo = () => {
  const seoTitle = i18nContext.currentMessages.seoTitle || i18nContext.fallbackMessages.seoTitle;
  const seoDescription = i18nContext.currentMessages.seoDescription || i18nContext.fallbackMessages.seoDescription;
  if (seoTitle) {
    document.title = seoTitle;
    setMetaContent('meta[property="og:title"]', seoTitle);
    setMetaContent('meta[name="twitter:title"]', seoTitle);
  }
  if (seoDescription) {
    setMetaContent('meta[name="description"]', seoDescription);
    setMetaContent('meta[property="og:description"]', seoDescription);
    setMetaContent('meta[name="twitter:description"]', seoDescription);
  }
};

const applyTranslations = () => {
  updateSiteSeo();
  document.documentElement.lang = getHtmlLang(i18nContext.currentLanguage);
  document.documentElement.dir = RTL_LANGUAGES.has(i18nContext.currentLanguage) ? 'rtl' : 'ltr';
  ensureLanguageSelectorOptions();

  document.querySelectorAll('[data-i18n]').forEach((element) => {
    const key = element.getAttribute('data-i18n');
    if (!key) return;
    const text = i18nContext.currentMessages[key] || i18nContext.fallbackMessages[key];
    if (!text) return;
    if (richTextKeys.has(key)) {
      element.innerHTML = text;
    } else {
      element.textContent = text;
    }
  });

  document.querySelectorAll('[data-i18n-alt]').forEach((element) => {
    const key = element.getAttribute('data-i18n-alt');
    if (!key) return;
    const text = i18nContext.currentMessages[key] || i18nContext.fallbackMessages[key];
    if (!text) return;
    element.setAttribute('alt', text);
  });

  const selector = document.getElementById('language-select');
  if (selector && selector.value !== i18nContext.currentLanguage) {
    selector.value = i18nContext.currentLanguage;
  }
  if (selector) {
    const aria = i18nContext.currentMessages.languageLabel || i18nContext.fallbackMessages.languageLabel;
    if (aria) selector.setAttribute('aria-label', aria);
  }

  const lightboxClose = document.querySelector('.lightbox-close');
  const lightboxLabel = i18nContext.currentMessages.lightboxClose || i18nContext.fallbackMessages.lightboxClose;
  if (lightboxClose && lightboxLabel) {
    lightboxClose.textContent = lightboxLabel;
  }

  const updateShieldBadgeLabel = (img, labelKey) => {
    if (!img?.getAttribute) return;
    const label = i18nContext.currentMessages[labelKey] || i18nContext.fallbackMessages[labelKey];
    if (!label) return;
    const src = img.getAttribute('src');
    if (!src) return;
    try {
      const url = new URL(src);
      url.searchParams.set('label', label);
      img.setAttribute('src', url.toString());
    } catch {
      // ignore invalid URLs
    }
  };

  const ratingBadge = document.querySelector('img[data-i18n-alt="ratingBadgeAlt"]');
  updateShieldBadgeLabel(ratingBadge, 'ratingBadgeLabel');
  const usersBadge = document.querySelector('img[data-i18n-alt="usersBadgeAlt"]');
  updateShieldBadgeLabel(usersBadge, 'usersBadgeLabel');
};

const detectLanguage = () => {
  const stored = localStorage.getItem('saul-language');
  if (stored) {
    const normalized = normalizeLanguage(stored);
    return SUPPORTED_LANGUAGES.includes(normalized) ? normalized : DEFAULT_LANGUAGE;
  }
  const first = (navigator.languages && navigator.languages[0]) || navigator.language || '';
  const fromNavigator = normalizeLanguage(first);
  return SUPPORTED_LANGUAGES.includes(fromNavigator) ? fromNavigator : DEFAULT_LANGUAGE;
};

const LANGUAGE_CHANGED_EVENT = 'saul-language-changed';

const bindLanguageSelector = () => {
  const selector = document.getElementById('language-select');
  if (!selector) return;
  selector.addEventListener('change', (event) => {
    const value = normalizeLanguage(event.target.value);
    localStorage.setItem('saul-language', value);
    void setLanguage(value).then(() => {
      applyTranslations();
      renderBlogPreview();
      document.dispatchEvent(new CustomEvent(LANGUAGE_CHANGED_EVENT, { detail: value }));
    });
  });
};

const setupCounters = () => {
  const legacyCounters = document.querySelectorAll('[data-counter]');
  const newCounters = document.querySelectorAll('[data-count]');
  if (!legacyCounters.length && !newCounters.length) return;
  const observer = new IntersectionObserver(
    (entries, obs) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        const isLegacy = el.hasAttribute('data-counter');
        const targetAttr = isLegacy ? 'data-counter' : 'data-count';
        const target = Number(el.getAttribute(targetAttr)) || 0;
        let count = 0;
        if (el.dataset.counted === 'true') return;
        el.dataset.counted = 'true';
        if (!isLegacy && motionPreference.matches) {
          el.textContent = target.toLocaleString();
          return;
        }
        const duration = isLegacy ? 40 : 1500;
        const step = isLegacy ? Math.max(1, Math.floor(target / 40)) : null;
        let startTime = null;
        const update = () => {
          count += step;
          if (count >= target) {
            el.textContent = target.toString();
            return false;
          }
          el.textContent = count.toString();
          return true;
        };
        if (isLegacy) {
          const interval = setInterval(() => {
            if (!update()) clearInterval(interval);
          }, duration);
        } else {
          const animate = (timestamp) => {
            if (!startTime) startTime = timestamp;
            const progress = Math.min((timestamp - startTime) / duration, 1);
            const currentValue = Math.floor(progress * target);
            el.textContent = currentValue.toLocaleString();
            if (progress < 1) {
              window.requestAnimationFrame(animate);
            }
          };
          window.requestAnimationFrame(animate);
        }
        obs.unobserve(el);
      });
    },
    { threshold: 0.5 }
  );
  legacyCounters.forEach((counter) => observer.observe(counter));
  newCounters.forEach((counter) => observer.observe(counter));
};

const setupIntroAudio = () => {
  if (!introAudio) {
    introAudio = new Audio(introAudioSrc);
    introAudio.preload = 'auto';
    introAudio.volume = 0.85;
  }

  if (introAudio && !introAudioEventsBound) {
    introAudioEventsBound = true;
    introAudio.addEventListener('loadedmetadata', () => {
      if (introAudio?.duration) {
        updateHeroIntroDuration(introAudio.duration);
      }
    });
    introAudio.addEventListener(
      'play',
      () => {
        if (introAudio?.duration) {
          updateHeroIntroDuration(introAudio.duration);
        }
        startHeroLights();
        resetHeroDropFallback();
      },
      { once: true }
    );
    introAudio.addEventListener('ended', () => {
      dropHeroSign('audio-ended');
    });
  }

  const tryPlay = () => {
    if (introAudioPlayed || !introAudio) return Promise.resolve();
    const playPromise = introAudio.play();
    if (playPromise && typeof playPromise.then === 'function') {
      return playPromise
        .then(() => {
          introAudioPlayed = true;
        })
        .catch(() => Promise.reject());
    }
    introAudioPlayed = true;
    return Promise.resolve();
  };

  const armOnFirstInteraction = () => {
    const handler = () => {
      tryPlay()
        .then(() => primeHeroCrashAudio())
        .catch(() => primeHeroCrashAudio())
        .finally(() => {
          document.removeEventListener('pointerdown', handler);
          document.removeEventListener('keydown', handler);
          document.removeEventListener('touchstart', handler);
        });
    };
    document.addEventListener('pointerdown', handler, { once: true });
    document.addEventListener('keydown', handler, { once: true });
    document.addEventListener('touchstart', handler, { once: true });
  };

  tryPlay()
    .then(() => primeHeroCrashAudio())
    .catch(() => {
      primeHeroCrashAudio();
      armOnFirstInteraction();
    });
};

const ensureQuakeAudio = () => {
  if (!quakeAudio) {
    quakeAudio = new Audio(quakeAudioSrc);
    quakeAudio.preload = 'auto';
    quakeAudio.volume = 0.9;
  }
  return quakeAudio;
};

const ensureHeroCrashAudio = () => {
  if (!heroCrashAudio) {
    heroCrashAudio = new Audio(heroCrashGlassSrc);
    heroCrashAudio.preload = 'auto';
    heroCrashAudio.volume = 0.95;
  }
  return heroCrashAudio;
};

const ensureHeroShockAudio = () => {
  if (!heroShockAudio) {
    heroShockAudio = new Audio(heroCrashShockSrc);
    heroShockAudio.preload = 'auto';
    heroShockAudio.volume = 0.7;
  }
  return heroShockAudio;
};

const stopHeroCrashSounds = () => {
  if (heroCrashAudio) {
    heroCrashAudio.pause();
    heroCrashAudio.currentTime = 0;
  }
  if (heroShockAudio) {
    heroShockAudio.pause();
    heroShockAudio.currentTime = 0;
  }
  if (heroCrashAudio && heroCrashShockOnGlassEnd) {
    heroCrashAudio.removeEventListener('ended', heroCrashShockOnGlassEnd);
    heroCrashShockOnGlassEnd = null;
  }
  if (heroCrashShockTimer) {
    window.clearTimeout(heroCrashShockTimer);
    heroCrashShockTimer = 0;
  }
};

const playHeroCrashSequence = () => {
  if (prefersReducedMotion()) {
    return;
  }
  const glass = ensureHeroCrashAudio();
  const shock = ensureHeroShockAudio();
  if (!glass || !shock) {
    return;
  }

  stopHeroCrashSounds();

  const triggerShock = () => {
    if (heroCrashAudio && heroCrashShockOnGlassEnd) {
      heroCrashAudio.removeEventListener('ended', heroCrashShockOnGlassEnd);
      heroCrashShockOnGlassEnd = null;
    }
    if (heroCrashShockTimer) {
      window.clearTimeout(heroCrashShockTimer);
      heroCrashShockTimer = 0;
    }
    shock.currentTime = 0;
    shock.play().catch(() => { });
  };

  heroCrashShockOnGlassEnd = () => {
    triggerShock();
  };
  glass.addEventListener('ended', heroCrashShockOnGlassEnd);

  if (heroCrashShockTimer) {
    window.clearTimeout(heroCrashShockTimer);
  }
  const fallbackDelay =
    glass.readyState >= HTMLMediaElement.HAVE_METADATA && Number.isFinite(glass.duration) && glass.duration > 0
      ? Math.max(glass.duration * 1000 + 100, 400)
      : 2500;
  heroCrashShockTimer = window.setTimeout(() => {
    triggerShock();
  }, fallbackDelay);

  glass.currentTime = 0;
  glass
    .play()
    .catch(() => {
      triggerShock();
    });
};

const createQuakeOverlay = () => {
  const overlay = document.createElement('div');
  overlay.className = 'quake-overlay';
  overlay.innerHTML = `
    <div class="quake-card">
      <p class="quake-title" data-i18n="quakeOverlayTitle">Modo terremoto acionado!</p>
      <p class="quake-copy" data-i18n="quakeOverlayBody">Saul está derrubando as abas vilãs. Volte ao foco antes que ele cobre honorários.</p>
      <button type="button" class="quake-close" data-i18n="quakeOverlayClose">Voltar ao foco</button>
    </div>
  `;
  document.body.appendChild(overlay);
  return overlay;
};

const stopQuakeDemo = () => {
  document.body.classList.remove('quake-active');
  if (quakeOverlay) {
    quakeOverlay.classList.remove('active');
  }
  if (quakeAudio) {
    quakeAudio.pause();
    quakeAudio.currentTime = 0;
  }
  if (quakeTimeout) {
    clearTimeout(quakeTimeout);
    quakeTimeout = null;
  }
};

const startQuakeDemo = () => {
  if (!quakeOverlay) {
    quakeOverlay = createQuakeOverlay();
  }
  quakeOverlay.classList.add('active');
  document.body.classList.add('quake-active');

  const closeBtn = quakeOverlay.querySelector('.quake-close');
  const overlayClick = (event) => {
    if (event.target === quakeOverlay) {
      stopQuakeDemo();
    }
  };
  quakeOverlay.addEventListener('click', overlayClick, { once: true });
  closeBtn?.addEventListener('click', stopQuakeDemo, { once: true });

  const audio = ensureQuakeAudio();
  if (audio) {
    audio.currentTime = 0;
    audio.play().catch(() => { });
  }
  if (quakeTimeout) clearTimeout(quakeTimeout);
  quakeTimeout = setTimeout(stopQuakeDemo, 5000);
};

const setupHeroAnimation = () => {
  const hero = document.querySelector('.hero-visual');
  if (!hero || window.matchMedia('(max-width: 768px)').matches) return;
  hero.style.backgroundPosition = 'center 0px';
  let ticking = false;
  const updatePosition = () => {
    hero.style.backgroundPosition = `center ${window.scrollY * 0.25}px`;
    ticking = false;
  };
  window.addEventListener(
    'scroll',
    () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(updatePosition);
    },
    { passive: true }
  );
};

const setupParallax = () => {
  const hero = document.querySelector('.hero');
  if (hero && !window.matchMedia('(max-width: 768px)').matches) {
    hero.style.backgroundPosition = 'center 0px';
    let ticking = false;
    const updatePosition = () => {
      hero.style.backgroundPosition = `center ${window.scrollY * 0.25}px`;
      ticking = false;
    };
    window.addEventListener(
      'scroll',
      () => {
        if (ticking) return;
        ticking = true;
        window.requestAnimationFrame(updatePosition);
      },
      { passive: true }
    );
  }
};

const setupSectionParallax = () => {
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const mobileQuery = window.matchMedia('(max-width: 768px)');
  if (motionQuery.matches || mobileQuery.matches) return;
  const sections = Array.from(document.querySelectorAll('[data-parallax]'));
  if (!sections.length) return;
  const update = () => {
    sections.forEach((section) => {
      const top = section.getBoundingClientRect().top;
      section.style.setProperty('--parallax-offset', `${top * 0.08}px`);
    });
  };
  update();
  window.addEventListener('scroll', update, { passive: true });
};

const setupScrollReveal = () => {
  const elements = document.querySelectorAll('[data-reveal]');
  if (!('IntersectionObserver' in window)) {
    elements.forEach((element) => element.classList.add('is-visible'));
    return;
  }
  if (scrollRevealObserver) {
    scrollRevealObserver.disconnect();
  }
  scrollRevealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        scrollRevealObserver.unobserve(entry.target);
      });
    },
    { threshold: 0.25, rootMargin: '0px 0px -10% 0px' }
  );
  elements.forEach((element) => scrollRevealObserver.observe(element));
};

const registerRevealTarget = (element) => {
  if (!element) return;
  if (!element.hasAttribute('data-reveal')) {
    element.setAttribute('data-reveal', '');
  }
  if (scrollRevealObserver) {
    scrollRevealObserver.observe(element);
  } else {
    element.classList.add('is-visible');
  }
};

// Anima o gauge para explicar visualmente o índice de procrastinação mesmo sem dados reais.
const setupGauges = () => {
  const gauges = document.querySelectorAll('[data-gauge]');
  if (!gauges.length) return;
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const animateGauge = (gauge) => {
    if (gauge.dataset.gaugeStarted === 'true') return;
    gauge.dataset.gaugeStarted = 'true';
    const fill = gauge.querySelector('[data-gauge-fill]');
    const value = gauge.querySelector('[data-gauge-value]');
    const bar = gauge.querySelector('[role=\"progressbar\"]');
    const target = Number(gauge.dataset.gaugeTarget) || 72;
    if (!fill || !value || !bar) return;
    if (motionQuery.matches) {
      fill.style.width = `${target}%`;
      value.textContent = `${target}%`;
      bar.setAttribute('aria-valuenow', String(target));
      return;
    }
    const duration = 2200;
    let startTime = null;
    const step = (timestamp) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      const currentValue = Math.round(progress * target);
      fill.style.width = `${currentValue}%`;
      value.textContent = `${currentValue}%`;
      bar.setAttribute('aria-valuenow', String(currentValue));
      gauge.setAttribute('data-gauge-state', currentValue >= 70 ? 'alert' : 'focus');
      if (progress < 1) {
        window.requestAnimationFrame(step);
      }
    };
    window.requestAnimationFrame(step);
  };
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          animateGauge(entry.target);
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.45 }
    );
    gauges.forEach((gauge) => observer.observe(gauge));
  } else {
    gauges.forEach((gauge) => animateGauge(gauge));
  }
};

// Carrossel horizontal destaca cada feature sem exigir rolagem longa.
const setupFeatureCarousel = () => {
  document.querySelectorAll('[data-feature-carousel]').forEach((carousel) => {
    const track = carousel.querySelector('.feature-track');
    const cards = carousel.querySelectorAll('[data-feature-card]');
    const prev = carousel.querySelector('[data-action="prev"]');
    const next = carousel.querySelector('[data-action="next"]');
    if (!track || !cards.length) return;
    const scrollByCard = (direction) => {
      const cardWidth = cards[0].offsetWidth || 320;
      track.scrollBy({ left: direction * (cardWidth + 18), behavior: 'smooth' });
    };
    prev?.addEventListener('click', () => scrollByCard(-1));
    next?.addEventListener('click', () => scrollByCard(1));
  });
};

// Micro interação que chacoalha o card do modo terremoto e antecipa a experiência dramática.
const setupQuakeTilt = () => {
  document.querySelectorAll('[data-quake-tilt]').forEach((card) => {
    const toggle = (state) => card.classList.toggle('is-shaking', state);
    card.addEventListener('pointerenter', () => toggle(true));
    card.addEventListener('pointerleave', () => toggle(false));
    card.addEventListener('focusin', () => toggle(true));
    card.addEventListener('focusout', () => toggle(false));
  });
};

// Slider cíclico mantém depoimentos em movimento sem poluir o layout.
const setupTestimonials = () => {
  const slider = document.querySelector('[data-testimonials]');
  if (!slider) return;
  const cards = slider.querySelectorAll('[data-testimonial]');
  const prev = slider.querySelector('[data-action="prev"]');
  const next = slider.querySelector('[data-action="next"]');
  if (!cards.length) return;
  let index = 0;
  let timer;
  const setActive = (idx) => {
    index = (idx + cards.length) % cards.length;
    cards.forEach((card, cardIndex) => {
      card.classList.toggle('is-active', cardIndex === index);
    });
  };
  const startAutoRotate = () => {
    stopAutoRotate();
    timer = window.setInterval(() => setActive(index + 1), 6000);
  };
  const stopAutoRotate = () => {
    if (timer) {
      window.clearInterval(timer);
      timer = null;
    }
  };
  prev?.addEventListener('click', () => setActive(index - 1));
  next?.addEventListener('click', () => setActive(index + 1));
  slider.addEventListener('pointerenter', stopAutoRotate);
  slider.addEventListener('pointerleave', startAutoRotate);
  setActive(0);
  startAutoRotate();
};

// Barra fixa garante CTA sempre acessível e recolhível em telas pequenas.
const setupStickyCta = () => {
  const bar = document.querySelector('[data-sticky-cta]');
  if (!bar) return;
  const toggleBtn = bar.querySelector('[data-sticky-toggle]');
  const hero = document.querySelector('.hero');
  let collapsed = false;
  if (window.matchMedia('(max-width: 640px)').matches) {
    collapsed = true;
    bar.classList.add('is-collapsed');
    toggleBtn?.setAttribute('aria-expanded', 'false');
  } else {
    toggleBtn?.setAttribute('aria-expanded', 'true');
  }
  const evaluateVisibility = () => {
    const heroHeight = hero?.offsetHeight || 520;
    const shouldShow = window.scrollY > heroHeight * 0.7;
    bar.classList.toggle('is-visible', shouldShow);
  };
  const syncAria = () => toggleBtn?.setAttribute('aria-expanded', (!collapsed).toString());
  toggleBtn?.addEventListener('click', () => {
    collapsed = !collapsed;
    bar.classList.toggle('is-collapsed', collapsed);
    syncAria();
  });
  window.addEventListener('scroll', evaluateVisibility, { passive: true });
  evaluateVisibility();
  syncAria();
};

// Ajusta cor da sticky CTA ao rolar para reforçar urgência
const setupStickyColorToggle = () => {
  const bar = document.querySelector('[data-sticky-cta]');
  if (!bar) return;
  const onScroll = () => {
    const shouldActive = window.scrollY > 560;
    if (shouldActive === stickyCtaLastState) return;
    stickyCtaLastState = shouldActive;
    bar.classList.toggle('sticky-active', shouldActive);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
};

const setupQuakeHighlight = () => {
  const section = document.querySelector('[data-quake-section]');
  if (!section) return;
  if (!('IntersectionObserver' in window)) {
    section.classList.add('is-quaking');
    return;
  }
  if (quakeHighlightObserver) {
    quakeHighlightObserver.disconnect();
  }
  quakeHighlightObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-quaking');
        window.setTimeout(() => entry.target.classList.remove('is-quaking'), 1400);
      });
    },
    { threshold: 0.5 }
  );
  quakeHighlightObserver.observe(section);
};

window.addEventListener('DOMContentLoaded', () => {
  void (async () => {
    const isDocumentPage = document.body?.classList.contains('document-page');
    await setLanguage(detectLanguage());
    applyTranslations();
    bindLanguageSelector();
    setupScrollReveal();

    if (isDocumentPage) {
      return;
    }

    initHeroSign();
    setupLightbox();
    setupMobileMenu();
    setupGauges();
    setupFeatureCarousel();
    setupQuakeTilt();
    setupTestimonials();
    setupStickyCta();
    setupStickyColorToggle();
    setupQuakeHighlight();
    runWhenIdle(() => {
      renderBlogPreview();
      setupCarousels();
      setupCounters();
      setupParallax();
      setupSectionParallax();
      setupIntroAudio();
      registerServiceWorker();
    });
    document.addEventListener('click', (event) => {
      const trigger = event.target.closest('[data-quake-trigger]');
      if (trigger) {
        event.preventDefault();
        startQuakeDemo();
      }
    });
    const handleHeroMediaChange = () => {
      initHeroSign();
    };
    if (typeof heroMotionQuery?.addEventListener === 'function') {
      heroMotionQuery.addEventListener('change', handleHeroMediaChange);
    } else if (typeof heroMotionQuery?.addListener === 'function') {
      heroMotionQuery.addListener(handleHeroMediaChange);
    }
  })();
});
const updateCarouselPreview = (carousel) => {
  const slides = Array.from(carousel.querySelectorAll('.demo-figure'));
  if (!slides.length) return;
  const previewLink = carousel.querySelector('.demo-preview');
  const currentIndex = slides.findIndex((el) => el.classList.contains('active'));
  const activeSlide = slides[currentIndex >= 0 ? currentIndex : 0];
  const src = activeSlide?.getAttribute('data-src') || activeSlide?.querySelector('img')?.getAttribute('src');
  if (src && previewLink) {
    previewLink.dataset.preview = src;
    previewLink.href = src;
  }
};
// Menu mobile abre/fecha para evitar que os links tomem toda a largura no smartphone.
const setupMobileMenu = () => {
  const toggle = document.querySelector('.menu-toggle');
  const menu = document.getElementById('mobile-menu');
  if (!toggle || !menu) return;
  toggle.addEventListener('click', () => {
    const isOpen = menu.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', isOpen.toString());
  });
};
