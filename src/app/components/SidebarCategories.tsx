import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Folder, MoreHorizontal, Edit2, Trash2, Plus } from 'lucide-react';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { dbLocal, EmailCategoryRecord } from '../lib/db';
import { useAuth } from '../../contexts/AuthContext';
import { useFirestoreSync } from '../hooks/useFirestoreSync';
import { v4 as uuidv4 } from 'uuid';

interface SidebarCategoriesProps {
    collapsed: boolean;
    activeTab: string;
    onTabChange: (tab: 'cards' | 'emails' | 'categories') => void;
    activeCategory: string | null;
    onSelectCategory: (id: string | null) => void;
}

export function SidebarCategories({ collapsed, activeTab, onTabChange, activeCategory, onSelectCategory }: SidebarCategoriesProps) {
    const { user } = useAuth();
    const { data: allCategories } = useFirestoreSync<EmailCategoryRecord>('categories');

    const categories = [...allCategories].sort((a, b) => {
        const orderA = a.order ?? Number.MAX_SAFE_INTEGER;
        const orderB = b.order ?? Number.MAX_SAFE_INTEGER;
        if (orderA !== orderB) return orderA - orderB;
        return (a.createdAt || 0) - (b.createdAt || 0);
    });

    // UI States
    const [isCreating, setIsCreating] = useState(false);
    const [newName, setNewName] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

    const createRef = useRef<HTMLInputElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    // Focus management for creation
    useEffect(() => {
        if (isCreating && createRef.current) createRef.current.focus();
    }, [isCreating]);

    // Handle outside click for menu
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpenId(null);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !newName.trim()) return;
        try {
            const id = uuidv4();
            const timestamp = Date.now();
            const order = categories.length;
            const record = { id, userId: user.uid, name: newName.trim(), order, createdAt: timestamp, updatedAt: timestamp };
            await dbLocal.categories.put(record);
            await updateDoc(doc(db, 'categories', id), record as any);
            setIsCreating(false);
            setNewName('');
            onSelectCategory(id);
            onTabChange('categories');
        } catch (err) { console.error('Create category error', err); }
    };

    const handleEdit = async (id: string, name: string) => {
        try {
            await dbLocal.categories.update(id, { name: name.trim(), updatedAt: Date.now() });
            await updateDoc(doc(db, 'categories', id), { name: name.trim(), updatedAt: serverTimestamp() });
            setEditingId(null);
        } catch (err) { console.error('Edit category error', err); }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Bạn có chắc xoá danh mục này? Các email bên trong sẽ không bị xoá, chỉ mất liên kết danh mục.')) return;
        try {
            await dbLocal.categories.update(id, { deleted: true, updatedAt: Date.now() } as any);
            await updateDoc(doc(db, 'categories', id), { deleted: true, updatedAt: serverTimestamp() });
            if (activeCategory === id) onSelectCategory(null);
        } catch (err) { console.error('Delete category error', err); }
    };

    return (
        <div className="flex flex-col space-y-1">
            {/* Divider + Add Button */}
            <div className="flex items-center group/divider px-4 py-2">
                <div className="flex-1 border-t border-gray-100" />
                <button
                    onClick={() => setIsCreating(true)}
                    className="ml-2 w-5 h-5 flex items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600 opacity-0 group-hover/divider:opacity-100 transition-all"
                    title="Thêm danh mục"
                >
                    <Plus size={12} />
                </button>
            </div>

            {/* Inline creation input */}
            {isCreating && !collapsed && (
                <div className="px-3 py-1 mb-1">
                    <form onSubmit={handleCreate}>
                        <input
                            ref={createRef}
                            type="text"
                            value={newName}
                            onChange={e => setNewName(e.target.value)}
                            onBlur={() => { if (!newName.trim()) setIsCreating(false); }}
                            placeholder="Tên danh mục..."
                            className="w-full text-[13px] px-3 py-2 border border-blue-300 rounded-xl focus:outline-none bg-white shadow-sm"
                        />
                    </form>
                </div>
            )}

            {/* Scrollable Category List */}
            <div className="overflow-y-auto overflow-x-hidden max-h-[170px] space-y-1 px-1 custom-scrollbar">
                {categories.map(cat => (
                    <CategoryItem
                        key={cat.id}
                        category={cat}
                        collapsed={collapsed}
                        isActive={activeCategory === cat.id && activeTab === 'categories'}
                        isEditing={editingId === cat.id}
                        isMenuOpen={menuOpenId === cat.id}
                        onSelect={() => { onSelectCategory(cat.id); onTabChange('categories'); }}
                        onEditStart={() => { setEditingId(cat.id); setEditName(cat.name); setMenuOpenId(null); }}
                        onEditCancel={() => setEditingId(null)}
                        onEditSave={(name) => handleEdit(cat.id, name)}
                        onDelete={() => handleDelete(cat.id)}
                        onMenuToggle={() => setMenuOpenId(menuOpenId === cat.id ? null : cat.id)}
                        menuRef={menuOpenId === cat.id ? menuRef : null}
                    />
                ))}
                <div className="h-2" />
            </div>
        </div>
    );
}

