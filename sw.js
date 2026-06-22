// Service worker — instalação do app (sem cache offline) + lembretes via push (Firebase Cloud Messaging).

importScripts('https://www.gstatic.com/firebasejs/10.13.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.13.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyArsioR3GA87ILUM8AhyNpKwvd40qV1-0U",
  authDomain: "monteiro-barbearia-bc806.firebaseapp.com",
  projectId: "monteiro-barbearia-bc806",
  storageBucket: "monteiro-barbearia-bc806.firebasestorage.app",
  messagingSenderId: "718127553031",
  appId: "1:718127553031:web:4525aaddbbfa16aecce8a2"
});

const messaging = firebase.messaging();

// Mostra a notificação quando o app está fechado ou em segundo plano
messaging.onBackgroundMessage((payload) => {
  const title = (payload.notification && payload.notification.title) || 'Monteiró Barbearia';
  const options = {
    body: (payload.notification && payload.notification.body) || '',
    icon: 'icon-192.png',
    badge: 'icon-192.png'
  };
  self.registration.showNotification(title, options);
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
