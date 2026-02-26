import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Search, Link as LinkIcon, Check, Folder } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { doc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { dbLocal } from '../lib/db';
import { useFirestoreSync } from '../hooks/useFirestoreSync';
import { toast } from 'sonner';

interface LinkEmailModalProps {
    isOpen: boolean;
    onClose: () => void;
    selectedCardIds: string[];
    onLinked: () => void;
}

export function LinkEmailModal({ isOpen, onClose, selectedCardIds, onLinked }: LinkEmailModalProps) {
    const { user } = useAuth();
    const [search, setSearch] = useState('');
    const [selectedEmailIds, setSelectedEmailIds] = useState<Set<string>>(new Set());
    const [saving, setSaving] = useState(false);

    const { data: emails } = useFirestoreSync<{ id: string; email: string; categoryId?: string }>('emails');
    const { data: categories } = useFirestoreSync<{ id: string; name: string }>('categories');
    const { data: cards } = useFirestoreSync<{ id: string; linkedEmails?: string[] }>('cards');

    // Pre-fill selection if only 1 card is selected (optional, but good UX: if 1 card selected, show its current links)
    useEffect(() => {
        if (isOpen && selectedCardIds.length === 1) {
            const card = cards.find(c => c.id === selectedCardIds[0]);
            if (card && card.linkedEmails) {
                setSelectedEmailIds(new Set(card.linkedEmails));
            } else {
                setSelectedEmailIds(new Set());
            }
        } else if (isOpen && selectedCardIds.length > 1) {
            // If multiple cards, maybe start blank or intersection. Starting blank is safer.
            setSelectedEmailIds(new Set());
        }
        setSearch('');
    }, [isOpen, selectedCardIds, cards]);

    const filteredEmails = useMemo(() => {
        const q = search.toLowerCase();
        return emails.filter(e => !q || e.email.toLowerCase().includes(q));
    }, [emails, search]);

    // Group emails by category
    const groupedEmails = useMemo(() => {
        const groups: Record<string, typeof emails> = { 'Chưa phân loại': [] };
        categories.forEach(c => {
            groups[c.id] = [];
        });

        filteredEmails.forEach(e => {
            if (e.categoryId && groups[e.categoryId]) {
                groups[e.categoryId].push(e);
            } else {
                groups['Chưa phân loại'].push(e);
            }
        });

        return groups;
    }, [filteredEmails, categories]);

    const toggleEmail = (id: string) => {
        setSelectedEmailIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleSave = async () => {
        if (!user || selectedCardIds.length === 0) return;
        setSaving(true);
        try {
            const batch = writeBatch(db);
            const now = Date.now();
            const emailArray = Array.from(selectedEmailIds);

            // Update all selected cards
            await Promise.all(selectedCardIds.map(async (cardId) => {
                // Determine new linkedEmails array
                // If 1 card, replace exactly.
                // If multiple cards, we APPEND or REPLACE? Usually "Assign Emails" means replace existing or merge. 
                // Let's replace completely to be predictable.
                const newLinked = emailArray;

                // Firestore
                batch.update(doc(db, 'cards', cardId), {
                    linkedEmails: newLinked,
                    updatedAt: serverTimestamp()
                });

                // Dexie
                const existing = await dbLocal.cards.get(cardId);
                if (existing) {
                    await dbLocal.cards.put({ ...existing, linkedEmails: newLinked, updatedAt: now });
                }
            }));

            await batch.commit();
            toast.success(`Đã cập nhật ${selectedCardIds.length} thẻ`);
            onLinked();
            onClose();
        } catch (err: any) {
            console.error('Failed to link emails:', err);
            toast.error('Lỗi khi lưu liên kết');
        } finally {
            setSaving(false);
        }
    };

    const getCategoryName = (catId: string) => {
        if (catId === 'Chưa phân loại') return catId;
        const c = categories.find(x => x.id === catId);
        return c ? c.name : 'Unknown';
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                    onClick={onClose}
                />
                <motion.div
                    initial={{ scale: 0.95, opacity: 0, y: 10 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.95, opacity: 0, y: 10 }}
                    className="relative w-full max-w-md bg-white rounded-2xl shadow-xl border border-gray-100 flex flex-col max-h-[85vh] overflow-hidden"
                >
                    {/* Header */}
                    <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gray-50/50">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600">
                                <LinkIcon size={16} />
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-gray-900">Liên kết Thẻ - Email</h3>
                                <p className="text-[11px] text-gray-500 font-medium">Chọn email để gán vào {selectedCardIds.length} thẻ đang chọn</p>
                            </div>
                        </div>
                        <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors">
                            <X size={18} />
                        </button>
                    </div>

                    {/* Search */}
                    <div className="p-4 border-b border-gray-50">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                            <input
                                type="text"
                                placeholder="Tìm email..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-[13px] text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium"
                            />
                        </div>
                    </div>

                    {/* List */}
                    <div className="flex-1 overflow-y-auto p-2">
                        {Object.entries(groupedEmails).map(([catId, emailsInCat]) => {
                            if (emailsInCat.length === 0) return null;
                            return (
                                <div key={catId} className="mb-4">
                                    <h4 className="flex items-center gap-1.5 px-2 py-1.5 text-[11px] font-bold text-gray-500 uppercase tracking-wider sticky top-0 bg-white/90 backdrop-blur-sm z-10">
                                        <Folder size={12} className="text-indigo-400" />
                                        {getCategoryName(catId)}
                                    </h4>
                                    <div className="space-y-0.5 mt-1">
                                        {emailsInCat.sort((a, b) => a.email.localeCompare(b.email)).map(email => {
                                            const isSelected = selectedEmailIds.has(email.id);
                                            return (
                                                <button
                                                    key={email.id}
                                                    onClick={() => toggleEmail(email.id)}
                                                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all ${isSelected ? 'bg-indigo-50 border border-indigo-100' : 'bg-transparent border border-transparent hover:bg-gray-50'}`}
                                                >
                                                    <span className={`text-[13px] font-medium truncate ${isSelected ? 'text-indigo-900' : 'text-gray-700'}`}>
                                                        {email.email}
                                                    </span>
                                                    <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${isSelected ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-gray-300'}`}>
                                                        {isSelected && <Check size={12} strokeWidth={3} />}
                                                    </div>
                                                </button>
                                            )
                                        })}
                                    </div>
                                </div>
                            )
                        })}
                        {filteredEmails.length === 0 && (
                            <div className="flex flex-col items-center justify-center py-10 text-gray-400">
                                <Search size={24} className="mb-2 opacity-20" />
                                <p className="text-[13px] font-medium">Không tìm thấy email nào</p>
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="p-4 border-t border-gray-100 bg-white flex justify-end gap-3 shrink-0">
                        <button
                            onClick={onClose}
                            className="px-5 py-2 text-[13px] font-semibold text-gray-600 bg-gray-50 hover:bg-gray-100 rounded-xl transition-colors"
                        >
                            Hủy bỏ
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="flex justify-center items-center px-5 py-2 text-[13px] font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all disabled:opacity-70 disabled:pointer-events-none"
                        >
                            {saving ? 'Đang lưu...' : `Cập nhật (${selectedEmailIds.size} email)`}
                        </button>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
