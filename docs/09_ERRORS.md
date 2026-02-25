# 9. ERROR HANDLING

This project generally uses defensive programming and silent failing or graceful degradation rather than strict, intrusive Error Boundaries.

## 1. Firebase Auth Errors (`Login.tsx`)
**Possible Errors:** `auth/wrong-password`, `auth/user-not-found`, `auth/email-already-in-use`, `auth/weak-password`, `auth/invalid-email`, `auth/invalid-credential`.
**Where They Occur:** During submission of `signInWithEmailAndPassword` or `createUserWithEmailAndPassword`.
**How They Are Handled:** 
- A standard `.catch(err)` block inspects `err.code`.
- Depending on the code, a specific, user-friendly string is passed to `setError("string")`.
- The UI Reacts by displaying the Error string in a styled red bounded box (`<div className="bg-red-50 text-red-500...">`) right above the form fields.

## 2. Sync Engine Index Errors (`SyncService.ts`)
**Possible Errors:** `failed-precondition` (Firestore requires a Composite Index).
**Where They Occur:** When `asyncSyncBatch` attempts to execute the highly optimized Delta query (`where userId == X && updatedAt > Y orderBy updatedAt limit 500`).
**How They Are Handled:** 
- The error is evaluated (`err.message.includes('index')`).
- If it is indeed an index error, the system prints a `console.warn(...)`.
- It then executes a **FALLBACK QUERY**, dropping the `orderBy updatedAt` rule, and simply querying pulling the entire user's database. This keeps the application 100% functional (albeit slower over network operations) while letting the developer build the Firestore indexes in the background via the console link.

## 3. Real-time Snapshot Index Errors (`useFirestoreSync.ts`)
**Possible Errors:** `failed-precondition` inside `onSnapshot()` listener.
**Where They Occur:** Component Mount, initiating WebSocket listeners for new writes.
**How They Are Handled:** 
- The snapshot callback’s error handler intercepts it.
- **Action:** Pauses listening silently. Emits `console.warn("[useFirestoreSync] Index not ready... Listening paused.")`.
- **Result:** The user can still read locally and perform operations. They just won't get instant live-updates from *other tabs/devices* until they hard refresh or the index is built.

## 4. Deletion Desynchronization ('not-found')
**Possible Errors:** Changing the value of a document that another device already deleted.
**Where They Occur:** Inline table editors or Modals executing `updateDoc()`.
**How They Are Handled:**
- A `try/catch` block surrounds `updateDoc`.
- `catch (err)` checks if `err.code === 'not-found'`.
- If true, the frontend implies: "I guess this was deleted by another browser tab while I was offline".
- It immediately patches the local UI by executing `dbLocal.emails.delete(id)` to erase the ghost item and reruns `refresh()` so the UI matches the new remote truth.

## 5. Offline Errors (Network Down)
**Possible Errors:** Client is disconnected. Firebase network commands fail or hang.
**How They Are Handled:**
- Firestore's built-in SDK logic queues writes (`updateDoc`, `setDoc`) locally.
- The UI receives immediate optimistic return codes.
- `useFirestoreSync` never breaks. `loadLocal()` still grabs from Dexie. The user is entirely unaware they are offline, except that real-time sync with other devices stops until reconnection.

## 6. Invalid Base32 Secret Errors (`totp.tsx`)
**Possible Errors:** User pastes in terrible data ("HELLO WORLD 123") instead of a Base32 secret.
**Where They Occur:** Inside `generateTOTP` via `EmailsTable`.
**How They Are Handled:**
- Cryptographic code handles bad decoding smoothly. If it cannot decipher bytes, it gracefully fails (returns "------" or stops calculation) rather than crashing the React application with an Unhandled Runtime Exception.
