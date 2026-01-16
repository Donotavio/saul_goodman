const vscode = require('vscode');
const path = require('path');

/**
 * ComboToast - Sistema de notificação visual não intrusivo
 * Exibe toasts animados quando o combo aumenta/diminui
 */
class ComboToast {
  constructor(options) {
    this.context = options.context;
    this.localize = options.localize;
    this.panel = null;
    this.isVisible = false;
    this.currentTimeout = null;
  }

  /**
   * Exibe toast de combo level up
   */
  show(comboData) {
    const { level, pomodoros, leveledUp, isUltra, totalMinutes, comboReset, comboReduced } = comboData;

    // Determinar tipo de mensagem
    let message, title, color, duration, emoji;
    
    if (comboReset) {
      title = this.localize('combo_breaker_long');
      message = this.localize('combo_reduced');
      color = '#6B7280';
      duration = 4000;
      emoji = '⚠️';
    } else if (comboReduced) {
      title = this.localize('combo_breaker_medium');
      message = this.localize('combo_reduced');
      color = '#F59E0B';
      duration = 3500;
      emoji = '🔄';
    } else if (leveledUp) {
      // Selecionar mensagem aleatória baseada no nível
      const messageKey = this.selectRandomMessage(level);
      message = this.localize(messageKey);
      title = this.getComboTitle(level, pomodoros);
      color = this.getComboColor(level);
      duration = this.getDisplayDuration(level);
      emoji = this.getComboEmoji(level);
    } else {
      // Pomodoro completado mas mesmo nível
      return;
    }

    // Criar webview panel se não existir
    if (!this.panel) {
      this.createPanel();
    }

    // Atualizar conteúdo do toast
    this.updateToastContent({
      title,
      message,
      color,
      emoji,
      level,
      pomodoros,
      totalMinutes,
      isUltra
    });

    // Auto-hide após duração
    if (this.currentTimeout) {
      clearTimeout(this.currentTimeout);
    }
    
    this.currentTimeout = setTimeout(() => {
      this.hide();
    }, duration);
  }

  /**
   * Cria o webview panel
   */
  createPanel() {
    this.panel = vscode.window.createWebviewPanel(
      'saulComboToast',
      'Combo',
      { viewColumn: vscode.ViewColumn.Active, preserveFocus: true },
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.file(path.join(this.context.extensionPath, 'src', 'ui'))
        ]
      }
    );

    // Ocultar quando fechado
    this.panel.onDidDispose(() => {
      this.panel = null;
      this.isVisible = false;
    });

    // CSS URI
    const cssUri = this.panel.webview.asWebviewUri(
      vscode.Uri.file(path.join(this.context.extensionPath, 'src', 'ui', 'combo-toast.css'))
    );

    // HTML base
    this.panel.webview.html = this.getWebviewContent(cssUri);
  }

  /**
   * Atualiza o conteúdo do toast
   */
  updateToastContent(data) {
    if (!this.panel) return;

    const { title, message, color, emoji, level, pomodoros, totalMinutes, isUltra } = data;

    // Enviar mensagem para o webview atualizar
    this.panel.webview.postMessage({
      command: 'showToast',
      data: {
        title,
        message,
        color,
        emoji,
        level,
        pomodoros,
        totalMinutes,
        isUltra
      }
    });

    // Revelar panel (mas sem dar foco)
    this.panel.reveal(vscode.ViewColumn.Active, true);
    this.isVisible = true;
  }

  /**
   * Oculta o toast
   */
  hide() {
    if (this.panel) {
      this.panel.webview.postMessage({ command: 'hideToast' });
    }
    this.isVisible = false;
  }

  /**
   * Seleciona mensagem aleatória baseada no nível
   */
  selectRandomMessage(level) {
    const messagesCount = {
      1: 3,
      2: 3,
      3: 3,
      4: 3,
      5: 4
    };

    const count = messagesCount[level] || 3;
    const random = Math.floor(Math.random() * count) + 1;
    return `combo_msg_${level}_${random}`;
  }

  /**
   * Retorna título do combo
   */
  getComboTitle(level, pomodoros) {
    const levelNames = [
      'combo_none',
      'combo_opening_statement',
      'combo_building_case',
      'combo_objection',
      'combo_closing',
      'combo_ultra'
    ];

    const levelName = this.localize(levelNames[Math.min(level, 5)]);
    return `${pomodoros}x ${levelName}`;
  }

  /**
   * Retorna cor baseada no nível
   */
  getComboColor(level) {
    const colors = {
      0: '#6B7280',
      1: '#FFC857',
      2: '#F59E0B',
      3: '#EF4444',
      4: '#A855F7',
      5: '#FFD700'
    };
    return colors[Math.min(level, 5)] || colors[0];
  }

  /**
   * Retorna emoji baseado no nível
   */
  getComboEmoji(level) {
    const emojis = {
      0: '🎯',
      1: '🎯',
      2: '🔥',
      3: '⚡',
      4: '💥',
      5: '💎'
    };
    return emojis[Math.min(level, 5)] || emojis[0];
  }

  /**
   * Retorna duração de exibição baseada no nível
   */
  getDisplayDuration(level) {
    const durations = {
      1: 3000,
      2: 3500,
      3: 4000,
      4: 4500,
      5: 5000
    };
    return durations[level] || 3000;
  }

  /**
   * HTML do webview
   */
  getWebviewContent(cssUri) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${cssUri}">
  <title>Combo Toast</title>
