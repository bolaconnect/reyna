import { X, Moon, Bell, Settings, Layers, Shield, Key, Trash2, ChevronRight, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useState } from 'react';
import { hashPin, usePin } from './PinGuard';
import { useUserSettings } from '../hooks/useUserSettings';

// Re-export types that other parts of the app may reference
export type AppSettings = {
    theme: 'light' | 'dark' | 'system';
    enableSound: boolean;
    compactMode: boolean;
    defaultTab: 'cards' | 'emails';
};

export const defaultSettings: AppSettings = {
    theme: 'light',
    enableSound: true,
    compactMode: false,
    defaultTab: 'cards',
};

// Legacy hook — components that already use it keep working
export function useSettings() {
    const { prefs, update } = useUserSettings();
    const settings: AppSettings = {
        theme: prefs.theme,
        enableSound: prefs.enableSound,
        compactMode: prefs.compactMode,
        defaultTab: prefs.defaultTab,
    };
    return {
        settings,
        updateSettings: (patch: Partial<AppSettings>) => update(patch),
    };
}

interface SettingsModalProps { onClose: () => void; }

// ── iOS-style Toggle ───────────────────────────────────────────────────────
function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
    return (
        <button
            onClick={() => onChange(!on)}
            className="relative shrink-0 outline-none transition-all duration-200"
            style={{ width: 44, height: 26, borderRadius: 13, background: on ? '#22c55e' : '#e5e7eb' }}
        >
            <motion.div
                animate={{ x: on ? 20 : 2 }}
                transition={{ type: 'spring', stiffness: 500, damping: 32 }}
                style={{ position: 'absolute', top: 2, width: 22, height: 22, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }}
            />
        </button>
    );
}

function SettingsRow({ children }: { children: React.ReactNode }) {
    return <div className="flex items-center justify-between px-4 py-3">{children}</div>;
}

function SettingsGroup({ children }: { children: React.ReactNode }) {
    return (
        <div className="rounded-xl border border-gray-100 overflow-hidden divide-y divide-gray-100 bg-white">
            {children}
        </div>
    );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
    return <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider px-1 mb-1.5">{children}</p>;
}

// ── PIN management ─────────────────────────────────────────────────────────
type PinMode = 'idle' | 'create' | 'change' | 'delete';

