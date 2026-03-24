import React, { useState } from 'react';
import { usePlanCard } from './PlanCardContext';
import { Plan } from '../types';
import { showToast } from '../lib/toast';

export const PlanHeader: React.FC = () => {
  const {
    selectedPlan,
    handleClosePlanCard,
    deletePlan,
    currentUser,
    UserRole,
    updatePlanField,
    handleExportPlanToPDF,
    renewLoc,
  } = usePlanCard();

  const [confirmRenew, setConfirmRenew] = useState(false);
  const [renewing, setRenewing] = useState(false);

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
  const canRenew = canDelete && ['plan_approved', 'approved', 'expired'].includes(selectedPlan.stage || '');

  const handleRenew = async () => {
    setRenewing(true);
    try {
      const newId = await renewLoc(selectedPlan.id);
      if (newId) showToast(`Renewed — ${newId} created and opened.`, 'success');
    } catch {
      showToast('Failed to create renewal. Please try again.', 'error');
    } finally {
      setRenewing(false);
      setConfirmRenew(false);
    }
  };

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
          {canRenew && !confirmRenew && (
            <button
              onClick={() => setConfirmRenew(true)}
              className="text-[11px] px-3 py-1 bg-indigo-50 text-indigo-600 rounded-md border border-indigo-200 font-bold hover:bg-indigo-100"
            >
              Renew LOC
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
      {/* LOC Renewal confirm banner */}
      {confirmRenew && (
        <div className="mt-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2.5">
          <div className="text-[11px] font-bold text-indigo-800 mb-1">
            Create a renewal of {selectedPlan.loc || selectedPlan.id}?
          </div>
          <div className="text-[10px] text-indigo-600 mb-2">
            A new record will open at <span className="font-mono font-bold">{(selectedPlan.parentLocId || selectedPlan.id)}.{((selectedPlan.id || '').split('.').length)}</span> — same location &amp; team, reset to Requested. The original record stays unchanged.
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleRenew}
              disabled={renewing}
              className="px-3 py-1 text-[11px] font-bold text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50"
            >
              {renewing ? 'Creating…' : 'Yes, Renew'}
            </button>
            <button
              onClick={() => setConfirmRenew(false)}
              className="px-3 py-1 text-[11px] font-bold text-indigo-600 bg-white border border-indigo-200 rounded-md hover:bg-indigo-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
