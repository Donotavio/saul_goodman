# Política de Privacidade — Saul Goodman Extension

Última atualização: 2025-12-02

## O que coletamos e onde fica

- A extensão roda 100% local no seu navegador. Métricas (tempo em domínios, inatividade, trocas de abas), configurações e preferências ficam apenas em `chrome.storage.local`.
- O histórico de contexto (`sg:context-history`) guarda somente o modo selecionado e os timestamps de início/fim para compor o relatório. Esse array é resetado diariamente e nunca sai do seu navegador.
- Não gravamos conteúdo das páginas, apenas o domínio/hostname para classificação.
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
- `tabGroups`: identificar quando a aba está agrupada para métricas de tempo em grupos.
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

- Suporte: informe seu email ou URL oficial de suporte aqui.
