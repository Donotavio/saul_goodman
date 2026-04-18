<!--lang:pt-->
# Changelog

Todas as versões são publicadas pelo CI/CD; a versão é atualizada automaticamente no build.

## [1.24.11] - 2026-04-18

Internacionalização completa: eliminação de todas as strings hardcoded, arquitetura de merge para keys exclusivas do VS Code, e tooling de i18n (agent + skill).

### Bugs corrigidos

- Block page (`block.html`) usava `lang="pt-BR"` e texto hardcoded em português — agora usa `lang="en"` com `data-i18n` e fallback en-US.
- Gráfico hourly do VS Code exibia labels em inglês hardcoded ("Coding", "Debugging", "Building", "Testing", "Minutes") — agora usa `window.__SAUL_I18N__`.
- Gráfico combo timeline usava locale `'pt-BR'` hardcoded para formatação de hora e strings em inglês ("Time of Day", "Combo Level") — agora usa `document.documentElement.lang` e i18n.
- Tooltip do combo timeline usava template hardcoded em inglês — agora usa key `report_vscode_combo_tooltip`.
- Relatório VS Code exibia "Minutes" e "{minutes} min streak" hardcoded — agora usa keys i18n.
- Combo toast exibia "min" hardcoded na notificação e no webview legado — agora usa key `report_vscode_combo_notification_min`.

### Melhorias

- 11 novas keys de i18n para gráficos e combos do VS Code, traduzidas nos 13 locales.
- `copy-locales-to-site.js` agora faz **merge** (não overwrite) para `vscode-extension/_locales/`, preservando keys exclusivas do VS Code durante o pipeline `i18n:full-lang-update`.
- Novo agent `i18n-manager` para auditoria de strings, adição de keys e execução do pipeline.
- Skill `i18n-workflow` atualizada com documentação completa da arquitetura de 3 camadas, padrão `window.__SAUL_I18N__`, e troubleshooting.

## [1.24.8] - 2026-04-17

Auditoria sistêmica Round 3: hardening de integridade de dados, privacidade, robustez do daemon/VS Code e suporte completo a 14 locales na extensão VS Code.

### Bugs corrigidos

- Cálculo do score não soma mais `overtimeProductiveMs` em dobro — `productiveMs` já inclui overtime desde `accumulateSlice` (`score.ts`).
- Score agora é clampado para `[0, 100]` com `Math.max(0, ...)` (`score.ts`).
- `isWithinWorkSchedule` com intervalo `start==end` agora retorna `false` ao invés de cobrir 24h (`time.ts`).
- McNemar gate: p-value não-significativo (>=0.05) agora passa o gate ao invés de bloquear promoção (`validationGate.ts`).
- `vscodeActiveMs` zerado no cálculo do score quando `vscodeSyncSucceeded === false` (`score.ts`).
- Switches do resumo VS Code agora contam trocas reais de projeto/contexto ao invés de igualar ao número de sessões (`saul-daemon/index.cjs`).
- Context breakdown não é mais aplicado quando manual override está ativo (`background/index.ts`).

### Segurança e privacidade

- Tab switches agora hasheados por padrão na extensão VS Code (`heartbeat-factory.js`).
- Command IDs com namespace customizado anonimizados para `prefix.*` (`extra-events.js`).
- Commit messages só incluídos nos heartbeats quando `enableSensitiveTelemetry` está habilitado (`git-tracker.js`).
- `linesAdded`/`linesDeleted` removidos da normalização de metadata do daemon (minimização de dados).
- Header `x-saul-version` removido de todas as respostas do daemon (previne fingerprinting).
- Workspace tracker hasheia file paths em `largestFiles` (`workspace-tracker.js`).

### Robustez daemon

- Lock file previne múltiplas instâncias do daemon rodando simultaneamente.
- Arquivos JSON corrompidos são backupeados para `.corrupt` antes do fallback.
- Cap de heartbeats por chave (10.000) com trim dos mais antigos.
- Prune periódico (1h) de dados VS Code expirados.
- Warning de divergência de timezone entre daemon e heartbeats do VS Code.
- Try/catch global no request handler com resposta 500.
- Logging de timezone no startup do daemon.
- Janela de retenção de heartbeats ampliada em +1 dia para evitar truncamento parcial de sessões na meia-noite.

### Robustez VS Code

- Persist da fila agora usa debounce (500ms) para reduzir I/O.
- Persist usa promise chain com timeout de 10s.
- Falha de persist pós-flush dispara retry imediato.
- Contador `droppedEvents` persistido em disco e restaurado no startup.
- Notificação de overflow do buffer a 80% da capacidade (throttled a cada 5 min).
- Heartbeat de lifecycle emitido no `deactivate` da extensão.
- Terminal tracker marca `backgroundActivity` quando janela sem foco.
- Comandos de terminal resetam idle timer.
- Guard de reentrância no comando Quick Open.

### Robustez ML

- `maybeRecalibrate()` chamado antes da resolução de pseudo-labels (`ml-engine.ts`).
- Reconciliação disparada em falha de persist de metadados.

### Robustez geral

- `saveDailyMetrics` retorna boolean; retry com poda de quota em caso de falha (`storage.ts`).
- `pruneMetricsForQuota` limita `suggestionsHistory` (>500) e `vscodeTimeline` (>2000) (`utils/storage.ts`).
- `persistMetrics` usa promise chain para serializar chamadas concorrentes (`background/index.ts`).
- Entradas de domínio limitadas a 500 por dia (`background/index.ts`).
- Cache de sugestões com TTL de 1h e evicção de stale (`background/index.ts`).
- Retry de metadata (3s) quando content script não responde inicialmente.
- Service worker `onSuspend` persiste metrics cache.
- Index sync clampa timestamps futuros no daemon.
- Flag `clamped` propagada no resumo VS Code (`vscode-summary.ts`).
- Fingerprint de heartbeat inclui flag `isWrite` (`saul-daemon/index.cjs`).

### Melhorias

- Extensão VS Code agora suporta todos os 14 locales (antes eram 3).
- Version check compara `major.minor` ao invés de apenas `major` (`extension.js`).
- Campo `topExtensions` aceito na normalização de metadata do daemon.
- Documentação de guardrails atualizada com 5 novos comportamentos documentados (`behavior-guardrails.md`).

## [1.24.7] - 2026-04-17

Auditoria sistêmica Round 2: 32 achados corrigidos em 5 fases cobrindo integridade de dados, corretude ML, privacidade, robustez e melhorias gerais.

### Bugs corrigidos

- Fila do VS Code agora faz flush ao parar, prevenindo perda de heartbeats (`buffered-event-queue.js`).
- Guard contra NaN/Infinity no temperature scaling do modelo ML (`temperatureScaler.ts`).
- McNemar com zero pares discordantes (b=0, c=0) não bloqueia mais a promoção do modelo; fallback quando <5 pares (`validationGate.ts`).
- Guard contra reset duplo de métricas em noite de DST fall-back (`background/index.ts`).
- Flag `vscodeSyncInProgress` agora usa timeout de 30s para prevenir lockout permanente após suspensão do service worker.

### Segurança e privacidade

- Payload da narrativa OpenAI agora substitui nomes de domínio por labels anônimos ("site produtivo 1") antes do envio (`report.ts`).
- PAIRING_KEY passada via stdin ao daemon ao invés de variável de ambiente visível em `/proc/environ` (`extension.js`).
- Sirene crítica protegida contra fingerprinting por websites (`critical-siren.js`).
- Revogação de permissões localhost ao desabilitar integração VS Code.

### Robustez ML

- Mutex baseado em promise serializa operações concorrentes no modelo ML, prevenindo corrupção de pesos (`ml-engine.ts`).
- Quarentena de pseudo-labels agora purga exemplos implícitos existentes ao detectar contradição explícita.
- Deduplicação de labels no training store: substituição por domínio ao invés de aleatória (`trainingStore.ts`).
- Reconciliação IDB/storage.local contínua via listener `chrome.storage.onChanged`.
- Pseudo-stability threshold aumentado para 5 predições em pelo menos 3 dias calendários distintos.
- FPR gate passa quando ambos os modelos já têm FPR=0 (sem melhoria possível).
- Bootstrap CI upper index corrigido para `Math.ceil`.
- Split de treino determinístico por hash de domínio para entradas legadas sem split explícito.

### Robustez geral

- Limite de profundidade JSON no body parser do daemon (previne DoS local).
- Tratamento de `EADDRINUSE` com mensagem clara no spawn do daemon.
- Normalização de backslash em paths Windows no heartbeat tracker.
- UUID fallback robusto via `crypto.randomUUID()`.
- Clamping de `totalActiveMs` sinalizado com flag `clamped: true` no response.
- Tolerância de 5s para clock skew na atualização do índice.
- Null-guards verificados em command handlers do VS Code.

### Melhorias

