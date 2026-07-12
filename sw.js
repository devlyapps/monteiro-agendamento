// Service worker — instalação do app (sem cache offline) + lembretes via push.
//
// Escuta o evento "push" nativo direto (sem importar o SDK do Firebase aqui).
// O SDK só é necessário na página principal, pra gerar o token (getToken). Usar o
// SDK aqui dentro causava notificação duplicada/genérica em alguns navegadores
// (ele registra um listener de push interno, que competia com o nosso).

self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch (e) {}
  const data = payload.data || payload;
  const title = data.title || 'Barbearia Monteiro';
  const options = {
    body: data.body || '',
    icon: 'icon-192.png',
    badge: 'icon-192.png'
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', () => {
  // Sem interceptação: tudo passa direto pela rede, sem cache offline.
});
