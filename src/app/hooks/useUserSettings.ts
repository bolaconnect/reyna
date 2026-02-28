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
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
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
    // Roles & Manager Access
    role?: 'manager' | 'employee';
    selectedEmployeeId?: string | null;
}

const DEFAULTS: UserPrefs = {
    theme: 'light',
    enableSound: true,
    compactMode: false,
    defaultTab: 'cards',
    pageSize: 20,
    showSensitiveInfo: false,
    pinHash: null,
    role: 'employee',
    selectedEmployeeId: null,
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
let _synced_uid: string | null = null;
let _unsubs: Array<() => void> = [];

function notify(p: UserPrefs) {
    _prefs = p;
    console.log('User role updated:', p.role);
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

    // Real-time listener for settings
    useEffect(() => {
        if (!user) {
            console.log('useUserSettings: No user, cleaning up');
            _unsubs.forEach(u => u());
            _unsubs = [];
            _synced_uid = null;
            return;
        }

        if (_synced_uid === user.uid) {
            console.log('useUserSettings: Already synced for', user.uid);
            return;
        }

        console.log('useUserSettings: Starting sync for', user.uid);
        _synced_uid = user.uid;
        _unsubs.forEach(u => u()); // Clean up old ones if any

        const ref = doc(db, 'users', user.uid, 'meta', 'settings');
        const unsub = onSnapshot(ref, (snap) => {
            console.log('--- meta/settings snapshot ---');
            if (snap.exists()) {
                const remote = snap.data() as Partial<UserPrefs>;
                console.log('Remote data from meta/settings:', remote);
                const merged = { ...DEFAULTS, ..._prefs, ...remote };
                writeLocal(merged);
                notify(merged);
            }
        }, (err) => {
            console.error('--- meta/settings sync error ---', err);
            // If it fails, allow retry on next render
            _synced_uid = null;
        });

        const rootRef = doc(db, 'users', user.uid);
        const unsubRoot = onSnapshot(rootRef, (snap) => {
            console.log('--- root user snapshot ---');
            if (snap.exists()) {
                const data = snap.data();
                console.log('Root user data:', data);
                if (data.role && data.role !== _prefs.role) {
                    console.log('Updating role from root document:', data.role);
                    const next = { ..._prefs, role: data.role as any };
                    writeLocal(next);
                    notify(next);
                }
            }
        }, (err) => {
            console.error('--- root user sync error ---', err);
            _synced_uid = null;
        });

        _unsubs = [unsub, unsubRoot];

        return () => {
            // Note: In a singleton pattern, we might not want to kill unsubs on every unmount
            // if other components are still using them. For now, keep it simple.
        };
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
