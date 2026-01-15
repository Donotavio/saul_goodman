# SaulDaemon (local backend)

Backend HTTP leve para servir de ponte entre o VS Code e a extensao Chrome.
Nada sai da maquina: leitura e escrita acontecem em `saul-daemon/data/`.

Os endpoints de VS Code retornam apenas o dia atual.

## Endpoints principais (VS Code reports)

- `POST /v1/vscode/heartbeats` — ingestao em batch de heartbeats.
- `GET /v1/vscode/heartbeats`
- `GET /v1/vscode/durations`
- `GET /v1/vscode/summaries?start=YYYY-MM-DD&end=YYYY-MM-DD`
- `GET /v1/vscode/stats/today`
- `GET /v1/vscode/projects?start=...&end=...`
- `GET /v1/vscode/languages?start=...&end=...`
- `GET /v1/vscode/editors?start=...&end=...`
- `GET /v1/vscode/machines?start=...&end=...`
- `GET /v1/vscode/meta`

## Endpoints legados (compatibilidade)

- `POST /v1/tracking/vscode/heartbeat`
- `GET /v1/tracking/vscode/summary?date=YYYY-MM-DD&key=PAIRING_KEY`
- `GET/POST /v1/tracking/index`

## Rodando
```bash
cd saul-daemon
PAIRING_KEY=meu-segredo PORT=3123 node index.cjs
```

Configuracoes:

- `PORT` (padrao: `3123`)
- `PAIRING_KEY` (obrigatorio)
- `SAUL_VSCODE_GAP_MINUTES` (padrao: `5`)
- `SAUL_VSCODE_GRACE_MINUTES` (padrao: `2`)
- `SAUL_DAEMON_RETENTION_DAYS` (padrao: `1`, legado)

## Persistencia

- VS Code reports: `data/vscode-tracking.json`
- Legacy summary: `data/vscode-usage.json`

O daemon aceita requisoes apenas em localhost (CORS liberado para extensoes locais).
