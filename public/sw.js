// Service Worker for Web Push Notifications
self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || "HAKKŌ แจ้งเตือน";
  const options = {
    body: data.body || "คุณมีข้อความใหม่",
    icon: "/AR.jpg",
    badge: "/AR.jpg",
    data: { url: data.url || "/" },
    vibrate: [200, 100, 200],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(clients.openWindow(url));
});
