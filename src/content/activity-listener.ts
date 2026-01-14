type DomainMetadata = {
  hostname: string;
  title?: string;
  description?: string;
  keywords?: string[];
  ogType?: string;
  hasVideoPlayer: boolean;
  hasInfiniteScroll: boolean;
};

type DomainSuggestion = {
  domain: string;
  classification: 'productive' | 'procrastination' | 'neutral';
  confidence: number;
  reasons: string[];
  timestamp: number;
};

type TranslatorFn = (key: string, substitutions?: Record<string, string | number>) => string;

function normalizeTranslator(source?: TranslatorFn | null): TranslatorFn {
  if (!source) {
    return (key, substitutions) => {
      if (!substitutions) {
        return key;
      }
      return Object.entries(substitutions).reduce((acc, [token, value]) => {
        return acc.replace(new RegExp(`\\{${token}\\}`, 'g'), String(value));
      }, key);
    };
  }
  return source;
}

function resolveSourceLabel(raw: string, translate: TranslatorFn): string {
  const normalized = raw.trim().toLowerCase();
  const mapping: Record<string, string> = {
    hostname: 'suggestion_reason_source_hostname',
    dominio: 'suggestion_reason_source_hostname',
    domain: 'suggestion_reason_source_hostname',
    domínio: 'suggestion_reason_source_hostname',
    titulo: 'suggestion_reason_source_title',
    título: 'suggestion_reason_source_title',
    title: 'suggestion_reason_source_title',
    descricao: 'suggestion_reason_source_description',
    descrição: 'suggestion_reason_source_description',
    description: 'suggestion_reason_source_description',
    keywords: 'suggestion_reason_source_keywords'
  };

  const key = mapping[normalized];
  return key ? translate(key) : raw;
}

function translateSuggestionReason(reason: string, translator?: TranslatorFn | null): string {
  const translate = normalizeTranslator(translator);
  const knownHostMatch = reason.match(/^Host conhecido:\s*(.+)$/i);
  if (knownHostMatch) {
    const host = knownHostMatch[1];
    return translate('suggestion_reason_known_host', { host });
  }

  const keywordMatch = reason.match(/^Palavra-chave\s+"(.+)"\s+em\s+(.+)$/i);
  if (keywordMatch) {
    const keyword = keywordMatch[1];
    const source = resolveSourceLabel(keywordMatch[2], translate);
    return translate('suggestion_reason_keyword', { keyword, source });
  }

  const videoMatch = reason.match(/Player de v[íi]deo detectado/i);
  if (videoMatch) {
    return translate('suggestion_reason_video');
  }

  const scrollMatch = reason.match(/Scroll infinito detectado/i);
  if (scrollMatch) {
    return translate('suggestion_reason_infinite_scroll');
  }

  const ogMatch = reason.match(/^og:type\s*=\s*(.+)$/i);
  if (ogMatch) {
    return translate('suggestion_reason_og_type', { type: ogMatch[1] });
  }

  return reason;
}

const INACTIVITY_PING_MS = 15000;
const CRITICAL_MESSAGE = 'sg:critical-state';
const METADATA_REQUEST_MESSAGE = 'sg:collect-domain-metadata';
const SUGGESTION_TOAST_MESSAGE = 'sg:auto-classification-toast';
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

let lastEventTimestamp = Date.now();
let intervalId: number | null = null;
let listenersBound = false;
let overlayElement: HTMLDivElement | null = null;
let earthquakeActive = false;
let infiniteScrollDetected = false;
let lastScrollHeight = document.documentElement.scrollHeight;
let suggestionToastEl: HTMLDivElement | null = null;
let suggestionToastTimer: number | null = null;
const suggestionToastImage = typeof chrome !== 'undefined' && chrome.runtime?.getURL
  ? chrome.runtime.getURL('src/img/saul_nao_corte.png')
  : '';
const sirenPlayer =
  typeof CriticalSirenPlayer !== 'undefined' ? new CriticalSirenPlayer() : null;
const translate = (
  key: string,
  substitutions?: Record<string, string | number>
): string => {
  const template = (chrome?.i18n?.getMessage ? chrome.i18n.getMessage(key) : key) || key;
  if (!substitutions) {
    return template;
  }
  return Object.entries(substitutions).reduce((acc, [token, value]) => {
    return acc.replace(new RegExp(`\\{${token}\\}`, 'g'), String(value));
  }, template);
};