</head>
<body>
  <div id="toast-container" class="toast-container">
    <div id="toast" class="toast hidden">
      <div class="toast-header">
        <span class="toast-emoji" id="toast-emoji">🎯</span>
        <span class="toast-title" id="toast-title">Combo Title</span>
      </div>
      <div class="toast-body">
        <div class="toast-progress">
          <div class="toast-progress-bar" id="toast-progress-bar"></div>
        </div>
        <p class="toast-message" id="toast-message">Message here</p>
        <div class="toast-stats">
          <span id="toast-minutes">0 min</span>
        </div>
      </div>
    </div>
  </div>

  <script>
    (function() {
      const vscode = acquireVsCodeApi();
      
      const toast = document.getElementById('toast');
      const toastEmoji = document.getElementById('toast-emoji');
      const toastTitle = document.getElementById('toast-title');
      const toastMessage = document.getElementById('toast-message');
      const toastMinutes = document.getElementById('toast-minutes');
      const progressBar = document.getElementById('toast-progress-bar');

      window.addEventListener('message', event => {
        const { command, data } = event.data;

        if (command === 'showToast') {
          showToast(data);
        } else if (command === 'hideToast') {
          hideToast();
        }
      });

      function showToast(data) {
        const { title, message, color, emoji, level, totalMinutes, isUltra } = data;

        // Atualizar conteúdo
        toastEmoji.textContent = emoji;
        toastTitle.textContent = title;
        toastMessage.textContent = message;
        toastMinutes.textContent = totalMinutes + ' min';

        // Atualizar cor
        toast.style.setProperty('--combo-color', color);
        
        // Atualizar barra de progresso (20% por pomodoro)
        const progress = Math.min(level * 20, 100);
        progressBar.style.width = progress + '%';

        // Adicionar classe ultra para animação especial
        if (isUltra) {
          toast.classList.add('toast-ultra');
        } else {
          toast.classList.remove('toast-ultra');
        }

        // Mostrar com animação
        toast.classList.remove('hidden');
        toast.classList.add('show');
      }

      function hideToast() {
        toast.classList.remove('show');
        setTimeout(() => {
          toast.classList.add('hidden');
        }, 300);
      }
    })();
  </script>
</body>
</html>`;
  }

  dispose() {
    if (this.currentTimeout) {
      clearTimeout(this.currentTimeout);
    }
    if (this.panel) {
      this.panel.dispose();
    }
  }
}

module.exports = { ComboToast };
