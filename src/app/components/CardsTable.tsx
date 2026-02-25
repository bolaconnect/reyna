import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useUserSettings } from '../hooks/useUserSettings';
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
import { maskCardNumber, maskCVV, formatCardNumberSpaced, formatExpiry } from '../../utils/mask';
import { copyToClipboard } from '../../utils/copy';
import { CopyCell } from './CopyCell';
import {
  Search, Filter, Plus, Edit2, Trash2, X, Check, Copy, MoreHorizontal,
  ChevronLeft, ChevronRight, Bookmark, Clock, ClipboardList, FilterX, Bell, Info, AlarmClock
} from 'lucide-react';
import { CardDetailModal } from './CardDetailModal';
import { StatusSelect } from './StatusSelect';
import { NoteInput } from './NoteInput';
import { PrefixInput } from './PrefixInput';
import { Pagination } from './Pagination';
import { TimerModal } from './TimerModal';
import { AlarmCell } from './AlarmCell';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import { useAlarms } from '../hooks/useAlarms';
import { AlarmRecord } from '../lib/db';

export interface CardRecord {
  id: string;
  userId: string;
  cardNumber: string;
  expiryDate: string;
  cvv: string;
  cardholderName?: string;
  streetAddress?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
  phoneNumber?: string;
  email?: string;
  status?: string;
  note?: string;
  bookmarked?: boolean;
}

interface CardsTableProps {
  refreshKey?: number;
  searchQuery?: string;
  onSearchChange?: (val: string) => void;
}

