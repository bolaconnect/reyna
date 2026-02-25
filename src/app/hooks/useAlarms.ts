import { useEffect, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { dbLocal, AlarmRecord, NotificationRecord } from '../lib/db';
import { useNotification } from './useNotification';
import { doc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase/config';

function uuid() {
    return crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
}

interface UseAlarmsOptions {
    userId: string | undefined;
    onNewNotification?: () => void; // callback to refresh notification center
}

export function useAlarms({ userId, onNewNotification }: UseAlarmsOptions) {
    const { sendNotification, permission } = useNotification();

    const checkAlarms = useCallback(async () => {
        if (!userId) return;
        const now = Date.now();
        const due = await dbLocal.alarms
            .where('fired').equals(0)
            .and(a => a.userId === userId && a.triggerAt <= now)
            .toArray();

        for (const alarm of due) {
            // Use transaction to ensure only ONE tab "claims" and deletes this alarm
            let claimed = false;
            await dbLocal.transaction('rw', dbLocal.alarms, async () => {
                const live = await dbLocal.alarms.get(alarm.id);
                if (live && live.fired === 0) {
                    // Mark as fired immediately in the same transaction to prevent others
                    await dbLocal.alarms.update(alarm.id, { fired: 1 });
                    claimed = true;
                }
            });

            if (!claimed) continue;

            // 1. Fire browser notification
            const title = `⏰ Nhắc nhở: ${alarm.label}`;
            const body = alarm.note || 'Đã đến giờ hẹn!';

            await sendNotification(title, { body, tag: alarm.id });

            // 2. Log to notifications table
            const notif: NotificationRecord = {
                id: uuid(),
                userId,
                title,
                body,
                recordId: alarm.recordId,
                collection: alarm.collection,
                createdAt: Date.now(),
                updatedAt: Date.now(),
            };
            await dbLocal.notifications.add(notif);
            // Sync notification to Firestore
            await setDoc(doc(db, 'notifications', notif.id), {
                ...notif,
                updatedAt: serverTimestamp(),
            });

            // 3. Delete the alarm immediately (user doesn't want history)
            await dbLocal.alarms.delete(alarm.id);
            await deleteDoc(doc(db, 'alarms', alarm.id));

            onNewNotification?.();
        }
    }, [userId, sendNotification, onNewNotification]);

    // Poll every 15 seconds
    useEffect(() => {
        if (!userId) return;
        checkAlarms(); // immediate first check
        const interval = setInterval(checkAlarms, 15_000);
        return () => clearInterval(interval);
    }, [userId, checkAlarms]);

    // ── CRUD helpers ──────────────────────────────────────

    const addAlarm = useCallback(async (alarm: Omit<AlarmRecord, 'id' | 'userId' | 'fired' | 'createdAt' | 'updatedAt'>) => {
        if (!userId) return;
        const record: AlarmRecord = {
            ...alarm,
            id: uuid(),
            userId,
            fired: 0,
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };
        await dbLocal.alarms.add(record);
        // Sync to Firestore
        await setDoc(doc(db, 'alarms', record.id), {
            ...record,
            updatedAt: serverTimestamp(),
        });
        return record;
    }, [userId]);

    const deleteAlarm = useCallback(async (id: string) => {
        await dbLocal.alarms.delete(id);
        await deleteDoc(doc(db, 'alarms', id));
    }, []);

    const getAlarmsForRecord = useCallback(async (recordId: string) => {
        if (!userId) return [];
        return dbLocal.alarms.where('recordId').equals(recordId).and(a => a.userId === userId).toArray();
    }, [userId]);

    const markAsDone = useCallback(async (id: string) => {
        const now = Date.now();
        await dbLocal.alarms.update(id, { doneAt: now, updatedAt: now } as any);
        await setDoc(doc(db, 'alarms', id), { doneAt: now, updatedAt: serverTimestamp() }, { merge: true });
    }, []);

    const nearestAlarmsMap = useLiveQuery(async () => {
        if (!userId) return new Map<string, number>();
        const alarms = await dbLocal.alarms
            .where('userId').equals(userId)
            .and(a => !a.doneAt)
            .toArray();

        const map = new Map<string, number>();
        for (const a of alarms) {
            const current = map.get(a.recordId);
            if (current === undefined || a.triggerAt < current) {
                map.set(a.recordId, a.triggerAt);
            }
        }
        return map;
    }, [userId]) || new Map<string, number>();

    return { addAlarm, deleteAlarm, getAlarmsForRecord, checkAlarms, markAsDone, nearestAlarmsMap };
}
