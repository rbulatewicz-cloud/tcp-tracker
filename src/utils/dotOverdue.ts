/**
 * DOT Overdue metric — single source of truth for "how long has DOT been
 * sitting on this plan?"
 *
 * A plan is currently waiting on DOT when it has an **open review cycle** —
 * one where we've submitted (`submittedDate` is set) but DOT hasn't responded
 * (`commentsReceivedDate` is not set). The clock starts at `submittedDate`
 * and stops the moment DOT returns comments.
 *
 * Thresholds come from `AppConfig.clockTargets[planType]`, which is already
 * editable in Settings > Workflow. We use the `dot_review` targets for first
 * cycles and `dot_review_final` for resubmits/LOC review cycles — both are
 * already configured per plan type.
 *
 * NOTE: Calendar days (per user request), parsed using the codebase's
 * `T00:00:00` convention to avoid west-coast timezone drift.
 */

import { Plan, ReviewCycle, AppConfig } from '../types';
import { CLOCK_TARGETS } from '../constants';

export type DotOverdueLevel = 'ok' | 'warning' | 'overdue';

export interface DotOverdueStatus {
  level: DotOverdueLevel;
  daysOpen: number;              // calendar days since submission
  warningThreshold: number;      // yellow — SLA warning
  overdueThreshold: number;      // red — SLA breached
  cycleType: ReviewCycle['cycleType'];
  cycleNumber: number;
  submittedDate: string;         // ISO — when the clock started
}

const MS_PER_DAY = 86_400_000;

/**
 * Parse YYYY-MM-DD (or full ISO) dates at local midnight.
 * Matches the `T00:00:00` trick used throughout MetricsView / TableView.
 */
function parseLocalDate(iso: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return new Date(iso + 'T00:00:00');
  return new Date(iso);
}

export function daysSince(iso: string, now: number = Date.now()): number {
  const t = parseLocalDate(iso).getTime();
  return Math.floor((now - t) / MS_PER_DAY);
}

/**
 * Returns the most recently submitted, still-open review cycle — i.e. the
 * one DOT currently owes us a response on. Returns null if the clock isn't
 * running (no open cycle, or nothing submitted yet).
 */
export function getOpenDotCycle(plan: Plan): ReviewCycle | null {
  const cycles = plan.reviewCycles ?? [];
  if (!cycles.length) return null;

  // Scan newest-first. Most code appends cycles in chronological order, so
  // reverse-iterate to hit the most recent.
  for (let i = cycles.length - 1; i >= 0; i--) {
    const c = cycles[i];
    if (c.submittedDate && !c.commentsReceivedDate) return c;
  }
  return null;
}

/**
 * Look up the applicable SLA thresholds for a plan's current cycle.
 *
 * - First cycles (cycleType === 'dot_review')       → `dot_review` targets
 * - Resubmit / LOC cycles (everything else)         → `dot_review_final` targets
 * - Fall back to built-in CLOCK_TARGETS if AppConfig.clockTargets doesn't
 *   yet have an entry for this plan type (older data).
 */
export function getDotSlaThresholds(
  planType: string,
  cycleType: ReviewCycle['cycleType'],
  appConfig?: AppConfig | null,
): { warning: number; target: number } | null {
  const phase = cycleType === 'dot_review' ? 'dot_review' : 'dot_review_final';
  const perType = appConfig?.clockTargets?.[planType] ?? CLOCK_TARGETS[planType];
  const thresholds = perType?.[phase];
  if (!thresholds) return null;
  return { warning: thresholds.warning, target: thresholds.target };
}

/**
 * The one function every UI surface calls. Returns the plan's current DOT
 * overdue status, or null if the plan is not currently waiting on DOT.
 */
export function getDotOverdueStatus(
  plan: Plan,
  appConfig?: AppConfig | null,
  now: number = Date.now(),
): DotOverdueStatus | null {
  const cycle = getOpenDotCycle(plan);
  if (!cycle || !cycle.submittedDate) return null;

  const thresholds = getDotSlaThresholds(plan.type, cycle.cycleType, appConfig);
  if (!thresholds) return null;

  const daysOpen = daysSince(cycle.submittedDate, now);
  const level: DotOverdueLevel =
    daysOpen >= thresholds.target  ? 'overdue' :
    daysOpen >= thresholds.warning ? 'warning' :
    'ok';

  return {
    level,
    daysOpen,
    warningThreshold: thresholds.warning,
    overdueThreshold: thresholds.target,
    cycleType: cycle.cycleType,
    cycleNumber: cycle.cycleNumber,
    submittedDate: cycle.submittedDate,
  };
}

