import React from 'react';
import { daysBetween } from '../utils/plans';
import { Plan, ReportTemplate, FilterState } from '../types';
import { CLOCK_TARGETS } from '../constants';
import type { GlobalLogEntry } from '../services/logService';

interface MetricsViewProps {
  filtered: Plan[];
  allPlans?: Plan[];
  globalLogs?: GlobalLogEntry[];
  metrics: Record<string, unknown>;
  monoFont: string;
  TODAY: Date;
  setSelectedPlan: (plan: Plan | null) => void;
  setView: (view: string) => void;
  setFilter: React.Dispatch<React.SetStateAction<FilterState>>;
  reportTemplate: ReportTemplate;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysSince(iso?: string): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

function daysAgoMs(days: number) {
  return Date.now() - days * 86_400_000;
}

function timeAgo(iso: string): string {
  // Date-only strings (YYYY-MM-DD) are parsed as UTC midnight by new Date(),
  // which shifts them to "yesterday" for users west of UTC. Appending T00:00:00
  // forces local-midnight parsing instead.
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(iso + 'T00:00:00') : new Date(iso);
  const diff = Date.now() - parsed.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7)  return `${days} days ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KPICard({ label, value, delta, deltaType, barPct, accent, onClick }: {
  label: string; value: number | string; delta: string;
  deltaType: 'up' | 'down' | 'neutral'; barPct: number; accent: string;
  onClick?: () => void;
}) {
  const deltaColor = deltaType === 'neutral' ? '#94A3B8' : deltaType === 'up' ? '#EF4444' : '#10B981';
  return (
    <div
      onClick={onClick}
      style={{
        background: '#fff', borderRadius: 12, border: '1px solid #E2E8F0', padding: '16px 20px',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'box-shadow .15s, border-color .15s',
      }}
      onMouseEnter={e => { if (onClick) (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 12px rgba(0,0,0,.08)'; }}
      onMouseLeave={e => { if (onClick) (e.currentTarget as HTMLDivElement).style.boxShadow = ''; }}
    >
      <div style={{ fontSize: 10, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 32, fontWeight: 800, lineHeight: 1.1, color: accent, margin: '4px 0 2px' }}>{value}</div>
      <div style={{ fontSize: 11, color: deltaColor, marginBottom: 10 }}>{delta}</div>
      <div style={{ height: 3, background: '#F1F5F9', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ height: '100%', borderRadius: 2, background: accent, width: `${Math.min(barPct, 100)}%`, transition: 'width .4s' }} />
      </div>
      {onClick && <div style={{ fontSize: 9, color: '#CBD5E1', marginTop: 6, textAlign: 'right' }}>Click to view →</div>}
    </div>
  );
}

// ── Tag pill ──────────────────────────────────────────────────────────────────

function Tag({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <span style={{ display: 'inline-flex', padding: '2px 7px', borderRadius: 4, fontSize: 10, fontWeight: 700, color, background: bg }}>
      {label}
    </span>
  );
}

// ── Plan Type Breakdown ───────────────────────────────────────────────────────

const AT_DOT_STAGE_SET = new Set(['submitted_to_dot','submitted','dot_review','loc_submitted','loc_review','resubmit_review','resubmitted']);
const INACTIVE_STAGE_SET = new Set(['approved','plan_approved','implemented','tcp_approved_final','closed','cancelled','expired']);

const TYPE_META: Record<string, { color: string; bg: string; border: string; emoji: string }> = {
  WATCH:      { color: '#92400E', bg: '#FFFBEB', border: '#FDE68A', emoji: '👁' },
  Standard:   { color: '#1E40AF', bg: '#EFF6FF', border: '#BFDBFE', emoji: '📋' },
  Engineered: { color: '#5B21B6', bg: '#F5F3FF', border: '#DDD6FE', emoji: '⚙️' },
};

// Find how many days ago the plan last changed stage, using log entries
function daysInCurrentStage(plan: any): number | null {
  const log: any[] = plan.log || [];
  // Walk backwards to find the most recent status change log entry
  for (let i = log.length - 1; i >= 0; i--) {
    const action: string = log[i].action || '';
    if (action.includes('Status') && (action.includes('→') || action.includes('changed') || action.includes('Changed'))) {
      const rawDate: string = (log[i].date || '').split(',')[0].trim();
      if (!rawDate) continue;
      return Math.floor((Date.now() - new Date(rawDate + 'T00:00:00').getTime()) / 86_400_000);
    }
  }
  // Fallback: use requestDate
  if (plan.requestDate) {
    return Math.floor((Date.now() - new Date(plan.requestDate + 'T00:00:00').getTime()) / 86_400_000);
  }
  return null;
}

function dayColor(days: number | null, type: string): string {
  if (days === null) return '#94A3B8';
  const t = CLOCK_TARGETS[type]?.dot_review;
  if (!t) return '#94A3B8';
  if (days > t.target)  return '#EF4444';  // red — over target
  if (days > t.warning) return '#F59E0B';  // amber — approaching
  return '#10B981';                         // green — on track
}

function PlanTypeSummary({ filtered, setView, setFilter }: {
  filtered: any[];
  setView: (v: string) => void;
  setFilter: React.Dispatch<React.SetStateAction<FilterState>>;
}) {
  const PLAN_TYPES = ['WATCH', 'Standard', 'Engineered'];

  const rows = PLAN_TYPES.map(type => {
    const active  = filtered.filter(p => p.type === type && !INACTIVE_STAGE_SET.has(p.stage) && !p.isHistorical);
    const atDot   = active.filter(p => AT_DOT_STAGE_SET.has(p.stage));
    const drafting = active.filter(p => p.stage === 'drafting' || p.stage === 'requested');

    const dotDays = atDot.map(p => daysInCurrentStage(p)).filter((d): d is number => d !== null);
    const avgDot  = dotDays.length ? Math.round(dotDays.reduce((a, b) => a + b, 0) / dotDays.length) : null;
    const maxDot  = dotDays.length ? Math.max(...dotDays) : null;

    const t = CLOCK_TARGETS[type]?.dot_review;
    const overTarget = atDot.filter(p => {
      const d = daysInCurrentStage(p);
      return d !== null && t && d > t.target;
    }).length;

    return { type, active: active.length, atDot: atDot.length, drafting: drafting.length, avgDot, maxDot, overTarget };
  }).filter(r => r.active > 0);

  if (!rows.length) return null;

  return (
    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E2E8F0', padding: 20, marginBottom: 16 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 12 }}>
        Plan Pipeline by Type
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${rows.length},1fr)`, gap: 10 }}>
        {rows.map(({ type, active, atDot, drafting, avgDot, maxDot, overTarget }) => {
          const meta = TYPE_META[type] ?? TYPE_META.Standard;
          const t = CLOCK_TARGETS[type]?.dot_review;
          return (
            <button
              key={type}
              onClick={() => { setFilter(f => ({ ...f, type })); setView('table'); }}
              style={{
                background: meta.bg, borderRadius: 10, border: `1px solid ${meta.border}`,
                padding: '12px 14px', textAlign: 'left', cursor: 'pointer',
                transition: 'box-shadow .15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,.08)')}
              onMouseLeave={e => (e.currentTarget.style.boxShadow = '')}
            >
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#0F172A' }}>{meta.emoji} {type}</span>
                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: meta.border, color: meta.color }}>
                  {active} active
                </span>
              </div>

              {/* Stage breakdown */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
                {drafting > 0 && (
                  <span style={{ display: 'inline-flex', padding: '2px 7px', borderRadius: 4, fontSize: 10, fontWeight: 700, color: '#1E40AF', background: '#DBEAFE' }}>
                    {drafting} drafting
                  </span>
                )}
                {atDot > 0 && (
                  <span style={{ display: 'inline-flex', padding: '2px 7px', borderRadius: 4, fontSize: 10, fontWeight: 700, color: overTarget > 0 ? '#991B1B' : '#92400E', background: overTarget > 0 ? '#FEE2E2' : '#FEF3C7' }}>
                    {atDot} at DOT{overTarget > 0 ? ` · ${overTarget} over` : ''}
                  </span>
                )}
              </div>

              {/* Time-in-review stats */}
              {atDot > 0 && (
                <div style={{ borderTop: `1px solid ${meta.border}`, paddingTop: 8 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 4 }}>
                    Days in Review
                  </div>
                  <div style={{ display: 'flex', gap: 12 }}>
                    {avgDot !== null && (
                      <div>
                        <div style={{ fontSize: 18, fontWeight: 800, color: dayColor(avgDot, type), lineHeight: 1 }}>{avgDot}d</div>
                        <div style={{ fontSize: 9, color: '#94A3B8' }}>avg</div>
                      </div>
                    )}
                    {maxDot !== null && (
                      <div>
                        <div style={{ fontSize: 18, fontWeight: 800, color: dayColor(maxDot, type), lineHeight: 1 }}>{maxDot}d</div>
                        <div style={{ fontSize: 9, color: '#94A3B8' }}>max</div>
                      </div>
                    )}
                    {t && (
                      <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                        <div style={{ fontSize: 18, fontWeight: 800, color: '#CBD5E1', lineHeight: 1 }}>{t.target}d</div>
                        <div style={{ fontSize: 9, color: '#94A3B8' }}>target</div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div style={{ fontSize: 9, color: '#CBD5E1', marginTop: 8, textAlign: 'right' }}>View plans →</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Compliance Health Cards ───────────────────────────────────────────────────

function ComplianceHealthCards({ filtered, setView }: { filtered: any[]; setView: (v: string) => void }) {
  const pheAll = filtered.filter(p => p.compliance?.phe);
  const ph = {
    approved:    pheAll.filter(p => p.compliance.phe.status === 'approved').length,
    submitted:   pheAll.filter(p => p.compliance.phe.status === 'submitted').length,
    in_progress: pheAll.filter(p => ['in_progress','linked_existing'].includes(p.compliance.phe.status)).length,
    not_started: pheAll.filter(p => p.compliance.phe.status === 'not_started').length,
    expired:     pheAll.filter(p => p.compliance.phe.status === 'expired').length,
  };

  const nvAll = filtered.filter(p => p.compliance?.noiseVariance);
  const nv = {
    approved:    nvAll.filter(p => p.compliance.noiseVariance.status === 'approved').length,
    submitted:   nvAll.filter(p => p.compliance.noiseVariance.status === 'submitted').length,
    linked:      nvAll.filter(p => p.compliance.noiseVariance.status === 'linked_existing').length,
    in_progress: nvAll.filter(p => p.compliance.noiseVariance.status === 'in_progress').length,
    not_started: nvAll.filter(p => p.compliance.noiseVariance.status === 'not_started').length,
  };

  const cdAll = filtered.filter(p => p.compliance?.cdConcurrence);
  let cdConcurred = 0, cdWaiting = 0, cdOverdue = 0, cdPending = 0, cdTotal = 0;
  cdAll.forEach(p => {
    (p.compliance.cdConcurrence.cds ?? []).forEach((c: any) => {
      if (!c.applicable || c.status === 'na') return;
      cdTotal++;
      if (c.status === 'concurred') { cdConcurred++; }
      else if (['presentation_sent','meeting_scheduled','follow_up_sent'].includes(c.status)) {
        const d = daysSince(c.sentDate ?? c.meetingDate);
        if (d !== null && d > 21) cdOverdue++; else cdWaiting++;
      } else cdPending++;
    });
  });

  const dwAll = filtered.filter(p => p.compliance?.drivewayNotices);
  const dwNA       = dwAll.filter(p => p.compliance.drivewayNotices.status === 'na').length;
  const dwActive   = dwAll.length - dwNA;
  const dwAllSent  = dwAll.filter(p => { const a = p.compliance.drivewayNotices.addresses ?? []; return a.length > 0 && a.every((x: any) => x.letterStatus === 'sent'); }).length;
  const dwWithMetro= dwAll.filter(p => (p.compliance.drivewayNotices.addresses ?? []).some((x: any) => ['submitted_to_metro','approved'].includes(x.letterStatus))).length;
  const dwInProg   = Math.max(0, dwActive - dwAllSent - dwWithMetro);

  if (!pheAll.length && !nvAll.length && !cdAll.length && !dwAll.length) return null;

  const phePct = pheAll.length ? Math.round((ph.approved / pheAll.length) * 100) : 0;
  const nvPct  = nvAll.length  ? Math.round(((nv.approved + nv.linked) / nvAll.length) * 100) : 0;
  const cdPct  = cdTotal       ? Math.round((cdConcurred / cdTotal) * 100) : 0;
  const dwPct  = dwAll.length  ? Math.round(((dwAllSent + dwNA) / dwAll.length) * 100) : 0;

  return (
    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E2E8F0', padding: 20 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 12 }}>Compliance Health by Track</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>

        {pheAll.length > 0 && (
          <div onClick={() => setView('variances')} style={{ background: '#FFFBEB', borderRadius: 10, border: '1px solid #FEF3C7', padding: '12px 14px', cursor: 'pointer', transition: 'box-shadow .15s' }}
            onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,.08)')} onMouseLeave={e => (e.currentTarget.style.boxShadow = '')}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#0F172A' }}>🏛 PHE (BOE)</span>
              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: '#FEF3C7', color: '#92400E' }}>{pheAll.length} active</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
              {ph.submitted > 0   && <Tag label={`${ph.submitted} submitted`}   color="#1E40AF" bg="#DBEAFE" />}
              {ph.in_progress > 0 && <Tag label={`${ph.in_progress} pending`}   color="#92400E" bg="#FEF3C7" />}
              {ph.approved > 0    && <Tag label={`${ph.approved} approved`}     color="#065F46" bg="#D1FAE5" />}
              {ph.not_started > 0 && <Tag label={`${ph.not_started} not started`} color="#475569" bg="#F1F5F9" />}
              {ph.expired > 0     && <Tag label={`${ph.expired} expired`}       color="#991B1B" bg="#FEE2E2" />}
            </div>
            <div style={{ height: 4, background: '#E2E8F0', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ height: '100%', background: phePct === 100 ? '#10B981' : '#F59E0B', width: `${phePct}%`, transition: 'width .4s' }} />
            </div>
            <div style={{ fontSize: 9, color: '#94A3B8', marginTop: 3 }}>{ph.approved} of {pheAll.length} approved · click to open Library →</div>
          </div>
        )}

        {nvAll.length > 0 && (
          <div onClick={() => setView('variances')} style={{ background: '#F5F3FF', borderRadius: 10, border: '1px solid #EDE9FE', padding: '12px 14px', cursor: 'pointer', transition: 'box-shadow .15s' }}
            onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,.08)')} onMouseLeave={e => (e.currentTarget.style.boxShadow = '')}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#0F172A' }}>🔊 Noise Variance</span>
              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: '#EDE9FE', color: '#5B21B6' }}>{nvAll.length} active</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
              {nv.linked > 0      && <Tag label={`${nv.linked} linked`}        color="#5B21B6" bg="#EDE9FE" />}
              {nv.submitted > 0   && <Tag label={`${nv.submitted} submitted`}  color="#1E40AF" bg="#DBEAFE" />}
              {nv.in_progress > 0 && <Tag label={`${nv.in_progress} pending`}  color="#92400E" bg="#FEF3C7" />}
              {nv.approved > 0    && <Tag label={`${nv.approved} approved`}    color="#065F46" bg="#D1FAE5" />}
              {nv.not_started > 0 && <Tag label={`${nv.not_started} not started`} color="#475569" bg="#F1F5F9" />}
            </div>
            <div style={{ height: 4, background: '#E2E8F0', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ height: '100%', background: nvPct === 100 ? '#10B981' : '#8B5CF6', width: `${nvPct}%`, transition: 'width .4s' }} />
            </div>
            <div style={{ fontSize: 9, color: '#94A3B8', marginTop: 3 }}>{nv.linked + nv.approved} of {nvAll.length} resolved · click to open Library →</div>
          </div>
        )}

        {cdAll.length > 0 && (
          <div onClick={() => setView('variances')} style={{ background: cdOverdue > 0 ? '#FFF5F5' : '#EFF6FF', borderRadius: 10, border: `1px solid ${cdOverdue > 0 ? '#FECACA' : '#DBEAFE'}`, padding: '12px 14px', cursor: 'pointer', transition: 'box-shadow .15s' }}
            onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,.08)')} onMouseLeave={e => (e.currentTarget.style.boxShadow = '')}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#0F172A' }}>🏙 CD Concurrence</span>
              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: '#DBEAFE', color: '#1E40AF' }}>{cdAll.length} active</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
              {cdConcurred > 0 && <Tag label={`${cdConcurred} concurred`} color="#065F46" bg="#D1FAE5" />}
              {cdWaiting > 0   && <Tag label={`${cdWaiting} waiting`}     color="#92400E" bg="#FEF3C7" />}
              {cdOverdue > 0   && <Tag label={`${cdOverdue} overdue`}     color="#991B1B" bg="#FEE2E2" />}
              {cdPending > 0   && <Tag label={`${cdPending} pending`}     color="#475569" bg="#F1F5F9" />}
            </div>
            <div style={{ height: 4, background: '#E2E8F0', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ height: '100%', background: cdOverdue > 0 ? '#EF4444' : cdPct === 100 ? '#10B981' : '#3B82F6', width: `${cdPct}%`, transition: 'width .4s' }} />
            </div>
            <div style={{ fontSize: 9, color: '#94A3B8', marginTop: 3 }}>{cdConcurred} of {cdTotal} districts concurred · click to open Library →</div>
          </div>
        )}

        {dwAll.length > 0 && (
          <div onClick={() => setView('variances')} style={{ background: '#F0FDF4', borderRadius: 10, border: '1px solid #DCFCE7', padding: '12px 14px', cursor: 'pointer', transition: 'box-shadow .15s' }}
            onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,.08)')} onMouseLeave={e => (e.currentTarget.style.boxShadow = '')}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#0F172A' }}>🏠 Driveway Notices</span>
              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: '#D1FAE5', color: '#065F46' }}>{dwAll.length} active</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
              {dwAllSent > 0    && <Tag label={`${dwAllSent} all sent`}       color="#065F46" bg="#D1FAE5" />}
              {dwWithMetro > 0  && <Tag label={`${dwWithMetro} with Metro`}   color="#1E40AF" bg="#DBEAFE" />}
              {dwInProg > 0     && <Tag label={`${dwInProg} in progress`}     color="#92400E" bg="#FEF3C7" />}
              {dwNA > 0         && <Tag label={`${dwNA} N/A`}                 color="#475569" bg="#F1F5F9" />}
            </div>
            <div style={{ height: 4, background: '#E2E8F0', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ height: '100%', background: '#10B981', width: `${dwPct}%`, transition: 'width .4s' }} />
            </div>
            <div style={{ fontSize: 9, color: '#94A3B8', marginTop: 3 }}>{dwAllSent + dwNA} of {dwAll.length} resolved · click to open Library →</div>
          </div>
        )}

      </div>
    </div>
  );
}

