# Sugestões automáticas e aprendizado local

Este recurso sugere como classificar domínios não listados pelo usuário. Ele **não** altera listas automaticamente — apenas recomenda e aprende com o feedback.

## Quando uma sugestão é criada

- `enableAutoClassification` deve estar ativo nas opções.
- O domínio visitado não pode estar nas listas produtivo/procrastinação.
- A aba precisa ser `http(s)` (páginas internas do Chrome não são analisadas).
- O content script responde com metadados dentro do timeout (2s).

As sugestões continuam podendo aparecer como **toast na página** e no **card de sugestões do popup**, mas a superfície oficial de active learning é a **fila de revisão ML** nas opções.

## Sinais coletados (localmente)

O content script envia apenas metadados e sinais leves:

- `hostname`, `title`, `description`, `keywords`, headings (`h1–h3`).
- `og:type`, `schema.org` (itemtype), tokens de path (`/watch`, `/docs`, etc.).
- Flags de layout: vídeo, scroll infinito, autoplay, feed, formulário, editor rico, tabela grande, shorts/reels.
- Contadores: links externos, profundidade de scroll, interações, tempo ativo na página.
- `language` do documento.
- Sinais de contexto recente do usuário (atenção, continuidade e fragmentação de foco) derivados localmente.
- Sinais de integração com VS Code em janela curta (quando a integração está ativa e consentida).

Nada é enviado para a rede.

### Camada de sinais naturais (v3+)

- Os sinais passam por uma camada `raw -> semantic signals -> model features`.
- Features contínuas usam normalização local com winsorização (`p1/p99`), `log1p` e padronização por histórico.
- Famílias semânticas principais:
  - `intent`: `work_domain_research`, `work_knowledge`, `collaboration`, `admin_ops`, `social_entertainment`, `commerce`.
  - `attention`: continuidade de foco, taxa de troca, latência de retorno e fragmentação.
  - `engagement`: dwell time, interação, scroll e razão de áudio.
  - `task_progress`: edição, progresso em formulário e proxy de conclusão.
  - `context`: aderência ao horário e share de atividade VS Code/web.
  - `reliability`: qualidade de metadados e estabilidade dos sinais.

## Modelo de sugestões

- **Modelo**: `WideDeepLiteBinary` (single-model), com:
  - ramo **wide** linear sobre features hashed,
  - ramo **deep** com embeddings esparsos + camada oculta ReLU.
- **Treino**: online por amostra (AdaGrad), com peso maior para feedback explícito e peso menor para rótulos implícitos.
- **Vetorização**: `FeatureVectorizer` com 131.072 dimensões e `minFeatureCount=5`.
- **Persistência**: IndexedDB `sg-ml-models` + metadados em `chrome.storage.local` (`sg:ml-model-meta`).
- **Splits explícitos**: exemplos `explicit` são roteados de forma determinística para `train/calibration/test` (`70/15/15`); exemplos `implicit` entram apenas em `train`.
- **Calibração**: `temperature scaling` sobre o score bruto do modelo, ajustado apenas no split `calibration`.
- **Validação**: gate estatístico local com macro-F1, `falseProductiveRate`, `precisionProductive`, ECE, Brier, bootstrap CI e McNemar usando apenas o split `test`.
- **Auto-treino conservador**: pseudo-rótulos apenas em alta confiança (`>=0.93` / `<=0.07`), estabilidade temporal e proteção anti-drift.
- **Guardrail stage**:
  - `guarded`: thresholds conservadores (`productive >= 0.78`, `procrastination <= 0.28`).
  - `normal`: thresholds padrão (`productive >= 0.70`, `procrastination <= 0.30`) apenas após aprovação do gate em `test` explícito com pelo menos 50 amostras.

## Fila de revisão ML

- A tela de opções exibe uma fila dedicada de revisão.
- A fila combina sugestões ainda não classificadas e fora de cooldown.
- Prioridade:
  - domínios a `<= 0.05` do threshold vigente (`threshold_borderline`);
  - depois maior incerteza;
  - depois timestamp mais recente.
- Cada item mostra domínio, classe sugerida, probabilidade calibrada, motivo e top razões.
- Ações disponíveis:
  - `Produtivo`
  - `Procrastinador`
  - `Ignorar`

## Governança de sinais de atenção

- Features `nat:attention:*` e `nat:reliability:signal_stability_7d` permanecem ativas em runtime.
- Toda alegação de ganho offline precisa incluir ablação `no_attention`.
- O replay marca `attentionRisk=true` quando remover essas famílias melhora materialmente `falseProductiveRate` ou `deltaMacroF1`.

Classificação por probabilidade:

- Acima do threshold de produtivo → **produtivo**
- Abaixo do threshold de procrastinação → **procrastinação**
- Entre os thresholds → **neutro**

## Cooldown e histórico

- Cooldown padrão: **24h** (`suggestionCooldownMs`).
- Sugestões de baixa confiança respeitam um cooldown mínimo de **15 min**.
- Histórico por domínio fica em `settings.suggestionsHistory`.
- Cache limitado a 10 sugestões ativas por vez.

## Feedback do usuário

- **Aceitar**: adiciona domínio à lista correspondente e treina o modelo.
- **Ignorar**: registra cooldown e não treina.
- **Classificar manualmente**: direciona para opções.

## Observações importantes

- O toggle **“Sugestões por IA”** está desabilitado na UI (placeholder).
- O aprendizado é totalmente local; não há chamadas externas.
- O estado persistido é único (`single-neural-lite-v4`), com calibração de temperatura e sem manter payload legado de versões antigas.
- Razões exibidas no popup/report priorizam conceitos naturais (não buckets técnicos), com evidência técnica apenas em modo debug.
