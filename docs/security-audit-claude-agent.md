# Auditoria de Seguranca: Hooks e Workflow Claude Agent

Data: 2026-04-18

## 1. Hook Anti-Delete (`settings.local.json`)

### Funcionamento
O hook intercepta comandos Bash contendo `rm` e bloqueia se o target esta fora do diretorio do projeto.

### Riscos identificados

| # | Risco | Severidade | Status |
|---|-------|-----------|--------|
| 1 | Bypass por path relativo (`rm -rf ../outro`) — regex so detecta paths absolutos | Media | Aberto |
| 2 | Bypass por aliases (`unlink`, `shred`, `find -delete`, `trash`) | Baixa | Aberto |
| 3 | Bypass por variavel de shell (`rm $VAR`) | Baixa | Aberto |
| 4 | Path do projeto hardcoded — so funciona na maquina local | Info | Esperado (arquivo local) |
| 5 | Sem protecao para arquivos criticos dentro do projeto (`.git/`, `CLAUDE.md`) | Baixa | Aberto |

### Recomendacoes
- Adicionar deteccao de paths relativos (`..`) alem de absolutos.
- Considerar blocklist de variantes destrutivas (`unlink`, `find.*-delete`).
- Para ambiente CI, usar `$PWD` ou `$GITHUB_WORKSPACE` em vez de path hardcoded.

## 2. Hook de Auditoria de Downloads (`settings.local.json`)

### Funcionamento
Hook tipo `prompt` que usa LLM para avaliar seguranca de downloads. Ativado por pattern matching no comando.

### Riscos identificados

| # | Risco | Severidade | Status |
|---|-------|-----------|--------|
| 1 | Bypass por wrapping (`bash -c "curl ..."`, `sh -c "wget ..."`) | Media | Aberto |
| 2 | Decisao por LLM e nao-deterministica — mesma entrada pode gerar allow/deny | Media | Aceito (design) |
| 3 | Falta cobertura para `npm ci`, `yarn`, `pnpm`, `bun install` | Baixa | Aberto |
| 4 | Timeout de 15s pode expirar e default pode ser permissivo | Baixa | Aberto |

### Recomendacoes
- Expandir o filtro `if` para incluir `bash -c`, `sh -c`, e gerenciadores alternativos.
- Adicionar fallback deterministico para timeout (deny by default).

## 3. Workflow Claude Agent (`claude-agent.yml`)

### Funcionamento
Workflow GitHub Actions que aciona o Claude Code Agent em issues/comentarios.

### Riscos identificados e correcoes aplicadas

| # | Risco | Severidade | Status |
|---|-------|-----------|--------|
| 1 | Issues abertas por qualquer usuario acionavam o agente | Alta | **CORRIGIDO** — filtro `repository_owner` adicionado |
| 2 | Comentario `/claude` por qualquer usuario acionava agente | Alta | **CORRIGIDO** — filtro `repository_owner` adicionado |
| 3 | `github.event.comment.body` vazio em trigger de issue | Media | **CORRIGIDO** — fallback para `issue.body` |
| 4 | Deny rules bypassaveis com variacoes de comando | Media | **CORRIGIDO** — patterns expandidos |
| 5 | `ATLASSIAN_TOKEN` exposto desnecessariamente | Baixa | **CORRIGIDO** — env var removida |
| 6 | `--force-with-lease` nao coberto nas deny rules | Media | **CORRIGIDO** — pattern adicionado |
| 7 | `git switch main` nao coberto nas deny rules | Media | **CORRIGIDO** — pattern adicionado |

### Limitacoes residuais aceitas
- Deny rules por pattern matching nunca serao 100% completas — um agente determinado pode construir comandos que fogem dos patterns. O prompt de instrucoes e a principal barreira.
- O filtro `repository_owner` impede colaboradores de usar o agente. Para projetos com equipe, considerar usar uma lista de logins permitidos ou filtro por membership.

## 4. `dangerouslySkipPermissions: true` no settings.local.json

Este flag desabilita TODAS as confirmacoes de permissao no Claude Code local. Embora os hooks ainda funcionem como guardrails, qualquer acao nao coberta por hooks sera executada sem confirmacao.

**Recomendacao**: manter apenas durante sessoes supervisionadas. Para uso autonomo, remover esta flag.

## 5. AGENTS.md referenciado mas inexistente

`CLAUDE.md` referencia `@AGENTS.md` na linha 5, mas o arquivo nao existe no repositorio.

**Recomendacao**: criar o arquivo ou remover a referencia.
