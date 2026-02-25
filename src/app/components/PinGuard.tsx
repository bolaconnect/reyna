import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { Lock, LogOut } from 'lucide-react';
import { auth } from '../../firebase/config';
import { signOut } from 'firebase/auth';
import { motion, AnimatePresence } from 'motion/react';
import { useUserSettings } from '../hooks/useUserSettings';

interface PinContextType {
    lockNow: () => void;
    hasPin: boolean;
    setHasPin: (val: boolean) => void;
}

export const PinContext = createContext<PinContextType>({
    lockNow: () => { },
    hasPin: false,
    setHasPin: () => { },
});

export const usePin = () => useContext(PinContext);

export async function hashPin(pin: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(pin);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

const AUTO_LOCK_MS = 30 * 60 * 1000;

export function PinGuard({ children }: { children: ReactNode }) {
    const { prefs } = useUserSettings();
    const [hasPin, setHasPinState] = useState(() => !!prefs.pinHash);
    const [isLocked, setIsLocked] = useState(() => !!prefs.pinHash);
    const [pinInput, setPinInput] = useState('');
    const [error, setError] = useState(false);

    // Update internal hasPin state when synced prefs change
    useEffect(() => {
        setHasPinState(!!prefs.pinHash);
    }, [prefs.pinHash]);

    const lockNow = useCallback(() => {
        if (prefs.pinHash) {
            setIsLocked(true);
            setPinInput('');
            setError(false);
        }
    }, [prefs.pinHash]);

    const setHasPin = useCallback((val: boolean) => {
        // This is now handled by syncing the pinHash in useUserSettings
        // But we keep the context signature for compatibility
        setHasPinState(val);
    }, []);


    useEffect(() => {
        if (!hasPin || isLocked) return;
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') lockNow();
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [hasPin, isLocked, lockNow]);

    useEffect(() => {
        if (!hasPin || isLocked) return;
        let timeout: NodeJS.Timeout;
        const resetTimer = () => {
            clearTimeout(timeout);
            timeout = setTimeout(() => { setIsLocked(true); setPinInput(''); setError(false); }, AUTO_LOCK_MS);
        };
        const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart'];
        events.forEach(e => document.addEventListener(e, resetTimer, { passive: true }));
        resetTimer();
        return () => { clearTimeout(timeout); events.forEach(e => document.removeEventListener(e, resetTimer)); };
    }, [hasPin, isLocked]);

    const tryUnlock = useCallback(async (val: string, showErrors = false) => {
        const stored = prefs.pinHash;
        if (!stored) { setIsLocked(false); return; }
        if ((await hashPin(val)) === stored) {
            setIsLocked(false); setPinInput(''); setError(false);
        } else if (showErrors) {
            setError(true);
            setPinInput('');
            setTimeout(() => setError(false), 800);
        }
    }, [prefs.pinHash]);

    const handleChange = (val: string) => {
        setPinInput(val);
        setError(false);
        tryUnlock(val, false); // Auto-check but stay silent on error
    };

    const handleForgotPin = async () => {
        if (window.confirm("Nếu quên mã PIN, bạn phải đăng xuất. Bấm OK để tiếp tục.")) {
            localStorage.removeItem('appPinHash');
            await signOut(auth);
        }
    };

    return (
        <PinContext.Provider value={{ lockNow, hasPin, setHasPin }}>
            <div className={isLocked ? 'pointer-events-none select-none h-screen w-full overflow-hidden filter blur-sm opacity-50' : 'contents'}>
                {children}
            </div>

            <AnimatePresence>
                {isLocked && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-white/80 backdrop-blur-sm"
                    >
                        <motion.div
                            initial={{ scale: 0.95, y: 16 }}
                            animate={{ scale: 1, y: 0 }}
                            transition={{ type: 'spring', stiffness: 360, damping: 28 }}
                            className="bg-white rounded-3xl shadow-xl border border-gray-100 w-full max-w-xs p-8 flex flex-col items-center"
                        >
                            <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-5">
                                <Lock size={22} className="text-gray-600" />
                            </div>
                            <h2 className="text-[18px] font-bold text-gray-800 mb-1">Ứng dụng đã khóa</h2>
                            <p className="text-[13px] text-gray-400 mb-6 text-center">Nhập mã PIN để tiếp tục</p>

                            <motion.input
                                type="password"
                                inputMode="numeric"
                                autoFocus
                                value={pinInput}
                                onChange={e => handleChange(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && tryUnlock(pinInput, true)}
                                placeholder="Mã PIN"
                                animate={error ? { x: [-6, 6, -6, 6, 0] } : {}}
                                transition={{ duration: 0.3 }}
                                className={`w-full px-4 py-3 text-center text-xl tracking-widest border rounded-xl outline-none transition-colors ${error
                                    ? 'border-red-300 bg-red-50 text-red-600'
                                    : 'border-gray-200 bg-gray-50 focus:border-gray-400 focus:bg-white text-gray-800'
                                    }`}
                            />

                            {error && (
                                <p className="text-red-500 text-[12px] font-medium mt-2">Mã PIN không chính xác</p>
                            )}

                            <button
                                onClick={() => tryUnlock(pinInput, true)}
                                disabled={!pinInput}
                                className="w-full mt-4 py-3 bg-gray-900 hover:bg-gray-800 text-white rounded-xl text-[14px] font-semibold transition-colors disabled:opacity-40"
                            >
                                Mở khóa
                            </button>

                            <button
                                onClick={handleForgotPin}
                                className="mt-5 text-[12px] text-gray-400 hover:text-red-500 flex items-center gap-1.5 transition-colors"
                            >
                                <LogOut size={12} /> Quên mã PIN?
                            </button>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </PinContext.Provider>
    );
}
