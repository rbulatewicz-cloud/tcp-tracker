// Stage metadata mirrored from src/constants.ts. Kept in sync manually.
// Used by the assistant to translate stage keys → human labels and to
// determine "stuck" thresholds via the existing CLOCK_TARGETS.

export const STAGE_LABELS: Record<string, string> = {
  requested:           'Requested',
  drafting:            'Drafting',
  submitted_to_dot:    'Submitted to DOT',
  dot_review:          'DOT Review Cycle',
  tcp_approved:        'TCP Approved',
  loc_submitted:       'LOC Submitted',
  loc_review:          'LOC Review Cycle',
  plan_approved:       'Plan Approved',
  expired:             'Expired',
  resubmitted:         'Resubmitted',
  resubmit_review:     'Resubmit Review Cycle',
  tcp_approved_final:  'TCP Approved (Final)',
  closed:              'Closed Out',
  cancelled:           'Cancelled',
  // legacy
  submitted:           'Submitted to DOT',
  approved:            'Plan Approved',
  in_review:           'DOT Review Cycle',
};

export const COMPLETED_STAGES = new Set([
  'approved', 'implemented', 'plan_approved', 'tcp_approved_final',
  'expired', 'closed', 'cancelled',
]);

export const STAGES_IN_DOT_REVIEW = new Set([
  'submitted_to_dot', 'submitted',
  'dot_review', 'in_review',
  'resubmit_review',
  'loc_review',
]);

export const STAGES_AT_DOT_PIPELINE = new Set([
  ...STAGES_IN_DOT_REVIEW,
  'loc_submitted',
  'resubmitted',
]);

// Clock targets per plan type per stage (in calendar days).
// Mirror of CLOCK_TARGETS in src/constants.ts. When a plan's days-in-current-stage
// exceeds `target`, the assistant treats it as "stuck"; over `warning` it's "approaching".
export const CLOCK_TARGETS: Record<string, Record<string, { target: number; warning: number }>> = {
  WATCH: {
    drafting:         { target: 3,  warning: 2 },
    dot_review:       { target: 10, warning: 8 },
    team_response:    { target: 2,  warning: 1 },
    dot_review_final: { target: 5,  warning: 4 },
  },
  Standard: {
    drafting:         { target: 3,  warning: 2 },
    dot_review:       { target: 10, warning: 8 },
    team_response:    { target: 2,  warning: 1 },
    dot_review_final: { target: 5,  warning: 4 },
  },
  Engineered: {
    drafting:         { target: 7,  warning: 5 },
    dot_review:       { target: 20, warning: 15 },
    team_response:    { target: 5,  warning: 3 },
    dot_review_final: { target: 20, warning: 15 },
    loc_review:       { target: 20, warning: 15 },
  },
};

// Fallback when a stage has no clock target for a plan type — generous default
// so we don't flag innocuous waits as stuck.
const DEFAULT_STAGE_TARGET = 30;

export function stageLabel(key: string): string {
  return STAGE_LABELS[key] ?? key;
}

export function stageTarget(planType: string, stageKey: string): number {
  const t = CLOCK_TARGETS[planType]?.[stageKey];
  return t?.target ?? DEFAULT_STAGE_TARGET;
}

export function isCompletedStage(stageKey: string): boolean {
  return COMPLETED_STAGES.has(stageKey);
}
