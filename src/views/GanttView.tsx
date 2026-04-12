import React, { useState, useMemo } from 'react';
import type { Plan } from '../types';
import { getStagePill } from '../utils/corridor';
import { ALL_STAGES } from '../constants';
import { fmtDate } from '../utils/plans';

interface GanttViewProps {
  plans: Plan[];
  monoFont: string;
  setSelectedPlan: (plan: Plan) => void;
}

// Stages to exclude when "active only" filter is on
const COMPLETED_STAGES_SET = new Set([
  'approved', 'plan_approved', 'implemented', 'tcp_approved_final',
  'closed', 'cancelled', 'expired',
]);

const STAGE_LABELS: Record<string, string> = Object.fromEntries(
  ALL_STAGES.map(s => [s.key, s.label])
);

// Segment color map
const SEGMENT_COLORS: Record<string, { bg: string; accent: string; text: string }> = {
  A1: { bg: '#EFF6FF', accent: '#3B82F6', text: '#1D4ED8' },
  A2: { bg: '#EDE9FE', accent: '#7C3AED', text: '#5B21B6' },
  B1: { bg: '#FFFBEB', accent: '#D97706', text: '#92400E' },
  B2: { bg: '#FFF1F2', accent: '#E11D48', text: '#9F1239' },
  B3: { bg: '#F0FDF4', accent: '#15803D', text: '#14532D' },
  C1: { bg: '#E0F2FE', accent: '#0284C7', text: '#0C4A6E' },
  C2: { bg: '#FFF7ED', accent: '#EA580C', text: '#7C2D12' },
  C3: { bg: '#F8FAFC', accent: '#475569', text: '#1E293B' },
};

function getSegmentMeta(seg: string) {
  return SEGMENT_COLORS[seg] ?? { bg: '#F1F5F9', accent: '#94A3B8', text: '#475569' };
}

// Build ordered month buckets between two dates
function buildMonths(startMs: number, endMs: number): { label: string; year: number; month: number; startMs: number; endMs: number }[] {
  const months: { label: string; year: number; month: number; startMs: number; endMs: number }[] = [];
  const d = new Date(startMs);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  while (d.getTime() <= endMs) {
    const monthStart = d.getTime();
    const year = d.getFullYear();
    const month = d.getMonth();
    d.setMonth(d.getMonth() + 1);
    const monthEnd = d.getTime() - 1;
    months.push({
      label: new Date(monthStart).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
      year,
      month,
      startMs: monthStart,
      endMs: Math.min(monthEnd, endMs),
    });
  }
  return months;
}

const LABEL_W = 180; // px — sticky left label column
const MIN_BAR_W = 4; // minimum bar width in px