- Timeouts HTTP configuráveis no apiClient do VS Code com backward compatibility.
- `safeJson()` wrapper com URL/status no erro para diagnóstico de falhas de parse.
- IDB retry com backoff exponencial (`min(2^attempt * 100, 5000)`).
- `innerHTML` substituído por `createElement`/`appendChild` no locale select (defense-in-depth XSS).
- Promise rejections não-tratadas agora logadas com `.catch(console.warn)`.
- Nota de privacidade sobre holiday API documentada em `holidays.ts`.
- Alarm drift logging quando elapsed > 115% do período esperado.
- Contador `droppedTimelineSegments` em `DailyMetrics` para observabilidade de overflow de timeline.
- Context history init protegido contra race condition via singleton promise.
- Warning quando domínios de bloqueio excedem limite de regras `declarativeNetRequest`.
- Logging em toasts de auto-classificação e modo crítico (anteriormente erros engolidos).
- Documentação de taxa de colisão de hash (~15%) no `auto-classification.md`.

## [1.24.5] - 2026-04-16

- Correção do pipeline NLS da extensão VS Code: chave `config_enable_ai_tracking_description` adicionada ao `generate-nls.js` e a todos os `package.nls.*.json`.
- Atualização de dependências para resolver todos os 11 alertas do Dependabot: `@modelcontextprotocol/sdk` 1.12→1.29, `jspdf` 3.0→3.2, `@vscode/vsce` 3.3→3.9 (incluindo sub-deps `hono`, `@hono/node-server`, `dompurify`, `lodash`, `picomatch`).
- Reparo de traduções suspeitas em 13 locales via LLM: ar(7), bn(3), de(29), es_419(115), fr(27), hi(4), it(46), ru(7), tr(22), ur(5), zh_CN(4) chaves corrigidas.
- Posts do blog traduzidos para 13 locales (78 arquivos HTML gerados).

## [1.24.0] - 2026-04-16

- Novo sistema de tracking de atividade IA na extensão VS Code: detecção heurística de bursts de edição (janela deslizante de 2s, limiar de 15+ linhas), atribuição de terminal por nome de processo (Claude Code, Copilot, Cline, Aider, Cursor), contagem de inline completions aceitas e registro de extensões IA ativas.
- Daemon agrega métricas IA nos endpoints `/v1/vscode/dashboard`, `/v1/vscode/telemetry` e `/v1/tracking/vscode/summary`.
- Relatórios VS Code e Chrome exibem seção "AI Pair Programming" com gráfico doughnut (contribuição humano vs IA), 4 KPI cards (linhas IA, linhas humanas, completions, comandos terminal IA) e lista de ferramentas IA ativas.
- Badge compacto "X% IA" no popup da extensão Chrome quando há dados de IA.
- Enriquecimento do `applyEdit` no refactor-tracker com contagem real de linhas e detecção multi-arquivo.
- Nova configuração `saulGoodman.enableAiTracking` (default: true, requer `enableTelemetry`).
- i18n completo para os 13 locales em Chrome `_locales`, VS Code `_locales` e `package.nls.*.json`.
- Correção de teste pré-existente `vscode-package-contract` que verificava evento de ativação incorreto.

## [1.21.32] - 2026-03-17

- Novo modelo WideDeepLite (wide+deep com embeddings esparsos e otimizador AdaGrad).
- CLI de replay ML offline (`tools/ml_replay`) para reprocessamento de sinais.
- Stack ML completa: temperature scaler, validation gate bootstrap, sinais naturais/comportamentais.
- Oito correções do code review: IDB cache, leak de openAiKey, limites de metadata, flag initializing, bootstrap chunked async, cursor getRecentExamples, persistContext debounce e utils DRY.
- Módulo reconcile para recálculo de métricas.
- Remoção do diretório `saul-daemon` legado.
- Fix CI: referência ao `saul-daemon/package.json` deletado.

## [1.21.31] - 2026-03-17

- Atualização de dependências npm via Dependabot (grupo npm_and_yarn, 3 pacotes, 2 diretórios).

## [1.21.30] - 2026-02-17

- Atualização de docs internos (changelog e guias de publicação).

## [1.21.29] - 2026-02-17

- Corrigimos a geração de NLS da extensão VS Code ao incluir a chave `config_daemon_path_description`.
- O comando `npm --prefix vscode-extension run build:vsix` voltou a empacotar a VSIX com consistência.

## [1.21.28] - 2026-02-17

- Atualizamos dependências de desenvolvimento para fechar alertas Dependabot (`@modelcontextprotocol/sdk`, `hono`, `qs`, `xml2js`).
- Migramos a extensão VS Code de `vsce` para `@vscode/vsce`.
- Revalidamos CI/CodeQL após atualização dos lockfiles.

## [1.21.27] - 2026-02-17

- Atualizamos `jspdf` para `4.1.0` via Dependabot.

## [1.21.26] - 2026-02-17

- Integramos a branch `feat/add_languages_plus` na `main`.
- Entraram melhorias amplas de i18n (extensão, site, blog e VS Code), evolução de auto-classificação/ML local e expansão da suíte MCP Quality.
- Endurecemos validações de segurança (URL/protocolo/hostname e tokenização) e estabilizamos testes sensíveis a timezone.

## [1.21.7] - 2026-01-06

- Corrigimos outra brecha de sanitização de URLs no módulo do blog/lightbox, eliminando o alerta de code scanning nº 10.1.

## [1.21.6] - 2026-01-06

- Fechamos o alerta de segurança nº 11 ao reforçar a sanitização de substrings de URLs usadas pelo blog/lightbox.

## [1.21.5] - 2026-01-06

- Atualizamos a dependência `jspdf` para a versão mais recente via Dependabot.

## [1.21.4] - 2026-01-06

- Blog ganhou redesign completo com hero em grid, painéis laterais, formulário de newsletter, widget de posts relacionados, tempo de leitura estimado e navegação entre artigos.
- Sistema de tags agora suporta traduções por idioma com fallback automático, melhorias na inferência de tom/categoria e badges de hero traduzidos.
- Sanitizamos URLs/frontmatter para SSR, rebatizamos Twitter para X em todas as localidades e adicionamos CTA de extensão na sidebar com links para Chrome e VS Code.
- Clarificamos a exibição/ordenação de datas de publicação (fonte vs. blog) e habilitamos sanitização extra no módulo de blog.

## [1.21.3] - 2026-01-06

- Validamos URLs das prévias do lightbox para bloquear protocolos arbitrários e impedir reinterpretação de texto como HTML.

## [1.21.2] - 2026-01-06

- Adicionamos a seção “CodeCon origin story” com vídeo incorporado e navegação dedicada.
- Workflow de version bump passou a interpretar commits convencionais com mais robustez.

## [1.21.1] - 2026-01-05

- A imagem da página de bloqueio foi movida para o diretório da extensão, garantindo carregamento consistente.
- Mantivemos a publicação semanal automatizada do blog.

## [1.21.0] - 2026-01-02

- Novos modos de contexto “folga” e “férias” neutralizam a pontuação manualmente durante períodos de descanso.
- Mantivemos a cadência de artigos semanais do blog.

## [1.20.0] - 2025-12-30

- Corrigimos overflows horizontais no site ao limitar a largura do viewport, dimensionar cards de features e forçar layout de coluna única no índice.
- Elementos do hero e navegação mobile agora respeitam a largura da tela, evitando cortes e scroll lateral.

## [1.19.1] - 2025-12-30

- Melhoramos o layout mobile com padding no header, footer sem overflow, dica de swipe reativada e parallax desativado em telas pequenas.
- Ajustamos cópia do modo fairness para explicar pontuação por contexto e adicionamos dica de contexto nas configurações de feriados.
- Seguimos com a publicação semanal automatizada do blog.

## [1.19.0] - 2025-12-30

- Seção explicativa do Índice de Procrastinação com gauge interativo, cards por faixa e destaque das features de contexto.

## [1.18.1] - 2025-12-30

- Padronizamos espaçamento/indentação em arquivos JS e CSS para manter formatação consistente.

## [1.18.0] - 2025-12-30

- Hero recebeu letreiro de néon com degradação dinâmica das lâmpadas, física de fios em camadas, faíscas reposicionadas e easter egg de queda.
- Crash do letreiro agora tem áudio em duas etapas, ring de vidro, estado persistente e assets realocados para carregamento responsivo.
- Service worker atualizado para cache v3 com validação de origem no handler de fetch.

## [1.17.0] - 2025-12-29

- Documentação de privacidade esclareceu chamadas de rede opcionais e permissões utilizadas.

## [1.16.1] - 2025-12-29

- Corrigimos imports de `main.js` nas páginas de changelog e privacidade.

## [1.16.0] - 2025-12-29

- Adicionamos página de changelog com renderização dinâmica de Markdown e seção de transparência na homepage.
- Changelog e política de privacidade passaram a ter suporte multilíngue com renderização por idioma e chaves de i18n completas.

## [1.15.0] - 2025-12-29

- Content engine ganhou cinco novas categorias (marketing, produto, UX design, carreira e negócios) com rotação automática, palavras-chave específicas e fallbacks para classificar posts com mais precisão.
- Acrescentamos oito novas fontes RSS (UX Collective, NN/g, Mind the Product, HubSpot, Rock Content, RD Station, Harvard Business Review e Fast Company) e heurísticas extras no parser para ampliar o repertório de pautas.
- O workflow do blog agora roda segundas, quartas e sextas às 08h BRT, acelerando a cadência de publicação.

## [1.14.1] - 2025-12-29

