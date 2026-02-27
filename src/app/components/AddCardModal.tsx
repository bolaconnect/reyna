import { useState, useEffect } from 'react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../contexts/AuthContext';
import { X, CreditCard } from 'lucide-react';
import { StatusSelect } from './StatusSelect';
import { useFirestoreSync } from '../hooks/useFirestoreSync';
import { StatusRecord } from '../lib/db';

interface AddCardModalProps {
  onClose: () => void;
  onAdded: () => void;
}

const INITIAL = {
  cardNumber: '',
  expiryDate: '',
  cvv: '',
  cardholderName: '',
  streetAddress: '',
  city: '',
  state: '',
  zipCode: '',
  country: '',
  phoneNumber: '',
  email: '',
  status: '',
  note: '',
};

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  required = false,
  mono = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
  mono?: boolean;
}) {
  return (
    <div>
      <label className="block text-[12px] font-medium text-gray-500 mb-1">
        {label} {required && <span className="text-red-400">*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className={`w-full px-3 py-2 text-[13px] ${mono ? 'font-mono' : ''} text-gray-800 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400 focus:bg-white transition-colors placeholder:text-gray-300`}
      />
    </div>
  );
}

export function AddCardModal({ onClose, onAdded }: AddCardModalProps) {
  const { user } = useAuth();
  const [form, setForm] = useState(INITIAL);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (key: keyof typeof INITIAL) => (val: string) =>
    setForm((f) => ({ ...f, [key]: val }));

  const { data: allStatuses } = useFirestoreSync<StatusRecord>('statuses');
  const options = allStatuses.filter(s => s.collection === 'cards');

  useEffect(() => {
    if (form.status === '' && options.length > 0) {
      const activeOpt = options.find(o => o.name.toLowerCase() === 'active');
      setForm(f => ({ ...f, status: activeOpt ? activeOpt.id : options[0].id }));
    }
  }, [options, form.status]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!form.cardNumber.trim()) {
      setError('Card number is required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await addDoc(collection(db, 'cards'), {
        userId: user.uid,
        ...form,
        status: form.status || '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      onAdded();
      onClose();
    } catch {
      setError('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100">
          <div className="w-7 h-7 bg-gray-900 rounded-lg flex items-center justify-center">
            <CreditCard size={14} className="text-white" />
          </div>
          <div>
            <h2 className="text-[15px] font-semibold text-gray-900">Add Card</h2>
            <p className="text-[12px] text-gray-400">Fill in the card details</p>
          </div>
          <button
            onClick={onClose}
            className="ml-auto w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Card info */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-3">
              <Field
                label="Card Number"
                value={form.cardNumber}
                onChange={set('cardNumber')}
                placeholder="4532 1234 1234 5678"
                required
                mono
              />
            </div>
            <Field
              label="Expiry"
              value={form.expiryDate}
              onChange={set('expiryDate')}
              placeholder="09/27"
              mono
            />
            <Field
              label="CVV"
              value={form.cvv}
              onChange={set('cvv')}
              placeholder="123"
              mono
            />
            <Field
              label="Cardholder Name"
              value={form.cardholderName}
              onChange={set('cardholderName')}
              placeholder="John Doe"
            />
          </div>

          {/* Status & Note */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-medium text-gray-500 mb-1">Status</label>
              <StatusSelect
                collectionType="cards"
                value={form.status}
                onChange={set('status')}
              />
            </div>
            <Field
              label="Note"
              value={form.note}
              onChange={set('note')}
              placeholder="Add a note..."
            />
          </div>

          {/* Optional fields */}
          <div className="pt-2 border-t border-gray-100">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">
              Optional Info
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Field
                  label="Street Address"
                  value={form.streetAddress}
                  onChange={set('streetAddress')}
                  placeholder="123 Main St"
                />
              </div>
              <Field label="City" value={form.city} onChange={set('city')} placeholder="New York" />
              <Field label="State" value={form.state} onChange={set('state')} placeholder="NY" />
              <Field
                label="Zip Code"
                value={form.zipCode}
                onChange={set('zipCode')}
                placeholder="10001"
              />
              <Field
                label="Country"
                value={form.country}
                onChange={set('country')}
                placeholder="US"
              />
              <Field
                label="Phone Number"
                value={form.phoneNumber}
                onChange={set('phoneNumber')}
                placeholder="+1 555 000 0000"
              />
              <Field
                label="Email"
                value={form.email}
                onChange={set('email')}
                placeholder="billing@email.com"
                type="email"
              />
            </div>
          </div>

          {error && (
            <p className="text-[12px] text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
          )}
        </form>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-[13px] text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="px-5 py-2 text-[13px] font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving…' : 'Add Card'}
          </button>
        </div>
      </div>
    </div>
  );
}