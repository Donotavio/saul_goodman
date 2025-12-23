# Arquitetura da extensão Saul Goodman

## Visão geral

- **Manifest V3**: service worker em `dist/background/index.js`, popup/options HTML em `src/popup` e `src/options`, content script em `dist/content/activity-listener.js`.
- **ES Modules**: TypeScript compila para módulos ES nativos, o que mantém o worker organizado em funções.
- **Sem backend externo**: todo armazenamento fica em `chrome.storage.local` e o badge reflete o estado atual.
- **Daemon local (opcional)**: `saul-daemon/index.cjs` recebe batimentos do VS Code (HTTP `localhost`) e devolve resumo diário para o background somar ao tempo produtivo.
- **Extensão VS Code (opcional)**: `vscode-extension/` envia heartbeats, mostra o Índice do Saul na status bar (consulta `/v1/tracking/index`) e tem o comando “Saul Goodman: preparar comando do SaulDaemon” que preenche o terminal com `PAIRING_KEY`/`PORT`.
- **I18n**: strings em `_locales/{pt_BR,en_US,es_419}`; o popup/options usam `localePreference` (`auto` segue idioma do Chrome) via `createI18n`.

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
   - `chrome.storage.onChanged`: mantém caches locais sincronizados quando options altera configurações e reaplica o `chrome.idle.setDetectionInterval` com base em `inactivityThresholdMs`.
   - `calculateProcrastinationIndex` converte métricas em índice (0–100) e atualiza o badge.
3. **Popup (`popup.ts`)**
   - Solicita `metrics-request`, renderiza summary, Chart.js e top 5 domínios.
   - Botões: `Atualizar` e `Configurar` (abre options); exportações ficam na seção “Defenda seu foco”.
   - Estado crítico (score >= `settings.criticalScoreThreshold`, padrão 90): adiciona classe de “terremoto”, exibe overlay do Saul, contador regressivo, CTA para relatório/opções e opcionalmente toca uma sirene (preference salva em `ExtensionSettings.criticalSoundEnabled`). O background envia o alerta para abas cujo domínio não seja classificado como produtivo; se o domínio estiver marcado como produtivo, a aba permanece livre para o usuário recuperar o score.
4. **Options (`options.ts`)**
   - Carrega settings, permite alterar pesos, threshold, listas de domínio e configurações do modo terremoto (limiar + alerta sonoro) além dos blocos de horário de trabalho.
   - Atualiza storage e notifica o background via `settings-updated`.
   - Responde ao hash `#vilains` rolando até a lista de domínios procrastinatórios para fluxos vindos do alerta crítico.
   - Gerencia os blocos de horários de trabalho (`workSchedule`). Usuário pode adicionar/remover intervalos e o background usa esses dados para detectar expediente/oferta de horas extras.
5. **Site institucional (`site/`)**
   - HTML/CSS/JS independentes apresentam a extensão, seguindo a mesma identidade visual para campanhas e divulgação.
6. **SaulDaemon (`saul-daemon/`)

- Node CJS que persiste `data/vscode-usage.json` por data (`totalActiveMs`, `sessions`, `switches`, `switchHourly`, `timeline`).
- Endpoint `GET /v1/tracking/vscode/summary?date=YYYY-MM-DD&key=PAIRING_KEY` responde o resumo consumido pelo background.
- Endpoint `POST /v1/tracking/index` recebe o índice diário publicado pelo Chrome e `GET /v1/tracking/index` devolve índice/sessões/minutos para o VS Code.

1. **Extensão VS Code (`vscode-extension/`)

- Envia batimentos para o daemon, pede chave/porta quando ausentes, pode iniciar o daemon em terminal próprio com logs sem bloquear o usuário e exibe o Índice do Saul na status bar com mensagens traduzidas (`pt-BR`, `en-US`, `es-419`).

## Estrutura dos dados

```ts
interface DailyMetrics {
  dateKey: string; // YYYY-M-D
  productiveMs: number;
  procrastinationMs: number;
  inactiveMs: number;
  overtimeProductiveMs: number; // minutos produtivos fora do expediente valem em dobro no índice
  tabSwitches: number;
  tabSwitchBreakdown: TabSwitchBreakdown; // Prod↔Proc↔Neutro
  tabSwitchHourly: TabSwitchHourlyBucket[]; // 24 buckets das transições por hora
  domains: Record<string, DomainStats>; // domain -> tempo + categoria
  hourly: HourlyBucket[]; // 24 buckets produtivo/procrastinação/inativo/neutral
  timeline: TimelineEntry[]; // limitado a 2.000 segmentos por dia
  windowUnfocusedMs: number;
  audibleProcrastinationMs: number;
  spaNavigations: number;
  groupedMs: number;
  restoredItems: number;
  currentIndex: number;
  lastUpdated: number;
  // Integração VS Code
  vscodeActiveMs?: number;
  vscodeSessions?: number;
  vscodeSwitches?: number;
  vscodeSwitchHourly?: number[];
  vscodeTimeline?: TimelineEntry[];
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
  locale: 'pt-BR' | 'en-US' | 'es-419';
  localePreference: 'auto' | 'pt-BR' | 'en-US' | 'es-419';
  criticalScoreThreshold?: number; // padrão 90
  criticalSoundEnabled?: boolean;
  workSchedule?: WorkInterval[]; // intervalos adicionados em options
  openAiKey?: string; // opcional para narrativa no relatório
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
- Também é armazenado um `timeline` onde cada entrada descreve início, fim, domínio e categoria (incluindo períodos inativos). O array é limitado a 2.000 segmentos por dia. Quando o daemon envia `vscodeTimeline`, a UI mescla esses segmentos como `productive` do domínio sintético “VS Code (IDE)”.
- `tabSwitchHourly` é enriquecido com `vscodeSwitchHourly` para o gráfico de trocas por hora no relatório.
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

## Build & distribuição

- `npm run build` → `prebuild` limpa `dist/` e `tsc -p tsconfig.json` gera `dist/**`. Não há bundler; HTML referencia `../../dist/...` diretamente.
- Chart.js fica vendorizado em `src/vendor/chart.umd.js` (carregado pelo popup antes do módulo TS).
- Para empacotar: após compilar, compacte a pasta raiz (sem `node_modules` se não quiser) e importe em `chrome://extensions`.

## Pontos de extensão

- **Novas métricas**: adicionar campos em `DailyMetrics` e atualizar `score.ts` + popup.
- **Novos modos**: `shared/types.ts` concentra tipos; edite ali e compartilhe nos módulos.
- **Internacionalização**: o idioma atual é `pt-BR`, mas `ExtensionSettings.locale` permite futura expansão.
- **Preferências compartilhadas**: ajustes persistem diretamente em `ExtensionSettings` via `shared/storage.ts` (ex.: alerta sonoro do modo terremoto). Não há um wrapper separado; sempre arque para `saveSettings/getSettings`.
- **Horário de trabalho**: `ExtensionSettings.workSchedule` guarda os intervalos que definem o expediente. O background aplica peso dobrado aos minutos produtivos fora desses intervalos, e `calculateProcrastinationIndex` usa `metrics.overtimeProductiveMs` para refletir essa bonificação.

## Segurança & privacidade

- Não há chamadas de rede; permissões mínimas: `storage`, `tabs`, `alarms`, `activeTab` e host `<all_urls>` apenas para saber URL.
- Manifest não inclui CSP customizado além do padrão; todos scripts são locais.
- Documentação e UI lembram que os dados ficam no navegador do usuário.
