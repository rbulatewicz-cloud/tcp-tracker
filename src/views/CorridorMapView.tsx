import React from 'react';
import { Train, Info } from 'lucide-react';
import type { Plan } from '../types';
import {
  CORRIDOR_STREETS,
  SEGMENT_META,
  getStreetIndex,
  getStagePill,
} from '../utils/corridor';
import { ALL_STAGES } from '../constants';

// ── Layout constants ──────────────────────────────────────────────────────────
const SLOT_W    = 68;   // px per cross-street slot
const PILL_H    = 24;   // pill height px
const PILL_GAP  = 3;    // vertical gap between stacked pills
const LANE_PAD  = 6;    // top/bottom padding inside each lane

const TOTAL_W   = CORRIDOR_STREETS.length * SLOT_W;

// ── Stage label map ───────────────────────────────────────────────────────────
const STAGE_LABELS: Record<string, string> = Object.fromEntries(
  ALL_STAGES.map(s => [s.key, s.label])
);

// ── Pill data + row assignment ────────────────────────────────────────────────
interface PillData {
  plan: Plan;
  leftIdx: number;
  rightIdx: number;
  row: number;
}

function buildPills(plans: Plan[], lane: 'nb' | 'sb'): PillData[] {
  const relevant = plans.filter(p => {
    if (p.stage === 'closed' || p.stage === 'cancelled') return false;
    const hasNB = p.dir_nb;
    const hasSB = p.dir_sb;
    // Include in lane if: explicitly flagged, or no direction set at all (show both)
    if (lane === 'nb') return hasNB || (!hasNB && !hasSB);
    if (lane === 'sb') return hasSB || (!hasNB && !hasSB);
    return false;
  });

  // Map to corridor positions
  const positioned = relevant
    .map(p => {
      const i1 = getStreetIndex(p.street1);
      const i2 = getStreetIndex(p.street2);
      // At least one street must be locatable
      if (i1 < 0 && i2 < 0) return null;
      const leftIdx  = i1 >= 0 && i2 >= 0 ? Math.min(i1, i2) : (i1 >= 0 ? i1 : i2);
      const rightIdx = i1 >= 0 && i2 >= 0 ? Math.max(i1, i2) : (i1 >= 0 ? i1 : i2);
      return { plan: p, leftIdx, rightIdx };
    })
    .filter(Boolean) as Omit<PillData, 'row'>[];

  // Sort by left position, then width descending (wider pills get earlier rows)
  positioned.sort((a, b) => a.leftIdx - b.leftIdx || (b.rightIdx - b.leftIdx) - (a.rightIdx - a.leftIdx));

  // Greedy row assignment — each row tracks the rightIdx of its last occupant
  const rowEnds: number[] = [];
  return positioned.map(p => {
    let row = rowEnds.findIndex(end => end < p.leftIdx);
    if (row === -1) row = rowEnds.length;
    rowEnds[row] = p.rightIdx;
    return { ...p, row };
  });
}

// ── Segment zone spans ────────────────────────────────────────────────────────
function segmentSpans() {
  const spans: { seg: string; start: number; end: number }[] = [];
  let cur = CORRIDOR_STREETS[0].segment;
  let start = 0;
  for (let i = 1; i <= CORRIDOR_STREETS.length; i++) {
    const seg = CORRIDOR_STREETS[i]?.segment;
    if (seg !== cur) {
      spans.push({ seg: cur, start, end: i - 1 });
      cur = seg;
      start = i;
    }
  }
  return spans;
}
const SEGMENT_SPANS = segmentSpans();

// ── Pill component ────────────────────────────────────────────────────────────
function Pill({
  pill,
  onClick,
}: {
  pill: PillData;
  onClick: (plan: Plan) => void;
}) {
  const { plan, leftIdx, rightIdx, row } = pill;
  const style = getStagePill(plan.stage);
  const left   = leftIdx  * SLOT_W + 2;
  const width  = Math.max((rightIdx - leftIdx + 1) * SLOT_W - 4, SLOT_W * 0.8);
  const top    = LANE_PAD + row * (PILL_H + PILL_GAP);

  const label  = plan.loc || plan.id;
  const stageLabel = STAGE_LABELS[plan.stage] ?? plan.stage;

  return (
    <div
      title={`${label} · ${plan.type} · ${plan.street1}${plan.street2 ? ` → ${plan.street2}` : ''} · ${stageLabel}`}
      onClick={() => onClick(plan)}
      style={{
        position: 'absolute',
        left,
        width,
        top,
        height: PILL_H,
        backgroundColor: style.bg,
        color: style.text,
        border: `1px solid ${style.border}`,
        borderRadius: 5,
        display: 'flex',
        alignItems: 'center',
        paddingLeft: 6,
        paddingRight: 6,
        fontSize: 10,
        fontWeight: 600,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
        zIndex: 1,
        transition: 'filter 0.1s',
      }}
      onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(0.94)')}
      onMouseLeave={e => (e.currentTarget.style.filter = '')}
    >
      {label}
    </div>
  );
}

