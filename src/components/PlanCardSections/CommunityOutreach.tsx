import React from 'react';
import { usePlanData, usePlanActions, usePlanPermissions } from '../PlanCardContext';

export const CommunityOutreach: React.FC = React.memo(() => {
  const { selectedPlan } = usePlanData();
  const { updatePlanField } = usePlanActions();
  const { canEditPlan } = usePlanPermissions();

  if (!selectedPlan) return null;

  const outreach = selectedPlan.outreach || { status: 'Not Started', notes: '' };

  return (
    <div className="pb-4 mb-4">
      
      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Status</label>
          {canEditPlan ? (
            <select 
              value={outreach.status}
              onChange={(e) => updatePlanField(selectedPlan.id, 'outreach', { ...outreach, status: e.target.value })}
              className="text-xs font-semibold text-slate-900 bg-white border border-slate-200 rounded-md p-2 w-full"
            >
              {['Not Started', 'In Progress', 'Completed', 'N/A'].map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          ) : (
            <div className="text-xs font-semibold text-slate-900 p-2">{outreach.status}</div>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Notes</label>
          {canEditPlan ? (
            <textarea 
              value={outreach.notes || ''}
              onChange={(e) => updatePlanField(selectedPlan.id, 'outreach', { ...outreach, notes: e.target.value })}
              className="w-full bg-white rounded-md p-2 text-xs text-slate-900 border border-slate-200 min-h-[60px]"
              placeholder="Outreach notes..."
            />
          ) : (
            <div className="text-xs font-semibold text-slate-900 p-2">{outreach.notes || '—'}</div>
          )}
        </div>
      </div>
    </div>
  );
});
