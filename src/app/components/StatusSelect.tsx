import { useRef, useState, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

export const STATUS_OPTIONS = [
  { value: 'active',   label: 'Active',   dot: 'bg-emerald-400', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  { value: 'inactive', label: 'Inactive', dot: 'bg-gray-400',    bg: 'bg-gray-50',    text: 'text-gray-600',    border: 'border-gray-200' },
  { value: 'expired',  label: 'Expired',  dot: 'bg-red-400',     bg: 'bg-red-50',     text: 'text-red-700',     border: 'border-red-200' },
  { value: 'blocked',  label: 'Blocked',  dot: 'bg-orange-400',  bg: 'bg-orange-50',  text: 'text-orange-700',  border: 'border-orange-200' },
  { value: 'pending',  label: 'Pending',  dot: 'bg-amber-400',   bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200' },
] as const;

export type StatusValue = typeof STATUS_OPTIONS[number]['value'] | '';

function getOption(value: string) {
  return STATUS_OPTIONS.find((o) => o.value === value) ?? null;
}

interface StatusSelectProps {
  value: string;
  onChange: (val: string) => void;
}

export function StatusSelect({ value, onChange }: StatusSelectProps) {
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

  const current = getOption(value);

  return (
    <div ref={ref} className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 px-2 py-1 rounded-md border text-[11px] transition-all hover:shadow-sm min-w-[76px] ${
          current
            ? `${current.bg} ${current.text} ${current.border}`
            : 'bg-gray-50 text-gray-400 border-gray-200'
        }`}
      >
        {current && <span className={`w-1.5 h-1.5 rounded-full ${current.dot}`} />}
        <span className="flex-1 text-left truncate">{current?.label ?? '—'}</span>
        <ChevronDown size={10} className="shrink-0 opacity-50" />
      </button>

      {open && (
        <div className="absolute z-50 top-full left-0 mt-1 bg-white rounded-lg shadow-lg border border-gray-200 py-1 min-w-[120px]">
          {/* None / clear option */}
          <button
            type="button"
            onClick={() => { onChange(''); setOpen(false); }}
            className={`w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-gray-400 hover:bg-gray-50 transition-colors ${
              !value ? 'bg-gray-50' : ''
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-gray-200" />
            None
          </button>
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className={`w-full flex items-center gap-2 px-3 py-1.5 text-[12px] transition-colors hover:bg-gray-50 ${
                value === opt.value ? `${opt.bg} ${opt.text}` : 'text-gray-700'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${opt.dot}`} />
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
