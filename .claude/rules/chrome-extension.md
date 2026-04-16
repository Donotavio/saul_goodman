---
globs: src/**, manifest.json
---

# Chrome Extension Rules

## MV3 Service Worker
- Background script (`src/background/index.ts`) roda como service worker — sem acesso ao DOM
- Alarmes via `chrome.alarms` para tarefas periodicas (badge update: 1 min)
- Mensagens via `chrome.runtime.sendMessage` / `chrome.runtime.onMessage`
- Tipo de mensagem: `RuntimeMessage` -> `RuntimeMessageResponse`

## Storage
- Todas as keys usam prefixo `sg:` — ex: `sg:metrics`, `sg:settings`
- `chrome.storage.local` para metricas e configuracoes
- IndexedDB para estado do modelo ML (`sg-ml-models`, schema `single-neural-lite-v4`)
- Nunca usar `chrome.storage.sync` (dados locais demais)

## UI Surfaces
- Popup: `src/popup/` (popup.html/ts/css) — dashboard rapido
- Options: `src/options/` (options.html/ts/css) — configuracoes completas
- Report: `src/report/` (report.html/ts/css) — relatorio detalhado
- Block: `src/block/` (block.html/js) — pagina de bloqueio
- Critical siren: `src/shared/critical-siren.js` — overlay de modo critico

## Permissions
- Required: storage, tabs, alarms, activeTab, idle, windows, webNavigation, sessions, declarativeNetRequest, notifications
- Optional host: date.nager.at, api.openai.com, localhost/127.0.0.1
- Content script roda em `<all_urls>` em `document_idle`

## Convencoes
- Imports de shared usam caminhos relativos (`../shared/`)
- Features comportamentais usam prefixo `has` (hasVideoPlayer, hasInfiniteScroll)
- Default work schedule: [08:00-12:00, 14:00-18:00]
- `declarativeNetRequest` para bloqueio de sites
