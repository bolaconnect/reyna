import { useState, useEffect } from 'react';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { X, Mail, Edit2, Check, Copy, Shield } from 'lucide-react';
import { EmailRecord } from './EmailsTable';
import { copyToClipboard } from '../../utils/copy';
import { toast } from 'sonner';
import { useFirestoreSync } from '../hooks/useFirestoreSync';

interface Props {
  record: EmailRecord;
  totpCode?: string;
  onClose: () => void;
  onUpdated: () => void;
}

function ViewField({
  label,
  value,
  mono,
  onCopy,
  badge,
}: {
  label: string;
  value: string;
  mono?: boolean;
  onCopy: () => void;
  badge?: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-[11px] font-medium text-gray-400 mb-0.5">{label}</p>
      <div
        onClick={value ? onCopy : undefined}
        className={`group flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${value ? 'hover:bg-gray-50 cursor-pointer' : ''
          }`}
      >
        <span
          className={`flex-1 text-[13px] ${mono ? 'font-mono' : ''} ${!value ? 'text-gray-300 italic' : 'text-gray-800'
            }`}
        >
          {value || '—'}
        </span>
        {badge}
        {value && (
          <Copy
            size={11}
            className="opacity-0 group-hover:opacity-40 text-gray-500 transition-opacity flex-shrink-0"
          />
        )}
      </div>
    </div>
  );
}

function EditField({
  label,
  value,
  onChange,
  mono,
  placeholder,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  mono?: boolean;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-gray-400 mb-1">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full px-3 py-2 text-[13px] ${mono ? 'font-mono' : ''
          } text-gray-800 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400 focus:bg-white transition-colors placeholder:text-gray-300`}
      />
      {hint && <p className="mt-1 text-[11px] text-gray-400">{hint}</p>}
    </div>
  );
}

export function EmailDetailModal({ record, totpCode, onClose, onUpdated }: Props) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ ...record });
  const [saving, setSaving] = useState(false);

  // Fetch cards to find the ones linked to this email
  const { data: cards } = useFirestoreSync<{ id: string; cardNumber: string; linkedEmails?: string[] }>('cards');
  const linkedCards = cards.filter(c => c.linkedEmails?.includes(record.id));

  // Sync form when record prop refreshes (Firestore listener) and not in edit mode
  useEffect(() => {
    if (!editing) setForm({ ...record });
  }, [record, editing]);

  const set = (key: keyof EmailRecord) => (val: string) =>
    setForm((f) => ({ ...f, [key]: val }));

  const copy = async (value: string, label: string) => {
    const ok = await copyToClipboard(value);
    if (ok)
      toast(`${label} copied!`, {
        duration: 900,
        position: 'bottom-center',
        style: {
          background: '#1d1d1f',
          color: '#fff',
          fontSize: '12px',
          padding: '6px 14px',
          borderRadius: '8px',
          minWidth: 'unset',
          width: 'auto',
          border: 'none',
        },
      });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id, userId, ...data } = form;
      await updateDoc(doc(db, 'emails', record.id), {
        ...data,
        updatedAt: serverTimestamp(),
      });
      onUpdated();
      setEditing(false);
      // Modal stays open; form will re-sync via useEffect when Firestore pushes update
    } catch {
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setForm({ ...record });
    setEditing(false);
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="animate-scale-in bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[88vh]">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <Mail size={14} className="text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-semibold text-gray-900">Email Details</h2>
            <p className="text-[12px] text-gray-400 truncate">{record.email}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {editing ? (
              <>
                <button
                  onClick={handleCancel}
                  className="px-3 py-1.5 text-[12px] text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  <Check size={12} />
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </>
            ) : (
              <button
                onClick={() => setEditing(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <Edit2 size={13} />
                Edit
              </button>
            )}
            <button
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {editing ? (
            <EditField
              label="Email"
              value={form.email}
              onChange={set('email')}
              placeholder="user@gmail.com"
            />
          ) : (
            <ViewField
              label="Email"
              value={form.email}
              onCopy={() => copy(form.email, 'Email')}
            />
          )}

          {editing ? (
            <EditField
              label="Password"
              value={form.password}
              onChange={set('password')}
              placeholder="Enter password"
              mono
            />
          ) : (
            <ViewField
              label="Password"
              value={form.password}
              mono
              onCopy={() => copy(form.password, 'Password')}
            />
          )}

          {/* 2FA section */}
          <div className="border-t border-gray-100 pt-4">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Shield size={11} />
              Two-Factor Auth
            </p>

            {editing ? (
              <EditField
                label="2FA Secret Key"
                value={form.secret2FA}
                onChange={set('secret2FA')}
                placeholder="JBSWY3DPEHPK3PXP"
                mono
                hint="Base32 TOTP secret (from authenticator app setup)"
              />
            ) : (
              <ViewField
                label="2FA Secret Key"
                value={form.secret2FA}
                mono
                onCopy={() => copy(form.secret2FA, '2FA secret')}
              />
            )}

            {/* Live TOTP code */}
            {record.secret2FA && totpCode && !editing && (
              <div className="mt-3">
                <p className="text-[11px] font-medium text-gray-400 mb-0.5">Current 2FA Code</p>
                <div
                  onClick={() => copy(totpCode, '2FA code')}
                  className="group flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-blue-50 cursor-pointer transition-colors"
                >
                  <span className="text-[18px] text-blue-600 font-mono font-semibold tracking-widest">
                    {totpCode}
                  </span>
                  <Copy
                    size={11}
                    className="opacity-0 group-hover:opacity-40 text-blue-500 transition-opacity"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Recovery email */}
          <div>
            {editing ? (
              <EditField
                label="Recovery Email"
                value={form.recoveryEmail || ''}
                onChange={set('recoveryEmail')}
                placeholder="recovery@email.com"
              />
            ) : (
              <ViewField
                label="Recovery Email"
                value={form.recoveryEmail || ''}
                onCopy={() => copy(form.recoveryEmail || '', 'Recovery email')}
              />
            )}
          </div>

          {/* Phone */}
          <div>
            {editing ? (
              <EditField
                label="Phone Number"
                value={form.phone || ''}
                onChange={set('phone')}
                placeholder="+1 555 000 0000"
              />
            ) : (
              <ViewField
                label="Phone Number"
                value={form.phone || ''}
                onCopy={() => copy(form.phone || '', 'Phone')}
              />
            )}
          </div>

          {/* Linked Cards List */}
          {!editing && (
            <div className="border-t border-gray-100 pt-4">
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
                Đang liên kết với các Thẻ ({linkedCards.length})
              </p>
              {linkedCards.length === 0 ? (
                <p className="text-[12px] text-gray-300 italic">Chưa có thẻ nào</p>
              ) : (
                <div className="flex flex-wrap gap-2 mt-2">
                  {linkedCards.map(c => (
                    <span key={c.id} className="inline-flex items-center px-2 py-1 rounded bg-indigo-50 border border-indigo-100 text-indigo-700 text-[11px] font-mono tracking-wider font-semibold">
                      {c.cardNumber.slice(-4) || 'Unknown'}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}