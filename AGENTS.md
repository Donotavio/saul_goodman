# Repository Guidelines

## Project Structure & Module Organization
- Source lives in `src/` (background, content, popup, options, report, shared utils, tests). TypeScript compiles to `dist/` with the same folder layout.
- Static assets: `src/img/` for icons, `site/assets/` for landing page media, and vendored libs in `src/vendor/` (Chart.js, jsPDF). Avoid adding CDN links.
- Docs sit in `docs/` (architecture, indicators, UX/copy). Keep them updated when behavior or tracking changes.
- The published extension is loaded from the repo root after building; `dist/` should be cleanly generated and not hand-edited.

## Build, Test, and Development Commands
- `npm install` — install dependencies (Node 18+).
- `npm run build` — compile TypeScript to `dist/` via `tsc`.
- `npm run watch` — rebuild on file changes for faster iteration.
- `npm test` — build then run Node’s test runner on `dist/tests/**/*.test.js`.
- Load locally: `chrome://extensions` → Developer Mode → “Carregar sem compactação” → select repo root (expects `dist/` present).

## Coding Style & Naming Conventions
- TypeScript ES modules, 2-space indentation, semicolons, and explicit return types on exported functions. Prefer pure helpers under `src/shared/utils/`.
- Names: PascalCase for types/interfaces, camelCase for variables/functions, UPPER_SNAKE_CASE for constants (`TRACKING_ALARM`). Keep Portuguese microcopy consistent with existing tone.
- Keep modules focused (background logic in `background/`, UI scripts in their page folder). Update `manifest.json` only when permissions or entry points change.
- Run `npm run build` before committing to ensure emitted JS matches TS.

## Testing Guidelines
- Tests reside in `src/tests/` as `*.test.ts`; compiled artifacts run under Node’s native test runner. Use deterministic inputs; avoid Chrome APIs in unit tests—mock storage/time/domain helpers instead.
- Add targeted tests when changing scoring, storage, or tab-tracking logic. Run `npm test` before opening a PR.

## Commit & Pull Request Guidelines
- Follow the existing style seen in `git log`: short, imperative subjects that describe the change (e.g., “Add inactive time tracking to metrics”).
- Reference related issues in the description, outline user-visible impacts, and include before/after notes for popup/options changes. Attach screenshots/GIFs for UI tweaks.
- Update docs or README sections when permissions, metrics, or UX flows change. Keep PRs scoped; prefer smaller, reviewable diffs.

## Security & Configuration Tips
- Respect privacy: data stays in `chrome.storage.local`; do not introduce remote calls without opt-in. Guard optional OpenAI key handling and avoid logging sensitive domain data.
- When adding vendors, keep files local in `src/vendor/` and document version/source. Review new permissions carefully and justify them in the PR description.
