# WideDeepLite: Classificacao Neural On-Device para Produtividade Web

## Roteiro de Apresentacao

---

## 1. O Problema (2 min)

**Slide: "O paradoxo da atencao digital"**

- Trabalhadores do conhecimento alternam entre ~400 tarefas/dia (Mark et al., CHI 2008)
- Apos cada interrupcao, leva ~23 min para retomar o foco original
- Ferramentas existentes: listas estaticas de bloqueio → alto atrito, baixa adocao
- O usuario precisa decidir previamente o que e produtivo — mas contexto importa

**Ponte para a solucao:**
> "E se o navegador aprendesse *com voce* o que e produtivo — sem enviar um byte para a nuvem?"

---

## 2. Visao do Usuario (3 min)

**Slide: "O que o usuario ve"**

O modelo roda dentro de uma Chrome Extension (Manifest V3). O fluxo visivel:

```
Navega normalmente
    ↓
Extensao coleta metadados da pagina (title, keywords, headings, tipo de conteudo)
    ↓
Modelo classifica: produtivo | procrastinacao | neutro
    ↓
Toast com sugestao: "Este dominio parece produtivo. Confirmar?"
    ↓
Feedback explicito do usuario treina o modelo localmente
```

**Pontos-chave para audiencia:**
- Zero configuracao inicial — o modelo aprende do zero
- Explicabilidade: cada sugestao mostra *por que* (top features, conceitos semanticos)
- Review Queue: dominos incertos sao priorizados para revisao humana (active learning visivel)
- Indice de Procrastinacao 0-100 atualizado em tempo real

---

## 3. Restricoes de Design (2 min)

**Slide: "Constraints que definiram a arquitetura"**

| Restricao | Impacto na arquitetura |
|-----------|----------------------|
| **Roda no browser** (Service Worker) | Sem Python, sem ONNX, sem GPU. TypeScript puro |
| **Privacidade absoluta** | Zero telemetria. Dados nunca saem do IndexedDB |
| **Cold start sem dados** | Precisa de warm-start + guardrails iniciais |
| **Feedback humano escasso** | Active learning + pseudo-labels + sinais implicitos |
| **Latencia < 50ms** | Modelo esparso, forward pass leve |
| **Memoria limitada** | Float32Array, vetores esparsos, sem matrizes densas grandes |

---

## 4. Arquitetura do Modelo (5 min)

**Slide: "Wide & Deep adaptado para browser"**

Inspirado em Cheng et al. 2016 (Wide & Deep Learning), adaptado para TypeScript puro:

```
Entrada: SparseVector (indices[], values[])
    │
    ├─── Wide Branch (memorizacao)
    │    wideWeights[131,072] × input + wideBias
    │    → wideScore (linear)
    │
    └─── Deep Branch (generalizacao)
         embeddings[131,072 × 8] × input → pooled[8]
              ↓
         hiddenWeights[16 × 8] × pooled + hiddenBias[16]
              ↓ ReLU
         outWeights[16] × hiddenAct + outBias
              ↓
         → deepScore
    │
    score = wideScore + deepScore
    probability = sigmoid(score)
```

**Hiperparametros:**

| Parametro | Valor | Justificativa |
|-----------|-------|---------------|
| dimensions | 131,072 (2^17) | Feature hashing FNV-1a com signed hashing |
| embeddingDim | 8 | Compacto — cada feature ativa projeta em R^8 |
| hiddenDim | 16 | 1 hidden layer ReLU — suficiente para interacoes nao-lineares |
| lrWide | 0.03 | Wide branch converge rapido (memorizar hosts) |
| lrDeep | 0.01 | Deep branch mais conservador (generalizar padroes) |
| L2 | 1e-4 | Regularizacao leve para evitar overfit em poucos exemplos |
| clipGradient | 1.0 | Estabilidade numerica em Float32 |
| minFeatureCount | 5 | Ignora features vistas < 5 vezes (reduz ruido) |

**Otimizador: AdaGrad**
- Acumuladores por parametro: `accum += grad^2`
- Update: `w -= lr * grad / (sqrt(accum) + 1e-8)`
- Adaptativo: features frequentes recebem lr decrescente, features raras mantem lr alto
- Inicializacao: He initialization (`sqrt(2/fan_in)`) para deep branch, seed deterministico (LCG)

**Tamanho em memoria:**
- Wide: 131,072 × 4 bytes × 2 (weights + accum) = ~1 MB
- Embeddings: 131,072 × 8 × 4 × 2 = ~8 MB
- Hidden: 16 × 8 × 4 × 2 = ~1 KB
- **Total: ~9 MB** — viavel no browser

