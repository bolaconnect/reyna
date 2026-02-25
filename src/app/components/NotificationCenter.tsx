import { useState, useRef, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Bell, BellOff, Check, CheckCheck, Trash2, X } from 'lucide-react';
import { dbLocal, NotificationRecord } from '../lib/db';

interface NotificationCenterProps {
    userId: string;
    onClose: () => void;
    onSelectRecord: (recordId: string, collection: 'cards' | 'emails') => void;
}

export function NotificationCenter({ userId, onClose, onSelectRecord }: NotificationCenterProps) {
    const items = useLiveQuery(async () => {
        const all = await dbLocal.notifications
            .where('userId').equals(userId)
            .reverse()
            .sortBy('createdAt');
        return all.reverse();
    }, [userId]) || [];

    const loading = items === undefined;

    const markRead = async (id: string) => {
        await dbLocal.notifications.update(id, { readAt: Date.now() } as any);
    };

    const markAllRead = async () => {
        const now = Date.now();
        const unread = items.filter(n => !n.readAt);
        await Promise.all(unread.map(n => dbLocal.notifications.update(n.id, { readAt: now } as any)));
    };

    const deleteOne = async (id: string) => {
        await dbLocal.notifications.delete(id);
    };

    const deleteAll = async () => {
        await dbLocal.notifications.where('userId').equals(userId).delete();
    };

    const unreadCount = items.filter(n => !n.readAt).length;

    const timeAgo = (ts: number) => {
        const diff = Date.now() - ts;
        const s = Math.floor(diff / 1000);
        if (s < 60) return 'vừa xong';
        const m = Math.floor(s / 60);
        if (m < 60) return `${m} phút trước`;
        const h = Math.floor(m / 60);
        if (h < 24) return `${h} giờ trước`;
        return new Date(ts).toLocaleDateString('vi-VN');
    };

    return (
        <div className="absolute bottom-full left-full ml-2 mb-0 w-80 bg-white border border-gray-100 rounded-2xl shadow-xl z-50 flex flex-col overflow-hidden"
            style={{ maxHeight: '420px', bottom: '0', left: '100%' }}>

            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-100 shrink-0">
                <div className="flex items-center gap-1.5">
                    <Bell size={13} className="text-gray-500" />
                    <span className="text-[12px] font-semibold text-gray-800">Thông báo</span>
                    {unreadCount > 0 && (
                        <span className="px-1.5 py-0.5 text-[10px] font-bold bg-red-500 text-white rounded-full leading-none">{unreadCount}</span>
                    )}
                </div>
                <div className="flex items-center gap-0.5">
                    {unreadCount > 0 && (
                        <button onClick={markAllRead} title="Đánh dấu tất cả đã đọc" className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-green-500 transition-colors">
                            <CheckCheck size={12} />
                        </button>
                    )}
                    {items.length > 0 && (
                        <button onClick={deleteAll} title="Xóa tất cả" className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-400 transition-colors">
                            <Trash2 size={12} />
                        </button>
                    )}
                    <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 text-gray-400 transition-colors">
                        <X size={12} />
                    </button>
                </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto">
                {loading ? (
                    <div className="py-8 text-center text-[12px] text-gray-400">Đang tải...</div>
                ) : items.length === 0 ? (
                    <div className="py-8 text-center">
                        <BellOff size={24} className="text-gray-200 mx-auto mb-2" />
                        <p className="text-[12px] text-gray-400">Chưa có thông báo nào</p>
                    </div>
                ) : (
                    items.map(notif => (
                        <div
                            key={notif.id}
                            onClick={() => {
                                if (!notif.readAt) markRead(notif.id);
                                if (notif.recordId && notif.collection) {
                                    onSelectRecord(notif.recordId, notif.collection);
                                    onClose();
                                }
                            }}
                            title={notif.recordId ? "Xem chi tiết" : undefined}
                            className={`flex items-start gap-2.5 px-3 py-2.5 border-b border-gray-50 cursor-pointer group transition-colors ${notif.readAt ? 'bg-white hover:bg-gray-50' : 'bg-amber-50/60 hover:bg-amber-50'
                                }`}
                        >
                            {/* Unread dot */}
                            <div className="mt-1 shrink-0">
                                {notif.readAt
                                    ? <Check size={11} className="text-gray-300" />
                                    : <span className="w-2 h-2 bg-amber-400 rounded-full block" />
                                }
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className={`text-[12px] leading-snug ${notif.readAt ? 'font-normal text-gray-500' : 'font-semibold text-gray-800'}`}>
                                    {notif.title}
                                </p>
                                {notif.body && (
                                    <p className="text-[11px] text-gray-400 mt-0.5 leading-snug">{notif.body}</p>
                                )}
                                <p className="text-[10px] text-gray-300 mt-1">{timeAgo(notif.createdAt)}</p>
                            </div>
                            <button
                                onClick={e => { e.stopPropagation(); deleteOne(notif.id); }}
                                className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-red-50 text-gray-300 hover:text-red-400 transition-all shrink-0"
                            >
                                <X size={11} />
                            </button>
                        </div>
                    ))
                )}
            </div>

            {/* Footer count */}
            {items.length > 0 && (
                <div className="px-3 py-1.5 border-t border-gray-50 shrink-0">
                    <p className="text-[10px] text-gray-400 text-center">
                        {unreadCount > 0 ? `${unreadCount} chưa đọc · ` : ''}{items.length} thông báo
                    </p>
                </div>
            )}
        </div>
    );
}
