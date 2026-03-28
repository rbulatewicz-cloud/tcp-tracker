/**
 * Compliance trigger detection and initialization utilities.
 * Pure functions — no side effects, no imports from React.
 *
 * Tracks managed:
 *   - PHE  (Peak Hour Exemption → BOE)
 *   - NV   (Noise Variance → Police Commission)
 *   - CD   (Council District Concurrence → CD2, CD6, CD7)
 */

import {
  Plan,
  PlanForm,
  WorkHours,
  PlanCompliance,
  PHEChecklistItem,
  PHETrack,
  NoiseVarianceTrack,
  CDConcurrenceTrack,
} from '../types';

// ── Time helpers ──────────────────────────────────────────────────────────────

/** Convert "HH:MM" to minutes since midnight */
function toMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Returns true if the time window [start, end] overlaps with [windowStart, windowEnd].
 * Handles overnight spans (end < start).
 */
function overlaps(
  start: string,
  end: string,
  windowStartMin: number,
  windowEndMin: number
): boolean {
  if (!start || !end) return false;
  const s = toMinutes(start);
  const e = toMinutes(end);
  if (e > s) {
    // Normal window (same day)
    return s < windowEndMin && e > windowStartMin;
  } else {
    // Overnight — wraps past midnight: [s, 1440) ∪ [0, e)
    return s < windowEndMin || e > windowStartMin;
  }
}

// Peak hours: Mon–Fri  6:00–9:00 AM  and  3:30–7:00 PM
const PEAK_MORNING_START = 6 * 60;      // 360
const PEAK_MORNING_END   = 9 * 60;      // 540
const PEAK_EVENING_START = 15 * 60 + 30; // 930
const PEAK_EVENING_END   = 19 * 60;     // 1140

function workHoursDuringPeak(wh: WorkHours): boolean {
  if (wh.shift === 'continuous') return true;
  for (const day of wh.days) {
    if (day === 'sunday') continue; // peak hours are Mon–Fri + Sat specific
    const start = wh[`${day}_start` as keyof WorkHours] as string | undefined;
    const end   = wh[`${day}_end`   as keyof WorkHours] as string | undefined;
    if (!start || !end) continue;
    if (
      overlaps(start, end, PEAK_MORNING_START, PEAK_MORNING_END) ||
      overlaps(start, end, PEAK_EVENING_START, PEAK_EVENING_END)
    ) return true;
  }
  return false;
}

// Night work (LAMC 41.40): 9pm–7am Mon–Fri | before 8am/after 6pm Sat | all Sunday
const NIGHT_WEEKDAY_START = 21 * 60; // 9:00 PM
const NIGHT_WEEKDAY_END   = 7 * 60;  // 7:00 AM  (overnight — handled as wrap)
const NIGHT_SAT_BEFORE    = 8 * 60;  // before 8:00 AM
const NIGHT_SAT_AFTER     = 18 * 60; // after  6:00 PM

function workHoursDuringNight(wh: WorkHours): boolean {
  if (wh.shift === 'continuous') return true;
  for (const day of wh.days) {
    if (day === 'sunday') return true; // all Sunday = night work
    const start = wh[`${day}_start` as keyof WorkHours] as string | undefined;
    const end   = wh[`${day}_end`   as keyof WorkHours] as string | undefined;
    if (!start || !end) continue;
    if (day === 'weekday') {
      // Night: 9pm–7am (overnight window)
      if (overlaps(start, end, NIGHT_WEEKDAY_START, 24 * 60)) return true;
      if (overlaps(start, end, 0, NIGHT_WEEKDAY_END)) return true;
    }
    if (day === 'saturday') {
      if (overlaps(start, end, 0, NIGHT_SAT_BEFORE)) return true;
      if (overlaps(start, end, NIGHT_SAT_AFTER, 24 * 60)) return true;
    }
  }
  return false;
}

// ── Trigger detection ─────────────────────────────────────────────────────────

export interface ComplianceTriggers {
  phe:           boolean;
  pheReasons:    string[];
  noiseVariance: boolean;
  nvReasons:     string[];
  cdConcurrence: boolean;
  cdReasons:     string[];
}

type PlanLike = Partial<PlanForm> | Partial<Plan>;

export function detectComplianceTriggers(plan: PlanLike): ComplianceTriggers {
  const pheReasons: string[] = [];
  const nvReasons:  string[] = [];
  const cdReasons:  string[] = [];

  const wh = plan.work_hours as WorkHours | undefined;

  // ── PHE triggers ──
  if (plan.impact_fullClosure)
    pheReasons.push('Full street closure');
  if (wh && workHoursDuringPeak(wh))
    pheReasons.push('Work hours overlap peak window (6–9 AM or 3:30–7 PM)');

  // ── NV triggers ──
  if (wh && workHoursDuringNight(wh))
    nvReasons.push('Work hours fall within night work window (LAMC 41.40)');

  // ── CD triggers ──
  if (plan.dir_directional)
    cdReasons.push('Directional closure');
  if (plan.impact_fullClosure)
    cdReasons.push('Full street closure');
  if ((plan as any).side_street)
    cdReasons.push('Side street closure');
  // PHE always requires CD concurrence
  if (pheReasons.length > 0)
    cdReasons.push('PHE required (CD concurrence always required with PHE)');

  // Deduplicate CD reasons
  const uniqueCdReasons = [...new Set(cdReasons)];

  return {
    phe:           pheReasons.length > 0,
    pheReasons,
    noiseVariance: nvReasons.length > 0,
    nvReasons,
    cdConcurrence: uniqueCdReasons.length > 0,
    cdReasons:     uniqueCdReasons,
  };
}

