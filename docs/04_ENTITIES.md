# 4. ENTITY DOCUMENTATION

In TypeScript, these entities are declared as `Interfaces` mapping strictly to the Database shapes described previously. They exist natively in `src/app/lib/db.ts` and component files.

---

### `EmailRecord` (or `LocalEmailRecord`)
**Purpose:** Describes an email account and its associated credentials.
**Important Fields & Business Meaning:**
- `secret2FA`: Must be a valid Base32 string. If populated, the frontend `EmailsTable` automatically activates the TOTP Generator logic (`getRemainingSeconds()`, `generateTOTP()`), calculates the time offset window, and continuously refreshes a 6-digit code.
- `updatedAt`: Must be maintained by `serverTimestamp()` on Firestore mutations.

**How it's used in flows:** 
Passed directly into `EmailsTable` rows. Double-clicking a row passes this entity into the `EmailDetailModal` for inline viewing/editing. Masking functions evaluate the `password` field via `maskPassword(entity.password)` before rendering to the DOM.

---

### `CardRecord` (or `LocalCardRecord`)
**Purpose:** Describes a payment card.
**Important Fields & Business Meaning:**
- `cardNumber`: Often input with spaces (e.g., `4111 1111 1111 1111`). The UI parses and handles spaces conditionally. 
- `cvv`: Usually 3 digits, occasionally 4 (Amex). No strict DB constraint, mostly handled by frontend limits.
- `status`: Strictly tied to the `StatusSelect` component options: `active`, `inactive`, `expired`, `blocked`, `pending`. It renders distinct colors (Emerald, Gray, Red, Orange, Amber) based on the string value matched to its configuration array.

**How it's used in flows:**
Rendered in `CardsTable`. Checkboxes map to a `Set<string>` of `CardRecord.id` arrays for Batch Operations (batch deletion, batch copy).

---

### `UserPrefs`
**Purpose:** User configuration context.
**Important Fields & Logic:**
- `theme`: Determines whether the `ThemeProvider` appends `.dark` to the `<html>` root.
- `pageSize`: Injects directly into pagination elements in `CardsTable` and `EmailsTable` to slice the Dexie queries or the state arrays.
- `showSensitiveInfo`: Bound to `VisibilityContext`. Globally overrides hover-to-reveal states.

**How it's used in flows:**
Loaded by `useUserSettings()`. On boot, it reads `localStorage`. After auth, it fetches from Firestore, reconciles changes, saves back to local storage, and debounces writes back to Firestore after 1 second of inactivity to prevent excessive network spam when users click toggles rapidly.

---

### `AlarmRecord`
**Purpose:** Tracks when an alert should fire for a specific Card or Email.
**Important Fields & Logic:**
- `triggerAt`: Unix timestamp. Core field. The polling loop (`useAlarms.ts`) checks `triggerAt <= Date.now()`.
- `fired`: 0 or 1. Used because IndexedDB performs extremely fast logical index scans using numeric indicators rather than booleans. `await dbLocal.alarms.where('fired').equals(0)...`
- `doneAt`: If an alarm fired, it shows up as "Overdue" (Red). It stays in the UI until the user clicks the "Check" icon, which populates `doneAt`. Once populated, the alarm disappears from active calculation logic.

**How it's used in flows:**
Calculated in real-time within `AlarmCell.tsx`. The cell displays remaining time (e.g. `2d 4h`, `05:30`) via math executed on render. If `triggerAt` minus `Date.now()` is negative, it turns Red (`overdue`).

---

### `NotificationRecord`
**Purpose:** Acts as a persistent Inbox for fired alarms.
**Important Fields & Logic:**
- `readAt`: Used to calculate the unread badge in the Toolbar. `unreadCount = items.filter(n => !n.readAt).length`.
- `recordId` / `collection`: Enables deep-linking. Clicking the notification queries the parent component to open the corresponding `CardDetailModal` or `EmailDetailModal`.

**How it's used in flows:**
Managed exclusively locally by `useAlarms.ts` and `NotificationCenter.tsx`. Never synced to Firestore.
