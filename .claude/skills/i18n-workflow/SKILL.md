---
name: i18n-workflow
description: Manage internationalization across 13 locales for Chrome extension, VS Code extension, and static site. Sync, validate, repair, generate stubs, and understand the 3-layer architecture.
user-invocable: true
allowed-tools:
  - Bash(npm run i18n:*)
  - Bash(npm run build:*)
  - Read
  - Edit
  - Write
  - Grep
  - Glob
paths:
  - _locales/**
  - vscode-extension/_locales/**
  - vscode-extension/package.nls*
  - vscode-extension/src/extension.js
  - tools/i18n/**
  - site/_locales/**
  - site/blog/_locales/**
  - src/block/block.html
  - docs/i18n.md
---

## Status i18n atual

!`npm run i18n:check --silent 2>&1 | tail -15`

Locales Chrome:
!`ls _locales/ 2>/dev/null`

Locales VS Code:
!`ls vscode-extension/_locales/ 2>/dev/null`

# i18n Workflow

## Arquitetura de 3 camadas

O monorepo tem **3 sistemas de i18n independentes** que compartilham o formato Chrome (`{ key: { message: "..." } }`):

### Camada 1: Chrome Extension (`_locales/`)

- **Arquivos**: `_locales/<locale>/messages.json` (~1.222 keys cada)
- **Locale base**: `en_US`
- **Como funciona no HTML**: elementos usam `data-i18n="key_name"` e o JS aplica traduzindo via `createI18n()` / `I18nImpl.t()` (em `src/shared/i18n.ts`)
- **Como funciona no TS**: `chrome.i18n.getMessage('keyName')` no background/service worker, ou `t('keyName')` via instancia `I18nImpl`
- **Fallback**: texto no atributo `data-i18n` do HTML deve ser em en-US (o JS sobrescreve em runtime)
- **Resolucao de locale**: `resolveLocale()` usa `localePreference` do settings ou `chrome.i18n.getUILanguage()`

### Camada 2: VS Code Extension (`vscode-extension/_locales/` + `package.nls*.json`)

Dois sub-sistemas:

#### 2a. Package NLS (`package.nls*.json`)
- **Arquivos**: `vscode-extension/package.nls.json` (en-US base) + `package.nls.pt-br.json`, `package.nls.es.json`
- **Uso**: strings de UI do VS Code (titulos de comandos, descricoes de settings no `package.json`)
- **Formato**: flat JSON `{ "key": "value" }` (formato VS Code NLS, NAO Chrome)
- **Quantidade**: ~23 keys cada
- **Atualizacao**: manual, nao coberto pelo pipeline `i18n:sync`

#### 2b. Runtime locales (`vscode-extension/_locales/`)
- **Arquivos**: `vscode-extension/_locales/<locale>/messages.json` (~1.233 keys cada)
- **Uso**: strings de runtime carregadas pela funcao `localize()` em `extension.js` (linha 84)
- **Formato**: Chrome format `{ key: { message: "..." } }`
- **Como chega ao webview**: `getReportI18n()` (extension.js ~linha 840) monta um dicionario plano e injeta como `window.__SAUL_I18N__` no HTML do webview
- **No webview JS**: `const i18n = window.__SAUL_I18N__ || {};` e depois `i18n.key_name || 'fallback'`

**IMPORTANTE: VS Code-exclusive keys**
O `vscode-extension/_locales/` contem keys que NAO existem em `_locales/` da Chrome extension. Exemplos:
- `report_vscode_chart_label_coding`, `report_vscode_chart_label_debugging`, etc.
- `report_vscode_combo_streak`, `report_vscode_combo_tooltip`, etc.
Essas keys sao exclusivas do VS Code e DEVEM ser preservadas durante o pipeline.

### Camada 3: Site/Blog (copias de `_locales/`)

- **Destinos**: `site/_locales/` e `site/blog/_locales/` (ambos gitignored)
- **Fonte**: copia de `_locales/` (Chrome extension)
- **Script**: `npm run i18n:copy-site` (`tools/i18n/copy-locales-to-site.js`)
- **Comportamento**:
  - Site e blog: **overwrite** completo (apaga e recopia)
  - VS Code: **merge** (preserva keys exclusivas, source wins para keys compartilhadas)

## Pipeline completo

Para atualizar todos os locales de uma vez:
```bash
npm run i18n:full-lang-update
```

Isso executa em sequencia:
1. `i18n:sync` — propaga keys do en_US para todos os locales Chrome
2. `i18n:repair-locale` — traduz keys faltantes via LLM (requer `LLM_API_KEY`)
3. `i18n:check` — valida completude
4. `i18n:stubs` — gera stubs se necessario
5. `i18n:copy-site` — copia para site e faz merge no VS Code

## Pipeline passo a passo

### 1. Sincronizar locales Chrome
```bash
npm run i18n:sync
```
Propaga keys de `_locales/en_US/messages.json` para todos os outros locales.
NAO toca em `vscode-extension/_locales/` — keys exclusivas do VS Code precisam ser adicionadas manualmente.

### 2. Verificar completude
```bash
npm run i18n:check
```
Lista keys faltantes em cada locale (Chrome e VS Code).

### 3. Reparar locales (LLM-assistido)
```bash
npm run i18n:repair-locale
```
Usa LLM para traduzir keys faltantes. Requer `LLM_API_KEY`.
Para um locale especifico: `npm run i18n:repair-locale -- --locale zh_CN`

### 4. Gerar stubs
```bash
npm run i18n:stubs
```
Cria stubs para novos locales que ainda nao existem.

### 5. Copiar para site e fazer merge no VS Code
```bash
npm run i18n:copy-site
```
- **Overwrite**: `site/_locales/` e `site/blog/_locales/` (copia limpa)
- **Merge**: `vscode-extension/_locales/` (preserva keys exclusivas do VS Code)

## Adicionar novas keys

### Para a Chrome Extension
1. Adicionar key em `_locales/en_US/messages.json`
2. Rodar `npm run i18n:sync` para propagar
3. Rodar `npm run i18n:check` para validar

### Para a VS Code Extension (key compartilhada com Chrome)
1. Adicionar key em `_locales/en_US/messages.json`
2. Rodar `npm run i18n:sync && npm run i18n:copy-site`
3. A key sera copiada para `vscode-extension/_locales/` via merge

### Para a VS Code Extension (key exclusiva)
1. Adicionar key em `vscode-extension/_locales/en_US/messages.json`
2. Propagar manualmente para os outros 12 locales (ou usar `i18n:repair-locale`)
3. Se a key deve aparecer em webviews: adicionar mapeamento em `getReportI18n()` no `extension.js`
4. No JS do webview: usar `const i18n = window.__SAUL_I18N__ || {};` e `i18n.key_name || 'Fallback'`

### Para o Package NLS (VS Code UI contributions)
1. Adicionar em `vscode-extension/package.nls.json` (en-US)
2. Atualizar `package.nls.pt-br.json` e `package.nls.es.json` manualmente
3. Referenciar no `package.json` como `%key_name%`

## Padrao de uso no webview VS Code

```javascript
// No arquivo JS do webview (reports, charts, etc.)
const i18n = window.__SAUL_I18N__ || {};

// Strings simples com fallback en-US
label: i18n.report_vscode_chart_label_coding || 'Coding',

// Strings com placeholders
const text = (i18n.report_vscode_combo_tooltip || '{count}x combo ({minutes} min)')
  .replace('{count}', pomodoros)
  .replace('{minutes}', minutes);

// Locale para formatacao de data (usar lang do documento, nao hardcodar)
date.toLocaleTimeString(document.documentElement.lang || undefined, { hour: '2-digit', minute: '2-digit' });
```

## Padrao de uso no host VS Code (extension.js)

```javascript
// Funcao localize() carrega de _locales/<locale>/messages.json
const text = localize('key_name');

// Para expor ao webview, adicionar em getReportI18n():
report_vscode_chart_label_coding: localize('report_vscode_chart_label_coding'),
```

## Padrao de uso no HTML Chrome

```html
<!-- Texto traduzido via data-i18n (fallback em en-US no HTML) -->
<h1 data-i18n="block_page_heading">Saul blocked this domain</h1>

<!-- Atributos traduzidos -->
<img data-i18n-alt="block_page_img_alt" alt="Disappointed" />

<!-- HTML dinamico (cuidado: nunca conteudo de usuario) -->
<p data-i18n-html="key_with_html">Default <b>bold</b></p>
```

## Locales suportados (13)

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
- Keys descritivos em snake_case (formato Chrome)
- Nunca hardcodar texto em HTML, TypeScript ou JavaScript
- Fallback em en-US no HTML (o JS traduz em runtime)
- Nunca hardcodar locale (ex: `'pt-BR'`) — usar `document.documentElement.lang || undefined`
- Testar layout RTL apos mudancas em ar/ur
- Manter consistencia de tom entre locales
- VS Code webview: sempre usar `i18n.key || 'Fallback'` (nunca assumir que i18n esta disponivel)
- Ao rodar `i18n:copy-site`: site = overwrite, vscode = merge (keys exclusivas preservadas)
- Ao adicionar key exclusiva do VS Code: propagar manualmente para todos os 13 locales

## Troubleshooting

### Keys do VS Code sumiram apos pipeline
O `i18n:copy-site` faz merge para `vscode-extension/_locales/`. Se keys sumiram, verificar se `tools/i18n/copy-locales-to-site.js` esta usando `mergeLocalesInto()` (e nao `copyDirRecursive()`) para o target VS Code.

### Key aparece no locale mas nao no webview
Verificar se a key esta mapeada em `getReportI18n()` no `extension.js`. O webview so recebe as keys que estao nesse dicionario.

### Locale nao detectado corretamente no VS Code
O setting `saulGoodman.language` (`auto`, `en-US`, `pt-BR`, `es-419`) controla. `auto` usa `vscode.env.language`.
