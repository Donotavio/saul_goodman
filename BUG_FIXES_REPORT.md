# Relatório de Correções de Bugs - Saul Goodman
**Data:** 2026-01-16  
**Versão:** 1.21.13

## SUMÁRIO EXECUTIVO

Este documento detalha as correções implementadas para resolver bugs críticos relacionados a:
1. Boot do daemon via VS Code
2. Persistência de dados entre componentes
3. Conformidade com regras de negócio (indicadores fisicamente possíveis)
4. Detecção de inatividade
5. Acumulação indevida de métricas

---

## BUG A1: codeActionSampler is not defined

### Diagnóstico
**Arquivo:** `vscode-extension/src/tracking/refactor-tracker.js:141`

**Causa Raiz:** Referência incorreta à variável `codeActionSampler` sem o prefixo `this.` no callback de dispose.

```javascript
// ❌ ANTES (linha 141)
dispose: () => clearInterval(codeActionSampler)

// ✅ DEPOIS (linha 141)
dispose: () => clearInterval(this.codeActionSampler)
```

**Impacto:** 
- Impedia a inicialização da extensão VS Code quando `enableTelemetry` estava ativo
- Causava `ReferenceError` durante o boot, impedindo o comando "startDaemon" de funcionar
- Bloqueava toda a cadeia de rastreamento de refatorações

**Status:** ✅ CORRIGIDO

---

## BUG A2: Daemon Boot via VS Code - Análise Completa

### Diagnóstico da Função prepareDaemonCommand()

**Arquivo:** `vscode-extension/src/extension.js:415-491`

**Análise do Código Atual:**

```javascript
async function prepareDaemonCommand() {
  // 1. Coleta configurações
  const config = readConfig();
  
  // 2. Prompt para PAIRING_KEY ✅
  const keyInput = await vscode.window.showInputBox({...});
  const key = keyInput.trim() || 'sua-chave';
  
  // 3. Prompt para PORT ✅
  const portInput = await vscode.window.showInputBox({...});
  const parsedPort = parsePort(portInput.trim() || '3123');
  const port = String(parsedPort);
  
  // 4. Localiza daemon ✅
  const workspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const daemonDir = workspace ? path.join(workspace, 'saul-daemon') : null;
  const daemonIndex = daemonDir ? path.join(daemonDir, 'index.cjs') : null;
  
  // 5. Spawn do processo ✅
  const logFile = path.join(daemonDir ?? workspace, 'daemon.log');
  const child = child_process.spawn('node', ['index.cjs'], {
    cwd: daemonDir ?? workspace,  // ✅ Correto
    env: { ...process.env, PAIRING_KEY: key, PORT: port },  // ✅ Correto
    detached: true,
    stdio: ['ignore', stdoutFd ?? 'ignore', stderrFd ?? 'ignore']  // ✅ Logs para arquivo
  });
  child.unref();
}
```

**Avaliação:**
- ✅ ENV VARS corretas: `PAIRING_KEY` e `PORT` passados corretamente
- ✅ CWD correto: `saul-daemon` como diretório de trabalho
- ✅ Entrypoint correto: `index.cjs`
- ✅ Logs redirecionados para `daemon.log`
- ✅ Processo detached com unref (não bloqueia VS Code)

**Conclusão:** O código de boot do daemon está **CORRETO**. O bug `codeActionSampler` impedia a execução da extensão, mas o daemon em si não tem problemas estruturais.

**Recomendação Adicional:** Adicionar output channel do VS Code para logs em tempo real (além do arquivo).

---

## BUG B: Persistência de Dados - Análise da Cadeia Completa

### Fluxo de Dados Mapeado

