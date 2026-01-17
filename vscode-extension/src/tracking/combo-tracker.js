/**
 * ComboTracker - Sistema de combo Pomodoro estilo Street Fighter
 * Gerencia níveis de combo, breaks, e notificações
 */
class ComboTracker {
  constructor(options) {
    this.context = options.context;
    this.getConfig = options.getConfig;
    this.queue = options.queue;
    this.buildHeartbeat = options.buildHeartbeat;
    this.onComboChange = options.onComboChange || (() => {});
    
    // Estado do combo
    this.currentLevel = 0;
    this.consecutivePomodoros = 0;
    this.lastPomodoroTime = null;
    this.breakStartTime = null;
    this.totalCombosToday = 0;
    this.maxComboToday = 0;
    this.lifetimeMaxCombo = 0;
    this.comboTimeline = []; // Timeline de eventos do combo
    
    // Definição dos níveis de combo
    this.comboLevels = [
      { level: 0, pomodoros: 0, name: 'combo_none', multiplier: 1, color: '#6B7280' },
      { level: 1, pomodoros: 1, name: 'combo_opening_statement', multiplier: 1.2, color: '#FFC857' },
      { level: 2, pomodoros: 2, name: 'combo_building_case', multiplier: 1.5, color: '#F59E0B' },
      { level: 3, pomodoros: 3, name: 'combo_objection', multiplier: 2, color: '#EF4444' },
      { level: 4, pomodoros: 4, name: 'combo_closing', multiplier: 2.5, color: '#A855F7' },
      { level: 5, pomodoros: 5, name: 'combo_ultra', multiplier: 3, color: '#FFD700' }
    ];
    
    // Thresholds de break (em ms)
    this.breakThresholds = {
      short: 15 * 60 * 1000,   // 15min - mantém combo
      medium: 30 * 60 * 1000,  // 30min - reduz 1 nível
      long: 30 * 60 * 1000     // >30min - reset completo
    };
  }

  async start() {
    console.log('[Saul Combo] Combo tracker started');
    await this.loadState();
    await this.checkDailyReset();
  }

  /**
   * Chamado quando um pomodoro é completado
   */
  async onPomodoroCompleted() {
    const now = Date.now();
    
    // Verificar se houve um break
    if (this.lastPomodoroTime) {
      const timeSinceLastPomodoro = now - this.lastPomodoroTime;
      await this.handleBreak(timeSinceLastPomodoro);
    }
    
    // Incrementar combo
    this.consecutivePomodoros++;
    this.lastPomodoroTime = now;
    this.breakStartTime = null;
    
    // Registrar evento na timeline
    this.comboTimeline.push({
      timestamp: Date.now(),
      type: 'combo_increase',
      level: this.currentLevel,
      pomodoros: this.consecutivePomodoros
    });
    
    // Calcular nível atual
    const previousLevel = this.currentLevel;
    this.currentLevel = this.calculateComboLevel(this.consecutivePomodoros);
    
    // Atualizar máximos
    if (this.consecutivePomodoros > this.maxComboToday) {
      this.maxComboToday = this.consecutivePomodoros;
    }
    if (this.consecutivePomodoros > this.lifetimeMaxCombo) {
      this.lifetimeMaxCombo = this.consecutivePomodoros;
    }
    
    // Incrementar total de combos
    if (this.currentLevel > 0) {
      this.totalCombosToday++;
    }
    
    await this.saveState();
    
    // Enviar heartbeat para o daemon
    await this.sendComboHeartbeat('combo_update');
    
    // Notificar mudança
    const leveledUp = this.currentLevel > previousLevel;
    this.onComboChange({
      level: this.currentLevel,
      pomodoros: this.consecutivePomodoros,
      leveledUp,
      isUltra: this.currentLevel >= 5,
      totalMinutes: this.consecutivePomodoros * 25
    });
    
    console.log(`[Saul Combo] Pomodoro completed! Level: ${this.currentLevel}, Streak: ${this.consecutivePomodoros}`);
  }

