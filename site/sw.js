const CACHE_NAME = 'saul-site-v1';
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './style.css',
  './main.js',
  './blog/index.json',
  './assets/logotipo_saul_goodman.png',
  './assets/logotipo_saul_goodman-420.png',
  './assets/saul_incredulo.png',
  './assets/saul_incredulo-320.png',
  './assets/saul_like.png',
  './assets/saul_like-320.png',
  './assets/saul_nao_corte.png',
  './assets/saul_nao_corte-320.png',
  './assets/audio/voicy-better-call-saul.aac',
  './assets/audio/terremoto-siren.aac',
  './assets/screenshots/popup-indice.png',
  './assets/screenshots/popup-indice-900.png',
  './assets/screenshots/popup-kpis-top-dominios.png',
  './assets/screenshots/popup-kpis-top-dominios-900.png',
  './assets/screenshots/options-dominios.png',
  './assets/screenshots/options-dominios-900.png',
  './assets/screenshots/options-pesos-horarios.png',
  './assets/screenshots/options-pesos-horarios-900.png',
  './assets/screenshots/report-resumo-graficos.png',
  './assets/screenshots/report-resumo-graficos-900.png',
  './assets/screenshots/report-minutos-narrativa.png',
  './assets/screenshots/report-minutos-narrativa-900.png',
  './assets/screenshots/report-composicao-campeoes.png',
  './assets/screenshots/report-composicao-campeoes-900.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((oldName) => caches.delete(oldName))
      );
      self.clients.claim();
    })()
  );
});

const isDynamicResource = (request) => {
  try {
    const url = new URL(request.url);
    const pathname = url.pathname;
    return pathname.endsWith('/blog/index.json') || pathname.endsWith('/blog/rss.xml');
  } catch {
    return false;
  }
};

const cacheAndReturn = async (request, response) => {
  const responseClone = response.clone();
  const cache = await caches.open(CACHE_NAME);
  cache.put(request, responseClone);
  return response;
};

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (isDynamicResource(event.request)) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => cacheAndReturn(event.request, networkResponse))
        .catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse;
      return fetch(event.request)
        .then((response) => cacheAndReturn(event.request, response))
        .catch((error) => Promise.reject(error));
    })
  );
});
