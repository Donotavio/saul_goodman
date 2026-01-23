# Extensão Chrome

Produto principal do monorepo. A extensão monitora navegação, calcula o índice diário e oferece UI no popup, options e relatório.

## Estrutura

- **Service worker**: `dist/background/index.js` (MV3, ES modules).
- **Content script**: `dist/content/activity-listener.js` + `src/shared/critical-siren.js`.
- **UI**:
  - Popup: `src/popup/popup.html`
  - Options: `src/options/options.html`
  - Report: `src/report/report.html`
  - Block page: `src/block/block.html`

## Fluxo de tracking

1. Content script envia pings de atividade e coleta metadados de domínio.
2. Background acumula métricas a cada ciclo de alarme (1 min) e atualiza o badge.
3. Popup/report solicitam métricas via `chrome.runtime.sendMessage`.

## Configurações principais

Campos relevantes em `ExtensionSettings`:

- Listas: `productiveDomains`, `procrastinationDomains`.
- Pesos do índice: `weights`.
- Inatividade: `inactivityThresholdMs`.
- Auto‑classificação: `enableAutoClassification`, `suggestionCooldownMs`.
- Modo crítico: `criticalScoreThreshold`, `criticalSoundEnabled`.
- Horário de trabalho: `workSchedule`.
- Bloqueio local: `blockProcrastination`.
- Feriados: `holidayAutoEnabled`, `holidayCountryCode`.
- OpenAI: `openAiKey` (apenas para narrativa do relatório).
- VS Code: `vscodeIntegrationEnabled`, `vscodeLocalApiUrl`, `vscodePairingKey`.

## Armazenamento local

- `chrome.storage.local`:
  - `sg:metrics` (DailyMetrics)
  - `sg:settings` (ExtensionSettings)
  - `sg:manual-override`, `sg:context-mode`, `sg:context-history`, `sg:holidays-cache`
- IndexedDB:
  - `sg-ml-models` (modelo local de sugestões)

## UI e recursos

- **Popup**: índice, KPIs, gráfico, sugestões automáticas, ML status, justiça do dia, exportações e recomendação de blog.
- **Options**: pesos, listas, horários, feriados, integração VS Code, OpenAI, bloqueio local.
- **Report**: gráficos por hora, timeline, ranking, relatório VS Code, exportação PDF.
- **Modo crítico**: overlay e sirene quando o score ultrapassa o limiar.

## Bloqueio de domínios

- `blockProcrastination` ativa regras `declarativeNetRequest`.
- Domínios procrastinatórios são redirecionados para `src/block/block.html`.

## Integrações opcionais

- **OpenAI**: narrativa do relatório (via `https://api.openai.com/v1/chat/completions`).
- **Nager.Date**: feriados nacionais (opt‑in).
- **Saul Daemon**: métricas VS Code via `localhost`.

## Permissões (manifest)

- `storage`, `tabs`, `activeTab`, `alarms`, `idle`, `windows`, `webNavigation`, `sessions`, `declarativeNetRequest`, `notifications`.
- Host permissions opcionais: `https://date.nager.at/*`, `https://api.openai.com/*`, `http://127.0.0.1/*`, `http://localhost/*`.
