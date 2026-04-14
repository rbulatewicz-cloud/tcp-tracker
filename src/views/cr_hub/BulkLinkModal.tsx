import { useState, useMemo } from 'react';
import { Link2, Search, X, CheckCircle, ChevronDown } from 'lucide-react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { Plan, DrivewayLetter, DrivewayAddress } from '../../types';
import { linkDrivewayLetterToPlan } from '../../services/drivewayLetterService';

// ── LOC picker ─────────────────────────────────────────────────────────────────

function LOCPicker({
  plans,
  value,
  onChange,
}: {
  plans: Plan[];
  value: string;        // selected plan id
  onChange: (planId: string) => void;
}) {
  const [query, setQuery]   = useState('');
  const [open,  setOpen]    = useState(false);

  const selected = plans.find(p => p.id === value);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return plans.slice(0, 30);
    return plans.filter(p => {
      const haystack = [p.loc, p.street1, p.street2, p.segment].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(q);
    }).slice(0, 30);
  }, [plans, query]);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className={`flex items-center gap-1.5 w-full px-2.5 py-1.5 rounded border text-[11px] text-left transition-colors ${
          selected
            ? 'border-indigo-300 bg-indigo-50 text-indigo-800 font-semibold'
            : 'border-slate-200 bg-white text-slate-400 hover:border-indigo-300'
        }`}
      >
        <span className="flex-1 truncate">{selected ? (selected.loc || selected.id) : 'Select LOC…'}</span>
        <ChevronDown size={11} className="flex-shrink-0 text-slate-400" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-56 rounded-lg border border-slate-200 bg-white shadow-lg">
          <div className="p-2 border-b border-slate-100">
            <div className="relative">
              <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                autoFocus
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search by LOC, street…"
                className="w-full pl-6 pr-2 py-1 rounded border border-slate-200 text-[11px] outline-none focus:ring-1 focus:ring-indigo-300"
              />
            </div>
          </div>
          <div className="max-h-40 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="text-[11px] text-slate-400 italic p-2">No plans match.</p>
            ) : (
              filtered.map(p => (
                <button
                  key={p.id}
                  onClick={() => { onChange(p.id); setOpen(false); setQuery(''); }}
                  className="w-full text-left px-3 py-1.5 text-[11px] hover:bg-indigo-50 transition-colors"
                >
                  <span className="font-semibold text-slate-800">{p.loc || p.id}</span>
                  {p.street1 && <span className="text-slate-400 ml-1.5">{p.street1}</span>}
                </button>
              ))
            )}
          </div>
          {value && (
            <button
              onClick={() => { onChange(''); setOpen(false); }}
              className="w-full text-left px-3 py-1.5 text-[11px] text-red-500 hover:bg-red-50 border-t border-slate-100 transition-colors"
            >
              Clear selection
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Status badge ───────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  not_drafted:                { label: 'Not drafted',       cls: 'bg-slate-100 text-slate-500' },
  draft:                      { label: 'Draft',             cls: 'bg-yellow-100 text-yellow-700' },
  approved:                   { label: 'Approved',          cls: 'bg-blue-100 text-blue-700' },
  submitted_to_metro:         { label: 'Submitted',         cls: 'bg-purple-100 text-purple-700' },
  metro_revision_requested:   { label: 'Revision req.',     cls: 'bg-orange-100 text-orange-700' },
  sent:                       { label: 'Sent',              cls: 'bg-emerald-100 text-emerald-700' },
  needs_review:               { label: 'Needs review',      cls: 'bg-amber-100 text-amber-700' },
};

function badge(status: string) {
  const s = STATUS_BADGE[status] ?? { label: status, cls: 'bg-slate-100 text-slate-500' };
  return (
    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${s.cls}`}>{s.label}</span>
  );
}

// ── Main modal ─────────────────────────────────────────────────────────────────

interface Props {
  onClose: () => void;
  plans: Plan[];
  letters: DrivewayLetter[];
}

export function BulkLinkModal({ onClose, plans, letters }: Props) {
  // Unlinked = no planId AND no linkedPlanLocs entries
  const unlinked = useMemo(
    () => letters.filter(l => !l.planId && !(l.linkedPlanLocs?.length)),
    [letters],
  );

  // planId selection per letter id
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [committing,  setCommitting]  = useState(false);
  const [progress,    setProgress]    = useState(0);
  const [done,        setDone]        = useState(false);
  const [linkedCount, setLinkedCount] = useState(0);

  // Bulk-apply picker
  const [bulkPlanId, setBulkPlanId] = useState('');

  function applyToAll() {
    if (!bulkPlanId) return;
    const next: Record<string, string> = { ...selections };
    unlinked.forEach(l => { if (!next[l.id]) next[l.id] = bulkPlanId; });
    setSelections(next);
  }

  const readyCount = unlinked.filter(l => selections[l.id]).length;

  async function handleCommit() {
    const toCommit = unlinked.filter(l => selections[l.id]);
    if (toCommit.length === 0) return;

    setCommitting(true);
    setProgress(0);
    let count = 0;

    for (let i = 0; i < toCommit.length; i++) {
      const letter = toCommit[i];
      const plan   = plans.find(p => p.id === selections[letter.id]);
      if (!plan) continue;

      try {
        await linkDrivewayLetterToPlan(letter, plan);

        // Create / update DrivewayAddress on the plan
        const existingAddresses = plan.compliance?.drivewayNotices?.addresses ?? [];
        const addrText   = letter.address || '';
        const existingMatch = addrText
          ? existingAddresses.find(a =>
              a.address.toLowerCase() === addrText.toLowerCase() ||
              (a.letterId && a.letterId === letter.id)
            )
          : null;

        const sentDate = letter.fields?.letterDate || new Date().toISOString().slice(0, 10);

        if (!existingMatch) {
          const newAddr: DrivewayAddress = {
            id: `da_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            address:     addrText || 'Unknown',
            ownerName:   letter.ownerName || letter.fields?.recipientName || '',
            noticeSent:  true,
            sentDate,
            letterId:    letter.id,
            letterStatus: letter.status,
          };
          const planRef = doc(db, 'plans', plan.id);
          if (!plan.compliance?.drivewayNotices) {
            await updateDoc(planRef, {
              'compliance.drivewayNotices': {
                status:      'in_progress',
                triggeredBy: ['impact_driveway'],
                addresses:   [newAddr],
                notes:       '',
              },
            });
          } else {
            await updateDoc(planRef, {
              'compliance.drivewayNotices.addresses': [...existingAddresses, newAddr],
            });
          }
        } else {
          const updated = existingAddresses.map(a =>
            a === existingMatch
              ? { ...a, noticeSent: true, sentDate, letterId: letter.id, letterStatus: letter.status }
              : a
          );
          await updateDoc(doc(db, 'plans', plan.id), {
            'compliance.drivewayNotices.addresses': updated,
          });
        }

        count++;
      } catch {
        // non-fatal; continue with remaining
      }

      setProgress(Math.round(((i + 1) / toCommit.length) * 100));
    }

    setLinkedCount(count);
    setCommitting(false);
    setDone(true);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 flex flex-col max-h-[85vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
          <div>
            <h2 className="text-base font-bold text-slate-800">Bulk Link Notices</h2>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {unlinked.length} unlinked letter{unlinked.length !== 1 ? 's' : ''} · assign each to a LOC
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Done state */}
        {done ? (
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center flex-1">
            <CheckCircle size={44} className="text-emerald-400 mb-4" />
            <p className="text-lg font-bold text-slate-800 mb-1">
              {linkedCount} notice{linkedCount !== 1 ? 's' : ''} linked
            </p>
            <p className="text-[12px] text-slate-400 mb-6">
              {unlinked.length - linkedCount > 0
                ? `${unlinked.length - linkedCount} skipped (no LOC selected or error)`
                : 'All selected notices were linked successfully.'}
            </p>
            <button
              onClick={onClose}
              className="px-5 py-2 rounded-lg bg-indigo-600 text-white text-[12px] font-bold hover:bg-indigo-700 transition-colors"
            >
              Done
            </button>
          </div>
        ) : unlinked.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center flex-1">
            <CheckCircle size={40} className="text-emerald-400 mb-3" />
            <p className="text-sm font-semibold text-slate-700">No unlinked notices</p>
            <p className="text-[11px] text-slate-400 mt-1">All letters in the library are already linked to a plan.</p>
            <button onClick={onClose} className="mt-5 px-4 py-1.5 rounded-lg border border-slate-200 text-[12px] text-slate-600 hover:bg-slate-50 transition-colors">
              Close
            </button>
          </div>
        ) : (
          <>
            {/* Bulk-apply strip */}
            <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-3 flex-shrink-0 bg-slate-50">
              <div className="flex-1">
                <LOCPicker plans={plans} value={bulkPlanId} onChange={setBulkPlanId} />
              </div>
              <button
                onClick={applyToAll}
                disabled={!bulkPlanId}
                className="px-3 py-1.5 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 text-[11px] font-semibold hover:bg-indigo-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0"
              >
                Apply to all unlinked
              </button>
            </div>

            {/* Letter rows */}
            <div className="overflow-y-auto flex-1 px-5 py-3 space-y-2">
              {unlinked.map(letter => (
                <div key={letter.id} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                  {/* Letter info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                      {badge(letter.status)}
                      <span className="text-[12px] font-semibold text-slate-800 truncate">
                        {letter.address || '(no address)'}
                      </span>
                    </div>
                    {(letter.ownerName || letter.fields?.recipientName) && (
                      <p className="text-[10px] text-slate-400 truncate">
                        {letter.ownerName || letter.fields?.recipientName}
                      </p>
                    )}
                    <p className="text-[9px] text-slate-300 mt-0.5">
                      Created {letter.createdAt ? new Date(letter.createdAt).toLocaleDateString() : '—'}
                    </p>
                  </div>

                  {/* LOC picker */}
                  <div className="w-48 flex-shrink-0">
                    <LOCPicker
                      plans={plans}
                      value={selections[letter.id] ?? ''}
                      onChange={planId =>
                        setSelections(prev => ({ ...prev, [letter.id]: planId }))
                      }
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between flex-shrink-0 bg-white">
              {committing ? (
                <div className="flex items-center gap-3 w-full">
                  <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full bg-indigo-500 rounded-full transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <span className="text-[11px] text-slate-500 flex-shrink-0">{progress}%</span>
                </div>
              ) : (
                <>
                  <p className="text-[11px] text-slate-400">
                    {readyCount > 0
                      ? `${readyCount} of ${unlinked.length} selected`
                      : 'Select a LOC for each notice to link'}
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={onClose}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 text-[12px] text-slate-600 hover:bg-slate-50 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleCommit}
                      disabled={readyCount === 0}
                      className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-indigo-600 text-white text-[12px] font-bold hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      <Link2 size={13} />
                      Link {readyCount > 0 ? readyCount : ''} notice{readyCount !== 1 ? 's' : ''}
                    </button>
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
