import React, { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { usePlanCard } from './PlanCardContext';
import { Plan } from '../types';
import { showToast } from '../lib/toast';
import { Tooltip } from './Tooltip';
import { addPlanSubscriber, removePlanSubscriber } from '../services/notificationService';
import { PDFExportModal } from './PDFExportModal';
import { usePlanRequest } from '../context/PlanRequestContext';

export const PlanHeader: React.FC = () => {
  const {
    selectedPlan,
    deletePlan,
    currentUser,
    UserRole,
    handleExportPlanToPDF,
    renewLoc,
    libraryVariances,
  } = usePlanCard();

  const [confirmRenew, setConfirmRenew] = useState(false);
  const [renewing, setRenewing] = useState(false);
  const [togglingFollow, setTogglingFollow] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  // Optimistic local state so the button flips immediately without waiting for Firestore
  const [localFollowing, setLocalFollowing] = useState<boolean | null>(null);

  const isFollowing = localFollowing !== null
    ? localFollowing
    : !!(currentUser?.email && selectedPlan.subscribers?.includes(currentUser.email));

  const handleToggleFollow = async () => {
    if (!currentUser?.email) return;
    setTogglingFollow(true);
    const nextState = !isFollowing;
    setLocalFollowing(nextState); // optimistic update
    try {
      if (!nextState) {
        await removePlanSubscriber(selectedPlan.id, currentUser.email);
        showToast('Unfollowed — you won\'t receive notifications for this plan.', 'info');
      } else {
        await addPlanSubscriber(selectedPlan.id, currentUser.email);
        showToast('Following — you\'ll be notified on status changes and comments.', 'success');
      }
    } catch {
      setLocalFollowing(!nextState); // revert on error
    } finally {
      setTogglingFollow(false);
    }
  };

  const calculateDaysOpen = (plan: Plan) => {
    const requestDate = plan.dateRequested || plan.requestDate;
    if (!requestDate) return 0;
    const start = new Date(requestDate);
    if (isNaN(start.getTime())) return 0;
    const isComplete = ['plan_approved', 'approved', 'closed'].includes(plan.stage);
    const end = isComplete && plan.approvedDate ? new Date(plan.approvedDate) : new Date();
    return Math.ceil(Math.abs(end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  };

  const daysOpen = calculateDaysOpen(selectedPlan);
  const canDelete = currentUser?.role === UserRole.ADMIN || currentUser?.role === UserRole.MOT;
  const isFinalStage = ['plan_approved', 'approved', 'expired'].includes(selectedPlan.stage || '');
  // MOT/ADMIN: direct renewal (creates .N plan immediately)
  const canRenew = canDelete && isFinalStage;
  // SFTC: renewal goes through the request queue for MOT to triage
  const canRequestRenewal = currentUser?.role === UserRole.SFTC && isFinalStage;
  const { onRequestRenewal } = usePlanRequest();

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
      {/* LOC Renewal confirm banner — shown at top when triggered */}
      {confirmRenew && (
        <div className="mb-3 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2.5">
          <div className="text-[11px] font-bold text-indigo-800 mb-1">
            Renew {selectedPlan.loc || selectedPlan.id}?
          </div>
          <div className="text-[10px] text-indigo-600 mb-2">
            A new record will open at{' '}
            <span className="font-mono font-bold">
              {(selectedPlan.parentLocId || selectedPlan.id)}.{(selectedPlan.id || '').split('.').length}
            </span>{' '}
            — same location &amp; team, reset to Requested. The original stays unchanged.
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
          {/* Follow / Unfollow */}
          {currentUser && (
            <Tooltip text={isFollowing ? 'Unfollow — stop receiving notifications for this plan.' : 'Follow — get notified on status changes and comments.'} position="bottom">
              <button
                onClick={handleToggleFollow}
                disabled={togglingFollow}
                className={`text-[11px] px-3 py-1 rounded-md border font-bold transition-colors disabled:opacity-50 ${
                  isFollowing
                    ? 'bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100'
                    : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {isFollowing ? '★ Following' : '☆ Follow'}
              </button>
            </Tooltip>
          )}

          {canDelete && (
            <Tooltip text="Permanently delete this plan record. This cannot be undone." position="bottom">
              <button
                onClick={() => deletePlan(selectedPlan.id)}
                className="text-[11px] px-3 py-1 bg-red-50 text-red-600 rounded-md border border-red-100 font-bold hover:bg-red-100"
              >
                Delete
              </button>
            </Tooltip>
          )}
          {canRenew && (
            <Tooltip text="Create a new LOC record for a renewed implementation window. The current record is preserved and stays unchanged." position="bottom">
              <button
                onClick={() => setConfirmRenew(v => !v)}
                className={`text-[11px] px-3 py-1 rounded-md border font-bold transition-colors ${
                  confirmRenew
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-indigo-50 text-indigo-600 border-indigo-200 hover:bg-indigo-100'
                }`}
              >
                ↻ Renew
              </button>
            </Tooltip>
          )}
          {canRequestRenewal && (
            <Tooltip text="Open a new request pre-filled as a renewal of this plan. The MOT team will pick it up from the Requests queue." position="bottom">
              <button
                onClick={() => onRequestRenewal(selectedPlan)}
                className="text-[11px] px-3 py-1 rounded-md border font-bold transition-colors bg-indigo-50 text-indigo-600 border-indigo-200 hover:bg-indigo-100"
              >
                ↻ Request Renewal
              </button>
            </Tooltip>
          )}
          <Tooltip text="Open this plan in a new window." position="bottom">
            <button
              onClick={() => window.open(`${window.location.origin}${window.location.pathname}?plan=${encodeURIComponent(selectedPlan.loc || selectedPlan.id)}`, '_blank', 'width=620,height=920,left=200,top=60,toolbar=0,location=0,menubar=0,scrollbars=1,resizable=1')}
              className="text-[11px] px-2 py-1 border border-slate-300 rounded-md bg-white text-slate-500 hover:bg-slate-50 flex items-center gap-1"
            >
              <ExternalLink size={11} />
            </button>
          </Tooltip>
          <Tooltip text="Download a PDF summary of this plan card." position="bottom">
            <button
              onClick={() => setShowExportModal(true)}
              className="text-[11px] px-3 py-1 border border-slate-300 rounded-md bg-white text-slate-700 font-bold hover:bg-slate-50"
            >
              Export PDF
            </button>
          </Tooltip>
        </div>
      </div>

      {showExportModal && (
        <PDFExportModal
          plan={selectedPlan}
          libraryVariances={libraryVariances ?? []}
          onGenerate={(opts) => handleExportPlanToPDF(selectedPlan, opts)}
          onClose={() => setShowExportModal(false)}
        />
      )}
    </div>
  );
};