---

## 5. Pipeline de Features (4 min)

**Slide: "3 camadas de sinais — do conteudo ao comportamento"**

### Camada 1: Feature Extractor (conteudo da pagina)

Extrai features categoricas direto do DOM:

| Prefixo | Exemplo | O que captura |
|---------|---------|---------------|
| `host:` | `host:github.com` | Dominio exato (memorizacao) |
| `root:` | `root:github.com` | Dominio raiz (generalizacao subdominios) |
| `tld:` | `tld:com.br` | TLD com suporte a multi-part |
| `kw:` | `kw:repository_code` | Keywords meta com bigrams |
| `title:` | `title:pull_request` | Tokens do titulo |
| `desc:` | `desc:developer_platform` | Tokens da descricao |
| `heading:` | `heading:commits` | Headings H1-H3 |
| `og:` | `og:website` | OpenGraph type |
| `schema:` | `schema:softwareapplication` | JSON-LD schema types |
| `path:` | `path:settings` | Tokens da URL path |
| `lang:` | `lang:en` | Idioma da pagina |
| `flag:` | `flag:video`, `flag:feed`, `flag:editor`, `flag:form`, `flag:shorts` | Deteccao de UI patterns |
| `type:` | `type:editor`, `type:feed` | Tipo inferido da pagina |
| `active_ms:` | `active_ms:<=2m` | Tempo ativo bucketizado |
| `scroll_depth:` | `scroll_depth:>0.75` | Profundidade de scroll |
| `interaction_count:` | `interaction_count:>10` | Cliques/toques |

Tokenizacao: lowercase, Unicode-aware (`\p{L}\p{N}`), stopwords bilingues (EN + PT-BR, ~400 palavras), bigrams, max 40 tokens/campo.

### Camada 2: Behavior Signals (historico de 14 dias)

| Feature | O que mede |
|---------|-----------|
| `beh:freq1d/7d/14d` | Frequencia de visitas por janela temporal |
| `beh:median_active` | Mediana de tempo ativo (sessoes longas vs bounces) |
| `beh:bounce_rate` | Taxa de sessoes < 30s |
| `beh:interaction_rate` | Interacoes por minuto |
| `beh:audible_ratio` | Proporcao de sessoes com audio |
| `beh:distraction_ratio` | Feed + autoplay + shorts detectados |
| `beh:overtime_ratio` | Acessos fora do horario de trabalho |

Labels implicitos derivados (peso 0.25):
- **Produtivo implicito**: mediana >= 3 min, interacao >= 1.5/min, distraction < 50%
- **Procrastinacao implicita**: mediana >= 2 min, distraction >= 60% ou audio >= 30%

### Camada 3: Natural Signals (semantica + atencao)

**Paper: Mark et al. CHI 2008 — "The Cost of Interrupted Work"**

6 Concept Prototypes com cosine similarity em vetores hasheados (256-dim):

| Conceito | Seeds (amostra) | Tipo |
|----------|-----------------|------|
| `work_legal` | juridico, law, tribunal, court filing | Produtivo |
| `work_knowledge` | docs, api, tutorial, research, paper | Produtivo |
| `collaboration` | slack, teams, email, jira, standup | Produtivo |
| `admin_ops` | dashboard, billing, crm, monitoring | Produtivo |
| `social_entertainment` | feed, shorts, reels, meme, viral | Procrastinacao |
| `commerce` | shop, cart, checkout, marketplace | Neutro |

16 sinais continuos com z-score + winsorization (p1/p99):

**Engagement (4 sinais):**
- `dwell_log`: log(1 + activeMs/1000) — tempo de permanencia
- `interaction_rate`: cliques / minutos ativos
- `scroll_completion`: profundidade de leitura [0, 1]
- `audible_ratio_14d`: historico de audio em 14 dias

**Attention (4 sinais) ← Mark et al. CHI 2008:**
- `switch_rate_10m`: trocas de aba / minutos ativos nos ultimos 10 min
- `focus_continuity_10m`: 1 - switch_rate (quanto mais alto, mais focado)
- `return_latency_7d`: log(1 + latencia de retorno ao dominio / 60k) — dominio habitual ou impulso?
- `fragmentation_index`: trocas / (revisitas + 1) — atencao fragmentada

**Task Progress (3 sinais):**
- `edit_density`: interacoes/min em paginas com editor rico
- `form_progress_proxy`: progresso em formularios
- `completion_proxy`: (scroll + dwell) / 2 — completude da tarefa

