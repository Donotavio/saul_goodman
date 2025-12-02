const INACTIVITY_PING_MS = 15000;
const CRITICAL_MESSAGE = 'sg:critical-state';
const SCORE_TOAST_MESSAGE = 'sg:score-toast';
const EARTHQUAKE_CLASS = 'sg-earthquake-active';
const OVERLAY_ID = 'sg-earthquake-overlay';
const STYLE_ID = 'sg-earthquake-style';
const CRITICAL_QUOTES = [
  'Nem eu consigo convencer o juiz com esse índice. Hora de fechar abas!',
  'Seu foco pediu habeas corpus. Feche as vilãs antes que eu cobre em dólar.',
  'Se continuar assim, mando outdoor avisando o seu chefe.',
  'O terremoto é real: finalize 3 abas procrastinatórias agora!'
];
const LOGO_URL = chrome.runtime.getURL('src/img/logotipo_saul_goodman.png');

declare const showTabToast: (mood: 'positive' | 'negative', message: string) => void;
type ScoreToastPayload = {
  mood: 'positive' | 'negative';
  message: string;
  score: number;
};

let lastEventTimestamp = Date.now();
let intervalId: number | null = null;
let listenersBound = false;
let overlayElement: HTMLDivElement | null = null;
let earthquakeActive = false;
const sirenPlayer =
  typeof CriticalSirenPlayer !== 'undefined' ? new CriticalSirenPlayer() : null;
let toastAudioContext: AudioContext | null = null;

const activityHandler = () => {
  lastEventTimestamp = Date.now();
  void sendPing();
};

function setupActivityTracking(): void {
  if (!listenersBound) {
    window.addEventListener('mousemove', activityHandler);
    window.addEventListener('mousedown', activityHandler);
    window.addEventListener('keydown', activityHandler);
    window.addEventListener('scroll', activityHandler, { passive: true });
    listenersBound = true;
  }

  intervalId = window.setInterval(() => {
    void sendPing();
  }, INACTIVITY_PING_MS);
}

function cleanup(): void {
  if (intervalId) {
    window.clearInterval(intervalId);
    intervalId = null;
  }

  if (listenersBound) {
    window.removeEventListener('mousemove', activityHandler);
    window.removeEventListener('mousedown', activityHandler);
    window.removeEventListener('keydown', activityHandler);
    window.removeEventListener('scroll', activityHandler);
    listenersBound = false;
  }
}

async function sendPing(): Promise<void> {
  try {
    if (!chrome?.runtime?.id) {
      cleanup();
      return;
    }

    chrome.runtime.sendMessage({
      type: 'activity-ping',
      payload: { timestamp: lastEventTimestamp }
    });
  } catch (error) {
    cleanup();
    let normalized = '';
    if (error instanceof Error && typeof error.message === 'string') {
      normalized = error.message.toLowerCase();
    } else if (typeof error === 'string') {
      normalized = error.toLowerCase();
    } else if (typeof error === 'object' && error && 'message' in error) {
      normalized = String((error as { message: string }).message).toLowerCase();
    }

    if (normalized.includes('extension context invalidated')) {
      console.debug('Saul Goodman: ping interrompido (contexto inválido).');
      return;
    }

    console.warn('Saul Goodman content ping falhou:', error);
  }
}

setupActivityTracking();
chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === CRITICAL_MESSAGE) {
    const payload = message.payload as { active: boolean; soundEnabled?: boolean } | undefined;
    if (payload?.active) {
      activateEarthquake(Boolean(payload.soundEnabled));
    } else {
      deactivateEarthquake();
    }
  } else if (message?.type === SCORE_TOAST_MESSAGE) {
    handleScoreToast(message.payload as ScoreToastPayload | undefined);
  }
});

function handleScoreToast(payload?: ScoreToastPayload): void {
  if (!payload || typeof showTabToast !== 'function') {
    return;
  }

  try {
    showTabToast(payload.mood, payload.message);
  } catch (error) {
    console.warn('Saul toast não pôde ser exibido na página:', error);
  }

  if (payload.mood === 'positive') {
    void playToastCelebrationSound();
  }
}

function activateEarthquake(shouldPlaySound: boolean): void {
  if (earthquakeActive) {
    updateOverlayMessage();
    if (shouldPlaySound && sirenPlayer) {
      void sirenPlayer.playBursts(4);
    }
    return;
  }
  earthquakeActive = true;
  injectStyles();
  document.documentElement.classList.add(EARTHQUAKE_CLASS);
  ensureOverlay();
  updateOverlayMessage();
  if (shouldPlaySound && sirenPlayer) {
    void sirenPlayer.playBursts(4);
  }
}

function deactivateEarthquake(): void {
  if (!earthquakeActive) {
    return;
  }
  earthquakeActive = false;
  document.documentElement.classList.remove(EARTHQUAKE_CLASS);
  const existingOverlay = document.getElementById(OVERLAY_ID);
  existingOverlay?.remove();
  overlayElement = null;
  sirenPlayer?.stop();
}

