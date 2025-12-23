document.addEventListener('DOMContentLoaded', () => {
  const optionsBtn = document.getElementById('optionsButton');
  const backBtn = document.getElementById('backButton');

  optionsBtn?.addEventListener('click', () => {
    const url = chrome.runtime.getURL('src/options/options.html#vilains');
    if (chrome?.tabs?.create) {
      chrome.tabs.create({ url }).catch(() => {
        window.location.href = url;
      });
    } else {
      window.location.href = url;
    }
  });

  backBtn?.addEventListener('click', () => {
    if (history.length > 1) {
      history.back();
      return;
    }

    if (chrome?.tabs?.getCurrent && chrome?.tabs?.remove) {
      chrome.tabs.getCurrent((tab) => {
        if (chrome.runtime.lastError || !tab?.id) {
          window.close();
          return;
        }
        chrome.tabs.remove(tab.id, () => window.close());
      });
      return;
    }

    window.close();
  });
});
