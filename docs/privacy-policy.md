<!--lang:pt-->
# Política de Privacidade — Saul Goodman Extension

Última atualização: 2025-12-02

## O que coletamos e onde fica

- A extensão roda 100% local no seu navegador. Métricas (tempo em domínios, inatividade, trocas de abas), configurações e preferências ficam apenas em `chrome.storage.local`.
- O histórico de contexto (`sg:context-history`) guarda somente o modo selecionado e os timestamps de início/fim para compor o relatório. Esse array é resetado diariamente e nunca sai do seu navegador.
- Não gravamos conteúdo das páginas, apenas o domínio/hostname para classificação.
- Se você ativar a Classificação Automática, coletamos apenas metadados leves da página atual (título, meta description/keywords, `og:type`), sinais estruturais simples (player de vídeo, autoplay, feed/shorts, formulário, editor rico, tabela grande, scroll infinito) e esquema (`itemtype`) para sugerir uma categoria localmente. Nada disso é enviado para a rede. Quando você aceita/recusa uma sugestão ou adiciona domínios manualmente, gravamos apenas contadores locais desses sinais (domínio, host base, palavras, flags de vídeo/scroll/feed/form/editor etc.) em `chrome.storage.local` para personalizar futuras recomendações.
- Não armazenamos ou enviamos teclas pressionadas; eventos de teclado/mouse/scroll são usados apenas como “sinal de atividade” (ping de presença), sem conteúdo.

## Rede