// ── Overdue / Needs Attention Table ───────────────────────────────────────────

function NeedsAttentionTable({ filtered, monoFont, setSelectedPlan, setView }: {
  filtered: any[]; monoFont: string;
  setSelectedPlan: (p: any) => void; setView: (v: string) => void;
}) {
  // Build rows from all compliance tracks needing action
  const rows: { planId: string; loc: string; location: string; track: string; trackColor: string; trackBg: string; status: string; statusColor: string; statusBg: string; daysWaiting: number | null; lead: string; urgent: boolean; plan: any }[] = [];

  filtered.forEach(p => {
    const loc = p.loc || p.id;
    const location = [p.street1, p.street2].filter(Boolean).join(' / ');
    const lead = (p.lead || '').split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2);

    // CD entries waiting/overdue
    (p.compliance?.cdConcurrence?.cds ?? []).forEach((c: any) => {
      if (!c.applicable || c.status === 'na' || c.status === 'concurred') return;
      if (!['presentation_sent','meeting_scheduled','follow_up_sent'].includes(c.status)) return;
      const d = daysSince(c.sentDate ?? c.meetingDate);
      if (d === null || d < 7) return; // only show if waiting ≥ 7 days
      const urgent = d > 21;
      const statusLabels: Record<string,string> = { presentation_sent: 'Presentation Sent', meeting_scheduled: 'Meeting Scheduled', follow_up_sent: 'Follow-Up Sent' };
      rows.push({ planId: p.id, loc, location, track: `CD Concurrence · ${c.cd}`, trackColor: '#92400E', trackBg: '#FEF3C7', status: statusLabels[c.status] ?? c.status, statusColor: urgent ? '#991B1B' : '#92400E', statusBg: urgent ? '#FEE2E2' : '#FEF3C7', daysWaiting: d, lead, urgent, plan: p });
    });

    // PHE submitted/in_progress
    const phe = p.compliance?.phe;
    if (phe && ['in_progress','submitted'].includes(phe.status)) {
      const d = daysSince(phe.submittedDate ?? p.createdAt);
      const statusLabels: Record<string,string> = { submitted: 'Submitted', in_progress: 'In Progress' };
      rows.push({ planId: p.id, loc, location, track: 'PHE', trackColor: '#1E40AF', trackBg: '#DBEAFE', status: statusLabels[phe.status] ?? phe.status, statusColor: '#1E40AF', statusBg: '#DBEAFE', daysWaiting: d, lead, urgent: false, plan: p });
    }

    // NV submitted/in_progress
    const nv = p.compliance?.noiseVariance;
    if (nv && ['in_progress','submitted'].includes(nv.status)) {
      const d = daysSince(nv.submittedDate ?? p.createdAt);
      const statusLabels: Record<string,string> = { submitted: 'Submitted', in_progress: 'In Progress' };
      rows.push({ planId: p.id, loc, location, track: 'Noise Variance', trackColor: '#5B21B6', trackBg: '#EDE9FE', status: statusLabels[nv.status] ?? nv.status, statusColor: '#5B21B6', statusBg: '#EDE9FE', daysWaiting: d, lead, urgent: false, plan: p });
    }
  });

  // Sort: urgent first, then by days waiting desc
  rows.sort((a, b) => {
    if (a.urgent !== b.urgent) return a.urgent ? -1 : 1;
    return (b.daysWaiting ?? 0) - (a.daysWaiting ?? 0);
  });

  if (!rows.length) return (
    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E2E8F0', padding: 20 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 12 }}>Overdue — Needs Attention Now</div>
      <div style={{ padding: '20px 0', textAlign: 'center', color: '#10B981', fontSize: 13 }}>✓ All compliance tracks are current</div>
    </div>
  );

  return (
    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E2E8F0', padding: 20 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 12 }}>Overdue — Needs Attention Now</div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #F1F5F9' }}>
            {['LOC','Location','Track','Status','Days Waiting','Assigned'].map(h => (
              <th key={h} style={{ fontSize: 10, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '.4px', padding: '4px 8px', textAlign: 'left' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} onClick={() => { setSelectedPlan(r.plan); setView('table'); }} style={{ borderBottom: '1px solid #F8FAFC', cursor: 'pointer', background: i % 2 === 0 ? '#fff' : '#FAFBFC' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#F8FAFC')}
              onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? '#fff' : '#FAFBFC')}
            >
              <td style={{ padding: '8px 8px', fontFamily: monoFont, fontSize: 11, fontWeight: 700, color: '#D97706' }}>{r.loc}</td>
              <td style={{ padding: '8px 8px', fontSize: 12, color: '#475569' }}>{r.location}</td>
              <td style={{ padding: '8px 8px' }}><span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4, color: r.trackColor, background: r.trackBg }}>{r.track}</span></td>
              <td style={{ padding: '8px 8px' }}><span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4, color: r.statusColor, background: r.statusBg }}>{r.status}</span></td>
              <td style={{ padding: '8px 8px' }}>
                {r.daysWaiting !== null
                  ? <span style={{ fontWeight: 700, fontSize: 12, color: r.urgent ? '#EF4444' : '#F59E0B' }}>{r.daysWaiting}d{r.urgent ? ' ⚠' : ''}</span>
                  : <span style={{ color: '#94A3B8' }}>—</span>
                }
              </td>
              <td style={{ padding: '8px 8px' }}>
                <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#DBEAFE', color: '#1E40AF', fontSize: 9, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{r.lead || '?'}</div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Recent Activity Feed ──────────────────────────────────────────────────────

