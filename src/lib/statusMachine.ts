/**
 * Status machine for the TCP plan approval flow.
 * Determines valid next actions and progress bar position based on plan type.
 */
import { PlanWorkflowType } from '../types';
import {
  ENGINEERED_PROGRESS_STAGES,
  WATCH_PROGRESS_STAGES,
  RESUBMISSION_STAGES,
  LEGACY_STAGE_MAP,
} from '../constants';

export interface NextAction {
  label: string;
  nextStatus: string;
  collectComments?: boolean;  // triggers comment entry modal
  collectWindow?: boolean;    // triggers implementation window modal
  isReviewRevision?: boolean; // this closes a review cycle
}

/** Derive workflow type from existing plan.type field — no new field needed */
export function getWorkflowType(planType: string): PlanWorkflowType {
  return planType === 'Engineered' ? 'engineered' : 'watch_standard';
}

/** Normalize legacy status keys to new keys */
export function normalizeStatus(stage: string): string {
  return LEGACY_STAGE_MAP[stage] ?? stage;
}

/** Get the valid next actions for a given status and workflow type */
export function getNextActions(stage: string, workflowType: PlanWorkflowType): NextAction[] {
  const s = normalizeStatus(stage);
  switch (s) {
    case 'requested':
      return [{ label: 'Start Drafting', nextStatus: 'drafting' }];

    case 'drafting':
      return [{ label: 'Submit to DOT', nextStatus: 'submitted_to_dot' }];

    case 'submitted_to_dot':
      if (workflowType === 'engineered') {
        return [
          { label: 'No Comments – TCP Approved', nextStatus: 'tcp_approved' },
          { label: 'Comments Received', nextStatus: 'dot_review', collectComments: true },
        ];
      }
      return [
        { label: 'No Comments – Plan Approved', nextStatus: 'plan_approved', collectWindow: true },
        { label: 'Comments Received', nextStatus: 'dot_review', collectComments: true },
      ];

    case 'dot_review':
      return [{ label: 'Revision Submitted', nextStatus: 'submitted_to_dot', isReviewRevision: true }];

    case 'tcp_approved':
      return [{ label: 'Submit LOC', nextStatus: 'loc_submitted' }];

    case 'loc_submitted':
      return [
        { label: 'No Comments – Plan Approved', nextStatus: 'plan_approved', collectWindow: true },
        { label: 'Comments Received', nextStatus: 'loc_review', collectComments: true },
      ];

    case 'loc_review':
      return [{ label: 'Revision Submitted', nextStatus: 'loc_submitted', isReviewRevision: true }];

    case 'plan_approved':
      return [{ label: 'Mark as Expired', nextStatus: 'expired' }];

    case 'expired':
      return [{ label: 'Resubmit with New Timeline', nextStatus: 'resubmitted', collectWindow: true }];

    case 'resubmitted':
      return [
        { label: 'No Comments – TCP Approved', nextStatus: 'tcp_approved_final' },
        { label: 'Comments Received', nextStatus: 'resubmit_review', collectComments: true },
      ];

    case 'resubmit_review':
      return [{ label: 'Revision Submitted', nextStatus: 'resubmitted', isReviewRevision: true }];

    case 'tcp_approved_final':
      return []; // terminal state

    case 'closed':
      return []; // permanently closed — no further actions

    default:
      return [];
  }
}

/** Which review cycle type does entering this status create? */
export function getReviewCycleType(nextStatus: string): 'dot_review' | 'loc_review' | 'resubmit_review' | null {
  if (nextStatus === 'dot_review') return 'dot_review';
  if (nextStatus === 'loc_review') return 'loc_review';
  if (nextStatus === 'resubmit_review') return 'resubmit_review';
  return null;
}

/** Map a review sub-state to its parent milestone stage for the progress bar */
export function getProgressBarActiveKey(stage: string): string {
  const s = normalizeStatus(stage);
  const reviewMap: Record<string, string> = {
    dot_review:       'submitted_to_dot',
    loc_review:       'loc_submitted',
    resubmit_review:  'resubmitted',
    expired:          'plan_approved',
  };
  return reviewMap[s] ?? s;
}

/** Get the label shown under the progress bar for review/expired sub-states */
export function getStatusSubLabel(stage: string, reviewCycles: { cycleType: string }[]): string | null {
  const s = normalizeStatus(stage);
  if (s === 'dot_review' || s === 'loc_review' || s === 'resubmit_review') {
    const type = s as 'dot_review' | 'loc_review' | 'resubmit_review';
    const cycleCount = reviewCycles.filter(c => c.cycleType === type).length;
    return `Review Cycle #${cycleCount}`;
  }
  if (s === 'expired') return 'Expired';
  return null;
}

/** Build the progress bar stages for a given workflow type and current stage */
export function getProgressBarStages(workflowType: PlanWorkflowType, stage: string) {
  const s = normalizeStatus(stage);
  const base = workflowType === 'engineered' ? ENGINEERED_PROGRESS_STAGES : WATCH_PROGRESS_STAGES;
  const inResubmission = ['resubmitted', 'resubmit_review', 'tcp_approved_final'].includes(s);
  return inResubmission ? [...base, ...RESUBMISSION_STAGES] : base;
}
