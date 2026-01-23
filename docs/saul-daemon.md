# Saul Daemon

Serviço HTTP local que faz a ponte entre VS Code e Chrome. Ele agrega heartbeats, calcula durações e fornece endpoints consumidos pelo relatório.

## Executando

```bash
cd saul-daemon
PAIRING_KEY=meu-segredo PORT=3123 node index.cjs
```

## Variáveis de ambiente

- `PAIRING_KEY` (**obrigatório**)
- `PORT` (default `3123`)
- `BIND_HOST` (default `127.0.0.1`)
- `SAUL_DAEMON_DATA_DIR` (override do diretório de dados)
- `SAUL_DAEMON_MAX_BODY_KB` (default `256`)
- `SAUL_DAEMON_RETENTION_DAYS` (default `1`)
- `SAUL_DAEMON_VSCODE_RETENTION_DAYS` (default `SAUL_DAEMON_RETENTION_DAYS`)
- `SAUL_VSCODE_GAP_MINUTES` (default `5`)
- `SAUL_VSCODE_GRACE_MINUTES` (default `2`)

## Persistência

Por padrão, o daemon grava em `data/` dentro do diretório de dados:

- `data/vscode-usage.json` — resumo legado para o Chrome.
- `data/vscode-tracking.json` — heartbeats e durações detalhadas.

O diretório default segue esta ordem:

1. `SAUL_DAEMON_DATA_DIR`
2. `XDG_DATA_HOME/saul-daemon`
3. `%APPDATA%/saul-daemon`
4. `~/.local/share/saul-daemon`
5. `saul-daemon/data` (legado)

## Autenticação e CORS

- Quase todos os endpoints exigem `key=<PAIRING_KEY>`.
- CORS é liberado apenas para `localhost`, `127.0.0.1`, `chrome-extension://` e `vscode-webview://`.

## Endpoints

### Saúde

- `GET /health`
- `GET /v1/health`

### Chrome (tracking)

- `GET /v1/tracking/vscode/summary?date=YYYY-MM-DD&key=...` (resumo agregado usado pelo background)
- `POST /v1/tracking/vscode/heartbeat`
- `GET/POST /v1/tracking/index`

### VS Code (v1)

- `POST /v1/vscode/heartbeats` (batch)
- `GET /v1/vscode/heartbeats`
- `GET /v1/vscode/durations`
- `GET /v1/vscode/summaries?start=YYYY-MM-DD&end=YYYY-MM-DD`
- `GET /v1/vscode/stats/today`
- `GET /v1/vscode/projects`
- `GET /v1/vscode/languages`
- `GET /v1/vscode/editors`
- `GET /v1/vscode/machines`
- `GET /v1/vscode/meta`
- `GET /v1/vscode/commits`
- `GET /v1/vscode/branches`
- `GET /v1/vscode/repositories`
- `GET /v1/vscode/editor-metadata`
- `GET /v1/vscode/workspaces`
- `GET /v1/vscode/activity-insights`
- `GET /v1/vscode/telemetry`
- `GET /v1/vscode/dashboard`

Todos os endpoints aceitam `key=<PAIRING_KEY>` via query string.