**Context (4 sinais):**
- `schedule_fit`: acesso dentro do horario configurado
- `out_of_schedule_ratio_14d`: historico de acessos fora de horario
- `vscode_active_15m`: VS Code ativo nos ultimos 15 min (proxy de trabalho)
- `vscode_share_15m`: VS Code share no foco recente

**Reliability (2 sinais):**
- `metadata_quality_score`: qualidade dos metadados (12 checks)
- `signal_stability_7d`: estabilidade dos sinais na semana

**Normalizacao:**
```
z = (winsorized(x, p1, p99) - mean) / std
feature_value = clamp(z / 3, -2, 2)
```
Quando < 20 amostras: fallback `clamp(x / 5, -2, 2)`.

---

## 6. Vectorizacao: Feature Hashing (2 min)

**Slide: "FNV-1a → Espaco esparso de 131K dimensoes"**

```
feature_string → FNV-1a hash → index = hash % 131,072
                              → sign  = (hash & 1) == 0 ? +1 : -1
```

- **Signed hashing**: reduz colisoes pela lei dos grandes numeros — colisoes opostas se cancelam
- **Sem vocabulario**: não precisa manter dicionario de features → memoria constante
- **minFeatureCount = 5**: ignora features vistas menos de 5 vezes (anti-noise gate)
- `Uint32Array[131,072]` de contadores: ~512 KB

Paper de referencia: Weinberger et al. 2009 — "Feature Hashing for Large Scale Multitask Learning"

---

## 7. Calibracao: Temperature Scaling (3 min)

**Slide: "Guo et al. 2017 — On Calibration of Modern Neural Networks"**

**Problema:** redes neurais modernas sao overconfident — P(y|x) ≠ confianca real.

**Solucao no paper:** Temperature Scaling — o metodo mais simples e eficaz.

```
P_calibrated = sigmoid(score / T)
```

**Implementacao:**

| Parametro | Valor |
|-----------|-------|
| Otimizacao | Gradient descent em log(T) |
| Learning rate | 0.02 |
| Epochs | 400 |
| Regularizacao | 1e-4 × log(T) |
| T bounds | [0.05, 20] |
| Min samples | 25 |
| Metrica | ECE (Expected Calibration Error) com 10 bins |

**Fidelidade ao paper:**
- Treina T apenas no **calibration split** (15% dos dados) — nunca no train set
- 1 unico parametro escalar — preserva a ordenacao (accuracy nao muda)
- Gradient: `∂L/∂logT = mean((sigmoid(s/T) - y) × (-s/T)) + λ × logT`

**Reliability diagram:** bins de probabilidade vs frequencia observada — mede visualmente a calibracao.

---

## 8. Validation Gate: Rigor Estatistico (3 min)

**Slide: "O modelo so avanca se provar que melhorou"**

O modelo opera em 2 estagios:

| Estagio | Threshold Produtivo | Threshold Procrastinacao | Condicao |
|---------|--------------------|-----------------------|----------|
| `guarded` | 0.78 (conservador) | 0.28 (conservador) | Inicio |
| `normal` | 0.70 | 0.30 | Aprovado no gate |

**Criterios do Validation Gate (todos devem passar):**

```
1. enoughSamples: n >= 50
2. fprGate: FPR_melhora >= 0.01 OR FPR_melhora_relativa >= 10%
3. precisionGate: precision_drop >= -0.01
4. macroF1Gate: bootstrap_CI_lower(deltaF1) >= 0
5. mcnemarGate: McNemar p < 0.05 AND FPR melhorou
```

**Bootstrap CI:** 1000 iteracoes, resample com reposicao, IC 95% do delta macro-F1 (modelo - baseline).

**McNemar test:** chi-square com correcao de Yates, foco em false productives (erros criticos):
```
chi2 = (|b - c| - 1)^2 / (b + c)
```
onde `b` = baseline errou mas modelo acertou, `c` = modelo errou mas baseline acertou.

**Weighted Brier Score** + **ECE** como metricas complementares.

---

## 9. Active Learning: Review Queue (2 min)

**Slide: "Settles — Active Learning (2009)"**

**Problema:** feedback humano e caro (cada rotulagem exige atencao do usuario).

**Estrategia:** priorizar dominios onde o modelo tem mais a aprender.

```
Fila de revisao (max 20 candidatos)
    │
    ├── Prioridade 1: BORDERLINE (distancia <= 0.05 do threshold)
    │   → "Quase decidiu — precisa de confirmacao humana"
    │
    └── Prioridade 2: UNCERTAINTY SAMPLING (1 - |prob - 0.5| × 2)
        → "Alta incerteza — maximo ganho informacional"
```

