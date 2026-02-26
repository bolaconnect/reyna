# Project Context for AI Assistants

This file contains the concentrated knowledge, rules, and architecture of the **Personal Manager Web App**. Use this file when starting a new chat to instantly onboard an AI assistant on the current state of the application.

## 1. Tech Stack Overview
- **Framework:** React + Vite
- **Styling:** Tailwind CSS + Lucide Icons + Framer Motion
- **Database / Backend:** Firebase Firestore (remote) + Dexie.js (local/offline reactive sync via `useFirestoreSync`)
- **Language / Typings:** TypeScript (`.tsx`)

## 2. Core Entities & Structure
The app handles four primary entities: **Emails**, **Cards (Credit/Debit)**, **Categories**, and **Alarms (Timers)**.

1. **Emails (`emails`)**:
   - `email`, `password`, `secret2FA`, `note`, `categoryId`, `status`, `liveStatus`, `bookmarked`, `deleted`.
   - The UI often requires masked variants of sensitive strings (`maskEmail`, `maskPassword`).

2. **Cards (`cards`)**:
   - `cardNumber`, `expiryDate`, `cvv`, `cardholderName`, `status`, `note`, `payAmount`, `linkedEmails[]`.
   - Cards can be linked to multiple emails. This relationship is managed as an array of email IDs (`linkedEmails`) on the Card document.

3. **Categories (`categories`)**:
   - `id`, `name`, `order`.
   - Displayed in the left sidebar (`SidebarCategories.tsx`). Selecting a category opens the `CategoryExplorer.tsx` pane.

4. **Alarms/Timers (`alarms`)**:
   - Handled by a hook (`useAlarms.tsx`) backing into Firestore and local Dexie. 
   - Uses `recordId`, `userId`, `triggerAt`, `message`, `doneAt`.
   - The UI component `AlarmCell` visualizes upcoming or overdue timers. `TimerModal` is used to configure them.
   - Note: Timers created in the generic UI use the raw record ID (e.g., card ID). Timers created inside the Category Explorer use a prefixed ID (`category_card_<cardId>`) to keep them isolated!

## 3. UI/UX Rules & Preferences
- **Inline Editing Preference:** Whenever possible, table cells use inline inputs. E.g., `NoteInput` directly renders an input inside the table cell. `PayInput` uses custom `+` and `-` operators alongside direct text input. `CategorySelect` uses a dropdown inside the table cell.
- **Masking:** Sensitive data is masked by default. We reveal it conditionally either when the global visibility toggle (`useVisibility()`) is active, or individually when the table row is in a hovered state (`isHovered=true`).
- **Confirmation Flow:** Do **not** use the native browser `confirm()` dialogue. For critical deletions (like removing an entire email), we use custom UI modals (e.g., `setDeleteEmailConfirm(...)` opening a Tailwind modal). For quick tasks (like unlinking a card), we use an inline `Sure?` button replacing the Trash icon on first click.
- **Z-Index Layering:** Tables have sticky headers (`z-10`). Relative popups (like dropdowns, status menus) easily become obscured by successive table rows. To fix this, always ensure the active row (`isHovered` or `isSelected`) is bumped to `z-20` and its position is `relative`.
- **Copy Actions:** Use `CopyCell` as a wrapper around fields. Clicking will naturally copy the data to the clipboard and display a `sonner` toast notification.

## 4. Key View Components
- **`EmailsTable.tsx` / `CardsTable.tsx`**: The main bulk management views. Full width, heavy with features like batch actions, filtering, inline edits.
- **`CategoryExplorer.tsx`**: A split-pane view consisting of:
  - **Left pane (35% width)**: Lists emails belonging to the selected category.
  - **Right pane (65% width)**: Shows the cards explicitly linked to the *currently selected email* in the left pane. Contains buttons to add/unlink cards to the email context.
- **`CardDetailModal.tsx` & `EmailDetailModal.tsx`**: Large slide-over or centered modals used to view all exhaustive data belonging to a record, including details not visible in the condensed table views.

## 5. Coding Reminders
- Avoid full manual page reloads. `useFirestoreSync({ collection })` keeps local state entirely reactive to remote updates via web-sockets (`onSnapshot`).
- Always run `npm run dev` to test visual changes locally.
- Be careful with UI changes. You *must* preserve the polished aesthetics (modern gradients, spacing, icons, rounding, text sizes). We generally use very small sleek text `text-[11px]`, `text-[12px]`, or `text-[13px]`. 

*This block of context should be fed directly as a file to any new AI assisting on this repository. It will bridge the required domain context seamlessly.*