export function GanttView({ plans, monoFont, setSelectedPlan }: GanttViewProps) {
  const [activeOnly, setActiveOnly] = useState(true);

  const now = Date.now();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Filtered plans
  const visiblePlans = useMemo(() => {
    if (!activeOnly) return plans;
    return plans.filter(p => !COMPLETED_STAGES_SET.has(p.stage));
  }, [plans, activeOnly]);

  // Compute time range
  const { rangeStart, rangeEnd } = useMemo(() => {
    let earliest = today.getTime() - 30 * 86_400_000;
    let latest = today.getTime() + 90 * 86_400_000;
    for (const p of visiblePlans) {
      const startMs = new Date((p.requestDate || p.dateRequested || p.log?.[0]?.date || today.toISOString()) + 'T00:00:00').getTime();
      if (!isNaN(startMs) && startMs < earliest) earliest = startMs;
      if (p.needByDate) {
        const endMs = new Date(p.needByDate + 'T00:00:00').getTime();
        if (!isNaN(endMs) && endMs > latest) latest = endMs;
      }
    }
    return { rangeStart: earliest, rangeEnd: latest };
  }, [visiblePlans, today]);

  const totalMs = rangeEnd - rangeStart;

  // Months for header
  const months = useMemo(() => buildMonths(rangeStart, rangeEnd), [rangeStart, rangeEnd]);

  // Group plans by segment
  const grouped = useMemo(() => {
    const map = new Map<string, Plan[]>();
    for (const p of visiblePlans) {
      const seg = p.segment || 'Unknown';
      if (!map.has(seg)) map.set(seg, []);
      map.get(seg)!.push(p);
    }
    // Sort segments
    const order = ['A1', 'A2', 'B1', 'B2', 'B3', 'C1', 'C2', 'C3'];
    const sorted: [string, Plan[]][] = [];
    for (const seg of order) {
      if (map.has(seg)) sorted.push([seg, map.get(seg)!]);
    }
    // Any remaining unknown segments
    for (const [seg, ps] of map.entries()) {
      if (!order.includes(seg)) sorted.push([seg, ps]);
    }
    return sorted;
  }, [visiblePlans]);

  // Summary counts
  const overduePlans = visiblePlans.filter(p => {
    if (!p.needByDate) return false;
    const endMs = new Date(p.needByDate + 'T00:00:00').getTime();
    return endMs < now && !COMPLETED_STAGES_SET.has(p.stage);
  });
  const atRiskPlans = visiblePlans.filter(p => {
    if (!p.needByDate) return false;
    const endMs = new Date(p.needByDate + 'T00:00:00').getTime();
    const daysLeft = (endMs - now) / 86_400_000;
    return daysLeft >= 0 && daysLeft <= 14 && !COMPLETED_STAGES_SET.has(p.stage);
  });

  // Pixel position helpers
  const msToPercent = (ms: number) => ((ms - rangeStart) / totalMs) * 100;

  // Today line position
  const todayPct = msToPercent(today.getTime());
  const todayVisible = todayPct >= 0 && todayPct <= 100;

  return (
    <div>
      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#1E293B', marginBottom: 2 }}>Timeline</div>
          <div style={{ fontSize: 12, color: '#94A3B8' }}>Need-by dates across active plans</div>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#64748B', cursor: 'pointer', userSelect: 'none' }}>
          <input
            type="checkbox"
            checked={activeOnly}
            onChange={e => setActiveOnly(e.target.checked)}
            style={{ cursor: 'pointer' }}
          />
          Active only
        </label>
      </div>

      {visiblePlans.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 24px', color: '#94A3B8', fontSize: 13 }}>
          No plans to display.
        </div>
      ) : (
        <div style={{ border: '1px solid #E2E8F0', borderRadius: 12, background: '#FFFFFF', overflow: 'hidden' }}>
          {/* Month header row */}
          <div style={{ display: 'flex', borderBottom: '1px solid #E2E8F0', background: '#F8FAFC' }}>
            {/* Sticky label spacer */}
            <div style={{ width: LABEL_W, flexShrink: 0, borderRight: '1px solid #E2E8F0' }} />
            {/* Month columns */}
            <div style={{ flex: 1, display: 'flex', position: 'relative', overflow: 'hidden' }}>
              {months.map((m, i) => {
                const widthPct = ((m.endMs - m.startMs + 1) / totalMs) * 100;
                return (
                  <div
                    key={i}
                    style={{
                      width: `${widthPct}%`,
                      flexShrink: 0,
                      padding: '6px 8px',
                      fontSize: 10,
                      fontWeight: 700,
                      color: '#64748B',
                      letterSpacing: 0.5,
                      borderRight: i < months.length - 1 ? '1px solid #E2E8F0' : 'none',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {m.label}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Gantt rows */}
          <div style={{ overflowY: 'auto', maxHeight: '65vh' }}>
            {grouped.map(([seg, segPlans]) => {
              const segMeta = getSegmentMeta(seg);
              return (
                <React.Fragment key={seg}>
                  {/* Segment header row */}
                  <div style={{
                    display: 'flex',
                    background: segMeta.bg,
                    borderBottom: '1px solid #E2E8F0',
                    borderTop: '1px solid #E2E8F0',
                  }}>
                    <div style={{
                      width: LABEL_W,
                      flexShrink: 0,
                      padding: '5px 12px',
                      fontSize: 10,
                      fontWeight: 800,
                      color: segMeta.text,
                      letterSpacing: 0.8,
                      textTransform: 'uppercase',
                      borderRight: '1px solid #E2E8F0',
                    }}>
                      Segment {seg}
                    </div>
                    <div style={{ flex: 1, position: 'relative' }}>
                      {/* Today line in segment header */}
                      {todayVisible && (
                        <div style={{
                          position: 'absolute',
                          left: `${todayPct}%`,
                          top: 0,
                          bottom: 0,
                          width: 1,
                          background: '#EF4444',
                          opacity: 0.3,
                          zIndex: 1,
                        }} />
                      )}
                    </div>
                  </div>

                  {/* Plan rows */}
                  {segPlans.map((plan) => {
                    const planStartRaw = plan.requestDate || plan.dateRequested || plan.log?.[0]?.date || '';
                    const planStartMs = planStartRaw
                      ? new Date(planStartRaw.includes('T') ? planStartRaw : planStartRaw + 'T00:00:00').getTime()
                      : rangeStart;
                    const planEndMs = plan.needByDate
                      ? new Date(plan.needByDate + 'T00:00:00').getTime()
                      : planStartMs + 30 * 86_400_000;

                    const barStartPct = Math.max(0, msToPercent(planStartMs));
                    const barEndPct = Math.min(100, msToPercent(planEndMs));
                    const barWidthPct = Math.max(MIN_BAR_W / 10, barEndPct - barStartPct);

                    const isOverdueBar = planEndMs < now && !COMPLETED_STAGES_SET.has(plan.stage);
                    const daysLeft = (planEndMs - now) / 86_400_000;
                    const isAtRiskBar = !COMPLETED_STAGES_SET.has(plan.stage) && daysLeft >= 0 && daysLeft <= 14;

                    const stageStyle = getStagePill(plan.stage);
                    const barBg = isOverdueBar ? '#FEE2E2' : isAtRiskBar ? '#FEF3C7' : stageStyle.bg;
                    const barBorder = isOverdueBar ? '#FCA5A5' : isAtRiskBar ? '#FCD34D' : stageStyle.border;
                    const barText = isOverdueBar ? '#B91C1C' : isAtRiskBar ? '#B45309' : stageStyle.text;

                    return (
                      <div
                        key={plan.id}
                        style={{
                          display: 'flex',
                          borderBottom: '1px solid #F1F5F9',
                          minHeight: 40,
                          alignItems: 'center',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#F8FAFC')}
                        onMouseLeave={e => (e.currentTarget.style.background = '')}
                      >
                        {/* Label column */}
                        <div style={{
                          width: LABEL_W,
                          flexShrink: 0,
                          padding: '6px 12px',
                          borderRight: '1px solid #E2E8F0',
                          alignSelf: 'stretch',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'center',
                          gap: 2,
                        }}>
                          <div style={{
                            fontFamily: monoFont,
                            fontSize: 11,
                            fontWeight: 700,
                            color: '#B45309',
                          }}>
                            {plan.loc || plan.id}
                          </div>
                          <div style={{ fontSize: 10, color: '#94A3B8', lineHeight: 1.3 }}>
                            {plan.street1}{plan.street2 ? ` / ${plan.street2}` : ''}
                          </div>
                        </div>

                        {/* Bar area */}
                        <div style={{ flex: 1, position: 'relative', height: 40, overflow: 'hidden' }}>
                          {/* Today line */}
                          {todayVisible && (
                            <div style={{
                              position: 'absolute',
                              left: `${todayPct}%`,
                              top: 0,
                              bottom: 0,
                              width: 1,
                              background: '#EF4444',
                              zIndex: 2,
                            }}>
                              {/* "Today" label only on first visible row — handled via separate header element */}
                            </div>
                          )}

                          {/* Month grid lines */}
                          {months.slice(1).map((m, i) => {
                            const linePct = msToPercent(m.startMs);
                            if (linePct < 0 || linePct > 100) return null;
                            return (
                              <div
                                key={i}
                                style={{
                                  position: 'absolute',
                                  left: `${linePct}%`,
                                  top: 0,
                                  bottom: 0,
                                  width: 1,
                                  background: '#E2E8F0',
                                  zIndex: 0,
                                }}
                              />
                            );
                          })}

                          {/* Gantt bar */}
                          <div
                            onClick={() => setSelectedPlan(plan)}
                            title={`${plan.loc || plan.id} · ${STAGE_LABELS[plan.stage] ?? plan.stage} · Need by: ${fmtDate(plan.needByDate)}`}
                            style={{
                              position: 'absolute',
                              left: `${barStartPct}%`,
                              width: `${barWidthPct}%`,
                              top: '50%',
                              transform: 'translateY(-50%)',
                              height: 22,
                              background: barBg,
                              border: `1px solid ${barBorder}`,
                              borderRadius: 5,
                              display: 'flex',
                              alignItems: 'center',
                              paddingLeft: 6,
                              paddingRight: 6,
                              fontSize: 10,
                              fontWeight: 600,
                              color: barText,
                              cursor: 'pointer',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              zIndex: 1,
                              boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
                              transition: 'filter 0.1s',
                            }}
                            onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(0.93)')}
                            onMouseLeave={e => (e.currentTarget.style.filter = '')}
                          >
                            {barWidthPct > 5 ? (plan.loc || plan.id) : ''}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </React.Fragment>
              );
            })}

            {/* Today label row at the top of bar area */}
          </div>

          {/* Today line header label */}
          {todayVisible && (
            <div style={{ display: 'flex', borderTop: '1px solid #E2E8F0', background: '#F8FAFC', position: 'relative', height: 20 }}>
              <div style={{ width: LABEL_W, flexShrink: 0, borderRight: '1px solid #E2E8F0' }} />
              <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
                <div style={{
                  position: 'absolute',
                  left: `${todayPct}%`,
                  top: 2,
                  transform: 'translateX(-50%)',
                  fontSize: 9,
                  fontWeight: 700,
                  color: '#EF4444',
                  whiteSpace: 'nowrap',
                }}>
                  Today
                </div>
                <div style={{
                  position: 'absolute',
                  left: `${todayPct}%`,
                  top: 0,
                  bottom: 0,
                  width: 1,
                  background: '#EF4444',
                }} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Summary */}
      <div style={{ display: 'flex', gap: 16, marginTop: 12, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 12, color: '#64748B' }}>
          <span style={{ fontWeight: 700, color: '#1E293B' }}>{visiblePlans.length}</span> plan{visiblePlans.length !== 1 ? 's' : ''} shown
        </div>
        {overduePlans.length > 0 && (
          <div style={{ fontSize: 12, fontWeight: 600, color: '#B91C1C' }}>
            {overduePlans.length} overdue
          </div>
        )}
        {atRiskPlans.length > 0 && (
          <div style={{ fontSize: 12, fontWeight: 600, color: '#B45309' }}>
            {atRiskPlans.length} at-risk
          </div>
        )}
      </div>
    </div>
  );
}
