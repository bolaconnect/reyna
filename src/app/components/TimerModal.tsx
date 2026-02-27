import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Bell, Trash2, Clock } from 'lucide-react';
import { AlarmRecord } from '../lib/db';
import { motion, AnimatePresence } from 'motion/react';

interface TimerModalProps {
    recordId: string;
    collection: 'cards' | 'emails';
    label: string;
    existingAlarms: AlarmRecord[];
    onAdd: (alarm: Omit<AlarmRecord, 'id' | 'userId' | 'fired' | 'createdAt'>) => Promise<void>;
    onDelete: (id: string) => Promise<void>;
    onClose: () => void;
}

type Mode = 'datetime' | 'countdown';

// ── Simple spin drum ───────────────────────────────────────────────────────
interface DrumProps {
    items: string[];
    selectedIndex: number;
    onChange: (index: number) => void;
    label: string;
}

const ITEM_H = 40;

function Drum({ items, selectedIndex, onChange, label }: DrumProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const wheelAcc = useRef(0);
    const wheelCooldown = useRef(false);
    const touchStartY = useRef(0);
    const touchMovedPx = useRef(0);

    const move = useCallback((delta: number) => {
        const next = Math.max(0, Math.min(items.length - 1, selectedIndex + delta));
        if (next !== selectedIndex) onChange(next);
    }, [selectedIndex, items.length, onChange]);

    const handleWheel = useCallback((e: React.WheelEvent) => {
        // e.preventDefault() removed due to passive event listener violation
        if (wheelCooldown.current) return;
        // Move exactly 1 step per wheel notch, ignoring accumulated delta
        move(e.deltaY > 0 ? 1 : -1);
        // Short cooldown to prevent double-fires on momentum scrolling
        wheelCooldown.current = true;
        setTimeout(() => { wheelCooldown.current = false; }, 80);
    }, [move]);

    const handleTouchStart = (e: React.TouchEvent) => {
        touchStartY.current = e.touches[0].clientY;
        touchMovedPx.current = 0;
    };
    const handleTouchMove = (e: React.TouchEvent) => {
        // e.preventDefault() removed due to passive event listener violation
        const dy = touchStartY.current - e.touches[0].clientY;
        touchMovedPx.current += dy;
        touchStartY.current = e.touches[0].clientY;
        while (touchMovedPx.current >= ITEM_H / 2) { move(1); touchMovedPx.current -= ITEM_H / 2; }
        while (touchMovedPx.current <= -ITEM_H / 2) { move(-1); touchMovedPx.current += ITEM_H / 2; }
    };


    return (
        <div className="flex flex-col items-center gap-1">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{label}</span>
            <div className="relative" style={{ width: 72, height: ITEM_H * 3 }}>
                {/* selection highlight */}
                <div
                    className="absolute left-0 right-0 rounded-lg pointer-events-none z-10 border border-gray-200 dark:border-gray-600"
                    style={{ top: ITEM_H, height: ITEM_H, background: 'rgba(128,128,128,0.1)' }}
                />
                {/* top/bottom fade */}
                <div className="absolute inset-0 pointer-events-none z-10 from-white via-transparent to-white dark:from-[#1c1c28] dark:to-[#1c1c28]" style={{
                    background: 'linear-gradient(to bottom, var(--fade-color, rgba(255,255,255,0.95)) 0%, transparent 33%, transparent 67%, var(--fade-color, rgba(255,255,255,0.95)) 100%)'
                }} />
                {/* Items — translated as a block, no native scroll */}
                <div
                    ref={containerRef}
                    className="absolute inset-0 overflow-hidden cursor-ns-resize drum-container touch-none"
                    onWheel={handleWheel}
                    onTouchStart={handleTouchStart}
                    onTouchMove={handleTouchMove}
                >
                    <div
                        style={{
                            transform: `translateY(${(1 - selectedIndex) * ITEM_H}px)`,
                            transition: 'transform 0.18s cubic-bezier(0.25, 1, 0.5, 1)',
                        }}
                    >
                        {items.map((item, i) => {
                            const isSelected = i === selectedIndex;
                            return (
                                <div
                                    key={i}
                                    onClick={() => onChange(i)}
                                    className={`flex items-center justify-center select-none transition-all duration-150 ${isSelected ? 'text-gray-900 dark:text-white font-bold' : 'text-gray-300 dark:text-gray-600 font-normal'}`}
                                    style={{
                                        height: ITEM_H,
                                        fontSize: isSelected ? 22 : 15,
                                    }}
                                >
                                    {item}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}

// ── Main Modal ─────────────────────────────────────────────────────────────
export function TimerModal({ recordId, collection, label, existingAlarms, onAdd, onDelete, onClose }: TimerModalProps) {
    const [mode, setMode] = useState<Mode>('countdown');
    const [note, setNote] = useState('');
    const [dateValue, setDateValue] = useState(() => {
        const d = new Date(Date.now() + 5 * 60_000);
        return d.toISOString().slice(0, 16);
    });
    const [hours, setHours] = useState(0);
    const [minutes, setMinutes] = useState(5);
    const [seconds, setSeconds] = useState(0);
    const [saving, setSaving] = useState(false);
    const [alarms, setAlarms] = useState<AlarmRecord[]>([]);

    const hourItems = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
    const minSecItems = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

    useEffect(() => {
        const active = existingAlarms.filter(a => a.fired === 0 && !a.doneAt);
        setAlarms(active);

        if (active.length > 0) {
            const current = active[0];
            setNote(current.note || '');
            setMode('datetime');
            const d = new Date(current.triggerAt);
            const tzOffset = d.getTimezoneOffset() * 60000;
            const localISOTime = new Date(d.getTime() - tzOffset).toISOString().slice(0, 16);
            setDateValue(localISOTime);
        }
    }, [existingAlarms]);

    const formatCountdown = (ms: number) => {
        const diff = ms - Date.now();
        if (diff <= 0) return 'Đang xử lý...';
        const s = Math.floor(diff / 1000);
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const sec = s % 60;
        if (h > 0) return `${h}h ${m}m`;
        if (m > 0) return `${m}m ${sec}s`;
        return `${sec}s`;
    };

    const handleSave = async () => {
        if (saving) return;
        setSaving(true);

        // Request notification permission natively upon explicit user action
        if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
            await Notification.requestPermission();
        }

        let triggerAt: number;
        if (mode === 'datetime') {
            triggerAt = new Date(dateValue).getTime();
        } else {
            const ms = ((hours * 3600) + (minutes * 60) + seconds) * 1000;
            if (ms <= 0) { setSaving(false); return; }
            triggerAt = Date.now() + ms;
        }

        // Delete older alarms to enforce 1-alarm-per-record limit
        for (const alarm of alarms) {
            await onDelete(alarm.id);
        }

        await onAdd({ recordId, collection, label, note, triggerAt, updatedAt: Date.now() });
        setNote('');
        setSaving(false);
        onClose();
    };

    const handleDeleteAll = async () => {
        setSaving(true);
        for (const alarm of alarms) {
            await onDelete(alarm.id);
        }
        setSaving(false);
        onClose();
    };

    const handleDelete = async (id: string) => {
        await onDelete(id);
        setAlarms(prev => prev.filter(a => a.id !== id));
    };

    return (
        <div
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/30 backdrop-blur-[2px]"
            onClick={e => { if (e.target === e.currentTarget) onClose(); }}
        >
            <motion.div
                initial={{ opacity: 0, scale: 0.96, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                className="bg-white rounded-2xl shadow-xl border border-gray-100 w-full max-w-[340px] overflow-hidden"
            >
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3.5 border-b border-gray-100">
                    <div className="flex items-center gap-2">
                        <Bell size={15} className="text-blue-500" />
                        <span className="text-[14px] font-bold text-gray-800">Đặt hẹn giờ</span>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100 text-gray-400 transition-colors">
                        <X size={15} />
                    </button>
                </div>

                <div className="p-4 space-y-4">
                    {/* Mode tabs */}
                    <div className="flex p-0.5 bg-gray-100 rounded-xl">
                        {(['countdown', 'datetime'] as Mode[]).map(m => (
                            <button
                                key={m}
                                onClick={() => setMode(m)}
                                className={`flex-1 py-1.5 text-[12px] font-semibold rounded-[10px] transition-all ${mode === m ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-400 hover:text-gray-600'
                                    }`}
                            >
                                {m === 'countdown' ? 'Đếm ngược' : 'Thời gian'}
                            </button>
                        ))}
                    </div>

                    {/* Picker */}
                    <AnimatePresence mode="wait">
                        {mode === 'countdown' ? (
                            <motion.div
                                key="cd"
                                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                className="flex justify-center items-center gap-1 py-1 bg-gray-50 rounded-xl border border-gray-100"
                            >
                                <Drum items={hourItems} selectedIndex={hours} onChange={setHours} label="Giờ" />
                                <span className="text-xl text-gray-300 font-light self-center mt-5">:</span>
                                <Drum items={minSecItems} selectedIndex={minutes} onChange={setMinutes} label="Phút" />
                                <span className="text-xl text-gray-300 font-light self-center mt-5">:</span>
                                <Drum items={minSecItems} selectedIndex={seconds} onChange={setSeconds} label="Giây" />
                            </motion.div>
                        ) : (
                            <motion.div key="dt" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                                <input
                                    type="datetime-local"
                                    value={dateValue}
                                    onChange={e => setDateValue(e.target.value)}
                                    className="w-full h-10 px-3 text-[13px] border border-gray-200 bg-gray-50 rounded-xl focus:outline-none focus:border-gray-400 focus:bg-white transition-colors"
                                />
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Note */}
                    <textarea
                        value={note}
                        onChange={e => setNote(e.target.value)}
                        placeholder="Ghi chú..."
                        rows={2}
                        className="w-full px-3 py-2.5 text-[13px] bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-gray-400 focus:bg-white resize-none transition-colors"
                    />

                    {/* Delete Action if exists */}
                    <AnimatePresence>
                        {alarms.length > 0 && (
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                                <button
                                    onClick={handleDeleteAll}
                                    className="w-full flex items-center justify-center gap-2 h-10 px-3 text-[12px] font-semibold text-red-500 bg-red-50 hover:bg-red-100 rounded-xl transition-colors"
                                >
                                    <Trash2 size={14} /> Xóa hẹn giờ hiện tại
                                </button>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* Footer */}
                <div className="flex gap-2 px-4 pb-4">
                    <button onClick={onClose} className="flex-1 h-10 text-[13px] font-semibold text-gray-500 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors">
                        Hủy
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="flex-[2] h-10 text-[13px] font-bold text-white bg-gray-900 hover:bg-gray-800 rounded-xl transition-colors disabled:opacity-50"
                    >
                        {saving ? 'Đang lưu...' : 'Đặt thông báo'}
                    </button>
                </div>
            </motion.div>
        </div>
    );
}
