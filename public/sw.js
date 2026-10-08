// Service worker mínimo: permite instalar o app na tela inicial do celular.
// Não guarda dados de chamados em cache (tudo vem sempre do servidor).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
