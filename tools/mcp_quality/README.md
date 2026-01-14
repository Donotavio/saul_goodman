## MCP Quality Suite

### Requisitos
- Node 20.19+ (ou 22.12+)
- Chrome/Chromium disponível para `npx chrome-devtools-mcp@latest`
- `npm install` já executado

### Comandos
- `npm run mcp:sync-harness` — copia HTML originais (popup/options/report) para `tools/mcp_quality/harness/`, ajusta paths e injeta stub de `chrome.*`.
- `npm run mcp:quality` — build + executa todos os cenários (popup, options, report, perf, site, blog, daemon, vscode) em desktop e mobile.
- Flags úteis:
  - `--only=popup,options,report,perf,site,blog,daemon,vscode`
  - `--viewports=desktop,mobile`
  - `--update-baseline` — atualiza baselines de screenshots e perf
  - `--allow-warnings` — não falha em console errors/requests >=400 (apenas registra warnings)
  - `--network-offline` — força emulação offline (onde aplicável)
  - `--artifacts-dir=...` — diretório custom para artefatos
  - `--base-url=...` — usar servidor já rodando em vez de subir o estático local

### Baselines
- Screenshots: `tools/mcp_quality/baselines/{desktop,mobile}/<cenario>.png`. Em caso de diferença, o teste falha e referencia actual/baseline; use `--update-baseline` para atualizar.
- Perf: `tools/mcp_quality/baselines/perf.<viewport>.json` com métricas simples (tamanho do trace). `--update-baseline` grava novo snapshot.

### Artefatos
- `tools/mcp_quality/artifacts/summary.json` e `summary.md`
- Screenshots em `artifacts/screenshots/`
- Traces em `artifacts/traces/`
- Perf/console/network info registrado no summary e em warnings/errors

### Notas
- O runner sobe um servidor estático na raiz e, quando necessário, o `saul-daemon/index.cjs` real (porta 43123, chave `mcp-test-key`).
- Cenários de site/blog falham em console errors ou requests >=400 (exceto se `--allow-warnings`).