- Landing page totalmente reescrita com hero e gauge animados, carrossel interativo de features, demo do modo terremoto, accordion de onboarding, slider de depoimentos e CTA fixo para conversão em desktop e mobile.
- Navegação mobile ganhou menu hamburger com foco/hover aprimorados, espaçamento consistente e textos traduzidos; bandeiras deram lugar a emojis, os botões receberam cópia unificada e os links deixaram de usar `index.html`.
- A seção de prova social recebeu badges multilíngues, métricas públicas da Chrome Web Store, CTA de feedback dedicado (com novo e-mail) e links equivalentes nos CTAs colantes.
- Adicionamos link para instalação da extensão VS Code na área técnica e uma página de privacidade que renderiza Markdown dinamicamente.

## [1.14.0] - 2025-12-29

- Exportação CSV detalhada agora inclui timeline completa, preserva os minutos inativos e o PDF do relatório ganhou novas sessões para storytelling e contexto.
- Simplificamos o retorno ao popup ao sair das opções e transformamos o link do VS Code em botão com navegação programática.

## [1.13.0] - 2025-12-29

- Introduzimos o Modo Dúvida Razoável (fairness): manual override do dia, detecção de feriados, ajustes por contexto produtivo/neutro/procrastinação e layout novo na página de opções com autosave para VS Code e modo crítico.
- O relatório detalhado passou a exibir banner comparando índices hipotéticos, painel de breakdown por contexto (tempo e score) e tooltip dobrável explicando como cada ajuste influencia o resultado.
- Restringimos permissões do manifest aos endpoints necessários, adicionamos helpers de data com zero padding + JSDoc e reforçamos validações/limpeza das métricas VS Code.

## [1.12.0] - 2025-12-23

- Workflow do content engine agora dispara o deploy do blog (Jekyll) assim que publica um novo artigo e mantém a cadência semanal de posts automatizada no GitHub Actions.

## [1.11.1] - 2025-12-23

- Incrementamos a versão do cache do service worker para garantir que os assets do blog fossem atualizados após o rollout.

## [1.11.0] - 2025-12-23

- Service worker passou a usar estratégia network-first para recursos dinâmicos do blog, caindo para cache apenas em modo offline.
- Mantivemos a publicação semanal automática do content engine.

## [1.10.0] - 2025-12-23

- Pipeline de build ganhou cache de dependências npm e o content engine passou a usar dicas vindas dos feeds para inferir categorias antes do processamento completo.

## [1.9.0] - 2025-12-23

- Content engine agora reconstrói o `site/blog/index.json` em toda execução e o parser ficou resiliente a campos de tradução usando mapeamentos flexíveis e regex.

## [1.8.0] - 2025-12-23

- Site servindo imagens responsivas com `srcset/sizes`, versões comprimidas, lazy loading e cache dedicado no service worker para reduzir transferências.

## [1.7.0] - 2025-12-23

- Extensão VS Code passou a gerenciar o ciclo de vida do `ActivityTracker` de forma global, evitando vazamentos ao ativar/desativar a integração.

## [1.6.1] - 2025-12-23

- Otimizamos a landing page com compressão dos assets, lazy loading e scripts deferidos para melhorar métricas de performance.

## [1.6.0] - 2025-12-23

- Extensão VS Code ganhou eventos de ativação explícitos e distribuímos o pacote VSIX v1.5.0 (com `package-lock.json`) para facilitar instalação manual.

## [1.5.0] - 2025-12-23

- Integração Chrome ↔ SaulDaemon ↔ VS Code ficou completa: timeline compartilhada, sincronização do índice, rastreamento bidirecional de trocas e métricas de IDE somadas aos gráficos do popup e relatório.
- Página de opções recebeu botão de teste de conexão com health check/sessões, validação de pairing key e feedback localizado; a chave agora persiste e erros de autenticação trazem instruções de correção.
- Extensão VS Code ganhou i18n completo (`auto`, pt-BR, en-US, es-419), configuração `saulGoodman.language`, strings localizadas em comandos/logs/status bar e documentação dedicada.
- Relatório passou a mostrar categoria neutra no gráfico horário, métricas de ociosidade mais precisas e timeline unificada entre Chrome/VS Code.

## [1.4.1] - 2025-12-23

- Blog instrumentado com Google Analytics → Google Tag Manager, validação do Search Console e ordenação priorizando `source_published_at`.
- Novo artigo publicado com foco em foco vs. procrastinação e documentação atualizada sobre SEO/RSS.

## [1.4.0] - 2025-12-23

- Lançamos o blog multilíngue (PT/EN/ES) com layout novo (sidebar, badges, artwork por categoria/tono, compartilhamento social) e tradução automática dos conteúdos.
- Criamos o content engine automatizado com workflow no GitHub Actions (`--dry-run`, parser de datas seguro, suporte a `YYYY-MM-DD` e URLs `/posts/YYYY/<slug>/`).
- O popup passou a recomendar artigos baseados nas métricas do dia e os posts ganharam sistema de arte por tom/categoria.

## [1.3.2] - 2025-12-23

- Documentação em `AGENTS.md` foi condensada para leitura rápida.

## [1.3.1] - 2025-12-23

- Publicamos o pacote VSIX da extensão VS Code v1.3.0 para facilitar instalações manuais/remotas.

## [1.3.0] - 2025-12-23

- Extensão passou a exibir notificação local pós-update com link direto para o changelog e botão “Ver novidades” no popup para disparo manual.

## [1.2.0] - 2025-12-23

- Integração VS Code + SaulDaemon estreou: daemon local, pairing key com prompt dedicado, comandos para iniciar/health check, status bar com o Saul Index e timeline unificada no relatório.
- Tempo ativo do VS Code passou a somar no score produtivo; IDs de sessão agora usam `crypto.randomBytes`, adicionamos force sync/clean-up ao desativar a integração e o daemon ganhou validações extras.
- Liberamos bloqueio opcional de domínios procrastinadores usando `declarativeNetRequest` e página de bloqueio traduzida.
- Popup ganhou compartilhamento social multi-plataforma, opções foram reestruturadas com semântica/ARIA e o site recebeu CTA para instalar a extensão VS Code.

## [1.1.2] - 2025-12-05

- Otimizamos o tracking de abas restauradas com early returns/deltas e sincronizamos versões em todos os pacotes.

## [1.1.1] - 2025-12-05

- Passamos a registrar sessões diárias e corrigimos a contagem de itens restaurados para evitar duplicidade.

## [1.1.0] - 2025-12-04

- Landing page ganhou demos interativas, lightbox seguro e simulação do modo terremoto para mostrar a experiência sem instalar a extensão.

## [1.0.12] - 2025-12-04

- Adicionamos o texto completo da licença MIT ao repositório.

## [1.0.11] - 2025-12-04

- Workflows do GitHub Actions receberam permissões explícitas para atender os alertas de segurança.

## [1.0.10] - 2025-12-04

- Outro workflow crítico foi atualizado com permissões mínimas exigidas pelo code scanning.

## [1.0.9] - 2025-12-04

- Botão de patrocínio foi movido para o menu principal e passou a usar badge oficial do GitHub Sponsors.

## [1.0.8] - 2025-12-04

- Adicionamos política de segurança (`SECURITY.md`) com versões suportadas e canal de contato para vulnerabilidades.

## [1.0.7] - 2025-12-04

- Página oficial ganhou seção de apoio com integração ao GitHub Sponsors.

## [1.0.6] - 2025-12-04

- Links de instalação passaram a apontar diretamente para a Chrome Web Store oficial com `rel="noreferrer"`.

## [1.0.5] - 2025-12-04

- Atualizamos os links públicos de instalação e badges para refletir o lançamento na Chrome Web Store.

## [1.0.4] - 2025-12-04

- Landing page recebeu suporte a idiomas com seletor e atributos `data-i18n`.

## [1.0.3] - 2025-12-04

- Release inicial: MV3 service worker rastreando tempo produtivo vs. procrastinação, popup com Chart.js e cálculo do Índice Saul em tempo real.
- Página de opções trouxe listas de domínios produtivos/vilões, ajuste de pesos, schedulers de horário comercial (com bônus overtime) e configurações do modo terremoto.
- Relatório detalhado incluiu timeline por hora, ranking de domínios, exportação CSV/PDF e narrativa com IA (OpenAI) usando markdown.
- Experiência boisterous com toasts sarcásticos multi-aba, overlay e sirene do modo terremoto, gráficos de trocas de abas por hora, assets otimizados e documentação base (README/arquitetura/indicadores).

<!--lang:en-->
# Changelog

All releases are published via CI/CD; the version is bumped automatically during the build.

## [1.24.8] - 2026-04-17

Systemic audit Round 3: data integrity hardening, privacy improvements, daemon/VS Code robustness, and full 14-locale support in the VS Code extension.

### Bug fixes

- Score calculation no longer double-counts `overtimeProductiveMs` — `productiveMs` already includes overtime from `accumulateSlice` (`score.ts`).
- Score now clamped to `[0, 100]` with `Math.max(0, ...)` (`score.ts`).
- `isWithinWorkSchedule` with `start==end` interval now returns `false` instead of covering 24h (`time.ts`).
- McNemar gate: non-significant p-value (>=0.05) now passes the gate instead of blocking promotion (`validationGate.ts`).
- `vscodeActiveMs` zeroed in score calculation when `vscodeSyncSucceeded === false` (`score.ts`).
- VS Code summary switches now count actual project/context switches instead of equaling session count (`saul-daemon/index.cjs`).
- Context breakdown no longer applied when manual override is active (`background/index.ts`).

