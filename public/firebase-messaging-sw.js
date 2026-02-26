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

console.log('[firebase-messaging-sw.js] Service Worker script loaded and Firebase initialized.');

self.addEventListener('install', (event) => {
    console.log('[firebase-messaging-sw.js] Installing Service Worker...', event);
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    console.log('[firebase-messaging-sw.js] Activating Service Worker...', event);
});

messaging.onBackgroundMessage((payload) => {
    console.log('[firebase-messaging-sw.js] 🔔 onBackgroundMessage EVENT FIRED! Payload:', payload);

    try {
        const notificationTitle = payload.notification?.title || 'Thông báo mới';
        const notificationOptions = {
            body: payload.notification?.body || '',
            icon: './logo.png',
            data: payload.data || {}
        };

        console.log('[firebase-messaging-sw.js] Calling self.registration.showNotification...', notificationTitle, notificationOptions);

        self.registration.showNotification(notificationTitle, notificationOptions)
            .then(() => console.log('[firebase-messaging-sw.js] showNotification PROMISE RESOLVED successfully!'))
            .catch((err) => console.error('[firebase-messaging-sw.js] showNotification PROMISE REJECTED with error:', err));
    } catch (err) {
        console.error('[firebase-messaging-sw.js] Error inside onBackgroundMessage block:', err);
    }
});

self.addEventListener('notificationclick', (event) => {
    console.log('[firebase-messaging-sw.js] 🖱️ notificationclick EVENT FIRED!', event);
    event.notification.close();
});
