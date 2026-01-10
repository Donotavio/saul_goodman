# i18n do site e blog

## Visão geral
- Fonte única: `_locales/<locale>/messages.json` (formato de extensão Chrome) alimenta site e blog. A função `createBrowserI18n` converte `{ "key": { "message": "..." } }` em dicionário simples e faz cache por idioma.
- Idioma padrão/fallback: `pt-BR`. Chave ausente em outro idioma cai para `pt-BR`; se não existir, renderiza `__MISSING__:<key>` e gera warning em modo dev.
- `t(key, params?)` aceita placeholders (`{name}`) e já aplica fallback.
- RTL: `ar` e `ur` mudam `dir="rtl"` em `<html>`/`<body>`.
- SEO: `canonical` e `hreflang` são atualizados para cada idioma disponível; URLs seguem o padrão `/<lang>/...`. Stubs estáticos gravam cookie `saul_lang` e redirecionam para o caminho real, preservando a escolha do idioma.
- Locale chinês: usamos `zh-CN` (ZH simplificado) para maximizar cobertura e evitar colisão com variantes tradicionais.

## Idiomas ativos
`pt-BR`, `en-US`, `es-419`, `fr`, `zh-CN`, `hi`, `ar`, `bn`, `ru`, `ur` (mais `de`, `it`, `tr` herdados da extensão).

## Como atualizar traduções
1) Edite `_locales/<locale>/messages.json` (ou adicione o diretório, seguindo o padrão Chrome).  
2) Rode o merge automático de fallback `pt-BR` para todos os idiomas:
   ```bash
   npm run i18n:sync
   ```
   Isso preserva chaves existentes por idioma e preenche chaves faltantes com `pt-BR`.
3) Gere/atualize os stubs de rota `/<lang>/...` (gravam cookie e redirecionam):
   ```bash
   npm run i18n:stubs
   ```

## Checar chaves faltantes
```bash
npm run i18n:check
```
Relatório comparando todos os idiomas com o `pt-BR`.

## Testes
- Cobertura unitária para parser/fallback/interpolação/RTL em `src/tests/i18n.test.ts`.
- `npm test` recompila TypeScript e executa todos os testes.

## Integração em novas páginas
- Importe do browser: `import { createBrowserI18n, normalizeLocale } from '../dist/i18n/browser.js';`
- Crie o cliente com `defaultLocale` `pt-BR` e a lista de `supportedLocales`, chame `setLocale(locale)` e use `translator.t(key, params)`.
- Para dropdowns, há um helper opcional em `src/components/LanguageSwitcher/`.