// ── Lane component ────────────────────────────────────────────────────────────
function Lane({
  pills,
  label,
  arrowDir,
  onPillClick,
}: {
  pills: PillData[];
  label: string;
  arrowDir: '↑' | '↓';
  onPillClick: (plan: Plan) => void;
}) {
  const maxRow = pills.length ? Math.max(...pills.map(p => p.row)) : 0;
  const height = LANE_PAD * 2 + (maxRow + 1) * (PILL_H + PILL_GAP) - PILL_GAP;

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', minHeight: height + 8 }}>
      {/* Lane label */}
      <div
        style={{
          width: 36,
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          paddingTop: LANE_PAD,
          gap: 2,
        }}
      >
        <span style={{ fontSize: 9, fontWeight: 700, color: '#94A3B8', letterSpacing: 1 }}>{arrowDir}</span>
        <span style={{ fontSize: 9, fontWeight: 700, color: '#94A3B8', letterSpacing: 0.5, writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>{label}</span>
      </div>

      {/* Pills area */}
      <div style={{ flex: 1, position: 'relative', height, minWidth: TOTAL_W }}>
        {pills.map((pill, i) => (
          <Pill key={`${pill.plan.id}-${i}`} pill={pill} onClick={onPillClick} />
        ))}
        {pills.length === 0 && (
          <div style={{ position: 'absolute', top: LANE_PAD, left: 8, fontSize: 10, color: '#CBD5E1', fontStyle: 'italic' }}>
            No plans
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main view ─────────────────────────────────────────────────────────────────
interface CorridorMapViewProps {
  plans: Plan[];
  setSelectedPlan: (plan: Plan) => void;
}

export default function CorridorMapView({ plans, setSelectedPlan }: CorridorMapViewProps) {
  const [hideClosed, setHideClosed] = React.useState(true);

  const visiblePlans = React.useMemo(
    () => hideClosed ? plans.filter(p => p.stage !== 'closed' && p.stage !== 'plan_approved' && p.stage !== 'approved') : plans,
    [plans, hideClosed]
  );

  const nbPills = React.useMemo(() => buildPills(visiblePlans, 'nb'), [visiblePlans]);
  const sbPills = React.useMemo(() => buildPills(visiblePlans, 'sb'), [visiblePlans]);

  const unmapped = React.useMemo(() => {
    return visiblePlans.filter(p => {
      const i1 = getStreetIndex(p.street1);
      const i2 = getStreetIndex(p.street2);
      return i1 < 0 && i2 < 0;
    });
  }, [visiblePlans]);

  return (
    <div>
      {/* Header bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#1E293B' }}>ESFV Corridor — Van Nuys Blvd</span>
          <span style={{ fontSize: 11, color: '#94A3B8', marginLeft: 8 }}>
            {nbPills.length + sbPills.length} plan{(nbPills.length + sbPills.length) !== 1 ? 's' : ''} mapped
          </span>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#64748B', cursor: 'pointer', userSelect: 'none' }}>
          <input
            type="checkbox"
            checked={hideClosed}
            onChange={e => setHideClosed(e.target.checked)}
            style={{ cursor: 'pointer' }}
          />
          Hide approved / closed
        </label>
      </div>

      {/* Scrollable corridor strip */}
      <div
        style={{
          overflowX: 'auto',
          overflowY: 'visible',
          border: '1px solid #E2E8F0',
          borderRadius: 12,
          background: '#FFFFFF',
          paddingBottom: 8,
        }}
      >
        <div style={{ minWidth: TOTAL_W + 36, paddingLeft: 36 }}>

          {/* ── Segment zone bands ───────────────────────────────────────── */}
          <div style={{ display: 'flex', height: 28, borderBottom: '1px solid #E2E8F0' }}>
            {SEGMENT_SPANS.map(({ seg, start, end }) => {
              const meta = SEGMENT_META[seg];
              const width = (end - start + 1) * SLOT_W;
              return (
                <div
                  key={seg}
                  style={{
                    width,
                    flexShrink: 0,
                    backgroundColor: meta.color,
                    borderRight: `2px solid ${meta.accent}33`,
                    display: 'flex',
                    alignItems: 'center',
                    paddingLeft: 8,
                    gap: 4,
                  }}
                >
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 800,
                      color: meta.accent,
                      letterSpacing: 0.5,
                    }}
                  >
                    {seg}
                  </span>
                </div>
              );
            })}
          </div>

          {/* ── Station markers ──────────────────────────────────────────── */}
          <div style={{ position: 'relative', height: 20, borderBottom: '1px solid #F1F5F9' }}>
            {CORRIDOR_STREETS.map((cs, i) =>
              cs.station ? (
                <div
                  key={i}
                  title={cs.station}
                  style={{
                    position: 'absolute',
                    left: i * SLOT_W + SLOT_W / 2 - 7,
                    top: 3,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 2,
                  }}
                >
                  <Train size={10} color="#7C3AED" />
                  <span style={{ fontSize: 8, color: '#7C3AED', fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {cs.station.replace(' Station', '')}
                  </span>
                </div>
              ) : null
            )}
          </div>

          {/* ── NB Lane ──────────────────────────────────────────────────── */}
          <div style={{ borderBottom: '1px solid #E2E8F0', background: '#FAFCFF' }}>
            <Lane pills={nbPills} label="NB" arrowDir="↑" onPillClick={setSelectedPlan} />
          </div>

          {/* ── Cross street tick marks + labels ─────────────────────────── */}
          <div
            style={{
              position: 'relative',
              height: 80,
              borderBottom: '1px solid #E2E8F0',
              background: '#F8FAFC',
            }}
          >
            {CORRIDOR_STREETS.map((cs, i) => {
              const meta = SEGMENT_META[cs.segment];
              return (
                <div
                  key={i}
                  style={{
                    position: 'absolute',
                    left: i * SLOT_W + SLOT_W / 2,
                    top: 0,
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                  }}
                >
                  {/* Tick mark */}
                  <div style={{ width: 1, height: 8, background: meta.accent + '88', flexShrink: 0 }} />
                  {/* Rotated label */}
                  <div
                    style={{
                      transform: 'rotate(-45deg)',
                      transformOrigin: 'top center',
                      fontSize: 9,
                      fontWeight: 500,
                      color: '#475569',
                      whiteSpace: 'nowrap',
                      marginTop: 4,
                      lineHeight: 1,
                    }}
                  >
                    {cs.name.replace(/ (St|Ave|Blvd|Rd|Dr|Way|Pl)\.?$/i, '')}
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── SB Lane ──────────────────────────────────────────────────── */}
          <div style={{ background: '#FFFDF5' }}>
            <Lane pills={sbPills} label="SB" arrowDir="↓" onPillClick={setSelectedPlan} />
          </div>

        </div>
      </div>

      {/* ── Legend ───────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10, alignItems: 'center' }}>
        <span style={{ fontSize: 10, color: '#94A3B8', fontWeight: 600, marginRight: 4 }}>STAGE</span>
        {[
          { key: 'requested',       label: 'Requested' },
          { key: 'drafting',        label: 'Drafting' },
          { key: 'submitted_to_dot',label: 'Submitted' },
          { key: 'dot_review',      label: 'DOT Review' },
          { key: 'tcp_approved',    label: 'TCP Approved' },
          { key: 'loc_submitted',   label: 'LOC Submitted' },
          { key: 'loc_review',      label: 'LOC Review' },
          { key: 'plan_approved',   label: 'Approved' },
          { key: 'expired',         label: 'Expired' },
        ].map(({ key, label }) => {
          const c = getStagePill(key);
          return (
            <div
              key={key}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 10,
                color: c.text,
                background: c.bg,
                border: `1px solid ${c.border}`,
                borderRadius: 4,
                padding: '2px 6px',
                fontWeight: 600,
              }}
            >
              {label}
            </div>
          );
        })}
      </div>

      {/* ── Unmapped plans notice ─────────────────────────────────────────── */}
      {unmapped.length > 0 && (
        <div style={{
          marginTop: 12,
          padding: '8px 12px',
          background: '#FFFBEB',
          border: '1px solid #FCD34D',
          borderRadius: 8,
          display: 'flex',
          alignItems: 'flex-start',
          gap: 8,
        }}>
          <Info size={14} color="#B45309" style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#B45309' }}>
              {unmapped.length} plan{unmapped.length !== 1 ? 's' : ''} not shown —
            </span>
            <span style={{ fontSize: 11, color: '#92400E', marginLeft: 4 }}>
              cross streets don't match corridor data:{' '}
              {unmapped.map(p => p.loc || p.id).join(', ')}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
