# Extensão VS Code

A extensão do VS Code coleta activity heartbeats, telemetria opcional e envia tudo ao Saul Daemon local. Ela também exibe um relatório dentro do editor.

## Fluxo de dados

1. A extensão coleta eventos (heartbeats + sinais opcionais).
2. Os eventos entram em uma fila local (`vscode-heartbeat-queue.json` em `globalStorageUri`).
3. A fila envia batches para `POST /v1/vscode/heartbeats` no daemon.
4. Relatórios no VS Code e na extensão Chrome consultam o daemon.

## Comandos

- **Saul Goodman: preparar comando do daemon** (`saulGoodman.startDaemon`)
- **Saul Goodman: testar daemon** (`saulGoodman.testDaemon`)
- **Saul Goodman: abrir relatórios** (`saulGoodman.openReports`)
- **Saul Goodman: configurar pomodoro** (`saulGoodman.setupPomodoro`)
- **Saul Goodman: resetar combo** (`saulGoodman.resetCombo`)

## Configurações (settings)

Principais chaves (`package.json`):

- `saulGoodman.enabled`
- `saulGoodman.enableTracking`
- `saulGoodman.enableReportsInVscode`
- `saulGoodman.apiBase` (ex.: `http://127.0.0.1:3123`)
- `saulGoodman.pairingKey`
- `saulGoodman.daemonPath` (opcional)
- `saulGoodman.hashFilePaths` (default `true`)
- `saulGoodman.hashProjectNames` (default `false`)
- `saulGoodman.heartbeatIntervalMs` (default `15000`)
- `saulGoodman.idleThresholdMs` (default `60000`)
- `saulGoodman.language` (`auto`, `en-US`, `pt-BR`, `es-419`)
- `saulGoodman.enableTelemetry` (default `false`)
- `saulGoodman.enableSensitiveTelemetry` (default `false`)
- `saulGoodman.pomodoroTestMode` (default `false`)
- `saulGoodman.telemetrySampleDiagnosticsIntervalSec` (default `60`)

## Telemetria opcional

Quando `enableTelemetry` está ativo, a extensão também envia eventos agregados sobre:

- Debug, testes e tasks
- Uso de terminal e comandos
- Extensões e comandos acionados
- Foco/blur da janela
- Diagnósticos e refactors
- Combos e milestones

Os dados são locais e não incluem conteúdo de código.

## Privacidade

- **Paths de arquivos** são hasheados por padrão.
- `machineId` e `hashSalt` são UUIDs locais em `globalState`.
- Nenhum conteúdo do código é enviado.

## Integração com o daemon

- O comando de “preparar daemon” tenta iniciar o daemon **embutido** na extensão.
- Também aceita `daemonPath` customizado ou `saul-daemon/` no workspace.