/**
 * Filter + sort helper for the dashboard/report "Overdue with DOT" lists.
 * Includes warnings by default so the CR/MOT team can pre-empt a breach.
 */
export function getPlansOverdueWithDot(
  plans: Plan[],
  appConfig?: AppConfig | null,
  opts: { includeWarnings?: boolean; now?: number } = {},
): Array<{ plan: Plan; status: DotOverdueStatus }> {
  const { includeWarnings = true, now = Date.now() } = opts;
  const rows: Array<{ plan: Plan; status: DotOverdueStatus }> = [];

  for (const plan of plans) {
    const status = getDotOverdueStatus(plan, appConfig, now);
    if (!status) continue;
    if (status.level === 'ok') continue;
    if (!includeWarnings && status.level === 'warning') continue;
    rows.push({ plan, status });
  }

  // Worst offenders first: overdue before warning, then longest-waiting first.
  rows.sort((a, b) => {
    if (a.status.level !== b.status.level) {
      return a.status.level === 'overdue' ? -1 : 1;
    }
    return b.status.daysOpen - a.status.daysOpen;
  });

  return rows;
}

/**
 * Color helpers — consistent red/amber/green so every surface matches
 * the existing `dayColor` convention in MetricsView.
 */
export const DOT_LEVEL_COLORS: Record<DotOverdueLevel, { fg: string; bg: string; border: string; label: string }> = {
  ok:       { fg: '#065F46', bg: '#D1FAE5', border: '#A7F3D0', label: 'On time' },
  warning:  { fg: '#92400E', bg: '#FEF3C7', border: '#FDE68A', label: 'At risk' },
  overdue:  { fg: '#991B1B', bg: '#FEE2E2', border: '#FECACA', label: 'Overdue' },
};

/**
 * For the dashboard's "avg DOT turnaround" metric — buckets completed cycles
 * by month and returns { monthLabel, avgDays, count } over the last N months.
 */
export interface DotTurnaroundBucket {
  monthKey: string;   // e.g. "2026-04"
  monthLabel: string; // e.g. "Apr 2026"
  avgDays: number | null;
  count: number;
  byType: Record<string, { avgDays: number | null; count: number }>;
}

export function computeDotTurnaroundByMonth(
  plans: Plan[],
  months: number = 6,
  now: number = Date.now(),
): DotTurnaroundBucket[] {
  const buckets = new Map<string, { days: number[]; byType: Map<string, number[]> }>();

  // Seed empty buckets for the last N months so the chart doesn't skip gaps.
  const nowDate = new Date(now);
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(nowDate.getFullYear(), nowDate.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    buckets.set(key, { days: [], byType: new Map() });
  }

  for (const plan of plans) {
    for (const c of plan.reviewCycles ?? []) {
      if (!c.submittedDate || !c.commentsReceivedDate) continue;
      const resolved = parseLocalDate(c.commentsReceivedDate);
      const key = `${resolved.getFullYear()}-${String(resolved.getMonth() + 1).padStart(2, '0')}`;
      const bucket = buckets.get(key);
      if (!bucket) continue; // outside the N-month window
      const days = daysSince(c.submittedDate, resolved.getTime());
      if (days < 0 || days > 365) continue; // reject junk
      bucket.days.push(days);
      const typeList = bucket.byType.get(plan.type) ?? [];
      typeList.push(days);
      bucket.byType.set(plan.type, typeList);
    }
  }

  const avg = (arr: number[]) =>
    arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;

  return Array.from(buckets.entries()).map(([key, b]) => {
    const [y, m] = key.split('-').map(Number);
    const monthLabel = new Date(y, m - 1, 1).toLocaleString('en-US', { month: 'short', year: 'numeric' });
    const byType: Record<string, { avgDays: number | null; count: number }> = {};
    b.byType.forEach((days, type) => {
      byType[type] = { avgDays: avg(days), count: days.length };
    });
    return { monthKey: key, monthLabel, avgDays: avg(b.days), count: b.days.length, byType };
  });
}
