import { useRef, useState, useEffect } from 'react';
import { ChevronDown, Folder } from 'lucide-react';
import { EmailCategoryRecord } from '../lib/db';

interface CategorySelectProps {
    value: string | undefined | null;
    options: EmailCategoryRecord[];
    onChange: (val: string | null) => void;
}

export function CategorySelect({ value, options, onChange }: CategorySelectProps) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    const current = options.find(o => o.id === value);

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
                </div>
            )}
        </div>
    );
}
