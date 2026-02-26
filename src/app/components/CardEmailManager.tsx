import React, { useState, useMemo, useEffect } from 'react';
import { useFirestoreSync } from '../hooks/useFirestoreSync';
import { CardRecord } from './CardsTable';
import { EmailRecord } from './EmailsTable';
import { useAuth } from '../../contexts/AuthContext';
import { Folder, Link as LinkIcon, Mail, Search, Check, X, Shield, Plus, ShieldAlert, CreditCard } from 'lucide-react';
import { doc, updateDoc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { dbLocal } from '../lib/db';
import { toast } from 'sonner';

export function CardEmailManager() {
    const { user } = useAuth();

    // Data sync
    const { data: categories } = useFirestoreSync<{ id: string; name: string }>('categories');
    const { data: emails } = useFirestoreSync<EmailRecord>('emails');
    const { data: cards } = useFirestoreSync<CardRecord>('cards');

    // UI State
    const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
    const [emailSearch, setEmailSearch] = useState('');
    const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);
    const [cardSearch, setCardSearch] = useState('');
    const [saving, setSaving] = useState(false);

    // Left Pane Filtered Emails
    const filteredEmails = useMemo(() => {
        let result = emails;
        if (selectedCategoryId) {
            result = result.filter(e => e.categoryId === selectedCategoryId);
        }
        if (emailSearch) {
            const q = emailSearch.toLowerCase();
            result = result.filter(e => e.email.toLowerCase().includes(q));
        }
        return result.sort((a, b) => a.email.localeCompare(b.email));
    }, [emails, selectedCategoryId, emailSearch]);

    // Derived Selection Data
    const selectedEmail = emails.find(e => e.id === selectedEmailId);

    // Right Pane Filtered Cards
    const filteredCards = useMemo(() => {
        let result = cards;
        if (cardSearch) {
            const q = cardSearch.toLowerCase();
            result = result.filter(c =>
                c.cardNumber.includes(q) ||
                c.cardholderName?.toLowerCase().includes(q) ||
                c.note?.toLowerCase().includes(q)
            );
        }
        return result.sort((a, b) => b.updatedAt - a.updatedAt);
    }, [cards, cardSearch]);

    // Handle Unlink single card from current email
    const handleUnlink = async (cardId: string, currentLinks: string[]) => {
        if (!user || !selectedEmailId) return;
        const newLinks = currentLinks.filter(id => id !== selectedEmailId);
        try {
            await updateDoc(doc(db, 'cards', cardId), {
                linkedEmails: newLinks,
                updatedAt: serverTimestamp()
            });
            const existing = await dbLocal.cards.get(cardId);
            if (existing) {
                await dbLocal.cards.put({ ...existing, linkedEmails: newLinks, updatedAt: Date.now() });
            }
            toast.success('Đã gỡ liên kết thẻ');
        } catch (err) {
            console.error('Lỗi khi gỡ liên kết:', err);
            toast.error('Gỡ liên kết thất bại');
        }
    };

    // Handle Link single card to current email
    const handleLink = async (cardId: string, currentLinks: string[] = []) => {
        if (!user || !selectedEmailId) return;
        if (currentLinks.includes(selectedEmailId)) return;

        const newLinks = [...currentLinks, selectedEmailId];
        try {
            await updateDoc(doc(db, 'cards', cardId), {
                linkedEmails: newLinks,
                updatedAt: serverTimestamp()
            });
            const existing = await dbLocal.cards.get(cardId);
            if (existing) {
                await dbLocal.cards.put({ ...existing, linkedEmails: newLinks, updatedAt: Date.now() });
            }
            toast.success('Đã liên kết thẻ thành công');
        } catch (err) {
            console.error('Lỗi khi liên kết:', err);
            toast.error('Liên kết thất bại');
        }
    };

    const getCategoryName = (catId?: string) => {
        if (!catId) return 'Chưa phân loại';
        const c = categories.find(x => x.id === catId);
        return c ? c.name : 'Unknown';
    };

    return (
        <div className="h-full bg-white rounded-2xl shadow-sm border border-gray-100 flex overflow-hidden">
            {/* LEFT PANE: Emails List */}
            <div className="w-[350px] shrink-0 border-r border-gray-100 flex flex-col bg-gray-50/30">
                <div className="p-4 border-b border-gray-100 bg-white">
                    <h2 className="text-[14px] font-bold text-gray-800 mb-3 flex items-center gap-2">
                        <Mail size={16} className="text-indigo-600" />
                        Chọn Email
                    </h2>

                    {/* Filters */}
                    <div className="flex flex-col gap-2">
                        <select
                            value={selectedCategoryId || ''}
                            onChange={(e) => {
                                setSelectedCategoryId(e.target.value || null);
                                setSelectedEmailId(null);
                            }}
                            className="w-full h-9 px-3 text-[12px] bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-400"
                        >
                            <option value="">Tất cả danh mục</option>
                            <option value="unassigned">Chưa phân loại</option>
                            {categories.map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>

                        <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                            <input
                                value={emailSearch}
                                onChange={e => setEmailSearch(e.target.value)}
                                placeholder="Tìm email..."
                                className="w-full h-9 pl-8 pr-3 text-[12px] bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-400"
                            />
                        </div>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-2">
                    {filteredEmails.length === 0 ? (
                        <div className="text-center py-10 text-[12px] text-gray-400">Không tìm thấy email nào.</div>
                    ) : (
                        <div className="space-y-1">
                            {filteredEmails.map(email => {
                                const isSelected = selectedEmailId === email.id;
                                // Count how many cards linked to this email
                                const linkedCount = cards.filter(c => c.linkedEmails?.includes(email.id)).length;

                                return (
                                    <button
                                        key={email.id}
                                        onClick={() => setSelectedEmailId(email.id)}
                                        className={`w-full flex flex-col items-start px-3 py-2.5 rounded-xl transition-all border ${isSelected ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-transparent hover:border-gray-200'}`}
                                    >
                                        <div className="flex items-center justify-between w-full mb-1">
                                            <span className={`text-[13px] font-medium truncate ${isSelected ? 'text-indigo-900' : 'text-gray-800'}`}>
                                                {email.email}
                                            </span>
                                            {linkedCount > 0 && (
                                                <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-700">
                                                    {linkedCount} thẻ
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-1.5 text-[10px] text-gray-500">
                                            <Folder size={10} />
                                            <span className="truncate max-w-[120px]">{getCategoryName(email.categoryId)}</span>
                                        </div>
                                    </button>
                                )
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* RIGHT PANE: Linked Cards Manager */}
            <div className="flex-1 flex flex-col min-w-0 bg-white">
                {!selectedEmail ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
                        <LinkIcon size={48} className="mb-4 opacity-20" />
                        <p className="text-[14px] font-medium">Bấm chọn một Email bên trái để bắt đầu gán thẻ.</p>
                    </div>
                ) : (
                    <>
                        <div className="p-5 border-b border-gray-100 bg-white shrink-0">
                            <div className="flex items-center gap-3 mb-1">
                                <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600">
                                    <Mail size={16} />
                                </div>
                                <div>
                                    <h2 className="text-[16px] font-bold text-gray-900">{selectedEmail.email}</h2>
                                    <p className="text-[12px] text-gray-500 flex items-center gap-1.5">
                                        <Folder size={12} /> {getCategoryName(selectedEmail.categoryId)}
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="p-4 border-b border-gray-50 bg-gray-50/50 flex items-center justify-between shrink-0">
                            <h3 className="text-[13px] font-bold text-gray-800 flex items-center gap-1.5">
                                <CreditCard size={14} className="text-gray-500" />
                                Quản lý Thẻ ({cards.filter(c => c.linkedEmails?.includes(selectedEmail.id)).length} đã gán)
                            </h3>
                            <div className="relative w-64">
                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                                <input
                                    value={cardSearch}
                                    onChange={e => setCardSearch(e.target.value)}
                                    placeholder="Tìm thẻ (số đuôi, note...)"
                                    className="w-full h-8 pl-8 pr-3 text-[12px] bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-400 shadow-sm"
                                />
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 bg-gray-50/30">
                            {filteredCards.length === 0 ? (
                                <div className="text-center py-10 text-[12px] text-gray-400">Không tìm thấy thẻ nào.</div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                    {filteredCards.map(card => {
                                        const isLinked = card.linkedEmails?.includes(selectedEmail.id);
                                        const totalLinks = card.linkedEmails?.length || 0;
                                        const rawLast4 = card.cardNumber.replace(/\D/g, '').slice(-4);

                                        return (
                                            <div
                                                key={card.id}
                                                className={`p-3 rounded-xl border transition-all flex flex-col gap-2 relative overflow-hidden ${isLinked ? 'bg-indigo-50/50 border-indigo-200 shadow-[0_2px_10px_-3px_rgba(99,102,241,0.2)]' : 'bg-white border-gray-200 shadow-sm hover:border-gray-300'}`}
                                            >
                                                {/* Card Header Content */}
                                                <div className="flex items-start justify-between">
                                                    <div>
                                                        <div className="text-[14px] font-mono font-bold tracking-wider text-gray-800">
                                                            •••• {rawLast4}
                                                        </div>
                                                        <div className="text-[11px] text-gray-500 line-clamp-1 mt-0.5">
                                                            {card.note || card.cardholderName || 'Không có ghi chú'}
                                                        </div>
                                                    </div>

                                                    {/* Toggle Link Button */}
                                                    <button
                                                        onClick={() => isLinked ? handleUnlink(card.id, card.linkedEmails || []) : handleLink(card.id, card.linkedEmails)}
                                                        className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all ${isLinked ? 'bg-indigo-600 text-white shadow-md hover:bg-red-500 hover:scale-105' : 'bg-gray-100 text-gray-400 hover:bg-indigo-50 hover:text-indigo-600'}`}
                                                        title={isLinked ? 'Gỡ liên kết' : 'Gán vào Email này'}
                                                    >
                                                        {isLinked ? (
                                                            // Hover state swap handled via group/peer logic usually, but here we just show Check or X on hover ideally.
                                                            // For simplicity: Check icon
                                                            <Check size={14} className="stroke-[3px]" />
                                                        ) : (
                                                            <Plus size={14} className="stroke-[3px]" />
                                                        )}
                                                    </button>
                                                </div>

                                                {/* Footer metadata */}
                                                <div className="mt-2 pt-2 border-t border-gray-100/50 flex items-center justify-between">
                                                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${isLinked ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-500'}`}>
                                                        {isLinked ? 'Đang thuộc Email này' : 'Chưa gán'}
                                                    </span>

                                                    {totalLinks > 0 && !isLinked && (
                                                        <span className="text-[10px] text-gray-400 flex items-center gap-1" title="Thẻ này đang thuộc về Email khác">
                                                            <LinkIcon size={10} /> {totalLinks} email khác
                                                        </span>
                                                    )}
                                                </div>

                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
