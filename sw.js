// Service worker mínimo — apenas para permitir que o app seja instalável.
// Não faz cache de nada: o app continua exigindo conexão com a internet normalmente.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', () => {
  // Sem interceptação: tudo passa direto pela rede, sem cache offline.
});
