# Métricas e índice

Este documento descreve os dados persistidos no dia (`DailyMetrics`), os KPIs derivados e o cálculo do Índice de Procrastinação.

## Estrutura `DailyMetrics`

| Campo | Tipo | Descrição |
| --- | --- | --- |
| `dateKey` | `YYYY-MM-DD` | Dia atual. Reset diário pelo background. |
| `productiveMs` | number | Tempo produtivo em domínios classificados como produtivos. |
| `procrastinationMs` | number | Tempo em domínios procrastinatórios. |
| `inactiveMs` | number | Tempo ocioso (sem interação ou browser em segundo plano). |
| `tabSwitches` | number | Total de trocas de abas. |
| `tabSwitchBreakdown` | object | Contagem de transições Prod↔Proc↔Neutro. |
| `tabSwitchHourly` | array | 24 buckets com o breakdown por hora. |
| `domains` | record | Mapa domínio → `{ milliseconds, category }`. |
| `hourly` | array | 24 buckets com `productiveMs`, `procrastinationMs`, `inactiveMs`, `neutralMs`. |
| `timeline` | array | Segmentos `{startTime,endTime,durationMs,domain,category}` (máx. 2.000). |
| `currentIndex` | number | Índice final (0–100). |
| `lastUpdated` | number | Timestamp da última atualização. |
| `overtimeProductiveMs` | number | Produtivo fora do expediente (conta em dobro no índice). |
| `windowUnfocusedMs` | number | Tempo com o navegador sem foco. |
| `audibleProcrastinationMs` | number | Tempo procrastinatório com áudio ativo. |
| `spaNavigations` | number | Rotas SPA detectadas via `webNavigation`. |
| `groupedMs` | number | Tempo em abas dentro de grupos. |
| `restoredItems` | number | Itens reabertos pelo `chrome.sessions`. |
| `vscodeActiveMs` | number | Tempo ativo no VS Code (via daemon). |
| `vscodeSessions` | number | Sessões contabilizadas no VS Code. |
| `vscodeSwitches` | number | Trocas registradas no VS Code. |
| `vscodeSwitchHourly` | number[] | 24 buckets de switches do VS Code. |
| `vscodeTimeline` | array | Timeline do VS Code, inserida no relatório e CSV. |
| `contextDurations` | record | Duração total por contexto (work/personal/etc.). |
| `contextIndices` | record | Índice hipotético por contexto (ponderado pelo tempo). |

## KPIs derivados

As métricas abaixo são calculadas em `src/shared/metrics.ts`:

- **Focus rate**: `% produtivo` sobre o total rastreado.
- **Tab switch rate**: trocas por hora rastreada.
- **Inactive %**: percentagem de inatividade.
- **Prod x Proc**: razão produtivo/procrastinação.
- **Top domínios**: maiores domínios produtivos e procrastinatórios.

## Índice de Procrastinação

O cálculo está em `src/shared/score.ts` e retorna um score **0–100**:

```
procrastinationRatio = procrastination / (productive + vscode + overtimeBonus + procrastination)
tabSwitchRatio = min(tabSwitches / 50, 1)
inactivityRatio = min(inactiveMs / 3h, 1)

score = (
  procrastinationRatio * weight.procrastinationWeight +
  tabSwitchRatio * weight.tabSwitchWeight +
  inactivityRatio * weight.inactivityWeight
) * 100
```

Notas importantes:

- `overtimeProductiveMs` é somado ao produtivo para valorizar trabalho fora do expediente.
- `vscodeActiveMs` entra como tempo produtivo adicional.
- Pesos são configuráveis na Options e devem somar 1.

## Justiça do dia (fairness)

O índice pode ser neutralizado por regras de justiça:

- **Manual override**: “Ignorar hoje” zera o score.
- **Contextos**: `personal` neutraliza; `leisure`, `study`, `dayOff`, `vacation` aplicam multiplicadores (ver `src/shared/utils/context.ts`).
- **Feriado**: se habilitado e detectado, zera o score.

O relatório também calcula **contextIndices** ponderados pelo tempo para simular o índice completo em cada contexto.
