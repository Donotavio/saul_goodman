# Saul Goodman VS Code Bridge

Extensão VS Code que envia tempo ativo para o SaulDaemon local, permitindo que a extensão Chrome some VS Code como tempo produtivo. A versão segue a mesma da extensão Chrome; atualize ambas em conjunto.

## Como usar

1. Suba o SaulDaemon local (`saul-daemon/index.cjs`) com um `PAIRING_KEY`.
2. No VS Code, abra esta pasta `vscode-extension`.
3. Ajuste as configurações em `Configurações > Saul Goodman`:
   - `saulGoodman.enabled`: habilita/desabilita a coleta (padrão: ligado).
   - `saulGoodman.apiBase`: URL do daemon (padrão: `http://127.0.0.1:3123`).
   - `saulGoodman.pairingKey`: mesma chave do daemon e da extensão Chrome.
   - `saulGoodman.heartbeatIntervalMs`: intervalo dos heartbeats (padrão: 15000 ms).
   - `saulGoodman.idleThresholdMs`: tempo ocioso antes de pausar a sessão (padrão: 60000 ms).
4. Pressione F5 para rodar a extensão em uma janela de desenvolvimento ou use **Extensões > Executar extensão**.

## O que é enviado

A cada heartbeat (quando o VS Code está focado e houve atividade recente):

```json
{
  "key": "PAIRING_KEY",
  "sessionId": "uuid-por-sessao",
  "durationMs": 15000,
  "timestamp": 1700000000000
}
```

`sessionId` muda quando a janela volta ao foco ou após inatividade prolongada. Nenhum conteúdo de código é enviado, apenas tempo agregado.

## Desenvolvimento

- A extensão é JavaScript puro (`src/extension.js`), então não exige build. Se quiser tipagem, rode `npm install` para trazer `@types/vscode`.
- Node 18+ é recomendado (usa `fetch` quando disponível; fallback para `http/https` nativo).
- Se a pairing key estiver vazia, a extensão abre um input no VS Code pedindo a chave (a mesma da extensão Chrome/SaulDaemon) e salva em `saulGoodman.pairingKey`.