```
VS Code Extension
  ├─ heartbeat-tracker.js: Captura eventos (edição, foco, save)
  ├─ heartbeat-factory.js: Cria payload com timestamp, metadata, etc.
  ├─ buffered-event-queue.js: Buffer de eventos
  │   ├─ Flush a cada 10s ou 50 eventos
  │   └─ POST /v1/vscode/heartbeats
  │
  ↓ HTTP Request
  
SaulDaemon (index.cjs)
  ├─ handleVscodeHeartbeats(): Recebe heartbeats
  ├─ normalizeHeartbeat(): Valida e normaliza
  ├─ Deduplicação por ID (vscodeIdIndex Map)
  ├─ entry.heartbeats.push(...accepted)
  ├─ buildDurations(): Agrupa heartbeats em durations
  │   ├─ gapMs: 5min (VSCODE_GAP_MS)
  │   └─ graceMs: 2min (VSCODE_GRACE_MS)
  ├─ persistVscodeState(): Salva em vscode-tracking.json
  │
  ↓ API Endpoint
  
Chrome Extension
  ├─ syncVscodeMetrics(): GET /v1/tracking/vscode/summary?date=YYYY-MM-DD&key=KEY
  ├─ Recebe: { totalActiveMs, sessions, switches, switchHourly, timeline }
  ├─ metrics.vscodeActiveMs = summary.totalActiveMs  ← PERSISTÊNCIA AQUI
  ├─ saveDailyMetrics(): chrome.storage.local.set()
  └─ StorageKeys.METRICS = 'sg:metrics'
```

### Pontos de Falha Identificados

#### 1. **Idempotência no Daemon - ✅ IMPLEMENTADA CORRETAMENTE**
```javascript
// saul-daemon/index.cjs:818-828
const idSet = getVscodeIdSet(key);  // Map por pairing key
for (const heartbeat of normalized) {
  if (idSet.has(heartbeat.id)) {
    continue;  // ✅ Deduplicação correta
  }
  idSet.add(heartbeat.id);
  accepted.push(heartbeat);
}
```

#### 2. **Retention Policy no Daemon**
```javascript
// Configuração atual
const VSCODE_RETENTION_DAYS = parseEnvNumber('SAUL_DAEMON_VSCODE_RETENTION_DAYS', RETENTION_DAYS);
// Default: RETENTION_DAYS = 1 dia ✅
```

**Problema:** O daemon está configurado para reter 1 dia, mas a extensão VS Code pode enviar eventos antigos do buffer persistido.

#### 3. **Buffer Persistence no VS Code**
```javascript
// vscode-extension/src/queue/buffered-event-queue.js:25-37
async init() {
  await mkdir(this.storageDir, { recursive: true');
  try {
    const raw = await readFile(this.storagePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.events)) {
      this.buffer = parsed.events;  // ⚠️ RE-HYDRATE de eventos antigos
    }
  } catch {
    this.buffer = [];
  }
  await this.persist();
}
```

**PROBLEMA IDENTIFICADO:** 
- A extensão VS Code persiste o buffer de eventos em `vscode-heartbeat-queue.json`
- Ao recarregar/reiniciar, ela **re-hydrate** eventos antigos
- Se o daemon estiver off ou houver falhas de rede, eventos se acumulam
- Ao religar, **TODOS os eventos do buffer são enviados**, mesmo que sejam de dias anteriores

---

## BUG C: Regra "Somente Dia Atual" - Violação na Extensão VS Code

### Problema
A extensão VS Code **NÃO respeita** a regra de "trabalhar apenas com dados do dia atual".

**Evidências:**

1. **Buffer persistido indefinidamente**
```javascript
// buffered-event-queue.js persiste eventos sem verificar data
this.buffer.push(event);  // Sem check de dateKey
void this.persist();  // Persiste imediatamente
```

2. **Re-hydrate sem validação de data**
```javascript
// init() carrega TODOS os eventos do arquivo
this.buffer = parsed.events;  // Sem filtro por data
```

3. **Configuração inexistente para cleanup diário**
- Não há código para resetar métricas à meia-noite (timezone local)
- Não há separação entre "config" (persistente) e "daily state" (efêmero)

### Impacto
- Métricas acumulam indefinidamente se o daemon estiver offline
- Ao reconectar, dias/semanas de dados são enviados de uma vez
- Viola regra de negócio: "150 horas em um dia de 24h" pode ocorrer

---

## BUG D: Detecção de Inatividade Fantasma

