# Como Construi um Modelo Neural do Zero no Browser

## TypeScript puro, zero dependencias, privacidade total

---

## 1. O Desafio (2 min)

### **Slide: "Classificar dominios sem servidor"**

**Objetivo:** classificar automaticamente sites como produtivo/procrastinacao dentro de uma Chrome Extension.

**O que eu NAO podia usar:**

- TensorFlow.js (bundle ~500KB+, WebGL flaky em Service Workers MV3)
- ONNX Runtime Web (~2MB, precisa de WASM)
- API externa (viola privacidade — compromisso central do produto)
- Python / qualquer backend (extensao e 100% client-side)
- WebGPU (nao disponivel em Service Workers MV3)

**O que eu TINHA:**

- TypeScript puro com Float32Array
- IndexedDB para persistencia
- ~50ms de budget por classificacao (Service Worker lifecycle)
- ~10MB de memoria disponivel

**Decisao:** implementar tudo do zero. Forward pass, backprop, otimizador, feature engineering, calibracao, validacao.

---

## 2. Arquitetura Geral (2 min)

### **Slide: "Do DOM ao aprendizado — tudo no browser"**

```text
┌─────────────────────────────────────────────────────────┐
│                    Chrome Extension                      │
│                                                         │
│  Content Script                Service Worker            │
│  ┌──────────────┐             ┌────────────────────────┐│
│  │ Coleta DOM:  │  metadata   │   MlSuggestionEngine   ││
│  │ title, meta, │ ─────────→ │                        ││
│  │ headings,    │             │ FeatureExtractor       ││
│  │ flags, etc.  │             │      ↓                 ││
│  │              │             │ BehaviorSignals (14d)  ││
│  │              │  sugestao   │      ↓                 ││
│  │ Toast UI ←── │ ←───────── │ NaturalSignals (16+6)  ││
│  │              │             │      ↓                 ││
│  │              │  feedback   │ FeatureVectorizer      ││
│  │ Botao ────── │ ─────────→ │      ↓                 ││
│  │ Confirmar    │             │ WideDeepLiteBinary     ││
│  └──────────────┘             │      ↓                 ││
│                               │ TemperatureScaler      ││
│                               │      ↓                 ││
│                               │ Decision + Explain     ││
│                               │      ↓                 ││
│                               │ ValidationGate         ││
│                               └───────────┬────────────┘│
│                                           │              │
│                               ┌───────────▼────────────┐│
│                               │      IndexedDB         ││
│                               │ modelo + exemplos +    ││
│                               │ comportamento + meta   ││
│                               └────────────────────────┘│
└─────────────────────────────────────────────────────────┘
```

Tudo roda em **uma unica chamada sincrona** no Service Worker. Zero network. Zero workers auxiliares.

---

## 3. O Modelo — WideDeepLiteBinary (5 min)

### **Slide: "482 linhas de TypeScript que substituem um framework"**

### Por que Wide & Deep?

| Branch | Papel | Analogia |
|--------|-------|----------|
| **Wide** (linear) | Memoriza padroes diretos | "github.com → produtivo" |
| **Deep** (neural) | Generaliza interacoes | "sites com editor + muitas interacoes → produtivo" |

### Arquitetura

```text
Entrada: SparseVector (indices[], values[])
    │
    ├─── Wide Branch (memorizacao)
    │    wideWeights[131,072] × input + wideBias
    │    → wideScore (linear)
    │
    └─── Deep Branch (generalizacao)
         embeddings[131,072 × 8] × input
              ↓ soma ponderada → pooled[8]
         hiddenWeights[16 × 8] × pooled + hiddenBias[16]
              ↓ ReLU
         outWeights[16] × hiddenAct + outBias
              ↓
         → deepScore
    │
    score = wideScore + deepScore
    probability = sigmoid(score / T)   ← Temperature Scaling
```

### Como implementei o forward pass

