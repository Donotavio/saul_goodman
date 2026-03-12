---
name: saul-frontend
description: Implement and maintain Saul Goodman's user-facing interfaces across the Chrome extension and static site. Use when tasks involve `src/popup/`, `src/options/`, `src/report/`, `src/block/`, content or background interactions that impact UX, UI-consumed background messages, `site/`, `site/blog/`, or localization and copy updates.
---

# Saul Frontend

## Scope

- Implement and maintain popup, options, report, and block surfaces.
- Maintain site and blog rendering under `site/` and `site/blog/`.
- Keep UI behavior local-first and lightweight.

## Start Here

- Inspect `src/popup/`, `src/options/`, `src/report/`, and `src/block/`.
- Inspect `src/background/` and `src/content/` for message and UX dependencies.
- Inspect `site/` and `site/blog/` for static rendering flows.
- Read `docs/chrome-extension.md`, `docs/architecture.md`, `docs/ux-and-copy.md`, `docs/i18n.md`, and `docs/blog.md`.

## Non-Negotiables

- Do not edit `dist/`.
- Do not introduce remote API dependencies unless explicitly opt-in.
- Preserve Chrome MV3 assumptions and existing message passing patterns.
- Keep popup responsive and low-overhead.
- Keep copy consistent with product tone.
- Update localization keys when visible text changes.
- Preserve accessibility and low-friction UX.

## Workflow

1. Identify impacted surface and source module.
2. Confirm message contract with background or content scripts.
3. Implement UI change and keep storage key usage compatible.
4. Update localized strings and verify extension/site locale sync.
5. Validate popup/report rendering and dependent flows.
6. Update docs and screenshots when UX behavior changes.

## Change Playbooks

### UI Feature Change

- Identify HTML, CSS, and TS modules for the surface.
- Trace background message contracts consumed by UI.
- Validate `chrome.storage.local` reads and writes.
- Validate score, summary, and report presentation impact.
- Update i18n resources for any new visible text.

### Site or Blog Change

- Edit source files under `site/` or `site/blog/`.
- Preserve generated blog index and content engine assumptions.
- Keep copy and localization aligned with extension tone.
- Validate desktop and mobile rendering.

### Messaging or Integration Change

- Keep background-to-UI request and response shapes stable.
- Confirm content script interactions still produce expected UX.
- Avoid expensive rendering paths on popup open.

## Validation Checklist

- Run `npm run build` for extension and UI integration changes.
- Run `npm test` for logic touching scoring, storage, tab tracking, i18n, or report generation.
- Verify extension surfaces manually:
  - popup open responsiveness
  - options save and persistence
  - report summaries and charts
  - block page flow
- Verify site or blog pages affected by the change.
- Verify localized copy across touched locales.

## Output Expectations

When finishing frontend changes, always include:

- impacted surfaces
- storage and message dependencies
- docs or screenshot updates when UX changed
- i18n updates for visible text changes
