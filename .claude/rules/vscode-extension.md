---
globs: vscode-extension/**
---

# VS Code Extension Rules

## Estrutura
- Package.json separado com dependencias proprias
- Entry point: `src/extension.js`
- Ativacao: onStartupFinished ou comando manual `saulGoodman.startDaemon`
- Namespace de comandos e settings: `saulGoodman.*`

## Heartbeat Queue
- Heartbeats armazenados localmente em arquivo (queue)
- Batch enviado para daemon periodicamente
- Retry com backoff em caso de falha de conexao

## Privacy
- File paths hasheados por default — nunca enviar paths em texto claro
- Nenhum conteudo de codigo coletado
- Telemetria opt-in model

## Localizacao
- i18n via `package.nls.*.json` (formato VS Code NLS), NAO Chrome format
- 14 locales em `_locales/` (formato Chrome para UI do daemon web)
- Manter os dois formatos sincronizados

## Build & Package
- `npm --prefix vscode-extension run build:vsix` para VSIX
- Empacotamento via `@vscode/vsce` (npx vsce)
- Daemon incluido em `daemon/` para bundle standalone

## Dependencia do Daemon
- Funcionalidade principal depende do daemon rodando em localhost
- API client em `src/apiClient/` gerencia conexao
- Tracking em `src/tracking/` (17 arquivos)
- Reports em `src/reports/` (10 arquivos)
