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
    linkedEmails?: string[]; // Array of associated LocalEmailRecord IDs
    payAmount?: number;
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
    categoryId?: string; // Links this email to a category
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

export interface EmailCategoryRecord {
    id: string;
    userId: string;
    name: string;
    order?: number;
    createdAt: number;
    updatedAt: number;
}

export interface StatusRecord {
    id: string;
    userId: string;
    collection: 'cards' | 'emails'; // Which collection this status belongs to
    name: string;
    order?: number;
    colorDot?: string; // e.g. 'bg-emerald-400'
    colorBg?: string; // e.g. 'bg-emerald-50'
    colorText?: string; // e.g. 'text-emerald-700'
    colorBorder?: string; // e.g. 'border-emerald-200'
    createdAt: number;
    updatedAt: number;
}

export class AppDB extends Dexie {
    cards!: Table<LocalCardRecord>;
    emails!: Table<LocalEmailRecord>;
    syncMeta!: Table<SyncMeta>;
    alarms!: Table<AlarmRecord>;
    notifications!: Table<NotificationRecord>;
    categories!: Table<EmailCategoryRecord>;
    statuses!: Table<StatusRecord>;

    constructor() {
        super('PersonalManagerDB');
        this.version(1).stores({
            cards: 'id, userId, status, updatedAt',
            emails: 'id, userId, status, updatedAt',
            syncMeta: '[userId+collectionName]',
        });
        this.version(6).stores({ // Bumped version to 6 for new table
            cards: 'id, userId, status, updatedAt',
            emails: 'id, userId, status, categoryId, updatedAt', // Added categoryId index to emails
            syncMeta: '[userId+collectionName]',
            alarms: 'id, userId, recordId, triggerAt, fired, doneAt, updatedAt',
            notifications: 'id, userId, createdAt, readAt, recordId, collection, updatedAt',
            categories: 'id, userId, updatedAt',
        });
        this.version(7).stores({ // Bumped version to 7 for statuses table
            cards: 'id, userId, status, updatedAt',
            emails: 'id, userId, status, categoryId, updatedAt',
            syncMeta: '[userId+collectionName]',
            alarms: 'id, userId, recordId, triggerAt, fired, doneAt, updatedAt',
            notifications: 'id, userId, createdAt, readAt, recordId, collection, updatedAt',
            categories: 'id, userId, updatedAt',
            statuses: 'id, userId, collection, updatedAt',
        });
    }
}

export const dbLocal = new AppDB();
