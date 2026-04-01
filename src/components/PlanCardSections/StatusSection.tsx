import React, { useState, useEffect, useRef, useCallback } from 'react';
import { usePlanData, usePlanActions, usePlanPermissions, usePlanUtils } from '../PlanCardContext';
import { PermissionToggle } from '../../permissions/PermissionToggle';
import { showToast } from '../../lib/toast';
import { Tooltip } from '../Tooltip';
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
import { pheProgress } from '../../utils/compliance';

// Look up a status color from the full stage list
function getStatusColor(statusKey: string): string {
  return ALL_STAGES.find(s => s.key === statusKey)?.color ?? '#3B82F6';
}

export const StatusSection: React.FC = React.memo(() => {
  const { selectedPlan } = usePlanData();
  const { updateStage, batchUploadStageAttachments, addLogEntry, convertPlanType } = usePlanActions();
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
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [transitionNotes, setTransitionNotes] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const autoExpiredRef = useRef<string | null>(null);

  // Convert plan type modal state
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [convertTargetType, setConvertTargetType] = useState('');
  const [convertLoading, setConvertLoading] = useState(false);

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
    setPendingFiles([]);
    setTransitionNotes('');
  };

  const addFiles = useCallback((files: FileList | File[]) => {
    const arr = Array.from(files).filter(f =>
      /\.(pdf|jpg|jpeg|png|doc|docx)$/i.test(f.name)
    );
    setPendingFiles(prev => {
      const existing = new Set(prev.map(f => f.name + f.size));
      return [...prev, ...arr.filter(f => !existing.has(f.name + f.size))];
    });
  }, []);

  const handleConfirm = async () => {
    if (!pendingAction) return;
    // Validate mandatory implementation window dates
    if (pendingAction.collectWindow && (!windowStart || !windowEnd)) {
      showToast('Please enter both start and end dates for the implementation window.', 'warning');
      return;
    }
    // Validate mandatory attachment (admins can bypass)
    const isAdmin = currentUser?.role === UserRole.ADMIN;
    if (pendingAction.requiresAttachment && pendingFiles.length === 0 && !isAdmin) {
      showToast(`Please attach the required documents before proceeding.`, 'warning');
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

      // Save transition notes as a tagged log entry linked to the new stage
      if (transitionNotes.trim()) {
        addLogEntry(selectedPlan.id, transitionNotes.trim(), [], 'transition_note', undefined, pendingAction.nextStatus);
      }

      // Upload attachments after status change (silent — no extra log entries)
      if (pendingFiles.length > 0 && pendingAction.defaultDocType) {
        await batchUploadStageAttachments(
          selectedPlan.id,
          pendingFiles,
          pendingAction.nextStatus,
          pendingAction.defaultDocType
        );
      }
    } catch (error) {
      console.error('Failed to update stage:', error);
      showToast('Failed to update status. Please try again.', 'error');
    } finally {
      setLoadingStage(null);
      setPendingAction(null);
      setPendingFiles([]);
      setTransitionNotes('');
    }
  };

  const needsModal =
    pendingAction &&
    (pendingAction.collectComments || pendingAction.collectWindow || true);

  // --- Convert plan type ---
  const PLAN_TYPES = ['WATCH', 'Standard', 'Engineered'];
  const ENGINEERED_ONLY_STAGES = ['tcp_approved', 'loc_submitted', 'loc_review'];
  const ENGINEERED_ONLY_LABELS: Record<string, string> = {
    tcp_approved: 'TCP Approved',
    loc_submitted: 'LOC Submitted',
    loc_review: 'LOC Review Cycle',
  };
  const convertNeedsRemap =
    convertTargetType !== 'Engineered' &&
    ENGINEERED_ONLY_STAGES.includes(normalizedStage);

  const handleConvertConfirm = async () => {
    if (!convertTargetType) return;
    setConvertLoading(true);
    try {
      await convertPlanType(selectedPlan.id, convertTargetType);
      showToast(`Plan type updated to ${convertTargetType}.`, 'success');
    } catch {
      showToast('Failed to convert plan type. Please try again.', 'error');
    } finally {
      setConvertLoading(false);
      setShowConvertModal(false);
      setConvertTargetType('');
    }
  };

  // --- Progress bar ---
  const progressBar = (
    <div className="flex rounded-md border border-slate-200 overflow-hidden mb-2">
      {progressStages.map((stage, index) => {
        const isActive = stage.key === activeProgressKey;
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
          <div className="w-full max-w-[420px] rounded-2xl bg-white shadow-2xl flex flex-col max-h-[90vh]">
            {/* Fixed header */}
            <div className="px-6 pt-6 pb-3 flex-shrink-0 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-900 mb-0.5">
                {pendingAction.label}
              </h2>
              <p className="text-xs text-slate-500 mb-1">
                → <strong>{pendingAction.nextStatus.replace(/_/g, ' ')}</strong>
              </p>
              {pendingAction.description && (
                <p className="text-xs text-slate-500 leading-snug">
                  {pendingAction.description}
                </p>
              )}
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto px-6 py-4">

            {/* Compliance warning — shown when approving with incomplete tracks */}
            {pendingAction.nextStatus === 'plan_approved' && (() => {
              const c = selectedPlan.compliance;
              if (!c) return null;
              const warnings: string[] = [];
              if (c.phe) {
                const { done, total } = pheProgress(c.phe);
                if (done < total) warnings.push(`PHE checklist ${done}/${total} items complete`);
              }
              if (c.noiseVariance && !['approved', 'submitted'].includes(c.noiseVariance.status)) {
                warnings.push('Noise Variance not yet submitted/approved');
              }
              if (c.cdConcurrence) {
                const applicable = c.cdConcurrence.cds.filter(cd => cd.applicable);
                const pending = applicable.filter(cd => cd.status !== 'concurred' && cd.status !== 'na');
                if (pending.length > 0)
                  warnings.push(`CD Concurrence pending: ${pending.map(cd => cd.cd).join(', ')}`);
              }
              if (warnings.length === 0) return null;
              return (
                <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
                  <p className="text-[11px] font-bold text-amber-800 mb-1.5">⚠ Compliance tracks incomplete</p>
                  <ul className="flex flex-col gap-0.5">
                    {warnings.map((w, i) => (
                      <li key={i} className="text-[10px] text-amber-700 flex items-start gap-1.5">
                        <span className="mt-0.5 shrink-0">•</span>{w}
                      </li>
                    ))}
                  </ul>
                  <p className="text-[10px] text-amber-600 mt-1.5">You can still approve — this is a reminder only.</p>
                </div>
              );
            })()}

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

            {/* Transition notes */}
            <div className="mb-4">
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                Notes <span className="text-slate-300 font-normal normal-case">(optional)</span>
              </label>
              <textarea
                value={transitionNotes}
                onChange={e => setTransitionNotes(e.target.value)}
                placeholder={`Add any relevant context for this transition — submitter, scope changes, special instructions, etc.`}
                rows={3}
                className="w-full rounded-lg border border-slate-200 p-2 text-sm resize-none text-slate-700 placeholder:text-slate-300"
              />
            </div>

            {/* File attachments */}
            {pendingAction.requiresAttachment && (
              <div className="mb-4">
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                  {pendingAction.attachmentLabel || 'Attachments'}
                  <span className="ml-1 text-red-500">*</span>
                </label>

                {/* Drop zone */}
                <div
                  onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
                  onDragLeave={() => setIsDragOver(false)}
                  onDrop={e => { e.preventDefault(); setIsDragOver(false); addFiles(e.dataTransfer.files); }}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors mb-2
                    ${isDragOver ? 'border-blue-400 bg-blue-50' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'}`}
                >
                  <div className="text-xs text-slate-400">
                    Drop files here or <span className="text-blue-500 font-semibold">browse</span>
                  </div>
                  <div className="text-[10px] text-slate-300 mt-0.5">PDF, JPG, PNG, DOC accepted</div>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                  className="hidden"
                  onChange={e => { if (e.target.files) addFiles(e.target.files); e.target.value = ''; }}
                />

                {/* File list */}
                {pendingFiles.length > 0 && (
                  <div className="flex flex-col gap-1">
                    {pendingFiles.map((f, i) => (
                      <div key={i} className="flex items-center gap-2 bg-slate-50 rounded-md px-2 py-1">
                        <span className="text-[10px]">📄</span>
                        <span className="text-xs text-slate-700 flex-1 truncate">{f.name}</span>
                        <button
                          onClick={e => { e.stopPropagation(); setPendingFiles(prev => prev.filter((_, idx) => idx !== i)); }}
                          className="text-[10px] text-red-400 hover:text-red-600 font-bold shrink-0"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
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

            </div>{/* end scrollable body */}

            {/* Fixed footer */}
            <div className="px-6 py-4 flex justify-end gap-3 flex-shrink-0 border-t border-slate-100">
              <button
                onClick={() => setPendingAction(null)}
                className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-200"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                disabled={!!loadingStage}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50 hover:bg-blue-700"
              >
                {loadingStage ? 'Saving…' : pendingFiles.length > 0 ? `Confirm & Upload (${pendingFiles.length})` : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Convert Plan Type modal */}
      {showConvertModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-5 backdrop-blur-sm">
          <div className="w-full max-w-[400px] rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="text-lg font-bold text-slate-900 mb-1">Convert Plan Type</h2>
            <p className="text-xs text-slate-500 mb-4">
              Changes the approval workflow from this point forward. History is preserved.
            </p>

            {/* Current type */}
            <div className="mb-4">
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Current Type</label>
              <span className="inline-block px-3 py-1 bg-slate-100 rounded-lg text-xs font-bold text-slate-600">
                {selectedPlan.type || 'WATCH'}
              </span>
            </div>

            {/* Target type selector */}
            <div className="mb-4">
              <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Convert To</label>
              <div className="flex gap-2 flex-wrap">
                {PLAN_TYPES.filter(t => t !== (selectedPlan.type || 'WATCH')).map(t => (
                  <button
                    key={t}
                    onClick={() => setConvertTargetType(t)}
                    className={`px-4 py-2 rounded-lg text-xs font-bold border transition-colors ${
                      convertTargetType === t
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300 hover:text-blue-600'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* Stage compatibility warning */}
            {convertTargetType && convertNeedsRemap && (
              <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-xs font-bold text-amber-700 mb-1">⚠️ Stage Reset Required</p>
                <p className="text-xs text-amber-600">
                  This plan is at <strong>{ENGINEERED_ONLY_LABELS[normalizedStage]}</strong>, which is an Engineered-only stage.
                  Converting to <strong>{convertTargetType}</strong> will reset the stage back to{' '}
                  <strong>Submitted to DOT</strong>.
                </p>
              </div>
            )}

            {/* Current stage (no warning needed) */}
            {convertTargetType && !convertNeedsRemap && (
              <div className="mb-4 p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <p className="text-xs text-slate-500">
                  The plan will continue from its current stage:{' '}
                  <strong className="text-slate-700">{currentStatusLabel}</strong>
                </p>
              </div>
            )}

            <div className="flex justify-end gap-3">
              <button
                onClick={() => { setShowConvertModal(false); setConvertTargetType(''); }}
                className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-200"
              >
                Cancel
              </button>
              <button
                onClick={handleConvertConfirm}
                disabled={!convertTargetType || convertLoading}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-40 hover:bg-blue-700"
              >
                {convertLoading ? 'Converting…' : 'Confirm Conversion'}
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
                <Tooltip key={action.nextStatus} text={action.description ?? action.label} position="top" maxWidth={280}>
                  <button
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
                </Tooltip>
              );
            })}

            {/* Permanently closed option — only shown when expired */}
            {normalizedStage === 'expired' && (
              <Tooltip text="Permanently close this plan with no further action. Use when the project is cancelled or no longer moving forward." position="top" maxWidth={280}>
                <button
                  onClick={() => handleActionClick({ label: '⚰️ Close Out Plan', nextStatus: 'closed', description: 'Permanently close this plan. Use when the project is cancelled or no longer moving forward.' })}
                  disabled={!!loadingStage}
                  className="px-3 py-1.5 rounded-lg text-[11px] font-bold border border-slate-300 bg-slate-100 text-slate-500 hover:bg-slate-200 disabled:opacity-50"
                >
                  {loadingStage === 'closed' ? '…' : '⚰️ Close Out Plan'}
                </button>
              </Tooltip>
            )}
          </div>
        </div>
      )}

      {/* Convert Plan Type — MOT/ADMIN only, not shown for closed plans */}
      {canChangeStatus && normalizedStage !== 'closed' && (
        <div className="mt-3 pt-3 border-t border-slate-100">
          <button
            onClick={() => { setConvertTargetType(''); setShowConvertModal(true); }}
            className="text-[11px] font-semibold text-slate-400 hover:text-blue-500 transition-colors"
          >
            ⇄ Convert Plan Type
          </button>
        </div>
      )}
    </div>
  );
});
