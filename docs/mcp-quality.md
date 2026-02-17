# MCP Quality Suite

Suíte interna de QA visual/performance para popup, options, report, site, blog e integrações.

## Requisitos

- Node 20.19+ (ou 22.12+)
- Chrome/Chromium disponível para `npx chrome-devtools-mcp@latest`
- `npm install` na raiz

## Comandos

- `npm run mcp:sync-harness` — copia HTML originais para o harness e injeta stub do `chrome.*`.
- `npm run mcp:quality` — build + executa cenários (popup/options/report/perf/site/blog/daemon/vscode).
- `npm run mcp:quality:update-baseline` — atualiza baselines.

Flags úteis:

- `--only=popup,options,report,perf,site,blog,daemon,vscode`
- `--viewports=desktop,mobile`
- `--update-baseline`
- `--allow-warnings`
- `--network-offline`
- `--artifacts-dir=...`
- `--base-url=...`

## Artefatos

- `tools/mcp_quality/artifacts/summary.json` e `summary.md`
- Screenshots em `artifacts/screenshots/`
- Traces em `artifacts/traces/`