```typescript
// wideDeepLite.ts — forward pass esparso
private forward(vector: SparseVector): ForwardCache {
  let wideScore = this.wideBias;
  const pooled = new Float32Array(this.embeddingDim); // [8]

  // Itera APENAS sobre features ativas (esparso!)
  for (let i = 0; i < vector.indices.length; i++) {
    const index = vector.indices[i];
    const value = vector.values[i];

    // Wide: soma ponderada linear
    wideScore += this.wideWeights[index] * value;

    // Deep: acumula embedding ponderado
    const offset = index * this.embeddingDim;
    for (let j = 0; j < this.embeddingDim; j++) {
      pooled[j] += this.embeddings[offset + j] * value;
    }
  }

  // Hidden layer: ReLU(W × pooled + bias)
  for (let h = 0; h < this.hiddenDim; h++) {
    let total = this.hiddenBias[h];
    for (let j = 0; j < this.embeddingDim; j++) {
      total += this.hiddenWeights[h * this.embeddingDim + j] * pooled[j];
    }
    hiddenAct[h] = total > 0 ? total : 0; // ReLU inline
  }

  score = wideScore + deepScore;
  probability = sigmoid(score);
}
```

**Ponto critico:** o loop so percorre features ativas (~30-80 por pagina), nao as 131K dimensoes. Forward pass e O(|features| × embeddingDim).

### Hiperparametros e justificativas

| Parametro | Valor | Por que esse valor |
|-----------|-------|-------------------|
| dimensions | 2^17 (131,072) | Feature hashing — espaco grande reduz colisoes |
| embeddingDim | 8 | Compacto — cada feature projeta em R^8, suficiente para capturar relacoes |
| hiddenDim | 16 | 1 hidden layer. Mais seria desperdicio com ~25K exemplos max |
| lrWide | 0.03 | Wide branch memoriza hosts — precisa convergir rapido |
| lrDeep | 0.01 | Deep branch generaliza — mais conservador para nao overfit |
| L2 | 1e-4 | Regularizacao leve, evita overfit em poucos exemplos |
| clipGradient | 1.0 | Float32 tem precisao limitada — sem clipping, NaN em 48h |
| minFeatureCount | 5 | Features vistas <5x sao ruido — ignora |

### Otimizador: AdaGrad

```typescript
function applyAdaGradToArray(values, accum, index, gradient, lr) {
  accum[index] += gradient * gradient;           // Acumula grad^2
  const denom = Math.sqrt(accum[index]) + 1e-8;  // sqrt + epsilon
  values[index] -= (lr * gradient) / denom;       // Step adaptativo
}
```

**Por que AdaGrad e nao Adam?**

- Adam precisa de 3 arrays auxiliares (m, v, v_hat) por parametro → triplicaria ~9MB → ~27MB
- AdaGrad precisa de 1 array (accum) → ~9MB total e viavel
- Para features esparsas, AdaGrad e ideal: features raras mantem lr alto, features frequentes desaceleram naturalmente

### Memoria total

| Componente | Calculo | Tamanho |
|-----------|---------|---------|
| Wide weights + accum | 131,072 × 4B × 2 | ~1 MB |
| Embeddings + accum | 131,072 × 8 × 4B × 2 | ~8 MB |
| Hidden + output | (16×8 + 16 + 16) × 4B × 2 | ~1 KB |
| Feature counts | 131,072 × 4B | ~512 KB |
| **Total** | | **~9.5 MB** |

Viavel no browser. Service Worker nao morre por OOM.

---

## 4. Feature Engineering — 3 Camadas (5 min)

### **Slide: "Do DOM cru ao vetor esparso — 3 niveis de sinais"**

### Camada 1: Conteudo da Pagina (`featureExtractor.ts`)

O content script coleta metadados do DOM. O extractor transforma em features categoricas:

| Prefixo | Exemplo | Captura |
|---------|---------|---------|
| `host:` | `host:github.com` | Dominio exato |
| `root:` | `root:github.com` | Raiz (generaliza subdomains) |
| `tld:` | `tld:com.br` | TLD multi-part |
| `kw:` | `kw:repository_code` | Keywords meta (+ bigrams) |
| `title:` | `title:pull_request` | Tokens do titulo |
| `heading:` | `heading:commits` | Headings H1-H3 |
| `schema:` | `schema:softwareapplication` | JSON-LD types |
| `flag:` | `flag:video`, `flag:feed`, `flag:editor` | Deteccao de UI patterns |
| `type:` | `type:editor` | Tipo inferido |
| `active_ms:` | `active_ms:<=2m` | Tempo ativo bucketizado |
| `scroll_depth:` | `scroll_depth:>0.75` | Profundidade |

