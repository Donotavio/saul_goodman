const { describe, it, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const { ComboTracker } = require('../tracking/combo-tracker');

function getLocalDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`;
}

describe('ComboTracker', () => {
  let tracker;
  let mockContext;
  let mockQueue;
  let mockBuildHeartbeat;
  let enqueuedHeartbeats;
  let comboChanges;

  beforeEach(() => {
    enqueuedHeartbeats = [];
    comboChanges = [];

    mockContext = {
      globalState: {
        data: {},
        update: async function(key, value) {
          this.data[key] = value;
        },
        get: function(key) {
          return this.data[key];
        }
      }
    };

    mockQueue = {
      enqueue: (heartbeat) => {
        enqueuedHeartbeats.push(heartbeat);
      }
    };

    mockBuildHeartbeat = (params) => {
      return {
        ...params,
        timestamp: Date.now()
      };
    };

    tracker = new ComboTracker({
      context: mockContext,
      getConfig: () => ({ enableTelemetry: true }),
      queue: mockQueue,
      buildHeartbeat: mockBuildHeartbeat,
      onComboChange: (data) => {
        comboChanges.push(data);
      }
    });
  });

  describe('Inicialização', () => {
    it('deve iniciar com combo nível 0', () => {
      assert.strictEqual(tracker.currentLevel, 0);
      assert.strictEqual(tracker.consecutivePomodoros, 0);
    });

    it('deve carregar estado salvo', async () => {
      await mockContext.globalState.update('sg:combo:state', {
        currentLevel: 2,
        consecutivePomodoros: 2,
        maxComboToday: 3,
        totalCombosToday: 5,
        lifetimeMaxCombo: 10,
        lastSaveDate: getLocalDateKey()
      });

      await tracker.loadState();

      assert.strictEqual(tracker.currentLevel, 2);
      assert.strictEqual(tracker.consecutivePomodoros, 2);
      assert.strictEqual(tracker.maxComboToday, 3);
      assert.strictEqual(tracker.totalCombosToday, 5);
      assert.strictEqual(tracker.lifetimeMaxCombo, 10);
    });
  });

  describe('Combo Progression', () => {
    it('deve incrementar combo no primeiro pomodoro', async () => {
      await tracker.onPomodoroCompleted();

      assert.strictEqual(tracker.currentLevel, 1);
      assert.strictEqual(tracker.consecutivePomodoros, 1);
      assert.strictEqual(comboChanges.length, 1);
      assert.strictEqual(comboChanges[0].level, 1);
      assert.strictEqual(comboChanges[0].leveledUp, true);
    });

    it('deve avançar níveis corretamente', async () => {
      await tracker.onPomodoroCompleted(); // Nível 1
      assert.strictEqual(tracker.currentLevel, 1);

      await tracker.onPomodoroCompleted(); // Nível 2
      assert.strictEqual(tracker.currentLevel, 2);

      await tracker.onPomodoroCompleted(); // Nível 3
      assert.strictEqual(tracker.currentLevel, 3);

      await tracker.onPomodoroCompleted(); // Nível 4
      assert.strictEqual(tracker.currentLevel, 4);

      await tracker.onPomodoroCompleted(); // Nível 5 (Ultra)
      assert.strictEqual(tracker.currentLevel, 5);
      assert.strictEqual(tracker.consecutivePomodoros, 5);
      assert.strictEqual(comboChanges[4].isUltra, true);
    });

    it('deve enviar heartbeat a cada pomodoro', async () => {
      await tracker.onPomodoroCompleted();

      assert.strictEqual(enqueuedHeartbeats.length, 1);
      assert.strictEqual(enqueuedHeartbeats[0].entityType, 'combo');
      assert.strictEqual(enqueuedHeartbeats[0].entity, 'combo_update');
      assert.strictEqual(enqueuedHeartbeats[0].metadata.currentLevel, 1);
      assert.strictEqual(enqueuedHeartbeats[0].metadata.consecutivePomodoros, 1);
    });

    it('deve atualizar maxComboToday', async () => {
      await tracker.onPomodoroCompleted();
      await tracker.onPomodoroCompleted();
      await tracker.onPomodoroCompleted();

      assert.strictEqual(tracker.maxComboToday, 3);
    });

    it('deve persistir lifetimeMaxCombo', async () => {
      for (let i = 0; i < 7; i++) {
        await tracker.onPomodoroCompleted();
      }

      assert.strictEqual(tracker.lifetimeMaxCombo, 7);

      // Resetar combo
      await tracker.resetCombo();
      assert.strictEqual(tracker.consecutivePomodoros, 0);
      assert.strictEqual(tracker.lifetimeMaxCombo, 7); // Deve manter
    });
  });

  describe('Break Handling', () => {
    it('deve manter combo em break curto (<15min)', async () => {
      await tracker.onPomodoroCompleted();
      tracker.lastPomodoroTime = Date.now() - (10 * 60 * 1000); // 10min atrás

      await tracker.onPomodoroCompleted();

      assert.strictEqual(tracker.consecutivePomodoros, 2);
      assert.strictEqual(tracker.currentLevel, 2);
    });

    it('deve reduzir 1 nível em break médio (15-30min)', async () => {
      // Acumular 3 pomodoros
      await tracker.onPomodoroCompleted();
      await tracker.onPomodoroCompleted();
      await tracker.onPomodoroCompleted();
      assert.strictEqual(tracker.currentLevel, 3);

      // Simular break médio de 20min
      tracker.lastPomodoroTime = Date.now() - (20 * 60 * 1000);
      await tracker.onPomodoroCompleted();

      // Deve ter reduzido antes de incrementar
      assert.strictEqual(tracker.consecutivePomodoros, 3); // 3 -> 2 -> 3
      assert.strictEqual(tracker.currentLevel, 3);
    });

    it('deve resetar combo em break longo (>30min)', async () => {
      // Acumular 3 pomodoros
      await tracker.onPomodoroCompleted();
      await tracker.onPomodoroCompleted();
      await tracker.onPomodoroCompleted();
      assert.strictEqual(tracker.currentLevel, 3);

      // Simular break longo de 40min
      tracker.lastPomodoroTime = Date.now() - (40 * 60 * 1000);
      
      const changesBefore = comboChanges.length;
      await tracker.onPomodoroCompleted();

      // Deve ter resetado e depois incrementado
      assert.strictEqual(tracker.consecutivePomodoros, 1);
      assert.strictEqual(tracker.currentLevel, 1);
      
      // Deve ter emitido evento de reset
      const resetEvent = comboChanges.find(c => c.comboReset === true);
      assert.ok(resetEvent, 'Deve ter emitido evento de combo reset');
    });

    it('deve enviar heartbeat de combo_reset em break longo', async () => {
      await tracker.onPomodoroCompleted();
      tracker.lastPomodoroTime = Date.now() - (40 * 60 * 1000);
      
      enqueuedHeartbeats = []; // Limpar
      await tracker.onPomodoroCompleted();

      const resetHeartbeat = enqueuedHeartbeats.find(h => h.entity === 'combo_reset');
      assert.ok(resetHeartbeat, 'Deve ter enviado heartbeat de combo_reset');
    });
  });

  describe('Cálculo de Níveis', () => {
    it('deve calcular níveis corretamente', () => {
      assert.strictEqual(tracker.calculateComboLevel(0), 0);
      assert.strictEqual(tracker.calculateComboLevel(1), 1);
      assert.strictEqual(tracker.calculateComboLevel(2), 2);
      assert.strictEqual(tracker.calculateComboLevel(3), 3);
      assert.strictEqual(tracker.calculateComboLevel(4), 4);
      assert.strictEqual(tracker.calculateComboLevel(5), 5);
      assert.strictEqual(tracker.calculateComboLevel(10), 5); // Cap no nível 5
    });
  });

  describe('Persistência', () => {
    it('deve salvar estado no globalState', async () => {
      await tracker.onPomodoroCompleted();
      await tracker.onPomodoroCompleted();

      const savedState = mockContext.globalState.get('sg:combo:state');
      assert.ok(savedState);
      assert.strictEqual(savedState.currentLevel, 2);
      assert.strictEqual(savedState.consecutivePomodoros, 2);
      assert.strictEqual(savedState.maxComboToday, 2);
      assert.ok(savedState.lastSaveDate);
    });

    it('deve resetar stats diários em novo dia', async () => {
      // Simular save de ontem
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      await mockContext.globalState.update('sg:combo:state', {
        currentLevel: 2,
        consecutivePomodoros: 2,
        maxComboToday: 2,
        totalCombosToday: 5,
        lifetimeMaxCombo: 10,
        lastSaveDate: getLocalDateKey(yesterday)
      });

      // Carregar o estado para aplicar lifetimeMaxCombo: 10
      await tracker.loadState();

      // Verificar que estado foi carregado corretamente
      assert.strictEqual(tracker.lifetimeMaxCombo, 10);

      // Agora fazer o check que deve resetar tudo exceto lifetimeMaxCombo
      await tracker.checkDailyReset();

      assert.strictEqual(tracker.consecutivePomodoros, 0);
      assert.strictEqual(tracker.currentLevel, 0);
      assert.strictEqual(tracker.maxComboToday, 0);
      assert.strictEqual(tracker.totalCombosToday, 0);
      assert.strictEqual(tracker.lifetimeMaxCombo, 10); // Persiste
    });
  });

  describe('Stats', () => {
    it('deve retornar stats corretos', async () => {
      await tracker.onPomodoroCompleted();
      await tracker.onPomodoroCompleted();
      await tracker.onPomodoroCompleted();

      const stats = await tracker.getStats();
      assert.strictEqual(stats.currentLevel, 3);
      assert.strictEqual(stats.consecutivePomodoros, 3);
      assert.strictEqual(stats.maxComboToday, 3);
      assert.ok(stats.currentLevelInfo);
      assert.strictEqual(stats.currentLevelInfo.totalMinutes, 75);
    });

    it('deve retornar info do nível atual', () => {
      tracker.currentLevel = 3;
      tracker.consecutivePomodoros = 3;
      tracker.maxComboToday = 5;

      const info = tracker.getCurrentLevelInfo();
      assert.strictEqual(info.level, 3);
      assert.strictEqual(info.pomodoros, 3);
      assert.strictEqual(info.totalMinutes, 75);
      assert.strictEqual(info.maxComboToday, 5);
      assert.strictEqual(info.name, 'combo_objection');
    });
  });

  describe('Manual Reset', () => {
    it('deve resetar combo manualmente', async () => {
      await tracker.onPomodoroCompleted();
      await tracker.onPomodoroCompleted();

      await tracker.resetCombo();

      assert.strictEqual(tracker.currentLevel, 0);
      assert.strictEqual(tracker.consecutivePomodoros, 0);
      
      const resetEvent = comboChanges.find(c => c.manualReset === true);
      assert.ok(resetEvent);
    });

    it('deve enviar heartbeat de manual reset', async () => {
      await tracker.onPomodoroCompleted();
      
      enqueuedHeartbeats = [];
      await tracker.resetCombo();

      const manualResetHeartbeat = enqueuedHeartbeats.find(h => h.entity === 'combo_manual_reset');
      assert.ok(manualResetHeartbeat);
    });
  });

  describe('Telemetry Disabled', () => {
    it('não deve enviar heartbeats se telemetry desabilitada', async () => {
      const disabledTracker = new ComboTracker({
        context: mockContext,
        getConfig: () => ({ enableTelemetry: false }),
        queue: mockQueue,
        buildHeartbeat: mockBuildHeartbeat,
        onComboChange: () => {}
      });

      await disabledTracker.onPomodoroCompleted();

      assert.strictEqual(enqueuedHeartbeats.length, 0);
    });
  });
});
