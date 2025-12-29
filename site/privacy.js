import './main.js';

const PRIVACY_URL =
  'https://raw.githubusercontent.com/Donotavio/saul_goodman/main/docs/privacy-policy.md';

const prefersNoMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const container = document.querySelector('[data-privacy-article]');
const loadingText = container?.querySelector('[data-i18n="privacyLoading"]');

// Função simples para renderizar Markdown usando marked.js, com fallback se der erro.
const renderPrivacy = async () => {
  if (!container) return;
  try {
    const response = await fetch(PRIVACY_URL, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Erro ao buscar política (${response.status})`);
    const markdown = await response.text();
    const html = marked.parse(markdown);
    container.innerHTML = html;
    container.classList.add('privacy-ready');
  } catch (error) {
    console.error('Falha ao carregar política de privacidade', error);
    container.innerHTML =
      '<p data-i18n="privacyError">Não foi possível carregar a política agora. Tente novamente mais tarde.</p>';
  }
};

document.addEventListener('DOMContentLoaded', () => {
  renderPrivacy();
  if (loadingText && prefersNoMotion) {
    loadingText.style.animation = 'none';
  }
});
