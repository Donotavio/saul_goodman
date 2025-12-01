# Guia de UX, tom de voz e microcopy

## Identidade
- Inspiração em Saul Goodman como advogado-vendedor carismático.
- Humor sarcástico, persuasivo, sem referências protegidas (nomes de episódios, imagens da série etc.).
- Linguagem 100% em **pt-BR**, informal porém clara sobre o que está sendo rastreado.

## Popup
- **Badge**: `ÍNDICE` + número atual (cálculo descrito em `docs/indicators.md`). Quando ≥ 70, valor fica em vermelho.
- **Mensagem**: textos curtos que mudam conforme faixas de score (0–25, 26–50, 51–75, 76–100). Destaque o usuário como cliente e incentive/alerta com humor.
- **Resumo**: cards "Produtivo / Procrastinação / Inatividade" exibem duração formatada com `formatDuration`.
- **Disclaimers**: cada card/resumo e KPI possui ícone `i` para explicar a métrica; tooltips devem aparecer sem extrapolar o popup incluso quando alinhados à direita.
- **Gráfico**: barras Produtivo x Procrastinação, sempre no mesmo tamanho — não deve fazer a tela rolar.
- **Indicadores extras**: seis cartões ("Foco ativo", "Trocas por hora", "Tempo ocioso", "Prod x Proc", "Imersão campeã", "Vilão do dia"). Cada um exibe valores derivados e copy curta explicando o significado.
- **Exportações**: seção “Defenda seu foco” com texto breve e botões para baixar CSV, gerar PDF rápido e abrir o relatório completo.
- **Top 5 domínios**: lista ordenada desc, mostrando tempo formatado e cor por categoria.
- **Modo terremoto (≥ 90)**: body treme, overlay toma a tela com mensagem do Saul, contador regressivo (45s) e CTAs (“Abrir relatório”, “Revisar domínios”, “Ativar alerta sonoro”). A sirene só toca se o usuário consentir e a escolha fica persistida. Ao fechar o overlay ele só volta quando o score continua crítico.
- **CTA**:
  - `Atualizar`: força `metrics-request`.
  - `Configurar`: abre options.
  - `Limpar dados`: confirma antes de chamar `clear-data`.
- **Disclaimer**: “Todos os dados ficam no navegador. Saul honra o sigilo profissional.”

## Options page
- Texto guia lembra que tudo é local e incentiva o usuário a registrar sites produtivos/vilões.
- Formulário de pesos exige soma ≈ 1.0; exibir feedback em `statusMessage` por 4s.
- Botões "Adicionar"/"Remover" sempre confirmam visualmente (mensagem de status).
- "Restaurar padrões" pergunta antes de aplicar defaults e envia `settings-updated`.
- Campo "Chave OpenAI" opcional: explique que o valor fica salvo localmente e habilita o storytelling na página de relatório.
- Hash `#vilains`: quando aberto a partir do modo crítico/relatório, rolar suavemente até o bloco de domínios procrastinatórios e destacá-lo (animação pulsante) por alguns segundos para guiar a ação.

## Relatório detalhado (`src/report/report.html`)
- Header com tagline, índice, botão PDF e link de volta. Mantém gradiente + moldura como nos outros toques visuais.
- Gráfico principal: barras empilhadas por hora (produtivo, procrastinação, inatividade) e doughnut com composição do dia.
- Lista “Campeões e vilões” resume top domínios e maior período ocioso.
- Ranking mostra top produtivos e procrastinação com barras de progresso.
- Narrativa minuto a minuto mostra trechos >5 min com horário formatado.
- Bloco “Argumento do Saul” chama a OpenAI (quando chave configurada) para gerar texto sarcástico.
- Botão “Exportar PDF” gera documento paisagem com gráficos e narrativa.
- Banner crítico (score ≥ 90) reaproveita as mensagens do modo terremoto, exibe contador e CTA “Revisar vilões” que abre `options.html#vilains`.

## Conteúdo e mensagens
- **Sucesso**: “Cliente de ouro! Continue assim…”
- **Alerta moderado**: “Vejo sinais de fuga de responsabilidade…”
- **Alerta severo**: “Você está brincando com fogo…”
- **Erro genérico**: “Ops! Não consegui falar com o escritório.”
- **Confirm dialogs**: diretos e sem exageros ("Tem certeza? Isso zera apenas o dia atual.").

## Acessibilidade & responsividade
- Layout pensado para 360×600 px.
- Contraste forte (preto/amarelo/branco) e textos ≥ 0.9rem.
- Botões com `cursor: pointer` e foco visual (border).
- Canvas dentro de `.chart-wrapper` com altura fixa para evitar scroll.

## Boas práticas futuras
- Se adicionar novas mensagens, mantenha o tom vendedor-irônico.
- Caso suporte inglês, mantenha ambos os idiomas no storage (ex.: `locale`), mas não misture no mesmo texto.
- Sempre informe o usuário ao alterar dados sensíveis (limpar métricas, resetar listas).
- No PDF inclua texto introdutório alinhado ao tom do popup e mantenha o gráfico e KPIs na mesma ordem do painel.