// ── PHE checklist builder ─────────────────────────────────────────────────────

export function buildPHEChecklist(): PHEChecklistItem[] {
  return [
    {
      id: 'phe_form',
      label: 'PHE Application Form',
      description: 'Complete and submit through BOE Customer Service Portal (engpermits.lacity.org)',
      required: true,
      completed: false,
    },
    {
      id: 'tcp_wtcp',
      label: 'LADOT Approved TCP / WTCP',
      description: 'Attach the approved Traffic Control Plan or WATCH Traffic Control Plan. Failure to provide will result in denial.',
      required: true,
      completed: false,
    },
    {
      id: 'council_comms',
      label: 'City Council District Communication',
      description: 'Copy of all communication with affected City Council District(s).',
      required: true,
      completed: false,
    },
    {
      id: 'fee_payment',
      label: 'Fee Payment Confirmation',
      description: 'Peak Hour Construction Exemption Fee (LAMC 62.61(b).3). Checks payable to City of Los Angeles.',
      required: true,
      completed: false,
    },
    {
      id: 'closure_schedule',
      label: 'Schedule of Street Closures',
      description: 'Required only for projects lasting 24 months or longer.',
      required: false,   // conditional — MOT marks applicable/N/A
      notApplicable: false,
      completed: false,
    },
  ];
}

// ── Compliance initializer ────────────────────────────────────────────────────

/**
 * Given detected triggers, build the initial compliance object for a plan.
 * Preserves any tracks already present (idempotent — safe to call again).
 */
export function initializeComplianceTracks(
  triggers: ComplianceTriggers,
  existing?: PlanCompliance
): PlanCompliance {
  const compliance: PlanCompliance = { ...(existing || {}) };

  if (triggers.phe && !compliance.phe) {
    compliance.phe = {
      status: 'not_started',
      triggeredBy: triggers.pheReasons,
      checklist: buildPHEChecklist(),
    } as PHETrack;
  }

  if (triggers.noiseVariance && !compliance.noiseVariance) {
    compliance.noiseVariance = {
      status: 'not_started',
      triggeredBy: triggers.nvReasons,
      attachments: [],
    } as NoiseVarianceTrack;
  }

  if (triggers.cdConcurrence && !compliance.cdConcurrence) {
    compliance.cdConcurrence = {
      status: 'not_started',
      triggeredBy: triggers.cdReasons,
      cds: [
        { cd: 'CD2', applicable: true, status: 'pending' },
        { cd: 'CD6', applicable: true, status: 'pending' },
        { cd: 'CD7', applicable: true, status: 'pending' },
      ],
    } as CDConcurrenceTrack;
  }

  return compliance;
}

// ── Progress helpers ──────────────────────────────────────────────────────────

export function pheProgress(phe: PHETrack): { done: number; total: number; pct: number } {
  const applicable = phe.checklist.filter(i => i.required || !i.notApplicable);
  const done = applicable.filter(i => i.completed).length;
  const total = applicable.length;
  return { done, total, pct: total > 0 ? Math.round((done / total) * 100) : 0 };
}

export function cdProgress(
  cds: CDConcurrenceTrack['cds']
): { done: number; total: number; pct: number } {
  const applicable = cds.filter(c => c.applicable);
  const done = applicable.filter(c => c.status === 'concurred').length;
  const total = applicable.length;
  return { done, total, pct: total > 0 ? Math.round((done / total) * 100) : 0 };
}

export function overallComplianceProgress(
  compliance: PlanCompliance
): { done: number; total: number; pct: number } {
  let done = 0;
  let total = 0;

  if (compliance.phe) {
    const p = pheProgress(compliance.phe);
    done  += p.done;
    total += p.total;
  }
  if (compliance.noiseVariance) {
    total += 1;
    if (['approved', 'submitted'].includes(compliance.noiseVariance.status)) done += 1;
  }
  if (compliance.cdConcurrence) {
    const p = cdProgress(compliance.cdConcurrence.cds);
    done  += p.done;
    total += p.total;
  }

  return { done, total, pct: total > 0 ? Math.round((done / total) * 100) : 0 };
}

// ── Status label helpers ──────────────────────────────────────────────────────

export const COMPLIANCE_STATUS_LABELS: Record<string, string> = {
  not_started:     'Not Started',
  in_progress:     'In Progress',
  linked_existing: 'Linked — Existing',
  submitted:       'Submitted',
  approved:        'Approved',
  expired:         'Expired',
};

export const CD_STATUS_LABELS: Record<string, string> = {
  pending:            'Pending',
  presentation_sent:  'Presentation Sent',
  meeting_scheduled:  'Meeting Scheduled',
  concurred:          'Concurred',
  declined:           'Declined',
  na:                 'N/A',
};
