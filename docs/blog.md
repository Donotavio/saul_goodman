# Blog e content engine

O blog vive em `site/blog/` e é consumido pelo popup para recomendar artigos.

## Estrutura

- Posts em Markdown: `site/blog/posts/YYYY/AAAA-MM-DD-slug.md`.
- HTML estático gerado em `site/blog/posts/YYYY/<slug>/index.html`.
- Índice para consumo do frontend: `site/blog/index.json` (formato `{ posts: [...] }`).
- RSS em `site/blog/rss.xml`.

## Categorias

Categorias suportadas pelo blog/site:

- `procrastinacao`
- `foco-atencao`
- `dev-performance`
- `trabalho-remoto`
- `marketing`
- `produto`
- `ux-design`
- `carreira`
- `negocios`

O **popup** recomenda apenas as quatro primeiras categorias (as demais ficam visíveis no blog).

## Indexação manual

```bash
npm run blog:index
```

Esse comando:

- Regenera `site/blog/index.json`.
- Atualiza os HTMLs estáticos dos posts.
- Recria o RSS.

## Content engine (LLM)

Scripts em `tools/content_engine/`:

- `npm run content:engine` — gera novo post e atualiza índice.
- `npm run content:engine:dry-run` — simula sem gravar.

Configurações:

- Fontes em `tools/content_engine/sources.json`.
- Estado em `tools/content_engine/state/posted.json`.
- Variáveis: `LLM_API_KEY` (obrigatório), `LLM_BASE_URL`, `LLM_MODEL`, `LLM_PROVIDER` (opcionais).

## Metadados e tom visual

- `tone` (ou `mood`) no frontmatter define a arte exibida.
- Quando ausente, o frontend infere o tom via tags e texto.
- Campos extras no frontmatter são preservados no `index.json`.

## Traduções

- Interface do blog usa `_locales/` (copiado para `site/_locales/` e `site/blog/_locales/`).
- Posts podem incluir blocos `<!--lang:xx-->` e `title_xx`/`excerpt_xx` no frontmatter.

## Automação

- Workflow: `.github/workflows/blog-content-engine.yml` (execução semanal e `workflow_dispatch`).
