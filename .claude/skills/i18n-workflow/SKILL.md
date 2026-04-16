---
name: i18n-workflow
description: Manage internationalization across 14 locales for Chrome extension, VS Code extension, and static site. Sync, validate, repair, and generate locale stubs.
user-invocable: true
allowed-tools:
  - Bash(npm run i18n:*)
  - Bash(npm run build:*)
  - Read
  - Edit
  - Grep
  - Glob
paths:
  - _locales/**
  - vscode-extension/_locales/**
  - vscode-extension/package.nls*
  - tools/i18n/**
  - site/_locales/**
  - docs/i18n.md
---

## Status i18n atual

!`npm run i18n:check --silent 2>&1 | tail -15`

Locales:
!`ls _locales/ 2>/dev/null`

# i18n Workflow

## Pipeline completo

Para atualizar todos os locales de uma vez:
```bash
npm run i18n:full-lang-update
```

## Pipeline passo a passo

### 1. Sincronizar locales
```bash
npm run i18n:sync
```
Propaga keys de en_US para todos os locales.

### 2. Verificar completude
```bash
npm run i18n:check
```
Lista keys faltantes em cada locale.

### 3. Reparar locales (LLM-assistido)
```bash
npm run i18n:repair-locale
```
Usa LLM para traduzir keys faltantes. Requer `LLM_API_KEY`.

### 4. Gerar stubs
```bash
npm run i18n:stubs
```
Cria stubs para novos locales.

### 5. Copiar para site
```bash
npm run i18n:copy-site
```
Copia _locales/ para site/_locales/ (gitignored).

## VS Code NLS

Os arquivos `package.nls.*.json` do VS Code extension usam formato diferente.
Atualizar manualmente apos mudancas em strings de comandos ou settings.

## Locales suportados (14)

| Locale | Idioma | RTL |
|--------|--------|-----|
| en_US | English | No |
| pt_BR | Portuguese (Brazil) | No |
| es_419 | Spanish (Latin America) | No |
| ar | Arabic | Yes |
| bn | Bengali | No |
| de | German | No |
| fr | French | No |
| hi | Hindi | No |
| it | Italian | No |
| ru | Russian | No |
| tr | Turkish | No |
| ur | Urdu | Yes |
| zh_CN | Chinese (Simplified) | No |

## Regras

- Toda string visivel ao usuario DEVE ter i18n key
- Keys descritivos em camelCase
- Nunca hardcodar texto em HTML ou TypeScript
- Testar layout RTL apos mudancas em ar/ur
- Manter consistencia de tom entre locales