  /**
   * Gerencia breaks entre pomodoros
   */
  async handleBreak(breakDuration) {
    if (breakDuration <= this.breakThresholds.short) {
      // Break curto - mantém combo
      console.log('[Saul Combo] Short break - combo maintained');
      return;
    } else if (breakDuration <= this.breakThresholds.medium) {
      // Break médio - reduz 1 nível
      if (this.consecutivePomodoros > 0) {
        this.consecutivePomodoros = Math.max(0, this.consecutivePomodoros - 1);
        this.currentLevel = this.calculateComboLevel(this.consecutivePomodoros);
        console.log('[Saul Combo] Medium break - combo reduced by 1');
        
        // Registrar evento na timeline
        this.comboTimeline.push({
          timestamp: Date.now(),
          type: 'combo_reduced',
          level: this.currentLevel,
          pomodoros: this.consecutivePomodoros,
          breakDuration
        });
        
        await this.sendComboHeartbeat('combo_reduced');
        
        this.onComboChange({
          level: this.currentLevel,
          pomodoros: this.consecutivePomodoros,
          comboReduced: true,
          breakDuration
        });
      }
    } else {
      // Break longo - reset completo
      if (this.consecutivePomodoros > 0) {
        console.log('[Saul Combo] Long break - combo reset');
        
        const oldLevel = this.currentLevel;
        const oldPomodoros = this.consecutivePomodoros;
        
        this.consecutivePomodoros = 0;
        this.currentLevel = 0;
        
        // Registrar evento na timeline
        this.comboTimeline.push({
          timestamp: Date.now(),
          type: 'combo_reset',
          level: 0,
          pomodoros: 0,
          breakDuration,
          previousLevel: oldLevel
        });
        
        await this.sendComboHeartbeat('combo_reset');
        
        this.onComboChange({
          level: 0,
          pomodoros: 0,
          comboReset: true,
          breakDuration,
          previousLevel: oldLevel,
          previousPomodoros: oldPomodoros
        });
      }
    }
    
    await this.saveState();
  }

  /**
   * Calcula o nível de combo baseado no número de pomodoros consecutivos
   */
  calculateComboLevel(pomodoros) {
    if (pomodoros >= 5) return 5;
    if (pomodoros >= 4) return 4;
    if (pomodoros >= 3) return 3;
    if (pomodoros >= 2) return 2;
    if (pomodoros >= 1) return 1;
    return 0;
  }

  /**
   * Retorna informações do nível atual
   */
  getCurrentLevelInfo() {
    const levelIndex = Math.min(this.currentLevel, this.comboLevels.length - 1);
    const levelInfo = this.comboLevels[levelIndex];
    
    return {
      ...levelInfo,
      pomodoros: this.consecutivePomodoros,
      totalMinutes: this.consecutivePomodoros * 25,
      maxComboToday: this.maxComboToday,
      totalCombosToday: this.totalCombosToday,
      lifetimeMaxCombo: this.lifetimeMaxCombo
    };
  }

  /**
   * Retorna estatísticas para o relatório
   */
  getStats() {
    return {
      currentLevel: this.currentLevel,
      consecutivePomodoros: this.consecutivePomodoros,
      maxComboToday: this.maxComboToday,
      totalCombosToday: this.totalCombosToday,
      lifetimeMaxCombo: this.lifetimeMaxCombo,
      currentLevelInfo: this.getCurrentLevelInfo()
    };
  }

  /**
   * Salva estado no globalState
   */
  async saveState() {
    const state = {
      currentLevel: this.currentLevel,
      consecutivePomodoros: this.consecutivePomodoros,
      lastPomodoroTime: this.lastPomodoroTime,
      maxComboToday: this.maxComboToday,
      totalCombosToday: this.totalCombosToday,
      lifetimeMaxCombo: this.lifetimeMaxCombo,
      comboTimeline: this.comboTimeline.slice(-100), // Últimos 100 eventos
      lastSaveDate: new Date().toISOString().slice(0, 10)
    };
    
    await this.context.globalState.update('sg:combo:state', state);
  }