window.addEventListener(
  'scroll',
  () => {
    const currentHeight = document.documentElement.scrollHeight;
    if (currentHeight - lastScrollHeight > window.innerHeight * 0.2) {
      infiniteScrollDetected = true;
    }
    if (currentHeight > lastScrollHeight) {
      lastScrollHeight = currentHeight;
    }
  },
  { passive: true }
);

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
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === CRITICAL_MESSAGE) {
    const payload = message.payload as { active: boolean; soundEnabled?: boolean } | undefined;
    if (payload?.active) {
      activateEarthquake(Boolean(payload.soundEnabled));
    } else {
      deactivateEarthquake();
    }
  }

  if (message?.type === METADATA_REQUEST_MESSAGE) {
    sendResponse(collectPageMetadata());
  }

  if (message?.type === SUGGESTION_TOAST_MESSAGE) {
    const suggestion = (message.payload as { suggestion?: DomainSuggestion } | undefined)
      ?.suggestion;
    if (suggestion) {
      showSuggestionToast(suggestion);
    }
  }
});

function collectPageMetadata(): DomainMetadata {
  const title = document.title || undefined;
  const description = getMetaContent('meta[name=\"description\"]');
  const keywordsContent = getMetaContent('meta[name=\"keywords\"]');
  const keywords = keywordsContent
    ? keywordsContent
        .split(',')
        .map((kw) => kw.trim())
        .filter(Boolean)
    : [];
  const ogType = getMetaContent('meta[property=\"og:type\"]');
  const hasVideoPlayer = Boolean(
    document.querySelector('video, [role=\"video\"], video-player, .video-player, [data-testid*=\"video\"]')
  );
  const hasInfiniteScroll = detectInfiniteScroll();

  return {
    hostname: window.location.hostname,
    title,
    description: description || undefined,
    keywords,
    ogType: ogType || undefined,
    hasVideoPlayer,
    hasInfiniteScroll
  };
}

function getMetaContent(selector: string): string {
  const element = document.querySelector(selector);
  if (!element) {
    return '';
  }
  const content = element.getAttribute('content');
  return content ?? '';
}

function detectInfiniteScroll(): boolean {
  const doc = document.documentElement;
  const viewport = window.innerHeight || doc.clientHeight || 0;
  const longPage = doc.scrollHeight > viewport * 3;
  const pagination = document.querySelector('a[rel=\"next\"], nav[aria-label*=\"pag\"], [data-testid*=\"pagination\"]');
  if (pagination) {
    return false;
  }
  return infiniteScrollDetected || longPage;
}