- Por padrão **nenhum dado sai do seu navegador**.
- Caso você informe uma chave da OpenAI nas opções, o relatório detalhado envia um resumo diário (índice, métricas agregadas, top domínios e trechos da timeline) para a API da OpenAI apenas para gerar a narrativa. Nada além disso é transmitido.
- Se você ativar a detecção automática de feriados e informar manualmente o código ISO-3166 do país, o background faz chamadas GET para o endpoint público [Nager.Date](https://date.nager.at) (`/api/v3/PublicHolidays/{ano}/{país}`) somente para baixar a lista anual de feriados nacionais. Nenhum dado pessoal é enviado; tudo é opcional e o resultado fica armazenado em `chrome.storage.local` por até 7 dias.
- Nenhuma requisição envia conteúdo das páginas que você visita ou dados pessoais; apenas os agregados descritos acima são usados.

## Compartilhamento e anúncios

- Não vendemos, trocamos ou compartilhamos dados com terceiros.
- Não usamos dados para publicidade.

## Permissões

- `tabs` / `activeTab`: ler a URL ativa para classificar o domínio.
- `storage`: salvar métricas e configurações localmente.
- `alarms`: agendar contagem de tempo e reset diário.
- `idle`: usar a API nativa de inatividade do Chrome para não contar tempo ocioso como produtivo.
- `windows`: detectar quando o navegador perde foco para medir tempo em segundo plano.
- `webNavigation`: detectar trocas de rota em SPA (YouTube, LinkedIn, Slack web) e contar navegações internas.
- `sessions`: contar itens fechados/reabertos recentemente (aba ou janela) como KPI no relatório.
- `https://date.nager.at/*`: consultar a lista pública de feriados somente quando você ativar a opção.
- `https://api.openai.com/*`: gerar narrativa apenas se você informar a sua chave.
- `http://127.0.0.1/*` e `http://localhost/*`: conversar com o SaulDaemon local quando a integração com VS Code estiver habilitada.
- Todos os scripts são locais (Manifest V3), sem código remoto.

## Retenção e controle

- Os dados ficam apenas no `chrome.storage.local` do seu perfil. Você pode removê-los limpando o storage, desinstalando a extensão ou usando as ferramentas do navegador.
- Estados temporários (override manual e contexto) são sobrescritos diariamente; o cache de feriados expira automaticamente após 7 dias.
- Não há backup ou sincronização para servidores externos.

## Segurança

- Manifest V3 com service worker em ES modules.
- Sem coleta de conteúdo sensível; sem execução de scripts remotos.

## Contato

- Suporte: ribeitemp@gmail.com
<!--lang:en-->
# Privacy Policy — Saul Goodman Extension

Last update: 2025-12-02

## What we collect and where it lives

- The extension runs 100% locally in your browser. Metrics (time per domain, idle time, tab switches), settings, and preferences stay in `chrome.storage.local`.
- The context history (`sg:context-history`) keeps only the selected mode plus start/end timestamps to compose the report. It resets every day and never leaves your browser.
- We never store page content — only the domain/hostname used for classification.
- If you enable Auto Classification, we read only lightweight page metadata (title, meta description/keywords, `og:type`), simple structural hints (video player, autoplay, feed/shorts, form, rich editor, large table, infinite scroll), and schema (`itemtype`) to suggest a category locally. None of this metadata is sent over the network. When you accept/decline a suggestion or manually add domains, we store local counters for those signals (domain, base host, words, video/scroll/feed/form/editor flags, etc.) in `chrome.storage.local` to personalize future recommendations.
- We do not log or transmit keystrokes. Keyboard, mouse, and scroll events are used solely as “activity pings” without payload.

## Network

- By default **no data leaves your browser**.
- If you enter an OpenAI API key in the options, the detailed report sends a daily summary (index, aggregated metrics, top domains, snippets of the timeline) to the OpenAI API purely to generate the narrative. Nothing else is transmitted.
- When you enable automatic holiday detection and manually provide the ISO-3166 country code, the background script issues GET calls to the public [Nager.Date](https://date.nager.at) endpoint (`/api/v3/PublicHolidays/{year}/{country}`) just to download the yearly list of national holidays. No personal data is sent; the feature is optional and the results stay cached in `chrome.storage.local` for up to 7 days.
- We never send page content or personally identifiable data — only the aggregates described above.

## Sharing and ads

- We do not sell, trade, or share any data with third parties.
- We do not use the collected data for advertising.

## Permissions

- `tabs` / `activeTab`: read the active URL to classify the domain.
- `storage`: persist metrics and settings locally.
- `alarms`: schedule time counting and the daily reset.
- `idle`: rely on Chrome’s native idle API to avoid counting inactive time as productive.
- `windows`: detect when the browser loses focus to measure background time.
- `webNavigation`: observe SPA route changes (YouTube, LinkedIn, Slack web) and count internal navigations.
- `sessions`: track recently closed/reopened tabs or windows as a KPI in the report.
- `https://date.nager.at/*`: request the public holiday list only when you enable the option.
- `https://api.openai.com/*`: generate the narrative only if you provide your API key.
- `http://127.0.0.1/*` and `http://localhost/*`: communicate with the local SaulDaemon when the VS Code integration is enabled.
- All scripts are local (Manifest V3); no remote code is executed.

## Retention and control

- Data lives solely in your profile’s `chrome.storage.local`. Remove it by clearing the storage, uninstalling the extension, or using your browser’s tools.
- Temporary states (manual override and context) reset daily. The holiday cache expires after 7 days.
- There is no backup or syncing to external servers.

## Security

- Manifest V3 with an ES module service worker.
- No sensitive content collection and no remote script execution.

## Contact

- Support: ribeitemp@gmail.com
<!--lang:es-->
# Política de Privacidad — Saul Goodman Extension

Última actualización: 2025-12-02

## Qué recopilamos y dónde se guarda

- La extensión funciona 100% local en tu navegador. Las métricas (tiempo por dominio, inactividad, cambios de pestaña), configuraciones y preferencias viven únicamente en `chrome.storage.local`.
- El historial de contexto (`sg:context-history`) almacena solo el modo elegido y las marcas de tiempo de inicio/fin para generar el informe. Se restablece diariamente y nunca sale de tu navegador.
- No almacenamos el contenido de las páginas; solo el dominio/hostname usado para la clasificación.
- Si activas la Clasificación Automática, solo leemos metadatos ligeros de la página (título, meta description/keywords, `og:type`), pistas estructurales simples (reproductor de video, autoplay, feed/shorts, formulario, editor enriquecido, tabla grande, scroll infinito) y schema (`itemtype`) para sugerir una categoría de forma local. Nada de esto se envía por la red. Cuando aceptas/rechazas una sugerencia o agregas dominios manualmente, guardamos contadores locales de esas señales (dominio, host base, palabras, flags de video/scroll/feed/form/editor, etc.) en `chrome.storage.local` para personalizar recomendaciones futuras.
- No registramos ni enviamos pulsaciones de teclado. Los eventos de teclado, mouse o scroll sirven únicamente como “ping” de actividad sin contenido.

## Red

- Por defecto **ningún dato sale de tu navegador**.
- Si proporcionas una clave de OpenAI en las opciones, el informe detallado envía un resumen diario (índice, métricas agregadas, dominios destacados y partes de la línea de tiempo) a la API de OpenAI únicamente para generar la narrativa. Nada más se transmite.
- Si activas la detección automática de feriados e informas el código ISO-3166 del país, el service worker realiza solicitudes GET al endpoint público [Nager.Date](https://date.nager.at) (`/api/v3/PublicHolidays/{año}/{país}`) solo para descargar la lista anual de feriados nacionales. No se envían datos personales; es opcional y el resultado se almacena en `chrome.storage.local` por hasta 7 días.
- Ninguna solicitud envía contenido de las páginas que visitas ni datos personales; solo usamos los agregados descritos arriba.

## Compartir y anuncios

- No vendemos, intercambiamos ni compartimos datos con terceros.
- No utilizamos la información para fines publicitarios.

## Permisos

- `tabs` / `activeTab`: leer la URL activa para clasificar el dominio.
- `storage`: guardar métricas y configuraciones de forma local.
- `alarms`: programar el conteo de tiempo y el reinicio diario.
- `idle`: usar la API nativa de inactividad de Chrome para no contar tiempo ocioso como productivo.
- `windows`: detectar cuando el navegador pierde foco para medir tiempo en segundo plano.
- `webNavigation`: detectar cambios de ruta en SPA (YouTube, LinkedIn, Slack web) y contar navegaciones internas.
- `sessions`: contar pestañas o ventanas cerradas/reabiertas recientemente como KPI en el informe.
- `https://date.nager.at/*`: consultar la lista pública de feriados solo cuando habilites la opción.
- `https://api.openai.com/*`: generar la narrativa únicamente si proporcionas tu clave.
- `http://127.0.0.1/*` y `http://localhost/*`: comunicarse con el SaulDaemon local cuando la integración con VS Code está habilitada.
- Todos los scripts son locales (Manifest V3), sin código remoto.

## Retención y control

- Los datos permanecen en el `chrome.storage.local` de tu perfil. Puedes eliminarlos limpiando el storage, desinstalando la extensión o usando las herramientas del navegador.
- Los estados temporales (override manual y contexto) se sobrescriben a diario; el caché de feriados expira automáticamente después de 7 días.
- No existe copia de seguridad ni sincronización con servidores externos.

## Seguridad

- Manifest V3 con service worker en ES modules.
- Sin recopilación de contenido sensible; sin ejecución de scripts remotos.

## Contacto

- Soporte: ribeitemp@gmail.com
