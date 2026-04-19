import React, { useState } from 'react';
import { AlertTriangle, Info, ArrowRight, RefreshCw } from 'lucide-react';
import { formatPlanLoc } from '../../utils/plans';
import type { Plan } from '../../types';
import { isPlanExpired, SimilarityResult } from './similarity';

// ── Expanded detail grid (shared between exact + near cards) ──────────────────

function PlanDetails({ plan, tintClass }: { plan: Plan; tintClass: string }) {
  const winStart = plan.implementationWindow?.startDate || plan.softImplementationWindow?.startDate;
  const winEnd   = plan.implementationWindow?.endDate   || plan.softImplementationWindow?.endDate;
  return (
    <div className={`border-t px-3 py-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[10px] ${tintClass}`}>
      {plan.type        && <div><span className="font-bold text-slate-500">Type</span> <span className="text-slate-700">{plan.type}</span></div>}
      {plan.lead        && <div><span className="font-bold text-slate-500">Lead</span> <span className="text-slate-700">{plan.lead}</span></div>}
      {plan.priority    && <div><span className="font-bold text-slate-500">Priority</span> <span className="text-slate-700">{plan.priority}</span></div>}
      {plan.requestedBy && <div><span className="font-bold text-slate-500">Requested by</span> <span className="text-slate-700">{plan.requestedBy}</span></div>}
      {(winStart || winEnd) && (
        <div className="col-span-2">
          <span className="font-bold text-slate-500">Window</span>{' '}
          <span className="text-slate-700">{winStart ?? '—'} → {winEnd ?? '—'}</span>
        </div>
      )}
      {plan.scope && (
        <div className="col-span-2">
          <span className="font-bold text-slate-500">Scope</span>{' '}
          <span className="text-slate-700">{plan.scope}</span>
        </div>
      )}
      {plan.notes && (
        <div className="col-span-2">
          <span className="font-bold text-slate-500">Notes</span>{' '}
          <span className="text-slate-600 italic line-clamp-2">{plan.notes}</span>
        </div>
      )}
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface SimilarPlansBannerProps {
  similarity: SimilarityResult;
  acknowledged: boolean;
  onAcknowledgedChange: (v: boolean) => void;
  /** LOC of the plan being renewed (when this request is a renewal) */
  parentLocId?: string;
  /** Current form.loc — shown in the "Renewal: LOC-…" label */
  currentLoc?: string;
  onNavigateToPlan: (locId: string) => void;
  onRenewPlan: (plan: Plan) => void;
}

export const SimilarPlansBanner: React.FC<SimilarPlansBannerProps> = ({
  similarity,
  acknowledged,
  onAcknowledgedChange,
  parentLocId,
  currentLoc,
  onNavigateToPlan,
  onRenewPlan,
}) => {
  const [expandedPlanId, setExpandedPlanId] = useState<string | null>(null);

  if (similarity.exact.length === 0 && similarity.near.length === 0) return null;

  return (
    <div className="px-7 py-4 space-y-3">

      {/* Exact matches — hard warning */}
      {similarity.exact.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-100 border-b border-amber-200">
            <AlertTriangle size={13} className="text-amber-600 flex-shrink-0" />
            <span className="text-[11px] font-bold text-amber-800 uppercase tracking-wide">
              Similar Plans Found — Review Required
            </span>
          </div>
          <div className="p-3 space-y-2">
            {similarity.exact.map(p => {
              const expired = isPlanExpired(p);
              const isRenewal = !!parentLocId && parentLocId === p.id;
              const isExpanded = expandedPlanId === p.id;
              return (
                <div key={p.id} className="bg-white rounded-lg border border-amber-100 overflow-hidden">
                  <div className="flex items-center gap-2 px-3 py-2">
                    <button
                      type="button"
                      onClick={() => setExpandedPlanId(isExpanded ? null : p.id)}
                      className="flex-1 min-w-0 text-left"
                    >
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[12px] font-bold text-slate-800 font-mono">{p.loc || p.id}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold bg-slate-100 text-slate-600">{p.stage}</span>
                        {expired && <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold bg-red-100 text-red-600">Expired</span>}
                        <span className="text-[10px] text-slate-400 ml-auto">{isExpanded ? '▲' : '▼'}</span>
                      </div>
                      <p className="text-[10px] text-slate-500 mt-0.5 truncate">
                        {p.street1}{p.street2 ? ` / ${p.street2}` : ''}{p.scope ? ` · ${p.scope}` : ''}
                      </p>
                    </button>
                    <div className="flex-shrink-0">
                      {expired ? (
                        isRenewal ? (
                          <span className="text-[10px] font-bold text-emerald-600 flex items-center gap-1">
                            <RefreshCw size={10} /> Renewal: {currentLoc}
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onRenewPlan(p)}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-600 text-white text-[10px] font-bold hover:bg-indigo-700 transition-colors"
                          >
                            <RefreshCw size={10} /> Request Renewal
                          </button>
                        )
                      ) : (
                        <button
                          type="button"
                          onClick={() => onNavigateToPlan(p.loc || p.id)}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 text-white text-[10px] font-bold hover:bg-slate-600 transition-colors"
                        >
                          <ArrowRight size={10} /> Use This Plan
                        </button>
                      )}
                    </div>
                  </div>
                  {isExpanded && <PlanDetails plan={p} tintClass="border-amber-100 bg-amber-50/60" />}
                </div>
              );
            })}
            {!acknowledged && (
              <label className="flex items-start gap-2 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={acknowledged}
                  onChange={e => onAcknowledgedChange(e.target.checked)}
                  className="mt-0.5 w-3.5 h-3.5 rounded accent-amber-600 flex-shrink-0"
                />
                <span className="text-[11px] text-amber-800 font-semibold leading-snug">
                  I have reviewed these plans and confirm this request is not a duplicate.
                </span>
              </label>
            )}
            {acknowledged && (
              <div className="flex items-center gap-1.5 pt-1">
                <div className="w-3.5 h-3.5 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0">
                  <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                    <path d="M1.5 4l2 2 3-3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <span className="text-[11px] text-emerald-700 font-semibold">Acknowledged — you may proceed.</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Near matches — informational */}
      {similarity.near.length > 0 && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2 bg-blue-100 border-b border-blue-200">
            <Info size={12} className="text-blue-500 flex-shrink-0" />
            <span className="text-[11px] font-bold text-blue-700 uppercase tracking-wide">Nearby Plans (informational)</span>
          </div>
          <div className="p-3 space-y-1.5">
            {similarity.near.slice(0, 4).map(p => {
              const isExpanded = expandedPlanId === p.id;
              return (
                <div key={p.id} className="bg-white rounded-lg border border-blue-100 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setExpandedPlanId(isExpanded ? null : p.id)}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-left"
                  >
                    <div className="flex-1 min-w-0">
                      <span className="text-[11px] font-bold text-slate-700 font-mono">{formatPlanLoc(p)}</span>
                      <span className="text-[10px] text-slate-400 ml-1.5">{p.street1}{p.street2 ? ` / ${p.street2}` : ''}</span>
                    </div>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium">{p.stage}</span>
                    <span className="text-[10px] text-slate-300">{isExpanded ? '▲' : '▼'}</span>
                  </button>
                  {isExpanded && <PlanDetails plan={p} tintClass="border-blue-100 bg-blue-50/50" />}
                </div>
              );
            })}
          </div>
        </div>
      )}

    </div>
  );
};