### Security and privacy

- Tab switches now hashed by default in the VS Code extension (`heartbeat-factory.js`).
- Custom-namespace command IDs anonymized to `prefix.*` (`extra-events.js`).
- Commit messages only included in heartbeat metadata when `enableSensitiveTelemetry` is enabled (`git-tracker.js`).
- `linesAdded`/`linesDeleted` removed from daemon metadata normalization (data minimization).
- `x-saul-version` header removed from all daemon responses (prevents fingerprinting).
- Workspace tracker hashes file paths in `largestFiles` (`workspace-tracker.js`).

### Daemon robustness

- Lock file prevents multiple daemon instances from running simultaneously.
- Corrupt JSON files backed up to `.corrupt` before fallback.
- Per-key heartbeat cap (10,000) with oldest-first trimming.
- Periodic hourly prune of expired VS Code data.
- Timezone divergence warning between daemon and VS Code heartbeats.
- Global try/catch in request handler with 500 response.
- Timezone logging at daemon startup.
- Heartbeat retention window widened by +1 day to avoid partial session truncation at midnight.

### VS Code robustness

- Queue persist now debounced (500ms) to reduce I/O.
- Persist uses promise chain with 10s timeout.
- Post-flush persist failure triggers immediate retry.
- `droppedEvents` counter persisted to disk and restored on startup.
- Buffer overflow notification at 80% capacity (throttled every 5 min).
- Lifecycle heartbeat emitted on extension `deactivate`.
- Terminal tracker marks `backgroundActivity` when window is unfocused.
- Terminal commands reset the idle timer.
- Reentrancy guard on Quick Open command.

### ML robustness

- `maybeRecalibrate()` called before pseudo-label resolution (`ml-engine.ts`).
- Reconciliation triggered on metadata persist failure.

### General robustness

- `saveDailyMetrics` returns boolean; retries with quota pruning on failure (`storage.ts`).
- `pruneMetricsForQuota` trims `suggestionsHistory` (>500) and `vscodeTimeline` (>2000) (`utils/storage.ts`).
- `persistMetrics` uses promise chain to serialize concurrent calls (`background/index.ts`).
- Domain entries capped at 500 per day (`background/index.ts`).
- Suggestion cache with 1h TTL and stale eviction (`background/index.ts`).
- Metadata retry (3s) when content script doesn't respond initially.
- Service worker `onSuspend` persists metrics cache.
- Index sync clamps future timestamps in the daemon.
- `clamped` flag propagated in VS Code summary (`vscode-summary.ts`).
- Heartbeat fingerprint includes `isWrite` flag (`saul-daemon/index.cjs`).

### Improvements

- VS Code extension now supports all 14 locales (previously 3).
- Version check compares `major.minor` instead of just `major` (`extension.js`).
- `topExtensions` field accepted in daemon metadata normalization.
- Guardrails documentation updated with 5 new documented behaviors (`behavior-guardrails.md`).

## [1.24.7] - 2026-04-17

Systemic audit Round 2: 32 findings fixed across 5 phases covering data integrity, ML correctness, privacy, robustness, and general improvements.

### Bug fixes

- VS Code queue now flushes on stop, preventing heartbeat loss (`buffered-event-queue.js`).
- Guard against NaN/Infinity in ML model temperature scaling (`temperatureScaler.ts`).
- McNemar with zero discordant pairs (b=0, c=0) no longer blocks model promotion; fallback when <5 pairs (`validationGate.ts`).
- Guard against double metric reset on DST fall-back night (`background/index.ts`).
- `vscodeSyncInProgress` flag now uses 30s timeout to prevent permanent lockout after service worker suspension.

### Security and privacy

- OpenAI narrative payload now replaces domain names with anonymous labels ("productive site 1") before sending (`report.ts`).
- PAIRING_KEY passed via stdin to daemon instead of env var visible in `/proc/environ` (`extension.js`).
- Critical siren protected against website fingerprinting (`critical-siren.js`).
- Localhost permissions revoked when disabling VS Code integration.

### ML robustness

- Promise-based mutex serializes concurrent ML model operations, preventing weight corruption (`ml-engine.ts`).
- Pseudo-label quarantine now purges existing implicit examples upon explicit contradiction.
- Training store label deduplication: per-domain replacement instead of random (`trainingStore.ts`).
- Continuous IDB/storage.local reconciliation via `chrome.storage.onChanged` listener.
- Pseudo-stability threshold increased to 5 predictions across at least 3 distinct calendar days.
- FPR gate passes when both models already have FPR=0 (no improvement possible).
- Bootstrap CI upper index fixed to use `Math.ceil`.
- Deterministic training split via domain hash for legacy entries without explicit split.

### General robustness

- JSON depth limit in daemon body parser (prevents local DoS).
- `EADDRINUSE` handling with clear error message in daemon spawn.
- Backslash path normalization for Windows in heartbeat tracker.
- Robust UUID fallback via `crypto.randomUUID()`.
- `totalActiveMs` clamping signaled with `clamped: true` flag in response.
- 5s clock skew tolerance for index updates.
- Null-guards verified in VS Code command handlers.

### Improvements

- Configurable HTTP timeouts in VS Code apiClient with backward compatibility.
- `safeJson()` wrapper with URL/status in error for parse failure diagnostics.
- IDB retry with exponential backoff (`min(2^attempt * 100, 5000)`).
- `innerHTML` replaced with `createElement`/`appendChild` in locale select (defense-in-depth XSS).
- Unhandled promise rejections now logged with `.catch(console.warn)`.
- Privacy note about holiday API documented in `holidays.ts`.
- Alarm drift logging when elapsed > 115% of expected period.
- `droppedTimelineSegments` counter in `DailyMetrics` for timeline overflow observability.
- Context history init protected against race condition via singleton promise.
- Warning when block domains exceed `declarativeNetRequest` rule limit.
- Logging in auto-classification and critical mode toasts (previously swallowed errors).
- Hash collision rate (~15%) documented in `auto-classification.md`.

## [1.24.5] - 2026-04-16

- Fixed VS Code NLS pipeline: added `config_enable_ai_tracking_description` key to `generate-nls.js` and all `package.nls.*.json` files.
- Updated dependencies to resolve all 11 Dependabot alerts: `@modelcontextprotocol/sdk` 1.12→1.29, `jspdf` 3.0→3.2, `@vscode/vsce` 3.3→3.9 (including sub-deps `hono`, `@hono/node-server`, `dompurify`, `lodash`, `picomatch`).
- Repaired suspicious translations across 13 locales via LLM: ar(7), bn(3), de(29), es_419(115), fr(27), hi(4), it(46), ru(7), tr(22), ur(5), zh_CN(4) keys fixed.
- Blog posts translated into 13 locales (78 HTML files generated).

## [1.24.0] - 2026-04-16

- New AI activity tracking system in the VS Code extension: heuristic edit burst detection (2s sliding window, 15+ lines threshold), terminal source attribution by process name (Claude Code, Copilot, Cline, Aider, Cursor), inline completion accept counting, and active AI extension registry.
- Daemon aggregates AI metrics in `/v1/vscode/dashboard`, `/v1/vscode/telemetry`, and `/v1/tracking/vscode/summary` endpoints.
- VS Code and Chrome reports display an "AI Pair Programming" section with a doughnut chart (human vs AI contribution), 4 KPI cards (AI lines, human lines, completions, AI terminal commands), and active AI tools list.
- Compact "X% AI" badge in the Chrome extension popup when AI data is available.
- Enriched `applyEdit` interception in refactor-tracker with real line counts and multi-file detection.
- New `saulGoodman.enableAiTracking` setting (default: true, requires `enableTelemetry`).
- Full i18n for all 13 locales across Chrome `_locales`, VS Code `_locales`, and `package.nls.*.json`.
- Fixed pre-existing `vscode-package-contract` test that checked for an incorrect activation event.

## [1.21.32] - 2026-03-17

- New WideDeepLite model (wide+deep with sparse embeddings and AdaGrad optimizer).
- Offline ML replay CLI (`tools/ml_replay`) for signal reprocessing.
- Full ML stack: temperature scaler, validation gate bootstrap, natural/behavioral signals.
- Eight code-review fixes: IDB cache, openAiKey leak, metadata limits, initializing flag, bootstrap chunked async, cursor getRecentExamples, persistContext debounce, and utils DRY.
- Reconcile module for metric recalculation.
- Removed legacy `saul-daemon` directory.
- CI fix: removed reference to deleted `saul-daemon/package.json`.

## [1.21.31] - 2026-03-17

- Updated npm dependencies via Dependabot (npm_and_yarn group, 3 packages, 2 directories).

## [1.21.30] - 2026-02-17

- Updated internal docs (changelog and publishing guides).

## [1.21.29] - 2026-02-17

- Fixed VS Code NLS generation by adding the `config_daemon_path_description` key.
- Restored consistent VSIX packaging with `npm --prefix vscode-extension run build:vsix`.

