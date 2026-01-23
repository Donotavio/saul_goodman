# Sugestões automáticas e aprendizado local

Este recurso sugere como classificar domínios não listados pelo usuário. Ele **não** altera listas automaticamente — apenas recomenda e aprende com o feedback.

## Quando uma sugestão é criada

- `enableAutoClassification` deve estar ativo nas opções.
- O domínio visitado não pode estar nas listas produtivo/procrastinação.
- A aba precisa ser `http(s)` (páginas internas do Chrome não são analisadas).
- O content script responde com metadados dentro do timeout (2s).

As sugestões aparecem como **toast na página** e no **card de sugestões do popup**.

## Sinais coletados (localmente)

O content script envia apenas metadados e sinais leves:

- `hostname`, `title`, `description`, `keywords`, headings (`h1–h3`).
- `og:type`, `schema.org` (itemtype), tokens de path (`/watch`, `/docs`, etc.).
- Flags de layout: vídeo, scroll infinito, autoplay, feed, formulário, editor rico, tabela grande, shorts/reels.
- Contadores: links externos, profundidade de scroll, interações, tempo ativo na página.
- `language` do documento.

Nada é enviado para a rede.

## Modelo de sugestões

- **Modelo**: regressão logística online (`OnlineLogisticRegression`).
- **Vetorização**: `FeatureVectorizer` com 65.536 dimensões e `minFeatureCount=3`.
- **Persistência**: IndexedDB `sg-ml-models` + metadados em `chrome.storage.local` (`sg:ml-model-meta`).
- **Confiança**: baseada na probabilidade do modelo.

Classificação por probabilidade:

- `>= 0.60` → **produtivo**
- `<= 0.40` → **procrastinação**
- entre 0.40 e 0.60 → **neutro**

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
