import { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mail, CreditCard, ChevronRight, Search, Folder, User, Link as LinkIcon, Info, Trash2, Copy, Check, Plus, X, Bookmark } from 'lucide-react';
import { useFirestoreSync } from '../hooks/useFirestoreSync';
import { EmailCategoryRecord } from '../lib/db';
import { useVisibility } from '../../contexts/VisibilityContext';
import { useAuth } from '../../contexts/AuthContext';
import { EmailRecord } from './EmailsTable';
import { CardRecord } from './CardsTable';
import { db } from '../../firebase/config';
import { toast } from 'sonner';
import { maskEmail, maskCardNumber, formatCardNumberSpaced, formatExpiry, maskCVV } from '../../utils/mask';
import { doc, updateDoc, arrayRemove, arrayUnion, serverTimestamp } from 'firebase/firestore';
import { CopyCell } from './CopyCell';
import { AlarmCell } from './AlarmCell';
import { StatusSelect } from './StatusSelect';
import { TimerModal } from './TimerModal';
import { EmailDetailModal } from './EmailDetailModal';
import { CardDetailModal } from './CardDetailModal';
import { PayInput } from './PayInput';
import { useAlarms } from '../hooks/useAlarms';
import { AlarmRecord, dbLocal } from '../lib/db';

interface CategoryExplorerProps {
    activeCategoryId: string | null;
    targetUserId?: string | null;
}

function InlineNoteEdit({ value, onSave }: { value: string, onSave: (val: string) => void }) {
    const [editing, setEditing] = useState(false);
    const [localVal, setLocalVal] = useState(value);

    const handleSave = () => {
        setEditing(false);
        if (localVal !== value) onSave(localVal);
    }

    if (editing) {
        return (
            <input
                autoFocus
                value={localVal}
                onChange={e => setLocalVal(e.target.value)}
                onBlur={handleSave}
                onKeyDown={e => {
                    if (e.key === 'Enter') handleSave();
                    if (e.key === 'Escape') { setLocalVal(value); setEditing(false); }
                }}
                className="text-[11px] text-gray-800 italic bg-amber-50 border border-blue-300 rounded px-1 w-full outline-none"
            />
        );
    }
    return (
        <div
            onDoubleClick={(e) => { e.stopPropagation(); setLocalVal(value); setEditing(true); }}
            title="Nháy đúp để sửa ghi chú"
            className="text-[11px] text-gray-500 line-clamp-2 max-w-[200px] italic cursor-text hover:bg-gray-100/50 p-0.5 rounded transition-colors"
        >
            {value || 'Thêm ghi chú...'}
        </div>
    );
}

