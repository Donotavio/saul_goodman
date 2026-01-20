type DomainMetadata = {
  hostname: string;
  title?: string;
  description?: string;
  keywords?: string[];
  ogType?: string;
  hasVideoPlayer: boolean;
  hasInfiniteScroll: boolean;
  hasAutoplayMedia?: boolean;
  hasFeedLayout?: boolean;
  hasFormFields?: boolean;
  hasRichEditor?: boolean;
  hasLargeTable?: boolean;
  hasShortsPattern?: boolean;
  schemaTypes?: string[];
  headings?: string[];
  pathTokens?: string[];
  language?: string;
  externalLinksCount?: number;
  scrollDepth?: number;
  interactionCount?: number;
  activeMs?: number;
};

type DomainSuggestion = {
  domain: string;
  classification: 'productive' | 'procrastination' | 'neutral';
  confidence: number;
  reasons: string[];
  learningTokens?: string[];
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

function decodeHtmlEntities(value: string): string {
  return value.replace(/&(?:quot|apos|amp|lt|gt);?|&#(?:\d+|x[0-9a-fA-F]+);?/g, (match) => {
    switch (match) {
      case '&quot;':
      case '&quot':
      case '&#34;':
      case '&#34':
      case '&#x22;':
      case '&#x22':
        return '"';
      case '&apos;':
      case '&apos':
      case '&#39;':
      case '&#39':
      case '&#x27;':
      case '&#x27':
        return "'";
      case '&amp;':
      case '&amp':
        return '&';
      case '&lt;':
      case '&lt':
        return '<';
      case '&gt;':
      case '&gt':
        return '>';
      default:
        if (match.startsWith('&#x')) {
          const raw = match.slice(3);
          const code = Number.parseInt(raw.endsWith(';') ? raw.slice(0, -1) : raw, 16);
          return Number.isFinite(code) ? String.fromCodePoint(code) : match;
        }
        if (match.startsWith('&#')) {
          const raw = match.slice(2);
          const code = Number.parseInt(raw.endsWith(';') ? raw.slice(0, -1) : raw, 10);
          return Number.isFinite(code) ? String.fromCodePoint(code) : match;
        }
        return match;
    }
  });
}

function translateSuggestionReason(reason: string, translator?: TranslatorFn | null): string {
  const translate = normalizeTranslator(translator);
  const normalizedReason = decodeHtmlEntities(reason);
  const knownHostMatch = normalizedReason.match(/^Host conhecido:\s*(.+)$/i);
  if (knownHostMatch) {
    const host = knownHostMatch[1];
    return translate('suggestion_reason_known_host', { host });
  }

  const keywordMatch = normalizedReason.match(/^Palavra-chave\s+"(.+)"\s+em\s+(.+)$/i);
  if (keywordMatch) {
    const keyword = keywordMatch[1];
    const source = resolveSourceLabel(keywordMatch[2], translate);
    return translate('suggestion_reason_keyword', { keyword, source });
  }

  const videoMatch = normalizedReason.match(/Player de v[íi]deo detectado/i);
  if (videoMatch) {
    return translate('suggestion_reason_video');
  }

  const scrollMatch = normalizedReason.match(/Scroll infinito detectado/i);
  if (scrollMatch) {
    return translate('suggestion_reason_infinite_scroll');
  }

  const ogMatch = normalizedReason.match(/^og:type\s*=\s*(.+)$/i);
  if (ogMatch) {
    return translate('suggestion_reason_og_type', { type: ogMatch[1] });
  }

  return normalizedReason;
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
const pageLoadedAt = Date.now();
let interactionCount = 0;
let maxScrollDepth = 0;
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
    const scrollable = Math.max(0, currentHeight - window.innerHeight);
    if (scrollable > 0) {
      const depth = Math.min(1, Math.max(0, window.scrollY / scrollable));
      maxScrollDepth = Math.max(maxScrollDepth, depth);
    }
  },
  { passive: true }
);

