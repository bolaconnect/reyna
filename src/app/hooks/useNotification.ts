import { useState, useEffect, useCallback } from 'react';

export type NotifPermission = 'default' | 'granted' | 'denied';

export function useNotification() {
    const [permission, setPermission] = useState<NotifPermission>(() => {
        if (typeof Notification !== 'undefined') return Notification.permission as NotifPermission;
        return 'default';
    });

    const isSupported = typeof Notification !== 'undefined';

    // Sync permission state if user changes it externally
    useEffect(() => {
        if (!isSupported) return;
        const handler = () => {
            setPermission(Notification.permission as NotifPermission);
        };
        // Check on focus to catch browser-level changes
        window.addEventListener('focus', handler);
        return () => window.removeEventListener('mousedown', handler);
    }, [isSupported]);

    const requestPermission = useCallback(async () => {
        if (!isSupported) return 'denied' as NotifPermission;
        try {
            const result = await Notification.requestPermission();
            setPermission(result as NotifPermission);
            return result as NotifPermission;
        } catch (err) {
            console.error('Failed to request notification permission:', err);
            return 'denied' as NotifPermission;
        }
    }, [isSupported]);

    const sendNotification = useCallback(async (
        title: string,
        options?: NotificationOptions & { onClick?: () => void }
    ) => {
        if (!isSupported) {
            console.warn('Notifications not supported in this browser');
            return null;
        }

        // Always check fresh permission to avoid stale state issues
        let currentPerm = Notification.permission as NotifPermission;

        if (currentPerm !== 'granted') {
            console.warn(`Notification blocked: permission is ${currentPerm}`);
            return null;
        }

        try {
            const { onClick, ...notifOptions } = options ?? {};
            const iconPath = `${(import.meta as any).env.BASE_URL}logo.png`;

            // Try Service Worker first for better PWA / Modern Browser Support
            if ('serviceWorker' in navigator) {
                try {
                    console.log('[Notification] Trying Service Worker...');
                    const registration = await navigator.serviceWorker.getRegistration((import.meta as any).env.BASE_URL);
                    if (registration && registration.active) {
                        console.log('[Notification] Service Worker is active. Calling showNotification...');
                        await registration.showNotification(title, {
                            icon: iconPath,
                            badge: iconPath,
                            ...notifOptions,
                        });
                        console.log('[Notification] showNotification called via Service Worker.');
                        return null; // Return null as we can't attach onclick to SW notification easily here
                    } else {
                        console.log('[Notification] Service Worker registration not found or inactive.');
                    }
                } catch (swError) {
                    console.warn('[Notification] Service Worker getRegistration error:', swError);
                }
            }

            // Fallback to traditional Notification API
            console.log('[Notification] Falling back to traditional Notification API...');
            const notif = new Notification(title, {
                icon: iconPath,
                badge: iconPath,
                ...notifOptions,
            });

            if (onClick) notif.onclick = onClick;
            console.log('[Notification] Traditional Notification object created.');
            return notif;
        } catch (err) {
            console.error('[Notification] Error creating notification:', err);
            return null;
        }
    }, [isSupported, requestPermission]);

    return { permission, isSupported, requestPermission, sendNotification };
}