  /**
   * Carrega estado do globalState
   */
  async loadState() {
    const state = this.context.globalState.get('sg:combo:state');
    if (state) {
      this.currentLevel = state.currentLevel || 0;
      this.consecutivePomodoros = state.consecutivePomodoros || 0;
      this.lastPomodoroTime = state.lastPomodoroTime || null;
      this.breakStartTime = state.breakStartTime || null;
      this.totalCombosToday = state.totalCombosToday || 0;
      this.maxComboToday = state.maxComboToday || 0;
      this.lifetimeMaxCombo = state.lifetimeMaxCombo || 0;
      this.comboTimeline = state.comboTimeline || [];
      
      console.log('[Saul Combo] State loaded:', {
        currentLevel: this.currentLevel,
        consecutivePomodoros: this.consecutivePomodoros,
        maxComboToday: this.maxComboToday,
        totalCombosToday: this.totalCombosToday,
        lifetimeMaxCombo: this.lifetimeMaxCombo,
        timelineEvents: this.comboTimeline.length,
        lastSaveDate: state.lastSaveDate
      });
    }
  }

  /**
   * Verifica se é um novo dia e reseta estatísticas diárias
   */
  async checkDailyReset() {
    const state = this.context.globalState.get('sg:combo:state');
    const today = new Date().toISOString().slice(0, 10);
    
    if (state && state.lastSaveDate !== today) {
      console.log('[Saul Combo] New day detected - resetting daily stats');
      this.consecutivePomodoros = 0;
      this.currentLevel = 0;
      this.lastPomodoroTime = null;
      this.totalCombosToday = 0;
      this.maxComboToday = 0;
      this.comboTimeline = []; // Resetar timeline
      // lifetimeMaxCombo persiste
      await this.saveState();
    }
  }

  /**
   * Envia heartbeat de combo para o daemon
   */
  async sendComboHeartbeat(eventType) {
    if (!this.queue || !this.buildHeartbeat) {
      console.warn('[Saul Combo] Queue or buildHeartbeat not available');
      return;
    }

    const config = this.getConfig();
    if (!config.enableTelemetry) {
      return;
    }

    const heartbeat = this.buildHeartbeat({
      entityType: 'combo',
      entity: eventType,
      category: 'telemetry',
      isWrite: false,
      metadata: {
        currentLevel: this.currentLevel,
        consecutivePomodoros: this.consecutivePomodoros,
        maxComboToday: this.maxComboToday,
        totalCombosToday: this.totalCombosToday,
        lifetimeMaxCombo: this.lifetimeMaxCombo,
        totalMinutes: this.consecutivePomodoros * 25,
        eventType,
        comboTimeline: this.comboTimeline.slice(-100) // Últimos 100 eventos
      }
    });

    this.queue.enqueue(heartbeat);
    console.log(`[Saul Combo] ✓ Heartbeat enqueued: ${eventType}`);
    console.log(`[Saul Combo] Heartbeat details:`, {
      entityType: 'combo',
      entity: eventType,
      level: this.currentLevel,
      streak: this.consecutivePomodoros,
      maxToday: this.maxComboToday,
      timelineEvents: this.comboTimeline.length
    });
  }

  /**
   * Reset manual do combo
   */
  async resetCombo() {
    this.consecutivePomodoros = 0;
    this.currentLevel = 0;
    this.lastPomodoroTime = null;
    this.breakStartTime = null;
    await this.saveState();
    await this.sendComboHeartbeat('combo_manual_reset');
    
    this.onComboChange({
      level: 0,
      pomodoros: 0,
      manualReset: true
    });
  }

  dispose() {
    // Cleanup if needed
  }
}

module.exports = { ComboTracker };
