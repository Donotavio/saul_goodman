# Saul Goodman VS Code Bridge

Extensão do VS Code que coleta eventos de atividade (heartbeats) e envia para o SaulDaemon local.
Os dados alimentam os relatórios da extensão Chrome e o relatório dentro do VS Code.

## Recursos

- Heartbeats com throttling (escrita e foco)
- Eventos extras: terminal, tasks, debug e testes (quando disponível)
- Fila com batch, persistência local e retry com backoff
- Relatório no VS Code via Webview (com os mesmos endpoints do SaulDaemon)
- Barra de status com tempo de hoje e estado do daemon
- **Sistema de telemetria local opcional** para métricas de produtividade (debugging, testes, terminal, etc)

## Como Usar

1. Inicie o SaulDaemon local (`saul-daemon/index.cjs`) com `PAIRING_KEY`
2. Configure no VS Code (`Configurações > Saul Goodman`):
   - `saulGoodman.enableTracking`: habilita/desabilita a coleta
   - `saulGoodman.enableReportsInVscode`: abre relatórios no editor
   - `saulGoodman.apiBase`: URL do daemon (ex.: `http://127.0.0.1:3123`)
   - `saulGoodman.pairingKey`: mesma chave do daemon e da extensão Chrome
3. Abra o comando **"Saul Goodman: abrir relatórios"** para ver o report no editor

## Configurações

### Configurações Básicas

- `saulGoodman.enableTracking` (default: `true`) - Habilita coleta de heartbeats
- `saulGoodman.enableReportsInVscode` (default: `true`) - Exibe relatórios no VS Code
- `saulGoodman.apiBase` (default: `http://127.0.0.1:3123`) - URL do daemon
- `saulGoodman.pairingKey` - Chave de pareamento
- `saulGoodman.hashFilePaths` (default: `true`) - Hash de paths de arquivos
- `saulGoodman.hashProjectNames` (default: `false`) - Hash de nomes de projetos
- `saulGoodman.language` (default: `auto`) - Idioma: `auto`, `en-US`, `pt-BR`, `es-419`

### Configurações de Telemetria (Opcional)

- `saulGoodman.enableTelemetry` (default: `false`) - Habilita telemetria de produtividade local
- `saulGoodman.telemetrySampleDiagnosticsIntervalSec` (default: `60`) - Intervalo de amostragem de diagnósticos
- `saulGoodman.telemetryRetentionDays` (default: `30`) - Dias de retenção de dados
- `saulGoodman.enableSensitiveTelemetry` (default: `false`) - Autoriza telemetria sensível

## O Que é Enviado (Heartbeats Básicos)

Exemplo de heartbeat padrão:

```json
{
  "id": "uuid",
  "time": "2024-01-01T10:00:00.000Z",
  "entityType": "file",
  "entity": "sha256",
  "project": "saul_goodman",
  "language": "typescript",
  "category": "coding",
  "isWrite": true,
  "editor": "vscode",
  "pluginVersion": "1.21.10",
  "machineId": "uuid",
  "metadata": {
    "linesAdded": 2,
    "linesRemoved": 1,
    "windowFocused": true,
    "workspaceId": "uuid"
  }
}
```

**Privacidade:** Nenhum conteúdo de código é enviado. Os paths são hasheados por padrão.

## Sistema de Telemetria Local (Opcional)

### Visão Geral

Este sistema coleta métricas de produtividade e qualidade de desenvolvimento **100% localmente**, sem enviar dados para fora da sua máquina. Os dados são armazenados no `globalStorageUri` do VS Code e processados localmente pelo daemon externo.

### O Que Coletamos

#### 1. **Debugging Activity** (`DebugTracker`)

- ✅ Sessões de debug iniciadas/terminadas
- ✅ Tipo de debugger (node, python, etc)
- ✅ Duração de cada sessão
- ✅ Breakpoints adicionados/removidos (apenas contagem e arquivo hash)
- ❌ **NÃO** coletamos: valores de variáveis, call stacks, conteúdo de código

