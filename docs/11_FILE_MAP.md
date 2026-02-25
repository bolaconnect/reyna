# 11. FILE MAP & CONNECTION GRAPH

This map illustrates how directories interact. 

```text
src/
├── main.tsx ........................ React Mount Point (Wraps Contexts)
├── App.tsx ......................... Application Bootstrap
├── firebase/
│   └── config.tsx .................. Initializes `db` and `auth` variables.
├── styles/
│   └── theme.css ................... Global tailwind tweaks, .dark mode palette remaps.
├── utils/
│   ├── totp.tsx .................... Math logic for generating timestamps and hashes.
│   ├── mask.tsx .................... Regex string replacements for hiding data.
│   ├── parseInput.tsx .............. String cleanup (removing spaces in CCs).
│   └── copy.tsx .................... Handles async clipboard API.
├── contexts/
│   ├── AuthContext.tsx ............. Manages the global `user` Firebase Auth state.
│   ├── ThemeProvider.tsx ........... Listens to UserPrefs hook to toggle .dark class.
│   └── VisibilityContext.tsx ....... Global boolean state for (Show/Hide).
└── app/
    ├── lib/
    │   └── db.ts ................... IndexedDB schema definitions (cards, emails, syncMeta).
    ├── services/
    │   └── syncService.ts .......... Heavy logic: Firestore Delta Fetching algorithms.
    ├── hooks/
    │   ├── useFirestoreSync.ts ..... The main listener. Links React state to dbLocal & syncService.
    │   ├── useAlarms.ts ............ Background polling interval loop. Emits notifications.
    │   ├── useUserSettings.ts ...... Hybrid LocalStorage <-> Firestore configuration sync.
    │   ├── useNotification.ts ...... Browser Push Notification API wrapper.
    │   └── useMessaging.ts ......... (FCM) Cloud Messaging wrapper.
    ├── pages/
    │   ├── Login.tsx ............... Auth logic.
    │   └── Dashboard.tsx ........... Layout shell, navigation sidebar.
    └── components/
        ├── CardsTable.tsx .......... Datagrid. Maps `CardRecord` state array to UI rows.
        ├── EmailsTable.tsx ......... Datagrid. Evaluates TOTP math, Maps `EmailRecord` array.
        ├── EmailDetailModal.tsx .... Pops over UI for deep editing.
        ├── CardDetailModal.tsx ..... Pops over UI for deep editing.
        ├── TimerModal.tsx .......... Modal capturing Alarm params. Interacts w/ useAlarms.ts.
        ├── SettingsModal.tsx ....... Tweaks states passed into `useUserSettings.ts`.
        ├── StatusSelect.tsx ........ Sub-component. Renders colored pills (Active/Inactive).
        ├── CopyCell.tsx ............ Sub-component. Wraps cell data in copy logic.
        ├── AlarmCell.tsx ........... Sub-component. Mathematical countdown text inside Tables.
        ├── NotificationCenter.tsx .. Reads `dbLocal.notifications` and renders a dropdown list.
        └── PinGuard.tsx ............ Highest-level security block layer wrapping the Router.
```

## Dependency Flow Example (Reading a Table)
`CardsTable.tsx` calls `useFirestoreSync('cards')`.
1. `useFirestoreSync` checks `AuthContext.tsx` to verify `user` exists.
2. It queries `db.ts` to fetch cached cards from IndexedDB.
3. It simultaneously calls `syncService.ts`.
4. `syncService.ts` imports `firebase/config.tsx` to talk to Google servers.
5. `syncService.ts` drops new rows into `db.ts`.
6. IndexedDB alerts `useFirestoreSync` to update React state.
7. `CardsTable.tsx` re-renders and paints rows via `StatusSelect.tsx` and `AlarmCell.tsx`.
