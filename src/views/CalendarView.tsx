import React, { useState, useMemo } from 'react';
import { NoiseVariance, Plan } from '../types';

// ── Event type definitions ────────────────────────────────────────────────────

const EV_STYLE = {
  need_by:       { bg: '#FEE2E2', fg: '#991B1B', border: '#EF4444', dot: '#EF4444', label: 'Need By'       },
  phe_submitted: { bg: '#FFF7ED', fg: '#C2410C', border: '#FB923C', dot: '#FB923C', label: 'PHE Submitted' },
  phe_approved:  { bg: '#FEF9C3', fg: '#854D0E', border: '#CA8A04', dot: '#CA8A04', label: 'PHE Approved'  },
  nv_approved:   { bg: '#F3E8FF', fg: '#6B21A8', border: '#9333EA', dot: '#9333EA', label: 'NV Approved'   },
  nv_expiry:     { bg: '#FFE4E6', fg: '#9F1239', border: '#F43F5E', dot: '#F43F5E', label: 'NV Expires'    },
  dn_sent:       { bg: '#DCFCE7', fg: '#166534', border: '#22C55E', dot: '#22C55E', label: 'Letter Sent'   },
} as const;
type EvType = keyof typeof EV_STYLE;

interface CalEvent {
  id: string;
  date: string;
  type: EvType;
  title: string;
  subtitle?: string;
  plan?: Plan;
  variance?: NoiseVariance;
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface CalendarViewProps {
  TODAY: Date;
  filtered: Plan[];
  hoveredPlanId: string | null;
  setHoveredPlanId: (id: string | null) => void;
  setSelectedPlan: (plan: Plan) => void;
  libraryVariances?: NoiseVariance[];
  setView?: (view: string) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export const CalendarView = React.memo<CalendarViewProps>(({
  TODAY,
  filtered,
  hoveredPlanId,
  setHoveredPlanId,
  setSelectedPlan,
  libraryVariances = [],
  setView,
}) => {
  const [viewDate, setViewDate] = useState(() => new Date(TODAY.getFullYear(), TODAY.getMonth(), 1));

  const prevMonth = () => setViewDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  const nextMonth = () => setViewDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1));
  const goToday   = () => setViewDate(new Date(TODAY.getFullYear(), TODAY.getMonth(), 1));

  const viewYear     = viewDate.getFullYear();
  const viewMonth    = viewDate.getMonth();       // 0-based
  const daysInMonth  = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay();
  const isCurrentMonth = viewYear === TODAY.getFullYear() && viewMonth === TODAY.getMonth();

  const todayStr = `${TODAY.getFullYear()}-${String(TODAY.getMonth() + 1).padStart(2, '0')}-${String(TODAY.getDate()).padStart(2, '0')}`;

  // ── Build all events from plans + library ─────────────────────────────────

  const allEvents = useMemo((): CalEvent[] => {
    const events: CalEvent[] = [];

    for (const plan of filtered) {
      const loc = plan.loc || plan.id;

      // Need By deadline
      if (plan.needByDate) {
        events.push({ id: `nb-${plan.id}`, date: plan.needByDate, type: 'need_by', title: loc, subtitle: plan.street1 || '', plan });
      }

      // PHE milestones
      if (plan.compliance?.phe?.submittedDate) {
        events.push({ id: `phe-sub-${plan.id}`, date: plan.compliance.phe.submittedDate, type: 'phe_submitted', title: loc, subtitle: 'PHE submitted to BOE', plan });
      }
      if (plan.compliance?.phe?.approvalDate) {
        events.push({ id: `phe-app-${plan.id}`, date: plan.compliance.phe.approvalDate, type: 'phe_approved', title: loc, subtitle: 'PHE approved', plan });
      }

      // NV milestones
      if (plan.compliance?.noiseVariance?.approvalDate) {
        events.push({ id: `nv-app-${plan.id}`, date: plan.compliance.noiseVariance.approvalDate, type: 'nv_approved', title: loc, subtitle: 'NV approved', plan });
      }

      // Driveway letters sent
      for (const addr of plan.compliance?.drivewayNotices?.addresses ?? []) {
        if (addr.noticeSent && addr.sentDate) {
          events.push({ id: `dn-${plan.id}-${addr.id}`, date: addr.sentDate, type: 'dn_sent', title: loc, subtitle: addr.address, plan });
        }
      }
    }

    // NV expiry events from library
    for (const v of libraryVariances) {
      if (v.validThrough && !v.isArchived) {
        events.push({ id: `nv-exp-${v.id}`, date: v.validThrough, type: 'nv_expiry', title: v.permitNumber || v.title, subtitle: 'Variance expires', variance: v });
      }
    }

    return events;
  }, [filtered, libraryVariances]);

  // Group by date — only this view month
  const eventsByDate = useMemo(() => {
    const map: Record<string, CalEvent[]> = {};
    for (const ev of allEvents) {
      const [y, m] = ev.date.split('-').map(Number);
      if (y === viewYear && m - 1 === viewMonth) {
        map[ev.date] = [...(map[ev.date] ?? []), ev];
      }
    }
    return map;
  }, [allEvents, viewYear, viewMonth]);

  // Sidebar: all events this month sorted by date
  const thisMonthEvents = useMemo(() =>
    allEvents
      .filter(ev => { const [y, m] = ev.date.split('-').map(Number); return y === viewYear && m - 1 === viewMonth; })
      .sort((a, b) => a.date.localeCompare(b.date)),
    [allEvents, viewYear, viewMonth]
  );

  const formatDay = (dateStr: string) =>
    new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  const handleEventClick = (ev: CalEvent) => {
    if (ev.plan) setSelectedPlan(ev.plan);
    else if (ev.variance && setView) setView('variances');
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>

      {/* ── Main Calendar Grid ── */}
      <div style={{ flex: 1, background: '#fff', borderRadius: 12, border: '1px solid #E2E8F0', padding: 20, minWidth: 0 }}>

        {/* Header row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
          {/* Month nav */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              onClick={prevMonth}
              style={{ border: '1px solid #E2E8F0', background: '#F8FAFC', borderRadius: 6, padding: '4px 12px', cursor: 'pointer', fontSize: 16, color: '#475569', lineHeight: 1 }}
            >‹</button>
            <div style={{ textAlign: 'center', minWidth: 160 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#0F172A' }}>
                {viewDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </div>
              {!isCurrentMonth && (
                <button
                  onClick={goToday}
                  style={{ fontSize: 10, color: '#3B82F6', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 600, marginTop: 2 }}
                >← Back to today</button>
              )}
            </div>
            <button
              onClick={nextMonth}
              style={{ border: '1px solid #E2E8F0', background: '#F8FAFC', borderRadius: 6, padding: '4px 12px', cursor: 'pointer', fontSize: 16, color: '#475569', lineHeight: 1 }}
            >›</button>
          </div>

          {/* Legend */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {(Object.keys(EV_STYLE) as EvType[]).map(k => (
              <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 600, color: '#64748B' }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: EV_STYLE[k].dot }} />
                {EV_STYLE[k].label}
              </div>
            ))}
          </div>
        </div>

        {/* 7-column grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1, background: '#E2E8F0', border: '1px solid #E2E8F0', borderRadius: 8, overflow: 'hidden' }}>
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
            <div key={d} style={{ background: '#F8FAFC', padding: '8px', textAlign: 'center', fontSize: 10, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>{d}</div>
          ))}

          {/* Leading padding cells */}
          {Array.from({ length: firstDayOfWeek }).map((_, i) => (
            <div key={`pad-${i}`} style={{ background: '#F8FAFC', minHeight: 90 }} />
          ))}

          {/* Day cells */}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const dayEvents = eventsByDate[dateStr] ?? [];
            const isToday = dateStr === todayStr;
            const isPast  = dateStr < todayStr;
            const MAX_VISIBLE = 3;

            return (
              <div
                key={day}
                style={{ background: '#fff', minHeight: 90, padding: 6, position: 'relative', opacity: isPast ? 0.78 : 1 }}
              >
                {/* Day number */}
                <div style={{
                  fontSize: 11, fontWeight: 700, marginBottom: 3,
                  width: 22, height: 22, borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: isToday ? '#F59E0B' : 'transparent',
                  color: isToday ? '#fff' : isPast ? '#94A3B8' : '#1E293B',
                }}>{day}</div>

                {/* Events */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {dayEvents.slice(0, MAX_VISIBLE).map(ev => {
                    const s = EV_STYLE[ev.type];
                    const isHov = ev.plan ? hoveredPlanId === ev.plan.id : false;
                    const isOtherHov = hoveredPlanId !== null && (!ev.plan || hoveredPlanId !== ev.plan.id);
                    return (
                      <div
                        key={ev.id}
                        onClick={() => handleEventClick(ev)}
                        onMouseEnter={() => ev.plan && setHoveredPlanId(ev.plan.id)}
                        onMouseLeave={() => setHoveredPlanId(null)}
                        title={`${s.label}: ${ev.title}${ev.subtitle ? ' · ' + ev.subtitle : ''}`}
                        style={{
                          fontSize: 9, padding: '2px 4px', borderRadius: 3, cursor: 'pointer',
                          background: s.bg, color: s.fg, borderLeft: `3px solid ${s.border}`,
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                          opacity: isOtherHov ? 0.3 : 1,
                          transform: isHov ? 'scale(1.04)' : 'scale(1)',
                          fontWeight: isHov ? 700 : 500,
                          transition: 'all 0.1s ease',
                        }}
                      >
                        {ev.title}
                      </div>
                    );
                  })}
                  {dayEvents.length > MAX_VISIBLE && (
                    <div style={{ fontSize: 9, color: '#94A3B8', fontWeight: 600, paddingLeft: 4 }}>
                      +{dayEvents.length - MAX_VISIBLE} more
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Sidebar: Month event list ── */}
      <div style={{ width: 220, flexShrink: 0, background: '#fff', borderRadius: 12, border: '1px solid #E2E8F0', padding: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: '#0F172A', marginBottom: 4 }}>
          {viewDate.toLocaleDateString('en-US', { month: 'long' })}
        </div>
        <div style={{ fontSize: 10, color: '#94A3B8', marginBottom: 12 }}>
          {thisMonthEvents.length} event{thisMonthEvents.length !== 1 ? 's' : ''} this month
        </div>

        {thisMonthEvents.length === 0 ? (
          <div style={{ fontSize: 11, color: '#94A3B8', textAlign: 'center', padding: '20px 0' }}>
            No events this month
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 560, overflowY: 'auto' }}>
            {thisMonthEvents.map(ev => {
              const s = EV_STYLE[ev.type];
              const isPast = ev.date < todayStr;
              return (
                <div
                  key={ev.id}
                  onClick={() => handleEventClick(ev)}
                  style={{
                    cursor: 'pointer', borderRadius: 7, border: `1px solid ${s.border}40`,
                    background: s.bg, padding: '7px 9px', opacity: isPast ? 0.7 : 1,
                    transition: 'opacity 0.1s',
                  }}
                >
                  <div style={{ fontSize: 9, fontWeight: 700, color: s.fg, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 2 }}>
                    {formatDay(ev.date)} · {s.label}
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#1E293B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {ev.title}
                  </div>
                  {ev.subtitle && (
                    <div style={{ fontSize: 10, color: '#64748B', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {ev.subtitle}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
});
