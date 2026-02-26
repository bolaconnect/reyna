import React, { useState, useRef, useEffect, MouseEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown, ChevronRight, Folder, FolderPlus, MoreVertical, Edit2, Trash2, Check, X, Tag } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { dbLocal } from '../lib/db';
import { useFirestoreSync } from '../hooks/useFirestoreSync';
import { doc, setDoc, deleteDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { toast } from 'sonner';

interface CategoryMenuProps {
    collapsed: boolean;
    selectedCategoryId: string | null;
    onSelectCategory: (id: string | null) => void;
    currentTab: 'cards' | 'emails';
}

export function CategoryMenu({ collapsed, selectedCategoryId, onSelectCategory, currentTab }: CategoryMenuProps) {
    const { user } = useAuth();
    const [expanded, setExpanded] = useState(true);
    const [isAdding, setIsAdding] = useState(false);
    const [newCategoryName, setNewCategoryName] = useState('');
    const addInputRef = useRef<HTMLInputElement>(null);
    const { data: categories } = useFirestoreSync<{ id: string; name: string; userId: string; updatedAt: number }>('categories');

    // Context Menu State
    const [contextMenuId, setContextMenuId] = useState<string | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const menuRef = useRef<HTMLDivElement>(null);

    // Filter categories to only show when in Emails tab, or maybe both if user wants.
    // The prompt says "Danh mục Email" so it's best associated with Emails, but we keep it visible always and just bold it.

    useEffect(() => {
        if (isAdding && addInputRef.current) {
            addInputRef.current.focus();
        }
    }, [isAdding]);

    useEffect(() => {
        const handleClickOutside = (event: globalThis.MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setContextMenuId(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);


    const handleAddCategory = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !newCategoryName.trim()) return;

        const catName = newCategoryName.trim();
        const newId = crypto.randomUUID();
        const now = Date.now();

        try {
            await setDoc(doc(db, 'categories', newId), {
                userId: user.uid,
                name: catName,
                updatedAt: serverTimestamp()
            });
            await dbLocal.categories.put({
                id: newId,
                userId: user.uid,
                name: catName,
                updatedAt: now
            });
            setNewCategoryName('');
            setIsAdding(false);
            setExpanded(true);
            toast.success(`Đã thêm danh mục "${catName}"`);
        } catch (err: any) {
            console.error('Failed to add category:', err);
            toast.error('Lỗi khi thêm danh mục');
        }
    };

    const handleUpdateCategory = async (id: string) => {
        if (!user || !editName.trim()) return;
        const catName = editName.trim();
        try {
            await updateDoc(doc(db, 'categories', id), {
                name: catName,
                updatedAt: serverTimestamp()
            });
            await dbLocal.categories.update(id, { name: catName, updatedAt: Date.now() });
            setEditingId(null);
            toast.success('Đã cập nhật tên danh mục');
        } catch (err: any) {
            console.error('Failed to update category:', err);
            toast.error('Lỗi cập nhật');
        }
    };

    const handleDeleteCategory = async (id: string, name: string) => {
        if (!user) return;
        if (!confirm(`Bạn có chắc muốn xóa danh mục "${name}"? Các thẻ và Email sẽ không bị xóa, chỉ mất liên kết nhóm.`)) return;

        try {
            await updateDoc(doc(db, 'categories', id), {
                deleted: true,
                updatedAt: serverTimestamp()
            });
            await dbLocal.categories.delete(id);

            // Xóa tham chiếu ở các bảng liên quan nếu không dùng cascade delete
            // (Tuỳ logic nhưng để an toàn thì gỡ categoryId khỏi Emails)
            const emailsInCat = await dbLocal.emails.where('userId').equals(user.uid).filter(e => e.categoryId === id).toArray();
            for (const em of emailsInCat) {
                await updateDoc(doc(db, 'emails', em.id), { categoryId: null, updatedAt: serverTimestamp() });
                await dbLocal.emails.update(em.id, { categoryId: undefined, updatedAt: Date.now() });
            }

            if (selectedCategoryId === id) onSelectCategory(null);
            setContextMenuId(null);
            toast.success(`Đã xóa "${name}"`);
        } catch (err: any) {
            console.error('Failed to delete category:', err);
            toast.error('Lỗi khi xóa');
        }
    };

    const toggleContextMenu = (e: MouseEvent, id: string) => {
        e.stopPropagation();
        setContextMenuId(prev => prev === id ? null : id);
    };

    // Sorted alphabetically
    const sortedCategories = [...categories].sort((a, b) => a.name.localeCompare(b.name));

    return (
        <div className="flex flex-col mt-2 px-2 shrink-0">
            {/* Header */}
            <div className={`flex items-center justify-between group ${collapsed ? 'justify-center' : 'px-3'} py-1.5`}>
                <button
                    onClick={() => { if (!collapsed) setExpanded(!expanded); }}
                    className={`flex items-center gap-2 text-[11px] uppercase font-bold text-gray-400 hover:text-gray-600 transition-colors ${collapsed ? 'cursor-default' : 'cursor-pointer'} flex-1 text-left`}
                >
                    {!collapsed && (expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />)}
                    {collapsed ? <Tag size={16} /> : <span>Danh mục Email</span>}
                </button>

                {!collapsed && (
                    <button
                        onClick={() => setIsAdding(true)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md"
                        title="Thêm danh mục"
                    >
                        <FolderPlus size={14} />
                    </button>
                )}
            </div>

            {/* List */}
            <AnimatePresence>
                {(!collapsed && expanded) && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden flex flex-col gap-0.5 mt-1"
                    >
                        {/* Tất cả (khong lọc) */}
                        <button
                            onClick={() => onSelectCategory(null)}
                            className={`flex items-center gap-3 px-3 py-2 rounded-xl text-[12px] font-medium transition-all ${selectedCategoryId === null ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'}`}
                        >
                            <Folder size={14} className={selectedCategoryId === null ? 'fill-indigo-100 text-indigo-600' : ''} />
                            <span className="flex-1 text-left truncate">Tất cả Email</span>
                        </button>

                        {sortedCategories.map(cat => (
                            <div key={cat.id} className="relative group/item flex items-center">
                                {editingId === cat.id ? (
                                    <div className="flex items-center w-full gap-1 px-3 py-1.5 bg-gray-50 rounded-xl">
                                        <input
                                            autoFocus
                                            value={editName}
                                            onChange={e => setEditName(e.target.value)}
                                            onKeyDown={e => {
                                                if (e.key === 'Enter') handleUpdateCategory(cat.id);
                                                if (e.key === 'Escape') setEditingId(null);
                                            }}
                                            className="flex-1 text-[12px] bg-transparent outline-none text-gray-800"
                                        />
                                        <button onClick={() => handleUpdateCategory(cat.id)} className="p-1 text-green-600 hover:bg-green-100 rounded-md"><Check size={12} /></button>
                                        <button onClick={() => setEditingId(null)} className="p-1 text-gray-400 hover:bg-gray-200 rounded-md"><X size={12} /></button>
                                    </div>
                                ) : (
                                    <>
                                        <button
                                            onClick={() => onSelectCategory(cat.id)}
                                            className={`flex-1 flex items-center gap-3 px-3 py-2 rounded-xl text-[12px] transition-all truncate pr-8 ${selectedCategoryId === cat.id ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800 font-medium'}`}
                                        >
                                            <Folder size={14} className={selectedCategoryId === cat.id ? 'fill-indigo-100 text-indigo-600' : ''} />
                                            <span className="truncate">{cat.name}</span>
                                        </button>

                                        <button
                                            onClick={(e) => toggleContextMenu(e, cat.id)}
                                            className={`absolute right-1 p-1.5 rounded-md transition-opacity ${contextMenuId === cat.id ? 'opacity-100 bg-gray-200 text-gray-700' : 'opacity-0 group-hover/item:opacity-100 text-gray-400 hover:text-gray-700 hover:bg-gray-100'}`}
                                        >
                                            <MoreVertical size={13} />
                                        </button>
                                    </>
                                )}

                                {/* Context Menu */}
                                {contextMenuId === cat.id && (
                                    <div ref={menuRef} className="absolute right-0 top-full mt-1 w-32 bg-white rounded-lg shadow-lg border border-gray-100 z-50 py-1 overflow-hidden">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setEditName(cat.name); setEditingId(cat.id); setContextMenuId(null); }}
                                            className="w-full flex items-center gap-2 px-3 py-2.5 text-[12px] text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                                        >
                                            <Edit2 size={12} /> Đổi tên
                                        </button>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleDeleteCategory(cat.id, cat.name); }}
                                            className="w-full flex items-center gap-2 px-3 py-2.5 text-[12px] text-red-600 hover:bg-red-50"
                                        >
                                            <Trash2 size={12} /> Xóa thư mục
                                        </button>
                                    </div>
                                )}
                            </div>
                        ))}

                        {/* Add Input */}
                        <AnimatePresence>
                            {isAdding && (
                                <motion.form
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    onSubmit={handleAddCategory}
                                    className="flex items-center gap-2 px-3 py-1.5 mt-1 bg-indigo-50/50 border border-indigo-100 rounded-xl"
                                >
                                    <FolderPlus size={14} className="text-indigo-400" />
                                    <input
                                        ref={addInputRef}
                                        value={newCategoryName}
                                        onChange={e => setNewCategoryName(e.target.value)}
                                        onBlur={() => { if (!newCategoryName.trim()) setIsAdding(false); }}
                                        placeholder="Tên danh mục..."
                                        className="flex-1 text-[12px] bg-transparent outline-none text-indigo-900 placeholder:text-indigo-300 min-w-0"
                                    />
                                </motion.form>
                            )}
                        </AnimatePresence>

                        {!isAdding && categories.length === 0 && (
                            <div className="px-3 py-2 text-[11px] text-gray-400 italic text-center">
                                Chưa có thư mục nào
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
