---
globs: saul-daemon/**
---

# Saul Daemon Rules

## Estrutura
- Modulo CJS (`index.cjs`), NAO ESM
- HTTP server nativo (sem Express/Fastify)
- Bind: BIND_HOST (default 127.0.0.1), PORT env var

## Autenticacao
- PAIRING_KEY obrigatorio para rotas protegidas
- Validar via header ou query param antes de processar

## CORS
- Whitelist dinamica via `getAllowedOrigin()`
- Origens permitidas: localhost, 127.0.0.1, chrome-extension://, vscode-webview://
- Nunca adicionar origens externas sem pedido explicito

## Rotas principais
- `/health`, `/v1/health` — health check (sem auth)
- `/v1/tracking/vscode/summary` — consumido pelo Chrome extension
- `/v1/tracking/vscode/heartbeat` — ingestao de heartbeats
- `/v1/vscode/*` — namespace para dados VS Code (durations, summaries, stats, commits, branches, etc.)
- `/v1/tracking/index` — indice de tracking

## Persistencia
- JSON files em `data/` (gitignored): `vscode-usage.json`, `vscode-tracking.json`
- State objects: `state.byKey {}`, `vscodeState.byKey {}`, `vscodeIdIndex Map`
- Deduplicacao de heartbeats por fingerprint
- Merge de intervalos sobrepostos para evitar double-counting

## Environment vars
- SAUL_DAEMON_DATA_DIR, SAUL_DAEMON_MAX_BODY_KB (256)
- SAUL_DAEMON_RETENTION_DAYS (1), SAUL_DAEMON_VSCODE_RETENTION_DAYS
- SAUL_VSCODE_GAP_MINUTES (5), SAUL_VSCODE_GRACE_MINUTES (2)
- MAX_FUTURE_DAYS (1)

## Formato de data
- YYYY-MM-DD (UTC) para todas as keys de data
