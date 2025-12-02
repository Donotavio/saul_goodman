# Chrome Web Store — Materiais de Publicação

## Nome

Saul Goodman — Extensão anti-procrastinação

## Descrição curta (132 caracteres máx.)

Radar sarcástico que mede produtividade vs. procrastinação, mostra KPIs no popup e treme quando seu foco vai para o banco dos réus.

## Descrição longa

A Saul Goodman Extension monitora quanto tempo você passa em domínios produtivos ou procrastinatórios e calcula um Índice de Procrastinação (0–100) em tempo real. O popup exibe gráficos, KPIs, top domínios e exportações (CSV/PDF). O “modo terremoto” alerta quando o índice estoura o limite e leva você direto para ajustar vilões ou abrir o relatório detalhado. Tudo roda localmente no seu navegador; nenhum dado é enviado para servidores externos.

### Destaques

- Badge e popup com índice atualizado em tempo real.
- Gráfico Produtivo vs. Procrastinação + KPIs (foco ativo, trocas/h, tempo ocioso, campeões/vilões).
- Exportação rápida em CSV/PDF e relatório detalhado com timeline por hora.
- Modo terremoto com overlay e sirene opcional ao ultrapassar o limiar configurável.
- Listas editáveis de domínios produtivos/vilões e horários de trabalho; minutos produtivos fora do expediente contam em dobro.
- Funciona 100% local; opcionalmente usa OpenAI para gerar narrativa se você fornecer sua chave.

### Permissões (justificativa)

- `tabs` / `activeTab`: ler a URL ativa para classificar o domínio como produtivo/procrastinação/neutral.
- `storage`: guardar métricas e configurações no seu navegador.
- `alarms`: agendar contagem periódica e reset diário.
- `<all_urls>`: permitir a classificação em qualquer site que você abrir.

### Política de privacidade

Inclua o link público para `docs/privacy-policy.md` (por ex.: <https://seu-site.com/privacy-policy> ou GitHub Pages). Resumo: não coletamos nem compartilhamos dados; tudo fica em `chrome.storage.local`. Só há tráfego externo se o usuário informar chave OpenAI para gerar narrativa.

### Suporte

Informe email ou URL de suporte (site institucional em `site/` ou repositório).
