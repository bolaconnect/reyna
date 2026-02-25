import { useState, useRef, useEffect } from 'react';

interface NoteInputProps {
  value: string;
  onSave: (val: string) => void;
}

export function NoteInput({ value, onSave }: NoteInputProps) {
  const [local, setLocal] = useState(value);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync from prop when not focused
  useEffect(() => {
    if (!focused) setLocal(value);
  }, [value, focused]);

  const commit = () => {
    setFocused(false);
    if (local !== value) onSave(local);
  };

  return (
    <input
      ref={inputRef}
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onFocus={() => setFocused(true)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); inputRef.current?.blur(); }
        if (e.key === 'Escape') { setLocal(value); inputRef.current?.blur(); }
      }}
      placeholder="Add note..."
      className={`w-full h-7 px-2 text-[12px] text-gray-600 bg-transparent border rounded transition-all placeholder:text-gray-300 ${
        focused
          ? 'border-blue-300 bg-white ring-1 ring-blue-100'
          : 'border-transparent hover:border-gray-200 hover:bg-gray-50/50'
      }`}
    />
  );
}
