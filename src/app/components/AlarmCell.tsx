import { Check } from 'lucide-react';
import React, { useState } from 'react';

interface AlarmCellProps {
    recordId: string;
    nearestAlarmTime: number | null; // Trigger timestamp in ms, or null if no alarm
    now: number; // Current shared timestamp
    onDone: (alarmId: string) => Promise<void>;
    onClick: () => void;
    tick?: number;
}

function formatRemaining(ms: number): { text: string; urgent: boolean; overdue: boolean } {
    const overdue = ms <= 0;
    if (overdue) return { text: '00:00', urgent: false, overdue: true };

    const totalSec = Math.floor(ms / 1000);
    const days = Math.floor(totalSec / 86400);
    const hours = Math.floor((totalSec % 86400) / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;

    let text: string;
    if (days > 0) {
        text = `${days}d ${String(hours).padStart(2, '0')}h`;
    } else if (hours > 0) {
        text = `${hours}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    } else {
        text = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }

    return { text, urgent: totalSec < 60, overdue: false };
}

/**
 * Pure presentational version of AlarmCell. 
 * Externalizing state and ticking into the parent table improves performance and sorting reliability.
 */
export function AlarmCell({ recordId, nearestAlarmTime, now, onDone, onClick }: AlarmCellProps) {
    const [confirming, setConfirming] = useState(false);

    const handleDoneClick = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!nearestAlarmTime) return;

        // In a pure cell, we don't know the alarm ID easily unless we pass it.
        // However, the parent can handle finding the alarm record by recordId + time.
        // Simplifying: let's assume the parent gives us a way to mark the *nearest* as done.
        if (!confirming) {
            setConfirming(true);
            setTimeout(() => setConfirming(false), 3000);
            return;
        }

        // We need to tell the parent to mark the nearest alarm for this record as done.
        await onDone(recordId);
        setConfirming(false);
    };

    const hasAlarm = nearestAlarmTime !== null;
    const remaining = hasAlarm ? nearestAlarmTime! - now : -1;
    const { text, urgent, overdue } = hasAlarm ? formatRemaining(remaining) : { text: '00:00', urgent: false, overdue: false };

    const colorClass = hasAlarm
        ? overdue
            ? 'text-amber-500 hover:bg-amber-50'
            : urgent
                ? 'text-sky-500 hover:bg-sky-50 animate-pulse'
                : 'text-sky-500 hover:bg-sky-50'
        : 'text-gray-300 hover:text-sky-400 hover:bg-sky-50';

    const confirmBgClass = overdue ? 'bg-emerald-600' : 'bg-sky-500';
    const confirmRingClass = overdue ? 'ring-emerald-200' : 'ring-sky-200';

    return (
        <div className="relative w-full h-full flex items-center justify-center">
            <button
                onClick={e => { e.stopPropagation(); onClick(); }}
                title={hasAlarm
                    ? `Hẹn giờ: ${new Date(nearestAlarmTime!).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })}`
                    : 'Đặt hẹn giờ'
                }
                className={`w-full h-full py-1.5 text-[13px] font-mono font-semibold tracking-tight rounded transition-colors flex items-center justify-center ${colorClass}`}
            >
                {text}
            </button>

            {hasAlarm && (
                <button
                    onClick={handleDoneClick}
                    title={confirming ? "Xác nhận đã xong?" : "Đánh dấu hoàn thành"}
                    className={`absolute right-1 p-1 rounded-md transition-all duration-300 ${confirming
                        ? `${confirmBgClass} text-white scale-110 shadow-md ring-2 ${confirmRingClass}`
                        : 'text-gray-300 hover:text-emerald-500 hover:bg-emerald-50 opacity-0 group-hover/row:opacity-100'
                        }`}
                    style={{
                        opacity: confirming ? 1 : undefined
                    }}
                >
                    <Check size={14} className={confirming ? "animate-pulse" : ""} />
                </button>
            )}
        </div>
    );
}
