import { useState, useEffect, useRef, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router';
import { useAuth } from '../../contexts/AuthContext';
import { useVisibility } from '../../contexts/VisibilityContext';
import { CardsTable } from '../components/CardsTable';
import { EmailsTable } from '../components/EmailsTable';
import { QuickAddModal } from '../components/QuickAddModal';
import { AddCardModal } from '../components/AddCardModal';
import { AddEmailModal } from '../components/AddEmailModal';
import { Plus, Zap, CreditCard, Mail, Eye, EyeOff, LogOut, ChevronLeft, ChevronRight, User, Bell, Settings, Lock, Folder } from 'lucide-react';
import { signOut } from 'firebase/auth';
import { auth } from '../../firebase/config';
import { useNotification } from '../hooks/useNotification';
import { useAlarmPoller } from '../hooks/useAlarms';
import { NotificationCenter } from '../components/NotificationCenter';
import { SettingsModal, useSettings } from '../components/SettingsModal';
import { PinGuard, usePin } from '../components/PinGuard';
import { dbLocal } from '../lib/db';
import { motion, AnimatePresence } from 'motion/react';
import { useFirestoreSync } from '../hooks/useFirestoreSync';
import { SidebarCategories } from '../components/SidebarCategories';
import { CategoryExplorer } from '../components/CategoryExplorer';

type Tab = 'cards' | 'emails' | 'categories';

export function Dashboard() {
  const { user, loading } = useAuth();
  const { isVisible, toggleVisibility } = useVisibility();
  const navigate = useNavigate();
  const { settings, updateSettings } = useSettings();
  const { lockNow, hasPin } = usePin();

  // Background sync for global features
  const { syncing: alarmsSyncing } = useFirestoreSync('alarms');
  const { syncing: notifsSyncing } = useFirestoreSync('notifications');

  const [tab, setTab] = useState<Tab>(settings.defaultTab);
  const [collapsed, setCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebarCollapsed');
    return saved === 'true';
  });
  const [profileOpen, setProfileOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [showAddCard, setShowAddCard] = useState(false);
  const [showAddEmail, setShowAddEmail] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedSearch, setSelectedSearch] = useState<string | null>(null);
  const [activeEmailCategory, setActiveEmailCategory] = useState<string | null>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const { permission } = useNotification();

  // Notification center
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  const unreadCount = useLiveQuery(async () => {
    if (!user) return 0;
    return await dbLocal.notifications
      .where('userId').equals(user.uid)
      .and(n => !n.readAt)
      .count();
  }, [user]) || 0;

  const handleNewNotification = useCallback(() => {
    // Queries will auto-update via useLiveQuery
  }, []);

  const handleSelectRecord = useCallback((recordId: string, collection: 'cards' | 'emails') => {
    setTab(collection);
    setSelectedSearch(recordId);
  }, []);

  useAlarmPoller({ userId: user?.uid, onNewNotification: handleNewNotification });

  useEffect(() => {
    if (!loading && !user) navigate('/', { replace: true });
  }, [user, loading, navigate]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleImported = () => setRefreshKey((k) => k + 1);
  const handleAdded = () => setRefreshKey((k) => k + 1);
  const handleLogout = () => { setProfileOpen(false); signOut(auth); };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#f5f5f7] dark:bg-[#0f0f17]">
      <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
    </div>
  );
  if (!user) return null;

  const navItems: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'cards', label: 'Cards', icon: <CreditCard size={15} /> },
    { id: 'emails', label: 'Emails', icon: <Mail size={15} /> },
  ];

  return (
    <div className="h-screen bg-[#f5f5f7] dark:bg-[#0f0f17] flex overflow-hidden p-4 gap-4 leading-normal">

      {/* ── Sidebar ── */}
      <motion.aside
        initial={false}
        animate={{ width: collapsed ? 64 : 192 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col shrink-0 overflow-visible relative h-full z-[40]"
      >
        <div className="flex flex-col flex-1 rounded-2xl">
          {/* Logo / Toggle button */}
          <button
            onClick={() => {
              const next = !collapsed;
              setCollapsed(next);
              localStorage.setItem('sidebarCollapsed', String(next));
            }}
            className="group flex items-center border-b border-gray-100 px-3.5 py-3 gap-3.5 min-h-[56px] w-full hover:bg-gray-50 transition-colors text-left"
          >
            <div className="w-8 h-8 bg-white group-hover:bg-gray-50 rounded-lg flex items-center justify-center shrink-0 transition-colors overflow-hidden border border-gray-100">
              <img src="logo.png" alt="Logo" className="w-full h-full object-cover group-hover:hidden" />
              <div className="hidden group-hover:flex">
                {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
              </div>
            </div>
            <AnimatePresence mode="popLayout">
              {!collapsed && (
                <motion.span
                  initial={{ opacity: 0, x: -5 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -5 }}
                  transition={{ duration: 0.15 }}
                  className="text-[15px] font-bold text-gray-900 tracking-tight flex-1 truncate whitespace-nowrap"
                >
                  Reyna
                </motion.span>
              )}
            </AnimatePresence>
          </button>

          {/* Navigation Items */}
          <nav className="flex-1 p-2 space-y-1">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setTab(item.id)}
                className={`w-full flex items-center rounded-xl text-[13px] font-medium transition-all gap-3.5 px-3 py-2.5 ${tab === item.id
                  ? 'bg-gray-900 text-white shadow-md'
                  : 'text-gray-400 hover:bg-gray-50 hover:text-gray-700'
                  }`}
              >
                <div className="w-5 h-5 flex items-center justify-center shrink-0">
                  {item.icon}
                </div>
                <AnimatePresence mode="popLayout">
                  {!collapsed && (
                    <motion.span
                      initial={{ opacity: 0, width: 0 }}
                      animate={{ opacity: 1, width: 'auto' }}
                      exit={{ opacity: 0, width: 0 }}
                      transition={{ duration: 0.15 }}
                      className="whitespace-nowrap overflow-hidden"
                    >
                      {item.label}
                    </motion.span>
                  )}
                </AnimatePresence>
              </button>
            ))}

            <SidebarCategories
              collapsed={collapsed}
              activeTab={tab}
              onTabChange={setTab}
              activeCategory={activeEmailCategory}
              onSelectCategory={(id) => {
                setActiveEmailCategory(id);
                if (id !== null) setTab('categories');
              }}
            />
          </nav>
        </div>

        {/* Lock App Button */}
        {hasPin && (
          <div className="px-2 pb-1 shrink-0 relative">
            <button
              onClick={lockNow}
              className="w-full flex items-center rounded-xl text-[13px] font-medium transition-all gap-3.5 px-3 py-2.5 text-gray-400 hover:bg-red-50 hover:text-red-500"
            >
              <div className="w-5 h-5 flex items-center justify-center shrink-0">
                <Lock size={16} />
              </div>
              <AnimatePresence mode="popLayout">
                {!collapsed && (
                  <motion.span
                    initial={{ opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: 'auto' }}
                    exit={{ opacity: 0, width: 0 }}
                    transition={{ duration: 0.15 }}
                    className="whitespace-nowrap overflow-hidden text-left"
                  >
                    Khóa ngay
                  </motion.span>
                )}
              </AnimatePresence>
            </button>
          </div>
        )}

        {/* Notifications Button */}
        <div ref={notifRef} className="px-2 pb-1 shrink-0 relative">
          <button
            onClick={() => setNotifOpen(o => !o)}
            className={`w-full flex items-center rounded-xl text-[13px] font-medium transition-all gap-3.5 px-3 py-2.5 ${notifOpen ? 'bg-amber-50 text-amber-600' : 'text-gray-400 hover:bg-gray-50 hover:text-gray-700'}`}
          >
            <div className="w-5 h-5 flex items-center justify-center shrink-0 relative">
              <Bell size={16} />
              {unreadCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-[16px] px-1 text-[9px] font-bold bg-amber-500 text-white rounded-full flex items-center justify-center border-2 border-white">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </div>
            <AnimatePresence mode="popLayout">
              {!collapsed && (
                <motion.span
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: 'auto' }}
                  exit={{ opacity: 0, width: 0 }}
                  transition={{ duration: 0.15 }}
                  className="whitespace-nowrap overflow-hidden"
                >
                  Thông báo
                </motion.span>
              )}
            </AnimatePresence>
          </button>
          <AnimatePresence>
            {notifOpen && user && (
              <NotificationCenter
                userId={user.uid}
                onClose={() => setNotifOpen(false)}
                onSelectRecord={handleSelectRecord}
              />
            )}
          </AnimatePresence>
        </div>

        {/* User Profile Section */}
        <div ref={profileRef} className="border-t border-gray-50 p-2 shrink-0 relative">
          <button
            onClick={() => setProfileOpen((o) => !o)}
            className={`w-full flex items-center rounded-xl gap-3 px-2.5 py-2.5 text-[13px] font-medium text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors ${profileOpen ? 'bg-gray-100 text-gray-700' : ''}`}
          >
            <div className="w-6 h-6 bg-gray-100 rounded-full flex items-center justify-center shrink-0 border border-gray-200">
              <User size={14} />
            </div>
            <AnimatePresence mode="popLayout">
              {!collapsed && (
                <motion.span
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: 'auto' }}
                  exit={{ opacity: 0, width: 0 }}
                  transition={{ duration: 0.15 }}
                  className="flex-1 text-left text-[12px] font-semibold text-gray-600 truncate whitespace-nowrap"
                >
                  {user.email?.split('@')[0]}
                </motion.span>
              )}
            </AnimatePresence>
          </button>

          {profileOpen && (
            <div className="absolute bottom-full left-0 mb-2 w-56 bg-white dark:bg-[#1c1c28] border border-gray-100 rounded-xl shadow-2xl z-50 overflow-hidden">
              <div className="px-3 py-3 border-b border-gray-50 bg-gray-50/50 dark:bg-[#23233a]/50">
                <p className="text-[10px] uppercase font-bold text-gray-400 mb-0.5">Tài khoản</p>
                <p className="text-[12px] font-bold text-gray-800 truncate">{user.email}</p>
              </div>
              <button onClick={() => toggleVisibility()} className="w-full flex items-center gap-3 px-3 py-2.5 text-[13px] text-gray-600 hover:bg-gray-50 transition-colors">
                {isVisible ? <Eye size={14} className="text-blue-500" /> : <EyeOff size={14} />}
                {isVisible ? 'Ẩn thông tin nhạy cảm' : 'Hiện thông tin nhạy cảm'}
              </button>
              <button onClick={() => { setProfileOpen(false); setShowSettings(true); }} className="w-full flex items-center gap-3 px-3 py-2.5 text-[13px] text-gray-600 hover:bg-gray-50 transition-colors">
                <Settings size={14} />
                Cài đặt ứng dụng
              </button>
              <div className="h-px bg-gray-50 mx-2" />
              <button onClick={handleLogout} className="w-full flex items-center gap-3 px-3 py-2.5 text-[13px] text-red-500 font-medium hover:bg-red-50 transition-colors">
                <LogOut size={14} />
                Đăng xuất
              </button>
            </div>
          )}
        </div>
      </motion.aside>

      {/* ── Main Content ── */}
      <main className="flex-1 bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col min-h-0 overflow-hidden">
        {/* Table Toolbar */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-100 shrink-0 relative z-[20]">
          <div id="table-toolbar-slot" className="flex items-center gap-2" />
          <div id="table-filter-slot" className="flex items-center gap-2 flex-1 justify-end" />
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowQuickAdd(true)}
              className="flex items-center gap-1.5 h-8 px-3 text-[12px] font-medium text-purple-700 bg-purple-50 border border-purple-100 rounded-lg hover:bg-purple-100 transition-colors whitespace-nowrap"
            >
              <Zap size={12} /> <span className="hidden sm:inline">Add</span>
            </button>
          </div>
        </div>

        {/* Dynamic Table Content */}
        <div className="flex-1 flex flex-col min-h-0">
          {tab === 'cards' ? (
            <CardsTable
              refreshKey={refreshKey}
              searchQuery={selectedSearch ?? undefined}
              onSearchChange={() => setSelectedSearch(null)}
            />
          ) : tab === 'emails' ? (
            <EmailsTable
              refreshKey={refreshKey}
              searchQuery={selectedSearch ?? undefined}
              onSearchChange={() => setSelectedSearch(null)}
            />
          ) : (
            <CategoryExplorer
              activeCategoryId={activeEmailCategory}
            />
          )}
        </div>
      </main>

      {/* Modals */}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {showQuickAdd && <QuickAddModal mode={tab === 'categories' ? 'emails' : tab} onClose={() => setShowQuickAdd(false)} onImported={handleImported} />}
      {showAddCard && <AddCardModal onClose={() => setShowAddCard(false)} onAdded={handleAdded} />}
      {showAddEmail && <AddEmailModal onClose={() => setShowAddEmail(false)} onAdded={handleAdded} />}
    </div>
  );
}