const activityHandler = () => {
  lastEventTimestamp = Date.now();
  interactionCount = Math.min(interactionCount + 1, 1000000);
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

  // Clear existing interval before creating new one (BUG-002)
  if (intervalId) {
    window.clearInterval(intervalId);
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

// BUG-001: Auto-cleanup on page unload
window.addEventListener('beforeunload', cleanup, { once: true });

// BUG-001: Periodic heartbeat to detect extension context invalidation
let heartbeatCheckId: number | null = null;

function heartbeatCheck(): void {
  if (!chrome?.runtime?.id) {
    cleanup();
    if (heartbeatCheckId) {
      window.clearInterval(heartbeatCheckId);
      heartbeatCheckId = null;
    }
  }
}

heartbeatCheckId = window.setInterval(heartbeatCheck, 5000);

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
  const hasAutoplayMedia = Boolean(document.querySelector('video[autoplay], audio[autoplay]'));
  const hasFeedLayout = detectFeedLayout();
  const hasFormFields = detectFormFields();
  const hasRichEditor = detectRichEditor();
  const hasLargeTable = detectLargeTable();
  const hasShortsPattern = detectShortsPattern();
  const schemaTypes = Array.from(
    new Set(
      Array.from(document.querySelectorAll('[itemtype]'))
        .map((el) => el.getAttribute('itemtype') || '')
        .map((value) => value.trim())
        .filter(Boolean)
    )
  );
  const headings = collectHeadings();
  const pathTokens = collectPathTokens();
  const language = (document.documentElement.lang || '').trim() || undefined;
  const externalLinksCount = countExternalLinks();
  const scrollDepth = maxScrollDepth;
  const interactionCountSnapshot = interactionCount;
  const activeMs = Math.max(0, Date.now() - pageLoadedAt);

  return {
    hostname: window.location.hostname,
    title,
    description: description || undefined,
    keywords,
    ogType: ogType || undefined,
    hasVideoPlayer,
    hasInfiniteScroll,
    hasAutoplayMedia,
    hasFeedLayout,
    hasFormFields,
    hasRichEditor,
    hasLargeTable,
    hasShortsPattern,
    schemaTypes,
    headings,
    pathTokens,
    language,
    externalLinksCount,
    scrollDepth,
    interactionCount: interactionCountSnapshot,
    activeMs
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

function detectFeedLayout(): boolean {
  return Boolean(
    document.querySelector(
      '[role=\"feed\"], [data-testid*=\"feed\"], .feed, .timeline, ytd-rich-grid-renderer, ytd-reel-shelf-renderer, div[aria-label*=\"feed\" i], div[aria-label*=\"timeline\" i]'
    )
  );
}

function detectFormFields(): boolean {
  const inputs = document.querySelectorAll('input, textarea, select');
  return inputs.length >= 3;
}

function detectRichEditor(): boolean {
  return Boolean(
    document.querySelector(
      '[contenteditable=\"true\"], .monaco-editor, .CodeMirror, .ace_editor, [data-editor], [role=\"textbox\"][aria-multiline=\"true\"]'
    )
  );
}

function detectLargeTable(): boolean {
  const table = document.querySelector('table');
  if (!table) return false;
  const rows = table.querySelectorAll('tr');
  return rows.length >= 30;
}

function detectShortsPattern(): boolean {
  const path = window.location.pathname.toLowerCase();
  if (path.includes('/shorts') || path.includes('/stories') || path.includes('/reels')) {
    return true;
  }
  return Boolean(
    document.querySelector('[data-testid*=\"short\" i], [data-testid*=\"story\" i], ytd-reel-video-renderer, ytd-reel-shelf-renderer')
  );
}

function collectHeadings(): string[] {
  const MAX = 5;
  const headings = Array.from(document.querySelectorAll('h1, h2, h3'))
    .map((el) => el.textContent || '')
    .map((text) => text.trim())
    .filter(Boolean)
    .slice(0, MAX);
  return headings;
}

function collectPathTokens(): string[] {
  const path = window.location.pathname || '';
  return path
    .split('/')
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part.length >= 3 && part.length <= 40);
}

function countExternalLinks(): number {
  const anchors = Array.from(document.querySelectorAll('a[href]')).slice(0, 200);
  const host = window.location.hostname;
  let count = 0;
  anchors.forEach((anchor) => {
    const href = anchor.getAttribute('href')?.trim();
    if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:')) {
      return;
    }
    try {
      const url = new URL(href, window.location.href);
      if (url.hostname && url.hostname !== host) {
        count += 1;
      }
    } catch {
      return;
    }
  });
  return count;
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

  const card = document.createElement('div');
  card.className = 'sg-toast-card';

  const header = document.createElement('div');
  header.className = 'sg-toast-header';
  const headerTitle = document.createElement('strong');
  headerTitle.textContent = title;
  const confidenceBadge = document.createElement('span');
  confidenceBadge.className = 'sg-toast-confidence';
  confidenceBadge.textContent = confidenceText;
  header.appendChild(headerTitle);
  header.appendChild(confidenceBadge);

  const body = document.createElement('div');
  body.className = 'sg-toast-body';

  if (suggestionToastImage) {
    const avatar = document.createElement('img');
    avatar.src = suggestionToastImage;
    avatar.alt = 'Saul Goodman';
    avatar.className = 'sg-toast-avatar';
    body.appendChild(avatar);
  }

  const content = document.createElement('div');
  content.className = 'sg-toast-content';

  const titleRow = document.createElement('p');
  titleRow.className = 'sg-toast-title';
  const chip = document.createElement('span');
  chip.className = `sg-toast-chip ${suggestion.classification}`;
  chip.textContent = labelText;
  const domainEl = document.createElement('span');
  domainEl.className = 'sg-toast-domain';
  domainEl.textContent = suggestion.domain;
  const seemsEl = document.createElement('span');
  seemsEl.textContent = ` ${seemsText}`;
  titleRow.appendChild(chip);
  titleRow.appendChild(domainEl);
  titleRow.appendChild(seemsEl);

  const reasonsList = document.createElement('ul');
  reasonsList.className = 'sg-toast-reasons';
  suggestion.reasons.slice(0, 3).forEach((reason) => {
    const li = document.createElement('li');
    li.textContent = translateSuggestionReason(reason, translate);
    reasonsList.appendChild(li);
  });

  const actions = document.createElement('div');
  actions.className = 'sg-toast-actions';
  actions.setAttribute('role', 'group');
  actions.setAttribute('aria-label', translate('popup_suggestion_title'));

  const productiveBtn = document.createElement('button');
  productiveBtn.className = `sg-toast-action ${productivePrimary ? 'primary' : ''}`;
  productiveBtn.dataset.target = 'productive';
  productiveBtn.textContent = addProductive;

  const procrastinationBtn = document.createElement('button');
  procrastinationBtn.className = `sg-toast-action ${procrastinationPrimary ? 'primary' : ''}`;
  procrastinationBtn.dataset.target = 'procrastination';
  procrastinationBtn.textContent = addProcrastination;

  actions.appendChild(productiveBtn);
  actions.appendChild(procrastinationBtn);

  content.appendChild(titleRow);
  content.appendChild(reasonsList);
  content.appendChild(actions);
  body.appendChild(content);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'sg-toast-close';
  closeBtn.setAttribute('aria-label', translate('suggestion_toast_close'));
  closeBtn.textContent = '×';

  card.appendChild(header);
  card.appendChild(body);
  card.appendChild(closeBtn);
  container.appendChild(card);

  closeBtn.addEventListener('click', () => {
    container.remove();
    suggestionToastEl = null;
    if (suggestionToastTimer) {
      window.clearTimeout(suggestionToastTimer);
      suggestionToastTimer = null;
    }
  });

  [productiveBtn, procrastinationBtn].forEach((button) => {
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
    .${EARTHQUAKE_CLASS} body > *:not(#${OVERLAY_ID}) {
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
    chrome.runtime.sendMessage({
      type: 'open-extension-page',
      payload: { path: 'src/popup/popup.html' }
    });
  });

  const optionsButton = document.createElement('button');
  optionsButton.textContent = chrome.i18n.getMessage('earthquake_review_villains') ?? 'Revisar vilões';
  optionsButton.addEventListener('click', () => {
    chrome.runtime.sendMessage({
      type: 'open-extension-page',
      payload: { path: 'src/options/options.html#vilains' }
    });
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