async function playToastCelebrationSound(): Promise<void> {
  if (typeof AudioContext === 'undefined') {
    return;
  }

  if (!toastAudioContext) {
    try {
      toastAudioContext = new AudioContext();
    } catch (error) {
      console.warn('Contexto de áudio indisponível para o toast:', error);
      return;
    }
  }

  if (toastAudioContext.state === 'suspended') {
    try {
      await toastAudioContext.resume();
    } catch (error) {
      console.warn('Não foi possível retomar o áudio do toast:', error);
      return;
    }
  }

  try {
    const oscillator = toastAudioContext.createOscillator();
    const gain = toastAudioContext.createGain();
    const now = toastAudioContext.currentTime;
    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(550, now);
    oscillator.frequency.exponentialRampToValueAtTime(880, now + 0.3);
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
    oscillator.connect(gain);
    gain.connect(toastAudioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.5);
  } catch (error) {
    console.warn('Falha ao tocar áudio do toast:', error);
  }
}

function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) {
    return;
  }
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    @keyframes sg-earthquake {
      0% { transform: translate(0, 0); }
      20% { transform: translate(-3px, 1px) rotate(-0.4deg); }
      40% { transform: translate(4px, -2px) rotate(0.4deg); }
      60% { transform: translate(-4px, 2px) rotate(-0.3deg); }
      80% { transform: translate(2px, -2px) rotate(0.3deg); }
      100% { transform: translate(0, 0); }
    }
    .${EARTHQUAKE_CLASS} {
      animation: sg-earthquake 0.6s linear infinite;
    }
    #${OVERLAY_ID} {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.35);
      z-index: 2147483647;
      display: flex;
      justify-content: center;
      align-items: center;
      pointer-events: none;
    }
    #${OVERLAY_ID} .sg-card {
      pointer-events: all;
      width: min(380px, 90%);
      background: #fffdf5;
      border: 3px solid #111;
      border-radius: 18px;
      padding: 20px;
      box-shadow: 6px 6px 0 #d7b247;
      text-align: center;
      font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
    #${OVERLAY_ID} .sg-card .sg-logo {
      width: 96px;
      height: auto;
      margin: 0 auto 12px;
      display: block;
    }
    #${OVERLAY_ID} .sg-card strong {
      display: block;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #7a0500;
      margin-bottom: 10px;
    }
    #${OVERLAY_ID} .sg-card p {
      margin: 0 0 12px;
      color: #2b1a11;
      font-weight: 600;
    }
    #${OVERLAY_ID} .sg-actions {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      justify-content: center;
    }
    #${OVERLAY_ID} .sg-actions button {
      border: 2px solid #111;
      border-radius: 999px;
      padding: 8px 16px;
      background: #ffe434;
      font-weight: 700;
      cursor: pointer;
    }
  `;
  document.head.appendChild(style);
}

function ensureOverlay(): void {
  if (overlayElement) {
    return;
  }
  overlayElement = document.createElement('div');
  overlayElement.id = OVERLAY_ID;
  const card = document.createElement('div');
  card.className = 'sg-card';
  const logo = document.createElement('img');
  logo.src = LOGO_URL;
  logo.alt = 'Logotipo Saul Goodman';
  logo.className = 'sg-logo';
  const title = document.createElement('strong');
  title.textContent = 'Saul em alerta máximo!';
  const paragraph = document.createElement('p');
  paragraph.id = 'sg-earthquake-message';
  paragraph.textContent = CRITICAL_QUOTES[0];
  const actionContainer = document.createElement('div');
  actionContainer.className = 'sg-actions';

  const popupButton = document.createElement('button');
  popupButton.textContent = 'Abrir popup';
  popupButton.addEventListener('click', () => {
    window.open(chrome.runtime.getURL('src/popup/popup.html'), '_blank', 'noopener');
  });

  const optionsButton = document.createElement('button');
  optionsButton.textContent = 'Revisar vilões';
  optionsButton.addEventListener('click', () => {
    window.open(chrome.runtime.getURL('src/options/options.html#vilains'), '_blank', 'noopener');
  });

  actionContainer.appendChild(popupButton);
  actionContainer.appendChild(optionsButton);

  card.appendChild(logo);
  card.appendChild(title);
  card.appendChild(paragraph);
  card.appendChild(actionContainer);
  overlayElement.appendChild(card);

  const mount = () => {
    document.body.appendChild(overlayElement as HTMLDivElement);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount, { once: true });
  } else {
    mount();
  }
}

function updateOverlayMessage(): void {
  const paragraph = document.getElementById('sg-earthquake-message');
  if (paragraph) {
    const message = CRITICAL_QUOTES[Math.floor(Math.random() * CRITICAL_QUOTES.length)];
    paragraph.textContent = message;
  }
}
