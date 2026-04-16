---
name: release
description: Release workflow - version bump across 4 package files, CHANGELOG update, Chrome Web Store package, VSIX build, pre-release validation. Use when tasks involve versioning, packaging, or publishing.
user-invocable: true
allowed-tools:
  - Bash(npm run package:webstore:*)
  - Bash(npm --prefix vscode-extension run build:vsix:*)
  - Bash(npm test:*)
  - Bash(npm version:*)
  - Bash(git tag:*)
  - Bash(git log:*)
  - Read
  - Edit
  - Grep
paths:
  - package.json
  - manifest.json
  - saul-daemon/package.json
  - vscode-extension/package.json
  - CHANGELOG.md
  - release/**
  - .github/workflows/release.yml
  - .github/workflows/version-bump.yml
---

## Estado atual das versoes

!`node -e "const fs=require('fs'); const r=f=>JSON.parse(fs.readFileSync(f,'utf8')).version; console.log('root:', r('package.json'), '| manifest:', r('manifest.json'), '| daemon:', r('saul-daemon/package.json'), '| vscode:', r('vscode-extension/package.json'))" 2>/dev/null`

## Ultimo CHANGELOG

!`head -25 CHANGELOG.md 2>/dev/null`

# Release Workflow

## Pre-release Checklist

1. Rodar `npm test` — todos os testes devem passar
2. Rodar `npm --prefix vscode-extension test` — testes VS Code
3. Verificar sync de versoes entre os 4 arquivos (usar script abaixo)
4. Atualizar CHANGELOG.md com mudancas da versao
5. Verificar se i18n esta completo: `npm run i18n:check`

## Version Bump

Atualizar versao nos 4 arquivos simultaneamente:
- `package.json` (root)
- `manifest.json`
- `saul-daemon/package.json`
- `vscode-extension/package.json`

Verificar sync: `bash ${CLAUDE_SKILL_DIR}/scripts/check-version-sync.sh`

## Packaging

### Chrome Web Store
```bash
npm run package:webstore
```
Gera ZIP em `release/`

### VS Code Extension (VSIX)
```bash
npm --prefix vscode-extension run build:vsix
```
Gera .vsix em `vscode-extension/`

## Post-release

1. Criar tag git: `git tag v<version>`
2. Push com tags: `git push origin main --tags`
3. GitHub release workflow dispara automaticamente
4. Upload ZIP para Chrome Web Store (manual)
5. Upload VSIX para VS Code Marketplace (manual)

## Rollback

Se necessario reverter:
1. `git revert <commit>` para reverter mudancas
2. Bump versao novamente (nunca reusar numero)
3. Re-publicar com nova versao
