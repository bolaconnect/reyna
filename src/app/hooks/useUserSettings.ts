/**
 * useUserSettings — centralized settings store
 *
 * Strategy:
 *  1. Read from localStorage immediately (zero-latency render).
 *  2. On mount (after auth resolves), fetch from Firestore and reconcile.
 *  3. Any write goes to localStorage first, then debounced to Firestore.
 *
 * Firestore path: users/{uid}/meta/settings
 */
import { useEffect, useRef, useCallback, useState } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../contexts/AuthContext';

export interface UserPrefs {
    // General app settings
    theme: 'light' | 'dark' | 'system';
    enableSound: boolean;
    compactMode: boolean;
    defaultTab: 'cards' | 'emails';
    // Table
    pageSize: number;
    // Visibility
    showSensitiveInfo: boolean;
    // Security
    pinHash: string | null;
}

const DEFAULTS: UserPrefs = {
    theme: 'light',
    enableSound: true,
    compactMode: false,
    defaultTab: 'cards',
    pageSize: 20,
    showSensitiveInfo: false,
    pinHash: null,
};

const LS_KEY = 'userPrefs';

function readLocal(): UserPrefs {
    try {
        const raw = localStorage.getItem(LS_KEY);
        if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
    } catch { /* ignore */ }

    // Migrate from old individual keys
    const migrated: Partial<UserPrefs> = {};
    try {
        const old = localStorage.getItem('appSettings');
        if (old) { const p = JSON.parse(old); Object.assign(migrated, p); }
    } catch { /* */ }
    const ps = localStorage.getItem('appPageSize');
    if (ps) migrated.pageSize = Number(ps);
    const vis = localStorage.getItem('appShowSensitiveInfo');
    if (vis) migrated.showSensitiveInfo = vis === 'true';

    return { ...DEFAULTS, ...migrated };
}

function writeLocal(prefs: UserPrefs) {
    localStorage.setItem(LS_KEY, JSON.stringify(prefs));
}

// Singleton so multiple consumers share the same state
let listeners: Array<(p: UserPrefs) => void> = [];
let _prefs: UserPrefs = readLocal();
let _synced = false;

function notify(p: UserPrefs) {
    _prefs = p;
    listeners.forEach(fn => fn(p));
}

export function useUserSettings() {
    const { user } = useAuth();
    const [prefs, setPrefsState] = useState<UserPrefs>(_prefs);
    const debounceTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    // Subscribe to in-process changes
    useEffect(() => {
        const fn = (p: UserPrefs) => setPrefsState({ ...p });
        listeners.push(fn);
        return () => { listeners = listeners.filter(l => l !== fn); };
    }, []);

    // On first mount with a logged-in user, pull from Firestore once
    useEffect(() => {
        if (!user || _synced) return;

        // Mark as synced immediately to prevent other concurrent hooks from firing
        _synced = true;

        (async () => {
            try {
                if (!user.uid) return;

                const ref = doc(db, 'users', user.uid, 'meta', 'settings');
                const snap = await getDoc(ref);
                if (snap.exists()) {
                    const remote = snap.data() as Partial<UserPrefs>;
                    const merged = { ...DEFAULTS, ...readLocal(), ...remote };
                    writeLocal(merged);
                    notify(merged);
                }
            } catch (e) {
                console.warn('Failed to load settings from Firestore', e);
                // On failure, allow retry later
                _synced = false;
            }
        })();
    }, [user]);

    const update = useCallback((patch: Partial<UserPrefs>) => {
        const next = { ..._prefs, ...patch };
        writeLocal(next);
        notify(next);

        // Debounce Firestore write by 1s
        clearTimeout(debounceTimer.current);
        debounceTimer.current = setTimeout(async () => {
            if (!user || !user.uid) return;
            try {
                const ref = doc(db, 'users', user.uid, 'meta', 'settings');
                await setDoc(ref, next, { merge: true });
            } catch (e) {
                console.warn('Failed to save settings to Firestore', e);
            }
        }, 1000);
    }, [user]);

    return { prefs, update };
}
