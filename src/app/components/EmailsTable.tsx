import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  writeBatch,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../contexts/AuthContext';
import { useFirestoreSync } from '../hooks/useFirestoreSync';
import { dbLocal } from '../lib/db';
import { useVisibility } from '../../contexts/VisibilityContext';
import { maskEmail, maskPassword } from '../../utils/mask';
import { generateTOTP, getRemainingSeconds, getTOTPWindow } from '../../utils/totp';
import { copyToClipboard } from '../../utils/copy';
import { CopyCell } from './CopyCell';
import {
  Search, Filter, Plus, Edit2, Trash2, X, Check, Copy, MoreHorizontal,
  ChevronLeft, ChevronRight, Bookmark, Clock, ClipboardList, FilterX, Bell, ExternalLink, Key, Info, Zap, Loader2
} from 'lucide-react';
import { EmailDetailModal } from './EmailDetailModal';
import { StatusSelect } from './StatusSelect';
import { NoteInput } from './NoteInput';
import { Pagination } from './Pagination';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import { useAlarms } from '../hooks/useAlarms';
import { AlarmRecord } from '../lib/db';
import { TimerModal } from './TimerModal';
import { AlarmCell } from './AlarmCell';

export interface EmailRecord {
  id: string;
  userId: string;
  email: string;
  password: string;
  secret2FA: string;
  recoveryEmail?: string;
  phone?: string;
  status?: string;
  note?: string;
  liveStatus?: string;
  bookmarked?: boolean;
}

interface EmailsTableProps {
  refreshKey?: number;
  searchQuery?: string;
  onSearchChange?: (val: string) => void;
}

/** Format a single email record for quick-copy: fields separated by 2 spaces */
function formatEmailCopy(rec: EmailRecord): string {
  const parts: string[] = [rec.email, rec.password];
  if (rec.secret2FA?.trim()) parts.push(rec.secret2FA.trim());
  return parts.join('  ');
}

const TOAST_STYLE = {
  background: '#1d1d1f',
  color: '#fff',
  fontSize: '12px',
  padding: '6px 14px',
  borderRadius: '8px',
  boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
  minWidth: 'unset',
  width: 'auto',
  border: 'none',
};

