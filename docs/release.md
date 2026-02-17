# Release e Publicação

Guia operacional para publicar os artefatos da extensão Chrome e da extensão VS Code.

## Estado atual (17/02/2026)

- Versão atual do monorepo: `1.21.29`
- Fontes de versão sincronizadas:
  - `package.json`
  - `manifest.json`
  - `saul-daemon/package.json`
  - `vscode-extension/package.json`

## Pré-checklist antes de publicar

1. Validar testes do produto principal:

```bash
npm test
```

2. Validar testes da extensão VS Code:

```bash
npm --prefix vscode-extension test
```

3. Verificar se `CHANGELOG.md` está atualizado para a versão que será publicada.

## Publicação Chrome Web Store

1. Gerar pacote da loja:

```bash
npm run package:webstore
```

2. Gerar zip para upload:

```bash
cd release
zip -r saul-goodman-<version>-webstore.zip saul-goodman-<version>-webstore
```

Saída esperada:

- Pasta: `release/saul-goodman-<version>-webstore`
- Zip: `release/saul-goodman-<version>-webstore.zip`

## Publicação VS Code Marketplace

1. Gerar VSIX:

```bash
npm --prefix vscode-extension run build:vsix
```

Saída esperada:

- `vscode-extension/saul-goodman-vscode.vsix`

Notas:

- O empacotamento usa `@vscode/vsce` (binário `vsce`).
- O script `prebuild:vsix` já copia daemon e sincroniza i18n/NLS automaticamente.

## Segurança e dependências (rotina)

Para validar alerts abertos no Dependabot:

```bash
gh api -H "Accept: application/vnd.github+json" \
  "/repos/Donotavio/saul_goodman/dependabot/alerts?state=open&per_page=100"
```

Para validar checks do PR de release:

```bash
gh pr checks <numero-do-pr> --watch
```
