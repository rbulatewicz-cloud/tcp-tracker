import { COMPLETED_STAGES, AT_DOT_STAGES } from '../constants';
import type { Plan } from '../types';

export const getLocalDateString = () => new Date().toLocaleDateString('en-CA');

/**
 * Display-safe LOC formatter. Guarantees a single "LOC-" prefix regardless of
 * whether plan.loc was stored with or without the prefix (historical data is
 * inconsistent — some records have "LOC-371", some have "371"). Prefer this
 * over `p.loc || p.id` for user-facing renders.
 */
export function formatPlanLoc(plan: { loc?: string | null; id?: string }): string {
  const raw = plan.loc || plan.id || '';
  if (!raw) return '—';
  return raw.startsWith('LOC-') ? raw : `LOC-${raw}`;
}

/** Compute the next `.N` renewal LOC for a base LOC, scanning existing plans. */
export function getNextRevisionLoc(baseLoc: string, plans: Plan[]): string {
  const base = baseLoc.replace(/\.\d+$/, '');
  const existing = plans
    .map(p => p.loc || p.id)
    .filter(loc => loc.startsWith(base + '.'))
    .map(loc => parseInt(loc.slice(base.length + 1), 10))
    .filter(n => !isNaN(n));
  return `${base}.${existing.length > 0 ? Math.max(...existing) + 1 : 1}`;
}

