## MCP Quality Suite

- Requisitos: Node 18+, Chrome (para chrome-devtools-mcp), `npx` disponível.
- Comandos principais:
  - `npm run mcp:sync-harness` — copia HTML originais (popup/options/report) para o harness e injeta o stub.
  - `npm run mcp:quality` — build + executa todos os cenários (popup, options, report, perf, site, blog, daemon, vscode) em desktop/mobile.
  - Flags: `--only=popup,options,...`, `--viewports=desktop,mobile`, `--update-baseline`, `--allow-warnings`, `--network-offline`, `--artifacts-dir=...`, `--base-url=...`.
- Baselines:
  - Screenshots: `tools/mcp_quality/baselines/{desktop,mobile}/`. Rode com `--update-baseline` para criar/atualizar.
  - Perf: `tools/mcp_quality/baselines/perf.{viewport}.json` contendo métricas (tamanho do trace).
- Artifacts: `tools/mcp_quality/artifacts/` (summary.json/md, screenshots, traces, logs).
- Dependências: `npx chrome-devtools-mcp@latest` é iniciado automaticamente pelo runner; se Chrome não estiver disponível, o comando falha com mensagem.
