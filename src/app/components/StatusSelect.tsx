import { useRef, useState, useEffect } from 'react';
import { ChevronDown, Plus, Settings } from 'lucide-react';
import { useFirestoreSync } from '../hooks/useFirestoreSync';
import { StatusRecord } from '../lib/db';
import { collection, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../contexts/AuthContext';
import { SystemManagerModal } from './SystemManagerModal';

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

interface StatusSelectProps {
  value: string;
  collectionType: 'cards' | 'emails';
  onChange: (val: string) => void;
  align?: 'left' | 'right';
}

export function StatusSelect({ value, collectionType, onChange, align = 'left' }: StatusSelectProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [showManager, setShowManager] = useState(false);
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);
  const [quickColor, setQuickColor] = useState(DOT_COLORS[0]);
  const ref = useRef<HTMLDivElement>(null);

  const { data: allStatuses } = useFirestoreSync<StatusRecord>('statuses');
  const options = allStatuses
    .filter(s => s.collection === collectionType)
    .sort((a, b) => {
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

  const current = options.find((o) => o.id === value) ?? null;

  const handleQuickAdd = async () => {
    if (!user || !newName.trim() || adding) return;
    setAdding(true);
    try {
      const newRef = doc(collection(db, 'statuses'));

      await setDoc(newRef, {
        userId: user.uid,
        collection: collectionType,
        name: newName.trim(),
        order: options.length,
        colorDot: quickColor.dot,
        colorBg: quickColor.bg,
        colorText: quickColor.text,
        colorBorder: quickColor.border,
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
    <div ref={ref} className="relative w-full min-w-[76px]" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`flex items-center justify-between gap-1.5 px-2 py-1 rounded-md border text-[11px] transition-all hover:shadow-sm w-full ${current
          ? `${current.colorBg} ${current.colorText} ${current.colorBorder}`
          : 'bg-gray-50 text-gray-400 border-gray-200 hover:bg-white'
          }`}
      >
        <div className="flex items-center gap-1.5 truncate">
          {current && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${current.colorDot}`} />}
          <span className="truncate">{current?.name ?? '—'}</span>
        </div>
        <ChevronDown size={10} className="shrink-0 opacity-50" />
      </button>

      {open && (
        <div className={`absolute z-[100] top-full mt-1 bg-white rounded-lg shadow-lg border border-gray-200 py-1 min-w-[140px] max-h-48 overflow-y-auto custom-scrollbar ${align === 'right' ? 'right-0' : 'left-0'}`}>
          {/* None / clear option */}
          <button
            type="button"
            onClick={() => { onChange(''); setOpen(false); }}
            className={`w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-gray-400 hover:bg-gray-50 transition-colors ${!value ? 'bg-gray-50' : ''}`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-gray-200 shrink-0" />
            <span className="truncate">Không có</span>
          </button>

          {options.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => { onChange(opt.id); setOpen(false); }}
              className={`w-full flex items-center gap-2 px-3 py-1.5 text-[12px] transition-colors hover:bg-gray-50 ${value === opt.id ? `${opt.colorBg} ${opt.colorText}` : 'text-gray-700'}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${opt.colorDot}`} />
              <span className="truncate">{opt.name}</span>
            </button>
          ))}

          <div className="flex flex-col border-t border-gray-100 mt-1">
            <div className="px-2 py-1 flex items-center justify-between">
              <div className="flex items-center gap-1.5 p-1 flex-1">
                <Plus size={12} className="text-gray-400" />
                <input
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleQuickAdd()}
                  placeholder="Thêm nhanh..."
                  className="w-full text-[11px] bg-transparent outline-none placeholder:text-gray-300"
                />
              </div>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); handleQuickAdd(); }}
                disabled={!newName.trim() || adding}
                className="p-1 px-2 text-blue-600 font-medium text-[11px] disabled:opacity-50 hover:bg-blue-50 rounded transition-colors"
              >
                Lưu
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setOpen(false); setShowManager(true); }}
                className="p-1 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors shrink-0 ml-1 border-l border-gray-100 pl-2"
                title="Quản lý Trạng thái"
              >
                <Settings size={12} />
              </button>
            </div>
            {newName.trim() && (
              <div className="px-3 pb-2 pt-1">
                <div className="flex flex-wrap gap-1">
                  {DOT_COLORS.map((c, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setQuickColor(c); }}
                      className={`w-4 h-4 rounded-full flex items-center justify-center ${c.bg} border transition-all ${quickColor.dot === c.dot ? 'ring-2 ring-offset-1 ring-blue-500 border-transparent' : c.border}`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {showManager && (
        <SystemManagerModal mode="status" collectionType={collectionType} onClose={() => setShowManager(false)} />
      )}
    </div>
  );
}
