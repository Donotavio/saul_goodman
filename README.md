# Saul Goodman — Extensão anti-procrastinação

![Logotipo Saul Goodman](src/img/logotipo_saul_goodman.ico "Logotipo Saul Goodman")

![Manifest V3](https://img.shields.io/badge/Chrome-Manifest%20V3-4285F4?logo=google-chrome&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)
![Chart.js](https://img.shields.io/badge/Chart.js-4.5-ff6384?logo=chartdotjs&logoColor=white)
![License](https://img.shields.io/badge/License-Private-important)

Extensão MV3 para Chrome/Chromium que assume o alter ego vendedor de Saul Goodman para monitorar quanto tempo você passa em sites produtivos versus procrastinatórios. Os scripts em TypeScript acompanham domínios, inatividade, trocas frenéticas de abas e calculam um Índice de Procrastinação (0–100) exibido no badge e no popup com gráficos e mensagens sarcásticas.

## Funcionalidades principais

- **Service Worker** monitora domínio ativo, soma tempo produtivo x procrastinação, detecta inatividade e conta troca de abas.
- **Content script** envia pings de atividade (mouse/teclado/scroll) para o background não marcar você como ausente antes da hora.
- **Popup** mostra índice atual, gráfico Chart.js (produtivo vs procrastinação), resumo diário, top 5 domínios e botões de ação.
- **Options page** permite ajustar pesos do cálculo, threshold de inatividade, listas de domínios produtivos/vilões, limiar do “modo terremoto” e definir o seu horário de trabalho (minutos produtivos fora desse período contam em dobro).
- **Badge em tempo real** sempre exibindo o índice atual arredondado.
- **Indicadores extras**: foco ativo, elasticidade de abas por hora, tempo ocioso %, razão Prod x Proc e vilões/campeões do dia calculados on-the-fly.
- **Tooltips educativos**: cada métrica possui um ícone de informação que explica como o número foi calculado.
- **Storytelling IA**: configure sua chave OpenAI nas opções para gerar narrativas sarcásticas no relatório em tom Saul Goodman.
- **Exportação**: o usuário pode baixar um CSV completo, gerar o PDF do popup ou abrir o **Relatório detalhado** (nova página com storytelling horário, gráfico de trocas de abas por hora e PDF próprio).
- **Personalidade Saul Goodman**: mensagens e microcopy em pt-BR com tom sarcástico sem referências visuais protegidas.
- **Modo terremoto**: ao atingir o limiar configurável (padrão 90) o popup treme como um pager desesperado, exibe um overlay do Saul com contador regressivo e CTA para relatório/opções; a sirene opcional é configurada nas opções e apenas abas não productivas (procrastinação/indefinidas) recebem o travamento/alerta, permitindo que o usuário continue usando abas classificadas como produtivas para recuperar o foco.

## Stack e arquitetura

- **Manifest V3** com service worker modular e ES Modules.
- **TypeScript** compilado via `tsc` para `dist/` (sem bundler adicional).
- **Chart.js** vendorizado (UMD local em `src/vendor/chart.umd.js`).
- **chrome.storage.local** para métricas diárias e configurações.
- **Sem frameworks**: todo HTML/CSS escrito manualmente.

```text
saul_goodman/
├─ manifest.json
├─ src/img/
│  ├─ logotipo_saul_goodman.png
│  └─ logotipo_saul_goodman.ico
├─ src/vendor/
│  ├─ chart.umd.js
│  └─ jspdf.umd.min.js
├─ package.json / tsconfig.json
├─ src/
│  ├─ background/index.ts
│  ├─ content/activity-listener.ts
│  ├─ popup/
│  │  ├─ popup.html / popup.css / popup.ts
│  ├─ options/
│  │  ├─ options.html / options.css / options.ts
│  └─ shared/
│     ├─ types.ts
│     ├─ storage.ts / score.ts / metrics.ts / tab-switch.ts
│     └─ utils/{time,domain,inactivity}.ts
├─ src/vendor/chart.umd.js
├─ dist/ (gerado pelo TypeScript)
├─ site/
│  ├─ index.html / style.css / main.js
│  └─ assets/logotipo_saul_goodman.png
└─ docs/
   ├─ architecture.md
   ├─ ux-and-copy.md
   └─ indicators.md
```

## Pré-requisitos

- Node.js 18+
- Chrome/Chromium baseado em Manifest V3

## Como rodar

1. Instale dependências e gere os JS:

   ```bash
   npm install
   npm run build   # ou npm run watch para rebuild automático
   ```

2. (Opcional) Abra as Configurações do Escritório e informe sua chave `sk-...` da OpenAI para habilitar a narrativa.
3. Carregue a extensão:
   - Abra `chrome://extensions`
   - Ative "Modo do desenvolvedor"
   - Clique em **Carregar sem compactação** e selecione a pasta `saul_goodman`
4. Fixe o ícone na barra e abra o popup para validar o gráfico e o badge.

## Fluxo de desenvolvimento

- **Editar TypeScript:** os arquivos em `src/**.ts` compilam para `dist/`. Sempre rode `npm run build` ou `npm test` (que já compila) após ajustar lógica.
- **Popup/Options HTML & CSS:** vivem em `src/popup` e `src/options`. Não precisam de build além do TypeScript.
- **Vendor:** se atualizar o Chart.js local, substitua `src/vendor/chart.umd.js` (e mantenha o manifesto sem CSP extra).

## Métricas & índice

- `DailyMetrics` agrupa tempos produtivos, procrastinação, inatividade, domínio detalhado, trocas de abas (com breakdown Prod⇄Proc⇄Neutro) e minutos produtivos fora do expediente configurado.
- `score.ts` converte esses números em um índice ponderado (pesos configuráveis nas opções). Cada minuto produtivo fora dos horários cadastrados entra com peso dobrado no cálculo.
- Reset automático diariamente via alarme de meia-noite; para “zerar” manualmente basta usar o DevTools → Application → Storage (não há mais botão dedicado no popup).

## Privacidade

Todo o rastreamento acontece **apenas** no Chrome do usuário. Nenhum dado sai do `chrome.storage.local` e não existe comunicação com servidores externos por padrão. Se você informar uma chave da OpenAI nas opções, apenas o relatório detalhado enviará o resumo diário (índice, métricas agregadas, top domínios e trechos da timeline) para a API da OpenAI com a finalidade de gerar a narrativa em tom Saul Goodman. Sem chave, nenhuma chamada externa acontece. Preferências locais (como o alerta sonoro do modo terremoto) também ficam somente no `chrome.storage.local`. O README e os docs explicam claramente o que é medido e como alterar listas/pesos.

## Documentação complementar

- [`docs/architecture.md`](docs/architecture.md): detalha o fluxo do background, content script, storage e cálculo do índice.
- [`docs/ux-and-copy.md`](docs/ux-and-copy.md): guia de experiência, tom de voz e expectativas para popup/options/report.
- [`docs/indicators.md`](docs/indicators.md): descrição formal do índice de procrastinação, métricas base, buckets horários e KPIs usados no popup, relatório, CSV e PDFs.
- Exportações estão disponíveis no popup em “Defenda seu foco” (CSV/PDF rápido) e na página `src/report/report.html`, acessível pelo botão “Abrir relatório”. Lá existe outro PDF completo com storytelling do dia.
- **Assets**: logotipo oficial em PNG/ICO dentro de `src/img/`, já referenciado pelo manifest/action.

```mermaid
flowchart TD

    %% UI
    subgraph UI [Camada UI]
        P1[Popup - HTML TS Chartjs]
        P2[Options Page - HTML TS]
    end

    %% Content Script
    CS[Content Script activity-listener captura atividade envia pings]

    %% Service Worker
    subgraph SW [Service Worker Background]
        SW1[Eventos Chrome onMessage onTabActivated onTabUpdated onAlarm]
        SW2[Tracking Engine rastreamento de dominio e tempo]
        SW3[Aggregation Engine agregacao diaria + overtime]
        SW4[Score Engine indice 0 a 100 com bonus fora do expediente]
    end

    %% Shared Layer
    subgraph SH [Shared Layer]
        SH1[types.ts modelos compartilhados]
        SH2[storage.ts acesso ao chrome.storage.local]
        SH3[utils funcoes auxiliares tempo e cronogramas]
    end

    %% Storage
    DB[(chrome.storage.local mini banco KV)]

    %% Fluxos
    CS -->|activity ping| SW1
    SW1 --> SW2
    SW2 --> SW3
    SW3 -->|save daily metrics| SH2
    SH2 --> DB

    P1 -->|get metrics/settings| SH2
    P1 -->|score e gráficos| SW4

    P2 -->|save settings| SH2

    SW4 -->|badge update| UI
```

Contribuições futuras podem seguir o estilo modular existente e manter o humor ágil de Saul — sempre deixando claro o que é rastreado e mantendo todo o processamento local.