## [1.21.28] - 2026-02-17

- Upgraded development dependencies to close Dependabot alerts (`@modelcontextprotocol/sdk`, `hono`, `qs`, `xml2js`).
- Migrated the VS Code extension from `vsce` to `@vscode/vsce`.
- Revalidated CI/CodeQL after lockfile updates.

## [1.21.27] - 2026-02-17

- Updated `jspdf` to `4.1.0` via Dependabot.

## [1.21.26] - 2026-02-17

- Merged `feat/add_languages_plus` into `main`.
- Added broad i18n improvements (extension, site, blog, and VS Code), expanded local auto-classification/ML capabilities, and extended the MCP Quality suite.
- Hardened security checks (URL/protocol/hostname and tokenization) and stabilized timezone-sensitive tests.

## [1.21.7] - 2026-01-06

- Patched another URL-sanitization gap in the blog/lightbox module, resolving code scanning alert #10.1.

## [1.21.6] - 2026-01-06

- Hardened URL substring sanitization for the blog/lightbox to close security alert #11.

## [1.21.5] - 2026-01-06

- Updated the `jspdf` dependency to the latest patch via Dependabot.

## [1.21.4] - 2026-01-06

- Blog redesigned with a grid hero, sidebar panels, newsletter form, related-posts widget, reading time estimates, and next/previous navigation.
- Tag system now supports language-specific translations with automatic fallback, better tone/category inference, and translated hero badges.
- Added URL/frontmatter sanitization for SSR, rebranded Twitter references to X across locales, and placed an extension CTA widget in the sidebar with Chrome + VS Code links.
- Clarified how blog vs. source publication dates are displayed/sorted and enabled extra sanitization in the blog module.

## [1.21.3] - 2026-01-06

- Validated lightbox preview URLs to block arbitrary protocols and prevent text from being reinterpreted as HTML.

## [1.21.2] - 2026-01-06

- Added the “CodeCon origin story” section with an embedded video and dedicated navigation.
- Version-bump workflow now parses conventional commits more reliably.

## [1.21.1] - 2026-01-05

- Moved the block-page image into the extension source to ensure it loads consistently.
- Kept the automated weekly blog publication running.

## [1.21.0] - 2026-01-02

- New “day off” and “vacation” context modes neutralize scoring during breaks.
- Continued the weekly automated blog posts.

## [1.20.0] - 2025-12-30

- Fixed horizontal overflows by constraining viewport width, sizing feature cards, and forcing a single-column layout in the index.
- Hero elements and mobile navigation now respect screen width, preventing clipping and sideways scrolling.

## [1.19.1] - 2025-12-30

- Improved mobile layout with header padding, overflow-free footer, restored swipe hint, and disabled parallax on small screens.
- Clarified fairness copy about context-aware scoring and added a context hint in holiday settings.
- Continued the automated weekly blog publication.

## [1.19.0] - 2025-12-30

- Added a comprehensive Procrastination Index explainer with a gauge widget, range cards, and a context callout.

## [1.18.1] - 2025-12-30

- Standardized JS/CSS spacing and indentation for consistent formatting.

## [1.18.0] - 2025-12-30

- Hero now features a neon sign with dynamic bulb degradation, layered wire physics, repositioned sparks, and a falling easter egg.
- The crash sequence gained two-stage audio, a glass ring, persistent crash state, and relocated assets for responsive loading.
- Service worker updated to cache v3 with origin validation in the fetch handler.

## [1.17.0] - 2025-12-29

- Privacy documentation now clarifies optional network calls and permissions.

## [1.16.1] - 2025-12-29

- Fixed `main.js` imports in the changelog and privacy pages.

## [1.16.0] - 2025-12-29

- Added a changelog page with dynamic Markdown rendering and a transparency section on the homepage.
- Changelog and privacy policy now support multiple languages with per-locale rendering and complete i18n keys.

## [1.15.0] - 2025-12-29

- The content engine gained five new categories (marketing, product, UX design, career, and business) with automatic rotation, dedicated keywords, and fallback rules that improve post classification accuracy.
- Added eight new RSS sources (UX Collective, NN/g, Mind the Product, HubSpot, Rock Content, RD Station, Harvard Business Review, and Fast Company) plus extra parser heuristics to broaden the content pool.
- The blog workflow now runs every Monday, Wednesday, and Friday at 08:00 BRT, speeding up publication cadence.

## [1.14.1] - 2025-12-29

- Fully rebuilt the landing page with an animated hero + gauge, interactive feature carousel, quake-mode demo, onboarding accordion, testimonial slider, and sticky CTAs for both desktop and mobile.
- Mobile navigation now uses a hamburger menu with improved focus/hover states, consistent spacing, translated copy, emoji flags (instead of images), unified button wording, and links without `index.html`.
- The social proof section received multilingual badges, public Chrome Web Store metrics, a dedicated feedback CTA (with the new email), and equivalent links inside the sticky CTAs.
- Added a VS Code install link in the developer area and a Markdown-driven privacy page that renders directly on the site.

## [1.14.0] - 2025-12-29

- Detailed CSV export now includes the full timeline, preserves idle minutes, and the report PDF gained new storytelling/context sections.
- Simplified the return flow to the popup after leaving the options page and turned the VS Code link into a button with programmatic navigation.

## [1.13.0] - 2025-12-29

- Introduced Reasonable Doubt mode: daily manual override, holiday detection, context adjustments (productive/neutral/procrastination), and a redesigned options page with autosave for VS Code + critical mode settings.
- The detailed report now shows a banner comparing hypothetical scores, a context breakdown panel (time and index), and a collapsible tooltip explaining how each adjustment affects the results.
- Restricted manifest permissions to the required endpoints, added date helpers with zero padding plus JSDoc, and hardened VS Code metric validation/cleanup.

## [1.12.0] - 2025-12-23

- The content-engine workflow now triggers the blog (Jekyll) deploy as soon as a new article is published, keeping the weekly cadence automated in GitHub Actions.

## [1.11.1] - 2025-12-23

- Bumped the service worker cache version to ensure blog assets refresh right after rollout.

## [1.11.0] - 2025-12-23

- Service worker now uses a network-first strategy for dynamic blog resources, falling back to cache only when offline.
- The content engine’s weekly publication automation remains enabled.

## [1.10.0] - 2025-12-23

- Build pipeline now caches npm dependencies, and the content engine uses hints from feeds to infer categories earlier in the process.

## [1.9.0] - 2025-12-23

- The content engine rebuilds `site/blog/index.json` on every run, and the parser became resilient to translation fields via flexible mappings and regex.

## [1.8.0] - 2025-12-23

- The site now serves responsive images with `srcset/sizes`, compressed variants, lazy loading, and a dedicated service worker cache to reduce transfers.

## [1.7.0] - 2025-12-23

- The VS Code extension now manages the `ActivityTracker` lifecycle globally to prevent leaks when toggling the integration.

## [1.6.1] - 2025-12-23

- Optimized the landing page by compressing assets, enabling lazy loading, and deferring scripts to improve performance metrics.

## [1.6.0] - 2025-12-23

- The VS Code extension gained explicit activation events and we distributed the VSIX v1.5.0 package (with `package-lock.json`) for easier manual installs.

## [1.5.0] - 2025-12-23

- Chrome ↔ SaulDaemon ↔ VS Code integration became complete: shared timeline, index sync, bi-directional switch tracking, and IDE metrics blended into popup/report charts.
- The options page received a connection-test button with health check/session info, pairing-key validation, and localized feedback; the key now persists and auth errors show recovery guidance.
- The VS Code extension now ships full i18n (`auto`, pt-BR, en-US, es-419), exposes `saulGoodman.language`, and localizes commands/logs/status bar alongside dedicated docs.
- The detailed report now shows a neutral category on the hourly chart, improved idle metrics, and a unified Chrome+VS Code timeline.

## [1.4.1] - 2025-12-23

- The blog is instrumented with Google Analytics → Google Tag Manager, Search Console verification, and sorting that prioritizes `source_published_at`.
- Published a new focus vs. procrastination article and refreshed the SEO/RSS documentation.

## [1.4.0] - 2025-12-23

- Launched the multilingual blog (PT/EN/ES) with a new layout (sidebar, badges, artwork per category/tone, social sharing) and automatic translations.
- Built the automated content engine with a GitHub Actions workflow (`--dry-run`, safe date parser, `YYYY-MM-DD` support, and `/posts/YYYY/<slug>/` URLs).
- The popup now recommends articles based on daily metrics and posts gained tone/category artwork.

## [1.3.2] - 2025-12-23

- The `AGENTS.md` documentation was condensed for quicker reading.

## [1.3.1] - 2025-12-23

- Published the VS Code extension v1.3.0 VSIX package to simplify manual/offline installations.

## [1.3.0] - 2025-12-23

- The extension now shows a local post-update notification with a changelog link and a “See what’s new” button in the popup to trigger it manually.

## [1.2.0] - 2025-12-23

