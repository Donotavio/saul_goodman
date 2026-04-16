---
globs: site/**
---

# Site & Blog Rules

## Estrutura
- Static site com service worker (`sw.js`)
- Blog posts: `site/blog/posts/YYYY/MM-DD-slug.md`
- Blog index: `site/blog/index.json` (consumido pelo popup)
- RSS feed: `site/blog/rss.xml`
- Rebuild: `npm run blog:index`

## Content Engine
- Gerador em `tools/content_engine/` (main.js, build-index.js, post-page.js)
- Requer `LLM_API_KEY` para geracao
- Sources definidos em `sources.json`

## Categorias de blog (9)
- procrastinacao, foco-atencao, dev-performance, trabalho-remoto
- marketing, produto, ux-design, carreira, negocios
- Popup recomenda apenas as 4 primeiras

## Metadados de posts
- Frontmatter com tone/mood que dirige arte visual
- Tom: Saul Goodman (persuasivo, sarcastico, moderado)

## Multilingual
- Locales em `site/_locales/` (copias de `_locales/`, gitignored)
- Copiar via `npm run i18n:copy-site`
- 14 idiomas suportados

## Deploy
- GitHub Pages via Jekyll workflow (`.github/workflows/jekyll-gh-pages.yml`)
