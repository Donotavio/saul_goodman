# SaulDaemon (local backend)

Backend HTTP leve para servir de ponte entre o VS Code e a extensão Chrome. Nada sai da máquina: leitura e escrita acontecem apenas em `saul-daemon/data/vscode-usage.json`. A versão acompanha a extensão Chrome (1.1.2 neste pacote).

## Endpoints

- `GET /health` — resposta básica `{ ok: true }`.
- `POST /v1/tracking/vscode/heartbeat` — agrega tempo ativo.
  - Body JSON: `{ key: "PAIRING_KEY", sessionId: "unique-session-id", durationMs: 15000, timestamp?: number }`
  - `sessionId` deve ser único por sessão de foco; `durationMs` em ms para o período reportado.
- `GET /v1/tracking/vscode/summary?date=YYYY-MM-DD&key=PAIRING_KEY` — devolve `{ totalActiveMs, sessions }` para o dia.

Chaves vazias são rejeitadas; defina `PAIRING_KEY` para restringir acesso.

## Rodando

```bash
cd saul-daemon
PAIRING_KEY=meu-segredo PORT=3123 node index.cjs
```

Configurações:

- `PORT` (padrão: `3123`)
- `PAIRING_KEY` (padrão: vazio; recomenda-se definir)

Dados são mantidos por 14 dias e salvos em `data/vscode-usage.json`. O daemon aceita requisições apenas em localhost e retorna CORS liberado para facilitar desenvolvimento.

## Fluxo recomendado

1. Inicie o daemon local com a chave desejada.
2. Na Options da extensão Chrome, ative a integração VS Code e configure a mesma `vscodeLocalApiUrl` e `vscodePairingKey`.
3. A extensão VS Code envia heartbeats para `/v1/tracking/vscode/heartbeat`.
4. A extensão Chrome lê `/v1/tracking/vscode/summary` ao carregar métricas e soma o tempo produtivo do VS Code ao índice.