**Tokenizacao:** Unicode-aware (`\p{L}\p{N}`), stopwords bilingues (EN + PT-BR, ~400 palavras), bigrams automaticos.

### Camada 2: Comportamento 14 Dias (`behaviorSignals.ts`)

**Problema:** a mesma pagina pode ser produtiva ou nao dependendo de COMO o usuario interage. YouTube tutorial vs YouTube shorts.

Cada visita grava um evento no IndexedDB. Agrego sobre 14 dias:

| Feature | O que captura |
|---------|--------------|
| `beh:freq1d/7d/14d` | Frequencia de visitas |
| `beh:median_active` | Mediana de tempo ativo (sessoes longas vs bounces) |
| `beh:bounce_rate` | % sessoes < 30 segundos |
| `beh:interaction_rate` | Cliques por minuto |
| `beh:audible_ratio` | % sessoes com audio |
| `beh:distraction_ratio` | % sessoes com feed/autoplay/shorts |
| `beh:overtime_ratio` | % acessos fora do horario |

**Labels implicitos derivados (peso 0.25):**

```typescript
// Produtivo implicito: sessoes longas + muita interacao + pouca distracao
if (medianActive >= 3min && interaction >= 1.5/min && distraction < 50%)
  → label: 1, weight: 0.25

// Procrastinacao implicita: sessoes longas + muita distracao OU audio
if (medianActive >= 2min && (distraction >= 60% || audio >= 30%))
  → label: 0, weight: 0.25
```

### Camada 3: Natural Signals — Semantica + Atencao (`naturalSignals.ts`)

**Conceitos semanticos sem word2vec:**

Construi 6 prototipos de conceito com seed words multilingues:

| Conceito | Seeds (amostra) |
|----------|-----------------|
| `work_legal` | juridico, law, tribunal, court filing |
| `work_knowledge` | docs, api, tutorial, research, paper |
| `collaboration` | slack, teams, email, jira, standup |
| `admin_ops` | dashboard, billing, crm, monitoring |
| `social_entertainment` | feed, shorts, reels, meme, viral |
| `commerce` | shop, cart, checkout, marketplace |

**Como funciona:** hasheo o texto da pagina e os seeds em vetores densos de 256 dims (signed hashing). Calculo cosine similarity → top-3 viram features `sem:intent:*`.

**16 sinais continuos:**

**Engagement (4):** dwell time (log), interaction rate, scroll depth, audio ratio 14d

**Attention (4) ← Mark et al. CHI 2008:**

- `switch_rate_10m` — trocas de aba por minuto (ultimos 10 min)
- `focus_continuity_10m` — 1 - switch_rate (foco sustentado)
- `return_latency_7d` — log da latencia de retorno (habito vs impulso)
- `fragmentation_index` — trocas / (revisitas + 1) (atencao fragmentada)

**Task Progress (3):** edit density em editors, form progress, completion proxy

**Context (4):** horario de trabalho, out-of-schedule ratio, VS Code ativo 15min, VS Code share

**Reliability (2):** metadata quality (12 checks), signal stability 7d

**Normalizacao — z-score com winsorization:**

```typescript
function zScoreWithWinsorization(value, samples) {
  if (samples.length < 20) return clamp(value / 5, -2, 2); // Fallback
  const p01 = percentile(sorted, 0.01);
  const p99 = percentile(sorted, 0.99);
  const winsorized = clamp(value, p01, p99);  // Remove outliers
  const z = (winsorized - mean) / std;
  return clamp(z / 3, -2, 2);
}
```

Cada sinal mantem historico de 256 amostras no IndexedDB para media/std movel.

---

## 5. Feature Hashing — FNV-1a (2 min)

### **Slide: "Sem vocabulario, sem out-of-vocabulary"**