/** Format a single card for quick-copy: fields separated by | */
function formatCardCopy(card: CardRecord): string {
  const parts: string[] = [
    card.cardNumber.replace(/\D/g, ''), // raw digits only
    formatExpiry(card.expiryDate),
    card.cvv,
  ];
  if (card.cardholderName?.trim()) parts.push(card.cardholderName.trim());
  return parts.join('|');
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

export function CardsTable({ refreshKey, searchQuery, onSearchChange }: CardsTableProps) {
  const { user } = useAuth();
  const { isVisible } = useVisibility();
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const selectAllRef = useRef<HTMLInputElement>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [batchCopied, setBatchCopied] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Detail modal
  const [detailCard, setDetailCard] = useState<CardRecord | null>(null);

  // Inline editing
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<CardRecord>>({});
  const [savingEdit, setSavingEdit] = useState(false);

  // Per-row delete confirmation
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [showBatchConfirm, setShowBatchConfirm] = useState(false);

  // Timer modal
  const [timerCardId, setTimerCardId] = useState<string | null>(null);
  const [timerAlarms, setTimerAlarms] = useState<AlarmRecord[]>([]);
  const [alarmRefreshTick, setAlarmRefreshTick] = useState(0);
  const [now, setNow] = useState(Date.now());
  const { addAlarm, deleteAlarm, getAlarmsForRecord, markAsDone, nearestAlarmsMap } = useAlarms({ userId: user?.uid });

  const openTimer = async (cardId: string) => {
    const alarms = await getAlarmsForRecord(cardId);
    setTimerAlarms(alarms);
    setTimerCardId(cardId);
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

  // Filter state
  const [filters, setFilters] = useState({
    search: '',
    prefix: '',
    suffix: '',
    expiry: '',
    cvv: '',
    status: '',
    note: '',
    bookmarked: false,
    hasAlarm: false,
  });

  const [currentPage, setCurrentPage] = useState(1);
  const { prefs: userPrefs, update: updatePrefs } = useUserSettings();
  const pageSize = userPrefs.pageSize;
  const setPageSize = (size: number) => { setCurrentPage(1); updatePrefs({ pageSize: size }); };

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

  /**
   * Mark a row as "just copied".
   * - Cancels the previous timer immediately (so clicking row B clears row A's blue right away).
   * - Sets the new row blue.
   * - Starts a fresh 3-second timer.
   */
  const handleCopied = useCallback((id: string) => {
    setCopiedId(id);
  }, []);

  // Replace manual loading/onSnapshot with useFirestoreSync hook
  const {
    data: cards,
    loading: initialLoading,
    syncing,
    refresh
  } = useFirestoreSync<CardRecord>('cards', refreshKey);

  // Set loading state
  useEffect(() => {
    if (!initialLoading) setLoading(false);
  }, [initialLoading]);

  // Keep detailCard in sync when Firestore pushes updates
  useEffect(() => {
    if (detailCard) {
      const updated = cards.find((c) => c.id === detailCard.id);
      if (updated) setDetailCard(updated);
      else setDetailCard(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards]);

  // Filter logic
  const filteredCards = cards.filter((card) => {
    const s = filters.search.toLowerCase();
    const matchesSearch = !s || card.id.toLowerCase() === s || [
      card.cardNumber,
      card.cardholderName,
      card.status,
      card.note,
      card.expiryDate,
      card.cvv
    ].some(v => v?.toLowerCase().includes(s));

    const matchesPrefix = !filters.prefix || card.cardNumber.startsWith(filters.prefix);
    const matchesSuffix = !filters.suffix || card.cardNumber.endsWith(filters.suffix);
    const matchesExpiry = !filters.expiry || formatExpiry(card.expiryDate).includes(filters.expiry);
    const matchesCvv = !filters.cvv || card.cvv.includes(filters.cvv);
    const matchesStatus = !filters.status || card.status?.toLowerCase().includes(filters.status.toLowerCase());
    const matchesNote = !filters.note || card.note?.toLowerCase().includes(filters.note.toLowerCase());
    const matchesBookmarked = !filters.bookmarked || card.bookmarked === true;
    const matchesHasAlarm = !filters.hasAlarm || nearestAlarmsMap.has(card.id);

    return matchesSearch && matchesPrefix && matchesSuffix && matchesExpiry && matchesCvv && matchesStatus && matchesNote && matchesBookmarked && matchesHasAlarm;
  });

  // ── Sort state ──
  type SortCol = 'cardNumber' | 'expiry' | 'cvv' | 'status' | 'timer';
  const [sortCol, setSortCol] = useState<SortCol | null>('timer');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const handleSort = (col: SortCol) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
    setCurrentPage(1);
  };

  const filteredIdsString = useMemo(() => filteredCards.map((c: CardRecord) => c.id).sort().join(','), [filteredCards]);

  const sortedIds = useMemo(() => {
    return [...filteredCards].sort((a, b) => {
      if (!sortCol) return 0;
      let cmp = 0;
      if (sortCol === 'timer') {
        const aTime = nearestAlarmsMap.get(a.id) ?? Infinity;
        const bTime = nearestAlarmsMap.get(b.id) ?? Infinity;
        if (aTime === bTime) return a.id.localeCompare(b.id);
        cmp = aTime - bTime;
      } else if (sortCol === 'cardNumber') {
        const aT = (a.cardNumber || '').replace(/\D/g, '').slice(-4);
        const bT = (b.cardNumber || '').replace(/\D/g, '').slice(-4);
        cmp = aT.localeCompare(bT);
      } else if (sortCol === 'expiry') {
        const parse = (s: string) => {
          const d = (s || '').replace(/\D/g, '');
          const mm = d.slice(0, 2).padStart(2, '0');
          const yy = d.slice(2, 4).padStart(2, '0');
          return yy + mm;
        };
        cmp = parse(a.expiryDate).localeCompare(parse(b.expiryDate));
      } else if (sortCol === 'cvv') {
        cmp = (parseInt(a.cvv || '0') || 0) - (parseInt(b.cvv || '0') || 0);
      } else if (sortCol === 'status') {
        cmp = (a.status || '').localeCompare(b.status || '');
      }
      return sortDir === 'asc' ? cmp : -cmp;
    }).map((c: CardRecord) => c.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredIdsString, sortCol, sortDir]);

  const sortedCards = useMemo(() => {
    const map = new Map(filteredCards.map((c: CardRecord) => [c.id, c]));
    return sortedIds.map((id: string) => map.get(id)).filter(Boolean) as CardRecord[];
  }, [sortedIds, filteredCards]);

  // Pagination logic
  const totalItems = sortedCards.length;
  const paginatedCards = sortedCards.slice(
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
  const allSelected = paginatedCards.length > 0 && paginatedCards.every(c => selectedIds.has(c.id));
  const someSelected = selectedIds.size > 0 && !allSelected;

  // Set indeterminate state on the checkbox (can't be done via React props)
  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someSelected;
    }
  }, [someSelected]);

  // Gmail-style: if any rows selected → deselect all; else → select current page
  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size > 0) setSelectedIds(new Set());
    else setSelectedIds(new Set(paginatedCards.map((c) => c.id)));
  }, [selectedIds.size, paginatedCards]);

  /** Find the id of the row just above the topmost item in `ids` */
  const getRowAbove = useCallback((ids: Set<string>) => {
    let minIdx = cards.length;
    ids.forEach((id) => {
      const idx = cards.findIndex((c) => c.id === id);
      if (idx >= 0 && idx < minIdx) minIdx = idx;
    });
    if (minIdx > 0) return cards[minIdx - 1].id;
    // If topmost was index 0, pick the first remaining row after delete
    const remaining = cards.filter((c) => !ids.has(c.id));
    return remaining.length > 0 ? remaining[0].id : null;
  }, [cards]);

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    setDeleting(true);
    const nextId = getRowAbove(selectedIds);
    try {
      const idsArr = [...selectedIds];
      try {
        const batch = writeBatch(db);
        idsArr.forEach((id) =>
          batch.update(doc(db, 'cards', id), {
            deleted: true,
            updatedAt: serverTimestamp(),
          })
        );
        await batch.commit();
      } catch (firestoreErr: any) {
        // If some docs don't exist on Firestore, just clean local cache
        if (firestoreErr?.code !== 'not-found') throw firestoreErr;
      }
      // Always remove from local cache
      await dbLocal.cards.bulkDelete(idsArr);
      setSelectedIds(nextId ? new Set([nextId]) : new Set());
      refresh();
    } catch (err: any) {
      console.error('[CardsTable] Batch delete error:', err?.code, err?.message);
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
        // Soft delete: mark as deleted so onSnapshot propagates to other tabs
        await updateDoc(doc(db, 'cards', id), {
          deleted: true,
          updatedAt: serverTimestamp(),
        });
      } catch (firestoreErr: any) {
        // If document doesn't exist in Firestore (was hard-deleted), skip silently
        if (firestoreErr?.code !== 'not-found') throw firestoreErr;
      }
      // Always remove from local cache
      await dbLocal.cards.delete(id);
      setSelectedIds(nextId ? new Set([nextId]) : new Set());
      refresh();
    } catch (err: any) {
      console.error('[CardsTable] Delete error:', err?.code, err?.message);
    }
  };

  // ── Quick-copy one row ────────────────────────────────────────
  const handleQuickCopy = async (e: React.MouseEvent, card: CardRecord) => {
    e.stopPropagation();
    const text = formatCardCopy(card);
    const ok = await copyToClipboard(text);
    if (ok) {
      handleCopied(card.id);
      toast('Copied!', { duration: 1200, position: 'bottom-center', style: TOAST_STYLE });
    }
  };

  // ── Batch-copy selected rows ──────────────────────────────────
  const handleBatchCopy = async () => {
    const selected = cards.filter((c) => selectedIds.has(c.id));
    if (!selected.length) return;
    const text = selected.map(formatCardCopy).join('\n');
    const ok = await copyToClipboard(text);
    if (ok) {
      setBatchCopied(true);
      setTimeout(() => setBatchCopied(false), 2000);
      toast(`Copied ${selected.length} card${selected.length > 1 ? 's' : ''}!`, {
        duration: 1400,
        position: 'bottom-center',
        style: TOAST_STYLE,
      });
    }
  };

  // ── Inline edit helpers ───────────────────────────────────────
  const startEditing = (card: CardRecord) => {
    setEditingId(card.id);
    setEditForm({ cardNumber: card.cardNumber, expiryDate: card.expiryDate, cvv: card.cvv });
  };

  const cancelEditing = () => { setEditingId(null); setEditForm({}); };

  const commitEdit = async () => {
    if (!editingId || !user) return;
    setSavingEdit(true);
    try {
      await updateDoc(doc(db, 'cards', editingId), {
        cardNumber: editForm.cardNumber ?? '',
        expiryDate: editForm.expiryDate ?? '',
        cvv: editForm.cvv ?? '',
        updatedAt: serverTimestamp(),
      });
      setEditingId(null);
      setEditForm({});
    } catch (err: any) {
      if (err?.code === 'not-found') {
        // Document was previously hard-deleted; clean up stale local record
        await dbLocal.cards.delete(editingId);
        setEditingId(null);
        setEditForm({});
        refresh();
      } else {
        console.error('[CardsTable] Update error:', err?.code, err?.message);
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
    // Next frame so the current click (that SET confirmDeleteId) doesn't immediately dismiss
    const rafId = requestAnimationFrame(() => {
      document.addEventListener('click', handleDocClick, true);
    });
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(rafId);
      document.removeEventListener('click', handleDocClick, true);
    };
  }, [confirmDeleteId]);

  const getCardNumberDisplay = (card: CardRecord) => {
    const revealed = isVisible || hoveredId === card.id;
    if (!revealed) return maskCardNumber(card.cardNumber);
    return formatCardNumberSpaced(card.cardNumber);
  };

  const getCvvDisplay = (card: CardRecord) => {
    const revealed = isVisible || hoveredId === card.id;
    return revealed ? card.cvv : maskCVV(card.cvv || '•••');
  };

  // ── Inline field update (status / note) ──
  const updateField = async (id: string, field: string, value: string | boolean) => {
    try {
      await updateDoc(doc(db, 'cards', id), { [field]: value, updatedAt: serverTimestamp() });
    } catch (err: any) {
      if (err?.code === 'not-found') {
        // Stale local record — clean it up
        await dbLocal.cards.delete(id);
        refresh();
      } else {
        console.error('[CardsTable] updateField error:', err?.code, err?.message);
      }
    }
  };

  // ── Toggle bookmark ──
  const toggleBookmark = async (card: CardRecord) => {
    const next = !card.bookmarked;
    // Optimistic local update
    await dbLocal.cards.update(card.id, { bookmarked: next } as any);
    refresh();
    try {
      await updateDoc(doc(db, 'cards', card.id), { bookmarked: next, updatedAt: serverTimestamp() });
    } catch (err: any) {
      if (err?.code === 'not-found') {
        await dbLocal.cards.delete(card.id);
        refresh();
      }
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-400 text-[13px]">
        Loading…
      </div>
    );
  }

  const toolbarSlot = document.getElementById('table-toolbar-slot');
  const filterSlot = document.getElementById('table-filter-slot');

  // Prefix suggestions: unique first 4 digits from all cards
  const prefixSuggestions = Array.from(new Set(
    cards.map(c => c.cardNumber.replace(/\D/g, '').slice(0, 4))
  )).filter(Boolean).sort();

  const filterUI = (
    <div className="flex items-center gap-1.5">
      <input
        value={filters.search}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setFilters(f => ({ ...f, search: '' }));
        }}
        onChange={(e) => setFilters(f => ({ ...f, search: e.target.value }))}
        placeholder="Search..."
        className="w-24 h-7 px-2 text-[11px] border border-gray-100 rounded-md focus:outline-none focus:border-gray-300 transition-colors"
      />
      <PrefixInput
        value={filters.prefix}
        onChange={(val) => setFilters(f => ({ ...f, prefix: val }))}
        suggestions={prefixSuggestions}
      />
      <input
        value={filters.suffix}
        onChange={(e) => setFilters(f => ({ ...f, suffix: e.target.value.replace(/\D/g, '').slice(0, 8) }))}
        placeholder="Tail..."
        className="w-14 h-7 px-2 text-[11px] border border-gray-100 rounded-md focus:outline-none focus:border-gray-300 transition-colors font-mono"
      />
      <input
        value={filters.expiry}
        onChange={(e) => {
          let val = e.target.value.replace(/\D/g, '');
          if (val.length > 2) val = val.slice(0, 2) + '/' + val.slice(2, 4);
          else if (val.length > 4) val = val.slice(0, 4);
          setFilters(f => ({ ...f, expiry: val }));
        }}
        placeholder="MM/YY"
        className="w-[52px] h-7 px-1.5 text-[11px] border border-gray-100 rounded-md focus:outline-none focus:border-gray-300 transition-colors font-mono"
      />
      <input
        value={filters.cvv}
        onChange={(e) => setFilters(f => ({ ...f, cvv: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
        placeholder="CVV"
        className="w-12 h-7 px-2 text-[11px] border border-gray-100 rounded-md focus:outline-none focus:border-gray-300 transition-colors font-mono"
      />
      <div className="scale-90 origin-left -mr-2">
        <StatusSelect
          value={filters.status}
          onChange={(val) => {
            setFilters(f => ({ ...f, status: val }));
            // For select, user might expect immediate search, but since they asked for explicit search button, we keep it consistent.
            // However, often users want selects to trigger immediately. Let's stick to explicit per request.
          }}
        />
      </div>
      <input
        value={filters.note}
        onChange={(e) => { setFilters(f => ({ ...f, note: e.target.value })); setCurrentPage(1); }}
        placeholder="Note"
        className="w-20 h-7 px-2 text-[11px] border border-gray-100 rounded-md focus:outline-none focus:border-gray-300 transition-colors"
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
        <button
          onClick={() => {
            setFilters({
              search: '',
              prefix: '',
              suffix: '',
              expiry: '',
              cvv: '',
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
      {/* Count badge — blue when rows selected */}
      <div className={`w-6 h-6 rounded-md flex items-center justify-center transition-colors ${selectedIds.size > 0 ? 'bg-blue-100' : 'bg-gray-200'
        }`}>
        <span className={`text-[11px] font-semibold tabular-nums ${selectedIds.size > 0 ? 'text-blue-700' : 'text-gray-700'
          }`}>{selectedIds.size}</span>
      </div>

      <div className="w-px h-4 bg-gray-200 mx-1" />

      {/* Copy */}
      <button
        onClick={handleBatchCopy}
        disabled={selectedIds.size === 0}
        title="Copy selected rows"
        className={`w-7 h-7 flex items-center justify-center rounded-lg transition-colors ${batchCopied
          ? 'bg-emerald-500 text-white'
          : selectedIds.size === 0
            ? 'text-gray-200 cursor-default'
            : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
          }`}
      >
        {batchCopied ? <Check size={13} /> : <ClipboardList size={13} />}
      </button>

      {/* Delete */}
      {showBatchConfirm ? (
        <div className="flex items-center gap-1">
          <button
            onClick={handleDeleteSelected}
            disabled={deleting}
            title="Confirm delete"
            className="w-7 h-7 flex items-center justify-center rounded-lg bg-red-500 hover:bg-red-600 text-white transition-colors disabled:opacity-50"
          >
            <Check size={13} />
          </button>
          <button
            onClick={() => setShowBatchConfirm(false)}
            title="Cancel"
            className="w-7 h-7 flex items-center justify-center rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors"
          >
            <X size={13} />
          </button>
        </div>
      ) : (
        <button
          onClick={() => { if (selectedIds.size > 0) setShowBatchConfirm(true); }}
          disabled={selectedIds.size === 0}
          title="Delete selected"
          className={`w-7 h-7 flex items-center justify-center rounded-lg transition-colors ${selectedIds.size === 0
            ? 'text-gray-200 cursor-default'
            : 'text-gray-500 hover:bg-red-50 hover:text-red-500'
            }`}
        >
          <Trash2 size={13} />
        </button>
      )}
    </div>
  );

  return (
    <>
      {toolbarSlot && createPortal(toolbar, toolbarSlot)}
      {filterSlot && createPortal(filterUI, filterSlot)}
      <div className="flex-1 flex flex-col min-h-0">
        {cards.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-300">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="2" y="5" width="20" height="14" rx="2" />
              <line x1="2" y1="10" x2="22" y2="10" />
            </svg>
            <p className="mt-3 text-[13px] text-gray-400">No cards yet</p>
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-auto">

            <table className="w-full min-w-[800px] table-fixed border-collapse">
              <colgroup>
                <col style={{ width: '36px' }} />
                <col className="w-[22%]" />
                <col className="w-[10%]" />
                <col className="w-[8%]" />
                <col className="w-[9%]" />
                <col style={{ width: '80px' }} />
                <col className="w-[15%]" />
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
                  {([
                    { col: 'cardNumber' as const, label: 'Card Number', cls: 'px-4' },
                    { col: 'expiry' as const, label: 'Expiry', cls: 'px-4' },
                    { col: 'cvv' as const, label: 'CVV', cls: 'px-4' },
                    { col: 'status' as const, label: 'Status', cls: 'px-3' },
                  ]).map(({ col, label, cls }) => (
                    <th
                      key={col}
                      onClick={() => handleSort(col as any)}
                      className={`${cls} py-2.5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider cursor-pointer select-none hover:text-gray-600 group`}
                    >
                      <span className="inline-flex items-center gap-1">
                        {label}
                        <span className={`transition-opacity ${sortCol === col ? 'opacity-100 text-gray-600' : 'opacity-0 group-hover:opacity-40'
                          }`}>
                          {sortCol === col && sortDir === 'desc' ? '▼' : '▲'}
                        </span>
                      </span>
                    </th>
                  ))}
                  <th
                    className="px-1 py-2.5 text-center text-[11px] font-semibold text-gray-400 uppercase tracking-wider cursor-pointer select-none hover:text-gray-600 group"
                    onClick={() => handleSort('timer')}
                  >
                    <span className="inline-flex items-center gap-1">
                      Timer
                      <span className={`transition-opacity ${sortCol === 'timer' ? 'opacity-100 text-gray-600' : 'opacity-0 group-hover:opacity-40'}`}>
                        {sortCol === 'timer' && sortDir === 'desc' ? '▼' : '▲'}
                      </span>
                    </span>
                  </th>
                  <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider no-sort">
                    Note
                  </th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence initial={false}>
                  {paginatedCards.map((card) => {
                    const isHovered = hoveredId === card.id;
                    const isSelected = selectedIds.has(card.id);
                    const isCopied = copiedId === card.id;
                    const isEditing = editingId === card.id;

                    // Priority: copied (bright blue) > editing (amber) > selected (light blue) > hovered > default
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
                        key={card.id}
                        layout
                        initial={{ opacity: 1, height: 44 }}
                        exit={{ opacity: 0, height: 0, overflow: 'hidden' }}
                        transition={{ duration: 0.25, ease: 'easeInOut' }}
                        className={`border-b border-gray-50 h-11 transition-colors ${rowBg} group/row cursor-pointer`}
                        onMouseEnter={() => !isEditing && setHoveredId(card.id)}
                        onMouseLeave={() => setHoveredId(null)}
                        onClick={() => { if (!isEditing) { setSelectedIds(new Set([card.id])); setConfirmDeleteId(null); } }}
                        onDoubleClick={(e) => {
                          if (!isEditing) {
                            e.stopPropagation();
                            startEditing(card);
                          }
                        }}
                      >
                        {/* Checkbox */}
                        <td className="px-2 py-0 text-center" onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(null); }}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelect(card.id)}
                            className="w-3.5 h-3.5 rounded border-gray-300 accent-gray-700 cursor-pointer"
                          />
                        </td>

                        {/* Card Number */}
                        {isEditing ? (
                          <td className="px-4 py-0">
                            <input
                              autoFocus
                              value={editForm.cardNumber ?? ''}
                              onChange={(e) => setEditForm((f) => ({ ...f, cardNumber: e.target.value }))}
                              onKeyDown={handleEditKeyDown}
                              placeholder="Card number"
                              className="w-full h-7 px-2 text-[13px] font-mono text-gray-800 bg-white border border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
                            />
                          </td>
                        ) : (
                          <CopyCell
                            value={card.cardNumber}
                            tdClassName="px-0 py-0"
                            className="px-4 h-11"
                            onCopied={() => handleCopied(card.id)}
                            onSelect={() => setSelectedIds(new Set([card.id]))}
                          >
                            <span className="truncate text-[13px] text-gray-800 font-mono tracking-wide">
                              {getCardNumberDisplay(card)}
                            </span>
                          </CopyCell>
                        )}

                        {/* Expiry */}
                        {isEditing ? (
                          <td className="px-4 py-0">
                            <input
                              value={editForm.expiryDate ?? ''}
                              onChange={(e) => setEditForm((f) => ({ ...f, expiryDate: e.target.value }))}
                              onKeyDown={handleEditKeyDown}
                              placeholder="MM/YY"
                              className="w-full h-7 px-2 text-[13px] font-mono text-gray-800 bg-white border border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
                            />
                          </td>
                        ) : (
                          <CopyCell
                            value={card.expiryDate}
                            tdClassName="px-0 py-0"
                            className="px-4 h-11"
                            onCopied={() => handleCopied(card.id)}
                            onSelect={() => setSelectedIds(new Set([card.id]))}
                          >
                            <span className="truncate text-[13px] text-gray-700 font-mono">
                              {card.expiryDate ? formatExpiry(card.expiryDate) : '—'}
                            </span>
                          </CopyCell>
                        )}

                        {/* CVV */}
                        {isEditing ? (
                          <td className="px-4 py-0">
                            <input
                              value={editForm.cvv ?? ''}
                              onChange={(e) => setEditForm((f) => ({ ...f, cvv: e.target.value }))}
                              onKeyDown={handleEditKeyDown}
                              placeholder="CVV"
                              className="w-full h-7 px-2 text-[13px] font-mono text-gray-800 bg-white border border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
                            />
                          </td>
                        ) : (
                          <CopyCell
                            value={card.cvv}
                            tdClassName="px-0 py-0"
                            className="px-4 h-11"
                            onCopied={() => handleCopied(card.id)}
                            onSelect={() => setSelectedIds(new Set([card.id]))}
                          >
                            <span className="truncate text-[13px] text-gray-700 font-mono tracking-widest">
                              {getCvvDisplay(card)}
                            </span>
                          </CopyCell>
                        )}

                        {/* Status */}
                        <td className="px-3 py-0">
                          <StatusSelect
                            value={card.status ?? ''}
                            onChange={(val) => updateField(card.id, 'status', val)}
                          />
                        </td>

                        {/* Timer cell — between Status and Note */}
                        <td className="py-0" onClick={e => e.stopPropagation()}>
                          <AlarmCell
                            recordId={card.id}
                            nearestAlarmTime={nearestAlarmsMap.get(card.id) ?? null}
                            now={now}
                            onDone={handleAlarmDone}
                            onClick={() => openTimer(card.id)}
                          />
                        </td>

                        {/* Note */}
                        <td className="px-3 py-0">
                          <NoteInput
                            value={card.note ?? ''}
                            onSave={(val) => updateField(card.id, 'note', val)}
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
                          <td className="px-2 py-0 text-right" onClick={(e) => { e.stopPropagation(); setSelectedIds(new Set([card.id])); setConfirmDeleteId(null); }}>
                            <div className="inline-flex items-center gap-0.5">
                              {confirmDeleteId === card.id ? (
                                <button
                                  data-delete-confirm
                                  onClick={(e) => { e.stopPropagation(); setSelectedIds(new Set([card.id])); handleDeleteOne(card.id); setConfirmDeleteId(null); }}
                                  className="flex items-center gap-1 px-2 py-1 rounded bg-red-500 text-white text-[11px] hover:bg-red-600 transition-all"
                                  title="Click to confirm delete"
                                >
                                  <Trash2 size={12} />
                                  <span>Sure?</span>
                                </button>
                              ) : (
                                <button
                                  data-delete-confirm
                                  onClick={(e) => { e.stopPropagation(); setSelectedIds(new Set([card.id])); setConfirmDeleteId(card.id); }}
                                  className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                                  title="Delete"
                                >
                                  <Trash2 size={14} />
                                </button>
                              )}
                              <button
                                onClick={() => setDetailCard(card)}
                                className="p-1.5 rounded hover:bg-blue-50 text-gray-400 hover:text-blue-500 transition-colors"
                                title="Info"
                              >
                                <Info size={14} />
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); toggleBookmark(card); }}
                                className={`p-1.5 rounded transition-colors ${card.bookmarked
                                  ? 'text-amber-500 hover:bg-amber-50'
                                  : 'text-gray-400 hover:bg-amber-50 hover:text-amber-500'
                                  }`}
                                title={card.bookmarked ? 'Remove bookmark' : 'Save for later'}
                              >
                                <Bookmark size={14} fill={card.bookmarked ? 'currentColor' : 'none'} />
                              </button>
                              <button
                                onClick={(e) => handleQuickCopy(e, card)}
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
                  })}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        )}

        {/* Footer count & Pagination */}
        {(cards.length > 0 || totalItems > 0) && (
          <div className="px-4 py-1 border-t border-gray-50 flex items-center justify-between min-h-[44px]">
            <div className="flex items-center gap-2 text-[11px] text-gray-300">
              <span>{totalItems} {totalItems === 1 ? 'card' : 'cards'} filtered</span>
              {editingId && (
                <span className="text-amber-500">· Enter to save · Esc to cancel</span>
              )}
              {!editingId && (
                <span className="text-gray-200">· Double-click row to edit · Click cell to copy</span>
              )}
            </div>

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

        {/* Card detail modal */}
        {detailCard && (
          <CardDetailModal
            card={detailCard}
            onClose={() => setDetailCard(null)}
            onUpdated={() => {
              // Data refreshes automatically via Firestore listener + sync useEffect above
            }}
          />
        )}
      </div>
      {/* Timer modal */}
      {timerCardId && (() => {
        const card = cards.find(c => c.id === timerCardId);
        const tail = card ? card.cardNumber.replace(/\D/g, '').slice(-4) : '';
        return (
          <TimerModal
            recordId={timerCardId}
            collection="cards"
            label={tail ? `****${tail}` : timerCardId}
            existingAlarms={timerAlarms}
            onAdd={async (alarm) => { await addAlarm(alarm); setAlarmRefreshTick(t => t + 1); }}
            onDelete={async (id) => { await deleteAlarm(id); setAlarmRefreshTick(t => t + 1); }}
            onClose={() => setTimerCardId(null)}
          />
        );
      })()}
    </>
  );
}