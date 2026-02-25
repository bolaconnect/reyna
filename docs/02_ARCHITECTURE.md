# 2. ARCHITECTURE

## Overall Architecture Pattern
The project utilizes a **Local-First Client-Server Architecture** configured specifically for Firebase Backend-as-a-Service (BaaS). Rather than traditional MVC (Model-View-Controller) where the server processes requests and returns HTML/JSON, the React application directly connects to the database (Firestore) and handles all business logic on the client.

To mitigate slow network speeds and support offline capabilities, the architecture introduces a **Local Cache Layer (IndexedDB)** via Dexie.js.

```text
[ React UI Components ]  <--->  [ Custom Hooks ]  <--->  [ Local DB (Dexie) ]
                                      |
                                      V
                             [ Sync Services ]
                                      |
                                      V
                           [ Firebase Firestore ]
```

## Detailed Layer Breakdown

### 1. View Layer (React Components)
The UI is composed of functional React components interacting with custom hooks. Components never directly query Firebase; they query Dexie locally or use hooks that abstract the data fetching process.
- **Routing:** Handled by `react-router`. Validates authentication at the root. If not authenticated, redirects to `/login`.
- **Modals via Portals:** Modals (`SettingsModal`, `TimerModal`, `PinGuard`) are often appended directly to the DOM to avoid `z-index` stacking context issues.

### 2. State & Context Layer
- **`AuthContext`:** Listens to `firebase/auth`'s `onAuthStateChanged`. Exposes the `user` object and `loading` boolean globally. All data fetching is paused until `user` is populated.
- **`VisibilityContext`:** Global toggle for "Hide Sensitive Data". Uses an eye icon in the header. When false, custom masking utilities replace text with `*`.
- **`ThemeProvider`:** Reads user preference from `useUserSettings`, attaches/removes the `.dark` class on the native DOM `<html>` tag, and sets up listeners for OS-level scheme `(prefers-color-scheme: dark)`.

### 3. Business Logic Layer (Custom Hooks & Services)
- **`useFirestoreSync<T>` Hook:** 
  - Immediately loads data from `dbLocal` (Dexie) preventing loading spinners.
  - Subsequently calls `SyncService` to pull down changes dynamically from Firestore (Delta Sync).
  - Listens to real-time `onSnapshot` queries from Firestore for immediate updates when other devices modify data.
- **`useAlarms` Hook:** 
  - An internal interval (polling every 15 seconds) running silently inside the `Dashboard`.
  - Queries `dbLocal.alarms` for any alarm where `triggerAt <= Date.now()` and `fired == 0`.
  - Executes Push Notifications and moves the alarm to the `notifications` log.
- **`SyncService` (The Core Sync Engine):**
  - Evaluates `lastSyncTime` from `syncMeta` table.
  - If `lastSyncTime` is `0` (fresh login), it requests a full paginated dump of the user's data from Firestore, saving it to Dexie.
  - If `lastSyncTime` > `0`, it queries Firestore for `updatedAt > lastSyncTime`. This drastically reduces read operations and speeds up sync times.

### 4. Database Layer
- **Local (IndexedDB - Dexie.js):** 
  - Contains tables: `cards`, `emails`, `alarms`, `notifications`, `syncMeta`.
  - Extremely fast reads. Enables the UI to support full-text search, complex filtering, and pagination without hitting external API rate limits or latency.
- **Remote (Firestore):** 
  - Contains collections: `users/`, `cards/`, `emails/`. *(Note: Data is commonly structured either top-level with a `userId` field, or nested `users/{uid}/cards` depending on exact rules. This project uses top-level collections `cards`, `emails` filtered by `where('userId', '==', uid)`).*
  - `updatedAt` (Timestamp) field is explicitly required on every mutation to enable Delta Sync.
  - Implements soft deletes (`deleted: true`) instead of hard deletion sometimes, allowing the SyncService to propagate deletions to local Dexie copies.

### 5. Utilities Layer
- **TOTP Generation:** Runs fully client-side using JavaScript cryptographic algorithms. It decodes the Base32 secret and generates the HMAC-SHA1 hash based on UNIX epoch time, strictly isolated from external APIs for security.
- **Crypto & Masking:** Masks strings like cross-site display `***1234`.

## Data Flow Pipeline
Unlike traditional Controller -> Service -> Repository:
1. **Component Trigger:** User clicks "Save Email".
2. **Direct Firestore Mutation:** The component calls `updateDoc(doc(db, 'emails', id), payload)`.
3. **Firestore Responds:** The remote database confirms the commit.
4. **Listener Reacts:** `useFirestoreSync` has an active `onSnapshot` listener. It detects the change.
5. **Local Propagation:** The snapshot callback receives the updated document, overwrites it in IndexedDB (`dbLocal.emails.bulkPut()`).
6. **UI Updates:** The `useLiveQuery` component hook (or state update inside `useFirestoreSync`) notices the IndexedDB jump and instantly re-renders the `EmailsTable` component.

*Note: For maximum optimistic-UI speed, some parts of the app may update Dexie simultaneously with the Firestore write.*
