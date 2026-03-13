# ML Replay CLI

Runner offline para treino + replay comparativo do modelo de classificacao.

## Requisitos

- Node 18+ (o projeto usa `tsx` para executar scripts TypeScript em `tools/`).
- Dependencias instaladas (`npm install`).

## Como executar

```bash
npm run ml:replay -- --input /caminho/dataset.json
```

Para exportar um dataset real do perfil local do Chrome:

```bash
npm run ml:export:chrome
```

O exporter auto-descobre a extensao Saul no perfil local, bootstrapa um ambiente Python isolado em `tools/.cache/ml-replay-dfindexeddb/` e gera um JSON compatível com o replay em `artifacts/ml-replay/`.
Quando os exemplos ja estiverem persistidos com contexto enriquecido, o exporter leva junto `featureNames`, `naturalPrediction`/`naturalProbability` e `naturalSelfPrediction`/`naturalSelfProbability`.

Opcoes principais:

- `--input` (obrigatorio): dataset JSON.
- `--out-dir` (default: `artifacts/ml-replay`): pasta base dos artefatos.
- `--name`: nome da execucao.
- `--seed` (default: `4242`): seed do split estratificado.
- `--train-ratio` (default: `0.8`): fallback do split aleatorio quando nao houver timestamp suficiente.
- `--bootstrap-iterations` (default: `1000`): iteracoes bootstrap do validation gate.
- `--min-samples` (default: `50`): minimo de amostras para gate.
- `--dimensions` (opcional): dimensao do vetor; sem informar, usa `max(index)+1`.
- `--min-feature-count` (default: `5`): threshold de frequencia minima por feature.

## Formato de entrada

Aceita:

- JSON como array de linhas, ou
- objeto com `samples: []`.

Campos minimos por linha:

```json
{
  "label": 1,
  "vector": {
    "indices": [12, 99],
    "values": [1.0, -0.3]
  }
}
```

Campos recomendados:

- `createdAt` ou `timestamp`
- `source` (`explicit` ou `implicit`)
- `split` (`train`, `calibration`, `test`)
- `weight`
- `baselinePrediction` ou `baselineScore`
- `naturalPrediction` e `naturalProbability`
- `naturalSelfPrediction` e `naturalSelfProbability`
- `featureNames` (opcional, alinhado ao vetor) para habilitar `attentionAblation`

Regras:

- Linhas invalidas sao descartadas e contabilizadas no relatorio.
- `weight` ausente usa fallback por fonte:
- `explicit = 1.0`
- `implicit = 0.1`
- Cenarios `natural` e `natural+self` so rodam quando o split de teste tiver os campos exigidos; caso contrario ficam como `skipped_missing_fields`.
- `attentionAblation` so roda quando houver `featureNames` por amostra ou `featureDictionary` global.
- Se o dataset ja trouxer `split` para todas as amostras `explicit`, o replay respeita esses splits diretamente.
- Se todas as amostras `explicit` tiverem timestamp, o replay usa split cronologico `70/15/15` em `train/calibration/test`.
- Sem timestamps suficientes, o replay usa split estratificado aleatorio deterministico por seed.

## Export do Chrome

Opcoes principais do exporter:

- `--chrome-user-data-dir`: pasta de perfis do Chrome.
- `--profile`: nome do perfil (`Default`, `Profile 1`, etc.).
- `--extension-id`: ID da extensao, se voce quiser pular autodiscovery.
- `--output`: caminho final do JSON.
- `--name`: prefixo do arquivo exportado.

Exemplo ponta a ponta:

```bash
EXPORT_JSON=$(npm run -s ml:export:chrome | awk '/^Export concluido:/ {print $3}')
npm run ml:replay -- --input "$EXPORT_JSON"
```

## O que o script faz

1. Valida e normaliza o dataset.
2. Faz split em `train/calibration/test`, cronologico para exemplos explicitos quando possivel.
3. Mantem exemplos `implicit` somente em `train`.
4. Treina `WideDeepLiteBinary` no split de treino.
5. Aplica threshold de frequencia minima por feature no treino e na inferencia.
6. Calibra com `TemperatureScaler` usando apenas `calibration`.
7. Avalia cenarios com `evaluateValidationGate` usando apenas `test`:
- `baseline`
- `trained`
- `natural` (se disponivel)
- `natural+self` (se disponivel)
8. Gera bins de confiabilidade em 10 faixas e uma ablacão `no_attention` quando o dataset informar nomes de features.

## Artefatos

Por padrao gera em:

`artifacts/ml-replay/<run-name>/`

Arquivos:

- `report.json`: output estruturado completo.
- `report.md`: resumo legivel para revisao rapida.

Metricas principais:

- `falseProductiveRate`
- `precisionProductive`
- `deltaMacroF1`
- `ece`
- `gatePassed`
- `attentionAblation`
- `reliabilityBins`