**Desempate:** uncertainty mais alta → timestamp mais recente.

**Pseudo-labels (auto-training conservador):**

| Parametro | Valor |
|-----------|-------|
| Threshold positivo | >= 0.93 |
| Threshold negativo | <= 0.07 |
| Estabilidade minima | 3 predicoes consistentes |
| Cooldown por dominio | 12h |
| Limite diario | 20 pseudo-labels |
| Peso da amostra | 0.1 (vs 1.0 explicito) |
| Quarentena de contradicao | 14 dias |
| Conflito com explicito | Lookback de 30 dias |

---

## 10. Training Pipeline (3 min)

**Slide: "Aprendizado online com split deterministico"**

### Split Deterministico (sem shuffle)

```
FNV-1a(domain) % 100 → bucket
  0-69:  train      (70%)
  70-84: calibration (15%)
  85-99: test        (15%)
```

- Deterministico: mesmo dominio sempre no mesmo split
- Sem data leakage: dominio inteiro em 1 split
- Nao precisa de random seed — hash do dominio define

### Fluxo de Treinamento

```
Feedback explicito do usuario
    ↓
TrainingStore.addExample(domain, features, label, weight=1.0)
    ↓ Split deterministico
    ↓
train split → model.update(vector, label, weight) [online SGD]
    ↓
Periodicamente:
    calibration split → temperatureScaler.fit() [400 epochs gradient descent]
    test split → evaluateValidationGate() [bootstrap + McNemar]
```

### Persistencia

- **IndexedDB**: 3 object stores (examples, behavior, meta)
- **Retention**: 30 dias
- **Limites**: 25,000 train + 2,000 calibration + 2,000 test
- **Reservoir sampling**: quando no limite, substitui uniformemente

### Warm Start (migracao entre versoes)

```
v1 (logistic regression) → wide weights copiados
v2 (FTRL dual-model) → FTRL z,n → w = -(z - sign*l1) / ((beta+sqrt(n))/alpha + l2)
v3 (neural + Platt) → wideWeights + wideBias copiados diretamente
v4 (neural + temperature) → wideWeights + wideBias copiados diretamente
```

---

## 11. Conexao Paper ↔ Codigo (2 min)

**Slide: "Da teoria a implementacao"**

### Guo et al. 2017 — Temperature Scaling

| Paper | Implementacao |
|-------|--------------|
| "post-hoc calibration method" | `TemperatureScaler.fit()` — treina T apos modelo fixo |
| "single scalar parameter T" | `this.temperature` — 1 Float64 |
| "optimized on validation set" | Split de calibracao (15%) via FNV-1a deterministico |
| "preserves accuracy" | `sigmoid(score/T)` — mesma ordenacao, probabilidades corrigidas |
| "ECE as evaluation metric" | `calculateExpectedCalibrationError()` — 10 bins |

### Settles 2009 — Active Learning

| Paper | Implementacao |
|-------|--------------|
| "uncertainty sampling" | `uncertainty = 1 - |prob - 0.5| × 2` |
| "query-by-committee" | Nao usado — single model, adaptado para borderline priority |
| "informative instances" | Review queue com priorizacao borderline > uncertainty |
| "pool-based active learning" | Fila passiva — espera feedback do usuario, nao faz query ativa |

### Mark et al. CHI 2008 — Cost of Interrupted Work

| Paper | Implementacao |
|-------|--------------|
| "frequency of task switching" | `switch_rate_10m`: trocas/min nos ultimos 10 min |
| "resumption lag after interruption" | `return_latency_7d`: latencia de retorno ao dominio |
| "fragmented attention" | `fragmentation_index`: trocas / (revisitas + 1) |
| "sustained attention episodes" | `focus_continuity_10m`: 1 - switch_rate |
| "context switching cost" | `vscode_share_15m`: proxy de contexto de trabalho ativo |

---

## 12. Diferenciais Tecnicos (2 min)

**Slide: "O que torna isso unico"**

1. **Modelo neural completo em TypeScript puro** — sem ONNX, TensorFlow.js ou WebGL. Forward + backprop + AdaGrad em ~480 linhas.

2. **Online learning real** — nao e batch retraining. Cada feedback atualiza o modelo imediatamente via SGD.

3. **3 camadas de evidencia** — conteudo (DOM) + comportamento (14 dias) + semantica/atencao (natural signals).

4. **Calibracao rigorosa** — Temperature Scaling de Guo et al. com split dedicado + ECE monitoring.

