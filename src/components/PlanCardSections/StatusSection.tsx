import React, { useState, useEffect, useRef } from 'react';
import { usePlanData, usePlanActions, usePlanPermissions, usePlanUtils } from '../PlanCardContext';
import { PermissionToggle } from '../../permissions/PermissionToggle';
import { showToast } from '../../lib/toast';
import {
  getWorkflowType,
  getNextActions,
  getProgressBarStages,
  getProgressBarActiveKey,
  getStatusSubLabel,
  getReviewCycleType,
  normalizeStatus,
  NextAction,
} from '../../lib/statusMachine';
import { ReviewCycle } from '../../types';
import { ALL_STAGES } from '../../constants';

// Look up a status color from the full stage list
function getStatusColor(statusKey: string): string {
  return ALL_STAGES.find(s => s.key === statusKey)?.color ?? '#3B82F6';
}

export const StatusSection: React.FC = React.memo(() => {
  const { selectedPlan } = usePlanData();
  const { updateStage } = usePlanActions();
  const { getLocalDateString } = usePlanUtils();
  const {
    canEditPlan,
    isPermissionEditingMode,
    currentUser,
    UserRole,
    fieldPermissions,
    setFieldPermissions,
  } = usePlanPermissions();

  const [loadingStage, setLoadingStage] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<NextAction | null>(null);
  const [selectedDate, setSelectedDate] = useState(getLocalDateString());
  const [commentText, setCommentText] = useState('');
  const [windowStart, setWindowStart] = useState('');
  const [windowEnd, setWindowEnd] = useState('');
  const [locRevision, setLocRevision] = useState('');
  const autoExpiredRef = useRef<string | null>(null);

  if (!selectedPlan) return null;

  const canChangeStatus =
    canEditPlan &&
    (currentUser?.role === UserRole.ADMIN || currentUser?.role === UserRole.MOT);

  const normalizedStageForEffect = normalizeStatus(selectedPlan.stage || 'requested');

  // Auto-expire: if plan_approved and window has lapsed, flip to expired automatically
  useEffect(() => {
    if (!canChangeStatus) return;
    if (normalizedStageForEffect !== 'plan_approved') return;
    const win = selectedPlan.implementationWindow;
    if (!win || win.isExpired) return;
    const today = getLocalDateString().split(' ')[0];
    if (today <= win.endDate) return;
    // Guard against running twice for the same plan
    if (autoExpiredRef.current === selectedPlan.id) return;
    autoExpiredRef.current = selectedPlan.id;

    const expiredWindow = { ...win, isExpired: true };
    updateStage(selectedPlan.id, 'expired', today, selectedPlan.reviewCycles ?? [], expiredWindow)
      .then(() => showToast(`${selectedPlan.id} implementation window has lapsed — marked as Expired.`, 'warning'));
  }, [selectedPlan.id, normalizedStageForEffect, selectedPlan.implementationWindow?.endDate]);

  const workflowType = getWorkflowType(selectedPlan.type || 'WATCH');
  const normalizedStage = normalizeStatus(selectedPlan.stage || 'requested');
  const progressStages = getProgressBarStages(workflowType, normalizedStage);
  const activeProgressKey = getProgressBarActiveKey(normalizedStage);
  const nextActions = getNextActions(normalizedStage, workflowType);
  const reviewCycles = selectedPlan.reviewCycles || [];
  const subLabel = getStatusSubLabel(normalizedStage, reviewCycles);

  const handleActionClick = (action: NextAction) => {
    if (!canChangeStatus) return;
    setPendingAction(action);
    setSelectedDate(getLocalDateString());
    setCommentText('');
    setWindowStart('');
    setWindowEnd('');
    setLocRevision('');
  };

  const handleConfirm = async () => {
    if (!pendingAction) return;
    // Validate mandatory implementation window dates
    if (pendingAction.collectWindow && (!windowStart || !windowEnd)) {
      showToast('Please enter both start and end dates for the implementation window.', 'warning');
      return;
    }
    setLoadingStage(pendingAction.nextStatus);

    try {
      // Build review cycle data if needed
      let newReviewCycles = [...reviewCycles];
      const cycleType = getReviewCycleType(pendingAction.nextStatus);

      if (cycleType) {
        // Opening a new review cycle
        const cycleNumber =
          reviewCycles.filter(c => c.cycleType === cycleType).length + 1;
        const newCycle: ReviewCycle = {
          cycleId: `RC-${Date.now()}`,
          cycleType,
          cycleNumber,
          commentsReceivedDate: selectedDate,
          commentsDescription: commentText,
          revisionSubmittedDate: null,
          revisionNumber: null,
          dotReviewDays: null,
          teamResponseDays: null,
        };
        newReviewCycles = [...reviewCycles, newCycle];
      } else if (pendingAction.isReviewRevision) {
        // Closing the most recent open review cycle
        const openCycleIndex = [...newReviewCycles]
          .reverse()
          .findIndex(c => c.revisionSubmittedDate === null);
        if (openCycleIndex !== -1) {
          const realIndex = newReviewCycles.length - 1 - openCycleIndex;
          const cycle = { ...newReviewCycles[realIndex] };
          const newRev = (selectedPlan.rev || 0) + 1;
          cycle.revisionSubmittedDate = selectedDate;
          cycle.revisionNumber = `Rev.${newRev}`;
          const days =
            Math.round(
              (new Date(selectedDate).getTime() -
                new Date(cycle.commentsReceivedDate).getTime()) /
                86400000
            );
          cycle.teamResponseDays = days;
          newReviewCycles = [
            ...newReviewCycles.slice(0, realIndex),
            cycle,
            ...newReviewCycles.slice(realIndex + 1),
          ];
        }
      }

      // Build implementation window if needed
      const implementationWindow =
        pendingAction.collectWindow && windowStart && windowEnd
          ? { startDate: windowStart, endDate: windowEnd, isExpired: false, ...(locRevision ? { locRevision } : {}) }
          : selectedPlan.implementationWindow;

      await updateStage(
        selectedPlan.id,
        pendingAction.nextStatus,
        selectedDate,
        newReviewCycles,
        implementationWindow ?? null
      );
    } catch (error) {
      console.error('Failed to update stage:', error);
      showToast('Failed to update status. Please try again.', 'error');
    } finally {
      setLoadingStage(null);
      setPendingAction(null);
    }
  };

  const needsModal =
    pendingAction &&
    (pendingAction.collectComments || pendingAction.collectWindow || true);

  // --- Progress bar ---
  const progressBar = (
    <div className="flex rounded-md border border-slate-200 overflow-hidden mb-2">
      {progressStages.map((stage, index) => {
        const isActive = stage.key === activeProgressKey;
        const stageNorm = normalizeStatus(stage.key);
        const activeNorm = normalizeStatus(activeProgressKey);
        const activeIdx = progressStages.findIndex(
          s => s.key === activeProgressKey
        );
        const isPast = index < activeIdx;

        return (
          <div
            key={stage.key}
            className={`flex-1 text-center py-1.5 text-[10px] font-bold transition-colors
              ${index !== 0 ? 'border-l border-slate-200' : ''}
              ${isActive ? 'text-white' : isPast ? 'text-white opacity-70' : 'text-slate-400 bg-white'}`}
            style={
              isActive
                ? { backgroundColor: stage.color }
                : isPast
                ? { backgroundColor: stage.color + '80' }
                : {}
            }
          >
            {stage.label}
          </div>
        );
      })}
    </div>
  );

  // --- Current status badge ---
  const currentStatusLabel = (() => {
    const allStages = [
      ...progressStages,
      { key: 'dot_review', label: 'DOT Review Cycle', color: '#EF4444' },
      { key: 'loc_review', label: 'LOC Review Cycle', color: '#EF4444' },
      { key: 'resubmit_review', label: 'Resubmit Review Cycle', color: '#EF4444' },
      { key: 'expired', label: 'Expired', color: '#DC2626' },
    ];
    return (
      allStages.find(s => s.key === normalizedStage)?.label ??
      selectedPlan.stage
    );
  })();

  return (
    <div className="pb-0 mb-0">
      {/* Confirm modal */}
      {pendingAction && needsModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-5 backdrop-blur-sm">
          <div className="w-full max-w-[420px] rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="text-lg font-bold text-slate-900 mb-1">
              {pendingAction.label}
            </h2>
            <p className="text-xs text-slate-500 mb-4">
              → <strong>{pendingAction.nextStatus.replace(/_/g, ' ')}</strong>
            </p>

            {/* Date */}
            <div className="mb-4">
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                Date
              </label>
              <input
                type="date"
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
                className="w-full rounded-lg border border-slate-200 p-2 text-sm"
              />
            </div>

            {/* Comment entry for review cycles */}
            {pendingAction.collectComments && (
              <div className="mb-4">
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                  Comment Description (optional)
                </label>
                <textarea
                  value={commentText}
                  onChange={e => setCommentText(e.target.value)}
                  placeholder="e.g. Detour signage spacing needs adjustment"
                  rows={2}
                  className="w-full rounded-lg border border-slate-200 p-2 text-sm resize-none"
                />
              </div>
            )}

            {/* Implementation window */}
            {pendingAction.collectWindow && (
              <div className="mb-4 p-3 bg-emerald-50 rounded-lg border border-emerald-100">
                <p className="text-xs font-bold text-emerald-700 uppercase mb-2">
                  Implementation Window
                </p>
                <div className="flex gap-2 mb-3">
                  <div className="flex-1">
                    <label className="block text-xs text-slate-500 mb-1">Start Date</label>
                    <input
                      type="date"
                      value={windowStart}
                      onChange={e => setWindowStart(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 p-2 text-sm"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs text-slate-500 mb-1">End Date</label>
                    <input
                      type="date"
                      value={windowEnd}
                      onChange={e => setWindowEnd(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 p-2 text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">LOC Revision # (optional)</label>
                  <input
                    type="text"
                    value={locRevision}
                    onChange={e => setLocRevision(e.target.value)}
                    placeholder="e.g. Rev.2"
                    className="w-full rounded-lg border border-slate-200 p-2 text-sm bg-white"
                  />
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setPendingAction(null)}
                className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-500"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                disabled={!!loadingStage}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
              >
                {loadingStage ? 'Saving…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Permission toggle (admin only) */}
      {isPermissionEditingMode && currentUser?.role === UserRole.ADMIN && (
        <div className="mb-2">
          <PermissionToggle
            fieldName="Status"
            allowedEditRoles={fieldPermissions['status']?.edit ?? ['MOT', 'CR']}
            allowedViewRoles={fieldPermissions['status']?.view ?? ['GUEST', 'SFTC', 'MOT', 'CR']}
            onToggleEdit={role =>
              setFieldPermissions(prev => {
                const cur = { view: prev.status?.view ?? ['GUEST', 'SFTC', 'MOT', 'CR'], edit: prev.status?.edit ?? ['MOT', 'CR'] };
                return { ...prev, status: { view: cur.view, edit: cur.edit.includes(role) ? cur.edit.filter((r: string) => r !== role) : [...cur.edit, role] } };
              })
            }
            onToggleView={role =>
              setFieldPermissions(prev => {
                const cur = { view: prev.status?.view ?? ['GUEST', 'SFTC', 'MOT', 'CR'], edit: prev.status?.edit ?? ['MOT', 'CR'] };
                return { ...prev, status: { edit: cur.edit, view: cur.view.includes(role) ? cur.view.filter((r: string) => r !== role) : [...cur.view, role] } };
              })
            }
          />
        </div>
      )}

      {/* Progress bar */}
      {progressBar}

      {/* Current status + sub-label */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[11px] font-bold text-slate-500 uppercase">Current:</span>
        <span className={`text-[11px] font-bold ${normalizedStage === 'closed' ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
          {normalizedStage === 'closed' ? '⚰️ Closed Out' : currentStatusLabel}
        </span>
        {subLabel && (
          <span className="text-[10px] font-bold bg-red-100 text-red-600 px-2 py-0.5 rounded-full">
            {subLabel}
          </span>
        )}
        {selectedPlan.implementationWindow && normalizedStage === 'plan_approved' && (
          <span className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full font-semibold">
            {selectedPlan.implementationWindow.startDate} → {selectedPlan.implementationWindow.endDate}
          </span>
        )}
      </div>

      {/* Next action buttons */}
      {canChangeStatus && nextActions.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Next Action</span>
          <div className="flex flex-wrap gap-2">
            {nextActions.map(action => {
              const color = getStatusColor(action.nextStatus);
              return (
                <button
                  key={action.nextStatus}
                  onClick={() => handleActionClick(action)}
                  disabled={!!loadingStage}
                  style={action.collectComments ? {} : { backgroundColor: color }}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-opacity disabled:opacity-50
                    ${action.collectComments
                      ? 'bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100'
                      : 'text-white hover:opacity-90'
                    }`}
                >
                  {loadingStage === action.nextStatus ? '…' : action.label}
                </button>
              );
            })}

            {/* Permanently closed option — only shown when expired */}
            {normalizedStage === 'expired' && (
              <button
                onClick={() => handleActionClick({ label: '⚰️ Close Out Plan', nextStatus: 'closed' })}
                disabled={!!loadingStage}
                className="px-3 py-1.5 rounded-lg text-[11px] font-bold border border-slate-300 bg-slate-100 text-slate-500 hover:bg-slate-200 disabled:opacity-50"
              >
                {loadingStage === 'closed' ? '…' : '⚰️ Close Out Plan'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
});
