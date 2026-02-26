import Dexie, { Table } from 'dexie';

export interface SyncMeta {
    userId: string;
    collectionName: string;
    lastSyncTime: number;
}

export interface LocalCardRecord {
    id: string;
    userId: string;
    cardNumber: string;
    cardholderName: string;
    expiryDate: string;
    cvv: string;
    status: string;
    note: string;
    linkedEmails?: string[]; // Mảng các email ID
    updatedAt: number;
}

export interface LocalEmailRecord {
    id: string;
    userId: string;
    email: string;
    password: string;
    secret2FA: string;
    recoveryEmail?: string;
    phone?: string;
    status?: string;
    note?: string;
    liveStatus?: string;
    categoryId?: string; // Tên danh mục hoặc ID danh mục
    updatedAt: number;
}

export interface AlarmRecord {
    id: string;           // uuid
    userId: string;
    recordId: string;     // card or email id
    collection: 'cards' | 'emails';
    label: string;        // display label (card number tail or email)
    note: string;         // user note
    triggerAt: number;    // unix ms timestamp
    fired: 0 | 1;         // 0 = false, 1 = true (for IndexedDB index compatibility)
    doneAt?: number;      // unix ms when user marked as done
    createdAt: number;
    updatedAt: number;
}

export interface NotificationRecord {
    id: string;           // uuid
    userId: string;
    title: string;
    body: string;
    recordId?: string;    // for navigation
    collection?: 'cards' | 'emails'; // for navigation
    readAt?: number;      // undefined = unread
    createdAt: number;
    updatedAt: number;
}

export interface CategoryRecord {
    id: string;
    userId: string;
    name: string;
    updatedAt: number;
}

export class AppDB extends Dexie {
    cards!: Table<LocalCardRecord>;
    emails!: Table<LocalEmailRecord>;
    categories!: Table<CategoryRecord>;
    syncMeta!: Table<SyncMeta>;
    alarms!: Table<AlarmRecord>;
    notifications!: Table<NotificationRecord>;

    constructor() {
        super('PersonalManagerDB');
        this.version(1).stores({
            cards: 'id, userId, status, updatedAt',
            emails: 'id, userId, status, updatedAt',
            syncMeta: '[userId+collectionName]',
        });
        this.version(6).stores({
            cards: 'id, userId, status, updatedAt', // added linkedEmails implicitly (arrays aren't indexed here usually unless multiEntry)
            emails: 'id, userId, status, categoryId, updatedAt',
            categories: 'id, userId, name, updatedAt',
            syncMeta: '[userId+collectionName]',
            alarms: 'id, userId, recordId, triggerAt, fired, doneAt, updatedAt',
            notifications: 'id, userId, createdAt, readAt, recordId, collection, updatedAt',
        }).upgrade(tx => {
            // Add default structure if needed or handle migration
        });
    }
}

export const dbLocal = new AppDB();
