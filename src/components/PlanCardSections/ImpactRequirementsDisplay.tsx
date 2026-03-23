import React from 'react';
import { MOT_FIELDS, IMPACT_FIELDS } from '../../constants';
import { usePlanData, usePlanActions } from '../PlanCardContext';
import { Plan } from '../../types';

export const ImpactRequirementsDisplay: React.FC = React.memo(() => {
  const { selectedPlan } = usePlanData();
  const { updatePlanField } = usePlanActions();

  return (
    <div className="mt-5">
      
      {/* BOE / BOARD OF PUBLIC WORKS TRIGGERS */}
      <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 mb-4">
        <div className="text-[10px] font-bold text-amber-700 uppercase tracking-wider mb-3">BOE / BOARD OF PUBLIC WORKS TRIGGERS</div>
        {MOT_FIELDS.map((field) => (
          <div key={field.key} className="flex items-center justify-between py-2 border-b border-slate-200 last:border-0 text-xs">
            <span className="text-slate-700">{field.label}</span>
            <div className="flex bg-white rounded-md border border-slate-200 overflow-hidden">
              <button 
                onClick={() => updatePlanField(selectedPlan.id, field.key, true)}
                className={`px-3 py-1 text-[10px] font-bold border-r border-slate-200 ${selectedPlan[field.key as keyof Plan] === true ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
              >
                Yes
              </button>
              <button 
                onClick={() => updatePlanField(selectedPlan.id, field.key, false)}
                className={`px-3 py-1 text-[10px] font-bold ${selectedPlan[field.key as keyof Plan] === false ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
              >
                No
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Checkboxes */}
      <div className="grid grid-cols-2 gap-2">
        {IMPACT_FIELDS.map((field) => (
          <label key={field.key} className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
            <input 
              type="checkbox"
              checked={!!selectedPlan[field.key as keyof Plan]}
              onChange={(e) => updatePlanField(selectedPlan.id, field.key, e.target.checked)}
              className="rounded border-slate-300 text-slate-900 focus:ring-slate-500"
            />
            {field.label}
          </label>
        ))}
      </div>
    </div>
  );
});
