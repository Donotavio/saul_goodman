# Repository Guidelines

## Project Structure & Module Organization

- Extension code lives in `src/` and is organized by domain: `background/`, `content/`, `popup/`, `options/`, `report/`, `shared/utils/`, `tests/`.
- Extension assets: icons in `src/img/`; vendored libs in `src/vendor/`.
- Compiled output is written to `dist/` (mirrors `src/`). Never edit `dist/` directly.
- Landing site and blog live in `site/` (`site/blog/` for blog pages). Static assets belong in `site/assets/`.
- Localization lives in `_locales/<dir>/messages.json` (Chrome format). Site/blog consume a copied view under `site/_locales/` and `site/blog/_locales/`.
- Documentation lives in `docs/` (update when UX flows/metrics/copy change).
- Tooling lives in `tools/` (i18n scripts under `tools/i18n/`, blog content engine under `tools/content_engine/`).
- VS Code companion extension lives in `vscode-extension/`. Other auxiliary pieces may exist (e.g., `saul-daemon/`).

## Build, Test, and Development Commands

- `npm install` — install dependencies (Node 18+).
- `npm run build` — compile TypeScript to `dist/`.
- `npm run watch` — incremental rebuild while developing.
- `npm test` — build, then run Node’s native test runner over `dist/tests/**/*.test.js`.
- `npm run clean` — remove `dist/` for a pristine build.
- `npm run i18n:copy-site` — copy `_locales/` into `site/_locales/` and `site/blog/_locales/` for local site/blog dev.
- `npm run content:engine` — generate new blog posts and update blog index (uses `tools/content_engine/`).

## Coding Style & Naming Conventions

- TypeScript ES modules, 2-space indentation, semicolons.
- Exported helpers/functions declare explicit return types.
- Naming: `PascalCase` for types/interfaces, `camelCase` for values/functions, `UPPER_SNAKE_CASE` for constants.
- Keep logic near its domain (e.g., background work in `src/background/`, shared helpers in `src/shared/utils/`).

## Testing Guidelines

- Write deterministic tests in `src/tests/**/*.test.ts` (or `*.spec.ts`), compiled into `dist/tests/`.
- Mock Chrome APIs, timers, and storage; avoid network/time-dependent behavior.
- Run `npm test` before touching scoring, storage, tab tracking, i18n, or report generation.

## Commit & Pull Request Guidelines

- Commits: short, imperative subjects (e.g., “Add inactive time tracking”).
- PRs: link issues, describe user-facing impact, and include screenshots for popup/options/site/blog UI changes.
- Keep scope focused; update `docs/` and/or `README.md` when UX flows, permissions, or metrics change.

## Security & Configuration Tips

- Persist data in `chrome.storage.local`.
- Avoid adding remote calls without explicit opt-in; never log sensitive domains or API keys.
- Vendor third-party libs in `src/vendor/` and document source/version; review `manifest.json` permissions when needed.
