# Repository Guidelines

## Project Structure & Module Organization

- Core source lives in `src/` with domain folders (`background/`, `content/`, `popup/`, `options/`, `report/`, `shared/utils/`, `tests/`). Build output mirrors under `dist/` and should never be hand-edited.
- Icons stay in `src/img/`; landing-page assets sit under `site/assets/`; vendored libraries remain local in `src/vendor/` (e.g., Chart.js, jsPDF). Avoid CDN imports.
- Documentation resides in `docs/` (architecture, indicators, UX/copy). Update it whenever flows, metrics, or tracking change.
- Load locally via Chrome: `chrome://extensions` → Developer Mode → “Carregar sem compactação” → select the repo root (expects a built `dist/`).

## Build, Test, and Development Commands

- `npm install` — install dependencies (Node 18+).
- `npm run build` — clean then compile TypeScript to `dist/` using `tsc`.
- `npm run watch` — incremental rebuilds on file changes for faster iteration.
- `npm test` — rebuild then execute Node’s test runner on `dist/tests/**/*.test.js`.
- `npm run clean` — remove `dist/` when you need a fresh build.

## Coding Style & Naming Conventions

- TypeScript ES modules; 2-space indentation; semicolons; explicit return types on exported functions.
- Naming: PascalCase for interfaces/types, camelCase for functions/variables, UPPER_SNAKE_CASE for constants (e.g., `TRACKING_ALARM`).
- Keep modules focused: background logic belongs in `background/`; UI scripts live with their pages; shared helpers go to `src/shared/utils/`.

## Testing Guidelines

- Author tests as `*.test.ts` in `src/tests/`; compiled JS runs under Node’s native test runner.
- Prefer deterministic cases; mock Chrome APIs, time, and storage; avoid hitting the network.
- Run `npm test` before PRs when changing scoring, storage, tab tracking, or report generation.

## Commit & Pull Request Guidelines

- Commits: short, imperative subjects (e.g., “Add inactive time tracking”).
- PRs: link related issues, describe user-visible impacts, and include before/after notes for popup/options changes; attach screenshots/GIFs for UI tweaks.
- Keep PR scope small; update docs/README when permissions, metrics, or UX flows shift.

## Security & Configuration Tips

- Respect privacy: persist data in `chrome.storage.local`; avoid new remote calls without explicit opt-in.
- Guard optional OpenAI/API keys; avoid logging sensitive domain details.
- When adding vendors, place files in `src/vendor/`, note version/source, and review permissions in `manifest.json`.
