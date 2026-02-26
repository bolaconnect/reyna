import { useState, useMemo, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Search, Check, Mail, Plus, Folder, ChevronDown } from 'lucide-react';
import { collection, doc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useFirestoreSync } from '../hooks/useFirestoreSync';
import { EmailRecord } from './EmailsTable';
import { dbLocal, EmailCategoryRecord } from '../lib/db';
import { useAuth } from '../../contexts/AuthContext';
import { v4 as uuidv4 } from 'uuid';
import { toast } from 'sonner';

interface LinkEmailModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (selectedEmailIds: string[], targetCategoryId: string) => void;
    cardCount: number;
}

export function LinkEmailModal({ isOpen, onClose, onSave, cardCount }: LinkEmailModalProps) {
    const { user } = useAuth();
    const { data: emails } = useFirestoreSync<EmailRecord>('emails');
    const { data: categories, refresh: refreshCategories } = useFirestoreSync<EmailCategoryRecord>('categories');

    const [search, setSearch] = useState('');
    const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);
    const [targetCategoryId, setTargetCategoryId] = useState<string>(''); // '' = not selected, '<id>' = category

    const [isCreatingNewCat, setIsCreatingNewCat] = useState(false);
    const [newCatName, setNewCatName] = useState('');
    const [isSavingCat, setIsSavingCat] = useState(false);

    const newCatInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isCreatingNewCat && newCatInputRef.current) {
            newCatInputRef.current.focus();
        }
    }, [isCreatingNewCat]);

    const handleToggleEmail = (id: string) => {
        setSelectedEmailId(prev => prev === id ? null : id);
    };

    const handleCreateCategory = async (e: React.FormEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (!user || !newCatName.trim() || isSavingCat) return;

        setIsSavingCat(true);
        const id = uuidv4();
        const timestamp = Date.now();
        const record = {
            id,
            userId: user.uid,
            name: newCatName.trim(),
            createdAt: timestamp,
            updatedAt: timestamp
        };

        try {
            await dbLocal.categories.put(record);
            const batch = writeBatch(db);
            batch.set(doc(db, 'categories', id), record);
            await batch.commit();

            await refreshCategories();
            setTargetCategoryId(id);
            setNewCatName('');
            setIsCreatingNewCat(false);
            toast.success('Đã tạo danh mục: ' + record.name);
        } catch (err) {
            console.error('Add category error', err);
            toast.error('Lỗi khi tạo danh mục mới');
        } finally {
            setIsSavingCat(false);
        }
    };

    const handleSave = () => {
        if (!selectedEmailId || !targetCategoryId) return;
        onSave([selectedEmailId], targetCategoryId);
        // Reset state
        setSelectedEmailId(null);
        setTargetCategoryId('');
        setSearch('');
    };

    const filteredEmails = useMemo(() => {
        const lowerSearch = search.toLowerCase();
        return emails.filter(e =>
            !lowerSearch ||
            e.email.toLowerCase().includes(lowerSearch) ||
            e.note?.toLowerCase().includes(lowerSearch)
        );
    }, [emails, search]);

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]"
                >
                    {/* Header */}
                    <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-gray-50/50">
                        <div>
                            <h3 className="text-[17px] font-bold text-gray-900 flex items-center gap-2">
                                <Mail size={20} className="text-blue-600" />
                                Liên kết Email & Phân loại
                            </h3>
                            <p className="text-[12px] text-gray-500 mt-0.5">Đang liên kết vào {cardCount} thẻ đã chọn</p>
                        </div>
                        <button onClick={onClose} className="p-2 text-gray-400 hover:bg-gray-200 rounded-full transition-colors">
                            <X size={20} />
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-5">
                        {/* Section 1: Category */}
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <label className="text-[13px] font-bold text-gray-700 flex items-center gap-2">
                                    <div className="w-5 h-5 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-[11px]">1</div>
                                    Chọn danh mục cho Email
                                </label>
                                {!isCreatingNewCat && (
                                    <button
                                        onClick={() => setIsCreatingNewCat(true)}
                                        className="text-[12px] text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1 px-2 py-1 rounded-md hover:bg-blue-50 transition-colors"
                                    >
                                        <Plus size={14} /> Tạo danh mục mới
                                    </button>
                                )}
                            </div>

                            {!isCreatingNewCat ? (
                                <div className="relative group">
                                    <select
                                        value={targetCategoryId}
                                        onChange={(e) => setTargetCategoryId(e.target.value)}
                                        className="w-full appearance-none pl-3 pr-10 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-[14px] focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-all cursor-pointer"
                                    >
                                        <option value="">-- Bắt buộc chọn danh mục --</option>
                                        {categories.map(cat => (
                                            <option key={cat.id} value={cat.id}>{cat.name}</option>
                                        ))}
                                    </select>
                                    <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none group-hover:text-gray-600 transition-colors" />
                                </div>
                            ) : (
                                <motion.form
                                    initial={{ opacity: 0, y: -10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    onSubmit={handleCreateCategory}
                                    className="flex gap-2 p-3 bg-blue-50/50 rounded-xl border border-blue-100"
                                >
                                    <input
                                        ref={newCatInputRef}
                                        type="text"
                                        value={newCatName}
                                        onChange={e => setNewCatName(e.target.value)}
                                        placeholder="Tên danh mục mới..."
                                        className="flex-1 px-3 py-2 bg-white border border-blue-200 rounded-lg text-[13px] focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
                                    />
                                    <button
                                        type="submit"
                                        disabled={!newCatName.trim() || isSavingCat}
                                        className="px-4 py-2 bg-blue-600 text-white rounded-lg text-[13px] font-bold hover:bg-blue-700 disabled:opacity-50 shadow-sm transition-all"
                                    >
                                        {isSavingCat ? '...' : 'Lưu'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setIsCreatingNewCat(false)}
                                        className="px-3 py-2 text-gray-500 hover:bg-gray-200 rounded-lg transition-colors text-[13px]"
                                    >
                                        Hủy
                                    </button>
                                </motion.form>
                            )}
                        </div>

                        <div className="h-px bg-gray-100" />

                        {/* Section 2: Email Selection */}
                        <div className="space-y-3 flex flex-col flex-1 min-h-0">
                            <label className="text-[13px] font-bold text-gray-700 flex items-center gap-2">
                                <div className="w-5 h-5 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-[11px]">2</div>
                                Chọn Email để liên kết
                            </label>

                            <div className="relative">
                                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="Tìm tài khoản email, ghi chú..."
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-all"
                                />
                            </div>

                            <div className="flex-1 overflow-y-auto border border-gray-100 rounded-xl bg-gray-50/30">
                                {filteredEmails.length > 0 ? (
                                    <div className="divide-y divide-gray-50 p-1">
                                        {filteredEmails.map(e => {
                                            const checked = selectedEmailId === e.id;
                                            const catName = categories.find(c => c.id === e.categoryId)?.name || 'Chưa phân loại';
                                            return (
                                                <div
                                                    key={e.id}
                                                    onClick={() => handleToggleEmail(e.id)}
                                                    className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-white hover:shadow-sm cursor-pointer transition-all border border-transparent hover:border-gray-100"
                                                >
                                                    <div className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors ${checked ? 'bg-blue-600 border-blue-600 shadow-sm' : 'border-gray-300 bg-white'}`}>
                                                        {checked && <Check size={14} className="text-white" />}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <div className="text-[13px] font-semibold text-gray-900 truncate">{e.email}</div>
                                                            <div className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded flex items-center gap-1">
                                                                <Folder size={10} /> {catName}
                                                            </div>
                                                        </div>
                                                        {e.note && <div className="text-[11px] text-gray-400 truncate mt-0.5">{e.note}</div>}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="py-12 flex flex-col items-center justify-center text-gray-400 gap-3">
                                        <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
                                            <Mail size={24} className="opacity-20" />
                                        </div>
                                        <p className="text-[13px]">Không tìm thấy email nào phù hợp</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="p-4 border-t border-gray-100 flex items-center justify-between bg-gray-50/50">
                        <div className="text-[12px] text-gray-500">
                            {selectedEmailId ? 'Đã chọn 1 email' : 'Chưa chọn email'}
                        </div>
                        <div className="flex gap-3">
                            <button
                                onClick={onClose}
                                className="px-5 py-2 text-[13px] font-semibold text-gray-600 hover:bg-gray-200 bg-white border border-gray-200 rounded-xl transition-all shadow-sm"
                            >
                                Đóng
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={!selectedEmailId || !targetCategoryId}
                                className={`px-6 py-2 text-[13px] font-bold text-white rounded-xl transition-all flex items-center gap-2 shadow-md ${(!selectedEmailId || !targetCategoryId)
                                    ? 'bg-blue-300 cursor-not-allowed shadow-none'
                                    : 'bg-blue-600 hover:bg-blue-700 active:scale-95'
                                    }`}
                            >
                                <Check size={18} /> Lưu liên kết
                            </button>
                        </div>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
