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
