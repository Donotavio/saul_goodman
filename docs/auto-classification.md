# Classificação automática e aprendizado local

Este documento explica como a extensão sugere categorias (Produtivo, Procrastinação, Neutro) e como o modelo local aprende com as suas escolhas, sempre sem sair do navegador.

## O que coletamos para sugerir

- Hostname da aba atual.
- Metadados leves da página: `<title>`, `meta description`, `meta keywords`, `meta property="og:type"`.
- Flags estruturais: presença de player de vídeo, autoplay, feed/shorts/reels, formulário, editor rico, tabela grande e indícios de scroll infinito.
- Esquemas leves: `schema.org` (`itemtype`) para detectar `Article/TechArticle/VideoObject/...`.
- Cabeçalhos (h1–h3) e tokens de caminho da URL (ex.: `/watch`, `/dashboard`, `/issues/...`).
- Idioma da página (via `lang`).
- Nunca coletamos conteúdo completo, texto da página ou interações; nada é enviado para a rede.

## Heurística base (determinística)

1) **Hosts conhecidos**: lista embutida de domínios produtivos e de procrastinação (com match em subdomínios) gera um sinal forte.  
2) **Palavras‑chave**: termos produtivos/procrastinação em hostname, título, description ou keywords somam pontos médios (proteção contra duplicidade por fonte).  
3) **Estrutura da página**: player de vídeo (+), scroll infinito (+), autoplay, layout de feed/shorts, formulários, editor rico, tabela grande e `og:type` produtivo ou de vídeo ajustam a pontuação.  
4) **Caminho/schema**: tokens de URL (`/watch`, `/shorts`, `/feed`, `/dashboard`, `/issues`, `/editor`) e `schema.org` (`VideoObject`, `Article`, etc.) contribuem com pesos médios.  
5) **Threshold**: diferença de ≥15 pontos classifica em Produtivo; ≤ ‑15 em Procrastinação; caso contrário fica Neutro.  
5) **Confiança**: derivada de sinais fortes/médios, limitada a 100 e reduzida se o resultado for Neutro.

## Aprendizado local (reforço das suas decisões)

- Armazenamos contadores por “tokens” em `chrome.storage.local`:
  - `host:<domínio completo>`
  - `root:<domínio base>`
  - `kw:<palavra normalizada>`
  - `og:<valor>`
  - `path:<token>` (partes do caminho da URL)
  - `schema:<valor>`
  - `lang:<lang>`
  - Flags: `flag:video`, `flag:scroll`, `flag:autoplay`, `flag:feed`, `flag:form`, `flag:editor`, `flag:table`, `flag:shorts`
- Quando você aceita ou recusa uma sugestão, ou adiciona domínios manualmente na Options, incrementamos apenas os contadores locais desses tokens.
- Em cada sugestão, os tokens presentes geram um “learnedScore” (Naïve Bayes leve): `score += log((prod+1)/(proc+1)) * peso`. Pesos priorizam host/root; palavras e flags valem menos.
- **Decaimento**: contadores antigos perdem força (meia‑vida de ~30 dias) para evitar overfitting a hábitos velhos.
- **Limite**: mantemos até ~5k tokens; os mais antigos são descartados primeiro.
- **Transparência**: razões exibem “Sinal aprendido” quando o aprendizado influenciar a sugestão.

## Estado e privacidade

- Tudo vive em `chrome.storage.local` (sem sync, sem servidor).
- Nenhuma requisição de rede é feita para classificar.
- Você pode limpar dados removendo a extensão ou limpando o storage do Chrome.

## Controles e cooldown

- A auto‑classificação é opt‑in (`enableAutoClassification` na Options).
- Há cooldown configurável entre sugestões para o mesmo domínio.
- Ignorar uma sugestão registra um prazo de silêncio para aquele domínio.

## Quando atualizar esta página

- Ao adicionar novos sinais (ex.: novos OG types, novos flags de detecção).
- Ao mudar pesos/thresholds do classificador.
- Ao alterar a política de decaimento ou o limite de tokens aprendidos.
