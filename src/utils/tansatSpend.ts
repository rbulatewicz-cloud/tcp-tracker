/**
 * TANSAT spend + needs-attention utility — single source of truth for the
 * dashboard KPI tile, MOT Hub triage cards, status report section, and
 * library rollup. Mirrors the shape and conventions of `dotOverdue.ts`.
 *
 * Calendar days throughout (matching the rest of the app). Posting calendar
 * quirk per LADOT: if a target start date is Sunday/Monday/Tuesday, signs
 * are posted the previous Friday — `getActualPostingDate` exposes that.
 *
 * See docs/specs/tansat.md §4 (state machine), §5 (surfaces), §11 (edge cases).
 */

import type {
  TansatRequest, TansatStatus, TansatSettings, Plan, PlanTansatPhase,
} from '../types';
import { DEFAULT_TANSAT_SETTINGS } from '../constants';

// ── Constants ────────────────────────────────────────────────────────────────
const MS_PER_DAY = 86_400_000;

/** Date-only ISO parsing using the codebase's `T00:00:00` convention. */
function parseLocalDate(iso: string): Date {
  if (!iso) return new Date(NaN);
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return new Date(iso + 'T00:00:00');
  return new Date(iso);
}

function daysBetween(aIso: string, bIso: string): number {
  const a = parseLocalDate(aIso).getTime();
  const b = parseLocalDate(bIso).getTime();
  return Math.floor((b - a) / MS_PER_DAY);
}

