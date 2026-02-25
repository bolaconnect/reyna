import { Eye, EyeOff, LogOut, CreditCard } from 'lucide-react';
import { signOut } from 'firebase/auth';
import { auth } from '../../firebase/config';
import { useAuth } from '../../contexts/AuthContext';
import { useVisibility } from '../../contexts/VisibilityContext';

export function TopBar() {
  const { user } = useAuth();
  const { isVisible, toggleVisibility } = useVisibility();

  const handleLogout = async () => {
    await signOut(auth);
  };

  return (
    <header className="w-full bg-white/90 backdrop-blur-md border-b border-gray-200/80 px-6 py-0 flex items-center justify-between h-14 sticky top-0 z-40">
      {/* Logo */}
      <div className="flex items-center gap-2.5">
        <div className="w-7 h-7 bg-gray-900 rounded-lg flex items-center justify-center">
          <CreditCard size={14} className="text-white" strokeWidth={2} />
        </div>
        <span className="text-[15px] font-semibold text-gray-900 tracking-tight">
          Card Manager
        </span>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-1">
        {/* User email */}
        <span className="text-[13px] text-gray-400 mr-2 hidden sm:block">
          {user?.email}
        </span>

        {/* Visibility toggle */}
        <button
          onClick={toggleVisibility}
          className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
            isVisible
              ? 'bg-blue-50 text-blue-600'
              : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
          }`}
          title={isVisible ? 'Hide sensitive values' : 'Show sensitive values'}
        >
          {isVisible ? <Eye size={15} strokeWidth={2} /> : <EyeOff size={15} strokeWidth={2} />}
        </button>

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="ml-1 flex items-center gap-1.5 h-8 px-3 text-[13px] text-gray-500 rounded-lg hover:bg-gray-100 hover:text-gray-800 transition-colors"
        >
          <LogOut size={13} strokeWidth={2} />
          <span className="hidden sm:inline">Logout</span>
        </button>
      </div>
    </header>
  );
}
