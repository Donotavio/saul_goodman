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

## Retention usa buffer de +1 dia para heartbeats

- **Comportamento**: `pruneVscodeEntries` mantém heartbeats por `VSCODE_RETENTION_DAYS + 1` dias, enquanto durações usam exatamente `VSCODE_RETENTION_DAYS`. O buffer extra protege sessões que cruzam meia-noite.
- **Risco residual**: sessões contínuas com mais de 24h no boundary de retenção ainda perdem a parte mais antiga. Este cenário é raro (sessões >24h ininterruptas).
- **Referências**: `saul-daemon/index.cjs` (`pruneVscodeEntries`).

## VS Code queue: sem protocolo de acknowledgment (risco residual aceito)

- **Comportamento**: após flush bem-sucedido (HTTP 200/204), heartbeats são removidos do buffer in-memory. Se o daemon aceitou o request mas falhou ao persistir internamente (crash entre accept e persist), os dados são perdidos.
- **Mitigação**: atomic writes no daemon (tmp + rename), persist chain serializada, e dedup por fingerprint cobrem retransmissões. O custo de um protocolo ACK completo supera o benefício para um serviço localhost.
- **Referências**: `vscode-extension/src/queue/buffered-event-queue.js` (`flush`), `saul-daemon/index.cjs` (`handleVscodeHeartbeats`).

## Summary legado omite aiMetrics (intencional)

- **Comportamento**: o path primário do `/v1/tracking/vscode/summary` (via `vscodeState`) retorna `aiMetrics` agregadas dos heartbeats. O path legado (via `state`/`vscode-usage.json`) não retorna `aiMetrics` pois os dados legados não contêm essa informação.
- **Impacto**: a extensão Chrome trata `aiMetrics` como opcional e usa defaults (0). O comportamento é silenciosamente diferente entre paths, mas correto — o legado simplesmente não tem os dados.
- **Referências**: `saul-daemon/index.cjs` (`handleSummary`), `src/background/index.ts` (consumo do summary).

## Filtro isValidVscodeDuration só existe no path legado do Chrome

- **Comportamento**: `isValidVscodeDuration` rejeita durações com `project='unknown'` e `language='unknown'` — mas apenas no path legado da extensão Chrome. O path primário não aplica esse filtro porque o daemon já agrega e a normalização (`normalizeVscodeTrackingSummary`) valida as entradas.
- **Referências**: `src/background/index.ts` (`isValidVscodeDuration`), `saul-daemon/index.cjs` (`isDurationRelevant`).