**Eventos emitidos:**
- `debug_session` (start/stop) - metadata: `debugType`, `sessionId`, `durationMs`
- `debug_breakpoint` (add/remove) - metadata: `fileId` (hash), `line`

---

#### 2. **Testing Activity** (`TestTracker`)

- ✅ Testes executados
- ✅ Resultados (passed/failed/skipped)
- ✅ Duração de execução
- ✅ Detecção de comandos de teste no terminal (jest, mocha, pytest, etc)
- ❌ **NÃO** coletamos: nomes de testes, mensagens de erro, stack traces

**Eventos emitidos:**
- `test_run` (complete) - metadata: `passed`, `failed`, `skipped`, `durationMs`, `exitCode`

---

#### 3. **Tasks & Build Activity** (`TaskTracker`)

- ✅ Tasks executadas (build, test, deploy, lint)
- ✅ Grupo da task (build/test/other)
- ✅ Duração e exit code
- ❌ **NÃO** coletamos: argumentos da task, output do console

**Eventos emitidos:**
- `task` (start/end/process_end) - metadata: `taskName`, `taskGroup`, `durationMs`, `exitCode`

---

#### 4. **Extensions Usage** (`ExtensionTracker`)

- ✅ Extensões ativadas/desativadas
- ✅ Comandos executados por extensão (contagem agregada)
- ✅ Uso de comandos built-in do VS Code
- ❌ **NÃO** coletamos: argumentos de comandos, configurações de extensões

**Eventos emitidos:**
- `extension` (enable/disable/command_usage) - metadata: `extensionId`, `totalCommands`, `topCommand`

**Limitação:** Detecção de enable/disable é inferida por mudanças no estado de ativação, não é evento direto da API.

---

#### 5. **Terminal Activity** (`TerminalTracker`)

- ✅ Terminais abertos/fechados
- ✅ Shell type (bash, zsh, powershell, etc)
- ✅ Categoria de comando executado (git, npm, docker, python, etc) - **SEM o comando completo**
- ✅ Exit codes e duração de comandos
- ❌ **NÃO** coletamos: comando completo, argumentos, output

**Eventos emitidos:**
- `terminal` (open/close/command_start/command_end) - metadata: `shellType`, `commandCategory`, `exitCode`, `durationMs`

**Privacidade:** Apenas categorias genéricas são registradas (ex: "git", "npm", "docker"). O texto completo do comando **nunca é armazenado**.

**Requisito:** Terminal Shell Integration deve estar ativo para capturar comandos. Se não estiver disponível, apenas open/close são rastreados.

---

#### 6. **Window Focus & Breaks** (`FocusTracker`)

- ✅ Eventos de foco/desfoco da janela VS Code
- ✅ Duração de períodos focados e pausas
- ✅ Hora do dia (0-23) para análise de produtividade
- ✅ Milestones de Pomodoro (a cada 25 minutos de foco contínuo)
- ❌ **NÃO** coletamos: o que você faz fora do VS Code

**Eventos emitidos:**
- `window` (focus/blur/pomodoro_milestone) - metadata: `hourOfDay`, `focusDurationMs`, `previousBlurDurationMs`

**Métrica útil:** Detecta padrões de trabalho focado vs distrações.

---

#### 7. **Error & Warning Tracking** (`DiagnosticTracker`)

- ✅ Contagem de errors/warnings por arquivo (apenas contagens)
- ✅ Arquivo identificado por hash (não path absoluto)
- ✅ Comparação com snapshots anteriores (detecção de problemas resolvidos)
- ❌ **NÃO** coletamos: mensagens de erro, trechos de código, tipos de erro

**Eventos emitidos:**
- `diagnostic` (snapshot) - metadata: `fileId` (hash), `errors`, `warnings`, `infos`, `hints`

