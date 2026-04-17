# Comportamentos atuais (guardrails)

Este documento registra comportamentos técnicos atuais que afetam cálculos e visualizações.
Ele não define decisões de produto; apenas descreve o que o sistema faz hoje e quais riscos isso implica.

## splitDurationByHour aceita tempo futuro

- **Comportamento**: `splitDurationByHour` não clampa durações futuras por conta própria.
- **Risco**: se um chamador passar uma duração que avança além do tempo real, o total por hora pode incluir minutos que ainda não ocorreram.
- **Referências**: `src/shared/utils/time.ts`, `src/tests/behavior-guardrails.test.ts`.

## Overtime usa apenas o sliceStart

- **Comportamento**: o overtime é decidido pelo timestamp de início do slice em `accumulateSlice`.
- **Risco**: slices que cruzam o fim do expediente podem ser classificados integralmente como dentro (ou fora) do horário.
- **Referências**: `src/background/index.ts`, `src/tests/behavior-guardrails.test.ts`.

## Intervalo com start==end rejeita o intervalo (CORRIGIDO)

- **Comportamento**: `isWithinWorkSchedule` retorna `false` quando `start` e `end` são iguais, tratando o intervalo como inválido.
- **Histórico**: antes da auditoria sistêmica (v1.24.8), retornava `true`, cobrindo 24h por engano.
- **Referências**: `src/shared/utils/time.ts`, `src/tests/behavior-guardrails.test.ts`.

## Duração mínima e grace nos heartbeats do daemon

- **Comportamento**: `buildDurations` aplica `min(30s, graceMs)` para heartbeat único e usa `graceMs` quando o gap excede o limite.
- **Risco**: sessões muito curtas podem ser infladas; gaps longos viram um bloco de grace.
- **Referências**: `saul-daemon/src/vscode-aggregation.cjs`, `src/tests/vscode-aggregation.test.ts`.

## Commits por hora são sintéticos no relatório do VS Code

- **Comportamento**: o gráfico de commits distribui o total em horas fixas com percentuais pré-definidos.
- **Risco**: o gráfico não reflete horários reais de commits.
- **Referências**: `vscode-extension/src/reports/report.js`, `vscode-extension/src/reports/commit-distribution.js`, `src/tests/commits-distribution.test.ts`.

## Todos os agentes usam timezone local

- **Comportamento**: o daemon usa `date.getFullYear()/getMonth()/getDate()` (timezone local do processo Node.js), o Chrome Extension usa timezone local do browser, e a extensão VS Code usa timezone da máquina.
- **Risco**: se os agentes rodam em fusos diferentes (ex.: VS Code conectado a servidor remoto em UTC, browser em BRT), dados do mesmo instante podem ser atribuídos a dias diferentes, causando inconsistência no resumo diário.
- **Referências**: `saul-daemon/index.cjs` (`formatDateKey`), `src/background/index.ts` (dateKey), `vscode-extension/src/queue/buffered-event-queue.js` (`formatDateKey`).

## Retention pode cortar sessões que cruzam meia-noite

- **Comportamento**: `pruneVscodeEntries` filtra heartbeats por data usando `isKept(ts)`. Heartbeats da parte antiga de uma sessão que cruza a fronteira de retenção são removidos. Durações são reconstruídas a partir dos heartbeats restantes (`buildDurations`).
- **Risco**: sessões que cruzam meia-noite em dias no limite da retenção perdem a parte mais antiga. O total de tempo ativo pode ser menor que o real.
- **Referências**: `saul-daemon/index.cjs` (`pruneVscodeEntries`), `saul-daemon/src/vscode-aggregation.cjs` (`buildDurations`).

## VS Code queue: persist após flush pode falhar (MITIGADO)

- **Comportamento**: após enviar heartbeats ao daemon com sucesso, `flush()` remove os itens do buffer in-memory e tenta persistir no disco. Se o persist falha, um retry imediato é disparado.
- **Risco residual**: se o retry também falhar (disco cheio), o buffer in-memory estará correto mas o disco ficará stale. No próximo restart, eventos já enviados podem ser reenviados (daemon dedup cobre).
- **Referências**: `vscode-extension/src/queue/buffered-event-queue.js` (`flush`, `persist`).

## VS Code queue: overflow notifica proativamente a 80%

- **Comportamento**: quando o buffer atinge 80% da capacidade máxima (800/1000), o usuário recebe uma notificação de warning indicando que o daemon pode estar offline. Notificações são throttled a cada 5 minutos.
- **Risco**: se o daemon está offline por mais de ~4.2h, os eventos mais antigos são descartados (FIFO). O contador `droppedEvents` rastreia as perdas.
- **Referências**: `vscode-extension/src/queue/buffered-event-queue.js` (`enqueue`).

## Terminal tracker marca atividade em background

- **Comportamento**: heartbeats de terminal gerados quando a janela do VS Code não está em foco recebem `metadata.backgroundActivity = true`.
- **Risco residual**: consumidores downstream que não distinguem background/foreground continuam contando esses heartbeats normalmente. Cabe ao daemon ou Chrome ponderar o peso.
- **Referências**: `vscode-extension/src/tracking/terminal-tracker.js` (`addBackgroundFlag`).

## Index sync clampa timestamps futuros (CORRIGIDO)

- **Comportamento**: POST `/v1/tracking/index` clampa `updatedAt` a `Date.now() + 5000ms` (clock skew tolerance). Timestamps futuros além da tolerância são reduzidos ao máximo permitido.
- **Histórico**: antes da auditoria sistêmica (v1.24.8), timestamps futuros eram aceitos sem restrição, podendo "trancar" o index em last-write-wins.
- **Referências**: `saul-daemon/index.cjs` (`handleIndex`).

## Version check compara major.minor (CORRIGIDO)

- **Comportamento**: o check de compatibilidade daemon/extensão compara `major.minor` (antes comparava apenas `major`).
- **Risco residual**: breaking changes em patch não são detectadas, mas o semver assume patches como backwards-compatible.
- **Referências**: `vscode-extension/src/extension.js` (duas ocorrências: startup e testDaemon).