function showSuggestionToast(suggestion: DomainSuggestion): void {
  ensureSuggestionToastStyles();

  if (suggestionToastTimer) {
    window.clearTimeout(suggestionToastTimer);
    suggestionToastTimer = null;
  }
  if (suggestionToastEl) {
    suggestionToastEl.remove();
    suggestionToastEl = null;
  }

  const labels: Record<DomainSuggestion['classification'], string> = {
    productive: translate('popup_suggestion_label_productive'),
    procrastination: translate('popup_suggestion_label_procrastination'),
    neutral: translate('popup_suggestion_label_neutral')
  };
  const labelText = labels[suggestion.classification];

  const title = translate('popup_suggestion_title');
  const confidenceText = translate('popup_suggestion_confidence_filled', {
    confidence: Math.round(suggestion.confidence)
  });
  const seemsText = translate('popup_suggestion_title_filled', {
    label: labels[suggestion.classification]
  });
  const addProductive = translate('popup_suggestion_add_productive');
  const addProcrastination = translate('popup_suggestion_add_procrastination');
  const productivePrimary = suggestion.classification === 'productive';
  const procrastinationPrimary = suggestion.classification === 'procrastination';

  const container = document.createElement('div');
  container.id = 'sg-auto-classification-toast';
  container.setAttribute('role', 'status');
  container.setAttribute('aria-live', 'polite');
  container.innerHTML = `
    <div class="sg-toast-card">
      <div class="sg-toast-header">
        <strong>${title}</strong>
        <span class="sg-toast-confidence">${confidenceText}</span>
      </div>
      <div class="sg-toast-body">
        ${
          suggestionToastImage
            ? `<img src="${suggestionToastImage}" alt="Saul Goodman" class="sg-toast-avatar" />`
            : ''
        }
        <div class="sg-toast-content">
          <p class="sg-toast-title">
            <span class="sg-toast-chip ${suggestion.classification}">${labelText}</span>
            <span class="sg-toast-domain">${suggestion.domain}</span> ${seemsText}
          </p>
          <ul class="sg-toast-reasons">
            ${suggestion.reasons
              .slice(0, 3)
              .map((reason) => `<li>${translateSuggestionReason(reason, translate)}</li>`)
              .join('')}
          </ul>
          <div class="sg-toast-actions" role="group" aria-label="${translate(
            'popup_suggestion_title'
          )}">
            <button class="sg-toast-action ${productivePrimary ? 'primary' : ''}" data-target="productive">
              ${addProductive}
            </button>
            <button class="sg-toast-action ${procrastinationPrimary ? 'primary' : ''}" data-target="procrastination">
              ${addProcrastination}
            </button>
          </div>
        </div>
      </div>
      <button class="sg-toast-close" aria-label="${translate(
        'suggestion_toast_close'
      )}">×</button>
    </div>
  `;

  const closeButton = container.querySelector('.sg-toast-close');
  closeButton?.addEventListener('click', () => {
    container.remove();
    suggestionToastEl = null;
    if (suggestionToastTimer) {
      window.clearTimeout(suggestionToastTimer);
      suggestionToastTimer = null;
    }
  });

  const actionButtons = container.querySelectorAll<HTMLButtonElement>('.sg-toast-action');
  actionButtons.forEach((button) => {
    const target = button.dataset.target;
    if (target === 'productive' || target === 'procrastination') {
      button.addEventListener('click', () => {
        chrome.runtime.sendMessage({
          type: 'apply-suggestion',
          payload: { domain: suggestion.domain, classification: target }
        });
        container.remove();
        suggestionToastEl = null;
        if (suggestionToastTimer) {
          window.clearTimeout(suggestionToastTimer);
          suggestionToastTimer = null;
        }
      });
    }
  });

  document.body.appendChild(container);
  suggestionToastEl = container;
  suggestionToastTimer = window.setTimeout(() => {
    container.remove();
    suggestionToastEl = null;
    suggestionToastTimer = null;
  }, 8000);
}

