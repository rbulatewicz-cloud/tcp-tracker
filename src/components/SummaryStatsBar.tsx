import React from 'react';
import { InfoTooltip } from './InfoTooltip';
import { SegmentedMetricBar } from './SegmentedMetricBar';
import { MONO_FONT as monoFont } from '../constants';
import { User, UserRole, FilterState } from '../types';

const CARD_STAGES = [
  { key: 'requested',        label: 'Requested',       color: '#6B7280' },
  { key: 'drafting',         label: 'Drafting',         color: '#3B82F6' },
  { key: 'submitted_to_dot', label: 'Submitted to DOT', color: '#F59E0B' },
  { key: 'plan_approved',    label: 'Plan Approved',    color: '#10B981' },
  { key: 'expired',          label: 'Expired',          color: '#DC2626' },
];

interface SummaryStatsBarProps {
  metrics: any;
  hoveredMetricIndex: number | null;
  setHoveredMetricIndex: (index: number | null) => void;
  currentUser: User | null;
  plans: any[];
  td: string;
  TODAY: Date;
  filter: FilterState;
  setFilter: React.Dispatch<React.SetStateAction<FilterState>>;
}

const SummaryStatsBarComponent: React.FC<SummaryStatsBarProps> = ({
  metrics, currentUser, plans, filter, setFilter,
}) => {
  const canSeeMetrics = currentUser?.role && [UserRole.SFTC, UserRole.MOT, UserRole.ADMIN].includes(currentUser.role);

  const metricStats = [
    { label: 'Total Plans',   value: metrics.total,   color: '#0F172A', tip: 'Total number of plans in the system.' },
    { label: 'At DOT',        value: metrics.atDOT,   color: '#F59E0B', tip: "Plans currently in DOT Review." },
    { label: 'At Risk (14d)', value: metrics.atRisk,  color: metrics.atRisk  > 0 ? '#EF4444' : '#10B981', tip: 'Active plans with need-by date ≤ 14 days.' },
    { label: 'Overdue',       value: metrics.overdue, color: metrics.overdue > 0 ? '#DC2626' : '#10B981', tip: 'Active plans past their need-by date.' },
  ];

  const atDotWaitEl = canSeeMetrics ? (
    <SegmentedMetricBar total={metrics.atDotWaitMetric?.total ?? '—'} breakdown={metrics.atDotWaitMetric?.breakdown ?? []} monoFont={monoFont} />
  ) : null;

  const turnaroundEl = canSeeMetrics ? (
    <SegmentedMetricBar total={metrics.turnaroundMetric?.total ?? '—'} breakdown={metrics.turnaroundMetric?.breakdown ?? []} monoFont={monoFont} />
  ) : null;

  const overallEl = canSeeMetrics ? (
    <SegmentedMetricBar total={metrics.overageMetric?.total ?? '—'} breakdown={metrics.overageMetric?.breakdown ?? []} monoFont={monoFont} />
  ) : null;

  return (
    <div style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)', padding: '12px 28px 0' }}>

      {/* Pipeline */}
      <div style={{ display: 'flex', alignItems: 'stretch', marginBottom: 12 }}>
        {CARD_STAGES.map((s, i) => {
          const count = plans.filter(p => {
            const norm = p.stage === 'submitted' ? 'submitted_to_dot' : p.stage === 'approved' ? 'plan_approved' : p.stage;
            return norm === s.key;
          }).length;
          const active = filter.stage === s.key;

          return (
            <React.Fragment key={s.key}>
              <div
                onClick={() => setFilter(f => ({ ...f, stage: active ? 'all' : s.key }))}
                style={{
                  flex: 1,
                  padding: '10px 8px',
                  cursor: 'pointer',
                  textAlign: 'center',
                  borderRadius: 10,
                  border: `1.5px solid ${active ? s.color : 'var(--border)'}`,
                  background: active ? `${s.color}10` : 'var(--bg-surface-2)',
                  boxShadow: active ? `0 0 0 3px ${s.color}22` : 'none',
                  transition: 'all 0.15s',
                }}
              >
                <div style={{ fontSize: 26, fontWeight: 800, color: s.color, fontFamily: monoFont, lineHeight: 1 }}>{count}</div>
                <div style={{ fontSize: 9, fontWeight: 600, color: '#94A3B8', letterSpacing: 0.4, marginTop: 4, textTransform: 'uppercase' }}>{s.label}</div>
              </div>
              {i < CARD_STAGES.length - 1 && (
                <div style={{ display: 'flex', alignItems: 'center', padding: '0 4px', color: '#CBD5E1', fontSize: 16, flexShrink: 0 }}>›</div>
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Metrics strip */}
      <div style={{ display: 'flex', borderTop: '1px solid var(--border-subtle)', paddingTop: 8, paddingBottom: 10, gap: 0 }}>
        {metricStats.map((s, i) => (
          <div key={i} style={{ flex: 1, textAlign: 'center', borderRight: i < metricStats.length - 1 ? '1px solid var(--border-subtle)' : 'none', padding: '2px 0' }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: s.color, fontFamily: monoFont, lineHeight: 1 }}>
              {typeof s.value === 'number' && isNaN(s.value as number) ? 0 : s.value}
            </div>
            <div style={{ fontSize: 9, fontWeight: 600, color: '#94A3B8', letterSpacing: 0.4, marginTop: 3, textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {s.label}<InfoTooltip formula={s.tip} />
            </div>
          </div>
        ))}
        {canSeeMetrics && atDotWaitEl && (
          <div style={{ flex: 1.5, borderLeft: '1px solid var(--border-subtle)', padding: '2px 12px' }}>
            {atDotWaitEl}
            <div style={{ fontSize: 9, fontWeight: 600, color: '#94A3B8', letterSpacing: 0.4, marginTop: 3, textTransform: 'uppercase', display: 'flex', alignItems: 'center' }}>
              Avg Wait at DOT<InfoTooltip formula="Avg days plans currently at DOT have been waiting since submission, broken out by plan type." />
            </div>
          </div>
        )}
        {canSeeMetrics && turnaroundEl && (
          <div style={{ flex: 1.5, borderLeft: '1px solid var(--border-subtle)', padding: '2px 12px' }}>
            {turnaroundEl}
            <div style={{ fontSize: 9, fontWeight: 600, color: '#94A3B8', letterSpacing: 0.4, marginTop: 3, textTransform: 'uppercase', display: 'flex', alignItems: 'center' }}>
              Avg Turnaround<InfoTooltip formula="Avg days from DOT submission to approval." />
            </div>
          </div>
        )}
        {canSeeMetrics && overallEl && (
          <div style={{ flex: 1.5, borderLeft: '1px solid var(--border-subtle)', padding: '2px 12px' }}>
            {overallEl}
            <div style={{ fontSize: 9, fontWeight: 600, color: '#94A3B8', letterSpacing: 0.4, marginTop: 3, textTransform: 'uppercase', display: 'flex', alignItems: 'center' }}>
              Overall Avg<InfoTooltip formula="Avg days from request date to approval." />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export const SummaryStatsBar = React.memo(SummaryStatsBarComponent);
