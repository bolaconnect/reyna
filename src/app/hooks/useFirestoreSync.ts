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
import { useLiveQuery } from 'dexie-react-hooks';

const EMPTY_ARRAY: any[] = [];

export function useFirestoreSync<T>(
    collectionName: SyncableCollection,
    refreshKey?: number
) {
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [readyToListen, setReadyToListen] = useState(false);

    // Initialize data loaded flag
    const [dataLoaded, setDataLoaded] = useState(false);

    // Load from local Dexie — reactive!
    const data = useLiveQuery(async () => {
        if (!user) return EMPTY_ARRAY as T[];
        try {
            const table = (SyncService as any).getTable ? (SyncService as any).getTable(collectionName) : (dbLocal as any)[collectionName];
            const items = await table.where('userId').equals(user.uid).toArray();

            // Filter out soft-deleted & STABLE SORT
            const result = (items as any[])
                .filter(item => !item.deleted)
                .sort((a, b) => {
                    // Secondary sorting criteria for stability: 
                    // 1. updatedAt desc
                    // 2. name/title asc (if available)
                    // 3. id asc
                    const timeA = a.updatedAt || 0;
                    const timeB = b.updatedAt || 0;
                    if (timeB !== timeA) return timeB - timeA;

                    const nameA = (a.name || a.title || '').toLowerCase();
                    const nameB = (b.name || b.title || '').toLowerCase();
                    if (nameA !== nameB) return nameA.localeCompare(nameB);

                    return a.id.localeCompare(b.id);
                }) as T[];

            setDataLoaded(true);
            return result;
        } catch (e) {
            console.error('Dexie fetch error', e);
            setDataLoaded(true);
            return EMPTY_ARRAY as T[];
        }
    }, [user, collectionName, refreshKey]) || (EMPTY_ARRAY as T[]);

    // Trigger loading state updates
    useEffect(() => {
        if (dataLoaded) {
            setLoading(false);
        }
    }, [dataLoaded]);

    // Sync with Firestore (Delta/Initial Catch-up)
    const sync = useCallback(async () => {
        if (!user || syncing) return;
        setSyncing(true);
        try {
            await SyncService.syncCollection(collectionName, user.uid);
            setReadyToListen(true);
        } catch (err) {
            console.error(`Sync error for ${collectionName}:`, err);
        } finally {
            setSyncing(false);
        }
    }, [user, collectionName, syncing]);

    // Trigger manual sync on mount and when user/refreshKey changes
    useEffect(() => {
        if (user) {
            sync();
        }
    }, [user, collectionName, refreshKey, sync]);

    // Real-time delta listener
    useEffect(() => {
        if (!user || !readyToListen || syncing) return;

        let unsub: (() => void) | undefined;

        const startListener = async () => {
            const meta = await dbLocal.syncMeta.get({ userId: user.uid, collectionName });
            const lastSyncTime = meta?.lastSyncTime || 0;

            // For 'categories' and 'statuses', we skip the updatedAt filter to avoid requiring a composite index
            // Since lists are small, fetching all for the user is efficient enough.
            const useDelta = collectionName !== 'categories' && collectionName !== 'statuses';

            const q = useDelta
                ? query(
                    collection(firestoreDb, collectionName),
                    where('userId', '==', user.uid),
                    where('updatedAt', '>', Timestamp.fromMillis(lastSyncTime))
                )
                : query(
                    collection(firestoreDb, collectionName),
                    where('userId', '==', user.uid)
                );

            try {
                unsub = onSnapshot(q, async (snapshot) => {
                    if (snapshot.empty) return;

                    const table = ((SyncService as any).getTable ? (SyncService as any).getTable(collectionName) : (dbLocal as any)[collectionName]) as any;
                    const updates: any[] = [];
                    const toDelete: string[] = [];

                    for (const docSnap of snapshot.docs) {
                        const d = docSnap.data();
                        const recordId = docSnap.id;

                        // Check if we already have this record with same or newer sequence
                        // to avoid jitter from redundant writes
                        const existing = await table.get(recordId);
                        const serverUpdatedAt = d.updatedAt instanceof Timestamp ? d.updatedAt.toMillis() : (d.updatedAt || 0);

                        // Skip if local is already newer or identical
                        if (existing && existing.updatedAt >= serverUpdatedAt && !d.deleted) continue;

                        const record = {
                            id: recordId,
                            ...d,
                            updatedAt: serverUpdatedAt,
                        };
                        if (d.deleted) {
                            toDelete.push(recordId);
                        } else {
                            updates.push(record);
                        }
                    }

                    // Save updated docs & remove deleted ones from local cache
                    if (updates.length > 0) await table.bulkPut(updates);
                    if (toDelete.length > 0) await table.bulkDelete(toDelete);

                    // Update lastSyncTime if there were any updates and we are using delta
                    if (updates.length > 0 && useDelta) {
                        const latest = Math.max(...updates.map(u => u.updatedAt));
                        await dbLocal.syncMeta.put({ userId: user.uid, collectionName, lastSyncTime: latest });
                    }
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
    }, [user, collectionName, readyToListen, syncing]);

    return {
        data,
        loading,
        syncing,
        refresh: () => sync(), // Map refresh to sync
        triggerSync: sync
    };
}
