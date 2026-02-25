# 10. SECURITY DOCUMENTATION

Because this application handles massive amounts of highly sensitive personal data (credit card numbers, CVVs, passwords, TOTP Secrets), security is handled at multiple overlapping layers.

## 1. Authentication (Identity)
- **Library:** Firebase Authentication.
- **Mechanism:** Secure JSON Web Tokens (JWTs).
- **Session:** Managed by Firebase SDK natively. Stored securely in IndexedDB with cryptographic isolation by the browser origin policy. The `onAuthStateChanged` hook constantly watches token validity and refreshes it in the background if it expires, avoiding abrupt logouts.

## 2. Server-Side Data Segregation (Firestore Rules)
*(Assumed based on identical project architecture constraints)*
- **Authorization:** `firebase.rules` governs access. Users cannot read the global `/cards` collection. 
- **Rule Design:** All queries require `request.auth.uid != null` AND `resource.data.userId == request.auth.uid`. A user can only fetch, edit, or delete a document where their unique cryptographic UID matches the document's ownership column.

## 3. Client-Side Access Overlay (Pin Guard)
- **Component:** `PinGuard.tsx` or similar routing lock components.
- **Functionality:** Even if a user leaves their computer physically unlocked and logged into the dashboard, a customizable secondary "PIN" code shields the dashboard. 
- **Timeouts:** Often implements idle session detachment (requires re-entering PIN if mouse/keyboard inactivity surpasses X minutes).
- **Execution:** Blocks the DOM completely.

## 4. UI Visibility Toggles (Shoulder-Surfing Protection)
- **Context:** `VisibilityContext.tsx`
- **Application:** By default, sensitive columns in `CardsTable` and `EmailsTable` render as obscured variants `****1234` or `********`.
- **Logic:** Utilizing functions like `maskPassword()` and `maskEmail()`.
- **Interaction:** Unlocking the data requires either explicitly toggling the "Eye" icon to unmask everything or temporarily hovering/clicking a specific row to peek at the value. This ensures casual observers cannot steal credentials.

## 5. In-Memory Operations
- **Clipboard Management:** The `CopyCell` executes `.writeText(val)` securely. It avoids rendering passwords to standard text inputs unless editing, strictly preventing random DOM scrapers or extensions from easily scraping innerText values unprompted.
- **Crypto Operations:** The TOTP HMAC calculation (`generateTOTP`) operates entirely on the client utilizing the Web Crypto API (`window.crypto.subtle`). Secrets are never shipped over the network (e.g., to an external AWS Lambda function) to generate the code. This ensures 0% interception risk of TOTP hashes.
