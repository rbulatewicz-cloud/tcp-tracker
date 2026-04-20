import React, { useEffect, useState } from 'react';
import type { DrivewayLetter, Plan, User, AppConfig } from '../types';
import { fmtDate } from '../utils/plans';
import { getStagePill } from '../utils/corridor';
import { ALL_STAGES } from '../constants';
import { subscribeToDrivewayLetters } from '../services/drivewayLetterService';
import {
  getPlansOverdueWithDot,
  DOT_LEVEL_COLORS,
  computeDotTurnaroundByMonth,
} from '../utils/dotOverdue';

interface ReportsViewProps {
  plans: Plan[];
  filtered: Plan[];
  currentUser: User | null;
  monoFont: string;
  setSelectedPlan: (plan: Plan) => void;
  setView: (view: string) => void;
  appConfig?: AppConfig;
}

// Stages considered active (not complete/terminal)
const COMPLETED_STAGE_SET = new Set([
  'approved', 'plan_approved', 'implemented', 'tcp_approved_final',
  'closed', 'cancelled', 'expired',
]);

const STAGE_LABELS: Record<string, string> = Object.fromEntries(
  ALL_STAGES.map(s => [s.key, s.label])
);

type ReportId = 'status' | 'cd_concurrence' | 'compliance_summary' | 'monthly_rollup' | 'dot_turnaround';

interface ReportTemplate {
  id: ReportId;
  icon: string;
  name: string;
  description: string;
}

const REPORT_TEMPLATES: ReportTemplate[] = [
  {
    id: 'status',
    icon: '📊',
    name: 'Status Report',
    description: 'Full pipeline snapshot',
  },
  {
    id: 'cd_concurrence',
    icon: '🏙',
    name: 'CD Concurrence Brief',
    description: 'Council District status for all active plans',
  },
  {
    id: 'compliance_summary',
    icon: '🏛',
    name: 'Compliance Summary',
    description: 'PHE, NV, CD, Driveway status',
  },
  {
    id: 'monthly_rollup',
    icon: '📈',
    name: 'Monthly Rollup',
    description: 'DIL activity + CD turnaround by month',
  },
  {
    id: 'dot_turnaround',
    icon: '🕐',
    name: 'DOT Turnaround Trend',
    description: 'Avg DOT review days by month, last 6 months',
  },
];

// ── Helper: CD status colored badge ──────────────────────────────────────────
function CDStatusBadge({ status }: { status: string }) {
  const styles: Record<string, { bg: string; text: string; border: string }> = {
    pending:           { bg: '#F1F5F9', text: '#475569', border: '#CBD5E1' },
    presentation_sent: { bg: '#DBEAFE', text: '#1D4ED8', border: '#93C5FD' },
    meeting_scheduled: { bg: '#EDE9FE', text: '#6D28D9', border: '#C4B5FD' },
    follow_up_sent:    { bg: '#FEF3C7', text: '#B45309', border: '#FCD34D' },
    concurred:         { bg: '#DCFCE7', text: '#15803D', border: '#86EFAC' },
    declined:          { bg: '#FEE2E2', text: '#B91C1C', border: '#FCA5A5' },
    na:                { bg: '#F1F5F9', text: '#CBD5E1', border: '#E2E8F0' },
  };
  const s = styles[status] ?? { bg: '#F1F5F9', text: '#64748B', border: '#E2E8F0' };
  return (
    <span style={{
      fontSize: 10,
      fontWeight: 600,
      color: s.text,
      background: s.bg,
      border: `1px solid ${s.border}`,
      borderRadius: 4,
      padding: '2px 6px',
      whiteSpace: 'nowrap',
    }}>
      {status === 'na' ? 'N/A' : status.replace(/_/g, ' ')}
    </span>
  );
}

