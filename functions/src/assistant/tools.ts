import { getFirestore } from 'firebase-admin/firestore';
import {
  stageLabel, stageTarget, isCompletedStage,
  STAGES_IN_DOT_REVIEW, STAGES_AT_DOT_PIPELINE,
} from './stages';
import type { AssistantPlan, AttentionItem, AttentionSummary } from './types';

// Database is named — must match the one used by the rest of the functions.
function db(databaseId: string) {
  return getFirestore(databaseId);
}

// ── Date helpers ─────────────────────────────────────────────────────────────

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysBetween(fromISO: string | undefined | null, toISO: string): number | null {
  if (!fromISO) return null;
  const from = new Date(fromISO);
  const to = new Date(toISO);
  if (isNaN(from.getTime()) || isNaN(to.getTime())) return null;
  return Math.floor((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
}

// Best-effort: derive when the plan entered its current stage by walking the
// log array backwards for the most recent "stage" change. Falls back to
// requestDate so we never return null and skew the "stuck" math.
function daysInCurrentStage(plan: AssistantPlan): number {
  const today = todayISO();
  if (plan.log?.length) {
    for (let i = plan.log.length - 1; i >= 0; i--) {
      const entry = plan.log[i];
      if (!entry?.date) continue;
      const action = (entry.action || '').toLowerCase();
      if (action.includes('stage') || action.includes('moved')) {
        const d = daysBetween(entry.date, today);
        if (d != null) return d;
      }
    }
    // No stage transition recorded — use the first log entry as a proxy.
    const first = plan.log[0];
    const d = daysBetween(first?.date, today);
    if (d != null) return d;
  }
  return daysBetween(plan.requestDate || plan.dateRequested, today) ?? 0;
}

function planName(plan: AssistantPlan): string {
  const s1 = plan.street1?.trim();
  const s2 = plan.street2?.trim();
  if (s1 && s2) return `${s1} → ${s2}`;
  if (s1) return s1;
  return plan.id;
}

// ── Plan loading ─────────────────────────────────────────────────────────────

async function loadPlans(databaseId: string): Promise<AssistantPlan[]> {
  const snap = await db(databaseId).collection('plans').get();
  const plans: AssistantPlan[] = [];
  snap.forEach(doc => {
    const data = doc.data() as AssistantPlan;
    if (data.isHistorical) return;          // excluded from manager view
    if (isCompletedStage(data.stage)) return; // closed/cancelled/expired noise
    plans.push({ ...data, id: doc.id });
  });
  return plans;
}

// ── getContext ───────────────────────────────────────────────────────────────

export function getContext(callerEmail: string): object {
  const now = new Date();
  return {
    today: todayISO(),
    weekday: now.toLocaleDateString('en-US', { weekday: 'long' }),
    currentUserEmail: callerEmail,
    note: 'Times are in the assistant\'s timezone (server UTC). "Today" reflects calendar date.',
  };
}

// ── getAttentionSummary ──────────────────────────────────────────────────────

export async function getAttentionSummary(databaseId: string): Promise<AttentionSummary> {
  const today = todayISO();
  const plans = await loadPlans(databaseId);

  const overdue: AttentionItem[] = [];
  const stuck: AttentionItem[] = [];
  const cdOverdue: AttentionItem[] = [];
  const pheUpcoming: AttentionItem[] = [];
  const stalled: AttentionItem[] = [];

  for (const plan of plans) {
    const days = daysInCurrentStage(plan);
    const target = stageTarget(plan.type || 'Standard', plan.stage);

    // Stuck: days in stage exceeds the clock target for this stage/type.
    if (days > target) {
      stuck.push({
        id: plan.id,
        name: planName(plan),
        lead: plan.lead || 'unassigned',
        stage: stageLabel(plan.stage),
        reason: `${days}d in ${stageLabel(plan.stage)} (target ${target}d)`,
        severity: days - target,
        days,
      });
    }

    // Overdue: needByDate has passed and plan isn't approved/closed.
    const daysPastNeedBy = plan.needByDate ? daysBetween(plan.needByDate, today) : null;
    if (daysPastNeedBy != null && daysPastNeedBy > 0) {
      overdue.push({
        id: plan.id,
        name: planName(plan),
        lead: plan.lead || 'unassigned',
        stage: stageLabel(plan.stage),
        reason: `Need-by ${plan.needByDate} passed ${daysPastNeedBy}d ago`,
        severity: 30 + daysPastNeedBy,
        days: daysPastNeedBy,
      });
    }

    // CD overdue: any CD sent >21 days ago, still not concurred/declined.
    const cds = plan.compliance?.cdConcurrence?.cds || [];
    for (const cd of cds) {
      if (!cd.applicable || cd.status === 'concurred' || cd.status === 'declined' || cd.status === 'na') continue;
      const sentDays = cd.sentDate ? daysBetween(cd.sentDate, today) : null;
      if (sentDays != null && sentDays > 21) {
        cdOverdue.push({
          id: plan.id,
          name: planName(plan),
          lead: plan.lead || 'unassigned',
          stage: stageLabel(plan.stage),
          reason: `${cd.cd} sent ${sentDays}d ago, no response`,
          severity: 20 + sentDays,
          days: sentDays,
        });
      }
    }

    // PHE upcoming: PHE active but not approved, with needByDate ≤14 days out.
    const phe = plan.compliance?.phe;
    if (phe && phe.status !== 'approved' && plan.needByDate) {
      const daysUntilNeed = daysBetween(today, plan.needByDate);
      if (daysUntilNeed != null && daysUntilNeed >= 0 && daysUntilNeed <= 14) {
        pheUpcoming.push({
          id: plan.id,
          name: planName(plan),
          lead: plan.lead || 'unassigned',
          stage: stageLabel(plan.stage),
          reason: `PHE not approved, need-by in ${daysUntilNeed}d`,
          severity: 25 - daysUntilNeed,
          days: daysUntilNeed,
        });
      }
    }

    // Stalled: active plan with no log activity in 21+ days.
    const lastLog = plan.log?.length ? plan.log[plan.log.length - 1] : null;
    const daysSinceLog = lastLog?.date ? daysBetween(lastLog.date, today) : null;
    if (daysSinceLog != null && daysSinceLog > 21) {
      stalled.push({
        id: plan.id,
        name: planName(plan),
        lead: plan.lead || 'unassigned',
        stage: stageLabel(plan.stage),
        reason: `No activity in ${daysSinceLog}d`,
        severity: (daysSinceLog - 21) / 2,
        days: daysSinceLog,
      });
    }
  }

  const trim = (arr: AttentionItem[]) =>
    arr.sort((a, b) => b.severity - a.severity).slice(0, 3);

  const all = [...overdue, ...stuck, ...cdOverdue, ...pheUpcoming, ...stalled];
  const topConcern = all.length
    ? all.reduce((max, x) => (x.severity > max.severity ? x : max))
    : null;

  return {
    totalFlagged: new Set(all.map(x => x.id)).size,
    topConcern,
    buckets: {
      overdue:     { count: overdue.length,     items: trim(overdue) },
      stuck:       { count: stuck.length,       items: trim(stuck) },
      cdOverdue:   { count: cdOverdue.length,   items: trim(cdOverdue) },
      pheUpcoming: { count: pheUpcoming.length, items: trim(pheUpcoming) },
      stalled:     { count: stalled.length,     items: trim(stalled) },
    },
    asOf: new Date().toISOString(),
  };
}

// ── summarizePlans ───────────────────────────────────────────────────────────

export interface SummarizePlansArgs {
  type?: string;        // "WATCH" | "Standard" | "Engineered"
  lead?: string;        // exact match
  atDOT?: boolean;      // true = only stages in STAGES_AT_DOT_PIPELINE
  inDOTReview?: boolean; // true = only stages in STAGES_IN_DOT_REVIEW
  stage?: string;       // exact stage key
}

export async function summarizePlans(databaseId: string, args: SummarizePlansArgs) {
  const all = await loadPlans(databaseId);
  const filtered = all.filter(p => {
    if (args.type && p.type !== args.type) return false;
    if (args.lead && p.lead !== args.lead) return false;
    if (args.stage && p.stage !== args.stage) return false;
    if (args.atDOT && !STAGES_AT_DOT_PIPELINE.has(p.stage)) return false;
    if (args.inDOTReview && !STAGES_IN_DOT_REVIEW.has(p.stage)) return false;
    return true;
  });

  const byStage: Record<string, number> = {};
  const byLead: Record<string, number> = {};
  const byType: Record<string, number> = {};
  let oldestDays = 0;
  let oldestId = '';
  let totalDays = 0;
  let withDays = 0;

  for (const p of filtered) {
    byStage[stageLabel(p.stage)] = (byStage[stageLabel(p.stage)] || 0) + 1;
    byLead[p.lead || 'unassigned'] = (byLead[p.lead || 'unassigned'] || 0) + 1;
    byType[p.type || 'unknown'] = (byType[p.type || 'unknown'] || 0) + 1;
    const d = daysInCurrentStage(p);
    if (d > oldestDays) { oldestDays = d; oldestId = p.id; }
    totalDays += d;
    withDays++;
  }

  return {
    count: filtered.length,
    byStage,
    byLead,
    byType,
    oldestDays,
    oldestPlanId: oldestId || null,
    avgDaysInStage: withDays ? Math.round(totalDays / withDays) : 0,
    filtersApplied: args,
  };
}

// ── getWorkloadSummary ───────────────────────────────────────────────────────

export async function getWorkloadSummary(databaseId: string) {
  const plans = await loadPlans(databaseId);
  const byLead: Record<string, { open: number; oldestDays: number; oldestId: string }> = {};

  for (const p of plans) {
    const lead = p.lead || 'unassigned';
    if (!byLead[lead]) byLead[lead] = { open: 0, oldestDays: 0, oldestId: '' };
    byLead[lead].open++;
    const d = daysInCurrentStage(p);
    if (d > byLead[lead].oldestDays) {
      byLead[lead].oldestDays = d;
      byLead[lead].oldestId = p.id;
    }
  }

  const rows = Object.entries(byLead)
    .map(([lead, v]) => ({ lead, ...v }))
    .sort((a, b) => b.open - a.open);

  return { totalActivePlans: plans.length, byLead: rows };
}

// ── getPlans (drill-down list, capped) ───────────────────────────────────────

export interface GetPlansArgs {
  type?: string;
  lead?: string;
  stage?: string;
  atDOT?: boolean;
  inDOTReview?: boolean;
  minDaysInStage?: number;
  limit?: number;
}

export async function getPlans(databaseId: string, args: GetPlansArgs) {
  const all = await loadPlans(databaseId);
  const limit = Math.min(args.limit ?? 20, 50);

  const rows = all
    .filter(p => {
      if (args.type && p.type !== args.type) return false;
      if (args.lead && p.lead !== args.lead) return false;
      if (args.stage && p.stage !== args.stage) return false;
      if (args.atDOT && !STAGES_AT_DOT_PIPELINE.has(p.stage)) return false;
      if (args.inDOTReview && !STAGES_IN_DOT_REVIEW.has(p.stage)) return false;
      if (args.minDaysInStage != null && daysInCurrentStage(p) < args.minDaysInStage) return false;
      return true;
    })
    .map(p => ({
      id: p.id,
      name: planName(p),
      type: p.type,
      stage: stageLabel(p.stage),
      lead: p.lead || 'unassigned',
      daysInStage: daysInCurrentStage(p),
      needByDate: p.needByDate || null,
    }))
    .sort((a, b) => b.daysInStage - a.daysInStage)
    .slice(0, limit);

  return { count: rows.length, plans: rows };
}

// ── getPlanDetail ────────────────────────────────────────────────────────────

export async function getPlanDetail(databaseId: string, planId: string) {
  const doc = await db(databaseId).collection('plans').doc(planId).get();
  if (!doc.exists) return { found: false, planId };
  const p = doc.data() as AssistantPlan;
  const recentLog = (p.log || []).slice(-10).map(e => ({
    date: e.date, action: e.action, user: e.user,
  }));
  return {
    found: true,
    plan: {
      id: planId,
      name: planName(p),
      type: p.type,
      stage: stageLabel(p.stage),
      lead: p.lead || 'unassigned',
      requestedBy: p.requestedBy,
      requestDate: p.requestDate,
      needByDate: p.needByDate,
      submitDate: p.submitDate,
      approvedDate: p.approvedDate,
      daysInStage: daysInCurrentStage(p),
      compliance: p.compliance ? {
        phe: p.compliance.phe?.status,
        cdConcurrence: p.compliance.cdConcurrence?.status,
      } : null,
      recentLog,
    },
  };
}
