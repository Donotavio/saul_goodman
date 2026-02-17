# Saul Goodman — Extensão Chrome

Extensão MV3 que monitora produtividade vs procrastinação, calcula o índice diário e exibe UI no popup, options e relatório.

## Desenvolvimento local

```bash
npm install
npm run build
```

Depois carregue a pasta do repositório em `chrome://extensions` (modo desenvolvedor).

## Integrações

- **Saul Daemon** (opcional) para métricas do VS Code.
- **OpenAI** (opcional) para narrativa no relatório.

## Documentação

- `docs/chrome-extension.md`
- `docs/metrics.md`
- `docs/auto-classification.md`
- `docs/architecture.md`