export function CategoryExplorer({ activeCategoryId, targetUserId }: CategoryExplorerProps) {
    const { user } = useAuth();
    const { isVisible } = useVisibility();
    const { data: emails, loading: emailsLoading } = useFirestoreSync<EmailRecord>('emails', undefined, targetUserId);
    const { data: cards, loading: cardsLoading } = useFirestoreSync<CardRecord>('cards', undefined, targetUserId);
    const { data: categories } = useFirestoreSync<EmailCategoryRecord>('categories', undefined, targetUserId);

    const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);
    const [emailSearch, setEmailSearch] = useState('');
    const [isLinking, setIsLinking] = useState(false);
    const [linkSearch, setLinkSearch] = useState('');

    // Enhancement states
    const [hoveredId, setHoveredId] = useState<string | null>(null);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [detailRecord, setDetailRecord] = useState<EmailRecord | null>(null);
    const [detailCardRecord, setDetailCardRecord] = useState<CardRecord | null>(null);
    const [deleteEmailConfirm, setDeleteEmailConfirm] = useState<string | null>(null);
    const [unlinkCardConfirm, setUnlinkCardConfirm] = useState<string | null>(null);

    // Timer modal states
    const [timerCardId, setTimerCardId] = useState<string | null>(null);
    const [timerAlarms, setTimerAlarms] = useState<AlarmRecord[]>([]);
    const [alarmRefreshTick, setAlarmRefreshTick] = useState(0);
    const { getAlarmsForRecord, markAsDone, deleteAlarm, addAlarm, nearestAlarmsMap } = useAlarms({ userId: user?.uid });

    const updateEmailField = async (id: string, field: string, value: string | boolean) => {
        try {
            await updateDoc(doc(db, 'emails', id), { [field]: value, updatedAt: serverTimestamp() });
        } catch (err: any) {
            console.error('Update email field error:', err);
        }
    };

    const openTimer = async (cardId: string) => {
        const alarms = await getAlarmsForRecord(`category_card_${cardId}`);
        setTimerAlarms(alarms);
        setTimerCardId(cardId);
    };

    const handleAlarmDone = async (cardId: string) => {
        const alarms = await getAlarmsForRecord(`category_card_${cardId}`);
        if (alarms.length === 0) return;
        const pending = alarms.filter(a => !a.doneAt).sort((a, b) => a.triggerAt - b.triggerAt);
        if (pending.length > 0) {
            await markAsDone(pending[0].id);
            setAlarmRefreshTick(t => t + 1);
        }
    };

    const handleCopied = (id: string) => {
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 1000);
    };

    const updateField = async (id: string, field: string, value: string | boolean) => {
        try {
            await updateDoc(doc(db, 'cards', id), { [field]: value, updatedAt: serverTimestamp() });
        } catch (err: any) {
            if (err?.code === 'not-found') {
                await dbLocal.cards.delete(id);
            } else {
                console.error('Update field error:', err);
            }
        }
    };


    // Filter emails by category and sort them statically to prevent jumping
    const filteredEmails = useMemo(() => {
        let list = emails;
        if (activeCategoryId) {
            list = list.filter(e => e.categoryId === activeCategoryId);
        }
        if (emailSearch) {
            const s = emailSearch.toLowerCase();
            list = list.filter(e =>
                e.email.toLowerCase().includes(s) ||
                e.note?.toLowerCase().includes(s)
            );
        }
        return list.sort((a, b) => a.id.localeCompare(b.id)); // Fixed sorting to prevent jumping
    }, [emails, activeCategoryId, emailSearch]);

    // Clear selected email when category changes
    useEffect(() => {
        setSelectedEmailId(null);
    }, [activeCategoryId]);

    // Get cards linked to selected email
    const linkedCards = useMemo(() => {
        if (!selectedEmailId) return [];
        return cards.filter(c => c.linkedEmails?.includes(selectedEmailId));
    }, [cards, selectedEmailId]);

    const activeCategoryName = useMemo(() => {
        if (!activeCategoryId) return 'Tất cả Email';
        return categories.find(c => c.id === activeCategoryId)?.name || 'Không xác định';
    }, [categories, activeCategoryId]);

    const selectedEmail = useMemo(() =>
        emails.find(e => e.id === selectedEmailId),
        [emails, selectedEmailId]);

    const availableCards = useMemo(() => {
        if (!selectedEmailId) return [];
        const lowerSearch = linkSearch.toLowerCase();
        return cards.filter(c =>
            !c.linkedEmails?.includes(selectedEmailId) &&
            (c.cardNumber.includes(lowerSearch) || c.cardholderName?.toLowerCase().includes(lowerSearch))
        );
    }, [cards, selectedEmailId, linkSearch]);

    // Auto-dismiss unlink confirm after 3s
    useEffect(() => {
        if (!unlinkCardConfirm) return;
        const timer = setTimeout(() => setUnlinkCardConfirm(null), 3000);
        const handleClick = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (target.closest('[data-delete-confirm]')) return;
            setUnlinkCardConfirm(null);
        };
        setTimeout(() => document.addEventListener('click', handleClick), 0);
        return () => { clearTimeout(timer); document.removeEventListener('click', handleClick); };
    }, [unlinkCardConfirm]);

    const handleCopy = (text: string, label: string) => {
        navigator.clipboard.writeText(text);
        toast.success(`Đã sao chép ${label} `);
    };

    const handleDeleteEmail = async (emailId: string) => {
        try {
            await updateDoc(doc(db, 'emails', emailId), { categoryId: '', updatedAt: serverTimestamp() });
            toast.success('Đã gỡ email khỏi danh mục');
            if (selectedEmailId === emailId) setSelectedEmailId(null);
            setDeleteEmailConfirm(null);
        } catch (err) {
            console.error('Lỗi khi gỡ email:', err);
            toast.error('Lỗi khi gỡ email');
        }
    };

    const toggleBookmark = async (email: EmailRecord) => {
        try {
            await updateDoc(doc(db, 'emails', email.id), {
                bookmarked: !email.bookmarked,
                updatedAt: serverTimestamp()
            });
        } catch (err: any) {
            console.error("Toggle bookmark error:", err);
            toast.error('Lỗi khi cập nhật dấu trang');
        }
    };

    const handleUnlink = async (cardId: string) => {
        if (!selectedEmailId) return;

        try {
            await updateDoc(doc(db, 'cards', cardId), {
                linkedEmails: arrayRemove(selectedEmailId),
                updatedAt: serverTimestamp()
            });
            toast.success('Đã hủy liên kết thẻ');
            setUnlinkCardConfirm(null);
        } catch (err) {
            console.error('Unlink error', err);
            toast.error('Lỗi khi hủy liên kết');
        }
    };

    const handleLinkCard = async (cardId: string) => {
        if (!selectedEmailId) return;

        try {
            await updateDoc(doc(db, 'cards', cardId), {
                linkedEmails: arrayUnion(selectedEmailId),
                updatedAt: serverTimestamp()
            });
            setIsLinking(false);
            setLinkSearch('');
            toast.success('Đã liên kết thẻ thành công');
        } catch (err) {
            console.error('Link error', err);
            toast.error('Lỗi khi liên kết thẻ');
        }
    };

    const isLoading = emailsLoading || cardsLoading;

    if (isLoading) {
        return (
            <div className="flex-1 flex items-center justify-center text-gray-400 text-[13px]">
                <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin mr-3" />
                Đang tải dữ liệu...
            </div>
        );
    }

    return (
        <div className="flex-1 flex overflow-hidden bg-gray-50/30">
            {/* Left Pane: Emails */}
            <div className="w-[35%] flex flex-col border-r border-gray-100 bg-white relative z-[20]">
                <div className="p-4 border-b border-gray-100 bg-gray-50/30 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Folder size={16} className="text-blue-500" />
                        <h3 className="text-[14px] font-bold text-gray-900 truncate max-w-[200px]">
                            {activeCategoryName}
                        </h3>
                        <span className="text-[11px] px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded-full font-bold">
                            {filteredEmails.length}
                        </span>
                    </div>
                </div>
                <div className="p-3 border-b border-gray-100 bg-white">
                    <div className="relative">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Tìm email..."
                            value={emailSearch}
                            onChange={(e) => setEmailSearch(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-transparent rounded-xl text-[12px] focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition-all shadow-sm"
                        />
                    </div>
                </div>

                {/* Email Table */}
                <div className="flex-1 overflow-auto custom-scrollbar pb-32">
                    <table className="w-full text-left border-collapse">
                        <thead className="sticky top-0 bg-white z-10 border-b border-gray-100 shadow-sm">
                            <tr>
                                <th className="px-4 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Thông tin Email</th>
                                <th className="px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-right">Trạng thái & Hành động</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {filteredEmails.map(email => (
                                <tr
                                    key={email.id}
                                    onClick={() => setSelectedEmailId(email.id)}
                                    className={`cursor-pointer transition-colors group relative focus-within:z-[50] ${selectedEmailId === email.id ? 'bg-blue-50 z-[20]' : 'hover:bg-gray-50/50 z-[10]'}`}
                                >
                                    <td className="px-4 py-3 align-top">
                                        <div className="flex flex-col gap-1.5">
                                            <div className="flex items-center gap-2">
                                                <Mail size={14} className={selectedEmailId === email.id ? 'text-blue-500' : 'text-gray-400'} />
                                                <span className={`text-[13px] font-bold ${selectedEmailId === email.id ? 'text-blue-700' : 'text-gray-800'}`}>
                                                    {isVisible ? email.email : maskEmail(email.email)}
                                                </span>
                                            </div>
                                            <div className="ml-6 flex items-start">
                                                <InlineNoteEdit
                                                    value={email.note || ''}
                                                    onSave={(val) => updateEmailField(email.id, 'note', val)}
                                                />
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-3 py-3 align-top">
                                        <div className="flex flex-col items-end gap-2">
                                            <div onClick={(e) => e.stopPropagation()}>
                                                <StatusSelect
                                                    value={email.status || ''}
                                                    collectionType="emails"
                                                    onChange={(val) => updateEmailField(email.id, 'status', val)}
                                                    align="right"
                                                />
                                            </div>
                                            <div className="flex items-center justify-end gap-0.5">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); toggleBookmark(email); }}
                                                    className={`p-1.5 rounded transition-colors ${email.bookmarked
                                                        ? 'text-amber-500 hover:bg-amber-50'
                                                        : 'text-gray-400 hover:bg-amber-50 hover:text-amber-500'
                                                        }`}
                                                    title={email.bookmarked ? 'Bỏ theo dõi' : 'Đánh dấu'}
                                                >
                                                    <Bookmark size={13} fill={email.bookmarked ? 'currentColor' : 'none'} />
                                                </button>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setDetailRecord(email); }}
                                                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                                                    title="Chi tiết"
                                                >
                                                    <Info size={13} />
                                                </button>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleCopy(email.email, 'email'); }}
                                                    className="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all"
                                                    title="Sao chép"
                                                >
                                                    <Copy size={13} />
                                                </button>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setDeleteEmailConfirm(email.id); }}
                                                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                                    title="Xóa"
                                                >
                                                    <Trash2 size={13} />
                                                </button>
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {filteredEmails.length === 0 && (
                                <tr>
                                    <td colSpan={2} className="text-center py-12 text-gray-400">
                                        <Mail size={24} className="opacity-10 mx-auto mb-2" />
                                        <p className="text-[12px]">Không có email nào</p>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Right Pane: Linked Cards */}
            <div className="flex-1 flex flex-col bg-gray-50/30 relative z-[10]">
                <div className="p-4 border-b border-gray-100 bg-white flex items-center justify-between">
                    <div>
                        <h3 className="text-[14px] font-bold text-gray-900 flex items-center gap-2 mb-1">
                            <CreditCard size={16} className="text-purple-500" />
                            Thẻ liên kết
                        </h3>
                        {selectedEmail ? (
                            <div className="flex items-center gap-2 text-[12px] text-gray-500">
                                <span className="font-medium text-blue-600 truncate max-w-[150px]">
                                    {isVisible ? selectedEmail.email : maskEmail(selectedEmail.email)}
                                </span>
                                <span className="shrink-0">• {linkedCards.length} thẻ</span>
                            </div>
                        ) : (
                            <p className="text-[12px] text-gray-400 italic">Chọn một email để xem chi tiết</p>
                        )}
                    </div>
                    {selectedEmail && (
                        <button
                            onClick={() => setIsLinking(!isLinking)}
                            className={`px-3 py-1.5 text-[12px] font-semibold rounded-lg transition-all flex items-center gap-1.5 ${isLinking ? 'bg-gray-100 text-gray-700' : 'bg-blue-50 text-blue-700 hover:bg-blue-100 border border-transparent hover:border-blue-200'
                                }`}
                        >
                            <Plus size={14} />
                            {isLinking ? 'Đóng' : 'Thêm thẻ'}
                        </button>
                    )}
                </div>

                {isLinking && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="p-4 bg-blue-50/50 border-b border-blue-100 space-y-3 shrink-0"
                    >
                        <div className="relative">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Tìm thẻ để liên kết (nhập đuôi thẻ)..."
                                value={linkSearch}
                                onChange={(e) => setLinkSearch(e.target.value)}
                                className="w-full pl-9 pr-4 py-2 bg-white border border-blue-200 rounded-xl text-[12px] focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all shadow-sm"
                            />
                        </div>
                        <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar">
                            {availableCards.map(c => (
                                <button
                                    key={c.id}
                                    onClick={() => handleLinkCard(c.id)}
                                    className="shrink-0 flex items-center justify-between p-2.5 bg-white hover:bg-blue-600 hover:text-white rounded-xl transition-colors shadow-sm border border-transparent hover:border-blue-700 group w-48"
                                >
                                    <div className="text-left">
                                        <div className="font-mono text-[13px] font-bold group-hover:text-white text-gray-800">
                                            {isVisible ? c.cardNumber : maskCardNumber(c.cardNumber)}
                                        </div>
                                        <div className="text-[10px] text-gray-400 group-hover:text-blue-100 uppercase mt-0.5 truncate">
                                            {c.cardholderName || 'N/A'}
                                        </div>
                                    </div>
                                    <Plus size={14} className="text-gray-300 group-hover:text-white transition-colors" />
                                </button>
                            ))}
                            {availableCards.length === 0 && (
                                <div className="py-2 text-gray-400 text-[11px] italic">Không có thẻ nào phù hợp.</div>
                            )}
                        </div>
                    </motion.div>
                )}

                <div className="flex-1 overflow-auto bg-gray-50/30 custom-scrollbar pb-32">
                    <AnimatePresence mode="popLayout">
                        {selectedEmailId ? (
                            linkedCards.length > 0 ? (
                                <table className="w-full text-left border-collapse">
                                    <thead className="sticky top-0 bg-white z-10 border-b border-gray-100 shadow-sm">
                                        <tr>
                                            <th className="px-4 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">Số thẻ</th>
                                            <th className="px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">Hạn thẻ</th>
                                            <th className="px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">CVV</th>
                                            <th className="px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Trạng thái</th>
                                            <th className="px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-center">Nạp (Pay)</th>
                                            <th className="px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-center">Hẹn giờ</th>
                                            <th className="px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Ghi chú</th>
                                            <th className="px-4 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-right">Hành động</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50 bg-white">
                                        {linkedCards.map(card => {
                                            const isHovered = hoveredId === card.id;
                                            const revealed = isVisible || isHovered;

                                            return (
                                                <tr
                                                    key={card.id}
                                                    className={`hover:bg-gray-50/50 transition-colors group relative focus-within:z-[50] ${hoveredId === card.id ? 'z-[20]' : 'z-[10]'}`}
                                                    onMouseEnter={() => setHoveredId(card.id)}
                                                    onMouseLeave={() => setHoveredId(null)}
                                                >
                                                    <CopyCell
                                                        value={card.cardNumber}
                                                        onCopied={() => handleCopied(card.id)}
                                                        tdClassName="px-4 py-3"
                                                        className="flex items-center w-full"
                                                    >
                                                        <div className="text-[13px] font-mono font-bold text-gray-800 tracking-tight">
                                                            {revealed ? formatCardNumberSpaced(card.cardNumber) : maskCardNumber(card.cardNumber)}
                                                        </div>
                                                    </CopyCell>
                                                    <CopyCell
                                                        value={card.expiryDate}
                                                        onCopied={() => handleCopied(card.id)}
                                                        tdClassName="px-3 py-3"
                                                        className="flex items-center w-full"
                                                    >
                                                        <div className="text-[11px] font-mono text-gray-700">
                                                            {card.expiryDate ? formatExpiry(card.expiryDate) : '—'}
                                                        </div>
                                                    </CopyCell>
                                                    <CopyCell
                                                        value={card.cvv}
                                                        onCopied={() => handleCopied(card.id)}
                                                        tdClassName="px-3 py-3"
                                                        className="flex items-center w-full"
                                                    >
                                                        <div className="text-[11px] font-mono text-gray-700">
                                                            {revealed ? card.cvv : maskCVV(card.cvv || '•••')}
                                                        </div>
                                                    </CopyCell>
                                                    <td className="px-3 py-3">
                                                        <div onClick={(e) => e.stopPropagation()}>
                                                            <StatusSelect
                                                                value={card.status || ''}
                                                                collectionType="cards"
                                                                onChange={(val) => updateField(card.id, 'status', val)}
                                                            />
                                                        </div>
                                                    </td>
                                                    <td className="px-3 py-3 align-middle text-center w-28 whitespace-nowrap">
                                                        <PayInput
                                                            value={card.payAmount}
                                                            onChange={async (val) => {
                                                                try {
                                                                    const ts = Date.now();
                                                                    await updateDoc(doc(db, 'cards', card.id), { payAmount: val, updatedAt: serverTimestamp() });
                                                                    await dbLocal.cards.update(card.id, { payAmount: val, updatedAt: ts });
                                                                }
                                                                catch { toast.error('Lỗi cập nhật Pay'); }
                                                            }}
                                                        />
                                                    </td>
                                                    <td className="px-3 py-3 text-center pr-4">
                                                        <AlarmCell
                                                            recordId={`category_card_${card.id}`}
                                                            nearestAlarmTime={nearestAlarmsMap.get(`category_card_${card.id}`)?.triggerAt ?? null}
                                                            isRepeating={nearestAlarmsMap.get(`category_card_${card.id}`)?.isRepeating}
                                                            now={Date.now()}
                                                            onClick={() => openTimer(card.id)}
                                                            onDone={() => handleAlarmDone(card.id)}
                                                            tick={alarmRefreshTick}
                                                        />
                                                    </td>
                                                    <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                                                        <InlineNoteEdit
                                                            value={card.note || ''}
                                                            onSave={(val) => updateField(card.id, 'note', val)}
                                                        />
                                                    </td>
                                                    <td className="px-4 py-3 text-right">
                                                        <div className="flex items-center justify-end gap-1">
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); setDetailCardRecord(card); }}
                                                                className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                                                                title="Chi tiết thẻ"
                                                            >
                                                                <Info size={13} />
                                                            </button>
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); handleCopy(card.cardNumber, 'số thẻ'); }}
                                                                className="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all"
                                                                title="Sao chép"
                                                            >
                                                                <Copy size={13} />
                                                            </button>
                                                            {unlinkCardConfirm === card.id ? (
                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); handleUnlink(card.id); }}
                                                                    data-delete-confirm
                                                                    className="px-2 py-1 text-[11px] font-medium text-white bg-red-500 rounded hover:bg-red-600 transition-colors shadow-sm"
                                                                >
                                                                    Sure?
                                                                </button>
                                                            ) : (
                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); setUnlinkCardConfirm(card.id); }}
                                                                    data-delete-confirm
                                                                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                                                    title="Gỡ liên kết khỏi email này"
                                                                >
                                                                    <Trash2 size={13} />
                                                                </button>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            ) : (
                                <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-3">
                                    <div className="p-4 bg-white rounded-full shadow-sm border border-gray-100">
                                        <LinkIcon size={32} className="opacity-10" />
                                    </div>
                                    <div className="text-center">
                                        <p className="text-[13px] font-medium text-gray-500">Chưa liên kết thẻ</p>
                                        <p className="text-[11px] mt-1">Email này hiện chưa được gán thẻ nào.</p>
                                    </div>
                                </div>
                            )
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full text-gray-300 gap-4 opacity-50">
                                <Search size={48} strokeWidth={1} />
                                <p className="text-[14px] font-medium">Hãy chọn một email bên trái</p>
                            </div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            {/* Dialogs */}
            {detailRecord && (
                <EmailDetailModal
                    record={detailRecord}
                    totpCode={''} // Totp codes handle manually inside modal or you can hook it if needed
                    onClose={() => setDetailRecord(null)}
                    onUpdated={() => { }}
                />
            )}

            {detailCardRecord && (
                <CardDetailModal
                    card={detailCardRecord}
                    onClose={() => setDetailCardRecord(null)}
                    onUpdated={() => { }}
                />
            )}

            {/* Timer Modal (Renders above everything) */}
            {timerCardId && user && (
                <TimerModal
                    recordId={`category_card_${timerCardId}`}
                    collection="cards"
                    label={`Thẻ đuôi ${cards.find(c => c.id === timerCardId)?.cardNumber?.slice(-4) || ''}`}
                    existingAlarms={timerAlarms}
                    onClose={() => setTimerCardId(null)}
                    onAdd={async (alarmData) => {
                        await addAlarm(alarmData);
                        setAlarmRefreshTick((t: number) => t + 1);
                    }}
                    onDelete={async (alarmId: string) => {
                        await deleteAlarm(alarmId);
                        setAlarmRefreshTick((t: number) => t + 1);
                    }}
                />
            )}

            {/* Delete Email Modal */}
            {deleteEmailConfirm && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden animate-scale-in">
                        <div className="p-6">
                            <h3 className="text-[16px] font-bold text-gray-900 mb-2">Gỡ email khỏi danh mục</h3>
                            <p className="text-[13px] text-gray-500">Bạn có chắc muốn gỡ email này khỏi danh mục hiện tại? Email sẽ không bị xóa khỏi hệ thống.</p>
                        </div>
                        <div className="px-6 py-4 bg-gray-50 flex items-center justify-end gap-2 border-t border-gray-100">
                            <button onClick={() => setDeleteEmailConfirm(null)} className="px-4 py-2 text-[13px] font-medium text-gray-600 hover:bg-gray-200 rounded-lg transition-colors">
                                Hủy
                            </button>
                            <button onClick={() => handleDeleteEmail(deleteEmailConfirm)} className="px-4 py-2 text-[13px] font-medium text-white bg-blue-500 hover:bg-blue-600 rounded-lg transition-colors shadow-sm">
                                Xác nhận gỡ
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
