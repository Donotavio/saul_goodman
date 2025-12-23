const scriptUrl = document.currentScript?.src || import.meta.url;
const blogBase = new URL('./', scriptUrl);
const indexUrl = new URL('index.json', blogBase);
const postsBase = new URL('posts/', blogBase);
const CATEGORY_LABELS = {
  'procrastinacao': 'Procrastinação',
  'foco-atencao': 'Foco & Atenção',
  'dev-performance': 'Performance Dev',
  'trabalho-remoto': 'Trabalho Remoto',
};

function getCategoryLabel(value) {
  return CATEGORY_LABELS[value] || value || '';
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
        .map((v) => v.trim())
        .filter(Boolean);
    } else {
      data[key] = value.replace(/^"|"$/g, '');
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
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
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
    container.innerHTML = '<div class="empty-state">Nenhum artigo publicado por aqui ainda.</div>';
    return;
  }

  posts
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .forEach((post) => {
      const card = document.createElement('article');
      card.className = 'blog-card';

      const title = document.createElement('h3');
      title.textContent = post.title;
      card.appendChild(title);

      const meta = document.createElement('div');
      meta.className = 'blog-meta';
      meta.textContent = `${formatDate(post.date)} · ${getCategoryLabel(post.category)}`;
      card.appendChild(meta);

      if (post.excerpt) {
        const excerpt = document.createElement('p');
        excerpt.textContent = post.excerpt;
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
      link.textContent = 'Ler artigo';
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
    if (listContainer) listContainer.innerHTML = `<div class="empty-state">Erro ao carregar blog: ${error.message}</div>`;
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

  add('Categoria', getCategoryLabel(meta.category));
  add('Tags', meta.tags && meta.tags.join(', '));
  add('Fonte', meta.source_title);
  add('URL da fonte', meta.source_url);
  add('Publicado em', meta.source_published_at);

  container.innerHTML = '';
  container.appendChild(dl);
}

function sanitizePostPath(value) {
  if (!value || value.includes('..')) return null;
  return value.replace(/^\//, '');
}

async function renderPost() {
  const params = new URLSearchParams(window.location.search);
  const postParam = sanitizePostPath(params.get('post'));
  const postContainer = document.querySelector('.post-body');
  if (!postParam || !postContainer) {
    postContainer.innerHTML = '<div class="empty-state">Post não encontrado.</div>';
    return;
  }

  try {
    const postUrl = new URL(postParam, postsBase);
    const raw = await fetchText(postUrl);
    const { data, body } = parseFrontmatter(raw);

    if (!data.title || !data.date) {
      postContainer.innerHTML = '<div class="empty-state">Post inválido ou sem metadados.</div>';
      return;
    }

    const header = document.querySelector('.post-header h1');
    const meta = document.querySelector('.post-header .blog-meta');
    const breadcrumbCurrent = document.querySelector('.breadcrumb .current');
    if (header) header.textContent = data.title;
    if (meta) meta.textContent = `${formatDate(data.date)} · ${getCategoryLabel(data.category)}`;
    if (breadcrumbCurrent) breadcrumbCurrent.textContent = data.title;
    if (data.title) document.title = `${data.title} — Blog do Saul`;

    postContainer.innerHTML = markdownToHtml(body);

    const footer = document.querySelector('.metadata-footer');
    if (footer) renderMetadata(data, footer);
  } catch (error) {
    postContainer.innerHTML = `<div class="empty-state">Erro ao carregar este artigo: ${error.message}</div>`;
  }
}

function init() {
  const view = document.body.dataset.blogView;
  if (view === 'post') {
    renderPost();
  } else {
    renderIndex();
  }
}

document.addEventListener('DOMContentLoaded', init);