export function EmailsTable({ refreshKey, searchQuery, onSearchChange }: EmailsTableProps) {
  const { user } = useAuth();
  const { isVisible } = useVisibility();
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const selectAllRef = useRef<HTMLInputElement>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [batchCopied, setBatchCopied] = useState(false);
  const [checkingLive, setCheckingLive] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [totpCodes, setTotpCodes] = useState<Record<string, string>>({});
  const [remaining, setRemaining] = useState(getRemainingSeconds());
  const windowRef = useRef(getTOTPWindow());
  const emailsRef = useRef<EmailRecord[]>([]);

  // Detail modal
  const [detailRecord, setDetailRecord] = useState<EmailRecord | null>(null);

  // Inline editing
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<EmailRecord>>({});
  const [savingEdit, setSavingEdit] = useState(false);

  // Per-row delete confirmation
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [showBatchConfirm, setShowBatchConfirm] = useState(false);

  // Timer modal
  const [timerEmailId, setTimerEmailId] = useState<string | null>(null);
  const [timerAlarms, setTimerAlarms] = useState<AlarmRecord[]>([]);
  const [alarmRefreshTick, setAlarmRefreshTick] = useState(0);
  const [now, setNow] = useState(Date.now());
  const { addAlarm, deleteAlarm, getAlarmsForRecord, markAsDone, nearestAlarmsMap } = useAlarms({ userId: user?.uid });

  const openTimer = async (emailId: string) => {
    const alarms = await getAlarmsForRecord(emailId);
    setTimerAlarms(alarms);
    setTimerEmailId(emailId);
  };

  const handleAlarmDone = async (recordId: string) => {
    const alarms = await getAlarmsForRecord(recordId);
    if (alarms.length === 0) return;
    const pending = alarms.filter(a => !a.doneAt).sort((a, b) => a.triggerAt - b.triggerAt);
    if (pending.length > 0) {
      await markAsDone(pending[0].id);
      setAlarmRefreshTick(t => t + 1);
    }
  };

  // Sync clock every second
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const [filters, setFilters] = useState({
    search: '',
    status: '',
    note: '',
    bookmarked: false,
    hasAlarm: false,
  });

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Reset to first page when any filter changes for instant search
  useEffect(() => {
    setCurrentPage(1);
  }, [filters]);

  // Sync with external search query (e.g. from notification click)
  useEffect(() => {
    if (searchQuery) {
      setFilters(prev => ({ ...prev, search: searchQuery }));
      onSearchChange?.(searchQuery);
    }
  }, [searchQuery, onSearchChange]);

  const handleCopied = useCallback((id: string) => {
    setCopiedId(id);
  }, []);

  // Replace manual loading/onSnapshot with useFirestoreSync hook
  const {
    data: emails,
    loading: initialLoading,
    syncing,
    refresh
  } = useFirestoreSync<EmailRecord>('emails', refreshKey);

  // Set loading state
  useEffect(() => {
    if (!initialLoading) setLoading(false);
  }, [initialLoading]);

  // Keep detailRecord in sync when Firestore pushes updates
  useEffect(() => {
    if (detailRecord) {
      const updated = emails.find((e) => e.id === detailRecord.id);
      if (updated) setDetailRecord(updated);
      else setDetailRecord(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emails]);

  // Generate TOTP codes — merges into existing state so old code stays visible while recomputing
  const refreshCodes = useCallback(async (emailList: EmailRecord[]) => {
    const codes: Record<string, string> = {};
    await Promise.all(
      emailList.map(async (e) => {
        if (e.secret2FA) {
          const code = await generateTOTP(e.secret2FA);
          if (code) codes[e.id] = code;
        }
      })
    );
    // Merge: keeps old codes visible until the new ones are ready
    setTotpCodes(prev => ({ ...prev, ...codes }));
  }, []);

  useEffect(() => {
    refreshCodes(emails);
  }, [emails, refreshCodes]);

  // Keep emailsRef up-to-date so the interval never has a stale closure
  useEffect(() => { emailsRef.current = emails; }, [emails]);

  // Update timer every second; refresh codes on window change
  useEffect(() => {
    const interval = setInterval(() => {
      const sec = getRemainingSeconds();
      const win = getTOTPWindow();
      setRemaining(sec);
      if (win !== windowRef.current) {
        windowRef.current = win;
        // Always use the freshest emails list via ref
        refreshCodes(emailsRef.current);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [refreshCodes]);

  // Filter logic
  const filteredEmails = emails.filter((email) => {
    const s = filters.search.toLowerCase();
    const matchesSearch = !s || email.id.toLowerCase() === s || [
      email.email,
      email.password,
      email.status,
      email.note,
      email.recoveryEmail,
      email.phone
    ].some(v => v?.toLowerCase().includes(s));

    const matchesStatus = !filters.status || email.status?.toLowerCase().includes(filters.status.toLowerCase());
    const matchesNote = !filters.note || email.note?.toLowerCase().includes(filters.note.toLowerCase());
    const matchesBookmarked = !filters.bookmarked || email.bookmarked === true;
    const matchesHasAlarm = !filters.hasAlarm || nearestAlarmsMap.has(email.id);

    return matchesSearch && matchesStatus && matchesNote && matchesBookmarked && matchesHasAlarm;
  });

  // Pagination logic
  // \u2500\u2500 Sort state \u2500\u2500
  type SortCol = 'email' | 'status' | 'timer';
  const [sortCol, setSortCol] = useState<SortCol | null>('timer');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const handleSort = (col: SortCol) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
    setCurrentPage(1);
  };

  const filteredIdsString = useMemo(() => filteredEmails.map((e: EmailRecord) => e.id).sort().join(','), [filteredEmails]);

  const sortedIds = useMemo(() => {
    return [...filteredEmails].sort((a, b) => {
      if (!sortCol) return 0;
      let cmp = 0;
      if (sortCol === 'timer') {
        const aTime = nearestAlarmsMap.get(a.id) ?? Infinity;
        const bTime = nearestAlarmsMap.get(b.id) ?? Infinity;
        if (aTime === bTime) return a.id.localeCompare(b.id);
        cmp = aTime - bTime;
      } else if (sortCol === 'email') cmp = (a.email || '').localeCompare(b.email || '');
      else if (sortCol === 'status') cmp = (a.status || '').localeCompare(b.status || '');
      return sortDir === 'asc' ? cmp : -cmp;
    }).map((e: EmailRecord) => e.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredIdsString, sortCol, sortDir]);

  const sortedEmails = useMemo(() => {
    const map = new Map(filteredEmails.map((e: EmailRecord) => [e.id, e]));
    return sortedIds.map((id: string) => map.get(id)).filter(Boolean) as EmailRecord[];
  }, [sortedIds, filteredEmails]);

  const totalItems = sortedEmails.length;
  const paginatedEmails = sortedEmails.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Select-all scoped to current page only
  const allSelected = paginatedEmails.length > 0 && paginatedEmails.every(e => selectedIds.has(e.id));
  const someSelected = selectedIds.size > 0 && !allSelected;

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someSelected;
    }
  }, [someSelected]);

  // Gmail-style: any selected → deselect all; none → select current page
  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size > 0) setSelectedIds(new Set());
    else setSelectedIds(new Set(paginatedEmails.map((e) => e.id)));
  }, [selectedIds.size, paginatedEmails]);

  /** Find the id of the row just above the topmost item in `ids` */
  const getRowAbove = useCallback((ids: Set<string>) => {
    let minIdx = emails.length;
    ids.forEach((id) => {
      const idx = emails.findIndex((e) => e.id === id);
      if (idx >= 0 && idx < minIdx) minIdx = idx;
    });
    if (minIdx > 0) return emails[minIdx - 1].id;
    const remaining = emails.filter((e) => !ids.has(e.id));
    return remaining.length > 0 ? remaining[0].id : null;
  }, [emails]);

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    setDeleting(true);
    const nextId = getRowAbove(selectedIds);
    try {
      const idsArr = [...selectedIds];
      try {
        const batch = writeBatch(db);
        idsArr.forEach((id) =>
          batch.update(doc(db, 'emails', id), {
            deleted: true,
            updatedAt: serverTimestamp(),
          })
        );
        await batch.commit();
      } catch (firestoreErr: any) {
        if (firestoreErr?.code !== 'not-found') throw firestoreErr;
      }
      await dbLocal.emails.bulkDelete(idsArr);
      setSelectedIds(nextId ? new Set([nextId]) : new Set());
      refresh();
    } catch (err: any) {
      console.error('[EmailsTable] Batch delete error:', err?.code, err?.message);
    } finally {
      setDeleting(false);
      setShowBatchConfirm(false);
    }
  };

  const handleDeleteOne = async (id: string) => {
    if (!user) return;
    const nextId = getRowAbove(new Set([id]));
    try {
      try {
        await updateDoc(doc(db, 'emails', id), {
          deleted: true,
          updatedAt: serverTimestamp(),
        });
      } catch (firestoreErr: any) {
        if (firestoreErr?.code !== 'not-found') throw firestoreErr;
      }
      await dbLocal.emails.delete(id);
      setSelectedIds(nextId ? new Set([nextId]) : new Set());
      refresh();
    } catch (err: any) {
      console.error('[EmailsTable] Delete error:', err?.code, err?.message);
    }
  };

  // Quick-copy one row
  const handleQuickCopy = async (e: React.MouseEvent, rec: EmailRecord) => {
    e.stopPropagation();
    const text = formatEmailCopy(rec);
    const ok = await copyToClipboard(text);
    if (ok) {
      handleCopied(rec.id);
      toast('Copied!', { duration: 1200, position: 'bottom-center', style: TOAST_STYLE });
    }
  };

  // Batch-copy selected rows
  const handleBatchCopy = async () => {
    const selected = emails.filter((e) => selectedIds.has(e.id));
    if (!selected.length) return;
    const text = selected.map(formatEmailCopy).join('\n');
    const ok = await copyToClipboard(text);
    if (ok) {
      setBatchCopied(true);
      setTimeout(() => setBatchCopied(false), 2000);
      toast(`Copied ${selected.length} email${selected.length > 1 ? 's' : ''}!`, {
        duration: 1400,
        position: 'bottom-center',
        style: TOAST_STYLE,
      });
    }
  };

  // Batch Verify Emails
  const handleCheckLive = async () => {
    const selected = emails.filter((e) => selectedIds.has(e.id));
    if (!selected.length) return;
    setCheckingLive(true);
    let successCount = 0;

    for (const rec of selected) {
      if (!rec.email) continue;
      try {
        const targetUrl = `https://gamalogic.com/emailvrf/?emailid=${encodeURIComponent(rec.email)}&apikey=1ud7zt0id4fuayde2mj2bkvv0jny54n4&speed_rank=0`;
        const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`;
        const res = await fetch(proxyUrl);
        const data = await res.json();
        const vrfy = data?.gamalogic_emailid_vrfy?.[0];
        if (vrfy) {
          const liveStatus = vrfy.message || (vrfy.is_valid ? 'Valid ID' : 'Invalid');
          await updateDoc(doc(db, 'emails', rec.id), {
            liveStatus,
            updatedAt: serverTimestamp()
          });
          successCount++;
        }
      } catch (e) {
        console.error('[EmailsTable] Gamalogic API error for', rec.email, e);
      }
    }

    setCheckingLive(false);
    toast(`${successCount}/${selected.length} emails checked!`, {
      duration: 2000,
      position: 'bottom-center',
      style: TOAST_STYLE,
    });
  };

  // Inline edit helpers
  const startEditing = (rec: EmailRecord) => {
    setEditingId(rec.id);
    setEditForm({ email: rec.email, password: rec.password, secret2FA: rec.secret2FA });
  };

  const cancelEditing = () => { setEditingId(null); setEditForm({}); };

  const commitEdit = async () => {
    if (!editingId || !user) return;
    setSavingEdit(true);
    try {
      await updateDoc(doc(db, 'emails', editingId), {
        email: editForm.email ?? '',
        password: editForm.password ?? '',
        secret2FA: editForm.secret2FA ?? '',
        updatedAt: serverTimestamp(),
      });
      setEditingId(null);
      setEditForm({});
    } catch (err: any) {
      if (err?.code === 'not-found') {
        await dbLocal.emails.delete(editingId);
        setEditingId(null);
        setEditForm({});
        refresh();
      } else {
        console.error('[EmailsTable] Update error:', err?.code, err?.message);
      }
    } finally {
      setSavingEdit(false);
    }
  };

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); commitEdit(); }
    if (e.key === 'Escape') { e.preventDefault(); cancelEditing(); }
  };

  // Dismiss single-row delete confirm: auto-reset after 3s OR click anywhere outside the confirm button
  useEffect(() => {
    if (!confirmDeleteId) return;
    const timer = setTimeout(() => setConfirmDeleteId(null), 3000);
    const handleDocClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('[data-delete-confirm]')) return;
      setConfirmDeleteId(null);
    };
    const rafId = requestAnimationFrame(() => {
      document.addEventListener('click', handleDocClick, true);
    });
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(rafId);
      document.removeEventListener('click', handleDocClick, true);
    };
  }, [confirmDeleteId]);

  const getEmailDisplay = (rec: EmailRecord) => {
    const revealed = isVisible || hoveredId === rec.id;
    return revealed ? rec.email : maskEmail(rec.email);
  };

  const getPasswordDisplay = (rec: EmailRecord) => {
    const revealed = isVisible || hoveredId === rec.id;
    return revealed ? rec.password : maskPassword(rec.password || '');
  };

  // ── Inline field update (status / note) ──
  const updateField = async (id: string, field: string, value: string | boolean) => {
    try {
      await updateDoc(doc(db, 'emails', id), {
        [field]: value,
        updatedAt: serverTimestamp()
      });
    } catch (err: any) {
      if (err?.code === 'not-found') {
        await dbLocal.emails.delete(id);
        refresh();
      } else {
        console.error('[EmailsTable] updateField error:', err?.code, err?.message);
      }
    }
  };

  // ── Toggle bookmark ──
  const toggleBookmark = async (rec: EmailRecord) => {
    const next = !rec.bookmarked;
    // Optimistic local update
    await dbLocal.emails.update(rec.id, { bookmarked: next } as any);
    refresh();
    try {
      await updateDoc(doc(db, 'emails', rec.id), { bookmarked: next, updatedAt: serverTimestamp() });
    } catch (err: any) {
      if (err?.code === 'not-found') {
        await dbLocal.emails.delete(rec.id);
        refresh();
      }
    }
  };

  // Progress bar color
  const progressPct = (remaining / 30) * 100;
  const progressColor =
    remaining <= 5 ? 'bg-red-400' : remaining <= 10 ? 'bg-orange-400' : 'bg-green-400';

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-400 text-[13px]">
        Loading...
      </div>
    );
  }

  const toolbarSlot = document.getElementById('table-toolbar-slot');
  const filterSlot = document.getElementById('table-filter-slot');

  const filterUI = (
    <div className="flex items-center gap-1.5">
      <input
        value={filters.search}
        onChange={(e) => setFilters(f => ({ ...f, search: e.target.value }))}
        placeholder="Search..."
        className="w-32 h-7 px-2 text-[11px] border border-gray-100 rounded-md focus:outline-none focus:border-gray-300 transition-colors"
      />
      <div className="scale-90 origin-left -mr-2">
        <StatusSelect
          value={filters.status}
          onChange={(val) => setFilters(f => ({ ...f, status: val }))}
        />
      </div>
      <input
        value={filters.note}
        onChange={(e) => setFilters(f => ({ ...f, note: e.target.value }))}
        placeholder="Note"
        className="w-24 h-7 px-2 text-[11px] border border-gray-100 rounded-md focus:outline-none focus:border-gray-300 transition-colors"
      />
      <div className="flex items-center gap-0.5 ml-1">
        {/* Bookmark filter toggle */}
        <button
          onClick={() => { setFilters(f => ({ ...f, bookmarked: !f.bookmarked })); setCurrentPage(1); }}
          title={filters.bookmarked ? 'Show all' : 'Show bookmarked only'}
          className={`w-7 h-7 flex items-center justify-center rounded-lg transition-colors ${filters.bookmarked
            ? 'text-amber-500 bg-amber-50'
            : 'text-gray-400 hover:bg-gray-100 hover:text-amber-500'
            }`}
        >
          <Bookmark size={14} fill={filters.bookmarked ? 'currentColor' : 'none'} />
        </button>
        {/* Clear Filters */}
        <button
          onClick={() => {
            setFilters({
              search: '',
              status: '',
              note: '',
              bookmarked: false,
              hasAlarm: false,
            });
            setCurrentPage(1);
          }}
          disabled={!Object.values(filters).some(v => v !== '' && v !== false)}
          title="Clear filters"
          className={`w-7 h-7 flex items-center justify-center rounded-lg transition-colors ${!Object.values(filters).some(v => v !== '' && v !== false)
            ? 'text-gray-200 cursor-default'
            : 'text-gray-400 hover:bg-gray-100 hover:text-red-500'
            }`}
        >
          <FilterX size={14} />
        </button>

        <button
          onClick={() => setFilters(f => ({ ...f, hasAlarm: !f.hasAlarm }))}
          title={filters.hasAlarm ? "Hiện tất cả" : "Chỉ hiện có hẹn giờ"}
          className={`w-7 h-7 flex items-center justify-center rounded-lg transition-colors ${filters.hasAlarm ? 'bg-amber-100 text-amber-600' : 'text-gray-400 hover:bg-gray-100 hover:text-amber-500'
            }`}
        >
          <Bell size={14} className={filters.hasAlarm ? "animate-pulse" : ""} />
        </button>
      </div>
    </div>
  );

  const toolbar = (
    <div className="flex items-center gap-2">
      <div className={`w-6 h-6 rounded-md flex items-center justify-center transition-colors ${selectedIds.size > 0 ? 'bg-blue-100' : 'bg-gray-200'
        }`}>
        <span className={`text-[11px] font-semibold tabular-nums ${selectedIds.size > 0 ? 'text-blue-700' : 'text-gray-700'
          }`}>{selectedIds.size}</span>
      </div>
      <div className="w-px h-4 bg-gray-200 mx-1" />
      <button onClick={handleCheckLive} disabled={selectedIds.size === 0 || checkingLive} title="Verify Email LIVE Status"
        className={`w-7 h-7 flex items-center justify-center rounded-lg transition-colors ${checkingLive ? 'text-blue-500 animate-pulse' : selectedIds.size === 0 ? 'text-gray-200 cursor-default' : 'text-gray-500 hover:bg-gray-100 hover:text-blue-600'
          }`}>
        {checkingLive ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />}
      </button>
      <button onClick={handleBatchCopy} disabled={selectedIds.size === 0} title="Copy selected rows"
        className={`w-7 h-7 flex items-center justify-center rounded-lg transition-colors ${batchCopied ? 'bg-emerald-500 text-white' : selectedIds.size === 0 ? 'text-gray-200 cursor-default' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
          }`}>
        {batchCopied ? <Check size={13} /> : <ClipboardList size={13} />}
      </button>
      {showBatchConfirm ? (
        <div className="flex items-center gap-1">
          <button onClick={handleDeleteSelected} disabled={deleting} title="Confirm delete"
            className="w-7 h-7 flex items-center justify-center rounded-lg bg-red-500 hover:bg-red-600 text-white transition-colors disabled:opacity-50">
            <Check size={13} />
          </button>
          <button onClick={() => setShowBatchConfirm(false)} title="Cancel"
            className="w-7 h-7 flex items-center justify-center rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors">
            <X size={13} />
          </button>
        </div>
      ) : (
        <button onClick={() => { if (selectedIds.size > 0) setShowBatchConfirm(true); }} disabled={selectedIds.size === 0} title="Delete selected"
          className={`w-7 h-7 flex items-center justify-center rounded-lg transition-colors ${selectedIds.size === 0 ? 'text-gray-200 cursor-default' : 'text-gray-500 hover:bg-red-50 hover:text-red-500'
            }`}>
          <Trash2 size={13} />
        </button>
      )}
    </div>
  );

  // Render table content
  const tableRows = paginatedEmails.map((rec) => {
    const isHovered = hoveredId === rec.id;
    const isSelected = selectedIds.has(rec.id);
    const isCopied = copiedId === rec.id;
    const totpCode = totpCodes[rec.id] || '';
    const isEditing = editingId === rec.id;

    const rowBg = isCopied
      ? 'bg-blue-100'
      : isEditing
        ? 'bg-amber-50'
        : isSelected
          ? 'bg-blue-50'
          : isHovered
            ? 'bg-gray-50'
            : 'bg-white';

    return (
      <motion.tr
        key={rec.id}
        layout
        initial={{ opacity: 1, height: 44 }}
        exit={{ opacity: 0, height: 0, overflow: 'hidden' }}
        transition={{ duration: 0.25, ease: 'easeInOut' }}
        className={`border-b border-gray-50 h-11 transition-colors ${rowBg} group/row cursor-pointer`}
        onMouseEnter={() => !isEditing && setHoveredId(rec.id)}
        onMouseLeave={() => setHoveredId(null)}
        onClick={() => { if (!isEditing) { setSelectedIds(new Set([rec.id])); setConfirmDeleteId(null); } }}
        onDoubleClick={(e) => {
          if (!isEditing) {
            e.stopPropagation();
            startEditing(rec);
          }
        }}
      >
        {/* Checkbox */}
        <td className="px-2 py-0 text-center" onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(null); }}>
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => toggleSelect(rec.id)}
            className="w-3.5 h-3.5 rounded border-gray-300 accent-gray-700 cursor-pointer"
          />
        </td>

        {/* Email */}
        {isEditing ? (
          <td className="px-4 py-0">
            <input
              autoFocus
              value={editForm.email ?? ''}
              onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
              onKeyDown={handleEditKeyDown}
              placeholder="email@example.com"
              className="w-full h-7 px-2 text-[13px] text-gray-800 bg-white border border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </td>
        ) : (
          <CopyCell
            value={rec.email}
            tdClassName="px-0 py-0"
            className="px-4 h-11"
            onCopied={() => handleCopied(rec.id)}
            onSelect={() => setSelectedIds(new Set([rec.id]))}
          >
            <span className="truncate text-[13px] text-gray-800">
              {getEmailDisplay(rec)}
            </span>
          </CopyCell>
        )}

        {/* Password */}
        {isEditing ? (
          <td className="px-4 py-0">
            <input
              value={editForm.password ?? ''}
              onChange={(e) => setEditForm((f) => ({ ...f, password: e.target.value }))}
              onKeyDown={handleEditKeyDown}
              placeholder="Password"
              className="w-full h-7 px-2 text-[13px] font-mono text-gray-800 bg-white border border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </td>
        ) : (
          <CopyCell
            value={rec.password}
            tdClassName="px-0 py-0"
            className="px-4 h-11"
            onCopied={() => handleCopied(rec.id)}
            onSelect={() => setSelectedIds(new Set([rec.id]))}
          >
            <span className="truncate text-[13px] text-gray-700 font-mono">
              {getPasswordDisplay(rec)}
            </span>
          </CopyCell>
        )}

        {/* 2FA Code */}
        {isEditing ? (
          <td className="px-4 py-0">
            <input
              value={editForm.secret2FA ?? ''}
              onChange={(e) => setEditForm((f) => ({ ...f, secret2FA: e.target.value }))}
              onKeyDown={handleEditKeyDown}
              placeholder="2FA secret"
              className="w-full h-7 px-2 text-[13px] font-mono text-gray-800 bg-white border border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </td>
        ) : rec.secret2FA ? (
          <CopyCell
            value={totpCode}
            tdClassName="px-0 py-0"
            className="px-4 h-11"
            onCopied={() => handleCopied(rec.id)}
            onSelect={() => setSelectedIds(new Set([rec.id]))}
          >
            <span className="text-[14px] text-blue-600 font-mono font-semibold tracking-widest">
              {totpCode || '------'}
            </span>
          </CopyCell>
        ) : (
          <td className="px-4 py-0 text-[13px] text-gray-300">-</td>
        )}

        {/* Status */}
        <td className="px-3 py-0">
          <StatusSelect
            value={rec.status ?? ''}
            onChange={(val) => updateField(rec.id, 'status', val)}
          />
        </td>

        {/* Live Status */}
        <td className="px-3 py-0 whitespace-nowrap">
          {rec.liveStatus ? (
            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium leading-none ${rec.liveStatus.toLowerCase().includes('valid') || rec.liveStatus.toLowerCase().includes('catch-all') || rec.liveStatus.toLowerCase().includes('ok')
              ? 'bg-green-100/80 text-green-700 border border-green-200/50'
              : 'bg-red-50 text-red-600 border border-red-100'
              }`}>
              {rec.liveStatus}
            </span>
          ) : (
            <span className="text-gray-300 text-[10px]">-</span>
          )}
        </td>

        {/* Timer cell — between Status/Live and Note */}
        <td className="py-0" onClick={e => e.stopPropagation()}>
          <AlarmCell
            recordId={rec.id}
            nearestAlarmTime={nearestAlarmsMap.get(rec.id) ?? null}
            now={now}
            onDone={handleAlarmDone}
            onClick={() => openTimer(rec.id)}
          />
        </td>

        {/* Note */}
        <td className="px-3 py-0">
          <NoteInput
            value={rec.note ?? ''}
            onSave={(val) => updateField(rec.id, 'note', val)}
          />
        </td>

        {/* Actions column */}
        {isEditing ? (
          <td className="px-2 py-0 text-right" onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(null); }}>
            <div className="inline-flex items-center gap-1">
              <button
                onClick={commitEdit}
                disabled={savingEdit}
                className="p-1 rounded hover:bg-emerald-100 text-emerald-600 transition-colors"
                title="Save"
              >
                <Check size={14} />
              </button>
              <button
                onClick={cancelEditing}
                className="p-1 rounded hover:bg-gray-200 text-gray-500 transition-colors"
                title="Cancel"
              >
                <X size={14} />
              </button>
            </div>
          </td>
        ) : (
          <td className="px-2 py-0 text-right" onClick={(e) => { e.stopPropagation(); setSelectedIds(new Set([rec.id])); setConfirmDeleteId(null); }}>
            <div className="inline-flex items-center gap-0.5">
              {confirmDeleteId === rec.id ? (
                <button
                  data-delete-confirm
                  onClick={(e) => { e.stopPropagation(); setSelectedIds(new Set([rec.id])); handleDeleteOne(rec.id); setConfirmDeleteId(null); }}
                  className="flex items-center gap-1 px-2 py-1 rounded bg-red-500 text-white text-[11px] hover:bg-red-600 transition-all"
                  title="Click to confirm delete"
                >
                  <Trash2 size={12} />
                  <span>Sure?</span>
                </button>
              ) : (
                <button
                  data-delete-confirm
                  onClick={(e) => { e.stopPropagation(); setSelectedIds(new Set([rec.id])); setConfirmDeleteId(rec.id); }}
                  className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                  title="Delete"
                >
                  <Trash2 size={14} />
                </button>
              )}
              <button
                onClick={() => setDetailRecord(rec)}
                className="p-1.5 rounded hover:bg-blue-50 text-gray-400 hover:text-blue-500 transition-colors"
                title="Info"
              >
                <Info size={14} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); toggleBookmark(rec); }}
                className={`p-1.5 rounded transition-colors ${rec.bookmarked
                  ? 'text-amber-500 hover:bg-amber-50'
                  : 'text-gray-400 hover:bg-amber-50 hover:text-amber-500'
                  }`}
                title={rec.bookmarked ? 'Remove bookmark' : 'Save for later'}
              >
                <Bookmark size={14} fill={rec.bookmarked ? 'currentColor' : 'none'} />
              </button>
              <button
                onClick={(e) => handleQuickCopy(e, rec)}
                className="p-1.5 rounded hover:bg-emerald-50 text-gray-400 hover:text-emerald-500 transition-colors"
                title="Copy"
              >
                <Copy size={14} />
              </button>
            </div>
          </td>
        )}
      </motion.tr>
    );
  });

  return (
    <>
      {toolbarSlot && createPortal(toolbar, toolbarSlot)}
      {filterSlot && createPortal(filterUI, filterSlot)}
      <div className="flex-1 flex flex-col min-h-0">
        {emails.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-300">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <polyline points="2,4 12,13 22,4" />
            </svg>
            <p className="mt-3 text-[13px] text-gray-400">No emails yet</p>
          </div>
        ) : (
          <div className="flex-1 min-h-0 flex flex-col">
            <div className="flex-1 min-h-0 overflow-auto">

              <table className="w-full min-w-[800px] table-fixed border-collapse">
                <colgroup>
                  <col style={{ width: '36px' }} />
                  <col className="w-[18%]" />
                  <col className="w-[12%]" />
                  <col className="w-[10%]" />
                  <col className="w-[9%]" />
                  <col className="w-[8%]" />
                  <col style={{ width: '80px' }} />
                  <col className="w-[13%]" />
                  <col style={{ width: '110px' }} />
                </colgroup>
                <thead className="sticky top-0 bg-white z-10">
                  <tr className="border-b border-gray-100">
                    <th className="px-2 py-2.5 text-center">
                      <input
                        ref={selectAllRef}
                        type="checkbox"
                        checked={allSelected}
                        onChange={toggleSelectAll}
                        className="w-3.5 h-3.5 rounded border-gray-300 accent-gray-700 cursor-pointer"
                      />
                    </th>
                    <th
                      onClick={() => handleSort('email')}
                      className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider cursor-pointer select-none hover:text-gray-600 group"
                    >
                      <span className="inline-flex items-center gap-1">
                        Email
                        <span className={`transition-opacity ${sortCol === 'email' ? 'opacity-100 text-gray-600' : 'opacity-0 group-hover:opacity-40'}`}>
                          {sortCol === 'email' && sortDir === 'desc' ? '▼' : '▲'}
                        </span>
                      </span>
                    </th>
                    <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                      Password
                    </th>
                    <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                      2FA Code
                    </th>
                    <th
                      onClick={() => handleSort('status')}
                      className="px-3 py-2.5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider cursor-pointer select-none hover:text-gray-600 group"
                    >
                      <span className="inline-flex items-center gap-1">
                        Status
                        <span className={`transition-opacity ${sortCol === 'status' ? 'opacity-100 text-gray-600' : 'opacity-0 group-hover:opacity-40'}`}>
                          {sortCol === 'status' && sortDir === 'desc' ? '▼' : '▲'}
                        </span>
                      </span>
                    </th>
                    <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                      Live
                    </th>
                    <th
                      className="px-1 py-1.5 text-center text-[11px] font-semibold text-gray-400 uppercase tracking-wider cursor-pointer select-none hover:text-gray-600 group"
                      onClick={() => handleSort('timer')}
                    >
                      <span className="inline-flex items-center gap-1">
                        Timer
                        <span className={`transition-opacity ${sortCol === 'timer' ? 'opacity-100 text-gray-600' : 'opacity-0 group-hover:opacity-40'}`}>
                          {sortCol === 'timer' && sortDir === 'desc' ? '▼' : '▲'}
                        </span>
                      </span>
                    </th>
                    <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                      Note
                    </th>
                    <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <AnimatePresence initial={false}>
                    {tableRows}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Footer count & Pagination */}
        {(emails.length > 0 || totalItems > 0) && (
          <div className="px-4 py-1 border-t border-gray-50 flex items-center justify-between min-h-[44px]">
            <div className="flex items-center gap-2 text-[11px] text-gray-300">
              <span>{totalItems} {totalItems === 1 ? 'email' : 'emails'} filtered</span>
              {editingId && (
                <span className="text-amber-500">- Enter to save - Esc to cancel</span>
              )}
              {!editingId && (
                <span className="text-gray-200">- Double-click row to edit - Click cell to copy</span>
              )}
            </div>

            {/* 2FA Timer bar - Integrated into footer */}
            {emails.some((e) => e.secret2FA) && (
              <div className="flex items-center gap-2 px-3 py-1 bg-white/50 dark:bg-gray-800/50 rounded-full border border-gray-100 dark:border-gray-700 shadow-sm">
                <span className="text-[10px] text-gray-400 dark:text-gray-300 font-medium uppercase tracking-tight">2FA</span>
                <div className="w-16 h-1 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${progressColor}`}
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                <span className={`text-[10px] font-mono font-bold ${remaining <= 5 ? 'text-red-500' : remaining <= 10 ? 'text-orange-500 text-orange-400 dark:text-orange-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                  {remaining}s
                </span>
              </div>
            )}

            <Pagination
              currentPage={currentPage}
              totalItems={totalItems}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setCurrentPage(1);
              }}
            />
          </div>
        )}


        {/* Email detail modal */}
        {detailRecord && (
          <EmailDetailModal
            record={detailRecord}
            totpCode={totpCodes[detailRecord.id]}
            onClose={() => setDetailRecord(null)}
            onUpdated={() => {
              // Data refreshes automatically via Firestore listener + sync useEffect above
            }}
          />
        )}
      </div>
      {/* Timer modal */}
      {timerEmailId && (() => {
        const rec = emails.find(e => e.id === timerEmailId);
        return (
          <TimerModal
            recordId={timerEmailId}
            collection="emails"
            label={rec?.email ?? timerEmailId}
            existingAlarms={timerAlarms}
            onAdd={async (alarm) => { await addAlarm(alarm); setAlarmRefreshTick(t => t + 1); }}
            onDelete={async (id) => { await deleteAlarm(id); setAlarmRefreshTick(t => t + 1); }}
            onClose={() => setTimerEmailId(null)}
          />
        );
      })()}
    </>
  );
}