5. **Validation gate estatistico** — bootstrap CI + McNemar + multi-criteria. O modelo nao avanca de estagio sem prova estatistica.

6. **Active learning passivo** — borderline priority + uncertainty sampling sem interromper o usuario.

7. **Explicabilidade local** — `vectorizer.explain()` retorna top-K features por peso × valor.

8. **Schema evolution sem perda** — 4 versoes de modelo (v1→v4) com warm-start automatico.

9. **Privacidade by design** — zero bytes enviados para qualquer servidor. Tudo no IndexedDB.

---

## 13. Numeros do Sistema (1 min)

**Slide: "Em numeros"**

| Metrica | Valor |
|---------|-------|
| Dimensoes do espaco de features | 131,072 |
| Embedding dim | 8 |
| Hidden neurons | 16 |
| Total de parametros | ~1.2M (wide) + ~1.05M (embeddings) + 272 (deep) |
| Memoria em runtime | ~9 MB |
| Latencia forward pass | < 5ms |
| Features por pagina | 30-80 (categoricas + continuas) |
| Natural signals | 16 sinais continuos + 6 conceitos semanticos |
| Concept vector dim | 256 (hashed) |
| Stopwords | ~400 (EN + PT-BR) |
| Train/Calibration/Test split | 70% / 15% / 15% |
| Max training examples | 25,000 + 2,000 + 2,000 |
| Bootstrap iterations | 1,000 |
| Validation min samples | 50 |
| Pseudo-label threshold | >= 0.93 (pos) / <= 0.07 (neg) |
| Active learning queue | max 20 candidatos |
| Idiomas suportados | 13 |
| Linhas de codigo ML | ~3,500 (13 arquivos) |
| Dependencias externas ML | 0 |

---

## 14. Limitacoes e Trabalho Futuro (1 min)

**Slide: "Honestidade intelectual"**

**Limitacoes atuais:**
- Feature hashing tem colisoes — signed hashing mitiga mas nao elimina
- Deep branch com 1 hidden layer — capacidade limitada para interacoes complexas
- Pseudo-labels podem amplificar bias do modelo (confidence threshold alto mitiga)
- Normalizacao z-score precisa de >= 20 amostras para estabilizar

**Possibilidades futuras:**
- Quantizacao INT8 dos embeddings (reducao de 4× na memoria)
- Attention pooling no deep branch (substituir mean pooling)
- Contrastive learning para concept vectors
- Federated averaging opt-in (agregar modelos sem compartilhar dados)

---

## Apendice: Arquivos do Sistema

| Arquivo | Linhas | Responsabilidade |
|---------|--------|-----------------|
| `wideDeepLite.ts` | 482 | Modelo neural (forward + backprop + AdaGrad) |
| `vectorizer.ts` | 159 | Feature hashing FNV-1a + explicabilidade |
| `featureExtractor.ts` | 701 | Extracao de features do DOM |
| `naturalSignals.ts` | 644 | 16 sinais + 6 conceitos semanticos |
| `behaviorSignals.ts` | 176 | Agregacao comportamental 14 dias |
| `temperatureScaler.ts` | 150 | Calibracao (Guo et al.) |
| `validationGate.ts` | 386 | Validation estatistico (bootstrap + McNemar) |
| `reviewQueue.ts` | 105 | Active learning queue (Settles) |
| `trainingStore.ts` | ~600 | IndexedDB + split deterministico |
| `modelStore.ts` | 320 | Persistencia + warm-start + schema migration |
| `ml-engine.ts` | ~1500 | Orquestrador (pipeline completo) |
| `featureScenarios.ts` | ~100 | Projecao de features para replay/ablation |
| `calibrationMetrics.ts` | ~80 | ECE + reliability bins |

---

## Referencias

1. **Guo, C., Pleiss, G., Sun, Y., & Weinberger, K. Q.** (2017). On Calibration of Modern Neural Networks. *ICML 2017*. Proceedings of Machine Learning Research, 70, 1321-1330.

2. **Settles, B.** (2009). Active Learning Literature Survey. *Computer Sciences Technical Report 1648*, University of Wisconsin-Madison.

3. **Mark, G., Gudith, D., & Klocke, U.** (2008). The Cost of Interrupted Work: More Speed and Stress. *CHI 2008*, ACM Conference on Human Factors in Computing Systems.

4. **Cheng, H.-T., et al.** (2016). Wide & Deep Learning for Recommender Systems. *DLRS 2016*.

5. **Weinberger, K., Dasgupta, A., Langford, J., Smola, A., & Attenberg, J.** (2009). Feature Hashing for Large Scale Multitask Learning. *ICML 2009*.
