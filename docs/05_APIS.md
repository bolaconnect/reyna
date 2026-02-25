# 5. API DOCUMENTATION (Firebase Firestore SDK)

Since this project completely omits a traditional REST/GraphQL backend in favor of Firebase BaaS, "APIs" in this context refer to the Firebase SDK operations executed directly from the client.

All operations authenticate automatically using the persistent Firebase ID Token.

## 1. Authentication Endpoints

### Login
- **Method / SDK:** `signInWithEmailAndPassword(auth, email, password)`
- **Called From:** `Login.tsx`
- **Request Body:** Email, Password strings.
- **Validation:** Frontend checks if empty. Backend checks format and compares hash.
- **Response:** UserCredential object containing the `user.uid`.
- **Internal Processing:** Sets IndexedDB auth persistence automatically via Firebase. Modifies `AuthContext` to update `user` state.

### Register
- **Method / SDK:** `createUserWithEmailAndPassword(auth, email, password)`
- **Called From:** `Login.tsx`
- **Internal Processing:** Creates user in Firebase Identity. Returns credential. Automatically signs user in. 

## 2. Sync / Read Operations

### Initial Fetch Strategy (Full Dump)
- **SDK Query:** 
  ```ts
  query(collection(db, 'cards'), where('userId', '==', uid), limit(500), startAfter(lastDoc))
  ```
- **Called From:** `SyncService.asyncSyncBatch`
- **Purpose:** Pulls down the entire dataset into IndexedDB if `syncMeta.lastSyncTime` is `0`.
- **Validation:** Firestore Rules ensure `userId == request.auth.uid`.
- **Response:** Array of DocumentSnapshots converted to JSON with injected `id` fields.

### Delta Sync Strategy
- **SDK Query:** 
  ```ts
  query(
      collection(db, 'cards'),
      where('userId', '==', uid),
      where('updatedAt', '>', Timestamp.fromMillis(lastSyncTime)),
      orderBy('updatedAt', 'asc'),
      limit(500)
  )
  ```
- **Purpose:** Heavily optimized fetch. Only returns records modified by other devices or sessions since the exact timestamp of the last local sync.

### Real-time Listener (onSnapshot)
- **SDK Query:** Same as Delta Sync, but wrapped in `onSnapshot(query, callback)`.
- **Called From:** `useFirestoreSync.ts`
- **Internal Processing:** Keeps an open WebSocket connection to Google's servers. Instantly pushes any external `updateDoc` or `setDoc` payloads down to the client.

## 3. Write Operations (Mutations)

### Upsert (Add/Edit)
- **SDK Call:** `updateDoc(doc(db, 'cards', id), { ...payload, updatedAt: serverTimestamp() })` or `setDoc()`.
- **Called From:** `CardsTable.tsx` (Inline edits), `CardDetailModal.tsx` (Form save).
- **Internal Processing:** Modifies the document. The addition of `serverTimestamp()` is MANDATORY. Without it, the Delta Sync listener will fail to calculate sequence properly.
- **Error Handling:** If `updateDoc` fails with `not-found`, the DB assumes it was deleted remotely while offline. The local catch block immediately deletes it from IndexedDB and refreshes the UI.

### Soft Deletion
- **SDK Call:** `updateDoc(doc(db, 'cards', id), { deleted: true, updatedAt: serverTimestamp() })`
- **Called From:** Delete Handlers.
- **Internal Processing:** Why soft delete? Because `onSnapshot` queries with `where('updatedAt', '>')` cannot detect *hard deletes* (destroyed documents disappear completely, including their timestamps). By updating it to `deleted: true`, the listener receives the payload, notices the flag, and triggers an explicit IndexedDB `dbLocal.cards.delete(id)`.

## 4. User Preferences API

### Get Preferences
- **SDK Call:** `getDoc(doc(db, 'users', uid, 'meta', 'settings'))`
- **Called From:** `useUserSettings.ts` hook initialization.
- **Internal Processing:** Overwrites `localStorage` configurations remotely stored across devices.

### Patch Preferences
- **SDK Call:** `setDoc(doc(db, 'users', uid, 'meta', 'settings'), nextPrefs, { merge: true })`
- **Called From:** `useUserSettings.ts` (with a 1000ms debounce timer via `setTimeout`).
- **Internal Processing:** Only fires if the user stops rapidly toggling switches.

## Database Operations (Local IndexedDB API)

### Bulk Write
- **SDK Call:** `dbLocal.cards.bulkPut(arrayOfRecords)`
- **Called From:** Snapshot listeners and paginated fetchers.
- **Performance:** Bulk operations in IndexedDB are up to 100x faster than sequential single `put()` calls.

### Numeric Indexing Match
- **SDK Call:** `dbLocal.alarms.where('fired').equals(0).and(a => a.triggerAt <= Date.now()).toArray()`
- **Called From:** `useAlarms.ts` polling interval.
- **Performance:** Numeric indices bypass linear array table scans, allowing extreme scalability even with 100,000+ alarms stored locally.
