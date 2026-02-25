# 3. DATABASE DOCUMENTATION

Because this app utilizes a Local-First architecture, the database exists in two parallel states: 
1. **Cloud Database:** Firebase Firestore (NoSQL Document Store).
2. **Local Database:** Dexie.js (IndexedDB).

The definitions heavily mirror each other.

Below are the Document/Row structures based on the `db.ts` file.

## 1. Table/Collection: `cards`

**Purpose:** Stores user credit cards, bank cards, or debit cards.
**Firestore Path:** `/cards` (Top-level collection, secured by Firestore Rules to `userId`).
**IndexedDB Table:** `cards`

### Columns / Fields:
- `id` (String / UUID): Primary key. Matches Firestore document ID.
- `userId` (String): The Firebase Authentication UID of the owner.
- `cardNumber` (String): The full card number (e.g. "4111 1111 1111 1111").
- `cardholderName` (String): Name on the card.
- `expiryDate` (String): MM/YY string.
- `cvv` (String): 3 or 4 digit security code.
- `status` (String): Status label (e.g., 'active', 'inactive', 'expired', 'blocked', 'pending').
- `note` (String): Multiline user comments.
- `bookmarked` (Boolean): Frontend toggle to pin/highlight the record.
- `updatedAt` (Number / Firestore Timestamp): UNIX timestamp in milliseconds. **CRITICALLY IMPORTANT** for Delta Sync.
- `deleted` (Boolean, Optional): If true, represents a soft delete sent from Firestore to tell Dexie to remove the local copy.

### Relationships:
- `userId` belongs to an authenticated Firebase User.
- May have a One-to-Many relationship with `alarms` (AlarmRecord.`recordId` references Card.`id`).

## 2. Table/Collection: `emails`

**Purpose:** Stores user email accounts, passwords, recovery data, and 2FA secrets.
**Firestore Path:** `/emails`
**IndexedDB Table:** `emails`

### Columns / Fields:
- `id` (String / UUID): Primary key. Matches Firestore Document ID.
- `userId` (String): Owner's UID.
- `email` (String): Account email address.
- `password` (String): Account password. Stored in plaintext in the DB (since the app's purpose is a password manager), relying on overall Firebase Auth security.
- `secret2FA` (String): Base32 encoded TOTP secret (e.g., `JBSWY3DPEHPK3PXP`). Used locally to generate 6-digit verification codes.
- `recoveryEmail` (String, Optional): Fallback email.
- `phone` (String, Optional): Bound phone number for the account.
- `status` (String): Enum string (active, blocked, etc).
- `note` (String): Freeform text.
- `bookmarked` (Boolean): Highlights the record.
- `updatedAt` (Number / Firestore Timestamp).

### Relationships:
- Similar to Cards, alarms can reference an Email record.

## 3. Table/Collection: `alarms`

**Purpose:** Stores time-based reminders attached to specific records.
**Firestore Path:** (No continuous Firestore sync explicitly seen for purely local alarms, however, usually saved locally). 
**IndexedDB Table:** `alarms`

### Columns / Fields:
- `id` (String): UUID.
- `userId` (String): Owner UID.
- `recordId` (String): Foreign Key referencing `cards.id` or `emails.id`.
- `collection` (String): 'cards' | 'emails'. Identifies which table `recordId` belongs to.
- `label` (String): Quick display text (e.g., "****1234" for a card, or "tung@gmail.com").
- `note` (String): Message to display in the push notification.
- `triggerAt` (Number): Exact UNIX timestamp (in milliseconds) when the alarm must fire.
- `fired` (Number: 0 | 1): **Indexed flag.** 0 means pending, 1 means already thrown as a push notification. Uses Numbers instead of Booleans because IndexedDB indexes boolean values poorly.
- `doneAt` (Number, Optional): Timestamp when the user explicitly marked the task as "Resolved/Confirmed".
- `createdAt` (Number): Analytics/sorting creation timestamp.

## 4. Table/Collection: `notifications`

**Purpose:** An entirely local history log of alarms that have successfully fired.
**IndexedDB Table:** `notifications` (Local Only)

### Columns / Fields:
- `id` (String): UUID.
- `userId` (String): Owner UID.
- `title` (String): Display title text.
- `body` (String): Display body/note text.
- `recordId` (String, Optional): Foreign key to the related item, allowing clicking the notification to open the item detail modal natively.
- `collection` (String, Optional): 'cards' | 'emails'.
- `readAt` (Number, Optional): If undefined, the notification is Unread. Once clicked/marked, stores the UNIX read time.
- `createdAt` (Number): Sort key for chronological display.

## 5. Table/Collection: `syncMeta`

**Purpose:** Purely local utility table to track Delta Sync checkpoints to drastically reduce Firestore read bills.
**IndexedDB Table:** `syncMeta` (Local Only)

### Columns / Fields:
- `userId` (String): Owner UID.
- `collectionName` (String): Defines the namespace, e.g., 'cards' or 'emails'.
- `lastSyncTime` (Number): The maximum `updatedAt` seen during the last successful Firestore batch pull.

### Interactivity Example:
When the app launches, `SyncService` reads `syncMeta` for `emails`. If `lastSyncTime` is `1710002000000`, it queries Firestore: `WHERE userId == 'myUid' AND updatedAt > 1710002000000`. 
Any changes made are upserted into IndexedDB's `emails`, and `syncMeta` is updated to the new maximum `updatedAt`.

## 6. Table/Collection: `users/{uid}/meta/settings`
**Purpose:** Stores app preferences in Firestore.
**Firestore Path:** `/users/{uid}/meta/settings` (Single document per user).

### Columns / Fields (JSON Blob):
- `theme`: 'light' | 'dark' | 'system'
- `pageSize`: Number (e.g., 20, 50, 100)
- `defaultTab`: 'cards' | 'emails'
- `enableSound`: Boolean
- `showSensitiveInfo`: Boolean
- `compactMode`: Boolean
