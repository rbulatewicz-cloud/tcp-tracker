import React from 'react';
import { IMPACT_FIELDS } from '../../constants';
import { usePlanData, usePlanActions, usePlanPermissions } from '../PlanCardContext';
import { Plan } from '../../types';

export const ImpactRequirementsDisplay: React.FC = React.memo(() => {
  const { selectedPlan } = usePlanData();
  const { updatePlanField } = usePlanActions();
  const { canEditPlan } = usePlanPermissions();

  return (
    <div className="mt-5">
      {/* Checkboxes */}
      <div className="grid grid-cols-2 gap-2">
        {IMPACT_FIELDS.map((field) => (
          <label key={field.key} className={`flex items-center gap-2 text-xs text-slate-700 ${canEditPlan ? 'cursor-pointer' : 'cursor-default opacity-60'}`}>
            <input
              type="checkbox"
              checked={!!selectedPlan[field.key as keyof Plan]}
              onChange={(e) => canEditPlan && updatePlanField(selectedPlan.id, field.key, e.target.checked)}
              disabled={!canEditPlan}
              className="rounded border-slate-300 text-slate-900 focus:ring-slate-500 disabled:cursor-not-allowed"
            />
            {field.label}
          </label>
        ))}
      </div>
    </div>
  );
});
