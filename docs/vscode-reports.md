# VS Code Reports

## Overview

Saul Goodman now captures VS Code activity via the local Saul Daemon and exposes WakaTime-style
reports to both the Chrome report page and a VS Code Webview.

Components:
- VS Code extension: captures heartbeats and extra events, batches them, and sends to Saul Daemon.
- Saul Daemon: stores heartbeats, builds durations, and serves report endpoints.
- Chrome extension: renders VS Code reports when enabled in Options.
- VS Code Webview: renders the same report inside the editor.

Storage:
- Saul Daemon writes VS Code data to `saul-daemon/data/vscode-tracking.json`.

## Setup

1) Start the daemon and set a pairing key.
2) VS Code settings:
   - `saulGoodman.enableTracking` = true
   - `saulGoodman.enableReportsInVscode` = true
   - `saulGoodman.apiBase` and `saulGoodman.pairingKey` configured
3) Chrome Options:
   - `Enable VS Code Reports` = ON
   - Pairing key matches the VS Code extension

## Feature flags

Chrome:
- `vscodeIntegrationEnabled` (default OFF): enables VS Code tracking and report sections in `src/report/report.html`.

All VS Code report endpoints return only the current day, even if date filters are provided.

VS Code:
- `saulGoodman.enableTracking` (default ON): start/stop heartbeat collection.
- `saulGoodman.enableReportsInVscode` (default ON): allow Webview reports.
- `saulGoodman.enableSensitiveTelemetry` (default OFF): reserved for future sensitive data.

## Privacy defaults

- `entity` (file path) is hashed with a local salt by default.
- `project` is derived from the workspace folder name (hash optional).
- `machineId` is a local UUID, not the hostname.
- No code content is stored.

VS Code settings:
- `saulGoodman.hashFilePaths` (default true)
- `saulGoodman.hashProjectNames` (default false)

## Retention (daemon)

Set environment variables:
- `SAUL_VSCODE_GAP_MINUTES` (default 5)
- `SAUL_VSCODE_GRACE_MINUTES` (default 2)

## SaulHeartbeat schema

```
{
  "id": "uuid",
  "time": "2024-01-01T10:00:00.000Z",
  "entityType": "file",
  "entity": "sha256",
  "project": "saul_goodman",
  "language": "typescript",
  "category": "coding",
  "isWrite": true,
  "editor": "vscode",
  "pluginVersion": "1.21.10",
  "machineId": "uuid",
  "metadata": {
    "linesAdded": 4,
    "linesRemoved": 1,
    "windowFocused": true,
    "workspaceId": "uuid",
    "branch": "main",
    "commandId": "task"
  }
}
```

## Endpoints (Saul Daemon)

- `POST /v1/vscode/heartbeats` (batch)
- `GET /v1/vscode/heartbeats`
- `GET /v1/vscode/durations`
- `GET /v1/vscode/summaries?start=YYYY-MM-DD&end=YYYY-MM-DD`
- `GET /v1/vscode/stats/today`
- `GET /v1/vscode/projects?start=...&end=...`
- `GET /v1/vscode/languages?start=...&end=...`
- `GET /v1/vscode/editors?start=...&end=...`
- `GET /v1/vscode/machines?start=...&end=...`
- `GET /v1/vscode/meta`

Query filters (where supported):
- `project`, `language`, `editor`, `machine`, `category`, `entityType`

## Sample payloads

### POST /v1/vscode/heartbeats

```
{
  "key": "my-pairing-key",
  "heartbeats": [
    {
      "id": "hb-1",
      "time": "2024-01-01T10:00:00.000Z",
      "entityType": "file",
      "entity": "c9f2...",
      "project": "saul_goodman",
      "language": "typescript",
      "category": "coding",
      "isWrite": true,
      "editor": "vscode",
      "pluginVersion": "1.21.10",
      "machineId": "uuid",
      "metadata": {
        "linesAdded": 2,
        "linesRemoved": 0,
        "windowFocused": true
      }
    }
  ]
}
```

### GET /v1/vscode/summaries

```
{
  "version": 1,
  "range": { "start": "2024-01-01", "end": "2024-01-07", "timezone": "America/Sao_Paulo" },
  "data": {
    "total_seconds": 14400,
    "human_readable_total": "4h",
    "days": [
      {
        "date": "2024-01-01",
        "total_seconds": 7200,
        "projects": [{ "name": "saul_goodman", "total_seconds": 7200, "percent": 1 }],
        "languages": [{ "name": "typescript", "total_seconds": 7200, "percent": 1 }],
        "editors": [{ "name": "vscode", "total_seconds": 7200, "percent": 1 }],
        "categories": [{ "name": "coding", "total_seconds": 7200, "percent": 1 }],
        "machines": [{ "name": "uuid", "total_seconds": 7200, "percent": 1 }]
      }
    ]
  }
}
```

### GET /v1/vscode/stats/today

```
{
  "version": 1,
  "range": { "start": "2024-01-01", "end": "2024-01-01", "timezone": "America/Sao_Paulo" },
  "data": {
    "total_seconds": 14400,
    "human_readable_total": "4h",
    "projects": [{ "name": "saul_goodman", "total_seconds": 14400, "percent": 1 }],
    "languages": [{ "name": "typescript", "total_seconds": 14400, "percent": 1 }]
  }
}
```
