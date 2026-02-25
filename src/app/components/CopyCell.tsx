import { ReactNode } from 'react';
import { toast } from 'sonner';
import { copyToClipboard } from '../../utils/copy';

interface CopyCellProps {
  value: string;
  children: ReactNode;
  className?: string;
  tdClassName?: string;
  /** Called after a successful copy so the parent row can highlight itself */
  onCopied?: () => void;
  /** Called on click to single-select this row */
  onSelect?: () => void;
}

export function CopyCell({ value, children, className = '', tdClassName = '', onCopied, onSelect }: CopyCellProps) {
  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation(); // prevent row onClick from firing
    onSelect?.();        // single-select this row
    const ok = await copyToClipboard(value);
    if (ok) {
      onCopied?.();
      toast('Copied!', {
        duration: 1000,
        position: 'bottom-center',
        style: {
          background: '#1d1d1f',
          color: '#fff',
          fontSize: '12px',
          padding: '6px 14px',
          borderRadius: '8px',
          boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
          minWidth: 'unset',
          width: 'auto',
          border: 'none',
        },
      });
    }
  };

  return (
    <td
      className={`cursor-pointer select-none whitespace-nowrap ${tdClassName}`}
      onClick={handleCopy}
    >
      <div className={`flex items-center ${className}`}>
        {children}
      </div>
    </td>
  );
}