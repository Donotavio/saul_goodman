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
   * Exibe notificação APENAS em level ups importantes
   * Status bar sempre mostra o combo atual de forma rica
   */
  show(comboData) {
    const { level, pomodoros, leveledUp, isUltra, totalMinutes, comboReset, comboReduced } = comboData;

    // Notificar apenas em eventos importantes (level ups, breaks)
    let shouldNotify = false;
    let message, title, emoji, color, duration;
    
    if (comboReset) {
      shouldNotify = true;
      title = this.localize('combo_breaker_long');
      message = this.localize('combo_reduced');
      color = '#6B7280';
      duration = 4000;
      emoji = '⚠️';
    } else if (comboReduced) {
      shouldNotify = true;
      title = this.localize('combo_breaker_medium');
      message = this.localize('combo_reduced');
      color = '#F59E0B';
      duration = 3500;
      emoji = '🔄';
    } else if (leveledUp && level > 0) {
      // APENAS em level ups, não em todo pomodoro
      shouldNotify = true;
      const messageKey = this.selectRandomMessage(level);
      message = this.localize(messageKey);
      title = this.getComboTitle(level, pomodoros);
      color = this.getComboColor(level);
      duration = this.getDisplayDuration(level);
      emoji = this.getComboEmoji(level);
    }

    // Notificação nativa apenas quando importante
    if (shouldNotify) {
      const minUnit = this.localize('report_vscode_combo_notification_min') || 'min';
      const fullMessage = `${emoji} ${title} • ${message} (${totalMinutes || pomodoros * 25} ${minUnit})`;
      vscode.window.showInformationMessage(fullMessage);
    }
    
    // Status bar sempre atualiza (implementado em extension.js)
  }

  /**
   * Método legado - mantido para compatibilidade (não usado mais)
   */
  createPanel() {
    this.panel = vscode.window.createWebviewPanel(
      'saulComboToast',
      '🎯 Combo',
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
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
        isUltra,
        minSuffix: this.localize('report_vscode_combo_notification_min') || 'min'
      }
    });

    // Revelar panel ao lado (mas sem dar foco)
    this.panel.reveal(vscode.ViewColumn.Beside, true);
    this.isVisible = true;
  }

  /**
   * Oculta o toast (método legado - não usado mais)
   */
  hide() {
    if (this.panel) {
      this.panel.webview.postMessage({ command: 'hideToast' });
    }
    this.isVisible = false;
  }

  /**
   * Dispose - limpar recursos
   */
  dispose() {
    if (this.panel) {
      this.panel.dispose();
      this.panel = null;
    }
    if (this.currentTimeout) {
      clearTimeout(this.currentTimeout);
      this.currentTimeout = null;
    }
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
          <span id="toast-minutes">--</span>
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
        const { title, message, color, emoji, level, totalMinutes, isUltra, minSuffix } = data;

        // Atualizar conteúdo
        toastEmoji.textContent = emoji;
        toastTitle.textContent = title;
        toastMessage.textContent = message;
        toastMinutes.textContent = totalMinutes + ' ' + (minSuffix || 'min');

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

}

module.exports = { ComboToast };