**Amostragem:** A cada 60 segundos (configurável via `telemetrySampleDiagnosticsIntervalSec`), não a cada keystroke.

---

#### 8. **Refactoring Activity** (`RefactorTracker`)

- ✅ Arquivos renomeados/movidos
- ✅ Edits aplicados via Workspace Edit API
- ✅ Code Actions disponíveis (sampling)
- ❌ **NÃO** coletamos: conteúdo de edits, nomes de arquivos em claro

**Eventos emitidos:**
- `refactor` (rename_files/apply_edit/code_action_available) - metadata: `fileId` (hash), `count`, `entryCount`

**Limitação:** Code Actions são amostradas a cada 30 segundos no editor ativo, não capturadas em tempo real.

---

### O Que NÃO Coletamos (Garantias de Privacidade)

🔒 **Conteúdo de arquivos** - Nunca  
🔒 **Paths absolutos** - Sempre hasheados com salt gerado localmente  
🔒 **Comandos completos do terminal** - Apenas categorias (git/npm/docker/etc)  
🔒 **Mensagens de erro/warnings** - Apenas contagens  
🔒 **Valores de variáveis em debug** - Nunca  
🔒 **Nomes de testes/funções** - Nunca  
🔒 **Argumentos de comandos** - Nunca  
🔒 **Conteúdo de edits/refactorings** - Nunca  
🔒 **Dados enviados para internet** - **NUNCA** (tudo fica local)

---

### Armazenamento

**Localização:** `context.globalStorageUri` (gerenciado pelo VS Code)
- macOS: `~/Library/Application Support/Code/User/globalStorage/donotavio.saul-goodman-vscode/`
- Linux: `~/.config/Code/User/globalStorage/donotavio.saul-goodman-vscode/`
- Windows: `%APPDATA%\Code\User\globalStorage\donotavio.saul-goodman-vscode\`

**Formato:** Eventos são enviados para o daemon via BufferedEventQueue (mesma infraestrutura dos heartbeats).

**Persistência:** O daemon externo (`saul-daemon`) persiste os dados em `vscode-tracking.json`.

---

### Hash Salgado (Anonimização)

Todos os paths de arquivos são convertidos em hashes SHA-256 com salt:

```javascript
fileId = sha256(salt + absolutePath).substring(0, 16)
```

**Salt:** Gerado aleatoriamente na primeira execução e armazenado em `context.globalState`. **Nunca é compartilhado**.

**Exemplo:**
- Path real: `/Users/joao/projects/myapp/src/index.ts`
- Hash armazenado: `a3f5c2e1b4d6f8a9`

**Impossível reverter:** Sem o salt (que só existe na sua máquina), é impossível descobrir o path original.

---

### Métricas Calculadas (Exemplos)

Com base nos eventos coletados, o daemon pode calcular:

- **Tempo em debugging vs coding** (sessões debug ativas vs janela focada sem debug)
- **Top 10 arquivos mais debugados** (por fileId hash)
- **Taxa de sucesso de testes** (passed / total)
- **Tempo médio de build** (tasks do grupo "build")
- **Extensões mais usadas** (por comandos executados)
- **Padrão de trabalho** (horas do dia com mais foco)
- **Tempo até resolver erros** (comparação de snapshots de diagnósticos)
- **Frequência de refactorings** (por dia/semana)

---

### Limitações da VS Code API

#### 1. **Terminal - Comandos Completos**

**Limitação:** `onDidStartTerminalShellExecution` requer Terminal Shell Integration ativo. Se o shell não suportar ou estiver desabilitado, apenas open/close são rastreados.

**Workaround:** Detectar comandos de teste via pattern matching quando disponível.

---

#### 2. **Extensions - Enable/Disable**

**Limitação:** A API estável não expõe eventos diretos de enable/disable de extensões.

**Workaround:** Inferir mudanças comparando `extensions.all.filter(e => e.isActive)` em `onDidChange`.

---

#### 3. **Extensions - Comandos de Terceiros**

**Limitação:** `commands.onDidExecuteCommand` é Proposed API (não estável).

**Workaround:** Interceptar `vscode.commands.executeCommand` (monkey patch). Funciona apenas para comandos invocados por código, não por atalhos/menu.

---

#### 4. **Tests - API Limitada**

**Limitação:** `vscode.tests` API retorna resultados agregados, não todos os detalhes de cada teste.

**Workaround:** Usar `onDidChangeTestResults` + detectar comandos de teste no terminal (`jest`, `mocha`, `pytest`).

---

#### 5. **Diagnostics - Performance**

**Limitação:** `languages.getDiagnostics()` pode ser custoso se chamado a cada keystroke.

**Workaround:** Amostragem a cada 60s (configurável), não em tempo real.

---

#### 6. **Refactoring - Code Actions**

**Limitação:** Não há evento nativo para "code action aplicada".

**Workaround:** 
- Rastrear `workspace.applyEdit` (monkey patch)
- Samplear `executeCodeActionProvider` a cada 30s para detectar disponibilidade

---

#### 7. **Focus - O Que Acontece Fora do VS Code**

**Limitação:** `window.state.focused` detecta apenas foco/blur, não o que você faz em outros apps.

**Workaround:** Assumir "pause" quando blur duration > 5 minutos.

---

## Desenvolvimento

### Testes

**TODO:** Implementar testes unitários para cada tracker usando mocks da VS Code API.

```bash
# Estrutura sugerida
vscode-extension/src/__tests__/
├── trackers/
│   ├── debug-tracker.test.js
│   ├── test-tracker.test.js
│   └── ...
└── utils/
    └── privacy.test.js
