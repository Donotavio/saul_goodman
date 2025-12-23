# Changelog

Todas as versões são publicadas pelo CI/CD; a versão é atualizada automaticamente no build.

## Unreleased

- Integração VS Code: tempo ativo, sessões, trocas de contexto e timeline consolidados nas métricas/relatórios; comandos de status bar para health check e start do SaulDaemon; CTA de instalação do marketplace; prompt para chave de pareamento; versões do daemon e extensão atualizadas para 1.1.2.
- Robustez das métricas VS Code: sincronização forçada no init e ao salvar configurações, limpeza completa ao desativar a integração e validações defensivas para evitar contagens duplicadas (inatividade vs. IDE).
- Foco e produtividade: tempo de IDE somado às métricas produtivas e gráficos; geração de IDs de sessão com `crypto.randomBytes` quando disponível.
- Bloqueio de procrastinação: opção de bloquear domínios via `declarativeNetRequest` e página de bloqueio com i18n.
- Experiência do usuário: opções reestruturadas com melhor acessibilidade; compartilhamento social com suporte multi-plataforma e i18n; lightbox do site refeito sem `innerHTML` inseguro.
- Novidades na extensão: notificação local pós-update com link para o changelog (requer permissão `notifications`) para avisar o usuário das features recém-publicadas e botão “Ver novidades” no popup para disparar/testar o aviso manualmente.
