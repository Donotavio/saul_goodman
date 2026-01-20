# Idle Detection - VS Code Extension

## Implementação

A detecção de idle foi implementada para prevenir o envio de heartbeats quando o usuário está inativo, similar ao comportamento da Chrome Extension.

## Arquitetura

### HeartbeatTracker (`src/tracking/heartbeat-tracker.js`) - **Sistema Central**

**Propriedades adicionadas:**
- `isIdle`: Estado atual (idle/active) - **FONTE ÚNICA DE VERDADE**
- `lastActivityTime`: Timestamp da última atividade detectada
- `idleCheckTimer`: Intervalo que verifica periodicamente o estado de idle

**Métodos:**

```javascript
startIdleDetection()
```
- Inicia o timer de verificação de idle (a cada 5 segundos)
- Utiliza `config.idleThresholdMs` (padrão: 60000ms = 1 minuto)
- Marca como idle se `timeSinceActivity >= idleThresholdMs`

```javascript
stopIdleDetection()
```
- Limpa o timer quando o tracker é desabilitado

```javascript
resetIdleTimer()
```
- Atualiza `lastActivityTime` para agora
- Sai do estado idle se estiver nele
- Chamado em todos os eventos de atividade

### FocusTracker (`src/tracking/focus-tracker.js`) - **Consumidor Unificado**

**Integração com HeartbeatTracker:**
- Verifica `this.heartbeatTracker.isIdle` no pomodoroInterval (a cada 60s)
- **Removido:** Timer redundante `inactivityCheckInterval`
- **Removido:** Propriedade `lastRealActivity`
- **Removido:** Config separado `inactivityTimeoutMs`

**Comportamento:**
- Quando `isIdle = true`: Envia evento de "blur" e pausa Pomodoro
- Quando `isIdle = false`: Restaura "focus" e retoma Pomodoro
- **Threshold unificado**: Usa o mesmo `idleThresholdMs` do HeartbeatTracker

### Eventos que resetam o timer

**No HeartbeatTracker:**
- `onDidChangeWindowState` (quando janela ganha foco)
- `onDidChangeActiveTextEditor`
- `onDidChangeTextDocument`
- `onDidSaveTextDocument`

**Via TrackingController:**
- Git commits/pushes/pulls (GitTracker)
- Debug sessions (DebugTracker)
- Test runs (TestTracker)
- Task executions (TaskTracker)
- Terminal activity (TerminalTracker)
- Tab switches (ExtraEvents)
- Command executions (ExtraEvents)
- Command palette (ExtraEvents)

### Configuração

**settings.json:**
```json
{
  "saulGoodman.idleThresholdMs": 60000  // Padrão: 1 minuto - UNIFICADO
}
```

**Nota:** ~~`saulGoodman.inactivityTimeoutMs`~~ foi **removido** - agora todo o sistema usa apenas `idleThresholdMs`.

## Comportamento

1. **Ativo → Idle**: Após `idleThresholdMs` sem atividade, heartbeats param de ser enviados
2. **Idle → Ativo**: Qualquer evento de atividade reseta o timer imediatamente
3. **Logging**: Console logs quando entra/sai do estado idle

## Comparação com Chrome Extension

| Aspecto | Chrome Extension | VS Code Extension |
|---------|-----------------|-------------------|
| **Mecanismo** | `chrome.idle` API nativa | Timer + eventos de atividade |
| **Threshold** | Configurável (min 15s) | Configurável (padrão 60s) |
| **Granularidade** | Sistema (mouse/teclado) | IDE (edição/navegação) |
| **Quando idle** | Registra como `inactiveMs` | Para de enviar heartbeats |
| **Impacto** | Penaliza score (15% peso) | Sem dados = sem impacto no score |

## Vantagens da Implementação

1. **Consistência**: Comportamento similar entre extensões
2. **Flexibilidade**: Threshold configurável por usuário
3. **Performance**: Timer leve (check a cada 5s)
4. **Abrangência**: Múltiplos eventos de atividade monitorados
5. **Logging**: Visibilidade do estado via console
6. **🆕 Unificação**: Single source of truth - `HeartbeatTracker.isIdle` usado por todos os componentes

## Unificação de Thresholds ✨

**Antes:**
- `HeartbeatTracker`: `idleThresholdMs` (60s)
- `FocusTracker`: `inactivityTimeoutMs` (300s) + timer próprio

**Depois:**
- **Fonte única**: `HeartbeatTracker.isIdle`
- **Config única**: `idleThresholdMs` (60s)
- **FocusTracker**: Consome `isIdle` do HeartbeatTracker
- **Resultado**: Comportamento consistente em todo o sistema

## Fluxo de Dados

```
Atividade do usuário (edição, comando, etc.)
    ↓
resetIdleTimer() chamado
    ↓
lastActivityTime = now
    ↓
isIdle = false (se estava idle)
    ↓
Timer verifica a cada 5s:
    if (now - lastActivityTime >= idleThresholdMs)
        → isIdle = true
        → Heartbeats bloqueados
```

## Testando

1. Habilite tracking: `saulGoodman.enableTracking: true`
2. Abra o console de debug do VS Code
3. Aguarde 1 minuto sem atividade
4. Observe: `[Saul Heartbeat] Idle state detected after X seconds`
5. Edite qualquer arquivo
6. Observe: `[Saul Heartbeat] Activity detected, exiting idle state`
