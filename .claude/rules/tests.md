---
globs: src/tests/**
---

# Test Rules

## Runner
- Node built-in test runner (`node:test` + `node:assert`)
- NAO usa Jest, Mocha, Vitest ou qualquer framework externo
- Import: `import { describe, it } from 'node:test'` e `import assert from 'node:assert'`

## Compilacao
- Testes em TypeScript: `src/tests/*.test.ts`
- Compilam para: `dist/tests/*.test.js`
- `npm test` faz build primeiro, depois executa

## Naming
- Arquivo: `<modulo>.test.ts`
- Prefixos por dominio:
  - `ml-*` — testes de ML (model, calibration, features, gate)
  - `daemon-*` — testes do daemon
  - `vscode-*` — testes da extensao VS Code
  - `behavior-guardrails*` — testes de edge cases documentados
  - Sem prefixo — testes gerais da Chrome extension

## Execucao
- `npm test` — todos os testes
- `npm --prefix vscode-extension test` — testes VS Code separados
- Testes devem ser deterministicos (sem dependencia de timing ou rede)

## Ao criar testes
- Sempre compilar antes de rodar (`npm run build` ou `npm test` que faz build)
- Cobrir: happy path, edge cases, e guardrails documentados
- Para ML: testar com splits deterministicos, verificar leakage
