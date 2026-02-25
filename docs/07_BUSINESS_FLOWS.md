# 7. FULL BUSINESS FLOWS

This section documents the step-by-step logic of major application processes, tracing from UI interaction, through services, down to datastore impact.

---

## 1. Authentication Flow (Login / Register)

1. **Trigger:** User opens `/login`. Fills in email (`user@test.com`) and password (`Password123`), hits "Sign In".
2. **Frontend Validation:** `handleSubmit` executes. Checks if strings are blank. Sets `submitting = true`. Clears past errors.
3. **API Call:** Awaits `signInWithEmailAndPassword(auth, email, password)`.
4. **Backend Processing:** Firebase SDK contacts Google Identity toolkit. Verifies hashes. 
5. **Database Changes:** Internal Firebase Auth issues a JWT token. Stores it invisibly in the Browser's IndexedDB for cross-session persistence.
6. **Error Case:** Returns `auth/wrong-password` or `auth/user-not-found`. The UI intercepts this via the `catch` block and sets descriptive message: "Invalid email or password."
7. **Success Case (State Change):** Auth SDK listener inside `AuthContext` detects the token. It populates `user.uid`.
8. **Routing:** `Login.tsx`'s `useEffect` detects `user != null` and runs `navigate('/dashboard')`.

---

## 2. Boot & Initial Synchronization Flow (Critical Path)

1. **Trigger:** User lands on `/dashboard` and `useFirestoreSync` hook mounts.
2. **Frontend Behavior:** Shows skeleton loaders or previous cached data.
3. **Local Cache Read:** `loadLocal()` queries IndexedDB for `dbLocal.cards.where('userId').equals(uid)`. Immediately populates the `CardsTable` with offline data. Loading spinners vanish instantly.
4. **Delta Sync Trigger:** `useFirestoreSync` detects `user.uid` exists. Calls `SyncService.syncCollection('cards', uid)`.
5. **Sync Engine Eval:** `SyncService` pulls `syncMeta` table. Finds `lastSyncTime = 171800000`.
6. **API Call:** Sends remote query to Firestore: `WHERE updatedAt > 171800000`.
7. **Database Changes:** Merges resulting documents into `dbLocal.cards.bulkPut()`.
8. **Real-time Engine Starts:** Once `syncCollection` finishes, `useFirestoreSync` sets `readyToListen = true` and binds an `onSnapshot()` websocket loop for live updates.

---

## 3. The 2FA (TOTP) Rendering Flow

1. **Trigger:** User views `EmailsTable.tsx` where an email record has `secret2FA: "JBSWY3DPEHP..."` populated.
2. **Setup:** The component invokes `getRemainingSeconds()` to initialize the countdown bar state.
3. **Background Processing (Polling):** `useEffect` sets up a 1000ms `setInterval`.
4. **Loop Execution:** 
   - Every 1 second, the clock calculates exactly how many seconds until the minute reaches `:00` or `:30`. Updates `remaining` state.
   - Calculates the `TOTPWindow` integer.
5. **Trigger Generation:** If `TOTPWindow` changes (e.g. going from `29s` to `30s`), it triggers `refreshCodes()`.
6. **Algorithm Call:** Passes the Base32 string into the `generateTOTP` web crypto subsystem. Hashes the secret against the window.
7. **UI Update:** The UI replaces the old 6-digit code with the new one. The SVG pie chart `<div style={{ width: percentage }}>` recalculates its fill ratio representing 30s passing.

---

## 4. Alarm Creation & Execution Flow

1. **Trigger:** User clicks a "Timer" cell on `CardsTable` or `EmailsTable`. Opens `TimerModal`.
2. **UI Action:** User selects "Countdown", adjusts scroll drums to `00:05:00` (5 minutes), hits "Save".
3. **Frontend Calculation:** Calculates `triggerAt = Date.now() + (5 * 60 * 1000)`.
4. **Database Write:** Calls `addAlarm()` inside `useAlarms.ts`. 
5. **Local Validation:** Adds record to Dexie `alarms` table with `fired = 0`.
6. **Background Loop (Watcher):** Inside `useAlarms.ts`, a 15,000ms loop runs continuously. It executes: `dbLocal.alarms.where('fired').equals(0).and(triggerAt <= now)`.
7. **Detection:** Exactly 5 minutes later, polling detects the row.
8. **Transaction Lock:** Executes a Dexie read-write transaction to mark `fired = 1` immediately to prevent race conditions if the user has 3 tabs open.
9. **Desktop Notification:** Executes `sendNotification()` utilizing the browser Push API (`new Notification("Nhắc nhở...", { body: note })`).
10. **Record Logging:** Adds the event to `dbLocal.notifications` so it populates the Notification Center dropdown bell.
11. **Cleanup:** Emits `dbLocal.alarms.delete(alarm.id)` to erase the active trigger.

---

## 5. Inline Editing Flow (Cards Table)

1. **Trigger:** User double-clicks a row in `CardsTable.tsx`.
2. **Frontend State:** `setEditingId(row.id)` and copies row values into `editForm` state. UI morphs text fields into `<input>` tags.
3. **Input:** User typed new CVV and hits `<Enter>`.
4. **Frontend Action:** Evaluates `commitEdit()`. Sets loading flag.
5. **API Call:** Sends `updateDoc(db, 'cards', id, { cvv: "999", updatedAt: serverTimestamp() })`.
6. **Firestore Resolution:** Remote DB succeeds.
7. **Listener Reaction:** The `useFirestoreSync` websocket detects the new `updatedAt` pushed to the client immediately.
8. **Local DB Update:** The Snapshot converts the new document into an IndexedDB row and updates `dbLocal`.
9. **UI Auto-Update:** `loadLocal()` is triggered inside the hook. Table re-renders with the confirmed new remote state. The edit inputs disappear (`editingId` set to `null`).

---

## 6. Theme Switching Flow

1. **Trigger:** User opens `SettingsModal`, clicks the Dark toggle switch.
2. **State Change:** `useUserSettings` fires `update({ theme: 'dark' })`.
3. **Local Store:** Saves to `localStorage` instantaneously. (Sync to Firestore is delayed by 1s debounce).
4. **Context Push:** The singleton subscriber pushes the new `{ theme: 'dark' }` payload to all listening components.
5. **Provider Execution:** `ThemeProvider.tsx` `useEffect` detects the prop change.
6. **DOM Manipulation:** Executes `document.documentElement.classList.add('dark')`.
7. **CSS Action:** Tailwind variables defined under `.dark` in `theme.css` instantly apply, overriding backgrounds to dark palettes.