// Sub-component for individual items to keep logic clean and layout stable
interface ItemProps {
    category: EmailCategoryRecord;
    collapsed: boolean;
    isActive: boolean;
    isEditing: boolean;
    isMenuOpen: boolean;
    onSelect: () => void;
    onEditStart: () => void;
    onEditCancel: () => void;
    onEditSave: (name: string) => void;
    onDelete: () => void;
    onMenuToggle: () => void;
    menuRef: React.RefObject<HTMLDivElement | null> | null;
}

function CategoryItem({ category, collapsed, isActive, isEditing, isMenuOpen, onSelect, onEditStart, onEditCancel, onEditSave, onDelete, onMenuToggle, menuRef }: ItemProps) {
    const [editValue, setEditValue] = useState(category.name);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isEditing && inputRef.current) inputRef.current.focus();
    }, [isEditing]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onEditSave(editValue);
    };

    if (isEditing && !collapsed) {
        return (
            <div className="px-2 py-1">
                <form onSubmit={handleSubmit} className="w-full">
                    <input
                        ref={inputRef}
                        type="text"
                        value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        onBlur={() => onEditCancel()}
                        className="w-full text-[13px] px-2 py-1.5 border border-blue-300 rounded-lg focus:outline-none bg-white font-medium"
                    />
                </form>
            </div>
        );
    }

    return (
        <div className="relative group px-0">
            <div className="flex items-center w-full relative">
                <button
                    onClick={onSelect}
                    className={`w-full flex items-center rounded-xl text-[13px] font-medium transition-all gap-3.5 px-3 py-2.5 ${isActive ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm font-semibold' : 'text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800/50 hover:text-gray-700 dark:hover:text-gray-300'}`}
                    title={collapsed ? category.name : ""}
                >
                    <div className="w-5 h-5 flex items-center justify-center shrink-0">
                        <Folder size={15} />
                    </div>
                    <AnimatePresence>
                        {!collapsed && (
                            <motion.span
                                initial={{ opacity: 0, x: -5 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -5 }}
                                transition={{ duration: 0.15 }}
                                className="whitespace-nowrap overflow-hidden text-left flex-1"
                            >
                                {category.name}
                            </motion.span>
                        )}
                    </AnimatePresence>
                </button>

                {!collapsed && (
                    <button
                        onClick={(e) => { e.stopPropagation(); onMenuToggle(); }}
                        className={`absolute right-2 p-1 rounded-md opacity-0 group-hover:opacity-100 transition-all ${isActive ? 'text-white/70 hover:bg-white/10' : 'text-gray-400 hover:bg-gray-200'}`}
                    >
                        <MoreHorizontal size={14} />
                    </button>
                )}

                {isMenuOpen && menuRef && (
                    <div ref={menuRef} className="absolute right-0 top-10 w-32 bg-white rounded-xl shadow-2xl border border-gray-100 py-1.5 z-[100] overflow-hidden">
                        <button
                            onClick={(e) => { e.stopPropagation(); onEditStart(); }}
                            className="w-full text-left px-3 py-2 text-[12px] text-gray-700 hover:bg-gray-50 flex items-center gap-2.5 transition-colors"
                        >
                            <Edit2 size={12} className="text-gray-400" /> Sửa tên
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); onDelete(); }}
                            className="w-full text-left px-3 py-2 text-[12px] text-red-600 hover:bg-red-50 flex items-center gap-2.5 transition-colors"
                        >
                            <Trash2 size={12} className="text-red-400" /> Xoá
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
