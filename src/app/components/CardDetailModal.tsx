import { useState, useEffect } from 'react';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { X, CreditCard, Edit2, Check, Copy } from 'lucide-react';
import { CardRecord } from './CardsTable';
import { copyToClipboard } from '../../utils/copy';
import { toast } from 'sonner';
import { formatCardNumberSpaced, formatExpiry } from '../../utils/mask';

interface Props {
  card: CardRecord;
  onClose: () => void;
  onUpdated: () => void;
}

function ViewField({
  label,
  value,
  mono,
  displayValue,
  onCopy,
}: {
  label: string;
  value: string;
  mono?: boolean;
  displayValue?: string;
  onCopy: () => void;
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
          {value ? displayValue || value : '—'}
        </span>
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
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  mono?: boolean;
  placeholder?: string;
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
    </div>
  );
}

export function CardDetailModal({ card, onClose, onUpdated }: Props) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ ...card });
  const [saving, setSaving] = useState(false);

  // Sync form when card prop refreshes (Firestore listener) and not in edit mode
  useEffect(() => {
    if (!editing) setForm({ ...card });
  }, [card, editing]);

  const set = (key: keyof CardRecord) => (val: string) =>
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
      await updateDoc(doc(db, 'cards', card.id), {
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
    setForm({ ...card });
    setEditing(false);
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="animate-scale-in bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[88vh]">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="w-7 h-7 bg-gray-900 rounded-lg flex items-center justify-center flex-shrink-0">
            <CreditCard size={14} className="text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-semibold text-gray-900">Card Details</h2>
            <p className="text-[12px] text-gray-400 font-mono truncate">
              {formatCardNumberSpaced(card.cardNumber)}
            </p>
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
                  className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
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
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Primary info */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-3">
              {editing ? (
                <EditField
                  label="Card Number"
                  value={form.cardNumber}
                  onChange={set('cardNumber')}
                  mono
                  placeholder="4532 1234 1234 5678"
                />
              ) : (
                <ViewField
                  label="Card Number"
                  value={form.cardNumber}
                  mono
                  displayValue={formatCardNumberSpaced(form.cardNumber)}
                  onCopy={() => copy(form.cardNumber, 'Card number')}
                />
              )}
            </div>
            <div>
              {editing ? (
                <EditField
                  label="Expiry"
                  value={form.expiryDate}
                  onChange={set('expiryDate')}
                  mono
                  placeholder="09/27"
                />
              ) : (
                <ViewField
                  label="Expiry"
                  value={form.expiryDate}
                  mono
                  displayValue={formatExpiry(form.expiryDate)}
                  onCopy={() => copy(form.expiryDate, 'Expiry')}
                />
              )}
            </div>
            <div>
              {editing ? (
                <EditField
                  label="CVV"
                  value={form.cvv}
                  onChange={set('cvv')}
                  mono
                  placeholder="123"
                />
              ) : (
                <ViewField
                  label="CVV"
                  value={form.cvv}
                  mono
                  onCopy={() => copy(form.cvv, 'CVV')}
                />
              )}
            </div>
            <div>
              {editing ? (
                <EditField
                  label="Cardholder Name"
                  value={form.cardholderName || ''}
                  onChange={set('cardholderName')}
                  placeholder="John Doe"
                />
              ) : (
                <ViewField
                  label="Cardholder Name"
                  value={form.cardholderName || ''}
                  onCopy={() => copy(form.cardholderName || '', 'Name')}
                />
              )}
            </div>
          </div>

          {/* Optional / Address */}
          <div className="border-t border-gray-100 pt-4">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">
              Address &amp; Contact
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                {editing ? (
                  <EditField
                    label="Street Address"
                    value={form.streetAddress || ''}
                    onChange={set('streetAddress')}
                    placeholder="123 Main St"
                  />
                ) : (
                  <ViewField
                    label="Street Address"
                    value={form.streetAddress || ''}
                    onCopy={() => copy(form.streetAddress || '', 'Address')}
                  />
                )}
              </div>
              <div>
                {editing ? (
                  <EditField
                    label="City"
                    value={form.city || ''}
                    onChange={set('city')}
                    placeholder="New York"
                  />
                ) : (
                  <ViewField
                    label="City"
                    value={form.city || ''}
                    onCopy={() => copy(form.city || '', 'City')}
                  />
                )}
              </div>
              <div>
                {editing ? (
                  <EditField
                    label="State"
                    value={form.state || ''}
                    onChange={set('state')}
                    placeholder="NY"
                  />
                ) : (
                  <ViewField
                    label="State"
                    value={form.state || ''}
                    onCopy={() => copy(form.state || '', 'State')}
                  />
                )}
              </div>
              <div>
                {editing ? (
                  <EditField
                    label="Zip Code"
                    value={form.zipCode || ''}
                    onChange={set('zipCode')}
                    placeholder="10001"
                  />
                ) : (
                  <ViewField
                    label="Zip Code"
                    value={form.zipCode || ''}
                    onCopy={() => copy(form.zipCode || '', 'Zip')}
                  />
                )}
              </div>
              <div>
                {editing ? (
                  <EditField
                    label="Country"
                    value={form.country || ''}
                    onChange={set('country')}
                    placeholder="US"
                  />
                ) : (
                  <ViewField
                    label="Country"
                    value={form.country || ''}
                    onCopy={() => copy(form.country || '', 'Country')}
                  />
                )}
              </div>
              <div>
                {editing ? (
                  <EditField
                    label="Phone Number"
                    value={form.phoneNumber || ''}
                    onChange={set('phoneNumber')}
                    placeholder="+1 555 000 0000"
                  />
                ) : (
                  <ViewField
                    label="Phone Number"
                    value={form.phoneNumber || ''}
                    onCopy={() => copy(form.phoneNumber || '', 'Phone')}
                  />
                )}
              </div>
              <div>
                {editing ? (
                  <EditField
                    label="Email"
                    value={form.email || ''}
                    onChange={set('email')}
                    placeholder="billing@email.com"
                  />
                ) : (
                  <ViewField
                    label="Email"
                    value={form.email || ''}
                    onCopy={() => copy(form.email || '', 'Email')}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}