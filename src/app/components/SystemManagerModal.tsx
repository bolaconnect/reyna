import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Trash2, Check, Plus, Loader2, ChevronUp, ChevronDown } from 'lucide-react';
import { db } from '../../firebase/config';
import { dbLocal, StatusRecord, EmailCategoryRecord } from '../lib/db';
import { collection, doc, deleteDoc, updateDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { useAuth } from '../../contexts/AuthContext';
import { useFirestoreSync } from '../hooks/useFirestoreSync';
import { toast } from 'sonner';

interface SystemManagerModalProps {
    mode: 'category' | 'status';
    collectionType?: 'cards' | 'emails';
    onClose: () => void;
}

const DOT_COLORS = [
    { dot: 'bg-emerald-400', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
    { dot: 'bg-blue-400', bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
    { dot: 'bg-indigo-400', bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200' },
    { dot: 'bg-purple-400', bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
    { dot: 'bg-pink-400', bg: 'bg-pink-50', text: 'text-pink-700', border: 'border-pink-200' },
    { dot: 'bg-red-400', bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
    { dot: 'bg-orange-400', bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
    { dot: 'bg-amber-400', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
    { dot: 'bg-yellow-400', bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-200' },
    { dot: 'bg-lime-400', bg: 'bg-lime-50', text: 'text-lime-700', border: 'border-lime-200' },
    { dot: 'bg-gray-400', bg: 'bg-gray-50', text: 'text-gray-600', border: 'border-gray-200' },
];

export function SystemManagerModal({ mode, collectionType, onClose }: SystemManagerModalProps) {
    const { user } = useAuth();
    const isCategory = mode === 'category';

    const { data: categories } = useFirestoreSync<EmailCategoryRecord>('categories');
    const { data: statuses } = useFirestoreSync<StatusRecord>('statuses');

    const items = isCategory ? categories : statuses.filter(s => !collectionType || s.collection === collectionType);

    const sortedItems = [...items].sort((a, b) => {
        const orderA = a.order ?? Number.MAX_SAFE_INTEGER;
        const orderB = b.order ?? Number.MAX_SAFE_INTEGER;
        if (orderA !== orderB) return orderA - orderB;
        return (a.createdAt || 0) - (b.createdAt || 0);
    });

    // Internal state for editing
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const [editColorTheme, setEditColorTheme] = useState(DOT_COLORS[0]);

    const [loadingId, setLoadingId] = useState<string | null>(null);

    // Internal state for creating new at the top
    const [addingNew, setAddingNew] = useState(false);
    const [newName, setNewName] = useState('');
    const [newColorTheme, setNewColorTheme] = useState(DOT_COLORS[0]);

    const handleQuickAdd = async () => {
        const trimmedName = newName.trim();
        if (!user || !trimmedName || addingNew) return;

        // Thêm Validate: Check trùng tên
        const isDuplicate = items.some((item: any) => item.name.toLowerCase() === trimmedName.toLowerCase());
        if (isDuplicate) {
            toast.error(`Tên "${trimmedName}" đã tồn tại!`);
            return;
        }

        setAddingNew(true);
        const collectionName = isCategory ? 'categories' : 'statuses';
        try {
            const newRef = doc(collection(db, collectionName));
            const baseData = {
                userId: user.uid,
                name: trimmedName,
                order: sortedItems.length,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            };

            if (isCategory) {
                await setDoc(newRef, baseData);
            } else {
                await setDoc(newRef, {
                    ...baseData,
                    collection: collectionType,
                    colorDot: newColorTheme.dot,
                    colorBg: newColorTheme.bg,
                    colorText: newColorTheme.text,
                    colorBorder: newColorTheme.border
                });
            }
            toast.success('Đã thêm thành công!');
            setNewName('');
        } catch (error) {
            console.error(error);
            toast.error('Lỗi khi thêm.');
        } finally {
            setAddingNew(false);
        }
    };

    const handleSave = async (id: string) => {
        const trimmedName = editName.trim();
        if (!user || !trimmedName) return;

        // Thêm Validate: Check trùng tên
        const isDuplicate = items.some((item: any) => item.id !== id && item.name.toLowerCase() === trimmedName.toLowerCase());
        if (isDuplicate) {
            toast.error(`Tên "${trimmedName}" đã tồn tại!`);
            return;
        }

        setLoadingId(id);
        const collectionName = isCategory ? 'categories' : 'statuses';
        const docRef = doc(db, collectionName, id);

        try {
            if (isCategory) {
                await updateDoc(docRef, { name: trimmedName, updatedAt: serverTimestamp() });
            } else {
                await updateDoc(docRef, {
                    name: trimmedName,
                    colorDot: editColorTheme.dot,
                    colorBg: editColorTheme.bg,
                    colorText: editColorTheme.text,
                    colorBorder: editColorTheme.border,
                    updatedAt: serverTimestamp()
                });
            }
            toast.success('Đã lưu thành công!');
            setEditingId(null);
        } catch (error) {
            console.error(error);
            toast.error('Lỗi khi lưu.');
        } finally {
            setLoadingId(null);
        }
    };

    const handleDelete = async (id: string, name: string) => {
        if (!user) return;
        if (!window.confirm(`Bạn có chắc chắn muốn xoá "${name}"?\n(Các đối tượng đang sử dụng sẽ không có gì hiển thị)`)) return;

        setLoadingId(id);
        const collectionName = isCategory ? 'categories' : 'statuses';
        try {
            await deleteDoc(doc(db, collectionName, id));
            // Let SyncService handle the local DB removal via onSnapshot deleted state
            // Or manually delete from dexie to be instant:
            await (dbLocal as any)[collectionName].delete(id);
            toast.success('Đã xoá!');
        } catch (error) {
            console.error(error);
            toast.error('Lỗi khi xoá.');
        } finally {
            setLoadingId(null);
        }
    };

    const startEdit = (item: any) => {
        setEditingId(item.id);
        setEditName(item.name);
        if (!isCategory) {
            const foundTheme = DOT_COLORS.find(c => c.dot === item.colorDot) || DOT_COLORS[0];
            setEditColorTheme(foundTheme);
        }
    };

    const handleMove = async (index: number, direction: 'up' | 'down') => {
        if (direction === 'up' && index === 0) return;
        if (direction === 'down' && index === sortedItems.length - 1) return;

        const newItems = [...sortedItems];
        if (direction === 'up') {
            [newItems[index - 1], newItems[index]] = [newItems[index], newItems[index - 1]];
        } else {
            [newItems[index], newItems[index + 1]] = [newItems[index + 1], newItems[index]];
        }

        const collectionName = isCategory ? 'categories' : 'statuses';
        setLoadingId('reordering');

        try {
            const promises = newItems.map((item, i) => {
                if (item.order !== i) {
                    return updateDoc(doc(db, collectionName, item.id), { order: i, updatedAt: serverTimestamp() });
                }
                return Promise.resolve();
            });
            await Promise.all(promises);
        } catch (error) {
            console.error(error);
            toast.error('Lỗi khi sắp xếp.');
        } finally {
            setLoadingId(null);
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm" onClick={onClose}>
            <div
                className="bg-white rounded-xl shadow-2xl w-full max-w-sm flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                    <h2 className="text-[14px] font-semibold text-gray-800">
                        {isCategory ? 'Quản lý Danh mục' : 'Quản lý Trạng thái'}
                    </h2>
                    <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors">
                        <X size={16} />
                    </button>
                </div>

                {/* Body */}
                <div className="p-4 flex flex-col gap-3 max-h-[60vh]">

                    {/* Add New Section */}
                    <div className="bg-gray-50 border border-gray-100 rounded-lg p-3">
                        <div className="flex items-center gap-2">
                            <input
                                value={newName}
                                onChange={e => setNewName(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleQuickAdd()}
                                placeholder={`Thêm ${isCategory ? 'danh mục' : 'trạng thái'} mới...`}
                                className="flex-1 text-[13px] px-3 py-1.5 border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
                            />
                            <button
                                onClick={handleQuickAdd}
                                disabled={!newName.trim() || addingNew}
                                className="px-3 py-1.5 bg-blue-600 text-white text-[13px] font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors shrink-0 flex items-center gap-1"
                            >
                                {addingNew ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                                Thêm
                            </button>
                        </div>

                        {!isCategory && newName.trim() && (
                            <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-gray-200/50">
                                {DOT_COLORS.map((c, i) => (
                                    <button
                                        key={i}
                                        type="button"
                                        onClick={() => setNewColorTheme(c)}
                                        className={`w-5 h-5 rounded-full flex items-center justify-center ${c.bg} border transition-all hover:scale-110 ${newColorTheme.dot === c.dot ? 'ring-2 ring-offset-1 ring-blue-500 border-transparent scale-110 shadow-sm' : c.border}`}
                                    >
                                        <span className={`w-2 h-2 rounded-full ${c.dot}`} />
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="flex-1 overflow-y-auto custom-scrollbar -mx-4 px-4 pb-2 relative">
                        {loadingId === 'reordering' && (
                            <div className="absolute inset-0 bg-white/50 backdrop-blur-[1px] z-10 flex items-center justify-center">
                                <Loader2 className="animate-spin text-blue-500" />
                            </div>
                        )}
                        {sortedItems.length === 0 ? (
                            <p className="text-[13px] text-gray-500 text-center py-4">Chưa có {isCategory ? 'danh mục' : 'trạng thái'} nào.</p>
                        ) : (
                            <div className="space-y-2">
                                {sortedItems.map((item: any, index: number) => {
                                    const isEditing = editingId === item.id;
                                    const isLoading = loadingId === item.id;

                                    return (
                                        <div key={item.id} className="flex items-center gap-2 border border-gray-100 rounded-lg p-2 bg-gray-50/50 hover:bg-gray-50 transition-colors">
                                            {isEditing ? (
                                                <div className="flex-1 flex flex-col gap-2">
                                                    <input
                                                        autoFocus
                                                        value={editName}
                                                        onChange={e => setEditName(e.target.value)}
                                                        onKeyDown={e => {
                                                            if (e.key === 'Enter') handleSave(item.id);
                                                            if (e.key === 'Escape') setEditingId(null);
                                                        }}
                                                        className="w-full text-[13px] px-2 py-1 border border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
                                                    />
                                                    {!isCategory && (
                                                        <div className="flex flex-wrap gap-1 mt-1">
                                                            {DOT_COLORS.map((c, i) => (
                                                                <button
                                                                    key={i}
                                                                    onClick={() => setEditColorTheme(c)}
                                                                    className={`w-5 h-5 rounded-full flex items-center justify-center ${c.bg} border transition-all ${editColorTheme.dot === c.dot ? 'ring-2 ring-offset-1 ring-blue-500 border-transparent' : c.border}`}
                                                                >
                                                                    <span className={`w-2 h-2 rounded-full ${c.dot}`} />
                                                                </button>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <div className="flex-1 flex items-center gap-2 px-1 overflow-hidden" onDoubleClick={() => startEdit(item)}>
                                                    {!isCategory && (
                                                        <span className={`w-2 h-2 rounded-full shrink-0 ${item.colorDot || 'bg-gray-400'}`} />
                                                    )}
                                                    <span className="text-[13px] text-gray-700 truncate">{item.name}</span>
                                                </div>
                                            )}

                                            {/* Actions */}
                                            <div className="flex items-center gap-1 shrink-0">
                                                {isLoading ? (
                                                    <Loader2 size={14} className="animate-spin text-gray-400 mx-2" />
                                                ) : isEditing ? (
                                                    <>
                                                        <button onClick={() => handleSave(item.id)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-md transition-colors">
                                                            <Check size={14} />
                                                        </button>
                                                        <button onClick={() => setEditingId(null)} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-md transition-colors">
                                                            <X size={14} />
                                                        </button>
                                                    </>
                                                ) : (
                                                    <>
                                                        <button onClick={() => startEdit(item)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors">
                                                            <span className="text-[10px] font-medium leading-none px-1">Sửa</span>
                                                        </button>
                                                        <button onClick={() => handleDelete(item.id, item.name)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors">
                                                            <Trash2 size={13} />
                                                        </button>
                                                        {/* Reorder Buttons */}
                                                        <div className="flex flex-col border-l border-gray-200 pl-1 ml-1 shrink-0">
                                                            <button
                                                                onClick={() => handleMove(index, 'up')}
                                                                disabled={index === 0}
                                                                className="text-gray-400 hover:text-gray-700 disabled:opacity-30 disabled:hover:text-gray-400 transition-colors"
                                                            >
                                                                <ChevronUp size={12} strokeWidth={3} />
                                                            </button>
                                                            <button
                                                                onClick={() => handleMove(index, 'down')}
                                                                disabled={index === sortedItems.length - 1}
                                                                className="text-gray-400 hover:text-gray-700 disabled:opacity-30 disabled:hover:text-gray-400 transition-colors"
                                                            >
                                                                <ChevronDown size={12} strokeWidth={3} />
                                                            </button>
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}
