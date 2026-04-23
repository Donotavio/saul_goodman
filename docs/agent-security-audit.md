# Auditoria de seguranca: hooks e workflow do Claude Agent

Data: 2026-04-18

## 1. Hooks de seguranca (`.claude/settings.local.json`)

Arquivo local (gitignored). Achados e recomendacoes para ajuste manual.

### 1.1 `dangerouslySkipPermissions: true` — CRITICO

O flag `dangerouslySkipPermissions` anula toda a configuracao de `permissions.deny`.
Qualquer chamada de ferramenta e auto-aprovada sem interacao do usuario.

**Recomendacao**: remover o flag ou setar como `false`. Se o objetivo e agilizar o workflow interativo,
manter a lista de `allow` ampla mas sem pular a checagem.

### 1.2 Hook anti-delete — MEDIO

O hook detecta `rm` via `grep -qE '\\brm\\b'` e extrai caminhos absolutos.

Limitacoes:
- Nao detecta `unlink`, `shred`, `find ... -delete`, `rmdir`.
- Nao detecta caminhos relativos (`../../etc/passwd`, `~/`).
- Expansao de variaveis nao e tratada (`rm $TARGET`).

**Recomendacao**: expandir o regex para incluir outros comandos destrutivos:

```bash
grep -qE '\\b(rm|unlink|shred|rmdir)\\b|find\\s.*-delete'
```

Para caminhos relativos, normalizar com `realpath` antes de comparar com o diretorio do projeto.

### 1.3 Hook de auditoria de downloads — BAIXO

O hook usa um prompt de LLM para avaliar downloads. Funciona como advisory (influencia o agente)
mas nao bloqueia programaticamente — o agente pode ignorar a recomendacao.

O `if` condicional limita a execucao aos padroes comuns (curl, wget, etc.), o que e adequado.

**Recomendacao**: para enforcement real, adicionar deny patterns na lista de `permissions.deny`:

```json
"deny": [
  "Bash(*| bash)",
  "Bash(*| sh)",
  "Bash(curl * | *)"
]
```

### 1.4 Permissoes redundantes — INFO

`Bash(*)` ja cobre todos os comandos Bash. `mcp__*` ja inclui `mcp__github__issue_write`
e `mcp__github__pull_request_read`. Remover as entradas redundantes para clareza.

---

## 2. Workflow Claude Agent (`.github/workflows/claude-agent.yml`)

### 2.1 Issues trigger sem filtro — CRITICO (CORRIGIDO)

**Antes**: `issues: [opened, labeled]` sem filtro de label no `if`.
Qualquer issue aberta ou rotulada disparava o agente, gastando creditos de API
e permitindo abuso por qualquer usuario com permissao de abrir issues.

**Correcao**: removido `opened` do trigger; agora dispara apenas com o label `claude`
e somente para issues criadas pelo owner:
```yaml
on:
  issues:
    types: [labeled]
# ...
if: (github.event_name == 'issues' && github.event.label.name == 'claude' &&
  github.event.issue.user.login == github.repository_owner)
```

### 2.2 Deny patterns incompletos — MEDIO (CORRIGIDO)

**Adicionados**:
- `git checkout main; git merge` (variante com `;`)
- `git switch main && git merge`
- `git switch main; git merge`

### 2.3 Sem concurrency control — MEDIO (CORRIGIDO)

**Adicionado** grupo de concorrencia por issue/PR:
```yaml
concurrency:
  group: claude-agent-${{ github.event.issue.number || github.event.pull_request.number }}
  cancel-in-progress: false
```

### 2.4 Token dedicado — MEDIO (CORRIGIDO)

**Antes**: `secrets.GITHUB_TOKEN` (token do runner).
**Depois**: `secrets.AGENT_GH_TOKEN` (token da conta dedicada `developerdonclaudio-ai`).

### 2.5 `merge_pull_request` bloqueado — OK

O deny `mcp__github__merge_pull_request` esta correto e funcional.
Impede que o agente faca merge via ferramenta MCP do GitHub.

### 2.6 Prompt fallback para issues — OK (ja corrigido anteriormente)

`${{ github.event.issue.body || github.event.comment.body }}` garante que o agente
recebe o corpo da issue quando disparado por label.

### 2.7 Owner check — OK (ja presente)

Todos os triggers exigem que o autor seja o `repository_owner`, impedindo abuso
por terceiros.

---

## 3. Riscos residuais

| Risco | Severidade | Mitigacao |
|-------|-----------|-----------|
| Deny patterns sao baseados em prefixo de string, nao semantica | Baixo | Regras no prompt do agente reforcam a proibicao |
| Agent pode construir comandos que contornam prefixos (pipes, subshells) | Baixo | Claude segue instrucoes; monitorar logs do workflow |
| `settings.local.json` nao e versionado | Info | Documentado aqui para referencia manual |
| Sem protecao contra `git rebase main` + force push | Baixo | Force push ja esta bloqueado; rebase sem push e inofensivo |