**Problema:** features sao strings arbitrarias. Modelo precisa de indices numericos.
**Solucao classica:** dicionario `{feature → index}` → cresce infinitamente.
**Minha solucao:** feature hashing (Weinberger et al. 2009)

```typescript
function fnv1a(value: string): number {
  let hash = 0x811c9dc5;               // FNV offset basis
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193); // FNV prime
  }
  return hash >>> 0;
}

index = hash % 131_072;
sign  = (hash & 1) === 0 ? +1 : -1;   // Signed hashing
```

**Signed hashing:** features que colidem no mesmo index recebem sinais opostos → pela lei dos grandes numeros, contribuicoes se cancelam. Sem isso, colisoes enviesam o modelo.

**minFeatureCount = 5:** `Uint32Array[131,072]` conta ocorrencias. Features vistas <5x sao ignoradas na predicao — anti-noise gate.

**Resultado:** memoria fixa (~512KB de contadores), zero alocacao dinamica, O(|features|) por predicao.

---

## 6. Calibracao — Temperature Scaling (3 min)

### **Slide: "Guo et al. 2017 — 1 parametro escalar que corrige a confianca"**

### O problema

O modelo produz `sigmoid(score)` — mas essa probabilidade e mal calibrada. Redes neurais sao overconfident (Guo et al. 2017). Quando diz "80% produtivo", na verdade acerta ~60%.

### A solucao do paper

```typescript
P_calibrada = sigmoid(score / T)
```

- T > 1 → "esfria" (mais incerto)
- T < 1 → "esquenta" (mais confiante)
- 1 unico parametro escalar → preserva ranking, so corrige confianca

### Como implementei

```typescript
// temperatureScaler.ts
fit(samples) {
  let logT = Math.log(this.temperature);

  for (let epoch = 0; epoch < 400; epoch++) {
    let gradient = 0;
    for (const sample of usable) {
      const T = Math.exp(logT);
      const scaled = sample.score / T;
      const prob = sigmoid(scaled);
      gradient += (prob - sample.label) * (-scaled) * sample.weight;
    }
    gradient = gradient / totalWeight + 1e-4 * logT;  // Regularizacao
    logT -= 0.02 * gradient;
    logT = clamp(logT, Math.log(0.05), Math.log(20));
  }

  this.temperature = Math.exp(logT);
}
```

**Decisoes-chave:**

- Otimizo em `log(T)` → garante T > 0 sem constraints
- Regularizacao `1e-4 × logT` → puxa T para 1 quando dados escassos
- Treino APENAS no calibration split (15%) — fiel ao paper
- Recalibro 1x/dia ou a cada 50 feedbacks explicitos
- Min 25 amostras para caber

**Metrica:** ECE (Expected Calibration Error) com 10 reliability bins.

---

## 7. Validation Gate (3 min)

### **Slide: "O modelo so relaxa thresholds com prova estatistica"**

### O sistema de guardrails

```text
GUARDED (inicio)                 NORMAL (apos gate)
Threshold produtivo:   0.78      Threshold produtivo:   0.70
Threshold procrastinacao: 0.28   Threshold procrastinacao: 0.30
→ Muito conservador               → Classifica mais dominios
```

### Os 5 criterios (todos devem passar)

```typescript
const gatePassed =
  n >= 50                                         // Amostras suficientes
  && (fprDrop >= 0.01 || relFprDrop >= 0.10)      // FPR melhorou
  && precisionDrop >= -0.01                        // Precision nao caiu
  && bootstrapCI95_lower(deltaF1) >= 0             // Macro-F1 melhorou (IC 95%)
  && mcnemarP < 0.05 && fprMelhorou               // Estatisticamente significativo
  && highConfidenceEce <= 0.05;                    // Calibracao precisa
```

### Bootstrap CI — implementado do zero

```typescript
for (let i = 0; i < 1000; i++) {
  const resample = Array(n).fill(0).map(() => samples[floor(rng() * n)]);
  deltas.push(macroF1(resample, 'model') - macroF1(resample, 'baseline'));
}
deltas.sort();
return { lower: deltas[floor(0.025 * 999)], upper: deltas[floor(0.975 * 999)] };
```

