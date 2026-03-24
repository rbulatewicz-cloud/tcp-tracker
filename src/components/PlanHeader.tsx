import React from 'react';
import { usePlanCard } from './PlanCardContext';
import { Plan } from '../types';

export const PlanHeader: React.FC = () => {
  const {
    selectedPlan,
    handleClosePlanCard,
    deletePlan,
    currentUser,
    UserRole,
    updatePlanField,
    handleExportPlanToPDF,
  } = usePlanCard();

  const calculateDaysOpen = (plan: Plan) => {
    const requestDate = plan.dateRequested || plan.requestDate;
    if (!requestDate) return 0;
    const start = new Date(requestDate);
    if (isNaN(start.getTime())) return 0;
    const isComplete = ['plan_approved', 'approved', 'tcp_approved_final', 'closed'].includes(plan.stage);
    const end = isComplete && plan.approvedDate ? new Date(plan.approvedDate) : new Date();
    return Math.ceil(Math.abs(end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  };

  const daysOpen = calculateDaysOpen(selectedPlan);
  const canDelete = currentUser?.role === UserRole.ADMIN || currentUser?.role === UserRole.MOT;

  return (
    <div className="pb-2 mb-2">
      {/* Historical record banner */}
      {selectedPlan.isHistorical && (
        <div className="mb-2 px-2 py-1 bg-indigo-50 border border-indigo-100 rounded-md flex items-center gap-2">
          <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider">📋 Historical Record</span>
          <span className="text-[10px] text-indigo-500">Imported — performance metrics excluded</span>
        </div>
      )}

      {/* Pending documents warning */}
      {selectedPlan.pendingDocuments && (
        <div className="mb-2 px-2 py-1 bg-amber-50 border border-amber-200 rounded-md flex items-center gap-2">
          <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">⚠ Pending Documents</span>
          <span className="text-[10px] text-amber-600">Upload signed LOC and TCP drawings to complete this record</span>
        </div>
      )}

      {/* Row 1: LOC # (primary) + Days Open badge */}
      <div className="flex justify-between items-start mb-1">
        <div className="text-[22px] font-bold text-slate-900 font-mono">
          {selectedPlan.loc || selectedPlan.id}
          {selectedPlan.revisionSuffix && (
            <span className="text-[14px] text-slate-500 ml-1">{selectedPlan.revisionSuffix}</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-100">
          <span className="text-sm font-bold text-amber-700">{daysOpen}</span>
          <span className="text-[9px] text-amber-700 font-bold uppercase tracking-wider">days open</span>
        </div>
      </div>

      {/* Row 2: Cross streets */}
      <div className="text-base font-semibold text-slate-900 mb-1">
        {selectedPlan.street1}{selectedPlan.street2 ? <><span className="text-slate-400 font-normal"> / </span>{selectedPlan.street2}</> : null}
      </div>

      {/* Row 3: Requested by + action buttons */}
      <div className="flex justify-between items-end">
        <div className="flex flex-col gap-0.5">
          {selectedPlan.requestedBy && (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Requested by</span>
              <span className="text-[11px] text-slate-700 font-semibold">{selectedPlan.requestedBy}</span>
            </div>
          )}
          {(selectedPlan.dateRequested || selectedPlan.requestDate) && (
            <div className="text-[10px] text-slate-400">
              {(selectedPlan.dateRequested || selectedPlan.requestDate || '').split('T')[0]}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {canDelete && (
            <button
              onClick={() => deletePlan(selectedPlan.id)}
              className="text-[11px] px-3 py-1 bg-red-50 text-red-600 rounded-md border border-red-100 font-bold hover:bg-red-100"
            >
              Delete
            </button>
          )}
          <button
            onClick={() => handleExportPlanToPDF(selectedPlan)}
            className="text-[11px] px-3 py-1 border border-slate-300 rounded-md bg-white text-slate-700 font-bold hover:bg-slate-50"
          >
            Export PDF
          </button>
        </div>
      </div>
    </div>
  );
};
