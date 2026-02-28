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
import { SnapshotService } from '../services/snapshotService';
import { useAuth } from '../../contexts/AuthContext';
import { db as firestoreDb } from '../../firebase/config';
import { useLiveQuery } from 'dexie-react-hooks';

const EMPTY_ARRAY: any[] = [];

export function useFirestoreSync<T>(
    collectionName: SyncableCollection,
    refreshKey?: number,
    targetUserId?: string | null
) {
    const { user } = useAuth();
    const effectiveUserId = targetUserId || user?.uid;
    const [loading, setLoading] = useState(true);
    const [readyToListen, setReadyToListen] = useState(false);
    const [permError, setPermError] = useState(false);
    const syncingRef = useRef(false);
    const [syncing, setSyncing] = useState(false);

    // Initialize data loaded flag
    const [dataLoaded, setDataLoaded] = useState(false);

    // Load from local Dexie — reactive!
    const data = useLiveQuery(async () => {
        if (!effectiveUserId) return EMPTY_ARRAY as T[];
        try {
            const table = (SyncService as any).getTable ? (SyncService as any).getTable(collectionName) : (dbLocal as any)[collectionName];
            const items = await table.where('userId').equals(effectiveUserId).toArray();

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

            console.log(`[useFirestoreSync] ${collectionName} loaded:`, result.length, 'records for UID:', effectiveUserId);
            setDataLoaded(true);
            return result;
        } catch (e) {
            console.error('Dexie fetch error', e);
            setDataLoaded(true);
            return EMPTY_ARRAY as T[];
        }
    }, [effectiveUserId, collectionName, refreshKey]) || (EMPTY_ARRAY as T[]);

    // Trigger loading state updates
    useEffect(() => {
        if (dataLoaded) {
            setLoading(false);
        }
    }, [dataLoaded]);

    // Sync with Firestore (Delta/Initial Catch-up)
    const sync = useCallback(async () => {
        if (!effectiveUserId || syncingRef.current || permError) return;
        syncingRef.current = true;
        setSyncing(true);
        try {
            await SyncService.syncCollection(collectionName, effectiveUserId);
            setReadyToListen(true);
        } catch (err: any) {
            const isIndexBuilding = err?.message && err.message.includes('building');
            if (isIndexBuilding) {
                // Silently wait for SyncService to handle the fallback
                setReadyToListen(true);
            } else if (err?.code === 'permission-denied') {
                setPermError(true);
                console.warn(`[useFirestoreSync] Permission denied for ${collectionName}.`);
            } else {
                console.error(`[useFirestoreSync] Sync error for ${collectionName}:`, err?.message || err);
            }
        } finally {
            syncingRef.current = false;
            setSyncing(false);
        }
    }, [effectiveUserId, collectionName, permError]);

    // Trigger manual sync on mount and when user/refreshKey changes
    useEffect(() => {
        if (effectiveUserId) {
            sync();
        }
    }, [effectiveUserId, collectionName, refreshKey, sync]);

    // Real-time delta listener
    useEffect(() => {
        if (!effectiveUserId || !readyToListen || syncing) return;

        let unsub: (() => void) | undefined;

        const startListener = async () => {
            const meta = await dbLocal.syncMeta.get({ userId: effectiveUserId, collectionName });
            const lastSyncTime = meta?.lastSyncTime || 0;

            // For 'categories' and 'statuses', we skip the updatedAt filter to avoid requiring a composite index
            // Since lists are small, fetching all for the user is efficient enough.
            const useDelta = collectionName !== 'categories' && collectionName !== 'statuses';

            const q = useDelta
                ? query(
                    collection(firestoreDb, collectionName),
                    where('userId', '==', effectiveUserId),
                    where('updatedAt', '>', Timestamp.fromMillis(lastSyncTime))
                )
                : query(
                    collection(firestoreDb, collectionName),
                    where('userId', '==', effectiveUserId)
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
                        await dbLocal.syncMeta.put({ userId: effectiveUserId, collectionName, lastSyncTime: latest });

                        // AUTO-SNAPSHOT CHECK:
                        // Only check if we are on a scale where snapshots make sense (not small lists)
                        SnapshotService.autoSnapshotIfNeeded(collectionName, effectiveUserId).catch(() => {
                            // Silently ignore snapshot errors in listener
                        });
                    }
                }, (err: any) => {
                    const isIndexError = err?.code === 'failed-precondition' ||
                        (err?.message && (err.message.includes('index') || err.message.includes('Index')));
                    if (isIndexError) {
                        // Completely silent if it's an index building issue, as SyncService already reported it once
                    } else if (err?.code === 'permission-denied') {
                        setPermError(true);
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
    }, [effectiveUserId, collectionName, readyToListen, syncing]);

    return {
        data,
        loading,
        syncing,
        refresh: () => sync(), // Map refresh to sync
        triggerSync: sync
    };
}