- Debuted the VS Code + SaulDaemon integration: local daemon, pairing key prompt, start/health-check commands, status bar with the Saul Index, and a unified timeline in the report.
- VS Code active time now counts toward productive score; session IDs use `crypto.randomBytes`, force sync/cleanup runs when disabling the integration, and the daemon received extra validation.
- Added optional procrastination blocking via `declarativeNetRequest` plus a translated block page.
- The popup gained multi-platform sharing, options were restructured with semantic HTML/ARIA, and the site features a CTA to install the VS Code extension.

## [1.1.2] - 2025-12-05

- Optimized restored-tab tracking with early returns/delta updates and synced versions across every package.

## [1.1.1] - 2025-12-05

- Started recording daily sessions and fixed the restored-items counter to avoid duplicates.

## [1.1.0] - 2025-12-04

- The landing page gained interactive demos, a safe lightbox, and a quake-mode simulation so users can preview the experience before installing the extension.

## [1.0.12] - 2025-12-04

- Added the complete MIT License text to the repository.

## [1.0.11] - 2025-12-04

- GitHub Actions workflows now declare explicit permissions to satisfy security alerts.

## [1.0.10] - 2025-12-04

- Another critical workflow was updated with the minimum permissions required by code scanning.

## [1.0.9] - 2025-12-04

- Moved the sponsor button to the main navigation and switched to the official GitHub Sponsors badge.

## [1.0.8] - 2025-12-04

- Added the security policy (`SECURITY.md`) with supported versions and a vulnerability contact channel.

## [1.0.7] - 2025-12-04

- The official site gained a support section with GitHub Sponsors integration.

## [1.0.6] - 2025-12-04

- Install links now point directly to the official Chrome Web Store listing with `rel="noreferrer"`.

## [1.0.5] - 2025-12-04

- Updated public install links and badges to reflect the Chrome Web Store launch.

## [1.0.4] - 2025-12-04

- The landing page added localization support with a language selector and `data-i18n` attributes.

## [1.0.3] - 2025-12-04

- Initial release: MV3 service worker tracking productive vs. procrastination time, popup with Chart.js, and real-time Saul Index badge.
- Options page introduced productive/villain domain lists, weight adjustments, work-hours scheduler (with overtime bonus), and quake-mode settings.
- Detailed report shipped hourly timeline, domain rankings, CSV/PDF export, and OpenAI-powered storytelling.
- Delivered the signature experience: sarcastic multi-tab toasts, quake overlay + siren, tab-switch graphs, optimized assets, and baseline docs (README/architecture/indicators).

<!--lang:es-->
# Changelog

Todas las versiones se publican mediante CI/CD; el número se actualiza automáticamente durante el build.

## [1.24.8] - 2026-04-17

Auditoría sistémica Round 3: hardening de integridad de datos, privacidad, robustez del daemon/VS Code y soporte completo de 14 locales en la extensión VS Code.

### Bugs corregidos

- El cálculo del score ya no suma `overtimeProductiveMs` en doble — `productiveMs` ya incluye overtime desde `accumulateSlice` (`score.ts`).
- Score ahora clampado a `[0, 100]` con `Math.max(0, ...)` (`score.ts`).
- `isWithinWorkSchedule` con intervalo `start==end` ahora retorna `false` en vez de cubrir 24h (`time.ts`).
- McNemar gate: p-value no significativo (>=0.05) ahora pasa el gate en vez de bloquear promoción (`validationGate.ts`).
- `vscodeActiveMs` anulado en el cálculo del score cuando `vscodeSyncSucceeded === false` (`score.ts`).
- Switches del resumen VS Code ahora cuentan cambios reales de proyecto/contexto en vez de igualar al número de sesiones (`saul-daemon/index.cjs`).
- Context breakdown ya no se aplica cuando manual override está activo (`background/index.ts`).

### Seguridad y privacidad

- Tab switches ahora hasheados por defecto en la extensión VS Code (`heartbeat-factory.js`).
- Command IDs con namespace custom anonimizados a `prefix.*` (`extra-events.js`).
- Commit messages solo incluidos en metadata de heartbeats cuando `enableSensitiveTelemetry` está habilitado (`git-tracker.js`).
- `linesAdded`/`linesDeleted` removidos de la normalización de metadata del daemon (minimización de datos).
- Header `x-saul-version` removido de todas las respuestas del daemon (previene fingerprinting).
- Workspace tracker hashea file paths en `largestFiles` (`workspace-tracker.js`).

### Robustez daemon

- Lock file previene múltiples instancias del daemon corriendo simultáneamente.
- Archivos JSON corruptos respaldados a `.corrupt` antes del fallback.
- Cap de heartbeats por clave (10.000) con trim de los más antiguos.
- Prune periódico (1h) de datos VS Code expirados.
- Warning de divergencia de timezone entre daemon y heartbeats de VS Code.
- Try/catch global en request handler con respuesta 500.
- Logging de timezone en el startup del daemon.
- Ventana de retención de heartbeats ampliada en +1 día para evitar truncamiento parcial de sesiones a medianoche.

### Robustez VS Code

- Persist de la cola ahora usa debounce (500ms) para reducir I/O.
- Persist usa promise chain con timeout de 10s.
- Fallo de persist post-flush dispara retry inmediato.
- Contador `droppedEvents` persistido en disco y restaurado en startup.
- Notificación de overflow del buffer a 80% de capacidad (throttled cada 5 min).
- Heartbeat de lifecycle emitido en `deactivate` de la extensión.
- Terminal tracker marca `backgroundActivity` cuando la ventana pierde foco.
- Comandos de terminal resetean idle timer.
- Guard de reentrancia en comando Quick Open.

### Robustez ML

- `maybeRecalibrate()` llamado antes de la resolución de pseudo-labels (`ml-engine.ts`).
- Reconciliación disparada en fallo de persist de metadatos.

### Robustez general

- `saveDailyMetrics` retorna boolean; retry con poda de quota en caso de fallo (`storage.ts`).
- `pruneMetricsForQuota` limita `suggestionsHistory` (>500) y `vscodeTimeline` (>2000) (`utils/storage.ts`).
- `persistMetrics` usa promise chain para serializar llamadas concurrentes (`background/index.ts`).
- Entradas de dominio limitadas a 500 por día (`background/index.ts`).
- Cache de sugestiones con TTL de 1h y evicción de stale (`background/index.ts`).
- Retry de metadata (3s) cuando content script no responde inicialmente.
- Service worker `onSuspend` persiste metrics cache.
- Index sync clampa timestamps futuros en el daemon.
- Flag `clamped` propagada en el resumen VS Code (`vscode-summary.ts`).
- Fingerprint de heartbeat incluye flag `isWrite` (`saul-daemon/index.cjs`).

### Mejoras

- Extensión VS Code ahora soporta los 14 locales (antes eran 3).
- Version check compara `major.minor` en vez de solo `major` (`extension.js`).
- Campo `topExtensions` aceptado en la normalización de metadata del daemon.
- Documentación de guardrails actualizada con 5 nuevos comportamientos documentados (`behavior-guardrails.md`).

## [1.24.7] - 2026-04-17

Auditoría sistémica Round 2: 32 hallazgos corregidos en 5 fases cubriendo integridad de datos, corrección ML, privacidad, robustez y mejoras generales.

### Bugs corregidos

- La cola de VS Code ahora hace flush al detenerse, previniendo pérdida de heartbeats (`buffered-event-queue.js`).
- Guard contra NaN/Infinity en temperature scaling del modelo ML (`temperatureScaler.ts`).
- McNemar con cero pares discordantes (b=0, c=0) ya no bloquea la promoción del modelo; fallback cuando <5 pares (`validationGate.ts`).
- Guard contra doble reset de métricas en noche de DST fall-back (`background/index.ts`).
- Flag `vscodeSyncInProgress` ahora usa timeout de 30s para prevenir bloqueo permanente tras suspensión del service worker.

### Seguridad y privacidad

- Payload de narrativa OpenAI ahora reemplaza nombres de dominio por etiquetas anónimas ("sitio productivo 1") antes del envío (`report.ts`).
- PAIRING_KEY enviada via stdin al daemon en vez de variable de entorno visible en `/proc/environ` (`extension.js`).
- Sirena crítica protegida contra fingerprinting por sitios web (`critical-siren.js`).
- Revocación de permisos localhost al deshabilitar integración VS Code.

### Robustez ML

- Mutex basado en promise serializa operaciones concurrentes en el modelo ML, previniendo corrupción de pesos (`ml-engine.ts`).
- Cuarentena de pseudo-labels ahora purga ejemplos implícitos existentes al detectar contradicción explícita.
- Deduplicación de labels en training store: reemplazo por dominio en vez de aleatorio (`trainingStore.ts`).
- Reconciliación IDB/storage.local continua via listener `chrome.storage.onChanged`.
- Pseudo-stability threshold aumentado a 5 predicciones en al menos 3 días calendario distintos.
- FPR gate pasa cuando ambos modelos ya tienen FPR=0 (sin mejora posible).
- Bootstrap CI upper index corregido a `Math.ceil`.
- Split de entrenamiento determinístico por hash de dominio para entradas legadas sin split explícito.

### Robustez general

