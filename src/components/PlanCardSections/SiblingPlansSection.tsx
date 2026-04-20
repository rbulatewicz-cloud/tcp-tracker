import React, { useMemo, useState } from 'react';
import { Link2, Plus, AlertTriangle } from 'lucide-react';
import { useApp } from '../../hooks/useApp';
import { usePlanData, usePlanPermissions } from '../PlanCardContext';
import { linkPlansAsSiblings, unlinkPlanFromGroup } from '../../services/planService';
import { showToast } from '../../lib/toast';
import { Plan } from '../../types';

/**
 * Sibling LOCs are plans that cover the same work at the same time
 * (e.g. phased permits). They share a `planGroupId` so that downstream
 * outreach (driveway notices, CD concurrence) can treat them as one unit.
 *
 * This section lets CR link the current plan to other LOCs as siblings
 * and see who the existing siblings are.
 */
export const SiblingPlansSection: React.FC = () => {
  const { selectedPlan } = usePlanData();
  const { canEditPlan } = usePlanPermissions();
  const { firestoreData } = useApp();
  const allPlans: Plan[] = firestoreData?.plans ?? [];

  const [query, setQuery] = useState('');
  const [busy,  setBusy]  = useState(false);

  if (!selectedPlan) return null;

  const groupId = selectedPlan.planGroupId;
  const siblings = useMemo(() => {
    if (!groupId) return [];
    return allPlans.filter(p => p.planGroupId === groupId && p.id !== selectedPlan.id);
  }, [groupId, allPlans, selectedPlan.id]);

  // Matches for the "link" input — excludes current plan, current siblings, and cancelled/closed plans
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const excludeIds = new Set<string>([selectedPlan.id, ...siblings.map(s => s.id)]);
    return allPlans
      .filter(p => !excludeIds.has(p.id))
      .filter(p => !['closed', 'cancelled'].includes(p.stage))
      .filter(p => {
        const hay = `${p.loc} ${p.street1} ${p.street2} ${p.scope}`.toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 6);
  }, [query, allPlans, selectedPlan.id, siblings]);

  async function linkPlan(other: Plan) {
    if (busy) return;
    setBusy(true);
    try {
      await linkPlansAsSiblings(
        [selectedPlan.id, other.id],
        [selectedPlan.planGroupId, other.planGroupId],
      );
      showToast(`Linked ${other.loc} as a sibling.`, 'success');
      setQuery('');
    } catch (e) {
      showToast(`Link failed: ${(e as Error).message}`, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function unlink() {
    if (busy) return;
    setBusy(true);
    try {
      await unlinkPlanFromGroup(selectedPlan.id);
      showToast('Removed from sibling group.', 'success');
    } catch (e) {
      showToast(`Unlink failed: ${(e as Error).message}`, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="px-7 py-4 space-y-3">
      {/* Current group members */}
      {siblings.length > 0 ? (
        <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2.5 space-y-2">
          <div className="flex items-center gap-2">
            <Link2 size={12} className="text-indigo-500" />
            <span className="text-[10px] font-bold text-indigo-700 uppercase tracking-wide">
              Sibling LOCs · {siblings.length}
            </span>
            {canEditPlan && (
              <button
                onClick={unlink}
                disabled={busy}
                className="ml-auto text-[10px] font-semibold text-indigo-500 hover:text-red-600 transition-colors disabled:opacity-40"
                title="Remove this plan from the sibling group"
              >
                Unlink this plan
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {siblings.map(s => (
              <span
                key={s.id}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white border border-indigo-200 text-[11px] font-semibold text-indigo-700"
                title={`${s.street1}${s.street2 ? ' / ' + s.street2 : ''}`}
              >
                {s.loc}
              </span>
            ))}
          </div>
          <p className="text-[10px] text-indigo-700/80 leading-relaxed">
            A driveway notice sent on any sibling plan can cover all members.
          </p>
        </div>
      ) : groupId ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 flex items-center gap-2">
          <AlertTriangle size={12} className="text-amber-600 shrink-0" />
          <span className="text-[11px] text-amber-800">
            Grouped but no visible siblings. The other members may be closed or filtered out.
          </span>
          {canEditPlan && (
            <button
              onClick={unlink}
              disabled={busy}
              className="ml-auto text-[10px] font-semibold text-amber-700 hover:text-red-600 disabled:opacity-40"
            >
              Unlink
            </button>
          )}
        </div>
      ) : (
        <p className="text-[11px] text-slate-400 italic">Not part of a sibling group.</p>
      )}

      {/* Link to another LOC */}
      {canEditPlan && (
        <div>
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block mb-1">
            Link as sibling LOC
          </label>
          <div className="relative">
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search LOC number, street, or scope…"
              className="w-full rounded border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[12px] outline-none focus:border-indigo-400 focus:bg-white"
            />
            {matches.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-10 overflow-hidden">
                {matches.map(p => (
                  <button
                    key={p.id}
                    onClick={() => linkPlan(p)}
                    disabled={busy}
                    className="w-full text-left px-3 py-2 text-[12px] hover:bg-indigo-50 disabled:opacity-40 flex items-center gap-2"
                  >
                    <Plus size={10} className="text-indigo-500 shrink-0" />
                    <span className="font-semibold text-slate-800">{p.loc}</span>
                    <span className="text-slate-500 text-[11px] truncate">
                      {p.street1}{p.street2 && ` / ${p.street2}`}
                    </span>
                    {p.planGroupId && (
                      <span className="ml-auto text-[10px] text-indigo-600 font-semibold shrink-0">
                        already grouped
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
            {query.trim() && matches.length === 0 && (
              <p className="mt-1 text-[10px] text-slate-400 italic">No plans match.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
