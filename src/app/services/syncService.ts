import {
    collection,
    query,
    where,
    getDocs,
    orderBy,
    limit,
    startAfter,
    Timestamp,
    Firestore,
    QueryDocumentSnapshot,
    DocumentData
} from 'firebase/firestore';
import { dbLocal } from '../lib/db';
import { db as firestoreDb } from '../../firebase/config';

export type SyncableCollection = 'cards' | 'emails' | 'alarms' | 'notifications' | 'categories';

export class SyncService {
    private static getTable(collectionName: SyncableCollection) {
        switch (collectionName) {
            case 'cards': return dbLocal.cards;
            case 'emails': return dbLocal.emails;
            case 'alarms': return dbLocal.alarms;
            case 'notifications': return dbLocal.notifications;
            case 'categories': return dbLocal.categories;
        }
    }

    /**
     * Performs a delta sync for a collection.
     * Only fetches documents modified since the last sync time.
     */
    static async asyncSyncBatch(
        collectionName: SyncableCollection,
        userId: string,
        lastSyncTime: number
    ) {
        const BATCH_SIZE = 500;
        let currentLastSyncTime = lastSyncTime;
        let hasMore = true;
        const table = this.getTable(collectionName) as any;

        if (currentLastSyncTime === 0) {
            // FIRST SYNC: Paginated fetch
            let lastDoc = null;
            let maxFoundSyncTime = 0;
            let hasMoreInitial = true;

            while (hasMoreInitial) {
                let q = query(
                    collection(firestoreDb, collectionName),
                    where('userId', '==', userId),
                    limit(BATCH_SIZE)
                );
                if (lastDoc) q = query(q, startAfter(lastDoc));

                const snapshot = await getDocs(q);
                if (snapshot.empty) break;

                const data = snapshot.docs.map(doc => {
                    const d = doc.data();
                    const updatedAt = d.updatedAt instanceof Timestamp ? d.updatedAt.toMillis() : (d.createdAt || Date.now());
                    if (updatedAt > maxFoundSyncTime) maxFoundSyncTime = updatedAt;
                    return {
                        id: doc.id,
                        ...d,
                        updatedAt,
                    };
                });

                await table.bulkPut(data);
                lastDoc = snapshot.docs[snapshot.docs.length - 1];

                if (snapshot.size < BATCH_SIZE) hasMoreInitial = false;
            }

            // Set lastSyncTime to max found or now
            currentLastSyncTime = maxFoundSyncTime > 0 ? maxFoundSyncTime : Date.now();
            await dbLocal.syncMeta.put({ userId, collectionName, lastSyncTime: currentLastSyncTime });
            return currentLastSyncTime;
        }

        // DELTA SYNC
        while (hasMore) {
            const q = query(
                collection(firestoreDb, collectionName),
                where('userId', '==', userId),
                where('updatedAt', '>', Timestamp.fromMillis(currentLastSyncTime)),
                orderBy('updatedAt', 'asc'),
                limit(BATCH_SIZE)
            );

            const snapshot = await getDocs(q);
            if (snapshot.empty) {
                hasMore = false;
                break;
            }

            const toUpsert: any[] = [];
            const toDelete: string[] = [];

            snapshot.docs.forEach(docSnap => {
                const data = docSnap.data();
                const record = {
                    id: docSnap.id,
                    ...data,
                    updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toMillis() : Date.now(),
                };
                if (data.deleted) {
                    toDelete.push(docSnap.id);
                } else {
                    toUpsert.push(record);
                }
            });

            if (toUpsert.length > 0) await table.bulkPut(toUpsert);
            if (toDelete.length > 0) await table.bulkDelete(toDelete);

            const allDocs = [...toUpsert];
            if (allDocs.length > 0) {
                currentLastSyncTime = Math.max(...allDocs.map(d => d.updatedAt));
            }

            if (snapshot.size < BATCH_SIZE) {
                hasMore = false;
            }
        }

        await dbLocal.syncMeta.put({ userId, collectionName, lastSyncTime: currentLastSyncTime });
        return currentLastSyncTime;
    }

    static async syncCollection(collectionName: SyncableCollection, userId: string) {
        const meta = await dbLocal.syncMeta.get({ userId, collectionName });
        const lastSyncTime = meta ? meta.lastSyncTime : 0;

        // For 'categories', we always do a full sync to avoid composite index issues.
        // Categories are small enough that this is efficient.
        if (collectionName === 'categories') {
            return await this.asyncSyncBatch(collectionName, userId, 0);
        }

        if (lastSyncTime > 0) {
            try {
                return await this.asyncSyncBatch(collectionName, userId, lastSyncTime);
            } catch (err: any) {
                const isIndexError = err?.code === 'failed-precondition' ||
                    (err?.message && (err.message.includes('index') || err.message.includes('Index')));
                if (isIndexError) {
                    console.warn(`[SyncService] Index not ready for ${collectionName}, falling back to full fetch.`);
                    return await this.asyncSyncBatch(collectionName, userId, 0);
                }
                throw err;
            }
        }
        return await this.asyncSyncBatch(collectionName, userId, 0);
    }

    static async fetchServerPage(
        collectionName: SyncableCollection,
        userId: string,
        pageSize: number,
        lastDoc: QueryDocumentSnapshot<DocumentData> | null = null
    ) {
        let q = query(
            collection(firestoreDb, collectionName),
            where('userId', '==', userId),
            orderBy('updatedAt', 'desc'),
            limit(pageSize)
        );

        if (lastDoc) {
            q = query(q, startAfter(lastDoc));
        }

        const snapshot = await getDocs(q);
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        const table = this.getTable(collectionName) as any;
        await table.bulkPut(data.map(d => ({
            ...d,
            updatedAt: (d as any).updatedAt instanceof Timestamp ? (d as any).updatedAt.toMillis() : Date.now()
        })) as any);

        return {
            data,
            lastVisible: snapshot.docs[snapshot.docs.length - 1] || null,
            count: snapshot.size
        };
    }
}
