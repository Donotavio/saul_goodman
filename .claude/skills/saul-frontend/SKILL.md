---
name: saul-frontend
description: Implement and maintain Saul Goodman's user-facing interfaces across the Chrome extension, VS Code extension (reports, combo toast), and static site. Use when tasks involve src/popup/, src/options/, src/report/, src/block/, vscode-extension/src/reports/, vscode-extension/src/ui/, content or background interactions that impact UX, UI-consumed background messages, site/, site/blog/, or localization and copy updates.
user-invocable: true
allowed-tools:
  - Bash(npm run build:*)
  - Bash(npm run i18n:*)
  - Bash(npm test:*)
  - Bash(npm --prefix vscode-extension:*)
  - Read
  - Edit
  - Write
  - Grep
  - Glob
  - mcp__chrome-devtools__take_snapshot
  - mcp__chrome-devtools__take_screenshot
  - mcp__chrome-devtools__navigate_page
  - mcp__chrome-devtools__evaluate_script
  - mcp__chrome-devtools__list_pages
  - mcp__chrome-devtools__select_page
  - mcp__chrome-devtools__lighthouse_audit
paths:
  - src/popup/**
  - src/options/**
  - src/report/**
  - src/block/**
  - src/content/**
  - src/shared/**
  - site/**
  - _locales/**
  - manifest.json
  - vscode-extension/src/reports/**
  - vscode-extension/src/ui/**
  - vscode-extension/src/reports/vendor/**
  - .claude/rules/branding.md
  - docs/chrome-extension.md
  - docs/vscode-extension.md
  - docs/ux-and-copy.md
  - docs/i18n.md
  - docs/blog.md
---

## Estado atual

Locales disponiveis:
!`ls _locales/ 2>/dev/null`

Manifest:
!`node -e "const m=JSON.parse(require('fs').readFileSync('manifest.json','utf8')); console.log('v'+m.version, '| permissions:', m.permissions.join(', '))" 2>/dev/null`

# Saul Frontend

## Scope

- Implement and maintain popup, options, report, and block surfaces (Chrome extension).
- Maintain VS Code report webview (`vscode-extension/src/reports/`) and combo toast (`vscode-extension/src/ui/`).
- Maintain site and blog rendering under `site/` and `site/blog/`.
- Keep UI behavior local-first and lightweight.
- Ensure branding consistency across all 8 frontend surfaces.

## Branding & Design System

Rules are defined in `.claude/rules/branding.md`. Key non-negotiables:

- **Hard-edge shadows only** on Chrome extension surfaces (no blur).
- **Minimum font size**: 0.9rem for accessibility.
- **All visible text** must use i18n keys — never hardcode strings.
- **VS Code surfaces** must use `--saul-*` CSS custom properties.
- **Persona**: Saul Goodman as defense attorney — sarcastic, persuasive, moderate irony.
- **Color tokens**: Use the canonical palette from branding.md. Do not introduce new brand colors without updating the design system.
- **Borders**: 2-3px solid `#111` standard, 2px dashed for secondary containers.
- **Component patterns**: Cards, buttons, KPIs, inputs follow the documented spec.

## Start Here

### Chrome Extension
- Inspect `src/popup/`, `src/options/`, `src/report/`, and `src/block/`.
- Inspect `src/background/` and `src/content/` for message and UX dependencies.
- Inspect `src/shared/` for utilities consumed by UI.

### VS Code Extension
- Inspect `vscode-extension/src/reports/` for report webview (HTML, CSS, JS).
- Inspect `vscode-extension/src/ui/combo-toast.*` for toast overlay.
- Note: `vscode-extension/src/reports/report.css` is the canonical `--saul-*` variable file.
- i18n in VS Code webviews uses `window.__SAUL_I18N__` (not Chrome i18n format).

### Site & Blog
- Inspect `site/` and `site/blog/` for static rendering flows.
- `site/style.css` has CSS variables (`--yellow`, `--gold`, etc.) — different names from VS Code.

### Docs
- Read `docs/chrome-extension.md`, `docs/vscode-extension.md`, `docs/architecture.md`, `docs/ux-and-copy.md`, `docs/i18n.md`, and `docs/blog.md`.
- Read `.claude/rules/branding.md` for design tokens and visual patterns.

## Non-Negotiables

- Do not edit `dist/`.
- Do not introduce remote API dependencies unless explicitly opt-in.
- Preserve Chrome MV3 assumptions and existing message passing patterns.
- Keep popup responsive and low-overhead (360px wide target).
- Keep copy consistent with Saul Goodman persona and product tone.
- Update localization keys when visible text changes (14 locales).
- Preserve accessibility: min 0.9rem, aria labels, data-tooltip, focus states.
- New CSS on VS Code surfaces must use `--saul-*` custom properties.
- Combo toast must respect `prefers-reduced-motion` and `prefers-contrast: high`.
- Never mix font stacks within the same surface.
- Follow component patterns documented in `.claude/rules/branding.md`.

## Workflow

1. Identify impacted surface and source module.
2. Confirm message contract with background or content scripts.
3. Check `.claude/rules/branding.md` for applicable design tokens and patterns.
4. Implement UI change and keep storage key usage compatible.
5. Update localized strings and verify extension/site locale sync.
6. Validate rendering on target surface.
7. Update docs and screenshots when UX behavior changes.

## Change Playbooks

### UI Feature Change (Chrome)

- Identify HTML, CSS, and TS modules for the surface.
- Trace background message contracts consumed by UI.
- Validate `chrome.storage.local` reads and writes.
- Validate score, summary, and report presentation impact.
- Apply branding tokens from `.claude/rules/branding.md` for any new visual elements.
- Update i18n resources for any new visible text.

### VS Code Webview Change

- Identify HTML/CSS/JS in `vscode-extension/src/reports/` or `vscode-extension/src/ui/`.
- Respect VS Code webview CSP constraints (no inline scripts, limited external resources).
- Use `--saul-*` CSS custom properties — define new ones in `:root` if needed.
- i18n via `window.__SAUL_I18N__` object (injected by extension host).
- Test in VS Code webview panel and standalone browser.
- For combo toast: test all combo tiers (2x through ultra) and `prefers-reduced-motion`.

### Site or Blog Change

- Edit source files under `site/` or `site/blog/`.
- Preserve generated blog index and content engine assumptions.
- Keep copy and localization aligned with extension tone.
- Use `site/style.css` CSS variables (`--yellow`, `--gold`, etc.).
- Validate desktop and mobile rendering.

### Messaging or Integration Change

- Keep background-to-UI request and response shapes stable.
- Confirm content script interactions still produce expected UX.
- Avoid expensive rendering paths on popup open.

### Audit Playbook

When auditing a surface for branding/UX compliance:

1. **Branding check**: Compare colors, typography, shadows, borders against `.claude/rules/branding.md`.
2. **Accessibility check**: Font size >= 0.9rem, contrast ratios, aria-label, prefers-reduced-motion, RTL (ar/ur).
3. **Design debt check**: Hardcoded hex values, duplicated CSS patterns, inline styles, missing CSS variables.
4. **UX check**: Responsiveness, loading/empty states, error visibility, i18n coverage.
5. **Report**: Use `[PASS|WARN|FAIL] description — file:line` format.

## Validation Checklist

- Run `npm run build` for extension and UI integration changes.
- Run `npm test` for logic touching scoring, storage, tab tracking, i18n, or report generation.
- Run `npm --prefix vscode-extension run build:vsix` for VS Code changes.
- Verify extension surfaces manually:
  - popup open responsiveness (360px)
  - options save and persistence
  - report summaries and charts
  - block page flow (dark mode)
- Verify VS Code surfaces:
  - report webview rendering (dark theme)
  - combo toast tiers and animations
- Verify site or blog pages affected by the change.
- Verify localized copy across touched locales.

## Output Expectations

When finishing frontend changes, always include:

- impacted surfaces (Chrome, VS Code, site/blog)
- storage and message dependencies
- branding compliance notes (tokens used, patterns followed)
- docs or screenshot updates when UX changed
- i18n updates for visible text changes
