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

export class SyncService {
    /**
     * Performs a delta sync for a collection.
     * Only fetches documents modified since the last sync time.
     */
    static async asyncSyncBatch(
        collectionName: 'cards' | 'emails',
        userId: string,
        lastSyncTime: number
    ) {
        const BATCH_SIZE = 500;
        let currentLastSyncTime = lastSyncTime;
        let hasMore = true;
        const table = (collectionName === 'cards' ? dbLocal.cards : dbLocal.emails) as any;

        if (currentLastSyncTime === 0) {
            // FIRST SYNC: Paginated fetch to handle large legacy datasets (1000-5000 records)
            // catching records that lack the 'updatedAt' field.
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
                    const updatedAt = d.updatedAt instanceof Timestamp ? d.updatedAt.toMillis() : 0;
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

        // DELTA SYNC: Standard optimized loop
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

            // Track latest updatedAt from all processed docs
            const allDocs = [...toUpsert];
            if (allDocs.length > 0) {
                currentLastSyncTime = Math.max(...allDocs.map(d => d.updatedAt));
            }

            // If we got fewer than BATCH_SIZE, we're likely done for now
            if (snapshot.size < BATCH_SIZE) {
                hasMore = false;
            }
        }

        // Final meta update
        await dbLocal.syncMeta.put({ userId, collectionName, lastSyncTime: currentLastSyncTime });
        return currentLastSyncTime;
    }

    static async syncCollection(collectionName: 'cards' | 'emails', userId: string) {
        const meta = await dbLocal.syncMeta.get({ userId, collectionName });
        const lastSyncTime = meta ? meta.lastSyncTime : 0;
        // If we have a lastSyncTime, try the delta query first; fallback if index not ready
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

    /**
     * Performs a paginated server-side fetch from Firestore.
     */
    static async fetchServerPage(
        collectionName: 'cards' | 'emails',
        userId: string,
        pageSize: number,
        lastDoc: QueryDocumentSnapshot<DocumentData> | null = null
    ) {
        let q = query(
            collection(firestoreDb, collectionName),
            where('userId', '==', userId),
            orderBy('updatedAt', 'desc'), // Or any consistent sorting
            limit(pageSize)
        );

        if (lastDoc) {
            q = query(q, startAfter(lastDoc));
        }

        const snapshot = await getDocs(q);
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // Proactively save these to local cache as well
        const table = (collectionName === 'cards' ? dbLocal.cards : dbLocal.emails) as any;
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
