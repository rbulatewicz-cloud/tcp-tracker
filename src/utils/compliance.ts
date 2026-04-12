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
  DrivewayNoticeTrack,
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

// Peak hours: Mon–Fri ONLY  6:00–9:00 AM  and  3:30–7:00 PM
// Weekends do NOT have BOE peak hour restrictions — only LAMC 41.40 noise variance applies
const PEAK_MORNING_START = 6 * 60;       // 360
const PEAK_MORNING_END   = 9 * 60;       // 540
const PEAK_EVENING_START = 15 * 60 + 30; // 930
const PEAK_EVENING_END   = 19 * 60;      // 1140

function windowOverlapsPeak(start: string, end: string): boolean {
  return (
    overlaps(start, end, PEAK_MORNING_START, PEAK_MORNING_END) ||
    overlaps(start, end, PEAK_EVENING_START, PEAK_EVENING_END)
  );
}

function workHoursDuringPeak(wh: WorkHours): boolean {
  if (wh.shift === 'continuous') return true;

  // Dual-shift: check daytime and nighttime windows independently.
  // PHE is only needed if a window individually crosses a peak period.
  if (wh.shift === 'both') {
    if (!wh.days.includes('weekday')) return false;
    // Daytime window (fall back to weekday_start/end for legacy records)
    const dayStart = wh.day_start ?? wh.weekday_start;
    const dayEnd   = wh.day_end   ?? wh.weekday_end;
    if (dayStart && dayEnd && windowOverlapsPeak(dayStart, dayEnd)) return true;
    // Nighttime window
    if (wh.night_start && wh.night_end && windowOverlapsPeak(wh.night_start, wh.night_end)) return true;
    return false;
  }

  // Mixed: check weekday's per-day shift configuration
  if (wh.shift === 'mixed') {
    if (!wh.days.includes('weekday')) return false;
    const wdShift = wh.weekday_shift ?? 'daytime';
    if (wdShift === 'both') {
      const dayStart = wh.day_start ?? wh.weekday_start;
      const dayEnd   = wh.day_end   ?? wh.weekday_end;
      if (dayStart && dayEnd && windowOverlapsPeak(dayStart, dayEnd)) return true;
      if (wh.night_start && wh.night_end && windowOverlapsPeak(wh.night_start, wh.night_end)) return true;
      return false;
    }
    // daytime or nighttime single window on weekdays
    const start = wh.weekday_start;
    const end   = wh.weekday_end;
    if (!start || !end) return false;
    return windowOverlapsPeak(start, end);
  }

  // Single-shift: original logic
  for (const day of wh.days) {
    if (day !== 'weekday') continue; // PHE is Mon–Fri only; weekends use NV only
    const start = wh[`${day}_start` as keyof WorkHours] as string | undefined;
    const end   = wh[`${day}_end`   as keyof WorkHours] as string | undefined;
    if (!start || !end) continue;
    if (windowOverlapsPeak(start, end)) return true;
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

  // Dual-shift: each day type has its own nighttime window — check against NV rules
  if (wh.shift === 'both') {
    if (wh.days.includes('sunday')) return true;
    // Weekday: use dedicated weekday night window
    if (wh.days.includes('weekday')) {
      const ns = wh.night_start;
      const ne = wh.night_end;
      if (ns && ne) {
        if (overlaps(ns, ne, NIGHT_WEEKDAY_START, 24 * 60)) return true;
        if (overlaps(ns, ne, 0, NIGHT_WEEKDAY_END)) return true;
      }
    }
    // Saturday: use saturday-specific night window (fall back to shared window for legacy records)
    if (wh.days.includes('saturday')) {
      const ns = wh.saturday_night_start ?? wh.night_start;
      const ne = wh.saturday_night_end   ?? wh.night_end;
      if (ns && ne) {
        if (overlaps(ns, ne, 0, NIGHT_SAT_BEFORE)) return true;
        if (overlaps(ns, ne, NIGHT_SAT_AFTER, 24 * 60)) return true;
      }
    }
    return false;
  }

  // Mixed: check each day according to its per-day shift setting
  if (wh.shift === 'mixed') {
    for (const day of wh.days) {
      // Sunday always triggers NV regardless of shift type
      if (day === 'sunday') return true;

      const dayShift = (wh as any)[`${day}_shift`] as string | undefined ?? 'daytime';

      // Daytime-only days: no nighttime window to check
      if (dayShift === 'daytime') continue;

      if (day === 'weekday') {
        if (dayShift === 'both') {
          const ns = wh.night_start;
          const ne = wh.night_end;
          if (ns && ne) {
            if (overlaps(ns, ne, NIGHT_WEEKDAY_START, 24 * 60)) return true;
            if (overlaps(ns, ne, 0, NIGHT_WEEKDAY_END)) return true;
          }
        } else {
          // nighttime single window
          const start = wh.weekday_start;
          const end   = wh.weekday_end;
          if (start && end) {
            if (overlaps(start, end, NIGHT_WEEKDAY_START, 24 * 60)) return true;
            if (overlaps(start, end, 0, NIGHT_WEEKDAY_END)) return true;
          }
        }
      }

      if (day === 'saturday') {
        if (dayShift === 'both') {
          const ns = wh.saturday_night_start ?? wh.night_start;
          const ne = wh.saturday_night_end   ?? wh.night_end;
          if (ns && ne) {
            if (overlaps(ns, ne, 0, NIGHT_SAT_BEFORE)) return true;
            if (overlaps(ns, ne, NIGHT_SAT_AFTER, 24 * 60)) return true;
          }
        } else {
          // nighttime single window
          const start = wh.saturday_start;
          const end   = wh.saturday_end;
          if (start && end) {
            if (overlaps(start, end, 0, NIGHT_SAT_BEFORE)) return true;
            if (overlaps(start, end, NIGHT_SAT_AFTER, 24 * 60)) return true;
          }
        }
      }
    }
    return false;
  }

  // Single-shift: original logic
  for (const day of wh.days) {
    if (day === 'sunday') return true; // all Sunday = night work
    const start = wh[`${day}_start` as keyof WorkHours] as string | undefined;
    const end   = wh[`${day}_end`   as keyof WorkHours] as string | undefined;
    if (!start || !end) continue;
    if (day === 'weekday') {
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
  phe:              boolean;
  pheReasons:       string[];
  noiseVariance:    boolean;
  nvReasons:        string[];
  cdConcurrence:    boolean;
  cdReasons:        string[];
  suggestedCDs?:    ('CD2' | 'CD6' | 'CD7')[];  // derived from street location
  drivewayNotices:  boolean;
  drivewayReasons:  string[];
}

// ── Council District street-range suggestion ──────────────────────────────────

/**
 * Given the primary and cross streets from a plan, suggest which council
 * districts are likely applicable along the Van Nuys Blvd corridor.
 *
 * Boundaries (approximate, post-2022 redistricting):
 *   CD 7  — north:  Sylmar / Mission Hills / Pacoima
 *                   (north of ~Hubbard St / Arleta Ave on Van Nuys Blvd)
 *   CD 6  — middle: Arleta / North Hills / Panorama City / northern Van Nuys
 *                   (Hubbard St south to ~Vanowen St)
 *   CD 2  — south:  Van Nuys (south of Vanowen), toward G Line / Oxnard
 *
 * Returns all matching districts; defaults to all three if nothing matches.
 */
export function suggestCDsFromStreets(
  street1 = '',
  street2 = ''
): ('CD2' | 'CD6' | 'CD7')[] {
  const text = `${street1} ${street2}`.toLowerCase();
  const cds = new Set<'CD2' | 'CD6' | 'CD7'>();

  // CD 7 keywords — Pacoima, Sylmar, Mission Hills, northern corridor
  if (/pacoima|sylmar|mission hills|glenoaks|osborne|laurel canyon|san fernando rd|san fernando road|maclay|paxton|hubbard|foothill/i.test(text)) {
    cds.add('CD7');
  }

  // CD 6 keywords — Arleta, North Hills, Panorama City, central Van Nuys
  if (/arleta|north hills|panorama city|panorama|woodman|nordhoff|roscoe|sherman way|van nuys metrolink|chase|strathern/i.test(text)) {
    cds.add('CD6');
  }

  // CD 2 keywords — southern Van Nuys, toward the G Line
  if (/victory|vanowen|oxnard|g line|saticoy|magnolia|burbank|erwin|bessemer/i.test(text)) {
    cds.add('CD2');
  }

  // If nothing matched, suggest all three (let the user decide)
  if (cds.size === 0) return ['CD2', 'CD6', 'CD7'];

  return Array.from(cds);
}

type PlanLike = Partial<PlanForm> | Partial<Plan>;

export function detectComplianceTriggers(plan: PlanLike): ComplianceTriggers {
  const pheReasons:      string[] = [];
  const nvReasons:       string[] = [];
  const cdReasons:       string[] = [];
  const drivewayReasons: string[] = [];

  const wh = plan.work_hours as WorkHours | undefined;

  // ── PHE triggers — time-based only (LAMC 62.61, BOE) ──
  if (wh && workHoursDuringPeak(wh))
    pheReasons.push('Weekday work hours overlap peak window (Mon–Fri 6–9 AM or 3:30–7 PM)');

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

  // ── Driveway Notices trigger ──
  if (plan.impact_driveway)
    drivewayReasons.push('Driveway impact — affected property owners require advance notice');

  // Deduplicate CD reasons
  const uniqueCdReasons = [...new Set(cdReasons)];

  const suggestedCDs = suggestCDsFromStreets(
    (plan as any).street1 ?? '',
    (plan as any).street2 ?? ''
  );

  return {
    phe:             pheReasons.length > 0,
    pheReasons,
    noiseVariance:   nvReasons.length > 0,
    nvReasons,
    cdConcurrence:   uniqueCdReasons.length > 0,
    cdReasons:       uniqueCdReasons,
    suggestedCDs,
    drivewayNotices: drivewayReasons.length > 0,
    drivewayReasons,
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
    // Auto-suggest applicable districts based on streets; default all true if no match
    const suggested = triggers.suggestedCDs ?? ['CD2', 'CD6', 'CD7'];
    compliance.cdConcurrence = {
      status: 'not_started',
      triggeredBy: triggers.cdReasons,
      cds: ((['CD2', 'CD6', 'CD7'] as const)).map(cd => ({
        cd,
        applicable: suggested.includes(cd),
        status: suggested.includes(cd) ? 'pending' : 'na',
      })),
    } as CDConcurrenceTrack;
  }

  if (triggers.drivewayNotices && !compliance.drivewayNotices) {
    compliance.drivewayNotices = {
      status: 'not_started',
      triggeredBy: triggers.drivewayReasons,
      addresses: [],
    } as DrivewayNoticeTrack;
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
    if (['approved', 'submitted', 'linked_existing'].includes(compliance.noiseVariance.status)) done += 1;
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
  follow_up_sent:     'Follow-Up Sent',
  concurred:          'Concurred',
  declined:           'Declined',
  na:                 'N/A',
};

export const DRIVEWAY_STATUS_LABELS: Record<string, string> = {
  not_started: 'Not Started',
  in_progress: 'In Progress',
  sent:        'Notices Sent',
  completed:   'Completed',
  na:          'N/A',
};
