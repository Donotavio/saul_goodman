import './main.js';

const PRIVACY_URL =
  'https://raw.githubusercontent.com/Donotavio/saul_goodman/main/docs/privacy-policy.md';

const prefersNoMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const container = document.querySelector('[data-privacy-article]');
const loadingText = container?.querySelector('[data-i18n="privacyLoading"]');
const FALLBACK_LANG = 'pt';
const LANGUAGE_CHANGED_EVENT = 'saul-language-changed';

const sanitizeHtml = (html) => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  doc.querySelectorAll('script, style').forEach((el) => el.remove());
  doc.querySelectorAll('*').forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      const value = attr.value || '';
      if (name.startsWith('on')) {
        el.removeAttribute(attr.name);
        continue;
      }
      if ((name === 'href' || name === 'src') && value.trim().toLowerCase().startsWith('javascript:')) {
        el.removeAttribute(attr.name);
      }
    }
  });
  return doc.body.innerHTML;
};

const resolveLanguage = (value) => {
  if (!value) return null;
  const normalized = value.toLowerCase();
  if (normalized.startsWith('en')) return 'en';
  if (normalized.startsWith('es')) return 'es';
  if (normalized.startsWith('pt')) return 'pt';
  return null;
};

const getDocumentLanguage = () => {
  const stored = resolveLanguage(localStorage.getItem('saul-language'));
  if (stored) return stored;
  const attr = resolveLanguage(document.documentElement.lang);
  return attr || FALLBACK_LANG;
};

const extractLocalizedMarkdown = (markdown, lang) => {
  const pattern = new RegExp(`<!--lang:${lang}-->[\\s\\S]*?(?=<!--lang:|$)`, 'i');
  const match = markdown.match(pattern);
  if (match) {
    return match[0].replace(new RegExp(`<!--lang:${lang}-->`, 'i'), '').trim();
  }
  if (lang !== FALLBACK_LANG) {
    return extractLocalizedMarkdown(markdown, FALLBACK_LANG);
  }
  return markdown;
};

const renderPrivacy = async () => {
  if (!container) return;
  try {
    const response = await fetch(PRIVACY_URL, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Erro ao buscar política (${response.status})`);
    const markdown = await response.text();
    const localized = extractLocalizedMarkdown(markdown, getDocumentLanguage());
    const html = marked.parse(localized);
    container.innerHTML = sanitizeHtml(html);
    container.classList.add('document-ready');
  } catch (error) {
    console.error('Falha ao carregar política de privacidade', error);
    container.innerHTML =
      '<p data-i18n="privacyError">Não foi possível carregar a política agora. Tente novamente mais tarde.</p>';
  }
};

const handleLanguageChange = () => renderPrivacy();

document.addEventListener('DOMContentLoaded', () => {
  renderPrivacy();
  if (loadingText && prefersNoMotion) {
    loadingText.style.animation = 'none';
  }
  document.addEventListener(LANGUAGE_CHANGED_EVENT, handleLanguageChange);
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    renderPrivacy();
  }
});
