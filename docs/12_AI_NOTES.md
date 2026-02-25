# 12. IMPORTANT NOTES FOR AI

If you are an AI reading this project, pay extreme attention to the principles outlined here. This architecture relies on somewhat unconventional but highly optimized patterns. Ignorance of these rules will cause data corruption, excessive cloud billing, or UI desyncs.

## 1. NEVER Ignore `updatedAt` During Mutations
Every single time you mutate a document in Firestore (using `updateDoc` or `setDoc`), you **MUST** include `updatedAt: serverTimestamp()`. 
**Why?** The entire Custom Delta Sync Engine relies on `updatedAt > lastSyncTime`. If you update a document and fail to bump the timestamp, the sync loops belonging to the user's phone, laptop, and tablet will simply ignore the change forever. The change will never replicate locally.

## 2. Use `dbLocal` (Dexie) For All Reads
Do not call `getDocs(collection(...))` directly within components for UI rendering.
**Why?** The app implements a Local-First strategy. Components should `useLiveQuery` from Dexie (`src/app/lib/db.ts`) or `useFirestoreSync()`. Hitting Firestore for rendering reads will:
- Introduce massive UI latency (500ms+ versus 3ms natively).
- Incur unnecessary Firestore document read charges (costs scale with DB reads).
- Break the offline-capacity guarantee of the app.
All Firestore reads are strictly centralized inside `syncService.ts`.

## 3. Understand "Soft Deletes"
When providing a "Delete" function to the user, **DO NOT** execute `deleteDoc(doc(db, 'cards', id))`. 
Instead, you **MUST** execute:
`updateDoc(..., { deleted: true, updatedAt: serverTimestamp() })`.
**Why?** If you physically delete the document, the Delta Sync queries `WHERE updatedAt > X` will pull nothing. The listener will not know a document was destroyed. By setting the `deleted` flag, the engine fetches the ghost document containing the flag, executes a local deletion on Dexie `dbLocal.cards.delete(id)`, completely removing it from UI memory on all devices locally, while securely neutralizing it in the cloud.

## 4. TOTP Code is Highly Sensitive
The `generateTOTP` and Base32 decoders execute raw ArrayBuffer and Bitwise math. Do not modify `utils/totp.tsx` without rigorous understanding of RFC 6238. Modifying Big Endian buffers incorrectly will silently skew TOTP hashes, locking users out of their 2FA accounts entirely.

## 5. UI Modals
The App prefers overlaying components (like `EmailDetailModal.tsx`) dynamically based on React state (e.g. `const [detailRecord, setDetailRecord] = useState(null)`) attached at the root of the Table components. Modals generally perform edits, push to Firestore, and depend on the `useFirestoreSync` websocket to catch the change and ripple it back down into the table view underneath, negating the need for complex localized Prop Drilling callbacks.

## 6. Theming Uses CSS Variables
Tailwind is configured via `src/styles/theme.css`. The `<html className="dark">` property remaps variables. Do not waste time manually tracking `text-gray-900 dark:text-gray-100` everywhere. Use the standard Tailwind classes. The `.dark` block inside `theme.css` has already overwritten the literal HEX values of `bg-white`, `bg-gray-50`, `text-gray-800` to be dark-mode contextual directly.

## 7. `alarms` is Polled, Not Pushed
Do not attempt to write a setTimeout or cron job for alarms in the cloud backend. Time triggers are evaluated locally inside `useAlarms.ts` via an infinite `while/setInterval` loop using Dexie numeric range matching. This guarantees notifications fire strictly based on the user's Local Machine Clock (ideal for offline, zero-latency triggers). Make sure to query using IndexedDB's `a.fired === 0` pattern.
