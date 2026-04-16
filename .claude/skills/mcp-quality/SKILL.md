---
name: mcp-quality
description: Visual and performance QA suite using Chrome DevTools MCP. Tests popup, options, report, site, blog, daemon, and VS Code surfaces for regressions.
user-invocable: true
context: fork
agent: Explore
allowed-tools:
  - Bash(npm run mcp:quality:*)
  - Bash(npm run build:*)
  - mcp__chrome-devtools__take_snapshot
  - mcp__chrome-devtools__take_screenshot
  - mcp__chrome-devtools__navigate_page
  - mcp__chrome-devtools__evaluate_script
  - mcp__chrome-devtools__list_pages
  - mcp__chrome-devtools__select_page
  - mcp__chrome-devtools__lighthouse_audit
  - mcp__chrome-devtools__performance_start_trace
  - mcp__chrome-devtools__performance_stop_trace
  - Read
  - Grep
  - Glob
paths:
  - tools/mcp_quality/**
---

# MCP Quality Suite

## Requisitos

- Chrome/Chromium com DevTools protocol ativo (porta 9222)
- Extensao carregada em modo desenvolvedor

## Execucao automatizada

```bash
npm run mcp:quality
```

## Superficies testadas

1. **Popup** — abertura rapida, dados carregados, chart renderizado
2. **Options** — salvar/carregar settings, todos os controles funcionais
3. **Report** — graficos, tabelas, export PDF
4. **Block page** — overlay funcional, timer, redirect
5. **Site** — paginas estaticas, service worker, navegacao
6. **Blog** — posts carregam, indice correto, RSS valido
7. **Daemon** — health check, endpoints respondem, CORS correto

## Testes manuais com MCP

### Snapshot e screenshot de superficie
1. Navegar para a superficie via `navigate_page`
2. Tomar snapshot textual via `take_snapshot`
3. Tomar screenshot via `take_screenshot`
4. Comparar com baseline

### Performance trace
1. `performance_start_trace` na superficie
2. Interagir (abrir popup, navegar)
3. `performance_stop_trace`
4. Analisar metricas (LCP, CLS, INP)

### Lighthouse
1. `lighthouse_audit` com mode=navigation ou snapshot
2. Verificar scores de accessibility, SEO, best practices

## Artefatos

- Screenshots salvos em `tools/mcp_quality/artifacts/` (gitignored)
- Traces em formato .json.gz