### Problema Identificado

**Arquivo:** `vscode-extension/src/tracking/heartbeat-tracker.js:54-56`

```javascript
if (!this.windowFocused) {
  return;  // ✅ Correto: não envia se janela não focada
}
```

**Análise:** O código de heartbeat tracker **JÁ implementa** detecção de foco da janela.

**PORÉM:** Há outros trackers que podem gerar atividade sem validar foco:

1. **git-tracker.js**: Pode detectar mudanças Git em background
2. **workspace-tracker.js**: Escaneia workspace periodicamente
3. **extension-tracker.js**: Monitora extensões mesmo sem interação
4. **focus-tracker.js**: Tem intervalos (pomodoros) que rodam independente de atividade real

### Atividade Fantasma - Análise Detalhada

**focus-tracker.js:74-90**
```javascript
this.pomodoroInterval = setInterval(() => {
  const config = this.getConfig();
  if (!config.enableTelemetry) return;
  
  if (this.isFocused && this.lastFocusTime) {  // ✅ Valida foco
    const focusDurationMs = Date.now() - this.lastFocusTime;
    // ... registra atividade
  }
}, 25 * 60 * 1000);  // A cada 25 minutos
```

**PROBLEMA:** O interval roda **sempre**, mesmo sem atividade real. Se `this.isFocused = true` estiver "travado", ele gera eventos fantasma.

---

## BUG E: Acumulação por Build/Reload

### Problema: Duplicação de Listeners e Timers

**Evidência no código:**

1. **refactor-tracker.js:13-15**
```javascript
start() {
  console.log('[Saul Refactor] Refactor tracker started');
  this.dispose();  // ✅ Chama dispose antes de recriar
  // ... registra novos listeners
}
```

2. **focus-tracker.js:73-90**
```javascript
this.pomodoroInterval = setInterval(() => {...}, 25 * 60 * 1000);
// ⚠️ Se start() for chamado 2x sem dispose(), cria 2 intervals
```

3. **extension.js:296-330 - applyConfig()**
```javascript
applyConfig() {
  if (this.config.enableTracking) {
    this.heartbeatTracker.start();  // ⚠️ Pode chamar start() múltiplas vezes
    void this.gitTracker.start();
    // ...
  }
  
  if (this.config.enableTelemetry) {
    this.debugTracker.start();  // ⚠️ Pode acumular listeners
    // ...
  }
}
```

**Cenário de Bug:**
1. Extensão inicia → trackers.start()
2. Usuário muda config → reloadConfig() → applyConfig() → trackers.start() **NOVAMENTE**
3. Build/reload da extensão → init() → trackers.start() **DE NOVO**
4. Resultado: 3x os listeners, 3x as métricas registradas

### Validação Necessária
Cada tracker deve:
- ✅ Chamar `dispose()` antes de `start()`
- ✅ Limpar **TODOS** os timers no `dispose()`
- ✅ Limpar listeners acumulados

---

## CORREÇÕES IMPLEMENTADAS

### CORREÇÃO 1: Bug codeActionSampler ✅

**Arquivo:** `vscode-extension/src/tracking/refactor-tracker.js`

```diff
@@ -140,7 +140,7 @@
       }, 30000);
 
       this.disposables.push({
-        dispose: () => clearInterval(codeActionSampler)
+        dispose: () => clearInterval(this.codeActionSampler)
       });
     }
   }
```

**Validação:**
1. Abrir projeto no VS Code
2. Ativar `enableTelemetry: true` nas configs
3. Extensão deve inicializar sem erros
4. Verificar logs: `[Saul Refactor] Refactor tracker started`

---

## CORREÇÕES PENDENTES (Próximos Passos)

### CORREÇÃO 2: Buffer Cleanup Diário (VS Code)

**Arquivo:** `vscode-extension/src/queue/buffered-event-queue.js`

**Mudanças necessárias:**
1. Adicionar validação de data ao re-hydrate
2. Limpar eventos com `dateKey` diferente do dia atual
3. Implementar `clearOldEvents()` chamado no init

