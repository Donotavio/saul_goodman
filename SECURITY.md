# Security Policy

Saul Goodman Extension é 100% local (sem backend), mas levamos segurança a sério: reportes devem ser feitos em canal privado para evitarmos exposição de usuários.

## Supported Versions

| Version        | Supported | Notes                                |
| -------------- | --------- | ------------------------------------ |
| 1.x (latest)   | ✅        | Último release publicado na Chrome Web Store. |
| < 1.0          | ❌        | Atualize para a versão mais recente. |

## Reporting a Vulnerability

- **Como reportar:** use o fluxo de Security Advisories do GitHub (Security → Report a vulnerability) ou, se preferir, abra um **Draft Security Advisory** privado neste repositório. Evite issues públicas.
- **O que incluir:** versão instalada, navegador/OS, passos para reproduzir, impacto esperado, POC (se houver) e logs relevantes (sem dados sensíveis).
- **SLA esperado:** responderemos em até 5 dias úteis com triagem inicial; atualizaremos conforme progresso da correção ou mitigação.
- **Escopo:** extensão (código em `src/` e build em `dist/`), site estático em `site/`. Não há serviços remotos ou APIs próprias; a chave de IA é opcional e armazenada localmente.
- **Divulgação:** por favor, aguarde correção e publicação antes de divulgação pública. Crédits serão dados se desejado.

## Hardening e privacidade

- Dados ficam em `chrome.storage.local`; não coletamos nem enviamos dados para servidores.
- Revise permissões do `manifest.json` ao avaliar achados (evitamos adicionar novas permissões sem justificativa).
- Quando relatar problemas de privacidade, descreva quais dados podem vazar, para quem e em quais condições.
