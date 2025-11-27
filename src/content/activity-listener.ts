const INACTIVITY_PING_MS = 15000;

let lastEventTimestamp = Date.now();
let intervalId: number | null = null;
let listenersBound = false;

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
    const message =
      error instanceof Error ? error.message : typeof error === 'string' ? error : undefined;
    if (message && message.toLowerCase().includes('extension context invalidated')) {
      console.debug('Saul Goodman: ping interrompido (contexto inválido).');
      return;
    }

    console.warn('Saul Goodman content ping falhou:', error);
  }
}

setupActivityTracking();
