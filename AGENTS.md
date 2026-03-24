# Repository Guidelines

This repository uses project-specific skills for Codex.

## Skill routing

Use the minimum set of skills required for each task.

- `skills/saul_backend/SKILL.md`
  - Use for Saul Daemon, local HTTP endpoints, JSON persistence, pairing key auth, Chrome <-> VS Code sync, local API contracts, retention rules, CORS, telemetry ingestion.

- `skills/saul_frontend/SKILL.md`
  - Use for Chrome extension UI, popup, options, report, block page, background/content interactions that affect UX, static site/blog pages, i18n and copy updates.

- `skills/saul_ml/SKILL.md`
  - Use for local auto-classification, feature extraction, online logistic regression, IndexedDB model persistence, confidence thresholds, suggestion cooldown and feedback learning.

## Architecture guardrails

- The product is local-first. Do not introduce external backends unless explicitly requested.
- Browser data stays in `chrome.storage.local` and IndexedDB when applicable.
- VS Code integration is optional and depends on Saul Daemon running on localhost.
- Any network call must be opt-in and documented.
- Do not edit `dist/` directly. Build outputs must come from source files.
- Prefer changes that preserve privacy and avoid sending code or sensitive browsing content externally.

## Repository facts

- Main product: Chrome extension in `src/`
- Local bridge service: `saul-daemon/`
- VS Code companion: `vscode-extension/`
- Static site/blog: `site/`
- Official docs source of truth: `docs/`

## Documentation to consult before changes

- `docs/architecture.md`
- `docs/chrome-extension.md`
- `docs/saul-daemon.md`
- `docs/vscode-extension.md`
- `docs/auto-classification.md`
- `docs/i18n.md`
- `docs/blog.md`