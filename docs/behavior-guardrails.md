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

## Intervalo com start==end cobre o dia inteiro

- **Comportamento**: `isWithinWorkSchedule` retorna `true` quando `start` e `end` são iguais.
- **Risco**: um intervalo mal configurado pode transformar o expediente em 24h.
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
