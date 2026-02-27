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

  if (!focused) {
    return (
      <div
        className="w-full h-7 px-2 flex items-center text-[12px] text-gray-600 truncate cursor-text hover:bg-gray-50/50 rounded border border-transparent transition-all"
        onDoubleClick={(e) => {
          e.stopPropagation();
          setFocused(true);
          setTimeout(() => inputRef.current?.focus(), 0);
        }}
        title={value || "Double click to add note..."}
      >
        {value ? <span>{value}</span> : <span className="text-gray-300 italic">Add note...</span>}
      </div>
    );
  }

  return (
    <input
      ref={inputRef}
      value={local}
      autoFocus
      onChange={(e) => setLocal(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); inputRef.current?.blur(); }
        if (e.key === 'Escape') { setLocal(value); inputRef.current?.blur(); }
      }}
      placeholder="Add note..."
      className="w-full h-7 px-2 text-[12px] text-gray-600 bg-white border border-blue-300 rounded transition-all placeholder:text-gray-300 outline-none ring-1 ring-blue-100"
    />
  );
}
