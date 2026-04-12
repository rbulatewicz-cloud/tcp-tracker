import React, { useEffect, useState, useRef } from 'react';
import {
  Upload, FileWarning, CheckCircle, AlertTriangle, XCircle,
  ExternalLink, Trash2, RefreshCw, ChevronDown, ChevronUp,
  Loader, History, RotateCcw, ClipboardCheck, GitMerge, HelpCircle, X, Plus
} from 'lucide-react';
import {
  subscribeToVariances, uploadAndScanVariance, uploadRevision,
  deleteVariance, retryVarianceScan, getVarianceExpiryStatus, daysUntilExpiry,
  approveVariance, approveAsRevision, updateVariance, unlinkVarianceFromPlan,
} from '../../services/varianceService';
import { NoiseVariance, VarianceExpiryStatus, User, UserRole, AppConfig, Plan } from '../../types';
import { SEGMENT_STREETS, ALL_STAGES, COMPLETED_STAGES } from '../../constants';
import { VarianceLetterModal } from '../../components/VarianceLetterModal';
import { fmtDate as fmt } from '../../utils/plans';
import { sortStreetsByCorridorOrder, findGapsInCoverage, findExtrasOutsideCorridors } from '../../utils/corridor';

const HOURS_LABEL: Record<string, string> = {
  nighttime: 'Nighttime',
  '24_7':    '24/7 Continuous',
  both:      'Nighttime + 24/7',
};

const HOURS_COLOR: Record<string, string> = {
  nighttime: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  '24_7':    'bg-violet-50 text-violet-700 border-violet-200',
  both:      'bg-purple-50 text-purple-700 border-purple-200',
};

function ExpiryBadge({ status, days }: { status: VarianceExpiryStatus; days: number | null }) {
  if (status === 'unknown')  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-500">Unknown expiry</span>;
  if (status === 'expired')  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-100 text-red-700"><XCircle size={10} /> Expired</span>;
  if (status === 'critical') return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-50 text-red-600"><AlertTriangle size={10} /> {days}d left</span>;
  if (status === 'warning')  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-600"><AlertTriangle size={10} /> {days}d left</span>;
  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700"><CheckCircle size={10} /> Valid</span>;
}

