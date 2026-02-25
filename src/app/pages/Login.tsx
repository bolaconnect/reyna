import { useState, useEffect } from 'react';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from 'firebase/auth';
import { auth } from '../../firebase/config';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router';
import { CreditCard, Eye, EyeOff, AlertCircle } from 'lucide-react';

type Mode = 'login' | 'register';

export function Login() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!loading && user) {
      navigate('/dashboard', { replace: true });
    }
  }, [user, loading, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please fill in all fields.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      if (mode === 'login') {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
      }
      navigate('/dashboard', { replace: true });
    } catch (err: unknown) {
      const msg = (err as { code?: string })?.code;
      if (msg === 'auth/user-not-found' || msg === 'auth/wrong-password' || msg === 'auth/invalid-credential') {
        setError('Invalid email or password.');
      } else if (msg === 'auth/email-already-in-use') {
        setError('An account with this email already exists.');
      } else if (msg === 'auth/weak-password') {
        setError('Password must be at least 6 characters.');
      } else if (msg === 'auth/invalid-email') {
        setError('Please enter a valid email address.');
      } else {
        setError('Authentication failed. Check your Firebase configuration.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-[#0f0f17]">
        <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f5f5f7] dark:bg-[#0f0f17] px-4">
      <div className="w-full max-w-[360px]">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-sm overflow-hidden">
            <img src="logo.png" alt="Reyna Logo" className="w-full h-full object-cover" />
          </div>
          <h1 className="text-[22px] font-semibold text-gray-900 tracking-tight">
            Reyna
          </h1>
          <p className="mt-1 text-[13px] text-gray-400">
            Your private personal manager
          </p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {/* Tab toggle */}
          <div className="flex border-b border-gray-100">
            <button
              onClick={() => { setMode('login'); setError(''); }}
              className={`flex-1 py-3 text-[13px] font-medium transition-colors ${mode === 'login'
                ? 'text-gray-900 border-b-2 border-gray-900'
                : 'text-gray-400 hover:text-gray-600'
                }`}
            >
              Sign In
            </button>
            <button
              onClick={() => { setMode('register'); setError(''); }}
              className={`flex-1 py-3 text-[13px] font-medium transition-colors ${mode === 'register'
                ? 'text-gray-900 border-b-2 border-gray-900'
                : 'text-gray-400 hover:text-gray-600'
                }`}
            >
              Create Account
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {/* Email */}
            <div>
              <label className="block text-[12px] font-medium text-gray-500 mb-1.5">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(''); }}
                placeholder="you@example.com"
                autoComplete="email"
                className="w-full px-3 py-2.5 text-[13px] text-gray-800 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-blue-400 focus:bg-white transition-colors placeholder:text-gray-300"
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-[12px] font-medium text-gray-500 mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(''); }}
                  placeholder="••••••••"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  className="w-full px-3 py-2.5 pr-10 text-[13px] text-gray-800 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-blue-400 focus:bg-white transition-colors placeholder:text-gray-300"
                />
                <button
                  type="button"
                  onClick={() => setShowPass((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              {mode === 'register' && (
                <p className="mt-1 text-[11px] text-gray-400">At least 6 characters</p>
              )}
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-start gap-2 text-[12px] text-red-600 bg-red-50 px-3 py-2.5 rounded-xl">
                <AlertCircle size={13} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 text-[13px] font-semibold bg-gray-900 text-white rounded-xl hover:bg-gray-700 disabled:opacity-50 transition-colors mt-2"
            >
              {submitting
                ? mode === 'login'
                  ? 'Signing in…'
                  : 'Creating account…'
                : mode === 'login'
                  ? 'Sign In'
                  : 'Create Account'}
            </button>
          </form>
        </div>

        {/* Firebase config notice */}
        <div className="mt-4 text-center text-[11px] text-gray-400 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
          <span className="font-medium text-amber-600">Configure Firebase</span>
          {' '}— Update <code className="font-mono bg-amber-100 px-1 rounded">src/firebase/config.tsx</code> with your project credentials.
        </div>
      </div>
    </div>
  );
}
