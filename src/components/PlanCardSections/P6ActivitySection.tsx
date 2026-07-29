/**
 * Plan card section: P6 schedule activities this plan affects.
 *
 * Display + edit in one component.
 *   • Plans created after the feature shipped: required at request time, so the
 *     array is populated. Render as indigo chips.
 *   • Grandfathered plans (created before): no link yet. Render an amber
 *     "Missing P6 link" prompt with an inline picker for editors to fill in.
 *
 * The denormalized {id, name, wbsPath} snapshot stored on the plan means the
 * chips render even if the activity is no longer in the latest phonebook.
 */

import React, { useState } from 'react';
import { Pencil, AlertCircle } from 'lucide-react';
import { usePlanData, usePlanActions, usePlanPermissions } from '../PlanCardContext';
import { P6ActivityPicker, P6PickerValue } from '../P6ActivityPicker';

export const P6ActivitySection: React.FC = () => {
  const { selectedPlan } = usePlanData();
  const { updatePlanField } = usePlanActions();
  const { canEditFields } = usePlanPermissions();
  const [editing, setEditing] = useState(false);

  if (!selectedPlan) return null;

  const activities = (selectedPlan.p6Activities ?? []) as P6PickerValue[];
  const hasLink = activities.length > 0;

  const save = async (next: P6PickerValue[]) => {
    // Persist as a draft edit — same pattern as other field updates (saved
    // on "Save changes" via PlanCardActions).
    await updatePlanField(selectedPlan.id, 'p6Activities', next);
  };

  // Read-only view: chips + (if missing) badge prompting the link
  if (!editing) {
    return (
      <div>
        {hasLink ? (
          <div>
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                Affects {activities.length} P6 {activities.length === 1 ? 'Activity' : 'Activities'}
              </div>
              {canEditFields && (
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-400 hover:text-indigo-600 transition-colors"
                >
                  <Pencil size={10} /> Edit
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {activities.map(a => (
                <span
                  key={a.id}
                  className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-800 dark:bg-indigo-900/30 dark:border-indigo-800/50 dark:text-indigo-200"
                  title={a.name ? `${a.name}${a.wbsPath ? '\n' + a.wbsPath : ''}` : a.id}
                >
                  <span className="font-mono">{a.id}</span>
                  {a.name && (
                    <span className="font-normal text-indigo-600 dark:text-indigo-300 max-w-[220px] truncate">
                      {a.name}
                    </span>
                  )}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-900/20 dark:border-amber-800/40 dark:text-amber-200">
            <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <div className="font-semibold mb-0.5">No P6 schedule link</div>
              <div className="text-amber-700 dark:text-amber-300">
                This plan predates the schedule-link requirement. Linking it lets
                schedulers see which TCPs gate each P6 activity.
              </div>
            </div>
            {canEditFields && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="flex-shrink-0 text-[11px] font-bold text-amber-700 hover:text-amber-900 underline"
              >
                Link now
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  // Edit mode: picker + Done button
  return (
    <div className="space-y-3">
      <P6ActivityPicker value={activities} onChange={save} />
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="px-3 py-1.5 text-[11px] font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors"
        >
          Done
        </button>
      </div>
    </div>
  );
};
