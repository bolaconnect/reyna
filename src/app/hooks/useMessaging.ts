import { useEffect, useState, useCallback } from 'react';
import { getToken, onMessage } from 'firebase/messaging';
import { messaging, db } from '../../firebase/config';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { toast } from 'sonner';

// The user-provided VAPID key from Firebase Console
const VAPID_KEY = "BFptdla5Uoxu0G1tRc_7-6XQWWvKGsuRlnRpVZOE-yC8mwM347jOw6rhMZJCjeL_Ae6hZduoHx3cfRh5ZV_PZnw";

export function useMessaging(userId: string | undefined) {
    const [token, setToken] = useState<string | null>(null);

    const requestToken = useCallback(async () => {
        if (!userId) return;

        try {
            if (Notification.permission !== 'granted') {
                console.warn('Notification permission not granted. Skipping FCM token generation.');
                return;
            }

            const currentToken = await getToken(messaging, { vapidKey: VAPID_KEY });
            if (currentToken) {
                setToken(currentToken);
                console.log('FCM Token secured.');

                // Save token to Firestore so a Cloud Function could send push notifications
                try {
                    await setDoc(doc(db, 'fcm_tokens', currentToken), {
                        userId,
                        token: currentToken,
                        updatedAt: serverTimestamp(),
                        platform: 'web'
                    });
                } catch (saveErr) {
                    console.info('FCM token secured locally, but ignored remote save (Backend rules restrict fcm_tokens write).');
                }
            } else {
                console.log('No registration token available. Request permission to generate one.');
            }
        } catch (err) {
            console.error('An error occurred while retrieving token:', err);
        }
    }, [userId]);

    useEffect(() => {
        if (userId) {
            requestToken();
        }
    }, [userId, requestToken]);

    // Handle foreground messages
    useEffect(() => {
        const unsubscribe = onMessage(messaging, (payload) => {
            console.log('Message received in foreground. ', payload);
            toast.info(payload.notification?.title || '🔔 Thông báo mới', {
                description: payload.notification?.body,
                duration: 5000,
            });
        });

        return () => unsubscribe();
    }, []);

    return { token };
}