// ── Report: Status ────────────────────────────────────────────────────────────
function StatusReport({ plans, monoFont, setSelectedPlan, appConfig }: {
  plans: Plan[];
  monoFont: string;
  setSelectedPlan: (p: Plan) => void;
  appConfig?: AppConfig;
}) {
  const now = Date.now();
  const activePlans = plans.filter(p => !COMPLETED_STAGE_SET.has(p.stage));

  // Overdue-with-DOT rollup — shares the util with the dashboard tile
  // so the two surfaces never disagree on what counts as "overdue."
  const dotOverdueRows = getPlansOverdueWithDot(activePlans, appConfig, { includeWarnings: true, now });

  // Stage counts
  const stageCounts = new Map<string, number>();
  for (const p of activePlans) {
    stageCounts.set(p.stage, (stageCounts.get(p.stage) ?? 0) + 1);
  }

  // Type counts
  const typeCounts = new Map<string, number>();
  for (const p of activePlans) {
    typeCounts.set(p.type, (typeCounts.get(p.type) ?? 0) + 1);
  }

  // At-risk plans
  const atRisk = activePlans.filter(p => {
    if (!p.needByDate) return false;
    const d = (new Date(p.needByDate + 'T00:00:00').getTime() - now) / 86_400_000;
    return d >= 0 && d <= 14;
  }).sort((a, b) => {
    const da = new Date(a.needByDate + 'T00:00:00').getTime();
    const db = new Date(b.needByDate + 'T00:00:00').getTime();
    return da - db;
  });

  // Recent DOT submissions (past 20 days)
  const past20 = new Date(now - 20 * 86_400_000).toISOString().slice(0, 10);
  const recentDOT = plans.filter(p => {
    const submitted = p.submitDate || '';
    return submitted >= past20;
  }).sort((a, b) => (b.submitDate || '').localeCompare(a.submitDate || ''));

  const thStyle: React.CSSProperties = {
    fontSize: 10,
    fontWeight: 700,
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    padding: '6px 10px',
    textAlign: 'left',
    background: '#F8FAFC',
    borderBottom: '1px solid #E2E8F0',
  };
  const tdStyle: React.CSSProperties = {
    fontSize: 12,
    color: '#1E293B',
    padding: '8px 10px',
    borderBottom: '1px solid #F1F5F9',
    verticalAlign: 'top',
  };

  return (
    <div>
      {/* Summary counts */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#1E293B', marginBottom: 10 }}>Pipeline Summary</div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
          <div style={{ padding: '10px 16px', background: '#F1F5F9', borderRadius: 8, textAlign: 'center', minWidth: 90 }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#1E293B' }}>{activePlans.length}</div>
            <div style={{ fontSize: 10, color: '#64748B', fontWeight: 600 }}>Active Plans</div>
          </div>
          {['WATCH', 'Standard', 'Engineered'].map(type => (
            <div key={type} style={{ padding: '10px 16px', background: '#F1F5F9', borderRadius: 8, textAlign: 'center', minWidth: 90 }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#1E293B' }}>{typeCounts.get(type) ?? 0}</div>
              <div style={{ fontSize: 10, color: '#64748B', fontWeight: 600 }}>{type}</div>
            </div>
          ))}
        </div>

        {/* Stage breakdown */}
        <div style={{ fontSize: 12, fontWeight: 600, color: '#64748B', marginBottom: 6 }}>By Stage</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {Array.from(stageCounts.entries()).map(([stage, count]) => {
            const s = getStagePill(stage);
            return (
              <div key={stage} style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                padding: '3px 8px',
                background: s.bg,
                border: `1px solid ${s.border}`,
                borderRadius: 5,
                fontSize: 11,
              }}>
                <span style={{ fontWeight: 700, color: s.text }}>{count}</span>
                <span style={{ color: s.text, fontWeight: 500 }}>{STAGE_LABELS[stage] ?? stage}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Overdue with DOT — same SLA math as the dashboard KPI tile */}
      {dotOverdueRows.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#991B1B', marginBottom: 8 }}>
            🕐 Overdue with DOT ({dotOverdueRows.length})
          </div>
          <div style={{ border: '1px solid #FECACA', borderRadius: 8, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={thStyle}>LOC</th>
                  <th style={thStyle}>Location</th>
                  <th style={thStyle}>Type</th>
                  <th style={thStyle}>Submitted</th>
                  <th style={thStyle}>Days with DOT</th>
                  <th style={thStyle}>SLA</th>
                </tr>
              </thead>
              <tbody>
                {dotOverdueRows.map(({ plan: p, status }) => {
                  const colors = DOT_LEVEL_COLORS[status.level];
                  return (
                    <tr
                      key={p.id}
                      style={{ cursor: 'pointer' }}
                      onClick={() => setSelectedPlan(p)}
                      onMouseEnter={e => (e.currentTarget.style.background = '#FEF2F2')}
                      onMouseLeave={e => (e.currentTarget.style.background = '')}
                    >
                      <td style={{ ...tdStyle, fontFamily: monoFont, color: '#991B1B', fontWeight: 700 }}>
                        {p.loc || p.id}
                      </td>
                      <td style={tdStyle}>{p.street1}{p.street2 ? ` / ${p.street2}` : ''}</td>
                      <td style={tdStyle}>{p.type}</td>
                      <td style={{ ...tdStyle, fontFamily: monoFont, fontSize: 11, color: '#64748B' }}>
                        {status.submittedDate}
                      </td>
                      <td style={tdStyle}>
                        <span style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          borderRadius: 4,
                          fontSize: 11,
                          fontWeight: 700,
                          background: colors.bg,
                          border: `1px solid ${colors.border}`,
                          color: colors.fg,
                          fontFamily: monoFont,
                        }}>
                          {status.daysOpen}d {status.level === 'overdue' ? '· overdue' : '· at risk'}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, fontFamily: monoFont, fontSize: 11, color: '#64748B' }}>
                        warn {status.warningThreshold} / target {status.overdueThreshold}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* At-risk plans table */}
      {atRisk.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#B45309', marginBottom: 8 }}>
            ⚠ At-Risk Plans ({atRisk.length})
          </div>
          <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={thStyle}>LOC</th>
                  <th style={thStyle}>Location</th>
                  <th style={thStyle}>Lead</th>
                  <th style={thStyle}>Days Left</th>
                </tr>
              </thead>
              <tbody>
                {atRisk.map(p => {
                  const daysLeft = Math.ceil((new Date(p.needByDate + 'T00:00:00').getTime() - now) / 86_400_000);
                  return (
                    <tr
                      key={p.id}
                      style={{ cursor: 'pointer' }}
                      onClick={() => setSelectedPlan(p)}
                      onMouseEnter={e => (e.currentTarget.style.background = '#FFFBEB')}
                      onMouseLeave={e => (e.currentTarget.style.background = '')}
                    >
                      <td style={{ ...tdStyle, fontFamily: monoFont, color: '#B45309', fontWeight: 700 }}>
                        {p.loc || p.id}
                      </td>
                      <td style={tdStyle}>{p.street1}{p.street2 ? ` / ${p.street2}` : ''}</td>
                      <td style={tdStyle}>{p.lead || '—'}</td>
                      <td style={{ ...tdStyle, fontWeight: 700, color: daysLeft <= 7 ? '#B91C1C' : '#B45309' }}>
                        {daysLeft}d
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recent DOT submissions */}
      {recentDOT.length > 0 && (
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1E293B', marginBottom: 8 }}>
            Recent DOT Submissions (past 20 days)
          </div>
          <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={thStyle}>LOC</th>
                  <th style={thStyle}>Location</th>
                  <th style={thStyle}>Type</th>
                  <th style={thStyle}>Submitted</th>
                </tr>
              </thead>
              <tbody>
                {recentDOT.map(p => (
                  <tr
                    key={p.id}
                    style={{ cursor: 'pointer' }}
                    onClick={() => setSelectedPlan(p)}
                    onMouseEnter={e => (e.currentTarget.style.background = '#F8FAFC')}
                    onMouseLeave={e => (e.currentTarget.style.background = '')}
                  >
                    <td style={{ ...tdStyle, fontFamily: monoFont, color: '#B45309', fontWeight: 700 }}>
                      {p.loc || p.id}
                    </td>
                    <td style={tdStyle}>{p.street1}{p.street2 ? ` / ${p.street2}` : ''}</td>
                    <td style={tdStyle}>{p.type}</td>
                    <td style={tdStyle}>{fmtDate(p.submitDate ?? null)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Report: CD Concurrence Brief ──────────────────────────────────────────────
function CDConcurrenceReport({ plans, monoFont, setSelectedPlan }: { plans: Plan[]; monoFont: string; setSelectedPlan: (p: Plan) => void }) {
  const now = Date.now();
  const activePlans = plans.filter(p => !COMPLETED_STAGE_SET.has(p.stage));
  const cdPlans = activePlans.filter(p => p.compliance?.cdConcurrence?.cds?.length);

  let totalConcurred = 0;
  let totalWaiting = 0;
  let totalOverdue = 0;

  for (const p of cdPlans) {
    const cds = p.compliance?.cdConcurrence?.cds ?? [];
    for (const cd of cds) {
      if (!cd.applicable || cd.status === 'na') continue;
      if (cd.status === 'concurred') {
        totalConcurred++;
      } else if (cd.status !== 'declined') {
        totalWaiting++;
        if (cd.sentDate) {
          const daysSent = (now - new Date(cd.sentDate + 'T00:00:00').getTime()) / 86_400_000;
          if (daysSent > 21) totalOverdue++;
        }
      }
    }
  }

  const thStyle: React.CSSProperties = {
    fontSize: 10,
    fontWeight: 700,
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    padding: '6px 10px',
    textAlign: 'left',
    background: '#F8FAFC',
    borderBottom: '1px solid #E2E8F0',
  };
  const tdStyle: React.CSSProperties = {
    fontSize: 12,
    color: '#1E293B',
    padding: '8px 10px',
    borderBottom: '1px solid #F1F5F9',
    verticalAlign: 'middle',
  };

  return (
    <div>
      {/* Summary */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ padding: '10px 16px', background: '#DCFCE7', border: '1px solid #86EFAC', borderRadius: 8, textAlign: 'center' }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#15803D' }}>{totalConcurred}</div>
          <div style={{ fontSize: 10, color: '#166534', fontWeight: 600 }}>Concurred</div>
        </div>
        <div style={{ padding: '10px 16px', background: '#DBEAFE', border: '1px solid #93C5FD', borderRadius: 8, textAlign: 'center' }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#1D4ED8' }}>{totalWaiting}</div>
          <div style={{ fontSize: 10, color: '#1E40AF', fontWeight: 600 }}>Waiting</div>
        </div>
        {totalOverdue > 0 && (
          <div style={{ padding: '10px 16px', background: '#FEE2E2', border: '1px solid #FCA5A5', borderRadius: 8, textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#B91C1C' }}>{totalOverdue}</div>
            <div style={{ fontSize: 10, color: '#991B1B', fontWeight: 600 }}>Overdue</div>
          </div>
        )}
      </div>

      {cdPlans.length === 0 ? (
        <div style={{ fontSize: 13, color: '#94A3B8', fontStyle: 'italic' }}>No plans with CD Concurrence tracking.</div>
      ) : (
        <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>LOC</th>
                <th style={thStyle}>Location</th>
                <th style={thStyle}>CD2</th>
                <th style={thStyle}>CD6</th>
                <th style={thStyle}>CD7</th>
                <th style={thStyle}>Days Waiting</th>
                <th style={thStyle}>Letter</th>
              </tr>
            </thead>
            <tbody>
              {cdPlans.map(p => {
                const cds = p.compliance?.cdConcurrence?.cds ?? [];
                const getCDEntry = (cdKey: string) => cds.find(c => c.cd === cdKey);
                const hasConcurrenceLetter = cds.some(c => c.concurrenceLetter);

                // Days waiting = longest days since sentDate among non-concurred applicable CDs
                let maxWait: number | null = null;
                for (const cd of cds) {
                  if (!cd.applicable || cd.status === 'na' || cd.status === 'concurred' || cd.status === 'declined') continue;
                  if (cd.sentDate) {
                    const days = (now - new Date(cd.sentDate + 'T00:00:00').getTime()) / 86_400_000;
                    if (maxWait === null || days > maxWait) maxWait = days;
                  }
                }

                return (
                  <tr
                    key={p.id}
                    style={{ cursor: 'pointer' }}
                    onClick={() => setSelectedPlan(p)}
                    onMouseEnter={e => (e.currentTarget.style.background = '#F8FAFC')}
                    onMouseLeave={e => (e.currentTarget.style.background = '')}
                  >
                    <td style={{ ...tdStyle, fontFamily: monoFont, color: '#B45309', fontWeight: 700 }}>
                      {p.loc || p.id}
                    </td>
                    <td style={tdStyle}>{p.street1}{p.street2 ? ` / ${p.street2}` : ''}</td>
                    {(['CD2', 'CD6', 'CD7'] as const).map(cdKey => {
                      const entry = getCDEntry(cdKey);
                      if (!entry || !entry.applicable) {
                        return <td key={cdKey} style={{ ...tdStyle, color: '#CBD5E1' }}>—</td>;
                      }
                      return (
                        <td key={cdKey} style={tdStyle}>
                          <CDStatusBadge status={entry.status} />
                        </td>
                      );
                    })}
                    <td style={{ ...tdStyle, fontWeight: 700, color: maxWait !== null && maxWait > 21 ? '#B91C1C' : '#1E293B' }}>
                      {maxWait !== null ? `${Math.floor(maxWait)}d` : '—'}
                    </td>
                    <td style={tdStyle}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: hasConcurrenceLetter ? '#15803D' : '#94A3B8' }}>
                        {hasConcurrenceLetter ? '✓' : '✗'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Report: Compliance Summary ────────────────────────────────────────────────
function ComplianceSummaryReport({ plans, monoFont, setSelectedPlan }: { plans: Plan[]; monoFont: string; setSelectedPlan: (p: Plan) => void }) {
  const now = Date.now();
  const activePlans = plans.filter(p => !COMPLETED_STAGE_SET.has(p.stage));

  // Summarize each track
  const phePlans = activePlans.filter(p => p.compliance?.phe);
  const nvPlans = activePlans.filter(p => p.compliance?.noiseVariance);
  const cdPlans = activePlans.filter(p => p.compliance?.cdConcurrence);
  const dwPlans = activePlans.filter(p => p.compliance?.drivewayNotices);

  const statusColor = (status: string): string => {
    if (status === 'approved') return '#15803D';
    if (status === 'submitted') return '#1D4ED8';
    if (status === 'in_progress' || status === 'linked_existing') return '#B45309';
    if (status === 'expired') return '#B91C1C';
    return '#64748B';
  };

  const thStyle: React.CSSProperties = {
    fontSize: 10,
    fontWeight: 700,
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    padding: '6px 10px',
    textAlign: 'left',
    background: '#F8FAFC',
    borderBottom: '1px solid #E2E8F0',
  };
  const tdStyle: React.CSSProperties = {
    fontSize: 12,
    color: '#1E293B',
    padding: '8px 10px',
    borderBottom: '1px solid #F1F5F9',
    verticalAlign: 'middle',
  };

  const TrackSection = ({
    title,
    plansWithTrack,
    getStatus,
    isOverdue,
  }: {
    title: string;
    plansWithTrack: Plan[];
    getStatus: (p: Plan) => string;
    isOverdue?: (p: Plan) => boolean;
  }) => {
    if (plansWithTrack.length === 0) return null;
    const overduePlans = isOverdue ? plansWithTrack.filter(isOverdue) : [];
    return (
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1E293B' }}>{title}</div>
          {overduePlans.length > 0 && (
            <span style={{ fontSize: 10, fontWeight: 700, color: '#B91C1C', background: '#FEE2E2', border: '1px solid #FCA5A5', borderRadius: 4, padding: '2px 6px' }}>
              {overduePlans.length} overdue
            </span>
          )}
        </div>
        <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>LOC</th>
                <th style={thStyle}>Location</th>
                <th style={thStyle}>Status</th>
              </tr>
            </thead>
            <tbody>
              {plansWithTrack.map(p => {
                const status = getStatus(p);
                const overdueFlag = isOverdue ? isOverdue(p) : false;
                return (
                  <tr
                    key={p.id}
                    style={{ cursor: 'pointer', background: overdueFlag ? '#FFF5F5' : '' }}
                    onClick={() => setSelectedPlan(p)}
                    onMouseEnter={e => (e.currentTarget.style.background = overdueFlag ? '#FEE2E2' : '#F8FAFC')}
                    onMouseLeave={e => (e.currentTarget.style.background = overdueFlag ? '#FFF5F5' : '')}
                  >
                    <td style={{ ...tdStyle, fontFamily: monoFont, color: '#B45309', fontWeight: 700 }}>
                      {p.loc || p.id}
                    </td>
                    <td style={tdStyle}>{p.street1}{p.street2 ? ` / ${p.street2}` : ''}</td>
                    <td style={tdStyle}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: statusColor(status) }}>
                        {status.replace(/_/g, ' ')}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div>
      <TrackSection
        title="PHE — Peak Hour Exemption"
        plansWithTrack={phePlans}
        getStatus={p => p.compliance?.phe?.status ?? 'not_started'}
        isOverdue={p => p.compliance?.phe?.status === 'in_progress' && !!(p.needByDate && (new Date(p.needByDate + 'T00:00:00').getTime() < now))}
      />
      <TrackSection
        title="NV — Noise Variance"
        plansWithTrack={nvPlans}
        getStatus={p => p.compliance?.noiseVariance?.status ?? 'not_started'}
      />
      <TrackSection
        title="CD Concurrence"
        plansWithTrack={cdPlans}
        getStatus={p => p.compliance?.cdConcurrence?.status ?? 'not_started'}
        isOverdue={p => {
          const cds = p.compliance?.cdConcurrence?.cds ?? [];
          return cds.some(cd => {
            if (!cd.applicable || cd.status === 'concurred' || cd.status === 'declined' || cd.status === 'na') return false;
            if (!cd.sentDate) return false;
            return (now - new Date(cd.sentDate + 'T00:00:00').getTime()) / 86_400_000 > 21;
          });
        }}
      />
      <TrackSection
        title="Driveway Notices"
        plansWithTrack={dwPlans}
        getStatus={p => p.compliance?.drivewayNotices?.status ?? 'not_started'}
      />
      {phePlans.length === 0 && nvPlans.length === 0 && cdPlans.length === 0 && dwPlans.length === 0 && (
        <div style={{ fontSize: 13, color: '#94A3B8', fontStyle: 'italic' }}>No active compliance tracks.</div>
      )}
    </div>
  );
}

// ── Report: Monthly Rollup ────────────────────────────────────────────────────
// DIL activity + CD concurrence turnaround, bucketed by month. Useful for the
// CR PM's monthly check-ins ("how many letters went out in March?").
function MonthlyRollupReport({ plans, monoFont }: { plans: Plan[]; monoFont: string }) {
  const [letters, setLetters] = useState<DrivewayLetter[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = subscribeToDrivewayLetters(ls => { setLetters(ls); setLoading(false); });
    return () => unsub();
  }, []);

  // Build last N months (newest first), label "Apr 2026"
  const MONTHS_BACK = 6;
  const monthKeys: string[] = [];
  const monthLabels: Record<string, string> = {};
  {
    const today = new Date();
    for (let i = 0; i < MONTHS_BACK; i++) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthKeys.push(key);
      monthLabels[key] = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    }
  }
  const monthKeyOf = (iso?: string): string | null => {
    if (!iso) return null;
    const d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  };

  // DIL counts — bucket each letter by the month its event happened
  type DilRow = { drafted: number; submitted: number; approved: number; sent: number };
  const dilByMonth = new Map<string, DilRow>();
  for (const k of monthKeys) dilByMonth.set(k, { drafted: 0, submitted: 0, approved: 0, sent: 0 });

  for (const l of letters) {
    const ckey = monthKeyOf(l.createdAt);
    if (ckey && dilByMonth.has(ckey)) dilByMonth.get(ckey)!.drafted++;
    const skey = monthKeyOf(l.metroSubmittedAt);
    if (skey && dilByMonth.has(skey)) dilByMonth.get(skey)!.submitted++;
    const akey = monthKeyOf(l.metroApprovedAt);
    if (akey && dilByMonth.has(akey)) dilByMonth.get(akey)!.approved++;
    const sentKey = monthKeyOf(l.sentAt);
    if (sentKey && dilByMonth.has(sentKey)) dilByMonth.get(sentKey)!.sent++;
  }

  // CD concurrence turnaround — sentDate → concurrenceLetter.uploadedAt.
  // Bucket by month of concurrence.
  type CdRow = { count: number; totalDays: number; avgDays: number | null };
  const cdByMonth = new Map<string, CdRow>();
  for (const k of monthKeys) cdByMonth.set(k, { count: 0, totalDays: 0, avgDays: null });

  for (const p of plans) {
    const cds = p.compliance?.cdConcurrence?.cds ?? [];
    for (const cd of cds) {
      if (cd.status !== 'concurred') continue;
      const sent = cd.sentDate;
      const concurredAt = cd.concurrenceLetter?.uploadedAt;
      if (!sent || !concurredAt) continue;
      const key = monthKeyOf(concurredAt);
      if (!key || !cdByMonth.has(key)) continue;
      const sentMs = new Date(sent + 'T00:00:00').getTime();
      const concurredMs = new Date(concurredAt).getTime();
      if (isNaN(sentMs) || isNaN(concurredMs) || concurredMs < sentMs) continue;
      const days = (concurredMs - sentMs) / 86_400_000;
      const row = cdByMonth.get(key)!;
      row.count++;
      row.totalDays += days;
    }
  }
  for (const row of cdByMonth.values()) {
    if (row.count > 0) row.avgDays = row.totalDays / row.count;
  }

  // Totals across the window
  const totals: DilRow = { drafted: 0, submitted: 0, approved: 0, sent: 0 };
  for (const row of dilByMonth.values()) {
    totals.drafted += row.drafted;
    totals.submitted += row.submitted;
    totals.approved += row.approved;
    totals.sent += row.sent;
  }
  let cdTotalCount = 0, cdTotalDays = 0;
  for (const row of cdByMonth.values()) { cdTotalCount += row.count; cdTotalDays += row.totalDays; }
  const cdAvgOverall = cdTotalCount > 0 ? cdTotalDays / cdTotalCount : null;

  const thStyle: React.CSSProperties = {
    fontSize: 10,
    fontWeight: 700,
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    padding: '6px 10px',
    textAlign: 'left',
    background: '#F8FAFC',
    borderBottom: '1px solid #E2E8F0',
  };
  const tdStyle: React.CSSProperties = {
    fontSize: 12,
    color: '#1E293B',
    padding: '8px 10px',
    borderBottom: '1px solid #F1F5F9',
    verticalAlign: 'middle',
  };
  const numTd: React.CSSProperties = { ...tdStyle, textAlign: 'right', fontFamily: monoFont };

  if (loading) {
    return <div style={{ fontSize: 13, color: '#94A3B8', fontStyle: 'italic' }}>Loading letter data…</div>;
  }

  return (
    <div>
      {/* Summary cards */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ padding: '10px 16px', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 8, textAlign: 'center', minWidth: 110 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#1D4ED8' }}>{totals.drafted}</div>
          <div style={{ fontSize: 10, color: '#1E40AF', fontWeight: 600 }}>Drafted · {MONTHS_BACK}mo</div>
        </div>
        <div style={{ padding: '10px 16px', background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: 8, textAlign: 'center', minWidth: 110 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#B45309' }}>{totals.submitted}</div>
          <div style={{ fontSize: 10, color: '#92400E', fontWeight: 600 }}>Submitted</div>
        </div>
        <div style={{ padding: '10px 16px', background: '#DCFCE7', border: '1px solid #86EFAC', borderRadius: 8, textAlign: 'center', minWidth: 110 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#15803D' }}>{totals.approved}</div>
          <div style={{ fontSize: 10, color: '#166534', fontWeight: 600 }}>Metro Approved</div>
        </div>
        <div style={{ padding: '10px 16px', background: '#EDE9FE', border: '1px solid #C4B5FD', borderRadius: 8, textAlign: 'center', minWidth: 110 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#6D28D9' }}>{totals.sent}</div>
          <div style={{ fontSize: 10, color: '#5B21B6', fontWeight: 600 }}>Sent</div>
        </div>
        <div style={{ padding: '10px 16px', background: '#F1F5F9', border: '1px solid #CBD5E1', borderRadius: 8, textAlign: 'center', minWidth: 150 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#1E293B' }}>
            {cdAvgOverall !== null ? `${cdAvgOverall.toFixed(1)}d` : '—'}
          </div>
          <div style={{ fontSize: 10, color: '#475569', fontWeight: 600 }}>
            CD turnaround avg {cdTotalCount > 0 ? `(n=${cdTotalCount})` : ''}
          </div>
        </div>
      </div>

      {/* DIL activity by month */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#1E293B', marginBottom: 8 }}>
          Driveway Impact Letters — by month
        </div>
        <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>Month</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Drafted</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Submitted to Metro</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Metro Approved</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Sent</th>
              </tr>
            </thead>
            <tbody>
              {monthKeys.map(k => {
                const row = dilByMonth.get(k)!;
                return (
                  <tr key={k}>
                    <td style={{ ...tdStyle, fontWeight: 700 }}>{monthLabels[k]}</td>
                    <td style={numTd}>{row.drafted || '—'}</td>
                    <td style={numTd}>{row.submitted || '—'}</td>
                    <td style={numTd}>{row.approved || '—'}</td>
                    <td style={numTd}>{row.sent || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 6, fontStyle: 'italic' }}>
          Each column counts letters whose respective event occurred in that month.
        </div>
      </div>

      {/* CD concurrence turnaround by month */}
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#1E293B', marginBottom: 8 }}>
          CD Concurrence — turnaround by month
        </div>
        <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>Month Concurred</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Concurrences</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Avg Days (sent → concurred)</th>
              </tr>
            </thead>
            <tbody>
              {monthKeys.map(k => {
                const row = cdByMonth.get(k)!;
                return (
                  <tr key={k}>
                    <td style={{ ...tdStyle, fontWeight: 700 }}>{monthLabels[k]}</td>
                    <td style={numTd}>{row.count || '—'}</td>
                    <td style={{ ...numTd, fontWeight: 700, color: row.avgDays !== null && row.avgDays > 21 ? '#B91C1C' : '#1E293B' }}>
                      {row.avgDays !== null ? `${row.avgDays.toFixed(1)}d` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 6, fontStyle: 'italic' }}>
          Based on CD entries with both a sent date and a signed concurrence letter upload date.
        </div>
      </div>
    </div>
  );
}

// ── Report: DOT Turnaround Trend ─────────────────────────────────────────────
// Uses completed review cycles (submitted + commentsReceived) bucketed by the
// month DOT returned comments. Shows overall trend plus a per-plan-type
// breakdown so leads can see whether WATCH, Standard, or Engineered cycles are
// driving turnaround — data source is shared with the dashboard and status
// report.
function DotTurnaroundReport({ plans, monoFont }: {
  plans: Plan[];
  monoFont: string;
}) {
  const buckets = React.useMemo(() => computeDotTurnaroundByMonth(plans, 6), [plans]);

  // All plan types that appeared across any bucket, sorted alphabetically
  const allTypes = React.useMemo(() => {
    const s = new Set<string>();
    buckets.forEach(b => Object.keys(b.byType).forEach(t => s.add(t)));
    return Array.from(s).sort();
  }, [buckets]);

  const totalCount = buckets.reduce((sum, b) => sum + b.count, 0);
  const overallAvg = totalCount
    ? Math.round(
        buckets.reduce((sum, b) => sum + (b.avgDays ?? 0) * b.count, 0) / totalCount,
      )
    : null;

  // Simple bar color scale — green/amber/red by average days
  const barColor = (avg: number | null): string => {
    if (avg == null) return '#E2E8F0';
    if (avg <= 14) return '#10B981';  // on-track
    if (avg <= 30) return '#F59E0B';  // warning
    return '#DC2626';                  // overdue
  };

  // Max avg across all buckets drives the bar scale (floor of 40 for readability)
  const maxAvg = Math.max(40, ...buckets.map(b => b.avgDays ?? 0));

  const thStyle: React.CSSProperties = {
    fontSize: 10,
    fontWeight: 700,
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    padding: '6px 10px',
    textAlign: 'left',
    background: '#F8FAFC',
    borderBottom: '1px solid #E2E8F0',
  };
  const tdStyle: React.CSSProperties = {
    fontSize: 12,
    color: '#1E293B',
    padding: '8px 10px',
    borderBottom: '1px solid #F1F5F9',
    verticalAlign: 'middle',
  };

  if (totalCount === 0) {
    return (
      <div style={{ fontSize: 13, color: '#94A3B8', fontStyle: 'italic', padding: 24, textAlign: 'center' }}>
        No completed DOT review cycles in the last 6 months.
      </div>
    );
  }

  return (
    <div>
      {/* Summary header */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 160, padding: 14, background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
            Rolling 6-month avg
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: barColor(overallAvg), fontFamily: monoFont }}>
            {overallAvg ?? '—'}
            <span style={{ fontSize: 13, color: '#94A3B8', fontWeight: 600, marginLeft: 4 }}>days</span>
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 160, padding: 14, background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
            Completed cycles
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#1E293B', fontFamily: monoFont }}>
            {totalCount}
          </div>
        </div>
      </div>

      {/* Monthly bar chart */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#1E293B', marginBottom: 12 }}>
          Average Turnaround by Month
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, height: 180, padding: '0 4px', borderBottom: '1px solid #E2E8F0' }}>
          {buckets.map(b => {
            const heightPct = b.avgDays != null ? (b.avgDays / maxAvg) * 100 : 0;
            return (
              <div key={b.monthKey} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#1E293B', fontFamily: monoFont }}>
                  {b.avgDays != null ? `${b.avgDays}d` : '—'}
                </div>
                <div style={{
                  width: '100%',
                  height: `${heightPct}%`,
                  minHeight: b.avgDays != null ? 2 : 0,
                  background: barColor(b.avgDays),
                  borderRadius: '4px 4px 0 0',
                  transition: 'height 0.2s',
                }} title={`${b.monthLabel}: ${b.count} cycle${b.count === 1 ? '' : 's'}, avg ${b.avgDays ?? '—'}d`} />
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 12, padding: '8px 4px 0' }}>
          {buckets.map(b => (
            <div key={b.monthKey} style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#64748B' }}>{b.monthLabel}</div>
              <div style={{ fontSize: 9, color: '#94A3B8' }}>n={b.count}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 20, fontSize: 10, color: '#64748B' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 10, height: 10, background: '#10B981', borderRadius: 2 }} /> ≤14d on-track
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 10, height: 10, background: '#F59E0B', borderRadius: 2 }} /> 15–30d warning
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 10, height: 10, background: '#DC2626', borderRadius: 2 }} /> &gt;30d overdue
        </span>
      </div>

      {/* Per-plan-type breakdown */}
      {allTypes.length > 0 && (
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1E293B', marginBottom: 8 }}>
            Breakdown by Plan Type
          </div>
          <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={thStyle}>Plan Type</th>
                  {buckets.map(b => (
                    <th key={b.monthKey} style={{ ...thStyle, textAlign: 'center' }}>{b.monthLabel}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allTypes.map(type => (
                  <tr key={type}>
                    <td style={{ ...tdStyle, fontWeight: 700 }}>{type}</td>
                    {buckets.map(b => {
                      const cell = b.byType[type];
                      if (!cell || cell.count === 0) {
                        return <td key={b.monthKey} style={{ ...tdStyle, textAlign: 'center', color: '#CBD5E1' }}>—</td>;
                      }
                      return (
                        <td key={b.monthKey} style={{ ...tdStyle, textAlign: 'center', fontFamily: monoFont }}>
                          <span style={{ fontWeight: 700, color: barColor(cell.avgDays) }}>{cell.avgDays}d</span>
                          <span style={{ fontSize: 9, color: '#94A3B8', marginLeft: 4 }}>(n={cell.count})</span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Print helper: open report in a new tab ────────────────────────────────────
function buildPrintHTML(reportName: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>${reportName} — TCP Tracker</title>
<style>
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1E293B; margin: 0; padding: 32px; }
  h1 { font-size: 20px; font-weight: 800; margin: 0 0 4px; }
  .subtitle { font-size: 12px; color: #64748B; margin-bottom: 24px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
  th { font-size: 10px; font-weight: 700; color: #64748B; text-transform: uppercase; letter-spacing: 0.5px; padding: 6px 10px; text-align: left; background: #F8FAFC; border-bottom: 1px solid #E2E8F0; }
  td { font-size: 12px; padding: 8px 10px; border-bottom: 1px solid #F1F5F9; vertical-align: middle; }
  .badge { display: inline-block; font-size: 10px; font-weight: 600; border-radius: 4px; padding: 2px 6px; border: 1px solid #E2E8F0; }
  .section-title { font-size: 14px; font-weight: 700; margin: 20px 0 8px; }
  @media print { body { padding: 16px; } }
</style>
</head>
<body>
<div style="border-bottom:2px solid #E2E8F0;padding-bottom:16px;margin-bottom:24px">
  <h1>${reportName}</h1>
  <div class="subtitle">Generated ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })} — TCP Tracker</div>
</div>
${bodyHtml}
</body>
</html>`;
}

// ── Main ReportsView ──────────────────────────────────────────────────────────
export function ReportsView({ plans, filtered, currentUser, monoFont, setSelectedPlan, setView, appConfig }: ReportsViewProps) {
  const [selected, setSelected] = useState<ReportId>('status');

  const selectedTemplate = REPORT_TEMPLATES.find(t => t.id === selected)!;

  const handlePrintPreview = () => {
    // Gather the rendered content from the preview div
    const previewEl = document.getElementById('report-preview-content');
    if (!previewEl) return;
    const bodyHtml = previewEl.innerHTML;
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(buildPrintHTML(selectedTemplate.name, bodyHtml));
    win.document.close();
    win.focus();
  };

  return (
    <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
      {/* Left: template picker */}
      <div style={{ width: 260, flexShrink: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#64748B', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 10 }}>
          Report Templates
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {REPORT_TEMPLATES.map(t => {
            const isActive = selected === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setSelected(t.id)}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                  padding: '12px 14px',
                  background: isActive ? '#EFF6FF' : '#FFFFFF',
                  border: isActive ? '2px solid #3B82F6' : '1px solid #E2E8F0',
                  borderRadius: 10,
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'border-color 0.15s, background 0.15s',
                }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = '#F8FAFC'; }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = '#FFFFFF'; }}
              >
                <span style={{ fontSize: 20, lineHeight: 1, flexShrink: 0, marginTop: 1 }}>{t.icon}</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: isActive ? '#1D4ED8' : '#1E293B', marginBottom: 2 }}>
                    {t.name}
                  </div>
                  <div style={{ fontSize: 11, color: '#64748B', lineHeight: 1.3 }}>
                    {t.description}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Right: live preview */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Preview header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#1E293B' }}>
              {selectedTemplate.icon} {selectedTemplate.name}
            </div>
            <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>
              {selectedTemplate.description} · Generated {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </div>
          </div>
          <button
            onClick={handlePrintPreview}
            style={{
              padding: '8px 16px',
              background: '#1E293B',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
            onMouseEnter={e => (e.currentTarget.style.background = '#0F172A')}
            onMouseLeave={e => (e.currentTarget.style.background = '#1E293B')}
          >
            Print Preview ↗
          </button>
        </div>

        {/* Report content */}
        <div
          id="report-preview-content"
          style={{
            background: '#FFFFFF',
            border: '1px solid #E2E8F0',
            borderRadius: 12,
            padding: 24,
          }}
        >
          {selected === 'status' && (
            <StatusReport plans={filtered} monoFont={monoFont} setSelectedPlan={setSelectedPlan} appConfig={appConfig} />
          )}
          {selected === 'cd_concurrence' && (
            <CDConcurrenceReport plans={filtered} monoFont={monoFont} setSelectedPlan={setSelectedPlan} />
          )}
          {selected === 'compliance_summary' && (
            <ComplianceSummaryReport plans={filtered} monoFont={monoFont} setSelectedPlan={setSelectedPlan} />
          )}
          {selected === 'monthly_rollup' && (
            <MonthlyRollupReport plans={filtered} monoFont={monoFont} />
          )}
          {selected === 'dot_turnaround' && (
            <DotTurnaroundReport plans={filtered} monoFont={monoFont} />
          )}
        </div>
      </div>
    </div>
  );
}
