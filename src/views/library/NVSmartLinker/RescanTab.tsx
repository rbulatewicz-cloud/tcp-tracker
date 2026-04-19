import { RefreshCw } from 'lucide-react';
import type { NoiseVariance } from '../../../types';

export interface RescanProgress {
  done: number;
  total: number;
  current: string;
}

export interface RescanError {
  id: string;
  title: string;
  error: string;
}

/**
 * Batch-rescan panel — re-runs AI extraction on every active variance PDF so
 * their `coveredStreets` field is populated. Shows a list of variances with
 * current extraction state, a progress bar during the run, any errors, and
 * the trigger button. Submission tracking (permit dates, check numbers) is
 * preserved by the service — only AI-derived fields get overwritten.
 *
 * Parent owns all state; this component is a pure view.
 */
export function RescanTab({
  activeVariances,
  rescanProgress,
  rescanErrors,
  rescanning,
  onRescanAll,
}: {
  activeVariances: NoiseVariance[];
  rescanProgress: RescanProgress | null;
  rescanErrors: RescanError[];
  rescanning: boolean;
  onRescanAll: () => void;
}) {
  return (
    <div className="max-w-xl">
      <div className="mb-4">
        <h3 className="text-sm font-bold text-slate-800 mb-1">Re-scan all variance documents</h3>
        <p className="text-[12px] text-slate-500 leading-relaxed">
          Re-runs the AI extraction on every variance PDF to populate the new <strong>coveredStreets</strong> field.
          This improves match scores in the Link Plans tab. Submission tracking data (permit dates, check numbers) is never overwritten.
        </p>
      </div>

      {/* Variance list */}
      <div className="border border-slate-200 rounded-xl overflow-hidden mb-4">
        <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 flex items-center justify-between">
          <span className="text-[11px] font-bold text-slate-600">{activeVariances.length} active variances</span>
          <span className="text-[11px] text-slate-400">
            {activeVariances.filter(v => (v.coveredStreets ?? []).length > 0).length} already have street data
          </span>
        </div>
        <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
          {activeVariances.map(v => {
            const hasStreets = (v.coveredStreets ?? []).length > 0;
            return (
              <div key={v.id} className="flex items-center gap-3 px-4 py-2.5">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${hasStreets ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-semibold text-slate-700 truncate">{v.permitNumber || v.title}</div>
                  {hasStreets ? (
                    <div className="flex flex-wrap gap-0.5 mt-0.5">{(v.coveredStreets ?? []).map((s,i) => <span key={i} className="px-1 py-0.5 rounded text-[9px] font-semibold bg-sky-50 text-sky-700 border border-sky-100">{s}</span>)}</div>
                  ) : (
                    <div className="text-[10px] text-amber-600">No street data — will be populated on rescan</div>
                  )}
                </div>
                {v.scanStatus === 'scanning' && (
                  <RefreshCw size={12} className="text-blue-500 animate-spin flex-shrink-0" />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Progress bar */}
      {rescanProgress && (
        <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
          <div className="flex items-center justify-between mb-1.5 text-[11px] font-semibold text-blue-700">
            <span>{rescanProgress.done < rescanProgress.total ? `Scanning: ${rescanProgress.current}` : 'Rescan complete'}</span>
            <span>{rescanProgress.done} / {rescanProgress.total}</span>
          </div>
          <div className="h-1.5 bg-blue-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-300"
              style={{ width: `${(rescanProgress.done / rescanProgress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Errors */}
      {rescanErrors.length > 0 && (
        <div className="mb-4 p-3 bg-red-50 rounded-lg border border-red-200">
          <div className="text-[11px] font-bold text-red-700 mb-1">{rescanErrors.length} error{rescanErrors.length !== 1 ? 's' : ''}</div>
          {rescanErrors.map(e => (
            <div key={e.id} className="text-[10px] text-red-600">{e.title}: {e.error}</div>
          ))}
        </div>
      )}

      <button
        onClick={onRescanAll}
        disabled={rescanning}
        className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold transition-all ${
          rescanning
            ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
            : 'bg-slate-900 text-white hover:bg-slate-700 cursor-pointer'
        }`}
      >
        <RefreshCw size={14} className={rescanning ? 'animate-spin' : ''} />
        {rescanning ? 'Scanning…' : `Rescan all ${activeVariances.length} variances`}
      </button>
    </div>
  );
}
