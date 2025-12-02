# Política de Privacidade — Saul Goodman Extension

Última atualização: 2024-xx-xx

## O que coletamos e onde fica

- A extensão roda 100% local no seu navegador. Métricas (tempo em domínios, inatividade, trocas de abas), configurações e preferências ficam apenas em `chrome.storage.local`.
- Não gravamos conteúdo das páginas, apenas o domínio/hostname para classificação.
- Não armazenamos ou enviamos teclas pressionadas; eventos de teclado/mouse/scroll são usados apenas como “sinal de atividade” (ping de presença), sem conteúdo.

## Rede

- Por padrão **nenhum dado sai do seu navegador**.
- Caso você informe uma chave da OpenAI nas opções, o relatório detalhado envia um resumo diário (índice, métricas agregadas, top domínios e trechos da timeline) para a API da OpenAI apenas para gerar a narrativa. Nada além disso é transmitido.

## Compartilhamento e anúncios

- Não vendemos, trocamos ou compartilhamos dados com terceiros.
- Não usamos dados para publicidade.

## Permissões

- `tabs`/`activeTab`: ler a URL ativa para classificar o domínio.
- `storage`: salvar métricas e configurações localmente.
- `alarms`: agendar contagem de tempo e reset diário.
- `<all_urls>`: permitir classificação de qualquer domínio aberto.
- Todos os scripts são locais (Manifest V3), sem código remoto.

## Retenção e controle

- Os dados ficam apenas no `chrome.storage.local` do seu perfil. Você pode removê-los limpando o storage, desinstalando a extensão ou usando as ferramentas do navegador.
- Não há backup ou sincronização para servidores externos.

## Segurança

- Manifest V3 com service worker em ES modules.
- Sem coleta de conteúdo sensível; sem execução de scripts remotos.

## Contato

- Suporte: adicione seu email/site de suporte aqui.