### McNemar com correcao de Yates

```typescript
// Foco em false productives (erro critico do produto)
// b = baseline errou mas modelo acertou
// c = modelo errou mas baseline acertou
const chi2 = (|b - c| - 1)^2 / (b + c);
const pValue = erfc(sqrt(chi2 / 2));  // implementei erfc com polinomio de Horner
```

Escolhi McNemar porque compara os MESMOS exemplos com 2 classificadores (pareado). Nao assume independencia.

---

## 8. Active Learning + Auto-Training (3 min)

### **Slide: "Cada clique do usuario vale ouro"**

### Review Queue (Settles 2009)

```
Fila de revisao (max 20 candidatos)
   │
   ├── Prioridade 1: BORDERLINE (|prob - threshold| <= 0.05)
   │   "Quase decidiu — precisa de humano"
   │
   └── Prioridade 2: UNCERTAINTY (1 - |prob - 0.5| × 2)
       "Maximo ganho informacional"
```

### Auto-training com Pseudo-labels

Quando a confianca e extrema, gero label automatico — mas com 7 camadas de protecao:

```text
1. prob >= 0.93 ou prob <= 0.07        ← Threshold de confianca
2. Quarentena 14 dias se contradisse   ← Usuario corrigiu → para
3. Cooldown 12h por dominio            ← Nao repete muito rapido
4. Max 20 pseudo-labels/dia            ← Limite global
5. 3 predicoes consistentes em 7 dias  ← Estabilidade temporal
6. Sem conflito com explicito (30d)    ← Humano sempre tem prioridade
7. FPR <= baseline + 0.5%             ← Risk window saudavel
```

Peso: `0.1` (vs `1.0` explicito) — modelo aprende 10x mais devagar com auto-gerados.

---

## 9. Training Pipeline + Persistencia (3 min)

### **Slide: "Online learning com split deterministico no IndexedDB"**

### Split sem shuffle

```typescript
const bucket = fnv1a(domain) % 100;
if (bucket < 70)  → train split
if (bucket < 85)  → calibration split
else              → test split
```

**Por que deterministico:** mesmo dominio SEMPRE no mesmo split. Zero data leakage. Nao precisa de random seed.

### Fluxo de treinamento

```text
Feedback explicito ("github.com e produtivo")
    ↓
vectorizer.incrementCounts(vector.indices)
model.update(vector, label=1, weight=1.0)   ← SGD online imediato
trainingStore.addExample(...)                ← Persiste no IndexedDB
    ↓
maybeRecalibrate()  → refit T se 1x/dia ou 50+ feedbacks
maybeEvaluateValidation() → re-check gate com bootstrap + McNemar
persistContext() → salva modelo inteiro no IndexedDB
```

### Storage

```text
IndexedDB: "sg-ml-training"
├── examples     → training examples (vector + label + weight + metadata)
├── behavior     → eventos comportamentais por dominio (14 dias)
└── meta         → contadores, quarentenas, historico pseudo

IndexedDB: "sg-ml-models"
└── models → StoredModelStateV4 (pesos + calibracao + validacao + stats)
```

Limites: 25,000 train + 2,000 calibration + 2,000 test. Retencao 30 dias. Reservoir sampling quando cheio.

---

## 10. Explicabilidade (2 min)

### **Slide: "Cada sugestao explica por que"**

### Como gero razoes

```typescript
// Para cada feature ativa:
contribution = wideWeight[hash(feature)] × sign × value;
// Ordena por |contribution|

// Selecao balanceada:
pickBySource('natural', 2);    // Ate 2 sinais naturais
pickBySource('behavior', 2);   // Ate 2 comportamentais
pickBySource('content', 2);    // Ate 2 de conteudo
// + 1 counter-argument (evidencia oposta mais forte)
```

### O que o usuario ve

```text
"Este dominio parece produtivo"
✓ Continuidade de foco no periodo recente
✓ Taxa de interacao consistente
✓ Frequencia de visita moderada nos ultimos 7 dias
✗ Historico de sessoes com audio (contra-evidencia)
```

