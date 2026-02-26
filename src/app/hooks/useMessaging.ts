import { useEffect, useState, useCallback, useRef } from 'react';
import { getToken, onMessage, MessagePayload } from 'firebase/messaging';
import { messaging, db } from '../../firebase/config';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { toast } from 'sonner';

const VAPID_KEY = "BFptdla5Uoxu0G1tRc_7-6XQWWvKGsuRlnRpVZOE-yC8mwM347jOw6rhMZJCjeL_Ae6hZduoHx3cfRh5ZV_PZnw";

export function useMessaging(userId: string | undefined) {
    const [token, setToken] = useState<string | null>(null);
    const hasRequestedRef = useRef(false);

    const requestToken = useCallback(async () => {
        if (!userId) return;
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
            console.warn('[useMessaging] Push messaging is not supported.');
            return;
        }

        try {
            // First check if permission is granted BEFORE trying to register
            const permission = await Notification.requestPermission();
            if (permission !== 'granted') {
                console.warn('[useMessaging] Notification permission not granted.');
                return;
            }

            console.log('[useMessaging] Permission granted. Registering Service Worker...');

            // The exact scope where your GitHub Pages resides
            const swUrl = `${import.meta.env.BASE_URL}firebase-messaging-sw.js`;
            const registration = await navigator.serviceWorker.register(swUrl, {
                scope: import.meta.env.BASE_URL
            });

            console.log('[useMessaging] SW registered with scope:', registration.scope);

            // Wait until the SW is active
            await navigator.serviceWorker.ready;
            console.log('[useMessaging] SW is ready.');

            // Get the token directly through Firebase SDK
            console.log('[useMessaging] Requesting FCM token...');
            const currentToken = await getToken(messaging, {
                vapidKey: VAPID_KEY,
                serviceWorkerRegistration: registration,
            });

            if (currentToken) {
                console.log('[useMessaging] Successfully secured FCM Token:', currentToken);
                setToken(currentToken);

                try {
                    // Storing the token under fcm_tokens for your future backend to use
                    await setDoc(doc(db, 'fcm_tokens', currentToken), {
                        userId,
                        token: currentToken,
                        updatedAt: serverTimestamp(),
                        platform: 'web',
                        userAgent: navigator.userAgent
                    });
                } catch (e) {
                    console.log('[useMessaging] Could not write to fcm_tokens collection (likely rules).');
                }
            } else {
                console.warn('[useMessaging] No registration token available.');
            }
        } catch (err) {
            console.error('[useMessaging] An error occurred while retrieving token:', err);
        }
    }, [userId]);

    useEffect(() => {
        if (userId && !hasRequestedRef.current) {
            hasRequestedRef.current = true;
            // Slight delay to prevent blocking the main JS thread on load
            setTimeout(requestToken, 1500);
        }
    }, [userId, requestToken]);

    // Handle incoming messages when the app is IN FOCUS (Foreground)
    useEffect(() => {
        const unsubscribe = onMessage(messaging, (payload: MessagePayload) => {
            console.log('[useMessaging] Message received in foreground: ', payload);

            const title = payload.notification?.title || payload.data?.title || '🔔 Thông báo';
            const body = payload.notification?.body || payload.data?.body;

            toast(title, {
                description: body,
                duration: 5000,
                position: 'top-right',
                style: {
                    background: '#1d1d1f',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '12px'
                }
            });
        });

        return () => unsubscribe();
    }, []);

    return { token };
}
