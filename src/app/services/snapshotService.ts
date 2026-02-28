import {
    collection,
    query,
    where,
    getDocs,
    doc,
    writeBatch,
    Timestamp,
    orderBy,
    limit,
    setDoc
} from 'firebase/firestore';
import { db as firestoreDb } from '../../firebase/config';
import { dbLocal } from '../lib/db';
import { SyncableCollection } from './syncService';

const CHUNK_SIZE = 2000; // Records per mega-document

export interface SnapshotChunk {
    userId: string;
    collectionName: string;
    chunkIndex: number;
    data: any[];
    timestamp: number;
    count: number;
}

export class SnapshotService {
    /**
     * Hydrate a local collection from snapshots.
     * Reduces reads by fetching mega-documents.
     */
    static async hydrateFromSnapshots(collectionName: SyncableCollection, userId: string): Promise<number> {
        // Hydration log is silent by default unless it finds major data

        const q = query(
            collection(firestoreDb, 'snapshots'),
            where('userId', '==', userId),
            where('collectionName', '==', collectionName),
            orderBy('chunkIndex', 'asc')
        );

        const snapshot = await getDocs(q);
        if (snapshot.empty) {
            return 0;
        }

        let totalRecords = 0;
        let maxTimestamp = 0;

        // Use a map instead of switch-case for table access if needed, 
        // but here we just need the table reference
        const table = (dbLocal as any)[collectionName];
        if (!table) return 0;

        for (const docSnap of snapshot.docs) {
            const chunk = docSnap.data() as SnapshotChunk;
            if (chunk.data && chunk.data.length > 0) {
                // Ensure IDs are preserved from the data array
                await table.bulkPut(chunk.data);
                totalRecords += chunk.data.length;
                if (chunk.timestamp > maxTimestamp) {
                    maxTimestamp = chunk.timestamp;
                }
            }
        }

        if (totalRecords > 0) {
            console.info(`[SnapshotService] Hydrated ${totalRecords} records for ${collectionName}.`);
        }
        return maxTimestamp;
    }

    /**
     * Build snapshots from existing collection data.
     * To be used by an admin or triggered manually.
     */
    static async buildSnapshots(collectionName: SyncableCollection, userId: string) {
        console.log(`[SnapshotService] Building snapshots for ${collectionName}...`);

        // 1. Fetch ALL data for this user from the main collection
        // Note: For 100k rows, this is expensive in terms of reads, but it's a one-time setup.
        const q = query(
            collection(firestoreDb, collectionName),
            where('userId', '==', userId)
        );

        const snapshot = await getDocs(q);
        if (snapshot.empty) return;

        const allRecords = snapshot.docs.map(d => ({
            id: d.id,
            ...d.data(),
            updatedAt: d.data().updatedAt instanceof Timestamp ? d.data().updatedAt.toMillis() : (d.data().updatedAt || Date.now())
        }));

        // 2. Sort by updatedAt to find the overall timestamp
        let maxTimestamp = Math.max(...allRecords.map(r => r.updatedAt));

        // 3. Chunk the data
        const chunks: any[][] = [];
        for (let i = 0; i < allRecords.length; i += CHUNK_SIZE) {
            chunks.push(allRecords.slice(i, i + CHUNK_SIZE));
        }

        // 4. Save chunks to 'snapshots' collection
        // We use a specific ID format: {userId}_{collectionName}_{index}
        for (let i = 0; i < chunks.length; i++) {
            const chunkId = `${userId}_${collectionName}_${i}`;
            const chunkData: SnapshotChunk = {
                userId,
                collectionName,
                chunkIndex: i,
                data: chunks[i],
                timestamp: maxTimestamp,
                count: chunks[i].length
            };

            await setDoc(doc(firestoreDb, 'snapshots', chunkId), chunkData);
            console.log(`[SnapshotService] Saved chunk ${i} (${chunks[i].length} records)`);
        }

        // 5. Delete any old chunks if current count is less (optional but good for cleanup)
        // Implementation omitted for brevity but recommended for production.

        console.log(`[SnapshotService] Snapshot build complete for ${collectionName}. Total chunks: ${chunks.length}.`);
    }

    /**
     * Automatically builds a new chunk if there's enough new data.
     * Prevents having too many "delta" reads on subsequent logins.
     */
    static async autoSnapshotIfNeeded(collectionName: SyncableCollection, userId: string) {
        try {
            // 1. Get the last snapshot info for this collection
            const qLast = query(
                collection(firestoreDb, 'snapshots'),
                where('userId', '==', userId),
                where('collectionName', '==', collectionName),
                orderBy('chunkIndex', 'desc'),
                limit(1)
            );

            const lastSnap = await getDocs(qLast);
            let lastIndex = -1;
            let lastTimestamp = 0;

            if (!lastSnap.empty) {
                const snapDoc = lastSnap.docs[0].data();
                lastIndex = snapDoc.chunkIndex;
                lastTimestamp = snapDoc.timestamp;
            }

            // 2. Query local Dexie for records newer than the last snapshot
            const table = (dbLocal as any)[collectionName];
            if (!table) return;

            // We count how many records are newer than the last snapshot
            const newRecords = await table
                .where('updatedAt')
                .above(lastTimestamp)
                .toArray();

            // 3. If we have enough records for a new chunk
            if (newRecords.length >= CHUNK_SIZE) {
                console.log(`[SnapshotService] Auto-Snapshot: Found ${newRecords.length} new records. Creating chunk ${lastIndex + 1}...`);

                const chunkData = newRecords.slice(0, CHUNK_SIZE);
                const maxUpdateInChunk = Math.max(...chunkData.map((r: any) => r.updatedAt));

                const newChunkIndex = lastIndex + 1;
                const chunkId = `${userId}_${collectionName}_${newChunkIndex}`;

                const chunk: SnapshotChunk = {
                    userId,
                    collectionName,
                    chunkIndex: newChunkIndex,
                    data: chunkData,
                    timestamp: maxUpdateInChunk,
                    count: chunkData.length
                };

                await setDoc(doc(firestoreDb, 'snapshots', chunkId), chunk);
                console.log(`[SnapshotService] Auto-Snapshot: Chunk ${newChunkIndex} saved.`);
            }
        } catch (e: any) {
            console.warn(`[SnapshotService] autoSnapshotIfNeeded failed for ${collectionName}:`, e.message);
        }
    }
}
