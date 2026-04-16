---
globs: tools/**
---

# Tools Rules

## content_engine/
- Blog content generation via LLM (requer LLM_API_KEY)
- main.js: runner principal
- build-index.js: gera site/blog/index.json
- post-page.js: cria paginas de post
- sources.json: fontes de conteudo configuradas
- Persona hardcoded: Saul Goodman

## i18n/
- 9 ferramentas de internacionalizacao
- `npm run i18n:sync` — sincroniza locales
- `npm run i18n:check` — verifica keys faltantes
- `npm run i18n:stubs` — gera stubs para novos locales
- `npm run i18n:repair-locale` — reparo assistido por LLM
- `npm run i18n:full-lang-update` — pipeline completo
- `npm run i18n:copy-site` — copia para site/_locales/

## mcp_quality/
- Suite QA visual e performance
- Requer Chrome/Chromium com DevTools protocol
- Artefatos em `tools/mcp_quality/artifacts/` (gitignored)
- Testa: popup, options, report, site, blog, daemon, vscode

## ml_replay/
- Avaliacao offline do modelo ML
- Export de perfil Chrome para dataset
- Replay e comparacao de modelos
- Python venv em `tools/.cache/` (gitignored)
- Comando: `npm run ml:replay -- --input <dataset>`

## Cache
- `tools/.cache/` para venvs e dados temporarios (gitignored)