function RecentActivityFeed({ filtered, allPlans, globalLogs, setSelectedPlan, setView }: {
  filtered: any[]; allPlans?: any[]; globalLogs?: GlobalLogEntry[];
  setSelectedPlan: (p: any) => void; setView: (v: string) => void;
}) {
  const todayKey = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in local time

  const entries = React.useMemo(() => {
    const source = allPlans && allPlans.length > 0 ? allPlans : filtered;
    // Plan-level log entries — today only
    const planEntries = source.flatMap(p =>
      (p.log ?? [])
        .filter((l: any) => l.date === todayKey)
        .map((l: any) => ({
          ...l,
          planId: p.id,
          loc: p.loc,
          plan: p,
          _tsMs: l.uniqueId ? Number(l.uniqueId) : 0,
        }))
    );
    // Global log entries (Library, CR Hub) — today only
    const globalEntries = (globalLogs ?? [])
      .filter(g => g.date === todayKey)
      .map(g => ({
        date: g.date,
        action: g.action,
        user: g.user,
        planId: null,
        loc: g.planLoc ?? g.reference,
        plan: null,
        source: g.source,
        _tsMs: g.createdAt ? Date.parse(g.createdAt) : 0,
      }));

    return [...planEntries, ...globalEntries]
      .filter(l => l.date && l.action)
      .sort((a, b) => b._tsMs - a._tsMs)
      .slice(0, 20);
  }, [filtered, allPlans, globalLogs, todayKey]);

  const getStyle = (action: string, source?: string): { icon: string; color: string; bg: string } => {
    if (source === 'library')  return { icon: '📐', color: '#0891B2', bg: '#CFFAFE' };
    if (source === 'cr_hub')   return { icon: '🏘', color: '#9333EA', bg: '#F3E8FF' };
    if (action.includes('Status changed'))  return { icon: '🔄', color: '#3B82F6', bg: '#DBEAFE' };
    if (action.includes('Uploaded'))        return { icon: '📎', color: '#10B981', bg: '#D1FAE5' };
    if (action.includes('Deleted'))         return { icon: '🗑', color: '#EF4444', bg: '#FEE2E2' };
    if (action.includes('New request'))     return { icon: '🆕', color: '#8B5CF6', bg: '#EDE9FE' };
    if (action.includes('Note added'))      return { icon: '📝', color: '#F59E0B', bg: '#FEF3C7' };
    if (action.includes('wiped') || action.includes('cleared')) return { icon: '🧹', color: '#6B7280', bg: '#F3F4F6' };
    return { icon: 'ℹ', color: '#64748B', bg: '#F1F5F9' };
  };

  return (
    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E2E8F0', padding: 20 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 12 }}>Today's Activity</div>
      {entries.length === 0
        ? <div style={{ fontSize: 12, color: '#94A3B8', textAlign: 'center', padding: '16px 0' }}>No activity yet today</div>
        : entries.map((e, i) => {
            const s = getStyle(e.action, e.source);
            const handleClick = e.plan
              ? () => { setSelectedPlan(e.plan); setView('table'); }
              : () => setView(e.source === 'cr_hub' ? 'cr_hub' : 'library');
            return (
              <div key={i} onClick={handleClick}
                style={{ display: 'flex', gap: 10, padding: '7px 0', borderBottom: '1px solid #F8FAFC', alignItems: 'flex-start', cursor: 'pointer' }}
              >
                <div style={{ width: 26, height: 26, borderRadius: 6, background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, flexShrink: 0, marginTop: 1 }}>{s.icon}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: '#334155', lineHeight: 1.4 }}>
                    <strong style={{ color: s.color }}>{e.loc}</strong> — {e.action}
                  </div>
                  <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 1 }}>
                    {e.user ? `${e.user} · ` : ''}{e._tsMs ? new Date(e._tsMs).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : timeAgo(e.date)}
                  </div>
                </div>
              </div>
            );
          })
      }
    </div>
  );
}

