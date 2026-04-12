import React, { useState } from 'react';
import type { Plan, User } from '../types';
import { fmtDate } from '../utils/plans';
import { getStagePill } from '../utils/corridor';
import { ALL_STAGES } from '../constants';

interface ReportsViewProps {
  plans: Plan[];
  filtered: Plan[];
  currentUser: User | null;
  monoFont: string;
  setSelectedPlan: (plan: Plan) => void;
  setView: (view: string) => void;
}

// Stages considered active (not complete/terminal)
const COMPLETED_STAGE_SET = new Set([
  'approved', 'plan_approved', 'implemented', 'tcp_approved_final',
  'closed', 'cancelled', 'expired',
]);

const STAGE_LABELS: Record<string, string> = Object.fromEntries(
  ALL_STAGES.map(s => [s.key, s.label])
);

type ReportId = 'status' | 'cd_concurrence' | 'compliance_summary';

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
function StatusReport({ plans, monoFont, setSelectedPlan }: { plans: Plan[]; monoFont: string; setSelectedPlan: (p: Plan) => void }) {
  const now = Date.now();
  const activePlans = plans.filter(p => !COMPLETED_STAGE_SET.has(p.stage));

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
export function ReportsView({ plans, filtered, currentUser, monoFont, setSelectedPlan, setView }: ReportsViewProps) {
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
            <StatusReport plans={filtered} monoFont={monoFont} setSelectedPlan={setSelectedPlan} />
          )}
          {selected === 'cd_concurrence' && (
            <CDConcurrenceReport plans={filtered} monoFont={monoFont} setSelectedPlan={setSelectedPlan} />
          )}
          {selected === 'compliance_summary' && (
            <ComplianceSummaryReport plans={filtered} monoFont={monoFont} setSelectedPlan={setSelectedPlan} />
          )}
        </div>
      </div>
    </div>
  );
}