```

---

### Manutenção

### Limpar Dados Manualmente

```bash
# macOS/Linux
rm -rf ~/Library/Application\ Support/Code/User/globalStorage/donotavio.saul-goodman-vscode/
```

### Desabilitar Telemetria

```json
{
  "saulGoodman.enableTelemetry": false
}
```

Todos os trackers param imediatamente e nenhum dado novo é coletado.

---

### FAQ

**P: Os dados saem da minha máquina?**  
R: **NÃO**. Tudo é processado localmente. O daemon roda em `http://127.0.0.1:3123` (localhost).

**P: Posso ver os dados brutos?**  
R: Sim, estão em `globalStorageUri/vscode-heartbeat-queue.json` (buffer) e no daemon em `data/vscode-tracking.json`.

**P: Como sei que não estão coletando meu código?**  
R: Revise o código-fonte dos trackers. Todos os eventos enviados ao daemon são visíveis nos logs (`console.log`).

**P: Posso usar sem o daemon externo?**  
R: Atualmente não. Os eventos são enviados via `BufferedEventQueue` para o daemon. Uma versão futura pode suportar armazenamento local direto (SQLite/JSONL).

**P: E se eu deletar o salt?**  
R: Um novo salt é gerado, mas os hashes antigos se tornam inválidos (não correlacionáveis com novos dados). Recomenda-se **não** deletar.

---

### Roadmap

- [ ] Agregador de métricas local (sem depender do daemon)
- [ ] Export de métricas em JSON/CSV
- [ ] Dashboard integrado no webview de relatórios
- [ ] Testes unitários completos
- [ ] SQLite storage opcional (mais eficiente que JSONL)

---

### Contribuindo

Para adicionar um novo tracker:

1. Criar arquivo em `src/tracking/nome-tracker.js`
2. Seguir padrão: `constructor({ context, queue, getConfig, buildHeartbeat })`
3. Implementar `start()` e `dispose()`
4. Adicionar import e inicialização em `extension.js`
5. Documentar eventos emitidos neste README

---

## Licença

MIT - Mesmo que o projeto principal Saul Goodman.
