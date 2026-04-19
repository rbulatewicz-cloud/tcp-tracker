import { useState } from 'react';
import { ExternalLink, CheckCircle, AlertTriangle, GitMerge, HelpCircle, Trash2 } from 'lucide-react';
import type { NoiseVariance } from '../../../types';
import { fmtDate as fmt } from '../../../utils/plans';
import { SegmentPill, HOURS_LABEL, HOURS_COLOR } from './Badges';

interface ReviewQueueItemProps {
  variance: NoiseVariance;
  allVariances: NoiseVariance[];
  onApproveNew: () => void;
  onApproveRevision: (targetId: string) => void;
  onDelete: () => void;
}

/**
 * Review-queue card for a scanned-but-unapproved variance. Shows parsed
 * metadata (segments, hours, validity), any review flags (possible revision,
 * missing fields, low AI confidence), and action buttons to approve as new,
 * approve as a revision of an existing live variance, or delete.
 *
 * Parent wires `onApproveNew`/`onApproveRevision`/`onDelete` to Firestore calls.
 */
export function ReviewQueueItem({ variance: v, allVariances, onApproveNew, onApproveRevision, onDelete }: ReviewQueueItemProps) {
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
