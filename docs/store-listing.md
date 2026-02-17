# Chrome Web Store — Materiais de publicação

## Nome

Saul Goodman — Extensão anti-procrastinação

## Descrição curta (até 132 caracteres)

Radar sarcástico que mede produtividade vs procrastinação, mostra KPIs no popup e ativa alerta crítico quando o foco escapa.

## Descrição longa

A Saul Goodman Extension monitora quanto tempo você passa em domínios produtivos ou procrastinatórios e calcula um Índice de Procrastinação (0–100) em tempo real. O popup exibe gráficos, KPIs, top domínios e exportações (CSV/PDF). O “modo crítico” alerta quando o índice ultrapassa o limiar configurado, e o relatório detalhado mostra timeline, contexto e comparativos por hora.

Tudo roda localmente no seu navegador. Nenhum dado é enviado para servidores externos por padrão.

### Destaques

- Badge e popup com índice atualizado.
- KPIs de foco, inatividade e trocas de abas.
- Sugestões automáticas de classificação (local, opt‑in).
- Relatório detalhado com gráficos por hora e exportação PDF.
- Bloqueio local opcional de domínios procrastinatórios.
- Integração opcional com VS Code via daemon local.
- Narrativa por IA apenas com chave OpenAI configurada.

### Permissões (justificativas)

- `tabs` / `activeTab`: ler URL ativa para classificar domínios.
- `storage`: guardar métricas e configurações.
- `alarms`: contagem periódica e reset diário.
- `idle`: detectar inatividade real.
- `windows`: detectar quando o navegador perde foco.
- `webNavigation`: detectar navegações SPA.
- `sessions`: contar itens fechados recentemente.
- `declarativeNetRequest`: bloqueio local de domínios procrastinatórios.
- `notifications`: avisos de release notes.

### Host permissions opcionais

- `https://date.nager.at/*` — feriados nacionais (opt‑in).
- `https://api.openai.com/*` — narrativa no relatório (opt‑in).
- `http://127.0.0.1/*` / `http://localhost/*` — integração com Saul Daemon.

### Política de privacidade

Use o texto em `docs/privacy-policy.md` e publique em um link acessível pela loja.

## Empacotamento para envio

Para o passo a passo completo de empacotamento e checklist de release, consulte `docs/release.md`.
