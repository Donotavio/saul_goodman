#!/bin/bash
# =============================================================================
# Saul Goodman — Claude Code Agent Local
# Monitora issues do GitHub e executa Claude Code localmente.
# Uso: ./agent.sh [--once] [--interval 60]
# =============================================================================

set -euo pipefail

REPO="Donotavio/saul_goodman"
PROJECT_DIR="/Users/otavioribeiro/Documents/saul_goodman"
STATE_FILE="${PROJECT_DIR}/tools/claude-agent/.agent-state.json"
LOG_DIR="${PROJECT_DIR}/tools/claude-agent/logs"
POLL_INTERVAL="${POLL_INTERVAL:-60}"
TRIGGER_LABEL="claude"
RUN_ONCE=false

# Carrega token do agente (developerdonclaudio-ai)
ENV_FILE="${PROJECT_DIR}/.env"
if [ -f "$ENV_FILE" ]; then
  AGENT_TOKEN=$(grep -E '^AGENT_GH_TOKEN=' "$ENV_FILE" | cut -d'=' -f2- | tr -d ' "'"'"'')
  if [ -n "$AGENT_TOKEN" ]; then
    export GH_TOKEN="$AGENT_TOKEN"
  fi
fi

# Parse args
while [[ $# -gt 0 ]]; do
  case $1 in
    --once) RUN_ONCE=true; shift ;;
    --interval) POLL_INTERVAL="$2"; shift 2 ;;
    *) echo "Uso: $0 [--once] [--interval SECONDS]"; exit 1 ;;
  esac
done

mkdir -p "$LOG_DIR"

# Inicializa state se não existe
if [ ! -f "$STATE_FILE" ]; then
  echo '{"processed":[]}' > "$STATE_FILE"
fi

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

is_processed() {
  local issue_id="$1"
  jq -e --arg id "$issue_id" '.processed | index($id) != null' "$STATE_FILE" > /dev/null 2>&1
}

mark_processed() {
  local issue_id="$1"
  local tmp=$(mktemp)
  jq --arg id "$issue_id" '.processed += [$id]' "$STATE_FILE" > "$tmp" && mv "$tmp" "$STATE_FILE"
}

process_issue() {
  local issue_number="$1"
  local issue_title="$2"
  local issue_body="$3"
  local log_file="${LOG_DIR}/issue-${issue_number}-$(date '+%Y%m%d-%H%M%S').log"

  log "Processando issue #${issue_number}: ${issue_title}"
  log "Log: ${log_file}"

  # Garante que estamos na main atualizada
  cd "$PROJECT_DIR"

  # Configura git para usar o token do agente nos pushes
  if [ -n "${GH_TOKEN:-}" ]; then
    git remote set-url origin "https://x-access-token:${GH_TOKEN}@github.com/${REPO}.git"
  fi

  git checkout main 2>/dev/null
  git pull --rebase origin main 2>/dev/null

  # Cria branch para o trabalho
  local branch_name="claude/issue-${issue_number}"
  git checkout -b "$branch_name" 2>/dev/null || git checkout "$branch_name" 2>/dev/null

  # Monta o prompt
  local prompt="REGRAS OBRIGATORIAS:
1. NUNCA faca commit diretamente na branch main.
2. Voce esta na branch '${branch_name}'. Faca todos os commits aqui.
3. Ao terminar, faca push da branch e abra um Pull Request para main.
4. NUNCA faca merge automatico. O PR deve aguardar revisao humana.
5. Siga as convencoes do projeto definidas em CLAUDE.md.
6. Comente na issue #${issue_number} informando o PR criado.

Issue #${issue_number}: ${issue_title}

${issue_body}"

  # Executa Claude Code em modo não-interativo (prompt via stdin para evitar problemas com caracteres especiais)
  set +e
  echo "$prompt" | claude --print \
    --allowedTools 'Bash,Read,Write,Edit,Glob,Grep,mcp__github__create_pull_request,mcp__github__add_issue_comment' \
    > "$log_file" 2>&1
  local exit_code=$?
  set -e

  if [ $exit_code -eq 0 ]; then
    log "Issue #${issue_number} processada com sucesso"
  else
    log "ERRO ao processar issue #${issue_number} (exit code: ${exit_code})"
    # Comenta na issue sobre o erro
    gh issue comment "$issue_number" \
      --repo "$REPO" \
      --body "O agente local encontrou um erro ao processar esta issue. Verifique os logs em \`tools/claude-agent/logs/\`." \
      2>/dev/null || true
  fi

  # Volta para main
  git checkout main 2>/dev/null || true

  mark_processed "$issue_number"
}

poll_issues() {
  log "Verificando issues novas com label '${TRIGGER_LABEL}'..."

  # Busca issues abertas com a label trigger
  local issues
  issues=$(gh issue list \
    --repo "$REPO" \
    --label "$TRIGGER_LABEL" \
    --state open \
    --json number,title,body \
    --limit 10 2>/dev/null) || { log "Erro ao buscar issues"; return; }

  local count
  count=$(echo "$issues" | jq 'length')

  if [ "$count" -eq 0 ]; then
    log "Nenhuma issue nova encontrada"
    return
  fi

  log "Encontradas ${count} issue(s) com label '${TRIGGER_LABEL}'"

  # Processa cada issue não processada
  echo "$issues" | jq -c '.[]' | while read -r issue; do
    local number title body
    number=$(echo "$issue" | jq -r '.number')
    title=$(echo "$issue" | jq -r '.title')
    body=$(echo "$issue" | jq -r '.body')

    if is_processed "$number"; then
      log "Issue #${number} ja processada, pulando"
      continue
    fi

    process_issue "$number" "$title" "$body"
  done
}

# =============================================================================
# Main loop
# =============================================================================
log "========================================="
log "Claude Code Agent Local iniciado"
log "Repo: ${REPO}"
log "Intervalo: ${POLL_INTERVAL}s"
log "Label trigger: ${TRIGGER_LABEL}"
log "Auth: $([ -n "${GH_TOKEN:-}" ] && echo 'token do agente (AGENT_GH_TOKEN)' || echo 'auth local (gh cli)')"
log "Mode: $([ "$RUN_ONCE" = true ] && echo 'single-run' || echo 'continuous')"
log "========================================="

if [ "$RUN_ONCE" = true ]; then
  poll_issues
else
  while true; do
    poll_issues
    log "Aguardando ${POLL_INTERVAL}s..."
    sleep "$POLL_INTERVAL"
  done
fi
