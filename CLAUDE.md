# Saul Goodman Monorepo

<!-- Notas de manutencao: este arquivo e carregado em toda sessao Claude Code.
     Manter abaixo de 200 linhas. Detalhes por dominio estao em .claude/rules/.
     Comentarios HTML block-level sao removidos do contexto automaticamente. -->

## Visao geral

Local-first productivity tracker: Chrome extension (MV3) + VS Code extension + daemon + site/blog.
TypeScript (ES2021, strict), sem bundler, Node built-in test runner.

@AGENTS.md

## Build & test

- `npm run build` — compilar TypeScript
- `npm test` — build + todos os testes (Node --test)
- `npm --prefix vscode-extension test` — testes VS Code extension
- `npm run mcp:quality` — suite QA visual/performance

## Comandos-chave

- `npm run i18n:sync && npm run i18n:check` — apos mudancas de locale
- `npm run blog:index` — rebuild blog index
- `npm run ml:replay -- --input <dataset>` — avaliacao offline ML
- `npm run package:webstore` — empacotamento Chrome Web Store
- `npm --prefix vscode-extension run build:vsix` — empacotamento VSIX

## Non-negotiables

- Local-first: sem backends externos sem pedido explicito
- Browser data em chrome.storage.local e IndexedDB
- Nunca editar dist/ — saida do build, editar src/
- Privacy-preserving: sem envio de codigo ou dados de navegacao
- Network calls opt-in e documentadas
- Pairing key auth obrigatorio para rotas protegidas do daemon
- Mudancas de texto exigem atualizacao i18n em 14 locales
- Mudancas ML exigem evidencia de calibracao e validation gate

## Convencoes

- TS compila para dist/, HTML referencia dist/
- Chrome APIs via chrome.* (MV3 service worker)
- Testes: src/tests/*.test.ts via Node --test (NAO Jest)
- ML: src/shared/ml/ (treinamento, calibracao, features, natural signals)
- I18n: _locales/<locale>/messages.json (formato Chrome)

## Mapa de componentes

| Componente | Caminho |
|-----------|---------|
| Chrome extension | src/, manifest.json |
| Saul Daemon | saul-daemon/ |
| VS Code extension | vscode-extension/ |
| Site/blog | site/, site/blog/ |
| ML engine | src/shared/ml/, src/background/ml-engine.ts |
| Tools | tools/content_engine/, tools/i18n/, tools/mcp_quality/, tools/ml_replay/ |

## Documentacao

Consultar antes de mudancas na area correspondente:

- @docs/architecture.md
- @docs/chrome-extension.md
- @docs/saul-daemon.md
- @docs/vscode-extension.md
- @docs/auto-classification.md
- @docs/i18n.md
- @docs/blog.md
- @docs/ux-and-copy.md
- @docs/metrics.md
- @docs/behavior-guardrails.md