function todayIso(now: number = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

/**
 * Count business days (Mon-Fri) between two dates, exclusive of the start.
 * Used for the extension window check (LADOT requires 10 business days notice
 * before phase end). Naive — does not account for holidays.
 */
export function getBusinessDaysUntil(targetIso: string, now: number = Date.now()): number {
  const target = parseLocalDate(targetIso);
  if (isNaN(target.getTime())) return Infinity;
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (start >= target) return 0;
  let count = 0;
  const cursor = new Date(start);
  while (cursor < target) {
    cursor.setDate(cursor.getDate() + 1);
    const dow = cursor.getDay(); // 0 = Sunday, 6 = Saturday
    if (dow !== 0 && dow !== 6) count++;
  }
  return count;
}

/**
 * LADOT posting calendar quirk — if the work start date is Sunday, Monday,
 * or Tuesday, signs are posted the previous Friday. Returns the date signs
 * actually go up so MOT and SFTC can see the real start of the no-parking
 * window. For other days, signs go up 2 days prior (also LADOT default).
 */
export function getActualPostingDate(startDateIso: string): string {
  const d = parseLocalDate(startDateIso);
  if (isNaN(d.getTime())) return '';
  const dow = d.getDay();
  // 0=Sun, 1=Mon, 2=Tue → roll back to previous Friday
  // Otherwise → 2 days prior
  let offset: number;
  if (dow === 0) offset = 2;        // Sun: posted Fri (back 2)
  else if (dow === 1) offset = 3;   // Mon: posted Fri (back 3)
  else if (dow === 2) offset = 4;   // Tue: posted Fri (back 4)
  else offset = 2;                  // Wed-Sat: posted 2 days prior
  const posted = new Date(d);
  posted.setDate(posted.getDate() - offset);
  return posted.toISOString().slice(0, 10);
}

// ── Settings access ──────────────────────────────────────────────────────────
function readSettings(s?: TansatSettings | null): TansatSettings {
  return (s ?? DEFAULT_TANSAT_SETTINGS) as TansatSettings;
}

// ── Spend rollup ─────────────────────────────────────────────────────────────

export interface SpendBucket {
  monthKey: string;     // "2026-04"
  monthLabel: string;   // "Apr 2026"
  total: number;        // sum of paidAmount
  count: number;        // # of requests with payment in this month
  byActivity: Record<string, number>; // activity → total dollars
}

/**
 * Returns the total spend across requests where `paidAt` falls within the
 * given month. Cancelled requests still count if they were paid (per spec
 * §11 — money was actually spent).
 */
export function getMonthlySpend(
  requests: TansatRequest[],
  monthKey: string,                  // "YYYY-MM"
): { total: number; count: number; requests: TansatRequest[] } {
  const matching = requests.filter(r => {
    if (r.paidAt == null || r.paidAmount == null) return false;
    return r.paidAt.startsWith(monthKey);
  });
  const total = matching.reduce((sum, r) => sum + (r.paidAmount ?? 0), 0);
  return { total, count: matching.length, requests: matching };
}

export function getCurrentMonthKey(now: number = Date.now()): string {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * 6-month spend trend, bucketed by month of payment. Used by the dashboard
 * KPI tile companion view and the future Spend Trend report. Empty months
 * are seeded so the chart doesn't gap.
 */
export function getMonthlySpendTrend(
  requests: TansatRequest[],
  months: number = 6,
  now: number = Date.now(),
): SpendBucket[] {
  const buckets = new Map<string, SpendBucket>();
  const nowDate = new Date(now);
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(nowDate.getFullYear(), nowDate.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    buckets.set(key, { monthKey: key, monthLabel: label, total: 0, count: 0, byActivity: {} });
  }
  for (const r of requests) {
    if (r.paidAt == null || r.paidAmount == null) continue;
    const key = r.paidAt.slice(0, 7);
    const bucket = buckets.get(key);
    if (!bucket) continue;
    bucket.total += r.paidAmount;
    bucket.count++;
    const act = r.activity ?? 'other';
    bucket.byActivity[act] = (bucket.byActivity[act] ?? 0) + r.paidAmount;
  }
  return Array.from(buckets.values());
}

// ── Needs-attention triage ───────────────────────────────────────────────────

export type TansatAttentionReason =
  | 'needs_packet'
  | 'awaiting_invoice'
  | 'payment_due'
  | 'extension_window'
  | 'closeout_pending';

export interface TansatAttentionItem {
  reason: TansatAttentionReason;
  severity: 'red' | 'amber' | 'gray';
  request?: TansatRequest;       // populated for everything except needs_packet
  plan?: Plan;                   // populated for needs_packet
  phase?: PlanTansatPhase;       // populated for needs_packet
  daysUntil?: number;            // days until trigger fires (for sorting)
  detail: string;                // short human-readable hint for UI
}

/**
 * Returns every TANSAT-related item that needs attention right now, across
 * all plans and requests. Powers the MOT Hub triage cards and the Status
 * Report "needs attention this week" section.
 *
 * Five triggers per spec §8:
 *   1. needs_packet      — phase start ≤ N days, no request created yet
 *   2. awaiting_invoice  — emailed > N days ago, no log #
 *   3. payment_due       — invoice received, due in ≤ N days, not paid
 *   4. extension_window  — phase end ≤ N business days, no extension filed
 *   5. closeout_pending  — schedule end passed, status not `closed`
 */
export function getRequestsNeedingAttention(
  plans: Plan[],
  requests: TansatRequest[],
  settings?: TansatSettings | null,
  now: number = Date.now(),
): TansatAttentionItem[] {
  const s = readSettings(settings);
  const today = todayIso(now);
  const items: TansatAttentionItem[] = [];

  // Index requests by plan + phase coverage so we can detect "no request for
  // this phase yet". A request "covers" a phase if phaseNumbers includes it.
  const requestsByPlan = new Map<string, TansatRequest[]>();
  for (const r of requests) {
    if (!r.planId) continue;
    const arr = requestsByPlan.get(r.planId) ?? [];
    arr.push(r);
    requestsByPlan.set(r.planId, arr);
  }

  // 1. Needs packet — for each plan's phase that needs TANSAT, check if any
  //    open request covers it. If not, and the phase starts within the
  //    threshold, surface it.
  for (const plan of plans) {
    const phases = plan.tansatPhases ?? [];
    if (!phases.length) continue;
    const planRequests = requestsByPlan.get(plan.id) ?? [];
    for (const phase of phases) {
      if (!phase.needsTansat) continue;
      if (!phase.anticipatedStart) continue;
      const daysUntil = daysBetween(today, phase.anticipatedStart);
      if (daysUntil > s.thresholds.needsPacketDays) continue;
      // Already covered by an active request?
      const covered = planRequests.some(r =>
        (r.phaseNumbers ?? []).includes(phase.phaseNumber)
        && r.status !== 'cancelled' && r.status !== 'expired',
      );
      if (covered) continue;
      items.push({
        reason: 'needs_packet',
        severity: daysUntil <= 7 ? 'red' : 'amber',
        plan,
        phase,
        daysUntil,
        detail: daysUntil <= 0
          ? `Phase ${phase.phaseNumber} started ${Math.abs(daysUntil)}d ago — no packet yet`
          : `Phase ${phase.phaseNumber} starts in ${daysUntil}d — no packet yet`,
      });
    }
  }

  // 2. Awaiting invoice — emailed but no log # received
  for (const r of requests) {
    if (r.status !== 'emailed') continue;
    if (!r.emailSentAt) continue;
    const daysWaited = daysBetween(r.emailSentAt.slice(0, 10), today);
    if (daysWaited < s.thresholds.awaitingInvoiceDays) continue;
    items.push({
      reason: 'awaiting_invoice',
      severity: 'amber',
      request: r,
      daysUntil: daysWaited,
      detail: `Sent ${r.emailSentAt.slice(0, 10)} · ${daysWaited} days waited — follow up?`,
    });
  }

  // 3. Payment due — invoice received, due soon, not paid
  for (const r of requests) {
    if (r.status !== 'invoice_received') continue;
    if (!r.paymentDueDate) continue;
    const daysUntil = daysBetween(today, r.paymentDueDate);
    if (daysUntil > s.thresholds.paymentDueDays) continue;
    items.push({
      reason: 'payment_due',
      severity: 'red',
      request: r,
      daysUntil,
      detail: daysUntil < 0
        ? `Payment ${Math.abs(daysUntil)}d overdue (LOG #${r.logNumber ?? '—'})`
        : `Payment due in ${daysUntil}d (LOG #${r.logNumber ?? '—'})`,
    });
  }

  // 4. Extension window — phase end within N business days, no active extension
  for (const r of requests) {
    if (r.status !== 'paid' && r.status !== 'posted' && r.status !== 'active') continue;
    if (!r.schedule?.endDate) continue;
    const businessDaysUntil = getBusinessDaysUntil(r.schedule.endDate, now);
    if (businessDaysUntil > s.thresholds.extensionWindowBusinessDays) continue;
    if (businessDaysUntil < 0) continue;
    const hasActiveExtension = (r.extensions ?? []).some(e =>
      e.status === 'sent' || e.status === 'confirmed',
    );
    if (hasActiveExtension) continue;
    items.push({
      reason: 'extension_window',
      severity: 'amber',
      request: r,
      daysUntil: businessDaysUntil,
      detail: `Ends ${r.schedule.endDate} · file extension by ${businessDaysUntil} business days`,
    });
  }

  // 5. Close-out pending — work end passed, not closed
  for (const r of requests) {
    if (r.status === 'closed' || r.status === 'cancelled') continue;
    if (!r.schedule?.endDate) continue;
    const daysSinceEnd = daysBetween(r.schedule.endDate, today);
    if (daysSinceEnd <= 0) continue;
    items.push({
      reason: 'closeout_pending',
      severity: 'gray',
      request: r,
      daysUntil: -daysSinceEnd, // negative = days OVER end
      detail: `Ended ${r.schedule.endDate} (${daysSinceEnd}d ago) — close out?`,
    });
  }

  // Stable sort: red first, then amber, then gray; within severity by
  // urgency (smaller daysUntil = more urgent).
  const severityRank: Record<TansatAttentionItem['severity'], number> = { red: 0, amber: 1, gray: 2 };
  items.sort((a, b) => {
    if (a.severity !== b.severity) return severityRank[a.severity] - severityRank[b.severity];
    return (a.daysUntil ?? 0) - (b.daysUntil ?? 0);
  });
  return items;
}

// ── Status helpers ──────────────────────────────────────────────────────────

/**
 * Filter requests to a specific status (or set of statuses). Convenience
 * wrapper used by Library/MOT Hub for "show me everything in `paid`" etc.
 */
export function getRequestsByStatus(
  requests: TansatRequest[],
  ...statuses: TansatStatus[]
): TansatRequest[] {
  const set = new Set(statuses);
  return requests.filter(r => set.has(r.status));
}

/** Sum total paid across a set of requests (for plan-card and library rollups). */
export function getTotalPaid(requests: TansatRequest[]): number {
  return requests.reduce((sum, r) => sum + (r.paidAmount ?? 0), 0);
}