- Límite de profundidad JSON en body parser del daemon (previene DoS local).
- Manejo de `EADDRINUSE` con mensaje claro en spawn del daemon.
- Normalización de backslash en paths Windows en heartbeat tracker.
- UUID fallback robusto via `crypto.randomUUID()`.
- Clamping de `totalActiveMs` señalizado con flag `clamped: true` en response.
- Tolerancia de 5s para clock skew en actualización del índice.
- Null-guards verificados en command handlers de VS Code.

### Mejoras

- Timeouts HTTP configurables en apiClient de VS Code con backward compatibility.
- Wrapper `safeJson()` con URL/status en error para diagnóstico de fallos de parse.
- IDB retry con backoff exponencial (`min(2^attempt * 100, 5000)`).
- `innerHTML` reemplazado por `createElement`/`appendChild` en locale select (defense-in-depth XSS).
- Promise rejections no manejadas ahora logueadas con `.catch(console.warn)`.
- Nota de privacidad sobre holiday API documentada en `holidays.ts`.
- Alarm drift logging cuando elapsed > 115% del período esperado.
- Contador `droppedTimelineSegments` en `DailyMetrics` para observabilidad de overflow de timeline.
- Context history init protegido contra race condition via singleton promise.
- Warning cuando dominios de bloqueo exceden límite de reglas `declarativeNetRequest`.
- Logging en toasts de auto-clasificación y modo crítico (anteriormente errores tragados).
- Tasa de colisión de hash (~15%) documentada en `auto-classification.md`.

## [1.24.5] - 2026-04-16

- Corrección del pipeline NLS de la extensión VS Code: clave `config_enable_ai_tracking_description` añadida a `generate-nls.js` y a todos los `package.nls.*.json`.
- Actualización de dependencias para resolver las 11 alertas de Dependabot: `@modelcontextprotocol/sdk` 1.12→1.29, `jspdf` 3.0→3.2, `@vscode/vsce` 3.3→3.9 (incluyendo sub-deps `hono`, `@hono/node-server`, `dompurify`, `lodash`, `picomatch`).
- Reparación de traducciones sospechosas en 13 locales vía LLM: ar(7), bn(3), de(29), es_419(115), fr(27), hi(4), it(46), ru(7), tr(22), ur(5), zh_CN(4) claves corregidas.
- Posts del blog traducidos a 13 locales (78 archivos HTML generados).

## [1.24.0] - 2026-04-16

- Nuevo sistema de tracking de actividad IA en la extensión VS Code: detección heurística de ráfagas de edición (ventana deslizante de 2s, umbral de 15+ líneas), atribución de terminal por nombre de proceso (Claude Code, Copilot, Cline, Aider, Cursor), conteo de inline completions aceptadas y registro de extensiones IA activas.
- El daemon agrega métricas IA en los endpoints `/v1/vscode/dashboard`, `/v1/vscode/telemetry` y `/v1/tracking/vscode/summary`.
- Los reportes de VS Code y Chrome muestran una sección "AI Pair Programming" con gráfico doughnut (contribución humano vs IA), 4 tarjetas KPI (líneas IA, líneas humanas, completions, comandos terminal IA) y lista de herramientas IA activas.
- Badge compacto "X% IA" en el popup de la extensión Chrome cuando hay datos de IA.
- Enriquecimiento del `applyEdit` en refactor-tracker con conteo real de líneas y detección multi-archivo.
- Nueva configuración `saulGoodman.enableAiTracking` (default: true, requiere `enableTelemetry`).
- i18n completo para los 13 locales en Chrome `_locales`, VS Code `_locales` y `package.nls.*.json`.
- Corrección de test preexistente `vscode-package-contract` que verificaba un evento de activación incorrecto.

## [1.21.32] - 2026-03-17

- Nuevo modelo WideDeepLite (wide+deep con embeddings dispersos y optimizador AdaGrad).
- CLI de replay ML offline (`tools/ml_replay`) para reprocesamiento de señales.
- Stack ML completa: temperature scaler, validation gate bootstrap, señales naturales/comportamentales.
- Ocho correcciones del code review: IDB cache, leak de openAiKey, límites de metadata, flag initializing, bootstrap chunked async, cursor getRecentExamples, persistContext debounce y utils DRY.
- Módulo reconcile para recálculo de métricas.
- Eliminación del directorio `saul-daemon` legado.
- Fix CI: referencia al `saul-daemon/package.json` eliminado.

## [1.21.31] - 2026-03-17

- Actualización de dependencias npm vía Dependabot (grupo npm_and_yarn, 3 paquetes, 2 directorios).

## [1.21.30] - 2026-02-17

- Actualización de docs internos (changelog y guías de publicación).

## [1.21.29] - 2026-02-17

- Corregimos la generación de NLS de la extensión de VS Code al incluir la clave `config_daemon_path_description`.
- El comando `npm --prefix vscode-extension run build:vsix` volvió a empaquetar la VSIX de forma consistente.

## [1.21.28] - 2026-02-17

- Actualizamos dependencias de desarrollo para cerrar alertas de Dependabot (`@modelcontextprotocol/sdk`, `hono`, `qs`, `xml2js`).
- Migramos la extensión de VS Code de `vsce` a `@vscode/vsce`.
- Revalidamos CI/CodeQL tras actualizar lockfiles.

## [1.21.27] - 2026-02-17

- Actualizamos `jspdf` a `4.1.0` vía Dependabot.

## [1.21.26] - 2026-02-17

- Integramos la rama `feat/add_languages_plus` en `main`.
- Entraron mejoras amplias de i18n (extensión, sitio, blog y VS Code), evolución de auto-clasificación/ML local y expansión de la suite MCP Quality.
- Endurecimos validaciones de seguridad (URL/protocolo/hostname y tokenización) y estabilizamos pruebas sensibles a zona horaria.

## [1.21.7] - 2026-01-06

- Cerramos otro hueco de sanitización de URLs en el módulo de blog/lightbox, resolviendo la alerta de code scanning nº 10.1.

## [1.21.6] - 2026-01-06

- Reforzamos la sanitización de substrings de URL del blog/lightbox para cerrar la alerta de seguridad nº 11.

## [1.21.5] - 2026-01-06

- Actualizamos la dependencia `jspdf` a la última versión vía Dependabot.

## [1.21.4] - 2026-01-06

- Rediseñamos el blog con hero en grid, paneles laterales, formulario de newsletter, widget de posts relacionados, estimación de tiempo de lectura y navegación entre artículos.
- El sistema de tags ahora soporta traducciones por idioma con fallback automático, mejor inferencia de tono/categoría y badges de hero traducidos.
- Agregamos sanitización de URLs/frontmatter para SSR, rebautizamos Twitter como X en todos los idiomas y sumamos un CTA de la extensión en la sidebar con enlaces a Chrome y VS Code.
- Clarificamos la visualización/orden de fechas de publicación (fuente vs. blog) y habilitamos sanitización extra en el módulo de blog.

## [1.21.3] - 2026-01-06

- Validamos las URLs de las previsualizaciones del lightbox para bloquear protocolos arbitrarios y evitar que el texto se reinterprete como HTML.

## [1.21.2] - 2026-01-06

- Agregamos la sección “CodeCon origin story” con video embebido y navegación dedicada.
- El workflow de version bump ahora interpreta commits convencionales con mayor robustez.

## [1.21.1] - 2026-01-05

- Movimos la imagen de la página de bloqueo al directorio de la extensión para asegurar su carga.
- Mantuvimos la publicación semanal automatizada del blog.

## [1.21.0] - 2026-01-02

- Nuevos modos de contexto “día libre” y “vacaciones” neutralizan la puntuación durante los descansos.
- Seguimos con los posts semanales automatizados del blog.

## [1.20.0] - 2025-12-30

- Corregimos overflows horizontales al limitar la anchura del viewport, dimensionar tarjetas de features y forzar layout de columna única en el índice.
- Elementos del hero y navegación móvil ahora respetan el ancho de pantalla, evitando cortes y scroll lateral.

## [1.19.1] - 2025-12-30

- Mejoramos el layout móvil con padding en el header, footer sin overflow, pista de swipe reactivada y parallax deshabilitado en pantallas pequeñas.
- Ajustamos el copy del modo fairness para explicar la puntuación por contexto y añadimos pista de contexto en la configuración de feriados.
- Seguimos con la publicación semanal automatizada del blog.

## [1.19.0] - 2025-12-30

- Sección explicativa del Índice de Procrastinación con gauge interactivo, tarjetas por rango y llamado a la funcionalidad de contexto.

## [1.18.1] - 2025-12-30

- Estandarizamos espaciado/indentación en JS y CSS para mantener formateo consistente.

## [1.18.0] - 2025-12-30

- El hero ahora muestra un cartel de neón con degradación dinámica de lámparas, física de cables en capas, chispas reposicionadas y un easter egg de caída.
- La secuencia de choque ganó audio en dos etapas, anillo de vidrio, estado persistente y assets reubicados para carga responsiva.
- Service worker actualizado al cache v3 con validación de origen en el handler de fetch.

## [1.17.0] - 2025-12-29

- La documentación de privacidad aclaró llamadas de red opcionales y permisos usados.

## [1.16.1] - 2025-12-29

- Corregimos imports de `main.js` en las páginas de changelog y privacidad.

## [1.16.0] - 2025-12-29

