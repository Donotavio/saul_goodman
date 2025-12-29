# Changelog

Todas as versões são publicadas pelo CI/CD; a versão é atualizada automaticamente no build.

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
