# Repository Guidelines

## Project Structure & Module Organization
Core code lives under `src/`, arranged by feature domains (`background/`, `content/`, `popup/`, `options/`, `report/`, `shared/utils/`, `tests/`). Build artifacts mirror this layout in `dist/` and must never be edited directly. Icons belong in `src/img/`; landing-page files stay in `site/assets/`; vendored libraries (e.g., Chart.js, jsPDF) go into `src/vendor/` with version notes. Documentation updates reside in `docs/` whenever flows, metrics, or copy change. Load the unpacked extension via Chrome (`chrome://extensions` → Developer Mode → “Carregar sem compactação” → repo root) after running a build.

## Build, Test, and Development Commands
- `npm install` — install dependencies (Node 18+).
- `npm run build` — clean and compile TypeScript into `dist/` via `tsc`.
- `npm run watch` — incremental TypeScript rebuilds during development.
- `npm test` — rebuild, then execute Node’s test runner over `dist/tests/**/*.test.js`.
- `npm run clean` — remove `dist/` before a pristine build.

## Coding Style & Naming Conventions
Use TypeScript ES modules with 2-space indentation and semicolons. Exported functions and helpers should declare explicit return types. Follow naming rules: PascalCase for interfaces/types, camelCase for variables and functions, and UPPER_SNAKE_CASE for constants (`TRACKING_ALARM`). Keep logic close to its domain (background logic in `src/background/`, UI scripts with their views, shared helpers in `src/shared/utils/`).

## Testing Guidelines
Author deterministic specs in `src/tests/**/*.test.ts`; compiled JavaScript runs through Node’s native test runner. Mock Chrome APIs, timers, and storage to avoid flaky behavior. Run `npm test` before submitting changes to scoring, storage, tab tracking, or report generation features.

## Commit & Pull Request Guidelines
Write commit subjects in the short, imperative style (“Add inactive time tracking”). Pull requests should link related issues, describe user-facing impacts, and include before/after notes or screenshots for popup/options work. Keep scope focused, and update docs/README when permissions, metrics, or UX flows change.

## Security & Configuration Tips
Persist data in `chrome.storage.local`; avoid new remote calls without explicit opt-in. Protect optional API keys and omit sensitive domain logging. When adding vendors, place assets in `src/vendor/`, document source/version, and review `manifest.json` permissions accordingly.