### CORREÇÃO 3: Midnight Reset (VS Code)

**Arquivo:** `vscode-extension/src/extension.js`

**Mudanças necessárias:**
1. Adicionar alarm de meia-noite (como no Chrome)
2. Limpar buffer de eventos ao mudar de dia
3. Resetar cache de throttling (`lastSentByEntity`)

### CORREÇÃO 4: Guardrails de Métricas (Daemon)

**Arquivo:** `saul-daemon/index.cjs`

**Mudanças necessárias:**
1. Clamp `totalActiveMs` para máximo 24h (86_400_000 ms)
2. Validar que `sessions` não exceda número razoável por dia
3. Adicionar warnings quando valores suspeitos

### CORREÇÃO 5: Focus Tracker - Inatividade Real

**Arquivo:** `vscode-extension/src/tracking/focus-tracker.js`

**Mudanças necessárias:**
1. Adicionar timeout de inatividade
2. Se não houver eventos do usuário por X minutos, resetar `isFocused = false`
3. Implementar heartbeat de "keep-alive" baseado em eventos reais

---

## TESTE E VALIDAÇÃO

### Testes Manuais Necessários

#### Teste 1: Boot do Daemon
```bash
# Terminal 1
cd saul-daemon
PAIRING_KEY=test-key-123 PORT=3123 node index.cjs

# Terminal 2 (VS Code)
# Executar comando: "Saul Goodman: preparar comando do SaulDaemon"
# Verificar que daemon inicia sem erros
```

#### Teste 2: Persistência de Dados
```bash
# 1. Editar arquivo no VS Code
# 2. Aguardar 15 segundos (flush interval)
# 3. Verificar daemon.log para POST /v1/vscode/heartbeats
# 4. Verificar saul-daemon/data/vscode-tracking.json contém heartbeats
# 5. Abrir extensão Chrome
# 6. Verificar que métricas VS Code aparecem no dashboard
```

#### Teste 3: Cleanup de Dados Antigos
```bash
# 1. Criar eventos de "ontem" manualmente
# 2. Reiniciar extensão VS Code
# 3. Verificar que buffer foi limpo (apenas eventos de hoje)
# 4. Verificar saul-daemon retém apenas 1 dia de dados
```

#### Teste 4: Indicadores Fisicamente Possíveis
```bash
# 1. Trabalhar 30 minutos no VS Code
# 2. Verificar que totalActiveMs ≈ 1_800_000 ms (30 min)
# 3. NÃO deve ser 3_600_000 ms (dobro) por duplicação
# 4. Recarregar extensão VS Code
# 5. Verificar que métricas NÃO dobram após reload
```

#### Teste 5: Detecção de Inatividade
```bash
# 1. Abrir VS Code, editar arquivo
# 2. Deixar PC parado por 5 minutos (sem tocar teclado/mouse)
# 3. Verificar daemon.log: não deve registrar novos heartbeats após timeout
# 4. Voltar a editar
# 5. Verificar que atividade é retomada corretamente
```

---

## COMPATIBILIDADE

- **Chrome MV3:** ✅ Não afetado (extensão Chrome está correta)
- **VS Code APIs:** ✅ Usa apenas APIs estáveis (vscode 1.80+)
- **Node.js:** ✅ Daemon compatível com Node 14+ (usa CJS)
- **Build/Reload:** ⚠️ Requer atenção nos trackers para evitar acumulação

---

## PRÓXIMOS PASSOS

1. ✅ **BUG A1 corrigido** - codeActionSampler
2. ⏳ **Implementar CORREÇÃO 2** - Buffer cleanup diário
3. ⏳ **Implementar CORREÇÃO 3** - Midnight reset
4. ⏳ **Implementar CORREÇÃO 4** - Guardrails de métricas
5. ⏳ **Implementar CORREÇÃO 5** - Focus tracker melhorado
6. ⏳ **Executar bateria de testes**
7. ⏳ **Documentar no CHANGELOG.md**

---

**Status Geral:** 1/5 correções implementadas, 4 pendentes.
