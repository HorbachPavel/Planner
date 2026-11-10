// Минимальный служебный скрипт для поддержки установки приложения
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});