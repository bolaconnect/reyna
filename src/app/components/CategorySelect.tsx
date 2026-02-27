import { useRef, useState, useEffect } from 'react';
import { ChevronDown, Folder, Plus, Settings } from 'lucide-react';
import { EmailCategoryRecord } from '../lib/db';
import { collection, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../contexts/AuthContext';
import { SystemManagerModal } from './SystemManagerModal';
import { useFirestoreSync } from '../hooks/useFirestoreSync';

interface CategorySelectProps {
    value: string | undefined | null;
    onChange: (val: string | null) => void;
}

export function CategorySelect({ value, onChange }: CategorySelectProps) {
    const { user } = useAuth();
    const [open, setOpen] = useState(false);
    const [showManager, setShowManager] = useState(false);
    const [newName, setNewName] = useState('');
    const [adding, setAdding] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    const { data: allCategories } = useFirestoreSync<EmailCategoryRecord>('categories');

    const options = [...allCategories].sort((a, b) => {
        const orderA = a.order ?? Number.MAX_SAFE_INTEGER;
        const orderB = b.order ?? Number.MAX_SAFE_INTEGER;
        if (orderA !== orderB) return orderA - orderB;
        return (a.createdAt || 0) - (b.createdAt || 0);
    });

    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', handler, { capture: true });
        return () => document.removeEventListener('mousedown', handler, { capture: true });
    }, [open]);

    const current = options.find(o => o.id === value);

    const handleQuickAdd = async (e?: React.KeyboardEvent) => {
        if (e && e.key !== 'Enter') return;
        if (!user || !newName.trim() || adding) return;
        setAdding(true);
        try {
            const newRef = doc(collection(db, 'categories'));
            await setDoc(newRef, {
                userId: user.uid,
                name: newName.trim(),
                order: options.length,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            });
            onChange(newRef.id);
            setNewName('');
            setOpen(false);
        } catch (err) {
            console.error(err);
        } finally {
            setAdding(false);
        }
    };

    return (
        <div ref={ref} className="relative w-full" onClick={e => e.stopPropagation()}>
            <button
                type="button"
                onClick={() => setOpen(!open)}
                className="flex items-center justify-between w-full min-w-[100px] gap-1.5 px-2 py-1 rounded-md border border-gray-200 bg-gray-50 text-[11px] text-gray-700 transition-all hover:bg-white hover:shadow-sm"
            >
                <span className="truncate">{current?.name || '—'}</span>
                <ChevronDown size={10} className="shrink-0 opacity-50" />
            </button>

            {open && (
                <div className="absolute z-50 top-full left-0 mt-1 bg-white rounded-lg shadow-lg border border-gray-200 py-1 min-w-[140px] max-h-48 overflow-y-auto custom-scrollbar">
                    <button
                        type="button"
                        onClick={() => { onChange(null); setOpen(false); }}
                        className={`w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-gray-400 hover:bg-gray-50 transition-colors ${!value ? 'bg-gray-50' : ''}`}
                    >
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-200" />
                        Không có
                    </button>

                    {options.map((opt) => (
                        <button
                            key={opt.id}
                            type="button"
                            onClick={() => { onChange(opt.id); setOpen(false); }}
                            className={`w-full flex items-center gap-2 px-3 py-1.5 text-[12px] transition-colors hover:bg-gray-50 ${value === opt.id ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'}`}
                        >
                            <Folder size={12} className={value === opt.id ? 'text-blue-500' : 'text-gray-400'} />
                            <span className="truncate">{opt.name}</span>
                        </button>
                    ))}

                    <div className="px-2 py-1 border-t border-gray-100 mt-1 flex items-center justify-between">
                        <div className="flex items-center gap-1.5 p-1 flex-1">
                            <Plus size={12} className="text-gray-400" />
                            <input
                                value={newName}
                                onChange={e => setNewName(e.target.value)}
                                onKeyDown={handleQuickAdd}
                                placeholder="Thêm nhanh..."
                                className="w-full text-[11px] bg-transparent outline-none placeholder:text-gray-300"
                            />
                        </div>
                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setOpen(false); setShowManager(true); }}
                            className="p-1 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
                            title="Quản lý Danh mục"
                        >
                            <Settings size={12} />
                        </button>
                    </div>
                </div>
            )}

            {showManager && (
                <SystemManagerModal mode="category" onClose={() => setShowManager(false)} />
            )}
        </div>
    );
}