- Agregamos página de changelog con renderizado dinámico de Markdown y sección de transparencia en la página principal.
- Changelog y política de privacidad ahora soportan múltiples idiomas con renderizado por locale y claves de i18n completas.

## [1.15.0] - 2025-12-29

- El content engine incorporó cinco categorías nuevas (marketing, producto, UX design, carrera y negocios) con rotación automática, palabras clave dedicadas y reglas fallback para clasificar posts con más precisión.
- Sumamos ocho feeds RSS (UX Collective, NN/g, Mind the Product, HubSpot, Rock Content, RD Station, Harvard Business Review y Fast Company) además de heurísticas extra en el parser para ampliar el repertorio.
- El workflow del blog ahora corre los lunes, miércoles y viernes a las 08:00 BRT, acelerando la cadencia de publicaciones.

## [1.14.1] - 2025-12-29

- Reescribimos la landing page con hero y gauge animados, carrusel interactivo de features, demo del modo terremoto, onboarding en accordion, slider de testimonios y CTA fijo para desktop/mobile.
- La navegación móvil ganó menú hamburguesa con mejores estados de foco/hover, espaciado consistente y textos traducidos; las banderas se cambiaron por emojis, los botones usan la misma copia y los enlaces dejaron de apuntar a `index.html`.
- La sección de prueba social recibió badges multilingües, métricas públicas de la Chrome Web Store, un CTA dedicado para feedback (con nuevo email) y enlaces equivalentes en los CTAs fijos.
- Agregamos el enlace de instalación de la extensión VS Code en la sección técnica y una página de privacidad que renderiza Markdown directamente.

## [1.14.0] - 2025-12-29

- La exportación CSV detallada ahora incluye la timeline completa, preserva los minutos inactivos y el PDF del informe ganó secciones nuevas para storytelling y contexto.
- Simplificamos el regreso al popup al salir de opciones y convertimos el enlace de VS Code en un botón con navegación programática.

## [1.13.0] - 2025-12-29

- Lanzamos el modo Duda Razonable: override manual diario, detección de feriados, ajustes por contexto productivo/neutro/procrastinación y nuevo layout en opciones con autosave para VS Code y modo crítico.
- El informe detallado ahora muestra un banner comparando índices hipotéticos, panel de breakdown por contexto (tiempo y puntaje) y tooltip plegable explicando cada ajuste.
- Restringimos permisos del manifest solo a los endpoints necesarios, añadimos helpers de fecha con zero padding + JSDoc y reforzamos validaciones/limpieza de métricas VS Code.

## [1.12.0] - 2025-12-23

- El workflow del content engine dispara el deploy del blog (Jekyll) así que publica un artículo nuevo y mantiene la cadencia semanal automatizada en GitHub Actions.

## [1.11.1] - 2025-12-23

- Incrementamos la versión del caché del service worker para garantizar que los assets del blog se actualicen después del rollout.

## [1.11.0] - 2025-12-23

- El service worker ahora usa estrategia network-first para recursos dinámicos del blog y solo cae al caché en modo offline.
- Mantuvimos la publicación semanal automática del content engine.

## [1.10.0] - 2025-12-23

- El pipeline de build ganó caché de dependencias npm y el content engine usa pistas de los feeds para inferir categorías antes del procesamiento completo.

## [1.9.0] - 2025-12-23

- El content engine reconstruye `site/blog/index.json` en cada ejecución y el parser quedó resiliente a campos de traducción gracias a mapeos flexibles y regex.

## [1.8.0] - 2025-12-23

- El sitio ahora sirve imágenes responsivas con `srcset/sizes`, versiones comprimidas, lazy loading y caché dedicada en el service worker para reducir transferencias.

## [1.7.0] - 2025-12-23

- La extensión VS Code gestiona el ciclo de vida de `ActivityTracker` de forma global para evitar fugas al activar/desactivar la integración.

## [1.6.1] - 2025-12-23

- Optimizamos la landing page con compresión de assets, lazy loading y scripts diferidos para mejorar las métricas de performance.

## [1.6.0] - 2025-12-23

- La extensión VS Code ganó eventos de activación explícitos y distribuimos el paquete VSIX v1.5.0 (con `package-lock.json`) para facilitar instalaciones manuales.

## [1.5.0] - 2025-12-23

- La integración Chrome ↔ SaulDaemon ↔ VS Code quedó completa: timeline compartida, sincronización del índice, tracking bidireccional de cambios y métricas de IDE sumadas a los gráficos del popup e informe.
- Opciones recibió botón de test de conexión con health check/sesiones, validación de pairing key y feedback localizado; la clave persiste y los errores de autenticación explican cómo resolver.
- La extensión VS Code obtuvo i18n completo (`auto`, pt-BR, en-US, es-419), configuración `saulGoodman.language`, strings localizadas en comandos/logs/status bar y documentación dedicada.
- El informe muestra categoría neutra en el gráfico horario, métricas de inactividad más precisas y timeline unificada entre Chrome/VS Code.

## [1.4.1] - 2025-12-23

- Instrumentamos el blog con Google Analytics → Google Tag Manager, verificación del Search Console y orden que prioriza `source_published_at`.
- Publicamos un nuevo artículo sobre foco vs. procrastinación y actualizamos la documentación de SEO/RSS.

## [1.4.0] - 2025-12-23

- Lanzamos el blog multilingüe (PT/EN/ES) con layout nuevo (sidebar, badges, artwork por categoría/tono, sharing social) y traducción automática.
- Creamos el content engine automatizado con workflow en GitHub Actions (`--dry-run`, parser de fechas seguro, soporte `YYYY-MM-DD` y URLs `/posts/YYYY/<slug>/`).
- El popup empezó a recomendar artículos según las métricas del día y los posts ganaron sistema de arte por tono/categoría.

## [1.3.2] - 2025-12-23

- La documentación `AGENTS.md` se condensó para lectura rápida.

## [1.3.1] - 2025-12-23

- Publicamos el paquete VSIX de la extensión VS Code v1.3.0 para facilitar instalaciones manuales/remotas.

## [1.3.0] - 2025-12-23

- La extensión muestra una notificación local después del update con link al changelog y botón “Ver novedades” en el popup para activarlo manualmente.

## [1.2.0] - 2025-12-23

- Debutó la integración VS Code + SaulDaemon: daemon local, pairing key con prompt dedicado, comandos para iniciar/health check, status bar con el Saul Index y timeline unificada en el informe.
- El tiempo activo de VS Code suma al puntaje productivo; los IDs de sesión usan `crypto.randomBytes`, agregamos force sync/clean-up al desactivar la integración y el daemon ganó validaciones extra.
- Habilitamos el bloqueo opcional de dominios procrastinadores usando `declarativeNetRequest` y página de bloqueo traducida.
- El popup sumó sharing multi-plataforma, opciones fueron reestructuradas con semántica/ARIA y el sitio ganó CTA para instalar la extensión VS Code.

## [1.1.2] - 2025-12-05

- Optimizamos el tracking de pestañas restauradas con early returns/deltas y sincronizamos versiones en todos los paquetes.

## [1.1.1] - 2025-12-05

- Empezamos a registrar sesiones diarias y corregimos el conteo de ítems restaurados para evitar duplicidad.

## [1.1.0] - 2025-12-04

- La landing page ganó demos interactivas, lightbox seguro y simulación del modo terremoto para mostrar la experiencia sin instalar la extensión.

## [1.0.12] - 2025-12-04

- Sumamos el texto completo de la licencia MIT al repositorio.

## [1.0.11] - 2025-12-04

- Los workflows de GitHub Actions recibieron permisos explícitos para cumplir los avisos de seguridad.

## [1.0.10] - 2025-12-04

- Otro workflow crítico se actualizó con los permisos mínimos exigidos por code scanning.

## [1.0.9] - 2025-12-04

- Movimos el botón de patrocinio al menú principal y usamos el badge oficial de GitHub Sponsors.

## [1.0.8] - 2025-12-04

- Añadimos la política de seguridad (`SECURITY.md`) con versiones soportadas y canal de contacto para vulnerabilidades.

## [1.0.7] - 2025-12-04

- La página oficial ganó sección de apoyo con integración GitHub Sponsors.

## [1.0.6] - 2025-12-04

- Los enlaces de instalación ahora apuntan directamente a la Chrome Web Store oficial con `rel="noreferrer"`.

## [1.0.5] - 2025-12-04

- Actualizamos los enlaces públicos de instalación y badges para reflejar el lanzamiento en la Chrome Web Store.

## [1.0.4] - 2025-12-04

- La landing page recibió soporte de idiomas con selector y atributos `data-i18n`.

## [1.0.3] - 2025-12-04

- Release inicial: service worker MV3 rastreando tiempo productivo vs. procrastinación, popup con Chart.js y cálculo del Índice Saul en tiempo real.
- Opciones trajo listas de dominios productivos/villanos, ajuste de pesos, horarios laborales (con bono overtime) y configuraciones del modo terremoto.
- El informe detallado incluyó timeline por hora, ranking de dominios, exportación CSV/PDF y narrativa IA (OpenAI) en markdown.
- Experiencia completa con toasts sarcásticos multi-pestaña, overlay y sirena del modo terremoto, gráficos de cambios de pestaña por hora, assets optimizados y documentación base (README/arquitectura/indicadores).
