import React from 'react';
import { PermissionToggle } from '../permissions/PermissionToggle';
import { usePlanCard } from './PlanCardContext';
import { Plan } from '../types';

export const PlanHeader: React.FC = () => {
  const {
    selectedPlan,
    handleClosePlanCard,
    deletePlan,
    canView,
    currentUser,
    UserRole,
    isPermissionEditingMode,
    fieldPermissions,
    setFieldPermissions,
    updatePlanField,
    handleExportPlanToPDF
  } = usePlanCard();

  const calculateDaysOpen = (plan: Plan) => {
    const requestDate = plan.dateRequested || plan.requestDate;
    if (!requestDate) return 0;
    const start = new Date(requestDate);
    if (isNaN(start.getTime())) return 0;
    const end = plan.stage === 'approved' && plan.approvedDate ? new Date(plan.approvedDate) : new Date();
    const diffTime = Math.abs(end.getTime() - start.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  const daysOpen = calculateDaysOpen(selectedPlan);

  return (
    <div className="pb-2 mb-2">
      {/* Row 1: Plan ID + Days Open badge */}
      <div className="flex justify-between items-start mb-2">
        <div className="text-[22px] font-bold text-slate-900">{selectedPlan.id}</div>
        <div className="flex items-center gap-1.5 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-100">
          <span className="text-sm font-bold text-amber-700">{daysOpen}</span>
          <span className="text-[9px] text-amber-700 font-bold uppercase tracking-wider">days open</span>
        </div>
      </div>
      
      {/* Row 2: Cross streets + action buttons */}
      <div className="flex justify-between items-end">
        <div>
          <div className="text-base font-semibold text-slate-900 mb-1">
            {selectedPlan.street1} <span className="text-slate-400 font-normal">/</span> {selectedPlan.street2}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-slate-400 font-bold uppercase">LOC #</span>
            <span className="text-xs text-slate-700 border-b border-dashed border-slate-400 pb-0.5 min-w-[50px] inline-block font-mono">
              {selectedPlan.loc || "—"}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {(currentUser?.role === UserRole.ADMIN || currentUser?.role === UserRole.MOT) && (
            <button onClick={() => deletePlan(selectedPlan.id)} className="text-[11px] px-3 py-1 bg-red-50 text-red-600 rounded-md cursor-pointer border border-red-100 font-bold hover:bg-red-100">Delete</button>
          )}
          <button onClick={() => handleExportPlanToPDF(selectedPlan)} className="text-[11px] px-3 py-1 border border-slate-300 rounded-md cursor-pointer bg-white text-slate-700 font-bold hover:bg-slate-50">Export PDF</button>
        </div>
      </div>
    </div>
  );
};