/** Format an ISO date string (YYYY-MM-DD or full ISO timestamp) to "Jan 1, 2024". Returns "—" for empty/invalid. */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  // Full ISO timestamp (contains 'T') → parse as-is; date-only string → force local midnight
  const d = iso.includes('T') ? new Date(iso) : new Date(iso + 'T00:00:00');
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Format an ISO date string to "January 1, 2024" (long month). Used for formal letters/documents. Returns '' for empty. */
export function fmtDateLong(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = iso.includes('T') ? new Date(iso) : new Date(iso + 'T00:00:00');
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

/** Convert a 24-hour "HH:MM" string to a readable "H AM/PM" label */
export function fmt12(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return m === 0 ? `${hour} ${ampm}` : `${hour}:${m.toString().padStart(2, '0')} ${ampm}`;
}

export const getUserLabel = (currentUser: any) => {
  if (!currentUser) return "Guest";
  return `${currentUser.name} (${currentUser.role})`;
};

export const daysBetween = (d1: string, d2: string) => {
  const diff = Math.floor((new Date(d2).getTime() - new Date(d1).getTime()) / 86400000);
  return isNaN(diff) ? 0 : diff;
};

export const getCycleTime = (plan: any) => {
    const requested = plan.dateRequested || plan.requestDate || plan.log.find((l: any) => l.action.includes("Imported"))?.date;
    const submitted = plan.dateSubmittedToDOT;
    const approved = plan.dateApproved;

    const dotCourtTime = (submitted && approved) ? daysBetween(submitted, approved) : null;
    const overallDuration = (requested && approved) ? daysBetween(requested, approved) : null;

    return { dotCourtTime, overallDuration };
  };

export const getStageDurations = (plan: any, STAGES: any[], getLocalDateString: () => string) => {
  const stageDetails: { key: string, label: string, start: string, end: string, duration: number }[] = [];
  const history = plan.statusHistory || plan.log || [];
  if (history.length === 0) return stageDetails;

  // Sort logs by date
  const logs = [...history].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  
  // Create a timeline of stages
  const timeline: { stage: string, start: string }[] = [];
  
  // If the plan has a dateRequested, treat it as the start of the "Requested" stage
  if (plan.dateRequested) {
    timeline.push({ stage: "Requested", start: plan.dateRequested });
  }

  // Add stages from logs
  logs.forEach(log => {
    if (log.action.startsWith("Status → ")) {
      const stageLabel = log.action.replace("Status → ", "");
      timeline.push({ stage: stageLabel, start: log.date });
    }
  });

  // Calculate durations
  for (let i = 0; i < timeline.length; i++) {
    const current = timeline[i];
    const next = timeline[i+1];
    
    const stage = STAGES.find(s => s.label === current.stage);
    if (stage) {
      const endDate = next ? next.start : getLocalDateString();
      const days = daysBetween(current.start.split(" ")[0], endDate.split(" ")[0]);
      stageDetails.push({ 
        key: stage.key, 
        label: stage.label, 
        start: current.start.split(" ")[0], 
        end: endDate, 
        duration: Math.max(0, days) 
      });
    }
  }
  
  return stageDetails;
};

export const daysFromToday = (d: string, TODAY: Date) => Math.floor((new Date(d).getTime() - TODAY.getTime()) / 86400000);

/** Days from today until an ISO date string (negative = past). */
export function daysUntil(isoDate: string): number {
  const target = new Date(isoDate + 'T00:00:00');
  const today  = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export const formatFileSize = (bytes: number) => {
  if (!bytes || bytes === 0) return '—';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

export const calcMetrics = (plans: any[], LEADS: string[], td: string, TODAY: Date) => {
  const active = plans.filter(p => !COMPLETED_STAGES.includes(p.stage));
  const atDOT = plans.filter(p => AT_DOT_STAGES.includes(p.stage));
  const approved = plans.filter(p => p.approvedDate && p.submitDate);
  const approvedWatch = approved.filter(p => p.type === 'WATCH');
  const approvedStandard = approved.filter(p => p.type === 'Standard');
  const approvedEngineered = approved.filter(p => p.type === 'Engineered');
  const approvedWithRequest = plans.filter(p => p.approvedDate && (p.dateRequested || p.requestDate));
  const approvedWithRequestWatch = approvedWithRequest.filter(p => p.type === 'WATCH');
  const approvedWithRequestStandard = approvedWithRequest.filter(p => p.type === 'Standard');
  const approvedWithRequestEngineered = approvedWithRequest.filter(p => p.type === 'Engineered');
  const atRisk = plans.filter(p => !COMPLETED_STAGES.includes(p.stage) && p.needByDate && daysFromToday(p.needByDate, TODAY) <= 14);
  const overdue = plans.filter(p => !COMPLETED_STAGES.includes(p.stage) && p.needByDate && daysFromToday(p.needByDate, TODAY) < 0);
  const past20 = atDOT.filter(p => p.submitDate && daysBetween(p.submitDate, td) > 20);
  const avgTurn = approved.length > 0 ? (approved.reduce((s,p) => s + daysBetween(p.submitDate, p.approvedDate), 0) / approved.length).toFixed(1) : "—";
  const avgTurnWatch = approvedWatch.length > 0 ? (approvedWatch.reduce((s,p) => s + daysBetween(p.submitDate, p.approvedDate), 0) / approvedWatch.length).toFixed(1) : "—";
  const avgTurnStandard = approvedStandard.length > 0 ? (approvedStandard.reduce((s,p) => s + daysBetween(p.submitDate, p.approvedDate), 0) / approvedStandard.length).toFixed(1) : "—";
  const avgTurnEngineered = approvedEngineered.length > 0 ? (approvedEngineered.reduce((s,p) => s + daysBetween(p.submitDate, p.approvedDate), 0) / approvedEngineered.length).toFixed(1) : "—";
  
  const avgOverage = approvedWithRequest.length > 0 ? (approvedWithRequest.reduce((s,p) => s + daysBetween(p.dateRequested || p.requestDate, p.approvedDate), 0) / approvedWithRequest.length).toFixed(1) : "—";
  const avgOverageWatch = approvedWithRequestWatch.length > 0 ? (approvedWithRequestWatch.reduce((s,p) => s + daysBetween(p.dateRequested || p.requestDate, p.approvedDate), 0) / approvedWithRequestWatch.length).toFixed(1) : "—";
  const avgOverageStandard = approvedWithRequestStandard.length > 0 ? (approvedWithRequestStandard.reduce((s,p) => s + daysBetween(p.dateRequested || p.requestDate, p.approvedDate), 0) / approvedWithRequestStandard.length).toFixed(1) : "—";
  const avgOverageEngineered = approvedWithRequestEngineered.length > 0 ? (approvedWithRequestEngineered.reduce((s,p) => s + daysBetween(p.dateRequested || p.requestDate, p.approvedDate), 0) / approvedWithRequestEngineered.length).toFixed(1) : "—";
  
  const atDOTWithDate = atDOT.filter(p => p.submitDate);
  const avgWait = atDOTWithDate.length > 0
    ? (atDOTWithDate.reduce((s, p) => s + daysBetween(p.submitDate, td), 0) / atDOTWithDate.length).toFixed(1)
    : "—";

  const atDOTWatch      = atDOTWithDate.filter(p => p.type === 'WATCH');
  const atDOTStandard   = atDOTWithDate.filter(p => p.type === 'Standard');
  const atDOTEngineered = atDOTWithDate.filter(p => p.type === 'Engineered');
  const avgWaitWatch      = atDOTWatch.length      > 0 ? (atDOTWatch.reduce((s, p)      => s + daysBetween(p.submitDate, td), 0) / atDOTWatch.length).toFixed(1)      : "—";
  const avgWaitStandard   = atDOTStandard.length   > 0 ? (atDOTStandard.reduce((s, p)   => s + daysBetween(p.submitDate, td), 0) / atDOTStandard.length).toFixed(1)   : "—";
  const avgWaitEngineered = atDOTEngineered.length > 0 ? (atDOTEngineered.reduce((s, p) => s + daysBetween(p.submitDate, td), 0) / atDOTEngineered.length).toFixed(1) : "—";

  const atDotWaitMetric = {
    total: avgWait,
    breakdown: [
      { type: 'W', value: avgWaitWatch,      color: '#3B82F6' },
      { type: 'S', value: avgWaitStandard,   color: '#10B981' },
      { type: 'E', value: avgWaitEngineered, color: '#F59E0B' },
    ]
  };

  const turnaroundMetric = {
    total: avgTurn,
    breakdown: [
      { type: 'W', value: avgTurnWatch, color: '#3B82F6' },
      { type: 'S', value: avgTurnStandard, color: '#10B981' },
      { type: 'E', value: avgTurnEngineered, color: '#F59E0B' }
    ]
  };

  const overageMetric = {
    total: avgOverage,
    breakdown: [
      { type: 'W', value: avgOverageWatch, color: '#3B82F6' },
      { type: 'S', value: avgOverageStandard, color: '#10B981' },
      { type: 'E', value: avgOverageEngineered, color: '#F59E0B' }
    ]
  };
  
  // Calculate Avg Drafting Time
  const draftingStats = plans.map(p => {
    const startLog = p.log.find((l: any) => l.action.includes("Drafting") || l.action.includes("Engineering Team"));
    if (!startLog) return null;
    const endLog = p.log.find((l: any) => new Date(l.date) > new Date(startLog.date) && (l.action.includes("Status →") && !l.action.includes("Drafting")));
    const endDate = endLog ? endLog.date : (p.stage === 'drafting' ? td : null);
    if (!endDate) return null;
    return daysBetween(startLog.date, endDate);
  }).filter(t => t !== null) as number[];
  const avgDrafting = draftingStats.length > 0 ? (draftingStats.reduce((a, b) => a + b, 0) / draftingStats.length).toFixed(1) : "—";

  const leadLoad: any = {};
  LEADS.forEach(l => { const t = plans.filter(p=>p.lead===l).length; const pe = plans.filter(p=>p.lead===l&&!COMPLETED_STAGES.includes(p.stage)).length; if(t>0) leadLoad[l]={total:t,pending:pe}; });
  return { total: plans.length, active: active.length, atDOT: atDOT.length, atRisk: atRisk.length, overdue: overdue.length, past20: past20.length, turnaroundMetric, overageMetric, atDotWaitMetric, avgWaiting: avgWait, avgDrafting, leadLoad };
};
