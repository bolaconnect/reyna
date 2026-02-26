importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');

firebase.initializeApp({
    apiKey: "AIzaSyD9MOCZQA-mTz2QWkHZm7UwM2zUktkwzVU",
    authDomain: "app1-27b11.firebaseapp.com",
    projectId: "app1-27b11",
    storageBucket: "app1-27b11.firebasestorage.app",
    messagingSenderId: "103887395038",
    appId: "1:103887395038:web:24b599665b8456a6840a4f",
});

const messaging = firebase.messaging();

console.log('[SW] Firebase messaging initialized');

self.addEventListener('install', (event) => {
    console.log('[SW] Installed');
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    console.log('[SW] Activated');
    event.waitUntil(self.clients.claim());
});

messaging.onBackgroundMessage((payload) => {
    console.log('[SW] Background message received:', payload);

    // Extracting the best title and body from various Firebase message formats
    const title = payload.notification?.title || payload.data?.title || 'Thông báo từ Reyna';
    const body = payload.notification?.body || payload.data?.body || 'Bạn có một tin nhắn mới!';

    // Base URL context matters for SWs on GitHub Pages
    const iconPath = payload.notification?.icon || payload.data?.icon || './logo.png';
    const urlToOpen = payload.data?.url || '/';

    const notificationOptions = {
        body: body,
        icon: iconPath,
        badge: iconPath,
        data: { url: urlToOpen },
        requireInteraction: true, // Keeps notification on screen until user clicks
        vibrate: [200, 100, 200, 100, 200]
    };

    console.log('[SW] Showing notification:', title, notificationOptions);

    return self.registration.showNotification(title, notificationOptions);
});

self.addEventListener('notificationclick', (event) => {
    console.log('[SW] Notification clicked');
    event.notification.close();

    const urlToOpen = event.notification.data?.url || '/';

    // This looks to see if the current window is already open and
    // focuses if it is, otherwise it opens a new window
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
            // Focus existing window if any
            for (let i = 0; i < windowClients.length; i++) {
                const client = windowClients[i];
                if (client.url.includes(self.registration.scope) && 'focus' in client) {
                    return client.focus();
                }
            }
            // If no window is open, open a new one
            if (clients.openWindow) {
                return clients.openWindow(urlToOpen);
            }
        })
    );
});
