# Indicadores e KPIs da Saul Goodman Extension

Este documento descreve todas as métricas exibidas na UI, exportadas no CSV e renderizadas no PDF.

## Métricas base (DailyMetrics)
| Campo | Descrição | Cálculo |
| --- | --- | --- |
| `productiveMs` | Tempo total em domínios classificados como produtivos. | Soma dos slices coletados quando `classifyDomain` retorna `productive`. |
| `procrastinationMs` | Tempo total em domínios procrastinatórios. | Soma dos slices com categoria `procrastination`. |
| `inactiveMs` | Período em que o navegador ficou sem interação além do `inactivityThresholdMs`. | Incrementado quando `trackingState.isIdle === true`. |
| `tabSwitches` | Número de vezes que o usuário trocou de aba enquanto era rastreado. | Incrementado em `incrementTabSwitches`. |
| `domains` | Mapa domínio → `{milliseconds, category}`. | Atualizado a cada slice ativo. |
| `currentIndex` | Índice de procrastinação mostrado no badge/popup. | `calculateProcrastinationIndex`. |

### Índice de procrastinação
O score final (`currentIndex`) combina três componentes normalizados entre 0 e 1:

1. **Procrastinação**: `metrics.procrastinationMs / (productiveMs + procrastinationMs)` (0 quando não há tempo improdutivo).
2. **Trocas de abas**: `min(tabSwitches / 50, 1)` — considera até 50 trocas/dia como limite.
3. **Inatividade**: `min(inactiveMs / (3h em ms), 1)` — penaliza até 3 horas de ociosidade.

Cada componente é multiplicado por um peso configurável (`settings.weights`) na options page:

```
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

> `totalTracked = productiveMs + procrastinationMs + inactiveMs`. Todos os outputs são formatados (porcentagem, minutos ou string `--` quando não há dados) em `popup.ts`.

## Apresentação
- **Popup**: cartões no painel “Indicadores extras” e resumos com tooltips explicativos.
- **CSV**: inclui seções "Resumo geral", "Indicadores extras" e "Top domínios". Valores numéricos são convertidos para minutos (`ms/60000`) ou porcentagem através das funções `formatPercentage`, `formatRate` e `formatProductivityRatio`.
- **PDF**: gera texto com os mesmos KPIs, adiciona o gráfico atual (imagens produzidas via `Chart.toBase64Image`) e lista os 5 principais domínios.

## Atualização / extensões futuras
- Novos KPIs devem ser adicionados a este documento com fórmula clara e campo de origem.
- Se o cálculo exigir novos campos em `DailyMetrics`, descreva os campos na tabela inicial.
- Quando alterar pesos ou thresholds (options page), lembre-se de atualizar os exemplos do CSV se necessário.
