# Saul Goodman VS Code Bridge

Extensao do VS Code que coleta eventos de atividade (heartbeats) e envia para o SaulDaemon local.
Os dados alimentam os relatorios da extensao Chrome e o relatorio dentro do VS Code.

## Recursos

- Heartbeats com throttling (escrita e foco).
- Eventos extras: terminal, tasks, debug e testes (quando disponivel).
- Fila com batch, persistencia local e retry com backoff.
- Relatorio no VS Code via Webview (com os mesmos endpoints do SaulDaemon).
- Barra de status com tempo de hoje e estado do daemon.

## Como usar

1. Inicie o SaulDaemon local (`saul-daemon/index.cjs`) com `PAIRING_KEY`.
2. Configure no VS Code (`Configuracoes > Saul Goodman`):
   - `saulGoodman.enableTracking`: habilita/desabilita a coleta.
   - `saulGoodman.enableReportsInVscode`: abre relatorios no editor.
   - `saulGoodman.apiBase`: URL do daemon (ex.: `http://127.0.0.1:3123`).
   - `saulGoodman.pairingKey`: mesma chave do daemon e da extensao Chrome.
3. Abra o comando **“Saul Goodman: abrir relatorios”** para ver o report no editor.

## Configuracoes

- `saulGoodman.enableTracking` (default true)
- `saulGoodman.enableReportsInVscode` (default true)
- `saulGoodman.enableSensitiveTelemetry` (default false)
- `saulGoodman.apiBase` (default `http://127.0.0.1:3123`)
- `saulGoodman.pairingKey`
- `saulGoodman.hashFilePaths` (default true)
- `saulGoodman.hashProjectNames` (default false)
- `saulGoodman.language` (`auto`, `en-US`, `pt-BR`, `es-419`)

## O que e enviado

Exemplo de heartbeat:

```json
{
  "id": "uuid",
  "time": "2024-01-01T10:00:00.000Z",
  "entityType": "file",
  "entity": "sha256",
  "project": "saul_goodman",
  "language": "typescript",
  "category": "coding",
  "isWrite": true,
  "editor": "vscode",
  "pluginVersion": "1.21.10",
  "machineId": "uuid",
  "metadata": {
    "linesAdded": 2,
    "linesRemoved": 1,
    "windowFocused": true,
    "workspaceId": "uuid"
  }
}
```

Nenhum conteudo de codigo e enviado. Os paths sao hash por padrao.

## Desenvolvimento

- A extensao e JavaScript puro (`src/extension.js`).
- Node 18+ recomendado.
- Comando util: “Saul Goodman: preparar comando do SaulDaemon”.