// ── Avg Cycle Times ───────────────────────────────────────────────────────────

function AvgCycleTimes({ filtered, monoFont }: { filtered: any[]; monoFont: string }) {
  const pheApproved = filtered.filter(p => p.compliance?.phe?.submittedDate && p.compliance?.phe?.approvalDate);
  const nvApproved  = filtered.filter(p => p.compliance?.noiseVariance?.submittedDate && p.compliance?.noiseVariance?.approvalDate);

  const avgPHE = pheApproved.length
    ? Math.round(pheApproved.reduce((s, p) => s + daysBetween(p.compliance.phe.submittedDate, p.compliance.phe.approvalDate), 0) / pheApproved.length * 10) / 10
    : null;
  const avgNV = nvApproved.length
    ? Math.round(nvApproved.reduce((s, p) => s + daysBetween(p.compliance.noiseVariance.submittedDate, p.compliance.noiseVariance.approvalDate), 0) / nvApproved.length * 10) / 10
    : null;

  // CD avg days to concur
  const concurTimes: number[] = [];
  filtered.forEach(p => {
    (p.compliance?.cdConcurrence?.cds ?? []).forEach((c: any) => {
      if (c.status !== 'concurred' || !c.sentDate || !c.concurrenceLetter?.uploadedAt) return;
      const d = Math.floor((new Date(c.concurrenceLetter.uploadedAt).getTime() - new Date(c.sentDate + 'T00:00:00').getTime()) / 86_400_000);
      if (d >= 0 && d <= 180) concurTimes.push(d);
    });
  });
  const avgCD = concurTimes.length
    ? Math.round(concurTimes.reduce((a, b) => a + b, 0) / concurTimes.length * 10) / 10
    : null;

  if (avgPHE === null && avgNV === null && avgCD === null) return null;

  const rows = [
    { label: 'PHE: Submission → Approval', value: avgPHE, color: '#F59E0B' },
    { label: 'NV: Submission → Approval',  value: avgNV,  color: '#8B5CF6' },
    { label: 'CD: Presentation → Concurrence', value: avgCD, color: '#3B82F6' },
  ].filter(r => r.value !== null);

  const maxVal = Math.max(...rows.map(r => r.value as number));

  return (
    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E2E8F0', padding: 20 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 14 }}>Avg Cycle Times (Last 90 Days)</div>
      {rows.map(r => (
        <div key={r.label} style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 11, color: '#475569' }}>{r.label}</span>
            <span style={{ fontFamily: monoFont, fontSize: 12, fontWeight: 700, color: '#0F172A' }}>{r.value}d</span>
          </div>
          <div style={{ height: 4, background: '#F1F5F9', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', background: r.color, borderRadius: 2, width: `${((r.value as number) / maxVal) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── MetricsView ───────────────────────────────────────────────────────────────

function MetricsView({
  filtered, allPlans, globalLogs, metrics, monoFont, TODAY, setSelectedPlan, setView, setFilter,
}: MetricsViewProps) {

  const INACTIVE = new Set(['approved','plan_approved','implemented','tcp_approved_final','closed','cancelled','expired']);
  const activePlans = filtered.filter(p => !INACTIVE.has(p.stage) && !p.isHistorical);
  const atRiskCount = activePlans.filter(p => p.needByDate && Math.ceil((new Date(p.needByDate + 'T00:00:00').getTime() - TODAY.getTime()) / 86_400_000) <= 14).length;

  const pendingCompliance = filtered.filter(p => {
    const phe = p.compliance?.phe;
    const nv  = p.compliance?.noiseVariance;
    return (phe && !['approved','not_started','expired'].includes(phe.status))
        || (nv  && !['approved','linked_existing','not_started'].includes(nv.status));
  });
  const expiringCompliance = pendingCompliance.filter(p =>
    p.needByDate && Math.ceil((new Date(p.needByDate + 'T00:00:00').getTime() - TODAY.getTime()) / 86_400_000) <= 14
  ).length;

  let cdOverdueCount = 0, cdWaitingCount = 0;
  filtered.forEach(p => {
    let hasOverdue = false;
    (p.compliance?.cdConcurrence?.cds ?? []).forEach((c: any) => {
      if (!c.applicable || c.status === 'na' || c.status === 'concurred') return;
      if (!['presentation_sent','meeting_scheduled','follow_up_sent'].includes(c.status)) return;
      const d = daysSince(c.sentDate ?? c.meetingDate);
      if (d !== null && d > 21) hasOverdue = true; else cdWaitingCount++;
    });
    if (hasOverdue) cdOverdueCount++;
  });

  const cutoff30 = daysAgoMs(30);
  const approvedThisMonth = filtered.filter(p => p.approvedDate && new Date(p.approvedDate + 'T00:00:00').getTime() >= cutoff30);
  const concurTimes30: number[] = [];
  filtered.forEach(p => {
    (p.compliance?.cdConcurrence?.cds ?? []).forEach((c: any) => {
      if (c.status !== 'concurred' || !c.sentDate || !c.concurrenceLetter?.uploadedAt) return;
      const lMs = new Date(c.concurrenceLetter.uploadedAt).getTime();
      if (lMs < cutoff30) return;
      const d = Math.floor((lMs - new Date(c.sentDate + 'T00:00:00').getTime()) / 86_400_000);
      if (d >= 0 && d <= 180) concurTimes30.push(d);
    });
  });
  const avgConcurDays = concurTimes30.length ? Math.round(concurTimes30.reduce((a, b) => a + b, 0) / concurTimes30.length) : null;

  return (
    <div id="metrics-view-container">

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#0F172A', letterSpacing: -0.4 }}>Operations Dashboard</div>
          <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
            Live snapshot across all active plans — Van Nuys corridor · Updated now
          </div>
        </div>
      </div>

      {/* ── KPI row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 16 }}>
        <KPICard
          label="Active Plans" value={activePlans.length}
          delta={atRiskCount > 0 ? `↑ ${atRiskCount} at risk (≤14d)` : 'None at risk'}
          deltaType={atRiskCount > 0 ? 'up' : 'neutral'}
          barPct={metrics.total > 0 ? (activePlans.length / metrics.total) * 100 : 0}
          accent="#1D4ED8"
          onClick={() => { setFilter(f => ({ ...f, quickFilter: 'all' })); setView('table'); }}
        />
        <KPICard
          label="Pending PHE / NV" value={pendingCompliance.length}
          delta={expiringCompliance > 0 ? `${expiringCompliance} expiring in 14d` : 'None expiring soon'}
          deltaType={expiringCompliance > 0 ? 'up' : 'neutral'}
          barPct={filtered.length > 0 ? (pendingCompliance.length / filtered.length) * 100 : 0}
          accent="#D97706"
          onClick={() => { setFilter(f => ({ ...f, quickFilter: 'needs_compliance' })); setView('table'); }}
        />
        <KPICard
          label="CD Response Overdue" value={cdOverdueCount}
          delta={cdOverdueCount === 0 ? 'All CDs current' : cdWaitingCount > 0 ? `+${cdWaitingCount} waiting` : 'Action needed'}
          deltaType={cdOverdueCount > 0 ? 'up' : 'neutral'}
          barPct={cdOverdueCount > 0 ? Math.min((cdOverdueCount / Math.max(cdOverdueCount + cdWaitingCount, 1)) * 100, 100) : 0}
          accent="#DC2626"
          onClick={() => { setFilter(f => ({ ...f, quickFilter: 'needs_compliance' })); setView('table'); }}
        />
        <KPICard
          label="Concurred This Month" value={approvedThisMonth.length}
          delta={avgConcurDays !== null ? `↓ avg ${avgConcurDays}d to concur` : approvedThisMonth.length > 0 ? `${approvedThisMonth.length} approved` : 'None yet this month'}
          deltaType={approvedThisMonth.length > 0 ? 'down' : 'neutral'}
          barPct={metrics.total > 0 ? (approvedThisMonth.length / metrics.total) * 100 : 0}
          accent="#059669"
          onClick={() => { setFilter(f => ({ ...f, stage: 'plan_approved' })); setView('table'); }}
        />
      </div>

      {/* ── Plan Type Breakdown ── */}
      <PlanTypeSummary filtered={filtered} setView={setView} setFilter={setFilter} />

      {/* ── Main 2-col layout ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16 }}>

        {/* Left: compliance cards + overdue table */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <ComplianceHealthCards filtered={filtered} setView={setView} />
          <NeedsAttentionTable filtered={filtered} monoFont={monoFont} setSelectedPlan={setSelectedPlan} setView={setView} />
        </div>

        {/* Right sidebar: activity feed + cycle times */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <RecentActivityFeed filtered={filtered} allPlans={allPlans} globalLogs={globalLogs} setSelectedPlan={setSelectedPlan} setView={setView} />
          <AvgCycleTimes filtered={filtered} monoFont={monoFont} />
        </div>

      </div>
    </div>
  );
}

export const MetricsViewMemo = React.memo(MetricsView);
export { MetricsViewMemo as MetricsView };
