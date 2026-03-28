import React from 'react';
import { usePlanData, usePlanUtils } from '../PlanCardContext';
import { getWorkflowType, getProgressBarStages, normalizeStatus } from '../../lib/statusMachine';
import { CLOCK_TARGETS } from '../../constants';

// Map stage key → which clock phase it represents
const STAGE_TO_PHASE: Record<string, string> = {
  drafting:         'drafting',
  submitted_to_dot: 'dot_review',
  submitted:        'dot_review',
  dot_review:       'team_response',
  loc_submitted:    'dot_review',
  loc_review:       'team_response',
  resubmitted:      'dot_review_final',
  resubmit_review:  'team_response',
};

// Color day count against clock targets
// green = within warning, yellow = between warning and target, red = over target
function clockColor(days: number, planType: string, phase: string): string {
  const t = CLOCK_TARGETS[planType]?.[phase];
  if (!t) return 'text-slate-600';
  if (days <= t.warning) return 'text-emerald-600';
  if (days <= t.target)  return 'text-amber-600';
  return 'text-red-600';
}

export const ProgressionHistory: React.FC = React.memo(() => {
  const { selectedPlan } = usePlanData();
  const { getLocalDateString, daysBetween } = usePlanUtils();

  if (!selectedPlan) return null;

  const planType = selectedPlan.type || 'WATCH';
  const workflowType = getWorkflowType(planType);
  const normalizedStage = normalizeStatus(selectedPlan.stage || 'requested');
  const progressStages = getProgressBarStages(workflowType, normalizedStage);

  // Include review sub-states in history display
  const allDisplayStages = [
    ...progressStages,
    { key: 'dot_review',      label: 'DOT Review Cycle',      color: '#EF4444', isReview: true },
    { key: 'loc_review',      label: 'LOC Review Cycle',       color: '#EF4444', isReview: true },
    { key: 'resubmit_review', label: 'Resubmit Review Cycle',  color: '#EF4444', isReview: true },
    { key: 'expired',         label: 'Expired',                color: '#DC2626', isReview: false },
  ] as { key: string; label: string; color: string; isReview?: boolean }[];

  // Status history entries sorted chronologically
  const history = (selectedPlan.statusHistory || selectedPlan.log || [])
    .filter((s: any) => s.action && s.action.includes('Status →'))
    .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // Synthesise a "Requested" entry from dateRequested — plan creation has no "Status → Requested" log entry
  const requestedDate = selectedPlan.dateRequested || selectedPlan.requestDate;
  const hasRequestedEntry = history.some(
    (h: any) => h.newValue === 'requested' || h.action === 'Status → Requested'
  );
  const syntheticRequested = !hasRequestedEntry && requestedDate
    ? [{ uniqueId: '__requested__', date: requestedDate, action: 'Status → Requested', newValue: 'requested', user: '' }]
    : [];

  const fullHistory = [...syntheticRequested, ...history]
    .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const reviewCycles = selectedPlan.reviewCycles || [];
  const today = getLocalDateString().split(' ')[0];

  // Transition notes: log entries tagged with field === 'transition_note', keyed by normalized stage
  const transitionNotesByStage: Record<string, { action: string; user: string; date: string }[]> = {};
  (selectedPlan.log || []).forEach((entry: any) => {
    if (entry.field === 'transition_note' && entry.newValue) {
      const key = normalizeStatus(entry.newValue);
      if (!transitionNotesByStage[key]) transitionNotesByStage[key] = [];
      transitionNotesByStage[key].push(entry);
    }
  });

  return (
    <div className="pb-4 mb-4">
      <div className="flex flex-col gap-2">
        {allDisplayStages.map(stage => {
          const isActive = normalizeStatus(selectedPlan.stage || '') === stage.key;
          const stageLabel = stage.label;

          // Match history entries by newValue key or action label
          const stageEntries = fullHistory.filter((h: any) => {
            const newVal = typeof h.newValue === 'string' ? h.newValue : null;
            const actionLabel = h.action.replace('Status → ', '');
            return (
              (newVal && normalizeStatus(newVal) === stage.key) ||
              actionLabel === stageLabel
            );
          });

          // Review cycles belonging to this stage type
          const stageCycles = stage.isReview
            ? reviewCycles.filter(c => c.cycleType === stage.key)
            : [];

          const isPassed = stageEntries.length > 0;
          if (!isPassed && stageCycles.length === 0 && !isActive) return null;

          const phase = STAGE_TO_PHASE[stage.key];

          return (
            <div
              key={stage.key}
              className={`flex flex-col gap-1 text-[11px] p-2 rounded-md border
                ${stage.isReview
                  ? 'bg-red-50 border-red-100 ml-4'
                  : 'bg-slate-50 border-slate-100'
                }`}
            >
              {/* Stage title row */}
              <div className="flex items-center gap-2">
                <div
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ background: isActive ? stage.color : isPassed ? stage.color : '#E2E8F0' }}
                />
                <span className={`font-bold ${isActive ? 'text-slate-900' : isPassed ? 'text-slate-600' : 'text-slate-400'}`}>
                  {stageLabel}
                </span>
                {/* Clock target legend for this stage */}
                {phase && CLOCK_TARGETS[planType]?.[phase] && (
                  <span className="ml-auto text-[9px] text-slate-400 font-normal">
                    target {CLOCK_TARGETS[planType][phase].target}d
                  </span>
                )}
              </div>

              {/* Date range rows — skip for review stages (shown via ReviewCycle objects) */}
              {!stage.isReview && stageEntries.map((entry: any, i: number) => {
                const historyIndex = fullHistory.findIndex((h: any) => h.uniqueId === entry.uniqueId);
                const nextEntry = fullHistory[historyIndex + 1];
                const startDate = entry.date.split(' ')[0];
                const endDate = nextEntry ? nextEntry.date.split(' ')[0] : today;
                const duration = Math.max(0, daysBetween(startDate, endDate));
                const color = phase ? clockColor(duration, planType, phase) : 'text-slate-600';

                return (
                  <div key={entry.uniqueId || i} className="flex justify-between text-slate-500 pl-4">
                    <span>{startDate} to {nextEntry ? endDate : 'Present'}</span>
                    <span className={`font-mono font-bold ${color}`}>{duration} days</span>
                  </div>
                );
              })}

              {/* Transition notes for this stage */}
              {(transitionNotesByStage[stage.key] || []).map((note, i) => (
                <div key={i} className="pl-4 mt-0.5 flex flex-col gap-0.5">
                  <div className="text-[10px] text-slate-400 italic border-l-2 border-slate-200 pl-2">
                    "{note.action}"
                    <span className="not-italic text-slate-300 ml-1">— {note.user}{note.date ? `, ${note.date.split(' ')[0]}` : ''}</span>
                  </div>
                </div>
              ))}

              {/* Review cycles with full DOT + team clock breakdown */}
              {stageCycles.map(cycle => {
                const dotColor = cycle.dotReviewDays !== null
                  ? clockColor(cycle.dotReviewDays, planType, 'dot_review')
                  : 'text-slate-500';
                const teamColor = cycle.teamResponseDays !== null
                  ? clockColor(cycle.teamResponseDays, planType, 'team_response')
                  : 'text-slate-500';

                return (
                  <div key={cycle.cycleId} className="pl-4 mt-1 border-l-2 border-red-200">
                    <div className="flex justify-between text-slate-500">
                      <span className="font-semibold text-red-600">
                        Review Cycle #{cycle.cycleNumber}
                      </span>
                      {/* Total cycle days */}
                      {cycle.teamResponseDays !== null && cycle.teamResponseDays !== undefined && (
                        <span className="font-mono font-bold text-slate-500">{cycle.teamResponseDays}d response</span>
                      )}
                    </div>

                    <div className="text-slate-400 mt-0.5 flex flex-col gap-0.5">
                      {/* DOT clock */}
                      {cycle.submittedDate && (
                        <div className="flex justify-between">
                          <span>📤 Submitted: {cycle.submittedDate}</span>
                        </div>
                      )}
                      {cycle.commentsReceivedDate && (
                        <div className="flex justify-between">
                          <span>📥 DOT responded: {cycle.commentsReceivedDate}</span>
                          {cycle.dotReviewDays !== null && (
                            <span className={`font-mono font-bold ${dotColor}`}>
                              DOT {cycle.dotReviewDays}d
                            </span>
                          )}
                        </div>
                      )}

                      {/* Comment description */}
                      {cycle.commentsDescription && (
                        <div className="italic text-slate-400">"{cycle.commentsDescription}"</div>
                      )}

                      {/* Team response clock */}
                      {cycle.revisionSubmittedDate && (
                        <div className="flex justify-between">
                          <span>
                            ✏️ Revision: {cycle.revisionSubmittedDate}
                            {cycle.revisionNumber ? ` (${cycle.revisionNumber})` : ''}
                          </span>
                          {cycle.teamResponseDays !== null && (
                            <span className={`font-mono font-bold ${teamColor}`}>
                              Team {cycle.teamResponseDays}d
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}

        {/* Implementation window */}
        {selectedPlan.implementationWindow && (
          <div className="text-[11px] p-2 bg-emerald-50 rounded-md border border-emerald-100">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
              <span className="font-bold text-emerald-700">Implementation Window</span>
              {selectedPlan.implementationWindow.locRevision && (
                <span className="text-[9px] text-emerald-600 ml-1">
                  ({selectedPlan.implementationWindow.locRevision})
                </span>
              )}
            </div>
            <div className="pl-4 text-slate-600">
              {selectedPlan.implementationWindow.startDate} → {selectedPlan.implementationWindow.endDate}
              {selectedPlan.implementationWindow.isExpired && (
                <span className="ml-2 text-red-600 font-bold">(Expired)</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Clock legend */}
      <div className="flex items-center gap-3 mt-3 pt-2 border-t border-slate-100">
        <span className="text-[9px] text-slate-400 uppercase tracking-wider font-bold">Clock</span>
        <span className="text-[9px] text-emerald-600 font-bold">● On track</span>
        <span className="text-[9px] text-amber-600 font-bold">● Approaching</span>
        <span className="text-[9px] text-red-600 font-bold">● Over target</span>
      </div>
    </div>
  );
});
