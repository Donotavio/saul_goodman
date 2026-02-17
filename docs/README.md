# Documentação oficial — Saul Goodman

Esta pasta é a fonte de verdade para a documentação do monorepo. Os READMEs fora de `docs/` são apenas pontos de entrada e sempre apontam para este conteúdo.

## Componentes do monorepo

- **Extensão Chrome (principal)** — código em `src/`, build em `dist/`.
- **Saul Daemon** — serviço local em `saul-daemon/`.
- **Extensão VS Code** — cliente do daemon em `vscode-extension/`.
- **Site e blog** — estáticos em `site/`.

## Começando (dev)

```bash
npm install
npm run build
npm test
```

## Guias principais

- `docs/architecture.md` — visão geral da arquitetura e fluxos.
- `docs/chrome-extension.md` — detalhes da extensão Chrome.
- `docs/metrics.md` — métricas, KPIs e cálculo do índice.
- `docs/behavior-guardrails.md` — comportamentos atuais e riscos conhecidos.
- `docs/auto-classification.md` — sugestão automática e aprendizado local.
- `docs/vscode-extension.md` — extensão VS Code e configurações.
- `docs/saul-daemon.md` — serviço local, endpoints e armazenamento.
- `docs/i18n.md` — internacionalização do produto e do site.
- `docs/blog.md` — blog, indexação e content engine.
- `docs/ux-and-copy.md` — diretrizes de tom, UX e microcopy.
- `docs/privacy-policy.md` — política de privacidade (multi-idioma).
- `docs/store-listing.md` — materiais para a Chrome Web Store.
- `docs/store-assets.md` — organização de screenshots e assets.
- `docs/mcp-quality.md` — suíte de QA visual/performance.

## Convenções rápidas

- **Código como fonte de verdade**: em caso de conflito, os docs devem ser atualizados para refletir o comportamento real.
- **Dados locais por padrão**: tudo fica no navegador ou no daemon local; redes externas são sempre opt-in.
- **Sem alterações em `dist/`**: build sempre a partir de `src/`.

## Governança

- `CHANGELOG.md` — histórico de versões.
- `SECURITY.md` — política de segurança.
