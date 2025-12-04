# Indicadores e KPIs da Saul Goodman Extension

Este documento descreve todas as métricas exibidas na UI, exportadas no CSV e renderizadas no PDF.

## Métricas base (DailyMetrics)

| Campo | Descrição | Cálculo |
| --- | --- | --- |
| `productiveMs` | Tempo total em domínios classificados como produtivos. | Soma dos slices coletados quando `classifyDomain` retorna `productive`. |
| `procrastinationMs` | Tempo total em domínios procrastinatórios. | Soma dos slices com categoria `procrastination`. |
| `inactiveMs` | Período em que o navegador ficou sem interação além do `inactivityThresholdMs` **ou** perdeu foco (janela em segundo plano). | Incrementado quando `trackingState.isIdle === true` ou `browserFocused` é falso (também soma em `windowUnfocusedMs`). |
| `tabSwitches` | Número de vezes que o usuário trocou de aba enquanto era rastreado. | Incrementado em `incrementTabSwitches`. |
| `tabSwitchBreakdown` | Estrutura com a contagem de trocas agrupadas por categoria origem/destino (ex.: `productiveToProcrastination`). | Atualizada em `incrementTabSwitches`, usando `classifyDomain` para identificar a categoria de cada domínio. |
| `tabSwitchHourly` | 24 buckets com as mesmas transições do breakdown, só que por hora do dia. | Atualizado em `recordTabSwitchCounts` com base no timestamp da troca. |
| `domains` | Mapa domínio → `{milliseconds, category}`. | Atualizado a cada slice ativo. |
| `hourly` | 24 buckets com tempos por hora (`productiveMs`, `procrastinationMs`, `inactiveMs`, `neutralMs`). | Gerado via `splitDurationByHour` a cada slice. |
| `timeline` | Lista `{startTime, endTime, durationMs, domain, category}` (até 2.000 entradas). | Populada em `recordTimelineSegment` para contar a história do dia. |
| `currentIndex` | Índice de procrastinação mostrado no badge/popup. | `calculateProcrastinationIndex`. |
| `overtimeProductiveMs` | Minutos produtivos acumulados fora dos horários cadastrados na options page. | Incrementado em `accumulateSlice` quando `classifyDomain` retorna `productive` e o timestamp está fora do expediente configurado (padrão: 08h–12h e 14h–18h). |
| `windowUnfocusedMs` | Tempo em que o navegador ficou em segundo plano (outra janela focada). | Incrementado quando `windows.onFocusChanged` indica perda de foco. |
| `audibleProcrastinationMs` | Tempo com áudio ativo em domínios procrastinatórios. | Incrementado em `accumulateSlice` quando `tab.audible` está ligado e a categoria é procrastinação. |
| `spaNavigations` | Contagem de trocas de rota em apps SPA. | Incrementado em `webNavigation.onCommitted/onHistoryStateUpdated`. |
| `groupedMs` | Tempo em abas que estão dentro de grupos. | Incrementado em `accumulateSlice` quando `tab.groupId` é válido. |
| `restoredItems` | Itens fechados hoje (abas/janelas recentes). | Atualizado em `updateRestoredItems` via `chrome.sessions.getRecentlyClosed`. |

### Índice de procrastinação

O score final (`currentIndex`) combina três componentes normalizados entre 0 e 1:

1. **Procrastinação**: `metrics.procrastinationMs / (productiveMs + overtimeBonus + procrastinationMs)` (0 quando não há tempo improdutivo). `overtimeBonus = metrics.overtimeProductiveMs` garante que minutos produtivos fora do expediente entrem com peso dobrado e influenciem positivamente o índice.
2. **Trocas de abas**: `min(tabSwitches / 50, 1)` — considera até 50 trocas/dia como limite.
3. **Inatividade**: `min(inactiveMs / (3h em ms), 1)` — penaliza até 3 horas de ociosidade.

Cada componente é multiplicado por um peso configurável (`settings.weights`) na options page:

```ts
score = (
  procrastinationRatio * weights.procrastinationWeight +
  tabSwitchRatio * weights.tabSwitchWeight +
  inactivityRatio * weights.inactivityWeight
) * 100
```

O número é arredondado e limitado entre 0–100. O badge e o popup exibem esse valor.

## KPIs derivados (popup e exports)

| KPI | Fórmula / Fonte | Interpretação |
| --- | --- | --- |
| **Foco ativo** | `(productiveMs / totalTracked) * 100`. | Percentual de tempo útil sobre a jornada monitorada. |
| **Trocas por hora** | `tabSwitches / (totalTracked / 3.6e6)`. | Quantas abas são trocadas em média por hora rastreada. |
| **Tempo ocioso** | `(inactiveMs / totalTracked) * 100`. | Fração do tempo com navegador aberto sem interação. |
| **Prod x Proc** | `productiveMs / procrastinationMs` (∞ quando `procrastinationMs === 0`). | Quantas horas produtivas compensam cada hora desperdiçada. |
| **Imersão campeã** | `max(domains[category === 'productive'])`. | Domínio produtivo com mais tempo. |
| **Vilão do dia** | `max(domains[category === 'procrastination'])`. | Domínio procrastinatório que mais consumiu o usuário. |
| **Mídia em vilões** | `audibleProcrastinationMs` formatado em minutos. | Tempo com áudio tocando em domínios procrastinatórios. |
| **Browser fora de foco** | `windowUnfocusedMs` formatado em minutos. | Tempo com o navegador em segundo plano. |
| **Rotas em SPA** | `spaNavigations`. | Trocas de rota internas (YouTube, LinkedIn, Slack web, etc.). |
| **Tempo em grupos** | `groupedMs` formatado em minutos. | Minutos em abas agrupadas. |
| **Itens fechados hoje** | `restoredItems`. | Quantidade de abas/janelas recentes fechadas no dia. |

> `totalTracked = productiveMs + procrastinationMs + inactiveMs` (tempo inativo inclui janela desfocada). Todos os outputs são formatados (porcentagem, minutos ou string `--` quando não há dados) em `popup.ts`.

## Apresentação

- **Popup**: cartões no painel “Indicadores extras” e resumos com tooltips explicativos.
- **CSV**: inclui seções "Resumo geral", "Indicadores extras" e "Top domínios". Valores numéricos são convertidos para minutos (`ms/60000`) ou porcentagem através das funções `formatPercentage`, `formatRate` e `formatProductivityRatio`.
- **PDFs**:
  - Popup: resumo rápido com gráfico Produtivo vs Procrastinação.
  - Relatório: usa os buckets horários e a narrativa (`timeline`) para montar imagens adicionais e texto detalhado.
- **Relatório detalhado** (`src/report/report.html`): gráficos stacked por hora, doughnut de composição e lista narrativa baseada na timeline.

## Atualização / extensões futuras

- Novos KPIs devem ser adicionados a este documento com fórmula clara e campo de origem.
- Se o cálculo exigir novos campos em `DailyMetrics`, descreva os campos na tabela inicial.
- Quando alterar pesos ou thresholds (options page), lembre-se de atualizar os exemplos do CSV se necessário.
- Os horários de trabalho podem ser editados em `options.html`. Pelo menos um intervalo precisa existir; intervalos podem ser removidos ou adicionados conforme necessário. O default é 08h–12h e 14h–18h.
