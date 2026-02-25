import { useState, useEffect, useCallback, useRef } from 'react';
import {
    collection,
    query,
    where,
    onSnapshot,
    Timestamp
} from 'firebase/firestore';
import { dbLocal } from '../lib/db';
import { SyncService, SyncableCollection } from '../services/syncService';
import { useAuth } from '../../contexts/AuthContext';
import { db as firestoreDb } from '../../firebase/config';

export function useFirestoreSync<T>(
    collectionName: SyncableCollection,
    refreshKey?: number
) {
    const { user } = useAuth();
    const [data, setData] = useState<T[]>([]);
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [readyToListen, setReadyToListen] = useState(false);

    // Load from local Dexie — excluding soft-deleted records
    const loadLocal = useCallback(async () => {
        if (!user) return;
        const table = (SyncService as any).getTable ? (SyncService as any).getTable(collectionName) : (dbLocal as any)[collectionName];
        const items = await table.where('userId').equals(user.uid).toArray();

        // Filter out soft-deleted & sort by updatedAt desc
        const sorted = (items as any[])
            .filter(item => !item.deleted)
            .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        setData(sorted as T[]);
        setLoading(false);
    }, [user, collectionName]);

    // Initial load from local
    useEffect(() => {
        loadLocal();
    }, [loadLocal, refreshKey]);

    // Sync with Firestore (Delta/Initial Catch-up)
    const sync = useCallback(async () => {
        if (!user || syncing) return;
        setSyncing(true);
        try {
            await SyncService.syncCollection(collectionName, user.uid);
            setReadyToListen(true);
            // After sync, reload local data
            await loadLocal();
        } catch (err) {
            console.error(`Sync error for ${collectionName}:`, err);
        } finally {
            setSyncing(false);
        }
    }, [user, collectionName, syncing, loadLocal]);

    // Trigger manual sync on mount and when user/refreshKey changes
    useEffect(() => {
        if (user) {
            sync();
        }
    }, [user, collectionName, refreshKey]);

    // Real-time delta listener
    useEffect(() => {
        if (!user || !readyToListen || syncing) return;

        let unsub: (() => void) | undefined;

        const startListener = async () => {
            const meta = await dbLocal.syncMeta.get({ userId: user.uid, collectionName });
            const lastSyncTime = meta?.lastSyncTime || Date.now();

            const q = query(
                collection(firestoreDb, collectionName),
                where('userId', '==', user.uid),
                where('updatedAt', '>', Timestamp.fromMillis(lastSyncTime))
            );

            try {
                unsub = onSnapshot(q, async (snapshot) => {
                    if (snapshot.empty) return;

                    const table = ((SyncService as any).getTable ? (SyncService as any).getTable(collectionName) : (dbLocal as any)[collectionName]) as any;
                    const updates: any[] = [];
                    const toDelete: string[] = [];

                    snapshot.docs.forEach(docSnap => {
                        const d = docSnap.data();
                        const record = {
                            id: docSnap.id,
                            ...d,
                            updatedAt: d.updatedAt instanceof Timestamp ? d.updatedAt.toMillis() : Date.now(),
                        };
                        if (d.deleted) {
                            toDelete.push(docSnap.id);
                        } else {
                            updates.push(record);
                        }
                    });

                    // Save updated docs & remove deleted ones from local cache
                    if (updates.length > 0) await table.bulkPut(updates);
                    if (toDelete.length > 0) await table.bulkDelete(toDelete);

                    // Update lastSyncTime if there were any updates
                    if (updates.length > 0) {
                        const latest = Math.max(...updates.map(u => u.updatedAt));
                        await dbLocal.syncMeta.put({ userId: user.uid, collectionName, lastSyncTime: latest });
                    }

                    // Refresh local UI
                    loadLocal();
                }, (err: any) => {
                    const isIndexError = err?.code === 'failed-precondition' ||
                        (err?.message && (err.message.includes('index') || err.message.includes('Index')));
                    if (isIndexError) {
                        console.warn(`[useFirestoreSync] Index not ready for ${collectionName}. Real-time listening paused until index is built.`);
                    } else {
                        console.error(`[useFirestoreSync] Listener error for ${collectionName}:`, err);
                    }
                });
            } catch (err: any) {
                console.warn(`[useFirestoreSync] Could not start listener for ${collectionName}:`, err?.message);
            }
        };

        startListener();

        return () => {
            if (unsub) unsub();
        };
    }, [user, collectionName, readyToListen, syncing, loadLocal]);

    return {
        data,
        loading,
        syncing,
        refresh: loadLocal,
        triggerSync: sync
    };
}