function SegmentPill({ seg }: { seg: string }) {
  const colors: Record<string, string> = {
    A1: 'bg-blue-50 text-blue-700', A2: 'bg-blue-100 text-blue-800',
    B1: 'bg-amber-50 text-amber-700', B2: 'bg-amber-100 text-amber-800', B3: 'bg-amber-200 text-amber-900',
    C1: 'bg-emerald-50 text-emerald-700', C2: 'bg-emerald-100 text-emerald-800', C3: 'bg-emerald-200 text-emerald-900',
  };
  const streets = SEGMENT_STREETS[seg];
  const tooltip = streets ? streets.join(', ') : undefined;
  return (
    <span
      className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold cursor-default ${colors[seg] ?? 'bg-slate-100 text-slate-600'}`}
      title={tooltip}
    >
      {seg}
    </span>
  );
}

// ── Revision history row ──────────────────────────────────────────────────────

function RevisionRow({ v }: { v: NoiseVariance }) {
  return (
    <div className="flex items-center gap-3 py-1.5 pl-3 pr-2">
      <div className="w-px h-4 bg-slate-200 flex-shrink-0" />
      <span className="text-[10px] font-mono font-bold text-slate-400 w-8 flex-shrink-0">
        Rev {v.revisionNumber}
      </span>
      <span className="text-[10px] text-slate-500 flex-1 truncate">
        {v.validFrom ? `${fmt(v.validFrom)} – ${fmt(v.validThrough)}` : fmt(v.validThrough)}
      </span>
      <span className="text-[10px] text-slate-400 flex-shrink-0">
        {fmt(v.uploadedAt.slice(0, 10))}
      </span>
      <a href={v.fileUrl} target="_blank" rel="noopener noreferrer"
        className="flex items-center gap-0.5 text-[10px] text-blue-500 hover:text-blue-700 flex-shrink-0">
        <ExternalLink size={9} /> PDF
      </a>
    </div>
  );
}

// ── Review queue item ─────────────────────────────────────────────────────────

interface ReviewQueueItemProps {
  variance: NoiseVariance;
  allVariances: NoiseVariance[];
  onApproveNew: () => void;
  onApproveRevision: (targetId: string) => void;
  onDelete: () => void;
}

function ReviewQueueItem({ variance: v, allVariances, onApproveNew, onApproveRevision, onDelete }: ReviewQueueItemProps) {
  const [revisionTarget, setRevisionTarget] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [acting, setActing] = useState(false);

  const flags = v.reviewFlags ?? {};
  const liveVariances = allVariances.filter(x => x.scanStatus === 'complete' && !x.isArchived && x.id !== v.id);

  const handleApproveNew = async () => {
    setActing(true);
    try { await onApproveNew(); } finally { setActing(false); }
  };

  const handleApproveRevision = async () => {
    if (!revisionTarget) return;
    setActing(true);
    try { await onApproveRevision(revisionTarget); } finally { setActing(false); }
  };

  return (
    <div className="px-4 py-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-slate-900 dark:text-slate-100 leading-snug">
            {v.title || v.fileName}
          </div>
          {v.permitNumber && (
            <div className="text-[10px] font-mono font-semibold text-slate-400 mt-0.5">
              {v.permitNumber}
            </div>
          )}
        </div>
        <a href={v.fileUrl} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1 text-[11px] font-semibold text-blue-500 hover:text-blue-700 flex-shrink-0 mt-0.5">
          <ExternalLink size={11} /> View PDF
        </a>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 mb-3 p-3 rounded-lg bg-white dark:bg-slate-800 border border-violet-100 dark:border-slate-700">
        <div>
          <div className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-1">Segments</div>
          <div className="flex flex-wrap gap-1">
            {v.coveredSegments.length > 0
              ? v.coveredSegments.map(s => <SegmentPill key={s} seg={s} />)
              : <span className="text-[10px] text-slate-400 italic">—</span>}
          </div>
        </div>
        <div>
          <div className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-1">Hours</div>
          <span className={`inline-block px-1.5 py-0.5 rounded-full border text-[10px] font-semibold ${HOURS_COLOR[v.applicableHours] ?? 'bg-slate-100 text-slate-600 border-slate-200'}`}>
            {HOURS_LABEL[v.applicableHours] ?? v.applicableHours ?? '—'}
          </span>
        </div>
        <div>
          <div className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-1">Valid From</div>
          <div className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">{fmt(v.validFrom)}</div>
        </div>
        <div>
          <div className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-1">Valid Through</div>
          <div className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">{fmt(v.validThrough)}</div>
        </div>
      </div>

      <div className="space-y-2 mb-4">
        {flags.possibleRevision && (
          <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
            <GitMerge size={13} className="text-amber-500 flex-shrink-0 mt-0.5" />
            <div className="min-w-0">
              <div className="text-[11px] font-bold text-amber-800 dark:text-amber-300">Possible revision of existing variance</div>
              <div className="text-[10px] text-amber-700 dark:text-amber-400 mt-0.5">
                Matches: <span className="font-semibold">{flags.possibleRevision.title}</span> — {flags.possibleRevision.reason}
              </div>
            </div>
          </div>
        )}
        {flags.missingFields && flags.missingFields.length > 0 && (
          <div className="flex items-start gap-2 p-2.5 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
            <AlertTriangle size={13} className="text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <div className="text-[11px] font-bold text-red-700 dark:text-red-400">Missing fields</div>
              <div className="text-[10px] text-red-600 dark:text-red-400 mt-0.5">{flags.missingFields.join(', ')}</div>
            </div>
          </div>
        )}
        {flags.lowConfidence && (
          <div className="flex items-start gap-2 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
            <HelpCircle size={13} className="text-slate-400 flex-shrink-0 mt-0.5" />
            <div>
              <div className="text-[11px] font-bold text-slate-600 dark:text-slate-400">Low AI confidence</div>
              <div className="text-[10px] text-slate-500 mt-0.5">AI wasn't confident this is a noise variance. Review the PDF before approving.</div>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={handleApproveNew}
          disabled={acting}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold transition-colors disabled:opacity-50"
        >
          <CheckCircle size={12} /> Approve as New
        </button>
        <div className="flex items-center gap-1">
          <select
            value={revisionTarget}
            onChange={e => setRevisionTarget(e.target.value)}
            className="text-[11px] font-semibold border border-violet-200 dark:border-violet-700 rounded-lg px-2 py-1.5 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-400 min-w-0 max-w-[200px]"
          >
            <option value="">Mark as revision of…</option>
            {liveVariances.map(x => (
              <option key={x.id} value={x.parentVarianceId ?? x.id}>
                {x.title || x.fileName}
              </option>
            ))}
          </select>
          {revisionTarget && (
            <button
              onClick={handleApproveRevision}
              disabled={acting}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-[11px] font-bold transition-colors disabled:opacity-50"
            >
              <GitMerge size={12} /> Confirm
            </button>
          )}
        </div>
        <div className="ml-auto">
          {confirmDelete ? (
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-red-600 font-semibold">Delete?</span>
              <button onClick={onDelete} className="text-[10px] font-bold text-red-600 hover:text-red-800 underline">Yes</button>
              <button onClick={() => setConfirmDelete(false)} className="text-[10px] font-bold text-slate-400 hover:text-slate-600 underline">No</button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-red-500 transition-colors"
            >
              <Trash2 size={12} /> Delete
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Linked plans badge + popover ──────────────────────────────────────────────

const TERMINAL_STAGES = new Set(COMPLETED_STAGES);

/** True if any active (non-completed) plan is linked to this variance root */
function hasActiveLinkedPlans(rootId: string, plans: Plan[]): boolean {
  return plans.some(p => {
    const track = p.compliance?.noiseVariance;
    if (!track) return false;
    const ids = track.linkedVarianceIds?.length
      ? track.linkedVarianceIds
      : track.linkedVarianceId ? [track.linkedVarianceId] : [];
    return ids.includes(rootId) && !TERMINAL_STAGES.has(p.stage);
  });
}

type PlanFilter = 'all' | 'active' | 'closed';

function LinkedPlansBadge({ rootId, plans, setSelectedPlan, canManage }: { rootId: string; plans: Plan[]; setSelectedPlan: (plan: Plan | null) => void; canManage: boolean }) {
  const [open, setOpen] = useState(false);
  const [planFilter, setPlanFilter] = useState<PlanFilter>('all');
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number } | null>(null);
  const [unlinking, setUnlinking] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleOpen = () => {
    if (count === 0) return;
    if (!open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPopoverPos({ top: rect.top - 8, left: rect.left });
    }
    setOpen(o => !o);
  };

  const handleUnlink = async (plan: Plan, e: React.MouseEvent) => {
    e.stopPropagation(); // don't open the plan
    setUnlinking(plan.id);
    try {
      await unlinkVarianceFromPlan(plan, rootId);
    } finally {
      setUnlinking(null);
    }
  };

  const linked = plans.filter(p => {
    const track = p.compliance?.noiseVariance;
    if (!track) return false;
    const ids = track.linkedVarianceIds?.length ? track.linkedVarianceIds : track.linkedVarianceId ? [track.linkedVarianceId] : [];
    return ids.includes(rootId);
  });
  const count = linked.length;
  const activeCount = linked.filter(p => !TERMINAL_STAGES.has(p.stage)).length;
  const closedCount = linked.filter(p => TERMINAL_STAGES.has(p.stage)).length;

  const displayed = planFilter === 'active'
    ? linked.filter(p => !TERMINAL_STAGES.has(p.stage))
    : planFilter === 'closed'
    ? linked.filter(p => TERMINAL_STAGES.has(p.stage))
    : linked;

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        onClick={handleOpen}
        className={`flex items-center gap-1 text-[11px] font-semibold transition-colors ${
          count > 0
            ? 'text-indigo-600 hover:text-indigo-800 cursor-pointer'
            : 'text-slate-300 cursor-default'
        }`}
      >
        <ClipboardCheck size={11} />
        {count} linked plan{count !== 1 ? 's' : ''}
      </button>

      {open && popoverPos && (
        <div
          ref={popoverRef}
          style={{ position: 'fixed', bottom: `calc(100vh - ${popoverPos.top}px)`, left: popoverPos.left, zIndex: 9999 }}
          className="w-80 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xl overflow-hidden">
          {/* Header */}
          <div className="px-3 py-2.5 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200 flex-shrink-0">
              Plans using this variance
            </span>
            <div className="flex items-center gap-1">
              {([
                { id: 'all',    label: `All (${count})` },
                { id: 'active', label: `Active (${activeCount})` },
                { id: 'closed', label: `Closed (${closedCount})` },
              ] as { id: PlanFilter; label: string }[]).map(f => (
                <button
                  key={f.id}
                  onClick={() => setPlanFilter(f.id)}
                  className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors ${
                    planFilter === f.id
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Plan list */}
          <div className="max-h-60 overflow-y-auto divide-y divide-slate-50 dark:divide-slate-700">
            {displayed.length === 0 ? (
              <div className="px-3 py-5 text-[11px] text-slate-400 text-center">
                No plans in this category
              </div>
            ) : displayed.map(p => {
              const stageInfo = ALL_STAGES.find(s => s.key === p.stage) ?? { label: p.stage, color: '#94A3B8' };
              const isUnlinking = unlinking === p.id;
              return (
                <div key={p.id} className="flex items-center gap-1 pr-1 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors group">
                  <button
                    onClick={() => { setSelectedPlan(p); setOpen(false); }}
                    className="flex-1 min-w-0 text-left px-3 py-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] font-bold text-slate-700 dark:text-slate-200 truncate">
                          {p.loc ? `LOC-${p.loc}` : '—'}
                          {p.street1 ? <span className="font-normal text-slate-500 dark:text-slate-400"> · {p.street1}</span> : null}
                        </div>
                        {p.requestedBy && (
                          <div className="text-[10px] text-slate-400 truncate mt-0.5">{p.requestedBy}</div>
                        )}
                      </div>
                      <span
                        className="flex-shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold whitespace-nowrap"
                        style={{ background: stageInfo.color + '22', color: stageInfo.color }}
                      >
                        {stageInfo.label}
                      </span>
                    </div>
                  </button>
                  {canManage && (
                    <button
                      onClick={e => handleUnlink(p, e)}
                      disabled={isUnlinking}
                      title="Unlink this plan"
                      className="flex-shrink-0 p-1 rounded text-slate-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-40 opacity-0 group-hover:opacity-100"
                    >
                      {isUnlinking
                        ? <Loader size={11} className="animate-spin" />
                        : <X size={11} />
                      }
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Variance card ─────────────────────────────────────────────────────────────

function VarianceCard({
  active, history, canManage, onDelete, onRetry, onUploadRevision, appConfig, plans, setSelectedPlan,
}: {
  active: NoiseVariance;
  history: NoiseVariance[];
  canManage: boolean;
  onDelete: (v: NoiseVariance) => void;
  onRetry: (v: NoiseVariance) => void;
  onUploadRevision: (rootId: string) => void;
  appConfig: AppConfig;
  plans: Plan[];
  setSelectedPlan: (plan: Plan | null) => void;
}) {
  const [showHistory, setShowHistory] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [scopeExpanded, setScopeExpanded] = useState(false);
  const [renewalModalOpen, setRenewalModalOpen] = useState(false);
  const [streetInput, setStreetInput] = useState('');

  const expiryStatus = getVarianceExpiryStatus(active);
  const days = daysUntilExpiry(active);
  const isScanning = active.scanStatus === 'scanning';
  const isError = active.scanStatus === 'error';
  const rootId = active.parentVarianceId ?? active.id;

  // Only surface expiry urgency when this NV is actually backing active plans
  const activelyLinked = hasActiveLinkedPlans(rootId, plans);

  const borderColor =
    isError ? 'border-red-200' :
    (activelyLinked && expiryStatus === 'expired')  ? 'border-red-300' :
    (activelyLinked && expiryStatus === 'critical') ? 'border-red-200' :
    (activelyLinked && expiryStatus === 'warning')  ? 'border-amber-200' :
    'border-slate-200';

  return (
    <div className={`bg-white dark:bg-slate-800 rounded-xl border ${borderColor} dark:border-slate-700 overflow-hidden shadow-sm`}>
      {isScanning && (
        <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 dark:bg-blue-900/30 border-b border-blue-100">
          <Loader size={12} className="animate-spin text-blue-500" />
          <span className="text-[11px] font-semibold text-blue-700 dark:text-blue-300">Rafi is reading your doc…</span>
        </div>
      )}
      {isError && (
        <div className="flex items-center justify-between gap-2 px-4 py-2 bg-red-50 border-b border-red-100">
          <div className="flex items-center gap-2 min-w-0">
            <XCircle size={12} className="text-red-500 flex-shrink-0" />
            <span className="text-[11px] font-semibold text-red-700 break-all">
              Scan failed{active.scanError ? `: ${active.scanError}` : ''}
            </span>
          </div>
          <button onClick={() => onRetry(active)} className="text-[11px] font-semibold text-red-600 hover:text-red-800 underline flex-shrink-0 flex items-center gap-1">
            <RefreshCw size={10} /> Retry
          </button>
        </div>
      )}
      {active.revisionNumber > 0 && (
        <div className="flex items-center gap-1.5 px-4 pt-3 pb-0">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-indigo-50 text-indigo-600 border border-indigo-100">
            <RotateCcw size={8} /> Rev {active.revisionNumber}
          </span>
          <span className="text-[10px] text-slate-400">
            {history.length} previous revision{history.length !== 1 ? 's' : ''}
          </span>
        </div>
      )}
      <div className="p-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0 flex-1">
            {/* Permit number is the primary identifier */}
            {active.permitNumber ? (
              <>
                <div className="text-sm font-bold text-slate-900 dark:text-slate-100 leading-snug mb-0.5">
                  {active.permitNumber}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug line-clamp-2">
                  {active.title || active.fileName}
                </div>
              </>
            ) : (
              <div className="text-sm font-bold text-slate-900 dark:text-slate-100 leading-snug mb-0.5">
                {active.title || active.fileName}
              </div>
            )}
          </div>
          <ExpiryBadge status={activelyLinked ? expiryStatus : 'valid'} days={days} />
        </div>
        {!isScanning && active.scanStatus === 'complete' && (
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 mb-3">
            <div>
              <div className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-1">Segments</div>
              <div className="flex flex-wrap gap-1">
                {active.coveredSegments.length > 0
                  ? active.coveredSegments.map(s => <SegmentPill key={s} seg={s} />)
                  : <span className="text-[10px] text-slate-400 italic">Not specified</span>}
              </div>
            </div>
            <div>
              <div className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-1">Applicable Hours</div>
              <span className={`inline-block px-2 py-0.5 rounded-full border text-[10px] font-semibold ${HOURS_COLOR[active.applicableHours] ?? 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                {HOURS_LABEL[active.applicableHours] ?? active.applicableHours}
              </span>
            </div>
            <div>
              <div className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-1">Valid Period</div>
              <div className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                {active.validFrom ? `${fmt(active.validFrom)} – ${fmt(active.validThrough)}` : fmt(active.validThrough)}
              </div>
            </div>
            <div>
              <div className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-1">Scope Coverage</div>
              {active.isGeneric
                ? <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">Generic — All Work Types</span>
                : <div className="flex flex-wrap gap-1">
                    {active.coveredScopes.map(s => (
                      <span key={s} className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">{s}</span>
                    ))}
                  </div>
              }
            </div>
            {/* Street Limits — corridor range label + full editable chip list */}
            {((active.corridors ?? []).length > 0 || (active.coveredStreets ?? []).length > 0 || canManage) && (
              <div className="col-span-2">
                <div className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">Street Limits</div>

                {/* Corridor range label */}
                {(active.corridors ?? []).length > 0 && (
                  <div className="flex flex-col gap-0.5 mb-1.5">
                    {active.corridors!.map((c, i) => (
                      <div key={i} className="flex items-center gap-1 text-[10px]">
                        <span className="font-bold text-sky-700 dark:text-sky-300">{c.mainStreet}</span>
                        <span className="text-slate-400">from</span>
                        <span className="font-semibold text-sky-600">{c.from}</span>
                        <span className="text-slate-400">to</span>
                        <span className="font-semibold text-sky-600">{c.to}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Full street list — four-way classification: verified (green) / in-range (blue) / extra (violet) / gap (amber) */}
                {(() => {
                  const rawStreets = active.coveredStreets ?? [];
                  const corridors = active.corridors ?? [];
                  const hasCorridors = corridors.length > 0;
                  const verifiedSet = new Set((active.verifiedStreets ?? []).map(s => s.toLowerCase()));

                  const gaps   = findGapsInCoverage(corridors, rawStreets);
                  const extras = findExtrasOutsideCorridors(corridors, rawStreets);
                  const extraSet = new Set(extras.map(s => s.toLowerCase()));

                  // Verified streets come first (green) — may be from any category
                  const verifiedList = sortStreetsByCorridorOrder(active.verifiedStreets ?? []);
                  // In-range = covered streets NOT in extras and NOT already verified
                  const inRange = sortStreetsByCorridorOrder(
                    rawStreets.filter(s => !extraSet.has(s.toLowerCase()) && !verifiedSet.has(s.toLowerCase()))
                  );
                  // Extras outside range, not yet verified
                  const extrasSorted = sortStreetsByCorridorOrder(
                    extras.filter(s => !verifiedSet.has(s.toLowerCase()))
                  );
                  // Gaps not yet verified
                  const unverifiedGaps = gaps.filter(s => !verifiedSet.has(s.toLowerCase()));

                  const removeStreet = (st: string) =>
                    updateVariance(active.id, { coveredStreets: rawStreets.filter(s => s !== st) });

                  const verifyStreet = (st: string) =>
                    updateVariance(active.id, { verifiedStreets: [...(active.verifiedStreets ?? []), st] });

                  const unverifyStreet = (st: string) =>
                    updateVariance(active.id, { verifiedStreets: (active.verifiedStreets ?? []).filter(s => s !== st) });

                  // Banner counts exclude already-verified streets
                  const unverifiedExtras = extras.filter(s => !verifiedSet.has(s.toLowerCase()));

                  return (
                    <>
                      {/* Warning banners — only show for unverified issues */}
                      {unverifiedExtras.length > 0 && (
                        <div className="flex items-center gap-1.5 mb-1.5 px-2 py-1 bg-violet-50 border border-violet-200 rounded-lg">
                          <AlertTriangle size={10} className="text-violet-500 flex-shrink-0" />
                          <span className="text-[10px] font-semibold text-violet-700">
                            {unverifiedExtras.length} street{unverifiedExtras.length !== 1 ? 's' : ''} outside the stated corridor range — may be AI over-extraction
                          </span>
                          <a href={active.fileUrl} target="_blank" rel="noopener noreferrer"
                            className="ml-auto text-[10px] font-bold text-violet-600 hover:text-violet-800 flex items-center gap-0.5 flex-shrink-0">
                            <ExternalLink size={9} /> Verify PDF
                          </a>
                        </div>
                      )}
                      {unverifiedGaps.length > 0 && (
                        <div className="flex items-center gap-1.5 mb-1.5 px-2 py-1 bg-amber-50 border border-amber-200 rounded-lg">
                          <AlertTriangle size={10} className="text-amber-500 flex-shrink-0" />
                          <span className="text-[10px] font-semibold text-amber-700">
                            {unverifiedGaps.length} street{unverifiedGaps.length !== 1 ? 's' : ''} missing from stated range — may be AI under-extraction
                          </span>
                          <a href={active.fileUrl} target="_blank" rel="noopener noreferrer"
                            className="ml-auto text-[10px] font-bold text-amber-600 hover:text-amber-800 flex items-center gap-0.5 flex-shrink-0">
                            <ExternalLink size={9} /> Verify PDF
                          </a>
                        </div>
                      )}

                      <div className="flex flex-wrap gap-1 items-center">
                        {/* Verified chips — solid green with ✓, shown first */}
                        {verifiedList.map((st, i) => (
                          <span key={`verified-${i}`}
                            className="inline-flex items-center gap-1 pl-1.5 pr-1 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-300 group"
                            title="Manually verified from PDF"
                          >
                            <CheckCircle size={8} className="flex-shrink-0 text-emerald-500" />
                            {st}
                            {canManage && (
                              <button onClick={() => unverifyStreet(st)}
                                className="opacity-0 group-hover:opacity-100 text-emerald-400 hover:text-red-500 transition-opacity ml-0.5" title="Remove verification">
                                <X size={9} />
                              </button>
                            )}
                          </span>
                        ))}

                        {/* In-range chips — blue, sorted south→north */}
                        {inRange.map((st, i) => (
                          <span key={i}
                            className="inline-flex items-center gap-1 pl-1.5 pr-1 py-0.5 rounded text-[10px] font-semibold bg-sky-50 text-sky-700 border border-sky-200 dark:bg-sky-900/30 dark:text-sky-300 dark:border-sky-700 group"
                          >
                            {st}
                            {canManage && (
                              <button onClick={() => removeStreet(st)}
                                className="opacity-0 group-hover:opacity-100 text-sky-400 hover:text-red-500 transition-opacity ml-0.5" title="Remove">
                                <X size={9} />
                              </button>
                            )}
                          </span>
                        ))}

                        {/* Extra chips — violet dashed, outside stated range */}
                        {hasCorridors && extrasSorted.map((st, i) => (
                          <span key={`extra-${i}`}
                            className="inline-flex items-center gap-1 pl-1.5 pr-1 py-0.5 rounded text-[10px] font-semibold bg-violet-50 text-violet-600 border border-dashed border-violet-300 group"
                            title="Outside stated corridor range — verify in PDF"
                          >
                            <AlertTriangle size={8} className="flex-shrink-0 opacity-60" />
                            {st}
                            {canManage && (<>
                              <button onClick={() => verifyStreet(st)}
                                className="opacity-0 group-hover:opacity-100 text-violet-400 hover:text-emerald-600 transition-opacity" title="Mark as verified from PDF">
                                <CheckCircle size={9} />
                              </button>
                              <button onClick={() => removeStreet(st)}
                                className="opacity-0 group-hover:opacity-100 text-violet-400 hover:text-red-500 transition-opacity" title="Remove">
                                <X size={9} />
                              </button>
                            </>)}
                          </span>
                        ))}

                        {/* Gap chips — amber dashed, missing from range */}
                        {unverifiedGaps.map((st, i) => (
                          <span key={`gap-${i}`}
                            className="inline-flex items-center gap-1 pl-1.5 pr-1 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-600 border border-dashed border-amber-300 group"
                            title="Within stated range but not extracted — verify in PDF"
                          >
                            <AlertTriangle size={8} className="flex-shrink-0" />
                            {st}
                            {canManage && (
                              <button onClick={() => verifyStreet(st)}
                                className="opacity-0 group-hover:opacity-100 text-amber-400 hover:text-emerald-600 transition-opacity ml-0.5" title="Mark as verified from PDF">
                                <CheckCircle size={9} />
                              </button>
                            )}
                          </span>
                        ))}

                        {/* Inline add-street form */}
                        {canManage && (
                          <form onSubmit={e => {
                            e.preventDefault();
                            const val = streetInput.trim();
                            if (!val) return;
                            updateVariance(active.id, { coveredStreets: [...rawStreets, val] });
                            setStreetInput('');
                          }} className="inline-flex items-center gap-1">
                            <input type="text" value={streetInput} onChange={e => setStreetInput(e.target.value)}
                              placeholder="Add street…"
                              className="px-1.5 py-0.5 rounded text-[10px] border border-dashed border-sky-300 text-sky-600 placeholder-sky-300 focus:outline-none focus:border-sky-500 w-24 bg-transparent"
                            />
                            {streetInput.trim() && (
                              <button type="submit"
                                className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-sky-600 text-white hover:bg-sky-700 transition-colors">
                                <Plus size={9} /> Add
                              </button>
                            )}
                          </form>
                        )}

                        {rawStreets.length === 0 && gaps.length === 0 && !canManage && (
                          <span className="text-[10px] text-slate-400 italic">No streets extracted yet — run Rescan</span>
                        )}
                      </div>
                    </>
                  );
                })()}
              </div>
            )}
          </div>
        )}
        {!isScanning && active.scanStatus === 'complete' && canManage && (
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 mb-3 pt-2 border-t border-slate-100 dark:border-slate-700">
            <div>
              <label className="text-[9px] font-bold uppercase tracking-widest text-slate-400 block mb-1">Submitted to Police Commission</label>
              <input type="date" value={active.submittedDate || ''}
                onChange={e => updateVariance(active.id, { submittedDate: e.target.value || undefined })}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 px-2 py-1 text-[11px] outline-none focus:border-indigo-400" />
            </div>
            <div>
              <label className="text-[9px] font-bold uppercase tracking-widest text-slate-400 block mb-1">Approval Date</label>
              <input type="date" value={active.approvalDate || ''}
                onChange={e => updateVariance(active.id, { approvalDate: e.target.value || undefined })}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 px-2 py-1 text-[11px] outline-none focus:border-indigo-400" />
            </div>
            <div>
              <label className="text-[9px] font-bold uppercase tracking-widest text-slate-400 block mb-1">Check Number</label>
              <input type="text" value={active.checkNumber || ''}
                onChange={e => updateVariance(active.id, { checkNumber: e.target.value || undefined })}
                placeholder="Optional"
                className="w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 px-2 py-1 text-[11px] outline-none focus:border-indigo-400" />
            </div>
            <div>
              <label className="text-[9px] font-bold uppercase tracking-widest text-slate-400 block mb-1">Check Amount ($)</label>
              <input type="text" value={active.checkAmount || ''}
                onChange={e => updateVariance(active.id, { checkAmount: e.target.value || undefined })}
                placeholder="553.00"
                className="w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 px-2 py-1 text-[11px] outline-none focus:border-indigo-400" />
            </div>
          </div>
        )}
        {!isScanning && active.scanStatus === 'complete' && !active.isGeneric && active.scopeLanguage && (
          <>
            <button
              onClick={() => setScopeExpanded(e => !e)}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-left mb-2"
            >
              <div className="flex items-center gap-2">
                <AlertTriangle size={12} className="text-amber-500 flex-shrink-0" />
                <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">Specific scope — confirmation required when linking</span>
              </div>
              {scopeExpanded ? <ChevronUp size={12} className="text-amber-500 flex-shrink-0" /> : <ChevronDown size={12} className="text-amber-500 flex-shrink-0" />}
            </button>
            {scopeExpanded && (
              <div className="px-3 py-2 mb-2 rounded-lg bg-amber-50/60 border border-amber-100">
                <div className="text-[9px] font-bold uppercase tracking-widest text-amber-600 mb-1">Verbatim scope language</div>
                <p className="text-[11px] text-slate-700 dark:text-slate-300 italic leading-relaxed">&ldquo;{active.scopeLanguage}&rdquo;</p>
              </div>
            )}
          </>
        )}
        {history.length > 0 && (
          <div className="mb-2">
            <button
              onClick={() => setShowHistory(h => !h)}
              className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-400 hover:text-slate-600 transition-colors"
            >
              <History size={11} />
              {showHistory ? 'Hide' : 'Show'} revision history ({history.length})
              {showHistory ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
            </button>
            {showHistory && (
              <div className="mt-2 border-t border-slate-100 dark:border-slate-700">
                {history.map(v => <RevisionRow key={v.id} v={v} />)}
              </div>
            )}
          </div>
        )}
        <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <LinkedPlansBadge rootId={rootId} plans={plans} setSelectedPlan={setSelectedPlan} canManage={canManage} />
            <span className="text-[10px] text-slate-400">
              Uploaded {fmt(active.uploadedAt.slice(0, 10))} · {active.uploadedBy.split(' ')[0]}
            </span>
          </div>
          <div className="flex items-center gap-3">
            {active.scanStatus === 'complete' && (
              <button
                onClick={() => setRenewalModalOpen(true)}
                className="flex items-center gap-1 text-[11px] font-semibold text-violet-600 hover:text-violet-800 transition-colors"
              >
                ✉ Draft Renewal
              </button>
            )}
            {canManage && active.scanStatus === 'complete' && (
              <button
                onClick={() => onUploadRevision(rootId)}
                className="flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 transition-colors"
              >
                <RotateCcw size={11} /> Upload Revision
              </button>
            )}
            <a href={active.fileUrl} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-800">
              <ExternalLink size={11} /> View PDF
            </a>
            {canManage && (
              confirmDelete ? (
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-red-600 font-semibold">Delete all?</span>
                  <button onClick={() => onDelete(active)} className="text-[10px] font-bold text-red-600 hover:text-red-800 underline">Yes</button>
                  <button onClick={() => setConfirmDelete(false)} className="text-[10px] font-bold text-slate-400 hover:text-slate-600 underline">No</button>
                </div>
              ) : (
                <button onClick={() => setConfirmDelete(true)} className="flex items-center gap-1 text-[11px] font-semibold text-slate-400 hover:text-red-500 transition-colors">
                  <Trash2 size={11} />
                </button>
              )
            )}
          </div>
        </div>
      </div>
      {renewalModalOpen && (
        <VarianceLetterModal
          plan={{
            id: active.id,
            loc: active.permitNumber || active.title || active.id,
            street1: active.coveredSegments.join(', '),
            street2: '',
            segment: active.coveredSegments[0] || '',
          } as any}
          appConfig={appConfig}
          linkedVariance={active}
          isRenewal
          onClose={() => setRenewalModalOpen(false)}
        />
      )}
    </div>
  );
}

// ── Grouping logic ────────────────────────────────────────────────────────────

interface VarianceFamily {
  rootId: string;
  active: NoiseVariance;
  history: NoiseVariance[];
}

function buildFamilies(variances: NoiseVariance[]): VarianceFamily[] {
  const roots = variances.filter(v => !v.parentVarianceId);
  const byRoot: Record<string, NoiseVariance[]> = {};
  for (const v of variances) {
    const rootId = v.parentVarianceId ?? v.id;
    if (!byRoot[rootId]) byRoot[rootId] = [];
    byRoot[rootId].push(v);
  }
  const families: VarianceFamily[] = roots.map(root => {
    const members = byRoot[root.id] ?? [root];
    const sorted = [...members].sort((a, b) => b.revisionNumber - a.revisionNumber);
    const active = sorted.find(v => !v.isArchived) ?? sorted[0];
    const history = sorted.filter(v => v.isArchived);
    return { rootId: root.id, active, history };
  });
  families.sort((a, b) => {
    if (a.active.scanStatus === 'scanning' && b.active.scanStatus !== 'scanning') return -1;
    if (b.active.scanStatus === 'scanning' && a.active.scanStatus !== 'scanning') return 1;
    if (!a.active.validThrough && !b.active.validThrough) return 0;
    if (!a.active.validThrough) return 1;
    if (!b.active.validThrough) return -1;
    return a.active.validThrough.localeCompare(b.active.validThrough);
  });
  return families;
}

// ── Main section ──────────────────────────────────────────────────────────────

interface NoiseVariancesSectionProps {
  currentUser: User | null;
  appConfig: AppConfig;
  plans: Plan[];
  setSelectedPlan: (plan: Plan | null) => void;
}

export const NoiseVariancesSection: React.FC<NoiseVariancesSectionProps> = ({ currentUser, appConfig, plans, setSelectedPlan }) => {
  const [variances, setVariances] = useState<NoiseVariance[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(true);
  const [alertsOpen, setAlertsOpen] = useState(true);
  const newFileRef = useRef<HTMLInputElement>(null);
  const revFileRef = useRef<HTMLInputElement>(null);
  const pendingRevRootId = useRef<string | null>(null);

  const canManage = currentUser?.role === UserRole.ADMIN || currentUser?.role === UserRole.MOT;

  useEffect(() => subscribeToVariances(setVariances), []);

  const handleNewFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const pdfs = Array.from(files).filter(f => f.type === 'application/pdf');
    if (!pdfs.length) { alert('Only PDF files are accepted.'); return; }
    setUploading(true);
    try {
      for (const f of pdfs) await uploadAndScanVariance(f, currentUser?.name ?? 'Unknown');
    } finally { setUploading(false); }
  };

  const handleRevisionFile = async (files: FileList | null) => {
    const rootId = pendingRevRootId.current;
    if (!files?.length || !rootId) return;
    const file = files[0];
    if (file.type !== 'application/pdf') { alert('Only PDF files are accepted.'); return; }
    setUploading(true);
    try {
      await uploadRevision(file, rootId, currentUser?.name ?? 'Unknown');
    } finally {
      setUploading(false);
      pendingRevRootId.current = null;
    }
  };

  const triggerRevisionUpload = (rootId: string) => {
    pendingRevRootId.current = rootId;
    revFileRef.current?.click();
  };

  const handleDeleteFamily = async (active: NoiseVariance) => {
    const rootId = active.parentVarianceId ?? active.id;
    const family = variances.filter(v => v.id === rootId || v.parentVarianceId === rootId);
    for (const v of family) await deleteVariance(v.id);
  };

  const families = buildFamilies(variances);
  const pendingReview = variances.filter(v => v.scanStatus === 'pending_review');
  const alerts = families
    .map(f => f.active)
    .filter(v => {
      const s = getVarianceExpiryStatus(v);
      if (s !== 'warning' && s !== 'critical' && s !== 'expired') return false;
      // Only flag if this NV is actively backing at least one non-completed plan
      const rootId = v.parentVarianceId ?? v.id;
      return hasActiveLinkedPlans(rootId, plans);
    });
  const scanning = variances.filter(v => v.scanStatus === 'scanning').length;
  const errors   = variances.filter(v => v.scanStatus === 'error').length;

  return (
    <div>
      <input ref={newFileRef} type="file" accept="application/pdf" multiple className="hidden"
        onChange={e => { handleNewFiles(e.target.files); e.target.value = ''; }} />
      <input ref={revFileRef} type="file" accept="application/pdf" className="hidden"
        onChange={e => { handleRevisionFile(e.target.files); e.target.value = ''; }} />

      {/* Section header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Upload variance PDFs — Rafi extracts title, segments, scope, and validity. Revisions auto-archive the previous version.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {families.length > 0 && (
            <div className="flex items-center gap-2 text-[11px]">
              <span className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-700 font-semibold text-slate-600 dark:text-slate-300">
                {families.length} variance{families.length !== 1 ? 's' : ''}
              </span>
              {scanning > 0 && (
                <span className="px-2 py-1 rounded-lg bg-blue-50 font-semibold text-blue-600 flex items-center gap-1">
                  <Loader size={10} className="animate-spin" />{scanning} scanning
                </span>
              )}
              {errors > 0 && (
                <span className="px-2 py-1 rounded-lg bg-red-50 font-semibold text-red-600">
                  {errors} error{errors > 1 ? 's' : ''}
                </span>
              )}
            </div>
          )}
          {canManage && (
            <button
              onClick={() => newFileRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold transition-colors disabled:opacity-50"
            >
              <Upload size={14} />
              {uploading ? 'Uploading…' : 'Upload Variance'}
            </button>
          )}
        </div>
      </div>

      {/* Review Queue */}
      {pendingReview.length > 0 && (
        <div className="mb-6 rounded-xl border-2 border-violet-300 dark:border-violet-700 bg-violet-50 dark:bg-violet-900/20 overflow-hidden">
          <button
            onClick={() => setReviewOpen(o => !o)}
            className="w-full flex items-center gap-2 px-4 py-3 border-b border-violet-200 dark:border-violet-700 bg-violet-100 dark:bg-violet-900/40 text-left"
          >
            <ClipboardCheck size={15} className="text-violet-600 dark:text-violet-400 flex-shrink-0" />
            <span className="text-sm font-bold text-violet-800 dark:text-violet-200">
              {pendingReview.length} document{pendingReview.length > 1 ? 's' : ''} pending review
            </span>
            <span className="text-xs text-violet-500 dark:text-violet-400 ml-1 flex-1">
              — AI flagged these before publishing. Confirm or redirect each one.
            </span>
            {reviewOpen ? <ChevronUp size={14} className="text-violet-500 flex-shrink-0" /> : <ChevronDown size={14} className="text-violet-500 flex-shrink-0" />}
          </button>
          {reviewOpen && (
            <div className="divide-y divide-violet-100 dark:divide-violet-800">
              {pendingReview.map(v => (
                <ReviewQueueItem
                  key={v.id}
                  variance={v}
                  allVariances={variances}
                  onApproveNew={() => approveVariance(v.id)}
                  onApproveRevision={(targetId) => approveAsRevision(v.id, targetId)}
                  onDelete={() => deleteVariance(v.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Expiry alerts */}
      {alerts.length > 0 && (
        <div className="mb-6 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 overflow-hidden">
          <button
            onClick={() => setAlertsOpen(o => !o)}
            className="w-full flex items-center gap-2 px-4 py-3 text-left"
          >
            <AlertTriangle size={14} className="text-amber-500 flex-shrink-0" />
            <span className="text-sm font-bold text-amber-800 dark:text-amber-300 flex-1">
              {alerts.length} variance{alerts.length > 1 ? 's' : ''} need{alerts.length === 1 ? 's' : ''} attention
            </span>
            {alertsOpen ? <ChevronUp size={14} className="text-amber-500 flex-shrink-0" /> : <ChevronDown size={14} className="text-amber-500 flex-shrink-0" />}
          </button>
          {alertsOpen && (
            <div className="px-4 pb-4 space-y-2">
              {alerts.map(v => {
                const s = getVarianceExpiryStatus(v);
                const d = daysUntilExpiry(v);
                const isExpired = s === 'expired';
                const isCritical = s === 'critical';
                return (
                  <div key={v.id} className={`flex items-center justify-between gap-3 px-3 py-2 rounded-lg border ${isExpired ? 'bg-red-50 border-red-200' : isCritical ? 'bg-red-50 border-red-100' : 'bg-amber-50 border-amber-100'}`}>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">{v.title || v.fileName}</div>
                      <div className="text-[10px] text-slate-500">
                        Segments: {v.coveredSegments.join(', ') || '—'} · Expires: {fmt(v.validThrough)}
                        {(v.revisionNumber ?? 0) > 0 && <span className="ml-1 text-indigo-500">· Rev {v.revisionNumber}</span>}
                      </div>
                    </div>
                    <div className="flex-shrink-0">
                      {isExpired
                        ? <span className="text-[11px] font-bold text-red-600">EXPIRED</span>
                        : <span className="text-[11px] font-bold text-amber-700">{d}d remaining</span>
                      }
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Empty drop zone */}
      {families.length === 0 && canManage && (
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); handleNewFiles(e.dataTransfer.files); }}
          onClick={() => newFileRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-16 flex flex-col items-center justify-center gap-3 cursor-pointer transition-all ${
            dragOver ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 dark:border-slate-700 hover:border-indigo-300 hover:bg-slate-50 dark:hover:bg-slate-800/50'
          }`}
        >
          <Upload size={32} className={dragOver ? 'text-indigo-400' : 'text-slate-300'} />
          <div className="text-center">
            <div className="text-sm font-bold text-slate-700 dark:text-slate-300">Drop variance PDFs here</div>
            <div className="text-xs text-slate-400 mt-1">Rafi extracts title, segments, scope, and validity dates automatically</div>
          </div>
        </div>
      )}

      {/* Compact drop strip */}
      {families.length > 0 && canManage && (
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); handleNewFiles(e.dataTransfer.files); }}
          onClick={() => newFileRef.current?.click()}
          className={`mb-4 border-2 border-dashed rounded-xl px-4 py-3 flex items-center gap-3 cursor-pointer transition-all text-xs ${
            dragOver ? 'border-indigo-400 bg-indigo-50 text-indigo-600' : 'border-slate-200 dark:border-slate-700 text-slate-400 hover:border-slate-300'
          }`}
        >
          <Upload size={14} />
          <span>Drop new variance PDFs here, or use <strong>Upload Revision</strong> on a card to renew an existing one</span>
        </div>
      )}

      {/* Variance grid */}
      {families.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {families.map(({ rootId, active, history }) => (
            <VarianceCard
              key={rootId}
              active={active}
              history={history}
              canManage={canManage}
              onDelete={handleDeleteFamily}
              onRetry={retryVarianceScan}
              onUploadRevision={triggerRevisionUpload}
              appConfig={appConfig}
              plans={plans}
              setSelectedPlan={setSelectedPlan}
            />
          ))}
        </div>
      )}

      {families.length === 0 && !canManage && (
        <div className="text-center py-16 text-slate-400 dark:text-slate-500">
          <FileWarning size={32} className="mx-auto mb-3 opacity-30" />
          <div className="text-sm font-semibold">No variances in library yet</div>
          <div className="text-xs mt-1">An admin or MOT member will add variance documents here.</div>
        </div>
      )}
    </div>
  );
};