function ensureSuggestionToastStyles(): void {
  const STYLE_ID_TOAST = 'sg-auto-classification-toast-style';
  if (document.getElementById(STYLE_ID_TOAST)) {
    return;
  }
  const style = document.createElement('style');
  style.id = STYLE_ID_TOAST;
  style.textContent = `
    #sg-auto-classification-toast {
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 2147483646;
      font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      color: #111;
    }

    #sg-auto-classification-toast .sg-toast-card {
      position: relative;
      min-width: 260px;
      max-width: min(420px, 90vw);
      background: linear-gradient(135deg, #fff6d9, #ffd6a5);
      border: 3px solid #111;
      border-radius: 14px;
      box-shadow: 8px 10px 0 #111;
      padding: 14px 16px 16px;
      animation: sg-toast-pop 220ms ease-out;
    }

    #sg-auto-classification-toast .sg-toast-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 6px;
    }

    #sg-auto-classification-toast .sg-toast-confidence {
      background: #fff3d9;
      border: 1px solid #c7a86c;
      border-radius: 999px;
      padding: 4px 10px;
      font-size: 0.8rem;
      font-weight: 700;
      animation: sg-toast-badge 1.6s ease-in-out infinite;
    }

    #sg-auto-classification-toast .sg-toast-title {
      margin: 0 0 6px;
      font-weight: 800;
      letter-spacing: 0.01em;
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
    }

    #sg-auto-classification-toast .sg-toast-body {
      display: flex;
      gap: 10px;
      align-items: flex-start;
    }

    #sg-auto-classification-toast .sg-toast-avatar {
      width: 64px;
      height: 64px;
      border-radius: 12px;
      object-fit: cover;
      box-shadow: 5px 5px 0 #111;
      flex-shrink: 0;
      border: 2px solid #111;
      transform: rotate(-2deg);
    }

    #sg-auto-classification-toast .sg-toast-content {
      flex: 1;
      min-width: 0;
    }

    #sg-auto-classification-toast .sg-toast-reasons {
      margin: 0 0 10px 16px;
      padding: 0;
      color: #333;
      line-height: 1.4;
      list-style: disc;
    }

    #sg-auto-classification-toast .sg-toast-reasons li {
      margin-bottom: 4px;
    }

    #sg-auto-classification-toast .sg-toast-chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      border-radius: 10px;
      border: 2px solid #111;
      box-shadow: 3px 3px 0 #111;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    #sg-auto-classification-toast .sg-toast-chip.productive {
      background: #32c36b;
      color: #0b1b10;
      transform: rotate(-2deg);
    }

    #sg-auto-classification-toast .sg-toast-chip.procrastination {
      position: relative;
      background: #d62828;
      color: #fff9f5;
      transform: rotate(-4deg);
      overflow: hidden;
    }

    #sg-auto-classification-toast .sg-toast-chip.procrastination::after {
      content: '';
      position: absolute;
      inset: -10%;
      background: linear-gradient( -8deg, transparent 30%, #8c0c0c 45%, transparent 60% );
      pointer-events: none;
    }

    #sg-auto-classification-toast .sg-toast-chip.neutral {
      background: #ececec;
      color: #222;
      transform: rotate(-1deg);
    }

    #sg-auto-classification-toast .sg-toast-domain {
      font-weight: 700;
      background: #111;
      color: #fffdf5;
      padding: 4px 10px;
      border-radius: 999px;
      box-shadow: 2px 2px 0 #111;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    #sg-auto-classification-toast .sg-toast-close {
      position: absolute;
      top: 6px;
      right: 8px;
      border: none;
      background: transparent;
      font-size: 1.2rem;
      cursor: pointer;
      color: #444;
      padding: 2px 6px;
    }

    #sg-auto-classification-toast .sg-toast-close:hover {
      color: #000;
    }

    #sg-auto-classification-toast .sg-toast-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 6px;
    }

    #sg-auto-classification-toast .sg-toast-action {
      border: 2px solid #111;
      border-radius: 999px;
      padding: 8px 12px;
      background: #fffef6;
      font-weight: 700;
      cursor: pointer;
      box-shadow: 3px 3px 0 #111;
      transition: transform 80ms ease, box-shadow 80ms ease, background 80ms ease, color 80ms ease;
    }

    #sg-auto-classification-toast .sg-toast-action.primary {
      background: #111;
      color: #fff;
      box-shadow: 4px 4px 0 #ffd166;
    }

    #sg-auto-classification-toast .sg-toast-action:hover {
      transform: translateY(-1px);
      box-shadow: 5px 5px 0 #111;
    }

    #sg-auto-classification-toast .sg-toast-action.primary:hover {
      box-shadow: 6px 6px 0 #ffd166;
    }

    @keyframes sg-toast-pop {
      0% { opacity: 0; transform: translateY(6px) scale(0.96); }
      70% { opacity: 1; transform: translateY(-2px) scale(1.02); }
      100% { opacity: 1; transform: translateY(0) scale(1); }
    }

    @keyframes sg-toast-badge {
      0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(199, 168, 108, 0.6); }
      60% { transform: scale(1.06); box-shadow: 0 0 0 6px rgba(199, 168, 108, 0); }
      100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(199, 168, 108, 0); }
    }
  `;
  document.head.appendChild(style);
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
  title.textContent = chrome.i18n.getMessage('earthquake_title') ?? 'Saul em alerta máximo!';
  const paragraph = document.createElement('p');
  paragraph.id = 'sg-earthquake-message';
  paragraph.textContent = CRITICAL_QUOTES[0];
  const actionContainer = document.createElement('div');
  actionContainer.className = 'sg-actions';

  const popupButton = document.createElement('button');
  popupButton.textContent = chrome.i18n.getMessage('earthquake_open_popup') ?? 'Abrir popup';
  popupButton.addEventListener('click', () => {
    window.open(chrome.runtime.getURL('src/popup/popup.html'), '_blank', 'noopener');
  });

  const optionsButton = document.createElement('button');
  optionsButton.textContent = chrome.i18n.getMessage('earthquake_review_villains') ?? 'Revisar vilões';
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