Nao e LLM gerando texto — cada sinal tem um template fixo mapeado por feature key.

---

## 11. O Pipeline Completo (2 min)

### **Slide: "Uma requisicao, ponta a ponta"**

```text
Usuario visita github.com/pulls
    │
    ▼
[1] Content Script coleta metadata do DOM
    │
    ▼
[2] buildSuggestion()
    ├── recordBehaviorEvent() → grava no IndexedDB
    ├── aggregateBehavior(14d) → stats + attention snapshot
    ├── extract(metadata)      → features de conteudo
    ├── buildBehaviorFeatureMap() → features de comportamento
    ├── buildNaturalSignalFeatures() → 16 sinais + 6 conceitos
    ├── vectorize(allFeatures)  → SparseVector via FNV-1a
    ├── model.predictScore()    → raw score (forward pass < 5ms)
    ├── calibration.transform() → P calibrada (sigmoid(score/T))
    ├── classifyFromThresholds() → 'productive' (0.78 guarded)
    ├── buildReasonPayload()    → explicacoes balanceadas
    └── tryImplicitTraining()   → pseudo-label se seguro
    │
    ▼
[3] Toast: "github.com parece produtivo. Confirmar?"
    │
    ▼
[4] applyExplicitFeedback()
    ├── model.update(SGD online)
    ├── maybeRecalibrate()
    ├── maybeEvaluateValidation()
    └── persistContext(IndexedDB)
```

---

## 12. O Que Aprendi (2 min)

### **Slide: "Licoes de ML from scratch no browser"**

1. **Float32 nao e Float64.** Gradient clipping e `Number.isFinite()` em todo lugar — sem isso, NaN em 48h de uso real.

2. **AdaGrad > Adam para esparsidade.** Adam precisaria de 3× a memoria. AdaGrad com 1 acumulador cabe em 9MB.

3. **Temperature Scaling funciona com 25 amostras.** Platt Scaling (2 params) overfit com poucos dados. Temperature (1 param) converge rapido. Guo et al. tinham razao.

4. **Feature hashing elimina toda uma classe de bugs.** Sem vocabulario = sem OOV, sem resize, sem serialization mismatch.

5. **Pseudo-labels precisam de camadas de protecao.** Cada guard que adicionei existe porque o anterior falhou em producao.

6. **Validation Gate muda o comportamento do sistema.** Sem gate, thresholds agressivos desde dia 1 → falsos produtivos. Com gate, comeca conservador e so relaxa com prova estatistica.

7. **Determinismo e debuggability.** LCG seed fixa para inicializacao. FNV-1a para splits. Modelo reproduzivel entre maquinas.

---

## 13. Numeros (1 min)

| | |
|---|---|
| Linhas de codigo ML | ~3,500 |
| Arquivos ML | 13 |
| Dependencias externas | **0** |
| Parametros do modelo | ~2.2M |
| Memoria runtime | ~9.5 MB |
| Forward pass | < 5ms |
| Backprop (update) | < 15ms |
| Features por pagina | 30-80 |
| Sinais naturais | 16 continuos + 6 conceitos |
| Train/Cal/Test split | 70/15/15% |
| Max training examples | 25K + 2K + 2K |
| Bootstrap iterations | 1,000 |
| Pseudo-label threshold | >= 0.93 / <= 0.07 |
| Review queue | max 20 candidatos |

---

## Apendice: Papers de Referencia

1. **Guo, Pleiss, Sun & Weinberger** (2017). On Calibration of Modern Neural Networks. ICML.
   → Temperature Scaling
2. **Settles** (2009). Active Learning Literature Survey. UW-Madison.
   → Review Queue + Uncertainty Sampling
3. **Mark, Gudith & Klocke** (2008). The Cost of Interrupted Work. CHI.
   → Sinais de atencao (switch rate, fragmentation, return latency)
4. **Cheng et al.** (2016). Wide & Deep Learning for Recommender Systems.
   → Arquitetura Wide + Deep
5. **Weinberger et al.** (2009). Feature Hashing for Large Scale Multitask Learning. ICML.
   → FNV-1a signed hashing
