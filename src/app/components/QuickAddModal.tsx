import { useState } from 'react';
import { collection, writeBatch, doc, query, where, getDocs, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../contexts/AuthContext';
import { parseInput, ParsedCard, ParsedEmail } from '../../utils/parseInput';
import { X, Zap, AlertCircle, CheckCircle2, AlertTriangle } from 'lucide-react';

interface QuickAddModalProps {
  mode: 'cards' | 'emails';
  onClose: () => void;
  onImported: () => void;
}

type Stage = 'input' | 'preview';

export function QuickAddModal({ mode, onClose, onImported }: QuickAddModalProps) {
  const { user } = useAuth();
  const [text, setText] = useState('');
  const [stage, setStage] = useState<Stage>('input');
  const [cards, setCards] = useState<ParsedCard[]>([]);
  const [emails, setEmails] = useState<ParsedEmail[]>([]);
  const [duplicateIndices, setDuplicateIndices] = useState<Set<number>>(new Set());
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [checking, setChecking] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');

  const isCards = mode === 'cards';

  // ── Parse + duplicate check ───────────────────────────────────────────────
  const handleParse = async () => {
    if (!text.trim()) {
      setError('Please enter some data to parse.');
      return;
    }
    if (!user) return;
    setError('');

    const result = parseInput(text);

    if (isCards) {
      if (result.cards.length === 0) {
        setError('No valid cards detected. Check the format and try again.');
        return;
      }
      setChecking(true);
      try {
        // Fetch existing card numbers for this user
        const snap = await getDocs(
          query(collection(db, 'cards'), where('userId', '==', user.uid))
        );
        const existingNumbers = new Set(
          snap.docs.map((d) => (d.data().cardNumber as string).replace(/\D/g, ''))
        );

        const dupes = new Set<number>();
        result.cards.forEach((card, i) => {
          if (existingNumbers.has(card.cardNumber.replace(/\D/g, ''))) dupes.add(i);
        });

        setCards(result.cards);
        setEmails([]);
        setDuplicateIndices(dupes);
      } finally {
        setChecking(false);
      }
    } else {
      if (result.emails.length === 0) {
        setError('No valid emails detected. Check the format and try again.');
        return;
      }
      setChecking(true);
      try {
        // Fetch existing emails for this user
        const snap = await getDocs(
          query(collection(db, 'emails'), where('userId', '==', user.uid))
        );
        const existingEmails = new Set(
          snap.docs.map((d) => (d.data().email as string).toLowerCase())
        );

        const dupes = new Set<number>();
        result.emails.forEach((em, i) => {
          if (existingEmails.has(em.email.toLowerCase())) dupes.add(i);
        });

        setEmails(result.emails);
        setCards([]);
        setDuplicateIndices(dupes);
      } finally {
        setChecking(false);
      }
    }

    setStage('preview');
  };

  // ── Import ─────────────────────────────────────────────────────────────────
  const handleImport = async () => {
    if (!user) return;
    setImporting(true);
    try {
      const batch = writeBatch(db);

      cards.forEach((card, i) => {
        if (skipDuplicates && duplicateIndices.has(i)) return;
        const ref = doc(collection(db, 'cards'));
        batch.set(ref, {
          userId: user.uid,
          cardNumber: card.cardNumber,
          expiryDate: card.expiryDate,
          cvv: card.cvv,
          cardholderName: card.cardholderName || '',
          streetAddress: card.streetAddress || '',
          city: card.city || '',
          state: card.state || '',
          zipCode: card.zipCode || '',
          country: card.country || '',
          phoneNumber: card.phoneNumber || '',
          email: card.email || '',
          status: 'Active',
          note: '',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      });

      emails.forEach((email, i) => {
        if (skipDuplicates && duplicateIndices.has(i)) return;
        const ref = doc(collection(db, 'emails'));
        batch.set(ref, {
          userId: user.uid,
          email: email.email,
          password: email.password,
          secret2FA: email.secret2FA || '',
          recoveryEmail: email.recoveryEmail || '',
          phone: email.phone || '',
          status: 'Active',
          note: email.note || '',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      });

      await batch.commit();
      onImported();
      onClose();
    } catch (e) {
      setError('Import failed. Please try again.');
    } finally {
      setImporting(false);
    }
  };

  const list = isCards ? cards : emails;
  const importCount = skipDuplicates
    ? list.length - duplicateIndices.size
    : list.length;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[9999] p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100">
          <div className="w-7 h-7 bg-gradient-to-br from-purple-500 to-blue-600 rounded-lg flex items-center justify-center">
            <Zap size={14} className="text-white" />
          </div>
          <div>
            <h2 className="text-[15px] font-semibold text-gray-900">
              Quick Add {isCards ? 'Cards' : 'Emails'}
            </h2>
            <p className="text-[12px] text-gray-400">
              {isCards
                ? 'Paste card lines — pipe-separated, auto-detected'
                : 'Paste email lines — tab or space separated, auto-detected'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="ml-auto w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {stage === 'input' ? (
            <div className="space-y-4">
              {/* Format hints */}
              <div className="bg-gray-50 rounded-xl p-4 text-[12px] text-gray-500 space-y-2">
                <p className="font-semibold text-gray-600">Supported formats</p>
                {isCards ? (
                  <div className="space-y-1">
                    <p className="font-mono text-gray-400 text-[11px]">5597580250791356 | 08 | 27 | 536</p>
                    <p className="font-mono text-gray-400 text-[11px]">4985031091051132 / 03 / 28 / 785</p>
                    <p className="font-mono text-gray-400 text-[11px]">5143772481663954 | 02/30 | 135 | Mary Wilson</p>
                    <p className="mt-2 text-[11px] text-gray-400">
                      Separator: <span className="font-mono text-gray-600">|</span> or <span className="font-mono text-gray-600">/</span> &nbsp;·&nbsp;
                      Fields: card# · expiry · CVV · [name · address...]
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <p className="font-mono text-gray-400 break-all">email@gmail.com↹password↹recoveryEmail↹<span className="text-purple-500">bil5 aokq imz5 wbpu ktb7 wpuw 4wde ch7i</span></p>
                    <p className="font-mono text-gray-400 break-all">email@gmail.com↹password↹<span className="text-purple-500">oj27 lqpm ksay 5pmy 6uoi p3yf vzvk 6sew</span>↹7377023398↹http://...</p>
                    <p className="font-mono text-gray-400 break-all">email@gmail.com↹password↹<span className="text-purple-500">3cgrmeaj4cofx4rw4tcivu5gluzqwafr</span>↹phone↹url</p>
                    <p className="mt-2 text-[11px] text-gray-400">
                      Separator: Tab (or space/comma) &nbsp;·&nbsp; 2FA auto-detected: grouped 4-char blocks, compact 20+ chars, Base32 &nbsp;·&nbsp; URLs are skipped
                    </p>
                  </div>
                )}
              </div>

              {/* Textarea */}
              <textarea
                value={text}
                onChange={(e) => { setText(e.target.value); setError(''); }}
                placeholder={isCards ? 'Paste your card lines here…' : 'Paste your email lines here…'}
                className="w-full h-52 px-4 py-3 text-[13px] font-mono text-gray-800 bg-gray-50 border border-gray-200 rounded-xl resize-none focus:outline-none focus:border-blue-400 focus:bg-white transition-colors placeholder:text-gray-300"
                autoFocus
              />

              {error && (
                <div className="flex items-center gap-2 text-[12px] text-red-600 bg-red-50 px-3 py-2 rounded-lg">
                  <AlertCircle size={13} />
                  {error}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {/* Summary row */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-2 text-[12px] text-green-700 bg-green-50 px-3 py-1.5 rounded-lg border border-green-100">
                  <CheckCircle2 size={13} />
                  {list.length} {isCards ? (list.length === 1 ? 'card' : 'cards') : (list.length === 1 ? 'email' : 'emails')} detected
                </div>
                {duplicateIndices.size > 0 && (
                  <div className="flex items-center gap-2 text-[12px] text-amber-700 bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-100">
                    <AlertTriangle size={13} />
                    {duplicateIndices.size} duplicate{duplicateIndices.size > 1 ? 's' : ''} found
                  </div>
                )}
              </div>

              {/* Skip duplicates toggle */}
              {duplicateIndices.size > 0 && (
                <label className="flex items-center gap-2 cursor-pointer select-none w-fit">
                  <input
                    type="checkbox"
                    checked={skipDuplicates}
                    onChange={(e) => setSkipDuplicates(e.target.checked)}
                    className="w-3.5 h-3.5 rounded border-gray-300 accent-blue-600 cursor-pointer"
                  />
                  <span className="text-[12px] text-gray-600">
                    Skip duplicates <span className="text-gray-400">(import {importCount} new {isCards ? 'cards' : 'emails'})</span>
                  </span>
                </label>
              )}

              {/* ── Cards preview ── */}
              {cards.length > 0 && (
                <div>
                  <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
                    Cards ({cards.length})
                  </h3>
                  <div className="border border-gray-100 rounded-xl overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[520px]">
                        <thead>
                          <tr className="bg-gray-50 border-b border-gray-100">
                            <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider w-44">Card Number</th>
                            <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider w-16">Expiry</th>
                            <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider w-12">CVV</th>
                            <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Name</th>
                            <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider w-16">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {cards.map((card, i) => {
                            const isDupe = duplicateIndices.has(i);
                            const willSkip = isDupe && skipDuplicates;
                            return (
                              <tr
                                key={i}
                                className={`border - b border - gray - 50 last: border - 0 ${willSkip ? 'opacity-40' : ''} `}
                              >
                                <td className="px-3 py-2 text-[12px] font-mono text-gray-800 truncate">
                                  {card.cardNumber.replace(/(.{4})(?=.)/g, '$1 ')}
                                </td>
                                <td className="px-3 py-2 text-[12px] font-mono text-gray-600">
                                  {card.expiryDate
                                    ? card.expiryDate.replace(/^(\d{1,2})\/(\d{2,4})$/, (_, m, y) => `${m.padStart(2, '0')}/${y.slice(-2)}`)
                                    : <span className="text-gray-300">—</span>}
                                </td >
                                <td className="px-3 py-2 text-[12px] font-mono text-gray-600">
                                  {card.cvv || <span className="text-gray-300">—</span>}
                                </td>
                                <td className="px-3 py-2 text-[12px] text-gray-600 truncate">
                                  {card.cardholderName || <span className="text-gray-300">—</span>}
                                </td>
                                <td className="px-3 py-2">
                                  {isDupe ? (
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-50 text-amber-600 border border-amber-100 rounded text-[10px] font-medium whitespace-nowrap">
                                      ⚠ duplicate
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-green-50 text-green-600 rounded text-[10px] font-medium">
                                      ✓ new
                                    </span>
                                  )}
                                </td>
                              </tr >
                            );
                          })}
                        </tbody >
                      </table >
                    </div >
                  </div >
                </div >
              )}

              {/* ── Emails preview ── */}
              {
                emails.length > 0 && (
                  <div>
                    <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
                      Emails ({emails.length})
                    </h3>
                    <div className="border border-gray-100 rounded-xl overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[580px]">
                          <thead>
                            <tr className="bg-gray-50 border-b border-gray-100">
                              <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Email</th>
                              <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider w-28">Password</th>
                              <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider w-24">2FA Secret</th>
                              <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider w-28">Recovery</th>
                              <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider w-16">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {emails.map((em, i) => {
                              const isDupe = duplicateIndices.has(i);
                              const willSkip = isDupe && skipDuplicates;
                              return (
                                <tr
                                  key={i}
                                  className={`border-b border-gray-50 last:border-0 ${willSkip ? 'opacity-40' : ''}`}
                                >
                                  <td className="px-3 py-2 text-[12px] text-gray-800 truncate">
                                    {em.email}
                                  </td>
                                  <td className="px-3 py-2 text-[12px] font-mono text-gray-600 truncate">
                                    {em.password || <span className="text-gray-300">—</span>}
                                  </td>
                                  <td className="px-3 py-2">
                                    {em.secret2FA ? (
                                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-purple-50 text-purple-600 rounded text-[10px] font-medium">
                                        ✓ detected
                                      </span>
                                    ) : (
                                      <span className="text-gray-300 text-[12px]">—</span>
                                    )}
                                  </td>
                                  <td className="px-3 py-2 text-[11px] font-mono text-gray-400 truncate">
                                    {em.recoveryEmail || <span className="text-gray-300">—</span>}
                                  </td>
                                  <td className="px-3 py-2">
                                    {isDupe ? (
                                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-50 text-amber-600 border border-amber-100 rounded text-[10px] font-medium whitespace-nowrap">
                                        ⚠ duplicate
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-green-50 text-green-600 rounded text-[10px] font-medium">
                                        ✓ new
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )
              }

              {
                error && (
                  <div className="flex items-center gap-2 text-[12px] text-red-600 bg-red-50 px-3 py-2 rounded-lg">
                    <AlertCircle size={13} />
                    {error}
                  </div>
                )
              }
            </div >
          )}
        </div >

        {/* Footer */}
        < div className="px-6 py-4 border-t border-gray-100 flex items-center gap-2 justify-end" >
          {stage === 'preview' && (
            <button
              onClick={() => { setStage('input'); setDuplicateIndices(new Set()); }}
              className="px-4 py-2 text-[13px] text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              ← Back
            </button>
          )}
          <button
            onClick={onClose}
            className="px-4 py-2 text-[13px] text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          {
            stage === 'input' ? (
              <button
                onClick={handleParse}
                disabled={checking}
                className="px-5 py-2 text-[13px] font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-60 transition-colors flex items-center gap-2"
              >
                {checking ? (
                  <>
                    <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    Checking…
                  </>
                ) : 'Preview →'}
              </button>
            ) : (
              <button
                onClick={handleImport}
                disabled={importing || importCount === 0}
                className="px-5 py-2 text-[13px] font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {importing
                  ? 'Importing…'
                  : importCount === 0
                    ? 'Nothing to import'
                    : `Import ${importCount} ${isCards
                      ? importCount === 1 ? 'card' : 'cards'
                      : importCount === 1 ? 'email' : 'emails'}`}
              </button>
            )
          }
        </div >

      </div >
    </div >
  );
}