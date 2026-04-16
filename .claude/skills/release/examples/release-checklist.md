# Release Checklist Example — v1.22.4

## Pre-release
- [x] `npm test` — 44/44 passed
- [x] `npm --prefix vscode-extension test` — all passed
- [x] Version sync check — all 4 files at 1.22.4
- [x] CHANGELOG.md updated
- [x] `npm run i18n:check` — 0 missing keys

## Packaging
- [x] `npm run package:webstore` — saul-goodman-1.22.4-webstore.zip created
- [x] `npm --prefix vscode-extension run build:vsix` — saul-goodman-vscode-1.22.4.vsix created

## Post-release
- [x] `git tag v1.22.4`
- [x] `git push origin main --tags`
- [ ] Upload to Chrome Web Store
- [ ] Upload to VS Code Marketplace
