import './main.js';

const CHANGELOG_URL =
  'https://raw.githubusercontent.com/Donotavio/saul_goodman/main/CHANGELOG.md';

const container = document.querySelector('[data-changelog-article]');
const loadingText = container?.querySelector('[data-i18n="changelogLoading"]');
const prefersNoMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const renderChangelog = async () => {
  if (!container) return;
  try {
    const response = await fetch(CHANGELOG_URL, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Erro ao buscar changelog (${response.status})`);
    const markdown = await response.text();
    const html = marked.parse(markdown);
    container.innerHTML = html;
    container.classList.add('document-ready');
  } catch (error) {
    console.error('Falha ao carregar changelog', error);
    container.innerHTML =
      '<p data-i18n="changelogError">Não foi possível carregar o changelog agora. Tente novamente mais tarde.</p>';
  }
};

document.addEventListener('DOMContentLoaded', () => {
  renderChangelog();
  if (loadingText && prefersNoMotion) {
    loadingText.style.animation = 'none';
  }
});
