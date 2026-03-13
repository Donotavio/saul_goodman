# Arquitetura do monorepo Saul Goodman

## Visão geral

O monorepo é composto por quatro blocos principais: extensão Chrome (produto), Saul Daemon (ponte local), extensão VS Code (telemetria local) e site/blog estáticos. Não há backend externo obrigatório — toda persistência é local e qualquer chamada de rede é opt‑in.

## Diagrama de alto nível

```
┌──────────────────────────────┐
│        Chrome Extension      │
│  (background + UI + content) │
└───────────────┬──────────────┘
                │ HTTP local (opt‑in)
                ▼
┌──────────────────────────────┐
│         Saul Daemon           │
│  Node.js local + JSON store    │
└───────────────┬──────────────┘
                ▲ heartbeats + telemetria
                │
┌──────────────────────────────┐
│       VS Code Extension       │
│  coleta eventos e envia batch │
└──────────────────────────────┘

┌──────────────────────────────┐
│       Site/Blog estático      │
│   (site/ e site/blog/)        │
└──────────────────────────────┘
```

## Responsabilidades por componente

### Extensão Chrome

- **Service worker** (`dist/background/index.js`): tracking de domínio ativo, inatividade, trocas de abas, métricas diárias, cálculo do índice e sincronização VS Code.
- **Content script** (`dist/content/activity-listener.js`): envia pings de atividade e coleta metadados para sugestões automáticas.
- **UI** (`src/popup`, `src/options`, `src/report`, `src/block`): painel diário, configurações, relatório detalhado, bloqueio local.
- **Armazenamento**: `chrome.storage.local` para métricas/configurações e metadados de ML; IndexedDB (`sg-ml-models`) para o estado do modelo de sugestões.

### Saul Daemon

- Serviço HTTP local (`saul-daemon/index.cjs`) que recebe heartbeats, agrega durações e expõe endpoints consumidos pela extensão Chrome e pelo webview do VS Code.
- Persistência em JSON (`data/vscode-tracking.json`, `data/vscode-usage.json`) com retenção configurável.

### Extensão VS Code

- Coleta heartbeats e telemetria opcional (debug, testes, terminal etc.).
- Enfileira eventos localmente e envia batches ao daemon.
- Exibe status em barra e webview de relatórios.

### Site/Blog

- Site institucional e blog estáticos em `site/`.
- Conteúdo do blog é indexado em `site/blog/index.json` e consumido pelo popup.

## Fluxos principais

1. **Tracking web**
   - Content script envia pings de atividade.
   - Background acumula métricas e atualiza o índice a cada ciclo de alarme.
   - Popup/report leem métricas e renderizam UI.

2. **Sugestões automáticas de domínio**
   - Content script coleta metadados e sinais leves.
   - Background usa modelo ML local único (`WideDeepLiteBinary`) para sugerir categoria, com camada de sinais naturais semânticos/comportamentais.
   - Exemplos `explicit` entram em `train/calibration/test` por split determinístico; exemplos `implicit` entram somente em `train`.
   - Probabilidade é calibrada localmente com `temperature scaling` no split `calibration` e validada por gate estatístico em `test` (macro-F1, FPR, precisão, ECE/Brier, bootstrap e McNemar).
   - Auto-treino conservador promove pseudo-rótulos apenas em alta confiança e estabilidade temporal.
   - A tela de opções expõe uma fila de revisão ML para active learning, priorizando casos perto do threshold e depois por incerteza.
   - Usuário aceita/ignora; feedback explícito atualiza o modelo e pode acionar quarentena anti-drift.

3. **Integração VS Code (opcional)**
   - Extensão VS Code envia heartbeats para o daemon.
   - Daemon agrega durações e retorna resumo diário.
   - Background sincroniza `/v1/tracking/vscode/summary` (fallback para endpoints legados) e soma ao tempo produtivo.

4. **Rede opt‑in**
   - **OpenAI**: relatório gera narrativa somente com chave configurada.
   - **Nager.Date**: feriados nacionais somente quando habilitado.
   - **localhost**: integração com daemon.

## Decisões arquiteturais relevantes

- **Local‑first**: métricas e modelos ficam no dispositivo do usuário.
- **Modelo único de sugestão**: estado persistido `single-neural-lite-v4` com calibração por temperatura e sem manter payload legado de versões antigas.
- **Sinais naturais por padrão**: explicações no UI priorizam conceitos humanos (intenção/atenção/progresso/contexto).
- **Governança de atenção**: qualquer avaliação offline relevante deve incluir ablação `no_attention` para auditar o impacto de `nat:attention:*` e `nat:reliability:signal_stability_7d`.
- **Sem bundler**: TypeScript compila direto para `dist/`, HTML referencia módulos gerados.
- **Bloqueio local**: usa `declarativeNetRequest` para redirecionar domínios procrastinatórios.
- **Integração opcional**: daemon e VS Code são complementares e não obrigatórios.

## Limitações conhecidas

- O content script não roda em `chrome://`, `edge://` ou páginas protegidas.
- O índice considera apenas a aba ativa do navegador.
- Integração VS Code depende do daemon rodando em `localhost` e da chave de pareamento.
- O modelo de sugestões não faz chamadas externas; funciona apenas com sinais locais.
