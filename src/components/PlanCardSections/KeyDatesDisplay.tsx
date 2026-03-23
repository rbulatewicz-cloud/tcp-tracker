import React from 'react';
import { FIELD_REGISTRY, STAGES } from '../../constants';
import { usePlanData, usePlanActions, usePlanPermissions } from '../PlanCardContext';

export const KeyDatesDisplay: React.FC = React.memo(() => {
  const { selectedPlan } = usePlanData();
  const { updatePlanField } = usePlanActions();
  const { currentUser, UserRole } = usePlanPermissions();
  const dateFields = ['dateRequested', 'submitDate', 'approvedDate', 'needByDate'];

  const dateToStatusMap: Record<string, string> = {
    dateRequested: 'requested',
    submitDate: 'submitted',
    approvedDate: 'approved',
    needByDate: 'requested',
  };

  return (
    <div className="pb-4 mb-4">
      <div className="grid grid-cols-2 gap-4">
        {dateFields.map((key) => {
          const field = FIELD_REGISTRY[key];
          if (!field) return null;
          
          const statusKey = dateToStatusMap[key];
          const stage = STAGES.find(s => s.key === statusKey);
          const color = stage ? stage.color : '#cbd5e1'; // Default slate-300

          return (
            <div key={key} className="flex flex-col gap-1">
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                {field.label}
              </div>
              <div className="relative">
                <div 
                  className="absolute left-0 top-0 bottom-0 w-1 rounded-l-md"
                  style={{ backgroundColor: color }}
                />
                <input 
                  type="date" 
                  value={selectedPlan[key === 'dateRequested' ? 'dateRequested' : key as keyof typeof selectedPlan] as string || (key === 'dateRequested' ? selectedPlan.requestDate : "") || ""} 
                  onChange={(e) => updatePlanField(selectedPlan.id, key, e.target.value)}
                  className="text-xs font-semibold text-slate-900 bg-white border border-slate-200 rounded-md p-2 w-full pl-3"
                />
              </div>
              {selectedPlan[key as keyof typeof selectedPlan] && (currentUser?.role === UserRole.ADMIN || currentUser?.role === UserRole.MOT) && (
                <button 
                  onClick={() => updatePlanField(selectedPlan.id, key, "")}
                  className="bg-red-50 text-red-700 border-none px-1.5 py-0.5 rounded text-[9px] cursor-pointer mt-0.5 self-start"
                >
                  Clear
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
});
