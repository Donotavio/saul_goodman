<!--lang:pt-->
# Política de Privacidade — Saul Goodman Extension

Última atualização: 2025-12-02

## O que coletamos e onde fica

- A extensão roda 100% local no navegador. Métricas e configurações ficam em `chrome.storage.local`.
- Não armazenamos conteúdo de páginas — apenas domínio/hostname para classificação.
- O histórico de contexto (`sg:context-history`), override manual e cache de feriados também ficam locais.
- O modelo de sugestões automáticas é salvo no IndexedDB (`sg-ml-models`).
- Pings de atividade (mouse/teclado/scroll) não carregam conteúdo, apenas timestamp.

### Classificação automática (opcional)

Quando habilitada, coletamos apenas metadados e sinais leves da página atual:

- `title`, `description`, `keywords`, headings (`h1–h3`)
- `og:type`, `schema.org` (`itemtype`), tokens de path
- Flags de layout (vídeo, scroll infinito, autoplay, feed, formulário, editor rico, tabela grande, shorts)
- Contadores de interação, profundidade de scroll e links externos

Nada disso é enviado para a rede.

## Rede

- **Por padrão, nenhum dado sai do navegador**.
- **OpenAI (opcional)**: se você informar uma chave, o relatório envia um resumo diário agregado para gerar a narrativa.
- **Nager.Date (opcional)**: se habilitado, busca feriados nacionais com cache local.
- **Saul Daemon (opcional)**: integra VS Code via `localhost`.

## Compartilhamento e anúncios

- Não vendemos nem compartilhamos dados.
- Não usamos dados para publicidade.

## Permissões

- `tabs` / `activeTab`: ler URL ativa para classificar domínios.
- `storage`: salvar métricas e configurações localmente.
- `alarms`: agendar contagem de tempo e reset diário.
- `idle`: detectar inatividade real.
- `windows`: detectar quando o navegador perde foco.
- `webNavigation`: detectar navegações SPA.
- `sessions`: contar itens fechados/reabertos.
- `declarativeNetRequest`: bloqueio local de domínios procrastinatórios.
- `notifications`: avisos de release notes.

Hosts opcionais (opt‑in):

- `https://date.nager.at/*`
- `https://api.openai.com/*`
- `http://127.0.0.1/*` e `http://localhost/*`

## Retenção e controle

- Os dados ficam apenas no seu perfil do Chrome.
- Você pode remover tudo limpando o storage ou desinstalando a extensão.
- Cache de feriados expira após 7 dias.

## Segurança

- Manifest V3, sem scripts remotos.

## Contato

- Suporte: ribeitemp@gmail.com

<!--lang:en-->
# Privacy Policy — Saul Goodman Extension

Last update: 2025-12-02

## What we collect and where it lives

- The extension runs 100% locally. Metrics and settings live in `chrome.storage.local`.
- We never store page content — only domain/hostname for classification.
- Context history (`sg:context-history`), manual override and holiday cache stay local.
- The auto‑classification model is stored in IndexedDB (`sg-ml-models`).
- Activity pings carry only timestamps (no content).

### Auto classification (optional)

When enabled, we read only lightweight page metadata:

- `title`, `description`, `keywords`, headings (`h1–h3`)
- `og:type`, `schema.org` (`itemtype`), path tokens
- Layout flags (video, infinite scroll, autoplay, feed, form, rich editor, large table, shorts)
- Interaction counts, scroll depth and external link counts

Nothing is sent over the network.

## Network

- **By default, no data leaves the browser**.
- **OpenAI (optional)**: if you provide a key, the report sends aggregated daily data to generate the narrative.
- **Nager.Date (optional)**: holiday lookup with local caching.
- **Saul Daemon (optional)**: VS Code integration via `localhost`.

## Sharing and ads

- We do not sell or share data.
- No advertising use.

## Permissions

- `tabs` / `activeTab`: read active URL to classify domains.
- `storage`: store metrics and settings locally.
- `alarms`: periodic tracking and daily reset.
- `idle`: detect inactivity.
- `windows`: detect browser focus loss.
- `webNavigation`: SPA navigation tracking.
- `sessions`: recently closed items count.
- `declarativeNetRequest`: local blocking of procrastination domains.
- `notifications`: release notes notifications.

Optional host permissions:

- `https://date.nager.at/*`
- `https://api.openai.com/*`
- `http://127.0.0.1/*` and `http://localhost/*`

## Retention and control

- Data stays in your Chrome profile.
- You can remove everything by clearing storage or uninstalling.
- Holiday cache expires after 7 days.

## Security

- Manifest V3, no remote scripts.

## Contact

- Support: ribeitemp@gmail.com

<!--lang:es-->
# Política de Privacidad — Saul Goodman Extension

Última actualización: 2025-12-02

## Qué recopilamos y dónde queda

- La extensión funciona 100% localmente. Métricas y configuraciones viven en `chrome.storage.local`.
- No almacenamos contenido de páginas — solo el dominio/hostname.
- El historial de contexto, override manual y cache de feriados permanecen locales.
- El modelo de sugerencias se guarda en IndexedDB (`sg-ml-models`).
- Los pings de actividad solo llevan timestamps.

### Clasificación automática (opcional)

Cuando está habilitada, leemos solo metadatos ligeros:

- `title`, `description`, `keywords`, headings (`h1–h3`)
- `og:type`, `schema.org` (`itemtype`), tokens de path
- Flags de layout (video, scroll infinito, autoplay, feed, formulario, editor rico, tabla grande, shorts)
- Conteos de interacción, profundidad de scroll y links externos

Nada se envía a la red.

## Red

- **Por defecto, ningún dato sale del navegador**.
- **OpenAI (opcional)**: si proporcionas una clave, el informe envía datos agregados para generar la narrativa.
- **Nager.Date (opcional)**: consulta de feriados con cache local.
- **Saul Daemon (opcional)**: integración con VS Code en `localhost`.

## Compartición y anuncios

- No vendemos ni compartimos datos.
- Sin uso publicitario.

## Permisos

- `tabs` / `activeTab`: leer URL activa para clasificar dominios.
- `storage`: guardar métricas y configuraciones.
- `alarms`: conteo periódico y reset diario.
- `idle`: detectar inactividad.
- `windows`: detectar foco del navegador.
- `webNavigation`: detectar navegaciones SPA.
- `sessions`: contar ítems cerrados.
- `declarativeNetRequest`: bloqueo local de dominios procrastinadores.
- `notifications`: avisos de release notes.

Hosts opcionales:

- `https://date.nager.at/*`
- `https://api.openai.com/*`
- `http://127.0.0.1/*` y `http://localhost/*`

## Retención y control

- Los datos quedan en tu perfil de Chrome.
- Puedes eliminarlos limpiando el storage o desinstalando la extensión.
- El cache de feriados expira después de 7 días.

## Seguridad

- Manifest V3, sin scripts remotos.

## Contacto

- Soporte: ribeitemp@gmail.com
