(function () {
  const TOAST_ID = 'sg-tab-toast';
  const STYLE_ID = 'sg-tab-toast-style';
  let hideTimeout = null;

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) {
      return;
    }
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${TOAST_ID} {
        position: fixed;
        right: 24px;
        bottom: 24px;
        display: flex;
        gap: 10px;
        padding: 10px 14px;
        border-radius: 16px;
        border: 2px solid #111;
        background: #fffdf5;
        box-shadow: 4px 4px 0 rgba(0,0,0,0.2);
        align-items: center;
        opacity: 0;
        transform: translateY(80px);
        transition: opacity 0.3s ease, transform 0.3s ease;
        z-index: 2147483647;
        font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        pointer-events: none;
      }
      #${TOAST_ID}.visible {
        opacity: 1;
        transform: translateY(0);
      }
      #${TOAST_ID} img {
        width: 64px;
        border-radius: 8px;
        border: 2px solid #111;
      }
      #${TOAST_ID} strong {
        display: block;
        text-transform: uppercase;
        letter-spacing: 0.06em;
      }
      #${TOAST_ID}.negative {
        background: #fff0f0;
        border-color: #7a0500;
      }
    `;
    document.head.appendChild(style);
  }

  function ensureToastElement() {
    let toast = document.getElementById(TOAST_ID);
    if (!toast) {
      toast = document.createElement('div');
      toast.id = TOAST_ID;
      toast.innerHTML = `
        <img alt="Saul" />
        <div>
          <strong></strong>
          <p></p>
        </div>
      `;
      document.body.appendChild(toast);
    }
    return toast;
  }

  function showTabToast(mood, message) {
    ensureStyles();
    const toast = ensureToastElement();
    const img = toast.querySelector('img');
    const title = toast.querySelector('strong');
    const paragraph = toast.querySelector('p');
    if (img) {
      const asset =
        mood === 'positive'
          ? chrome.runtime.getURL('src/img/saul_like.png')
          : chrome.runtime.getURL('src/img/saul_incredulo.png');
      img.src = asset;
    }
    if (title) {
      title.textContent = mood === 'positive' ? 'Uhul!' : 'Ei, cliente...';
    }
    if (paragraph) {
      paragraph.textContent = message;
    }
    toast.classList.toggle('negative', mood === 'negative');
    toast.classList.add('visible');
    if (hideTimeout) {
      clearTimeout(hideTimeout);
    }
    hideTimeout = window.setTimeout(() => {
      toast.classList.remove('visible');
    }, 2600);
  }

  const target = typeof window !== 'undefined' ? window : globalThis;
  target.showTabToast = showTabToast;
})();
