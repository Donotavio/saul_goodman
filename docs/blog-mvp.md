# Blog MVP — Saul Goodman

## Estrutura

- Entradas do blog em Markdown com frontmatter YAML em `site/blog/posts/YYYY/AAAA-MM-DD-slug.md`.
- Índice para consumo do site/extensões em `site/blog/index.json` (title, url, markdown, date, category, tags, excerpt, source_*).
- Gere/atualize esse índice com `npm run blog:index` sempre que criar ou editar posts manualmente (use `-- --dry-run` para pré-visualizar sem escrever); o comando também regenera os HTMLs estáticos e o RSS.
- A extensão Chrome lê esse índice direto do site para sugerir artigos no popup conforme a categoria dominante do dia.
- Use o campo opcional `tone` (`incredulo` | `like` | `nao-corte`) para definir qual arte do Saul aparecerá no blog/popup; quando omitido, heurísticas baseadas em tags/excerpts escolhem automaticamente.
- Páginas públicas: `/site/blog/index.html`, categorias `/site/blog/<categoria>/index.html` e posts estáticos em `/site/blog/posts/<ano>/<slug>/index.html` (a rota `post/?post=<path>` segue como fallback).
- Estado de duplicidade salvo em `tools/content_engine/state/posted.json` (chaves das fontes já publicadas).
- UI do blog replica o seletor PT/EN/ES do site: detecta idioma via `localStorage`/navegador, atualiza hero/nav/chips e permite troca manual em qualquer página.
- Cada post traz traduções EN/ES incorporadas no próprio Markdown: frontmatter define `title_<lang>`/`excerpt_<lang>` e o corpo usa blocos `<!--lang:xx-->` para que o frontend carregue a versão correta.
- RSS do blog em `site/blog/rss.xml` para distribuição e indexação.

## Content Engine

- Configuração de feeds e palavras-chave em `tools/content_engine/sources.json` (`window_days` padrão 14).
- Executável Node (ESM) em `tools/content_engine/main.js`.
- Comandos: `npm run content:engine` (produção) e `npm run content:engine:dry-run` (sem escrita).
- Pipeline: baixa e parseia RSS/Atom, filtra itens recentes, aplica score por keywords, descarta itens já publicados, seleciona o melhor acima do threshold e chama LLM.
- LLM recebe título/link/resumo e devolve Markdown (800–1200 palavras) no tom Saul Goodman, com metadados e estrutura obrigatória; valida se categoria ∈ {procrastinacao, foco-atencao, dev-performance, trabalho-remoto} e se frontmatter está completo.
- Slug: `YYYY-MM-DD-<slug-title>.md`; grava post, atualiza `index.json` e registra fonte em `state/posted.json` (não escreve nada em dry-run ou se não houver item relevante).

## Secrets e execução

- Necessário `LLM_API_KEY`; opcionais `LLM_BASE_URL`, `LLM_MODEL`, `LLM_PROVIDER`.
- Execução manual: `npm run content:engine` na raiz do repo (respeita `sources.json` e `state/posted.json`).

## GitHub Actions

- Workflow em `.github/workflows/blog-content-engine.yml` roda às segundas 08:00 BRT (11:00 UTC) e via `workflow_dispatch`.
- Passos: checkout, Node 20, `npm install`, `npm run content:engine`; se gerar arquivos em `site/blog` ou `tools/content_engine/state`, commita com `chore(blog): publish weekly article` usando `GITHUB_TOKEN` (contents: write). Se não houver mudanças, finaliza sem commit.
