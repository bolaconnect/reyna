# 8. VALIDATION RULES

Validations in this application happen mostly on the Frontend to ensure data integrity before pushing to Firestore.

## 1. Authentication Validations (`Login.tsx`)
- **Empty Field Checks:** If either `email` or `password` input box is empty on submit, processing halts, displaying: "Please fill in all fields."
- **Firebase Auth Validations (Backend enforced, Frontend intercepted):**
  - **Weak Password (`auth/weak-password`):** Firebase rejects strings under 6 characters. Caught and mapped to "Password must be at least 6 characters."
  - **Invalid Credentials:** Rejects bad emails/passwords. Mapped to generic standard "Invalid email or password" to prevent email-enumeration attacks, though "email-already-in-use" is passed explicitly on registration.

## 2. Setting Alarms Validations (`TimerModal.tsx`)
- **Zero-Time Protection:** If user sets the countdown drums to 00 hours, 00 minutes, 00 seconds, the math yields `ms <= 0`. The save function executes the rule:
  ```ts
  if (ms <= 0) { setSaving(false); return; }
  ```
  It will block the database write silently, forcing the user to select a valid future duration.

## 3. Base32 TOTP Validation (`EmailDetailModal.tsx` / `totp.tsx`)
While there is no strict Regex block on saving the Base32 secret string (to allow users to casually store partial data or notes in the column), the algorithm evaluating it enforces cryptographic rules:
- **Base32 Alphabet Rules:** `ABCDEFGHIJKLMNOPQRSTUVWXYZ234567`.
- **Logic Handling:** If a user inputs invalid characters (like `8`, `9`, or lowercase strings if not pre-processed), the `base32ToBuf` function will silently drop illegal chars or throw error arrays, resulting in an undefined or failure TOTP render, rather than crashing the primary React Tree.

## 4. Batch Processing Validations (`CardsTable.tsx` / `EmailsTable.tsx`)
- **Empty Set Rules:** The batch action buttons (Copy, Delete) check `selectedIds.size === 0`.
- **Action Blocking:** The UI disables (greys out) the buttons inherently preventing an empty loop execution over Firestore maps.

## 5. Security Guard Validation (`usePin.ts` / `PinGuard.tsx`)
- **Length Constraint:** The master unlock PIN is enforced to rely purely on cryptographic comparison (or raw string mapping). A user entering a string into the locked interface must match exactly the predefined stored password/pin logic.
- **Fail Check:** Incorrect attempts simply clear the input buffer and flash red. The modal layer never unmounts (meaning the DOM underneath remains inaccessible) until validation equals true.

## 6. Firestore Rules Validations (Backend Side)
*Although rules scripts aren't directly available in standard React code, analyzing the DB paths implies mandatory structure:*
- All queries **must** be suffixed with `where('userId', '==', user.uid)`.
- If a client is modified with malicious scripts to bypass UI and query `collection('cards')` directly without a `userId` match parameter, the Firestore backend will reject it due to Missing Permissions. Indexed querying validations completely compartmentalize user environments.
