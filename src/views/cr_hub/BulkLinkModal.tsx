import { useState, useMemo } from 'react';
import { Link2, Search, X, CheckCircle, ArrowRight } from 'lucide-react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { Plan, DrivewayLetter, DrivewayAddress } from '../../types';
import { linkDrivewayLetterToPlan } from '../../services/drivewayLetterService';

// ── Shared link action ─────────────────────────────────────────────────────────

async function performLink(letter: DrivewayLetter, plan: Plan): Promise<void> {
  await linkDrivewayLetterToPlan(letter, plan);

  const existingAddresses = plan.compliance?.drivewayNotices?.addresses ?? [];
  const addrText = letter.address || '';
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
}

// ── Types ──────────────────────────────────────────────────────────────────────

type Mode = 'loc_first' | 'notice_first';

const TERMINAL_STAGES = new Set([
  'approved', 'plan_approved', 'implemented',
  'tcp_approved_final', 'closed', 'cancelled', 'expired',
]);

// ── Status badge helper ────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  not_drafted:              { label: 'Not drafted',   cls: 'bg-slate-100 text-slate-500' },
  draft:                    { label: 'Draft',         cls: 'bg-yellow-100 text-yellow-700' },
  approved:                 { label: 'Approved',      cls: 'bg-blue-100 text-blue-700' },
  submitted_to_metro:       { label: 'Submitted',     cls: 'bg-purple-100 text-purple-700' },
  metro_revision_requested: { label: 'Revision req.', cls: 'bg-orange-100 text-orange-700' },
  sent:                     { label: 'Sent',          cls: 'bg-emerald-100 text-emerald-700' },
  needs_review:             { label: 'Needs review',  cls: 'bg-amber-100 text-amber-700' },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_BADGE[status] ?? { label: status, cls: 'bg-slate-100 text-slate-500' };
  return (
    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${s.cls}`}>
      {s.label}
    </span>
  );
}

// ── Main modal ─────────────────────────────────────────────────────────────────

interface Props {
  onClose: () => void;
  plans: Plan[];
  letters: DrivewayLetter[];
}

export function BulkLinkModal({ onClose, plans, letters }: Props) {
  const [mode,        setMode]        = useState<Mode>('loc_first');
  const [selectedId,  setSelectedId]  = useState<string | null>(null);
  const [leftSearch,  setLeftSearch]  = useState('');
  const [rightSearch, setRightSearch] = useState('');
  const [linking,     setLinking]     = useState<string | null>(null); // id being linked
  const [linkedPairs, setLinkedPairs] = useState<Set<string>>(new Set()); // "letterId:planId"

  // Unlinked = no planId AND no linkedPlanLocs entries
  const unlinkedLetters = useMemo(
    () => letters.filter(l => !l.planId && !(l.linkedPlanLocs?.length)),
    [letters],
  );

  const drivewayPlans = useMemo(
    () => plans.filter(p => p.impact_driveway && !TERMINAL_STAGES.has(p.stage)),
    [plans],
  );

  // ── Left panel items ──────────────────────────────────────────────────────

  const leftItems = useMemo(() => {
    const q = leftSearch.toLowerCase().trim();
    if (mode === 'loc_first') {
      if (!q) return drivewayPlans;
      return drivewayPlans.filter(p => {
        const h = [p.loc, p.street1, p.street2, p.segment].filter(Boolean).join(' ').toLowerCase();
        return h.includes(q);
      });
    } else {
      if (!q) return unlinkedLetters;
      return unlinkedLetters.filter(l => {
        const h = [l.address, l.ownerName, l.fields?.recipientName].filter(Boolean).join(' ').toLowerCase();
        return h.includes(q);
      });
    }
  }, [mode, leftSearch, drivewayPlans, unlinkedLetters]);

  // ── Right panel items ─────────────────────────────────────────────────────

  const rightItems = useMemo(() => {
    const q = rightSearch.toLowerCase().trim();
    if (mode === 'loc_first') {
      const base = q
        ? unlinkedLetters.filter(l => {
            const h = [l.address, l.ownerName, l.fields?.recipientName].filter(Boolean).join(' ').toLowerCase();
            return h.includes(q);
          })
        : unlinkedLetters;
      return base;
    } else {
      const base = q
        ? plans.filter(p => {
            const h = [p.loc, p.street1, p.street2, p.segment].filter(Boolean).join(' ').toLowerCase();
            return h.includes(q);
          })
        : plans;
      return base;
    }
  }, [mode, rightSearch, unlinkedLetters, plans]);

  const selectedPlan   = mode === 'loc_first'     ? plans.find(p => p.id === selectedId)   : null;
  const selectedLetter = mode === 'notice_first'  ? letters.find(l => l.id === selectedId) : null;

  // ── Link handler ──────────────────────────────────────────────────────────

  async function handleLink(letter: DrivewayLetter, plan: Plan) {
    const pairKey  = `${letter.id}:${plan.id}`;
    const loadKey  = mode === 'loc_first' ? letter.id : plan.id;
    setLinking(loadKey);
    try {
      await performLink(letter, plan);
      setLinkedPairs(prev => new Set([...prev, pairKey]));
    } catch {
      // non-fatal
    } finally {
      setLinking(null);
    }
  }

  function switchMode(m: Mode) {
    setMode(m);
    setSelectedId(null);
    setLeftSearch('');
    setRightSearch('');
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const leftLabel  = mode === 'loc_first' ? 'Select a LOC'    : 'Select a Notice';
  const leftCount  = mode === 'loc_first' ? drivewayPlans.length : unlinkedLetters.length;
  const leftEmpty  = mode === 'loc_first' ? 'No active driveway plans.' : 'No unlinked notices.';
  const rightLabel = mode === 'loc_first'
    ? selectedPlan   ? `Link notices → ${selectedPlan.loc || selectedPlan.id}` : 'Notices'
    : selectedLetter ? `Link "${(selectedLetter.address || 'notice').slice(0, 28)}" → LOC` : 'LOCs';
  const rightPlaceholder = mode === 'loc_first' ? 'Filter notices…' : 'Search LOC, street…';
  const rightEmptyPrompt = mode === 'loc_first'
    ? 'Select a LOC on the left to see notices you can link to it'
    : 'Select a notice on the left to choose which LOC to link it to';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl mx-4 flex flex-col"
        style={{ height: '82vh' }}
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-4">
            <div>
              <h2 className="text-base font-bold text-slate-800">Bulk Link Notices</h2>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {unlinkedLetters.length} unlinked notice{unlinkedLetters.length !== 1 ? 's' : ''}
                {linkedPairs.size > 0 && (
                  <span className="ml-2 text-emerald-600 font-semibold">
                    · {linkedPairs.size} linked this session
                  </span>
                )}
              </p>
            </div>

            {/* Mode toggle */}
            <div className="flex items-center rounded-lg border border-slate-200 overflow-hidden text-[11px]">
              <button
                onClick={() => switchMode('loc_first')}
                className={`px-3 py-1.5 font-semibold transition-colors ${
                  mode === 'loc_first'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white text-slate-500 hover:bg-slate-50'
                }`}
              >
                LOC → Notices
              </button>
              <button
                onClick={() => switchMode('notice_first')}
                className={`px-3 py-1.5 font-semibold transition-colors ${
                  mode === 'notice_first'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white text-slate-500 hover:bg-slate-50'
                }`}
              >
                Notice → LOC
              </button>
            </div>
          </div>

          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* ── Two-panel body ── */}
        <div className="flex flex-1 min-h-0 divide-x divide-slate-100">

          {/* Left panel */}
          <div className="w-[38%] flex flex-col min-h-0">
            <div className="px-4 py-2.5 border-b border-slate-100 flex-shrink-0">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1.5">
                {leftLabel}
                <span className="ml-1.5 font-normal normal-case text-slate-300">({leftCount})</span>
              </p>
              <div className="relative">
                <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  value={leftSearch}
                  onChange={e => setLeftSearch(e.target.value)}
                  placeholder={mode === 'loc_first' ? 'Search LOC, street…' : 'Search address, owner…'}
                  className="w-full pl-7 pr-3 py-1.5 rounded border border-slate-200 text-[11px] outline-none focus:ring-1 focus:ring-indigo-300"
                />
              </div>
            </div>

            <div className="overflow-y-auto flex-1 p-2 space-y-0.5">
              {leftItems.length === 0 ? (
                <p className="text-[11px] text-slate-400 italic p-3 text-center">{leftEmpty}</p>
              ) : mode === 'loc_first' ? (
                (leftItems as Plan[]).map(p => (
                  <button
                    key={p.id}
                    onClick={() => { setSelectedId(p.id); setRightSearch(''); }}
                    className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                      selectedId === p.id
                        ? 'bg-indigo-50 border border-indigo-200'
                        : 'hover:bg-slate-50 border border-transparent'
                    }`}
                  >
                    <p className="text-[12px] font-bold text-slate-800">{p.loc || p.id}</p>
                    {p.street1 && (
                      <p className="text-[10px] text-slate-400 truncate">{p.street1}</p>
                    )}
                  </button>
                ))
              ) : (
                (leftItems as DrivewayLetter[]).map(l => (
                  <button
                    key={l.id}
                    onClick={() => { setSelectedId(l.id); setRightSearch(''); }}
                    className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                      selectedId === l.id
                        ? 'bg-indigo-50 border border-indigo-200'
                        : 'hover:bg-slate-50 border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                      <StatusBadge status={l.status} />
                    </div>
                    <p className="text-[11px] font-semibold text-slate-800 truncate">
                      {l.address || '(no address)'}
                    </p>
                    {(l.ownerName || l.fields?.recipientName) && (
                      <p className="text-[10px] text-slate-400 truncate">
                        {l.ownerName || l.fields?.recipientName}
                      </p>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Right panel */}
          <div className="flex-1 flex flex-col min-h-0">
            {!selectedId ? (
              <div className="flex flex-col items-center justify-center h-full text-center px-10">
                <ArrowRight size={36} className="text-slate-200 mb-3" />
                <p className="text-[12px] text-slate-400 font-medium leading-relaxed">
                  {rightEmptyPrompt}
                </p>
              </div>
            ) : (
              <>
                <div className="px-4 py-2.5 border-b border-slate-100 flex-shrink-0">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1.5">
                    {rightLabel}
                  </p>
                  <div className="relative">
                    <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    <input
                      autoFocus
                      type="text"
                      value={rightSearch}
                      onChange={e => setRightSearch(e.target.value)}
                      placeholder={rightPlaceholder}
                      className="w-full pl-7 pr-3 py-1.5 rounded border border-slate-200 text-[11px] outline-none focus:ring-1 focus:ring-indigo-300"
                    />
                  </div>
                </div>

                <div className="overflow-y-auto flex-1 p-3 space-y-1.5">
                  {rightItems.length === 0 ? (
                    <p className="text-[11px] text-slate-400 italic p-3 text-center">No items match.</p>
                  ) : mode === 'loc_first' ? (
                    (rightItems as DrivewayLetter[]).map(letter => {
                      const pairKey  = `${letter.id}:${selectedId}`;
                      const isLinked = linkedPairs.has(pairKey);
                      const isLoading = linking === letter.id;
                      return (
                        <div
                          key={letter.id}
                          className={`flex items-center gap-2.5 rounded-lg border px-3 py-2.5 transition-colors ${
                            isLinked ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-white hover:border-slate-300'
                          }`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <StatusBadge status={letter.status} />
                            </div>
                            <p className="text-[12px] font-semibold text-slate-800 truncate">
                              {letter.address || '(no address)'}
                            </p>
                            {(letter.ownerName || letter.fields?.recipientName) && (
                              <p className="text-[10px] text-slate-400 truncate">
                                {letter.ownerName || letter.fields?.recipientName}
                              </p>
                            )}
                          </div>
                          {isLinked ? (
                            <span className="flex items-center gap-1 text-[10px] text-emerald-600 font-semibold flex-shrink-0">
                              <CheckCircle size={12} /> Linked
                            </span>
                          ) : (
                            <button
                              onClick={() => selectedPlan && handleLink(letter, selectedPlan)}
                              disabled={!!linking}
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-indigo-600 text-white text-[10px] font-bold hover:bg-indigo-700 disabled:opacity-50 transition-colors flex-shrink-0"
                            >
                              <Link2 size={10} />
                              {isLoading ? '…' : 'Link'}
                            </button>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    (rightItems as Plan[]).map(plan => {
                      const pairKey  = `${selectedId}:${plan.id}`;
                      const isLinked = linkedPairs.has(pairKey);
                      const isLoading = linking === plan.id;
                      return (
                        <div
                          key={plan.id}
                          className={`flex items-center gap-2.5 rounded-lg border px-3 py-2.5 transition-colors ${
                            isLinked ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-white hover:border-slate-300'
                          }`}
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-[12px] font-bold text-slate-800">{plan.loc || plan.id}</p>
                            {plan.street1 && (
                              <p className="text-[10px] text-slate-400 truncate">{plan.street1}</p>
                            )}
                          </div>
                          {isLinked ? (
                            <span className="flex items-center gap-1 text-[10px] text-emerald-600 font-semibold flex-shrink-0">
                              <CheckCircle size={12} /> Linked
                            </span>
                          ) : (
                            <button
                              onClick={() => selectedLetter && handleLink(selectedLetter, plan)}
                              disabled={!!linking}
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-indigo-600 text-white text-[10px] font-bold hover:bg-indigo-700 disabled:opacity-50 transition-colors flex-shrink-0"
                            >
                              <Link2 size={10} />
                              {isLoading ? '…' : 'Link'}
                            </button>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="px-6 py-3 border-t border-slate-100 flex items-center justify-between flex-shrink-0">
          <p className="text-[11px] text-slate-400">
            {linkedPairs.size > 0
              ? `${linkedPairs.size} link${linkedPairs.size !== 1 ? 's' : ''} made this session`
              : mode === 'loc_first'
                ? 'Pick a LOC, then click Link on any notice in the right panel'
                : 'Pick a notice, then click Link on any LOC in the right panel'}
          </p>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg border border-slate-200 text-[12px] text-slate-600 hover:bg-slate-50 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