function PinSection({ hasPin, setHasPin }: { hasPin: boolean; setHasPin: (v: boolean) => void }) {
    const { prefs, update } = useUserSettings();
    const [mode, setMode] = useState<PinMode>('idle');
    const [pinForm, setPinForm] = useState({ old: '', new: '', confirm: '' });
    const [pinError, setPinError] = useState('');
    const [saving, setSaving] = useState(false);

    const inputClass = "w-full px-3 py-2 text-[13px] border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:border-gray-400 focus:bg-white transition-colors";
    const reset = () => { setMode('idle'); setPinForm({ old: '', new: '', confirm: '' }); setPinError(''); };

    const handleAction = async () => {
        setPinError('');
        setSaving(true);
        if (mode === 'create') {
            if (!pinForm.new || pinForm.new !== pinForm.confirm) { setPinError('Mã PIN không khớp'); setSaving(false); return; }
            await update({ pinHash: await hashPin(pinForm.new) });
            setHasPin(true); reset();
        } else {
            const stored = prefs.pinHash;
            if ((await hashPin(pinForm.old)) !== stored) { setPinError('Mã PIN hiện tại không đúng'); setSaving(false); return; }
            if (mode === 'delete') {
                await update({ pinHash: null });
                setHasPin(false); reset();
            }
            else if (mode === 'change') {
                if (!pinForm.new || pinForm.new !== pinForm.confirm) { setPinError('Mã PIN không khớp'); setSaving(false); return; }
                await update({ pinHash: await hashPin(pinForm.new) });
                reset();
            }
        }
        setSaving(false);
    };

    return (
        <AnimatePresence mode="wait">
            {mode === 'idle' ? (
                <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <SettingsRow>
                        <div className="flex items-center gap-3">
                            <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${hasPin ? 'bg-green-50' : 'bg-gray-100'}`}>
                                <Key size={14} className={hasPin ? 'text-green-600' : 'text-gray-400'} />
                            </div>
                            <div>
                                <span className="text-[13px] font-medium text-gray-700">Khóa ứng dụng</span>
                                <p className="text-[11px] text-gray-400">{hasPin ? 'Đã bật mã PIN' : 'Chưa thiết lập'}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            {hasPin ? (
                                <>
                                    <button onClick={() => setMode('change')} className="text-[12px] font-semibold text-blue-500 hover:text-blue-700 transition-colors px-1 py-0.5">Đổi</button>
                                    <button onClick={() => setMode('delete')} className="w-7 h-7 flex items-center justify-center rounded-lg text-red-400 hover:bg-red-50 transition-colors"><Trash2 size={13} /></button>
                                </>
                            ) : (
                                <button onClick={() => setMode('create')} className="text-[12px] font-semibold text-blue-500 hover:text-blue-700 flex items-center gap-0.5 transition-colors">
                                    Thiết lập <ChevronRight size={12} />
                                </button>
                            )}
                        </div>
                    </SettingsRow>
                </motion.div>
            ) : (
                <motion.div key="form" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="p-4 space-y-2.5">
                    <div className="flex items-center justify-between mb-1">
                        <span className="text-[13px] font-bold text-gray-700">
                            {mode === 'create' ? 'Tạo mã PIN' : mode === 'change' ? 'Đổi mã PIN' : 'Xóa mã PIN'}
                        </span>
                        <button onClick={reset} className="text-gray-400 hover:text-gray-600 transition-colors"><X size={14} /></button>
                    </div>
                    {(mode === 'change' || mode === 'delete') && (
                        <input type="password" inputMode="numeric" placeholder="Mã PIN hiện tại" value={pinForm.old} onChange={e => setPinForm(f => ({ ...f, old: e.target.value }))} className={inputClass} />
                    )}
                    {(mode === 'create' || mode === 'change') && (
                        <>
                            <input type="password" inputMode="numeric" placeholder="Mã PIN mới" value={pinForm.new} onChange={e => setPinForm(f => ({ ...f, new: e.target.value }))} className={inputClass} />
                            <input type="password" inputMode="numeric" placeholder="Nhập lại mã PIN" value={pinForm.confirm} onChange={e => setPinForm(f => ({ ...f, confirm: e.target.value }))} className={inputClass} />
                        </>
                    )}
                    {pinError && <p className="text-[12px] text-red-500">{pinError}</p>}
                    <button
                        disabled={saving}
                        onClick={handleAction}
                        className={`w-full py-2 text-[13px] font-semibold rounded-lg transition-colors text-white disabled:opacity-50 ${mode === 'delete' ? 'bg-red-500 hover:bg-red-600' : 'bg-gray-900 hover:bg-gray-800'}`}
                    >
                        {saving ? 'Đang xử lý...' : 'Xác nhận'}
                    </button>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

// ── Main modal ─────────────────────────────────────────────────────────────
export function SettingsModal({ onClose }: SettingsModalProps) {
    const { prefs, update } = useUserSettings();
    const { hasPin, setHasPin } = usePin();

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-[2px]"
            onClick={e => e.target === e.currentTarget && onClose()}
        >
            <motion.div
                initial={{ opacity: 0, scale: 0.96, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ type: 'spring', stiffness: 360, damping: 30 }}
                className="bg-white rounded-2xl shadow-xl border border-gray-100 w-full max-w-sm overflow-hidden flex flex-col"
                style={{ maxHeight: '90vh' }}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
                    <div className="flex items-center gap-2">
                        <Settings size={16} className="text-gray-500" />
                        <span className="text-[15px] font-bold text-gray-800">Cài đặt</span>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100 text-gray-400 transition-colors">
                        <X size={15} />
                    </button>
                </div>

                {/* Body */}
                <div className="overflow-y-auto p-4 space-y-5">
                    {/* Appearance */}
                    <div>
                        <SectionLabel>Giao diện</SectionLabel>
                        <div className="flex p-1 bg-gray-100 rounded-xl">
                            {(['light', 'dark', 'system'] as const).map(t => (
                                <button
                                    key={t}
                                    onClick={() => update({ theme: t })}
                                    className={`flex-1 py-1.5 text-[12px] font-semibold rounded-[10px] transition-all flex items-center justify-center gap-1 ${prefs.theme === t ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                                >
                                    {prefs.theme === t && <Check size={11} className="text-green-500" />}
                                    {t === 'light' ? 'Sáng' : t === 'dark' ? 'Tối' : 'Tự động'}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Preferences */}
                    <div>
                        <SectionLabel>Tùy chọn</SectionLabel>
                        <SettingsGroup>
                            <label className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors">
                                <div className="flex items-center gap-3">
                                    <div className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center">
                                        <Bell size={14} className="text-amber-500" />
                                    </div>
                                    <span className="text-[13px] font-medium text-gray-700">Âm thanh thông báo</span>
                                </div>
                                <Toggle on={prefs.enableSound} onChange={v => update({ enableSound: v })} />
                            </label>
                            <label className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors">
                                <div className="flex items-center gap-3">
                                    <div className="w-7 h-7 rounded-lg bg-indigo-50 flex items-center justify-center">
                                        <Layers size={14} className="text-indigo-500" />
                                    </div>
                                    <div>
                                        <span className="text-[13px] font-medium text-gray-700">Giao diện thu gọn</span>
                                        <p className="text-[11px] text-gray-400">Thu nhỏ khoảng cách bảng</p>
                                    </div>
                                </div>
                                <Toggle on={prefs.compactMode} onChange={v => update({ compactMode: v })} />
                            </label>
                            {/* Test Notification Row */}
                            <div className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
                                <div className="flex items-center gap-3">
                                    <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center">
                                        <Bell size={14} className="text-emerald-500" />
                                    </div>
                                    <div>
                                        <span className="text-[13px] font-medium text-gray-700">Kiểm tra thông báo hệ thống</span>
                                        <p className="text-[11px] text-gray-400">Gửi thông báo thử nghiệm ngay lập tức</p>
                                    </div>
                                </div>
                                <button
                                    onClick={async () => {
                                        if (Notification.permission === 'default') {
                                            await Notification.requestPermission();
                                        }
                                        if (Notification.permission === 'granted') {
                                            if ('serviceWorker' in navigator) {
                                                const reg = await navigator.serviceWorker.getRegistration();
                                                if (reg && reg.active) {
                                                    reg.showNotification('✅ Reyna: Thông báo hoạt động', { body: 'Hệ thống thông báo đẩy qua Service Worker đã sẵn sàng.' });
                                                    return;
                                                }
                                            }
                                            new Notification('✅ Reyna: Thông báo hoạt động', { body: 'Hệ thống thông báo đẩy (Native) đã hoạt động.' });
                                        } else {
                                            alert('Trình duyệt của bạn đang chặn thông báo. Vui lòng cấp quyền trong cài đặt trình duyệt.');
                                        }
                                    }}
                                    className="px-3 py-1.5 text-[12px] font-medium bg-white border border-gray-200 shadow-sm rounded-lg hover:bg-gray-50 text-gray-700 transition-all"
                                >
                                    Gửi thử nghiệm
                                </button>
                            </div>
                        </SettingsGroup>
                    </div>

                    {/* Security */}
                    <div>
                        <SectionLabel>Bảo mật</SectionLabel>
                        <SettingsGroup>
                            <PinSection hasPin={hasPin} setHasPin={setHasPin} />
                        </SettingsGroup>
                    </div>

                    <p className="text-center text-[11px] text-gray-300">Thay đổi tự động được lưu</p>
                </div>
            </motion.div>
        </div>
    );
}
