import { useState, useEffect } from 'react';

interface PayInputProps {
    value?: number;
    onChange: (val: number) => void;
}

export function PayInput({ value = 0, onChange }: PayInputProps) {
    const [localValue, setLocalValue] = useState<string>(value.toString());

    useEffect(() => {
        setLocalValue(value.toString());
    }, [value]);

    const handleAdd = () => {
        const current = parseInt(localValue || '0', 10);
        if (!isNaN(current)) {
            const next = current + 1;
            setLocalValue(next.toString());
            onChange(next);
        }
    };

    const handleSub = () => {
        const current = parseInt(localValue || '0', 10);
        if (!isNaN(current)) {
            const next = Math.max(0, current - 1);
            setLocalValue(next.toString());
            onChange(next);
        }
    };

    const handleBlur = () => {
        const num = localValue === '' ? 0 : parseInt(localValue, 10);
        if (!isNaN(num) && num >= 0) {
            setLocalValue(num.toString()); // Normalize representation
            onChange(num);
        } else {
            setLocalValue(value.toString()); // revert
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.currentTarget.blur();
        }
    };

    return (
        <div className="flex items-center w-full min-w-[70px] max-w-[100px] mx-auto bg-gray-50 rounded-lg p-0.5 border border-gray-100 group transition-all" onClick={e => e.stopPropagation()}>
            <button
                onClick={handleSub}
                className="flex items-center justify-center rounded-md text-gray-400 hover:text-red-500 hover:bg-white hover:shadow-sm transition-all overflow-hidden w-0 opacity-0 group-hover:w-6 group-hover:opacity-100 shrink-0 h-6"
            >
                -
            </button>
            <div className="flex-1 px-1 relative flex items-center justify-center min-w-0 transition-all">
                <input
                    type="text"
                    inputMode="numeric"
                    value={localValue}
                    onChange={e => {
                        // Allow typing any number, strictly remove non-digits
                        const val = e.target.value.replace(/[^0-9]/g, '');
                        setLocalValue(val);
                    }}
                    onBlur={handleBlur}
                    onKeyDown={handleKeyDown}
                    className="w-full text-center text-[13px] font-bold font-mono text-emerald-600 bg-transparent focus:outline-none px-0"
                />
            </div>
            <button
                onClick={handleAdd}
                className="flex items-center justify-center rounded-md text-gray-400 hover:text-emerald-500 hover:bg-white hover:shadow-sm transition-all overflow-hidden w-0 opacity-0 group-hover:w-6 group-hover:opacity-100 shrink-0 h-6"
            >
                +
            </button>
        </div>
    );
}
