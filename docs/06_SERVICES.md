# 6. SERVICE LOGIC

All complex business logic outside of React UI rendering is encapsulated in service classes, custom hooks, and utility functions.

## 1. `SyncService`
**Purpose:** Reconciles the local SQLite-like (IndexedDB) database with the remote NoSQL (Firestore) database efficiently.

### `asyncSyncBatch(collectionName, userId, lastSyncTime)`
**Algorithm Step-by-Step:**
1. Determine Table (`cards` or `emails`).
2. Evaluate `lastSyncTime`. 
3. **If Branch (Fresh Sync / `lastSyncTime === 0`):**
   - Execute a `getDocs` loop pulling max 500 items per batch.
   - Use `startAfter(lastDoc)` for pagination.
   - For every document, if `updatedAt` is greater than the running `maxFoundSyncTime`, update `maxFoundSyncTime`.
   - `bulkPut` everything into Dexie.
   - Update `syncMeta` table with the new `lastSyncTime`.
4. **Else Branch (Delta Sync):**
   - Query Firestore for items where `updatedAt > lastSyncTime`.
   - Separate results into two arrays: `toUpsert` (valid records) and `toDelete` (records mapped with `{deleted: true}`).
   - `dbLocal.table.bulkPut(toUpsert)`
   - `dbLocal.table.bulkDelete(toDelete)`
   - Set new `lastSyncTime` from the Math.max of `toUpsert`.

### `syncCollection(collectionName, userId)`
**Logic Rules:** Wraps `asyncSyncBatch` with a fallback strategy. If a Delta Sync fails because Firestore hasn't finished building its compound index (yielding a `failed-precondition` error), the catch block intercepts it, warns the console, and defensively falls back to `asyncSyncBatch(..., 0)` to perform an unindexed full pull so the user isn't stuck.

## 2. TOTP Utility (`utils/totp.tsx`)
**Purpose:** Cryptographic generation of Time-Based One-Time Passwords.

### `generateTOTP(secretBase32)`
**Algorithm:**
1. Base32 decode the secret string into a byte array. Uses an alphabet dictionary to map characters to 5-bit sequences.
2. Evaluate `window / 30`. Get the UNIX timestamp `/ 30000ms`, integer division, to find the current 30-second window block.
3. Pack the Window Integer into an 8-byte (64-bit) Hex String buffer (Big Endian).
4. **Web Crypto API:** Use `crypto.subtle.importKey` with the HMAC-SHA1 algorithm.
5. **Sign:** Use `crypto.subtle.sign` to hash the 8-byte Window buffer against the decoded secret key.
6. **Dynamic Truncation:** Extract an offset from the last 4 bits of the hash byte array.
7. Grab a 4-byte slice starting at the offset, applying a mask `0x7FFFFFFF` to strip the sign bit.
8. Output modulus 1,000,000 to extract exactly 6 digits. Pad with leading zeroes.

### `getRemainingSeconds()`
**Logic:** `30 - (Math.floor(Date.now() / 1000) % 30)`. Determines exact seconds left until the TOTP hash regenerates.

### `getTOTPWindow()`
**Logic:** `Math.floor(Date.now() / 30000)`. Acts as a cache-buster. The `EmailsTable` checks if this integer changes. If it does, it immediately invokes `refreshCodes()` to re-run the SHA1 hashes.

## 3. String Masking (`utils/mask.tsx`)
**Purpose:** Formatting sensitive text for "Hide" mode.

### `maskPassword(pwd)`
Returns `••••••••` unconditionally if hidden.

### `maskEmail(email)`
Splits at `@`. Shows first 2 characters, masks the rest with `*`, and shows the domain. 
*Example:* `tung.nguyen@gmail.com` -> `tu***@gmail.com`. If no `@` exists, masks the whole string.

## 4. `useUserSettings.ts`
**Purpose:** Reconcile LocalStorage speed with Firestore permanence.
**Logic Flow:**
1. Read from `localStorage` immediately. Inject into `useState`.
2. Push state to a subscriber list (singleton array `listeners`). This avoids massive React Context re-renders on components that don't need settings.
3. Setup `debouncer`: On any setting tweak via the UI, set `localStorage` instantly. Trigger a 1000ms timer. If the user tweaks another toggle inside 1000ms, cancel the old timer and start a new one. Once the timer expires, push the merged JSON block to Firestore.
