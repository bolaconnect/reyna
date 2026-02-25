// ============================================================
// FIREBASE CONFIGURATION
// Replace the placeholder values below with your Firebase
// project credentials from https://console.firebase.google.com
// ============================================================

import { initializeApp } from 'firebase/app';
import { getAuth, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getMessaging } from 'firebase/messaging';

const firebaseConfig = {
  apiKey: "AIzaSyD9MOCZQA-mTz2QWkHZm7UwM2zUktkwzVU",
  authDomain: "app1-27b11.firebaseapp.com",
  projectId: "app1-27b11",
  storageBucket: "app1-27b11.firebasestorage.app",
  messagingSenderId: "103887395038",
  appId: "1:103887395038:web:24b599665b8456a6840a4f",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const messaging = getMessaging(app);

// Đảm bảo Firebase giữ trạng thái đăng nhập ngay cả khi đóng trình duyệt
setPersistence(auth, browserLocalPersistence).catch((error) => {
  console.error('Firebase persistence error:', error);
});
