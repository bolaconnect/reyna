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

    const handleAdd = () => onChange(value + 1);
    const handleSub = () => onChange(Math.max(0, value - 1));

    const handleBlur = () => {
        const num = parseFloat(localValue);
        if (!isNaN(num) && num >= 0) {
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
        <div className="flex items-center gap-0.5 max-w-[90px] mx-auto bg-gray-50 rounded-lg p-0.5 border border-gray-100" onClick={e => e.stopPropagation()}>
            <button
                onClick={handleSub}
                className="w-6 h-6 flex items-center justify-center rounded-md text-gray-400 hover:text-red-500 hover:bg-white hover:shadow-sm transition-all"
            >
                -
            </button>
            <div className="flex-1 px-1 relative flex items-center justify-center">
                <input
                    type="number"
                    value={localValue}
                    onChange={e => setLocalValue(e.target.value)}
                    onBlur={handleBlur}
                    onKeyDown={handleKeyDown}
                    className="w-full text-center text-[12px] font-bold font-mono text-emerald-600 bg-transparent focus:outline-none px-1"
                />
            </div>
            <button
                onClick={handleAdd}
                className="w-6 h-6 flex items-center justify-center rounded-md text-gray-400 hover:text-emerald-500 hover:bg-white hover:shadow-sm transition-all"
            >
                +
            </button>
        </div>
    );
}
