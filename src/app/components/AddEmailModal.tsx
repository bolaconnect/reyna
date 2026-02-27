import { useState, useEffect } from 'react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../contexts/AuthContext';
import { X, Mail } from 'lucide-react';
import { StatusSelect } from './StatusSelect';
import { useFirestoreSync } from '../hooks/useFirestoreSync';
import { StatusRecord } from '../lib/db';

interface AddEmailModalProps {
  onClose: () => void;
  onAdded: () => void;
}

const INITIAL = {
  email: '',
  password: '',
  secret2FA: '',
  recoveryEmail: '',
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
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
  mono?: boolean;
  hint?: string;
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
      {hint && <p className="mt-1 text-[11px] text-gray-400">{hint}</p>}
    </div>
  );
}

export function AddEmailModal({ onClose, onAdded }: AddEmailModalProps) {
  const { user } = useAuth();
  const [form, setForm] = useState(INITIAL);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (key: keyof typeof INITIAL) => (val: string) =>
    setForm((f) => ({ ...f, [key]: val }));

  const { data: allStatuses } = useFirestoreSync<StatusRecord>('statuses');
  const options = allStatuses.filter(s => s.collection === 'emails');

  useEffect(() => {
    if (form.status === '' && options.length > 0) {
      const activeOpt = options.find(o => o.name.toLowerCase() === 'active');
      setForm(f => ({ ...f, status: activeOpt ? activeOpt.id : options[0].id }));
    }
  }, [options, form.status]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!form.email.trim()) {
      setError('Email is required.');
      return;
    }
    if (!form.password.trim()) {
      setError('Password is required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await addDoc(collection(db, 'emails'), {
        ...form,
        userId: user.uid,
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
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100">
          <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center">
            <Mail size={14} className="text-white" />
          </div>
          <div>
            <h2 className="text-[15px] font-semibold text-gray-900">Add Email</h2>
            <p className="text-[12px] text-gray-400">Fill in the account details</p>
          </div>
          <button
            onClick={onClose}
            className="ml-auto w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <Field
            label="Email"
            value={form.email}
            onChange={set('email')}
            placeholder="user@gmail.com"
            type="email"
            required
          />
          <Field
            label="Password"
            value={form.password}
            onChange={set('password')}
            placeholder="Enter password"
            required
          />
          <Field
            label="2FA Secret Key"
            value={form.secret2FA}
            onChange={set('secret2FA')}
            placeholder="JBSWY3DPEHPK3PXP"
            mono
            hint="Base32 TOTP secret (from authenticator app setup)"
          />
          <Field
            label="Recovery Email"
            value={form.recoveryEmail}
            onChange={set('recoveryEmail')}
            placeholder="recovery@email.com"
            type="email"
          />

          {/* Status & Note */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-medium text-gray-500 mb-1">Status</label>
              <StatusSelect
                collectionType="emails"
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
            className="px-5 py-2 text-[13px] font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving...' : 'Add Email'}
          </button>
        </div>
      </div>
    </div>
  );
}
