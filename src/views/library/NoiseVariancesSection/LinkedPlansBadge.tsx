import React, { useEffect, useRef, useState } from 'react';
import { ClipboardCheck, Loader, X } from 'lucide-react';
import type { Plan } from '../../../types';
import { ALL_STAGES } from '../../../constants';
import { unlinkVarianceFromPlan } from '../../../services/varianceService';
import { formatPlanLoc } from '../../../utils/plans';
import { TERMINAL_STAGES } from './families';

type PlanFilter = 'all' | 'active' | 'closed';

/**
 * "N linked plans" pill with a click-to-open popover listing each plan. The
 * popover supports filtering by lifecycle (all / active / closed), jumping
 * into a plan (calls `setSelectedPlan`), and — if the user has manage rights
 * — unlinking a plan from the variance root.
 *
 * Popover position is computed on open via `getBoundingClientRect()` and
 * rendered as fixed-positioned (escapes table overflow).
 */
export function LinkedPlansBadge({ rootId, plans, setSelectedPlan, canManage }: { rootId: string; plans: Plan[]; setSelectedPlan: (plan: Plan | null) => void; canManage: boolean }) {
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
                          {formatPlanLoc(p)}
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
