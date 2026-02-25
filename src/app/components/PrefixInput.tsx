import { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

interface PrefixInputProps {
    value: string;
    onChange: (val: string) => void;
    suggestions: string[];
}

export function PrefixInput({ value, onChange, suggestions }: PrefixInputProps) {
    const [open, setOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const filteredSuggestions = suggestions.filter(s => s !== value);

    return (
        <div ref={containerRef} className="relative">
            <div className="flex items-center">
                <input
                    value={value}
                    onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 8))}
                    onFocus={() => setOpen(true)}
                    placeholder="Head..."
                    className="w-16 h-7 px-2 pr-5 text-[11px] border border-gray-100 rounded-md focus:outline-none focus:border-gray-300 transition-colors font-mono"
                />
                <button
                    onClick={() => setOpen(!open)}
                    className="absolute right-1 text-gray-300 hover:text-gray-500 transition-colors"
                    tabIndex={-1}
                >
                    <ChevronDown size={10} />
                </button>
            </div>

            {open && filteredSuggestions.length > 0 && (
                <div className="absolute z-50 top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[80px] max-h-48 overflow-auto">
                    {filteredSuggestions.map((s) => (
                        <button
                            key={s}
                            onClick={() => {
                                onChange(s);
                                setOpen(false);
                            }}
                            className="w-full text-left px-3 py-1.5 text-[11px] font-mono text-gray-700 hover:bg-gray-50 transition-colors"
                        >
                            {s}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
