import type { Plan } from '../types';

const COMPLETED_STAGES = new Set(['approved', 'plan_approved', 'implemented', 'tcp_approved_final']);
const INACTIVE_STAGES  = new Set(['approved', 'plan_approved', 'implemented', 'tcp_approved_final', 'closed', 'expired', 'cancelled']);

export interface TurnaroundStats {
  /** Average calendar days from request → approval, null if no qualifying plans */
  avgDays: number | null;
  /** Number of plans the average is based on */
  sampleSize: number;
  /** Plans of this type currently in active stages (not completed/closed) */
  inProgress: number;
}

/**
 * Calculate turnaround stats for a given plan type.
 *
 * Rules (Option A):
 *  - Only completed plans (plan_approved / approved / implemented)
 *  - Approved within the last `windowDays` calendar days
 *  - Excludes plans where PHE or CD Concurrence was triggered
 *  - Excludes historical/imported plans
 *  - Clock: requestDate → approvedDate (calendar days)
 */
export function getTurnaroundStats(
  type: string,
  plans: Plan[],
  windowDays = 60
): TurnaroundStats {
  if (!type || !plans.length) return { avgDays: null, sampleSize: 0, inProgress: 0 };

  const cutoff = Date.now() - windowDays * 24 * 60 * 60 * 1000;

  // In-progress: this type, not completed/closed, not historical
  const inProgress = plans.filter(
    p => p.type === type && !INACTIVE_STAGES.has(p.stage) && !p.isHistorical
  ).length;

  // Qualifying completed plans
  const days: number[] = [];
  for (const p of plans) {
    if (p.type !== type)         continue;
    if (!COMPLETED_STAGES.has(p.stage)) continue;
    if (p.isHistorical)          continue;
    if (!p.approvedDate)         continue;

    // Must have been approved within the window
    const approvedMs = new Date(p.approvedDate + 'T00:00:00').getTime();
    if (isNaN(approvedMs) || approvedMs < cutoff) continue;

    // Option A: skip plans that had PHE or CD Concurrence triggered
    const phe = p.compliance?.phe;
    const cd  = p.compliance?.cdConcurrence;
    if (phe && phe.status !== 'not_started') continue;
    if (cd  && cd.status  !== 'not_started') continue;

    // Calculate turnaround in calendar days
    const reqStr = p.requestDate || p.dateRequested;
    if (!reqStr) continue;
    const reqMs = new Date(reqStr + 'T00:00:00').getTime();
    if (isNaN(reqMs)) continue;

    const elapsed = (approvedMs - reqMs) / (1000 * 60 * 60 * 24);
    // Sanity bounds: ignore negatives or suspiciously large values (>1 year)
    if (elapsed >= 0 && elapsed <= 365) days.push(elapsed);
  }

  if (!days.length) return { avgDays: null, sampleSize: 0, inProgress };

  const avg = days.reduce((a, b) => a + b, 0) / days.length;
  return {
    avgDays:    Math.round(avg * 10) / 10,
    sampleSize: days.length,
    inProgress,
  };
}
