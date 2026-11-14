/* Agenda Base — service worker.
   Guarda em cache apenas a "casca" do aplicativo (HTML, CSS, JS, fontes, ícones) para abrir rápido
   e instalar como aplicativo. NUNCA guarda dados: reservas, disponibilidade e configuração vêm
   sempre do servidor (as chamadas ao Firebase são de outra origem e passam direto por aqui).
   Troque VERSION ao publicar uma versão nova para descartar a casca antiga. */
const VERSION = 'agenda-base-v1';
const SHELL = [
  './', './index.html', './painel.html',
  './css/tokens.css', './css/base.css', './css/components.css', './css/public.css', './css/painel.css',
  './vendor/fonts/sofia-sans-latin-wght-normal.woff2', './vendor/fonts/sofia-sans-condensed-latin-wght-normal.woff2',
  './icons/icon.svg', './icons/icon-192.png',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(VERSION).then((cache) => Promise.allSettled(SHELL.map((url) => cache.add(url)))));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function networkFirst(request) {
  return fetch(request)
    .then((response) => {
      const copy = response.clone();
      if (response.ok) caches.open(VERSION).then((cache) => cache.put(request, copy)).catch(() => {});
      return response;
    })
    .catch(() => caches.match(request).then((hit) => hit || caches.match('./index.html')));
}

function staleWhileRevalidate(request) {
  return caches.match(request).then((hit) => {
    const fresh = fetch(request).then((response) => {
      const copy = response.clone();
      if (response.ok) caches.open(VERSION).then((cache) => cache.put(request, copy)).catch(() => {});
      return response;
    });
    if (hit) fresh.catch(() => {}); // sem rede: fica com a cópia guardada
    return hit || fresh;
  });
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // Firebase e qualquer outra origem: sempre rede, sem cache
  if (url.search) return; // verificações de relógio e afins nunca vêm do cache
  const fresh = request.mode === 'navigate' || /\.(html|webmanifest)$/.test(url.pathname) || /\/(config|sw)\.js$/.test(url.pathname) || url.pathname.endsWith('version.json');
  event.respondWith(fresh ? networkFirst(request) : staleWhileRevalidate(request));
});
