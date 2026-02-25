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

messaging.onBackgroundMessage((payload) => {
    console.log('[firebase-messaging-sw.js] Received background message ', payload);
    const notificationTitle = payload.notification.title;
    const notificationOptions = {
        body: payload.notification.body,
        icon: '/logo.png'
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
});
