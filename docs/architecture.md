# Arquitetura da extensão Saul Goodman

## Visão geral
- **Manifest V3**: service worker em `dist/background/index.js`, popup/options HTML em `src/popup` e `src/options`, content script em `dist/content/activity-listener.js`.
- **ES Modules**: TypeScript compila para módulos ES nativos, o que mantém o worker organizado em funções.
- **Sem backend**: todo armazenamento fica em `chrome.storage.local` e o badge reflete o estado atual.

## Fluxo de dados
1. **Content script (`activity-listener.ts`)**
   - Captura movimentos de mouse, teclado, scroll e envia `activity-ping` com o timestamp.
   - Ping periódico (15s) garante que o background saiba que ainda existe atividade mesmo sem eventos.
2. **Service worker (`background/index.ts`)**
   - Mantém `trackingState` com domínio atual, último timestamp e flag de inatividade.
   - `chrome.tabs` listeners: ao trocar/tab atualizar, finaliza o slice de tempo do domínio e atualiza métricas.
   - `chrome.alarms`:
     - `sg:tracking-tick` roda a cada 15s para consolidar tempo produtivo/procrastinação/inativo.
     - `sg:midnight-reset` limpa métricas diariamente e reseta contadores.
   - `chrome.storage.onChanged`: mantém caches locais sincronizados quando options altera configurações.
   - `calculateProcrastinationIndex` converte métricas em índice (0–100) e atualiza badge.
3. **Popup (`popup.ts`)**
   - Solicita `metrics-request`, renderiza summary, Chart.js e top 5 domínios.
   - Botões: `Atualizar`, `Configurar` (abre options) e `Limpar dados` (`clear-data`).
4. **Options (`options.ts`)**
   - Carrega settings, permite alterar pesos, threshold e listas de domínio.
   - Atualiza storage e notifica o background via `settings-updated`.

## Estrutura dos dados
```ts
interface DailyMetrics {
  dateKey: string; // YYYY-M-D
  productiveMs: number;
  procrastinationMs: number;
  inactiveMs: number;
  tabSwitches: number;
  domains: Record<string, DomainStats>; // domain -> tempo + categoria
  currentIndex: number;
  lastUpdated: number;
}

interface ExtensionSettings {
  productiveDomains: string[];
  procrastinationDomains: string[];
  weights: {
    procrastinationWeight: number;
    tabSwitchWeight: number;
    inactivityWeight: number;
  };
  inactivityThresholdMs: number;
  locale: 'pt-BR';
}
```

## Cálculo do índice
- `score.ts` normaliza cada métrica:
  - `procrastinationRatio` = `procrastinationMs / (productiveMs + procrastinationMs)`
  - `tabSwitchRatio` limitado a 50 trocas/dia.
  - `inactivityRatio` limitado a 3h de ociosidade.
- Índice = soma dos pesos * cada ratio → 0–100.
- Badge e popup usam o valor arredondado.
- Detalhes completos estão em [`docs/indicators.md`](./indicators.md).

## Buckets horários e timeline
- Durante `accumulateSlice`, cada fatia é distribuída por hora (`splitDurationByHour`). O objeto `DailyMetrics.hourly` mantém 24 buckets com os tempos produtivo/procrastinação/inatividade/neutral.
- Também é armazenado um `timeline` onde cada entrada descreve início, fim, domínio e categoria (incluindo períodos inativos). O array é limitado a 2.000 segmentos por dia.
- Esses dados alimentam o relatório detalhado (`src/report/report.html`) com gráficos stacked e storytelling minuto a minuto.

## KPIs derivados no popup
Sem gravar dados extras, `popup.ts` calcula indicadores adicionais com base nas métricas já recebidas:
- **Foco ativo**: `%` de tempo produtivo sobre o total rastreado.
- **Trocas por hora**: `tabSwitches` dividido pelo número de horas monitoradas no dia.
- **Tempo ocioso %**: percentual de `inactiveMs` sobre o dia.
- **Prod x Proc**: horas produtivas que compensam cada hora procrastinatória (∞ quando não há vilões).
- **Imersão campeã**: domínio produtivo com mais tempo agregado.
- **Vilão do dia**: domínio procrastinatório com maior peso.
Todos os cartões exibem um tooltip descrevendo a métrica.

## Exportações
- **CSV**: gerado diretamente no popup convertendo métricas e KPIs em linhas (`downloadTextFile`). Inclui resumo diário, indicadores extras e top 10 domínios.
- **PDF**: usa `jspdf` vendorizado (`src/vendor/jspdf.umd.min.js`). O popup monta um relatório com textos, KPIs e a imagem do gráfico (via `Chart.toBase64Image`). O arquivo é salvo localmente com `jsPDF#save`.
Esses KPIs são renderizados em cartões e não exigem persistência adicional.

## Build & distribuição
- `npm run build` → `tsc -p tsconfig.json` gera `dist/**`. Não há bundler; HTML referencia `../../dist/...` diretamente.
- Chart.js fica vendorizado em `src/vendor/chart.umd.js` (carregado pelo popup antes do módulo TS).
- Para empacotar: após compilar, compacte a pasta raiz (sem `node_modules` se não quiser) e importe em `chrome://extensions`.

## Pontos de extensão
- **Novas métricas**: adicionar campos em `DailyMetrics` e atualizar `score.ts` + popup.
- **Novos modos**: `shared/types.ts` concentra tipos; edite ali e compartilhe nos módulos.
- **Internacionalização**: o idioma atual é `pt-BR`, mas `ExtensionSettings.locale` permite futura expansão.

## Segurança & privacidade
- Não há chamadas de rede; permissões mínimas: `storage`, `tabs`, `alarms`, `activeTab` e host `<all_urls>` apenas para saber URL.
- Manifest não inclui CSP customizado além do padrão; todos scripts são locais.
- Documentação e UI lembram que os dados ficam no navegador do usuário.
