# 1. SYSTEM OVERVIEW

## Project Purpose
Reyna (Personal Manager Web App) is a private, local-first web application designed to help users securely manage their sensitive personal information. It acts as an orchestrator for daily digital life operations by storing, organizing, and securing credit cards, email accounts, passwords, 2FA (Two-Factor Authentication) secrets, and personal notes. Its primary goal is to provide maximum privacy with an offline-capable, responsive, and robust user experience.

## Target Users
- **Power Users / Tech-Savvy Individuals:** People who manage multiple credit cards, email accounts, and require 2FA TOTP (Time-Based One-Time Password) generation without relying on separate authenticator apps.
- **Privacy-Conscious Individuals:** Users who want their sensitive data accessible locally even without an internet connection, while still safely synced to the cloud when online.

## Main Features
1. **Authentication & Security:**
   - Email/password user authentication via Firebase Auth.
   - Secondary PIN Guard (Pin Lock) to protect the workspace when the session is idle or when explicitly locked by the user.
   - "Show/Hide" sensitive information mode (masking passwords, card numbers/CVVs).
2. **Card Management (Credit/Debit):**
   - Store and manage card entries (Number, Expiry, CVV, Note, Status).
   - Quick one-click copy to clipboard with masked viewing.
   - Batch deletion and bookmarking.
3. **Email & Account Management:**
   - Store email accounts, passwords, recovery emails, and phone numbers.
   - **Integrated 2FA TOTP Generator:** Users can input their Base32 secret key, and the app automatically generates and displays real-time, copying-ready 6-digit TOTP codes with a visual countdown timer.
4. **Alarms & Reminders:**
   - Users can attach time-based alarms to any Card or Email record (e.g., "Cancel subscription before Friday", "Pay credit card bill").
   - Utilizes browser-native Push Notifications and indexed IndexedDB (Dexie) polling to trigger alerts exactly on time.
5. **Notification Center:**
   - In-app notification center that logs triggered alarms and alerts.
6. **Local-First Synchronization:**
   - Implements a heavy local-first strategy using IndexedDB (Dexie). All reads happen instantly from the local database.
   - Background syncing mechanism (Delta Sync) that reconciles local data with Firebase Firestore to ensure cross-device consistency.
7. **Theming & Personalization:**
   - Persistent user preferences (Dark/Light/System theme, sound toggles, pagination sizing, default active tabs).

## System Architecture
The application runs entirely on the Client-Side (Frontend). There is no custom backend server (e.g., Node.js or Spring Boot). 
- **Frontend Layer:** React 18, Vite, Tailwind CSS v4, Lucide React (Icons), Framer Motion (Animations).
- **Local Persistence Layer (Cache & Offline):** Dexie.js (IndexedDB wrapper).
- **Cloud/Backend Layer (BaaS):** Google Firebase (Firestore for NoSQL data storage, Firebase Authentication for identity).
- **State Management:** React Contexts (`AuthContext`, `VisibilityContext`, `ThemeProvider`) and custom hooks (`useFirestoreSync`, `useUserSettings`, `useAlarms`).

## Technologies Used
- **Core Framework:** React (with hooks), written in TypeScript.
- **Build Tool:** Vite.
- **Styling:** Tailwind CSS (specifically utilizing Tailwind v4 syntax like `@theme inline`, and raw CSS variable remapping for dark mode) & CSS modules.
- **Animations:** Motion/React (Framer Motion).
- **Database (Local):** Dexie (IndexedDB).
- **Database (Cloud):** Firebase Firestore.
- **Authentication:** Firebase Auth.
- **Notifications:** Browser Notification API & Firebase Cloud Messaging (FCM setup initialized).
- **2FA Library:** `otpauth` (or custom TOTP implementation in utilities) for Time-Based One-Time Passwords.

## Folder Structure Explanation
- `/src/app/components/`: Reusable UI elements (`CardsTable.tsx`, `EmailsTable.tsx`, `TimerModal.tsx`, `SettingsModal.tsx`, `PinGuard.tsx`, `NotificationCenter.tsx`). These components handle complex internal state, animations, and user interactions.
- `/src/app/hooks/`: Custom React hooks encapsulating business logic. Examples: `useFirestoreSync.ts` (syncs Firebase to Dexie), `useAlarms.ts` (polls for due alarms), `useUserSettings.ts` (manages local+remote preferences).
- `/src/app/lib/`: Database definitions. `db.ts` defines the Dexie tables (`cards`, `emails`, `alarms`, `notifications`, `syncMeta`).
- `/src/app/pages/`: Top-level route views. `Login.tsx` (auth page) and `Dashboard.tsx` (main application wrapper).
- `/src/app/services/`: Pure business logic services. `syncService.ts` contains the heavy-lifting algorithms for delta-syncing Firestore down to IndexedDB via batched queries and pagination limits.
- `/src/contexts/`: React Context providers holding global states like `AuthContext` (current user session), `VisibilityContext` (is sensitive data masked?), and `ThemeProvider` (applying `.dark` class).
- `/src/firebase/`: Firebase initialization script (`config.tsx`), containing SDK keys and `getAuth()`, `getFirestore()` exports.
- `/src/styles/`: Global CSS. Specifically, `theme.css` houses the Oklch color variables and the `.dark` class overrides that remap Tailwind's default gray/white utilities for Dark Mode.
- `/src/utils/`: Utility functions. `totp.tsx` (TOTP generation math), `copy.tsx` (clipboard API wrappers), `mask.tsx` (string manipulation for masking sensitive strings), `parseInput.tsx` (data parsers).
