import React from 'react';
import { ChevronDown, ChevronUp, Clock, User, CheckSquare, AlertCircle, BarChart2 } from 'lucide-react';
import { useApp } from '../../hooks/useApp';
import { getTurnaroundStats } from '../../utils/planStats';

// ── Stage data ─────────────────────────────────────────────────────────────────

interface StageInfo {
  label: string;
  shortDesc: string;
  detail: string;
  color: string;
  responsible: string;
  needed: string[];
  notes?: string;
  clockTarget?: string;
  showStats?: 'watch_standard' | 'engineered';
}

const WATCH_STANDARD_STAGES: StageInfo[] = [
  {
    label: 'Requested',
    shortDesc: 'Plan request submitted',
    detail: 'The project engineer or client submits a new plan request. SFTC reviews the request, assigns a LOC number, and determines the appropriate plan type and workflow.',
    color: '#6B7280',
    responsible: 'Project Engineer / Client',
    needed: [
      'Segment and street information',
      'Scope of work description',
      'Need-by date',
      'Work hours and impacted days',
    ],
    notes: 'PHE and Noise Variance compliance requirements are identified at this stage based on hours of work.',
  },
  {
    label: 'Drafting',
    shortDesc: 'Team prepares TCP drawings',
    detail: 'SFTC prepares TCP drawings for the Watch or Standard plan. Since TCP and LOC are submitted together, both documents are finalized in this phase before any DOT submittal.',
    color: '#3B82F6',
    responsible: 'SFTC Drafting Team',
    needed: [
      'Approved scope and segment details',
      'Applicable BOE/Watch Manual standards',
      'PHE approval (if peak hours required)',
      'Noise Variance (if nighttime work)',
    ],
    clockTarget: 'Target: 3 days',
    notes: 'Any compliance approvals (PHE, NV) must be secured before submission.',
  },
  {
    label: 'Submitted to DOT',
    shortDesc: 'Package sent for DOT review',
    detail: 'For Watch/Standard plans, the complete TCP and LOC package is submitted together to DOT in a single submittal. No separate TCP review cycle occurs.',
    color: '#F59E0B',
    responsible: 'SFTC MOT Lead',
    needed: [
      'Signed TCP drawings',
      'Completed Letter of Concurrence',
      'All compliance approvals attached',
    ],
  },
  {
    label: 'DOT Review',
    shortDesc: 'DOT reviews and comments',
    detail: 'DOT reviews the combined TCP/LOC package. If comments are issued, SFTC must revise and resubmit. Multiple review cycles are possible and are tracked within the plan card.',
    color: '#EF4444',
    responsible: 'LADOT Reviewer',
    needed: [],
    clockTarget: 'Target: 10 days',
    notes: 'DOT may issue comments requiring revisions — each revision triggers a new review cycle with its own clock.',
  },
  {
    label: 'Plan Approved',
    shortDesc: 'LOC and TCP approved',
    detail: 'DOT approves the combined TCP and LOC package. The plan is now fully approved and the implementation window can be set.',
    color: '#10B981',
    responsible: 'LADOT',
    needed: [],
    showStats: 'watch_standard',
  },
];

const ENGINEERED_STAGES: StageInfo[] = [
  {
    label: 'Requested',
    shortDesc: 'Plan request submitted',
    detail: 'The project engineer or client submits a new plan request. SFTC reviews the request, assigns a LOC number, and confirms the Engineered workflow is required based on plan complexity.',
    color: '#6B7280',
    responsible: 'Project Engineer / Client',
    needed: [
      'Segment and street information',
      'Scope of work description',
      'Need-by date',
      'Work hours and impacted days',
    ],
    notes: 'Engineered plans typically involve full closures, detours, or high-impact work requiring separate TCP and LOC review phases.',
  },
  {
    label: 'Drafting',
    shortDesc: 'Team prepares TCP drawings',
    detail: 'SFTC prepares the TCP drawings. For Engineered plans, the TCP drawings are submitted to DOT first for approval before the LOC package is prepared.',
    color: '#3B82F6',
    responsible: 'SFTC Drafting Team',
    needed: [
      'Approved scope and segment details',
      'Applicable DOT engineering standards',
      'PHE approval (if peak hours required)',
      'Noise Variance (if nighttime work)',
    ],
    clockTarget: 'Target: 5 days',
    notes: 'LOC preparation does not begin until TCP is approved. Securing compliance approvals early prevents delays.',
  },
  {
    label: 'Submitted to DOT',
    shortDesc: 'TCP package sent for DOT review',
    detail: 'The TCP drawings are submitted to DOT for the first phase of review. The LOC is not included at this stage — it is submitted separately after TCP approval.',
    color: '#F59E0B',
    responsible: 'SFTC MOT Lead',
    needed: [
      'Signed TCP drawings',
      'DOT cover sheet and submission form',
    ],
  },
  {
    label: 'DOT Review',
    shortDesc: 'DOT reviews TCP drawings',
    detail: 'DOT reviews the TCP drawings and issues comments if revisions are needed. Each revision cycle is tracked individually with its own DOT clock and team response clock.',
    color: '#EF4444',
    responsible: 'LADOT Reviewer',
    needed: [],
    clockTarget: 'Target: 10 days per cycle',
    notes: 'Track DOT and team response days separately within the plan card. Multiple cycles add to overall turnaround.',
  },
  {
    label: 'TCP Approved',
    shortDesc: 'TCP drawings approved by DOT',
    detail: 'DOT approves the TCP drawings. This unlocks the LOC submission phase — SFTC can now prepare and submit the Letter of Concurrence package.',
    color: '#8B5CF6',
    responsible: 'LADOT',
    needed: [],
    notes: 'TCP approval is a hard dependency for LOC submission. The LOC cannot be submitted until this stage is reached.',
  },
  {
    label: 'LOC Submitted',
    shortDesc: 'Letter of Concurrence submitted',
    detail: 'SFTC submits the LOC package to DOT. This package includes the Letter of Concurrence along with the previously approved TCP drawings and any required compliance documentation.',
    color: '#06B6D4',
    responsible: 'SFTC MOT Lead',
    needed: [
      'Approved TCP drawings (from prior phase)',
      'Completed Letter of Concurrence',
      'CD Concurrence approval (if required)',
      'All compliance approvals attached',
    ],
  },
  {
    label: 'LOC Review',
    shortDesc: 'DOT reviews LOC package',
    detail: 'DOT reviews the LOC package. Comments may be issued requiring revisions to the LOC. Additional review cycles are tracked within the plan card.',
    color: '#EF4444',
    responsible: 'LADOT Reviewer',
    needed: [],
    clockTarget: 'Target: 5–10 days',
    notes: 'LOC review cycles are tracked separately from TCP review cycles.',
  },
  {
    label: 'Plan Approved',
    shortDesc: 'Full plan package approved',
    detail: 'DOT approves the complete package — TCP drawings and LOC. The plan is fully approved and the implementation window can be set.',
    color: '#10B981',
    responsible: 'LADOT',
    needed: [],
    showStats: 'engineered',
  },
];

// ── Stage node ─────────────────────────────────────────────────────────────────

interface StageNodeProps {
  stage: StageInfo;
  isLast: boolean;
  isOpen: boolean;
  onToggle: () => void;
  liveStats?: { avgDays: number | null; sampleSize: number; inProgress: number } | null;
}

function StageNode({ stage, isLast, isOpen, onToggle, liveStats }: StageNodeProps) {
  return (
    <div>
      {/* Clickable stage row */}
      <button
        onClick={onToggle}
        className={`w-full flex items-start gap-3 text-left rounded-lg px-2 py-1.5 transition-colors group ${
          isOpen ? 'bg-white shadow-sm ring-1 ring-slate-200' : 'hover:bg-white/70'
        }`}
      >
        {/* Dot */}
        <div className="flex-shrink-0 mt-1" style={{ width: 12 }}>
          <div
            className="rounded-full"
            style={{ width: 12, height: 12, backgroundColor: stage.color }}
          />
        </div>

        {/* Label + short desc */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-slate-800 leading-tight">{stage.label}</span>
            <span className="text-slate-400 group-hover:text-slate-600 flex-shrink-0 transition-colors">
              {isOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </span>
          </div>
          <div className="text-xs text-slate-500 mt-0.5 leading-snug">{stage.shortDesc}</div>
        </div>
      </button>

      {/* Expanded detail panel */}
      {isOpen && (
        <div className="mt-1 mb-1 ml-6 bg-white border border-slate-200 rounded-lg p-3 space-y-3 shadow-sm">

          {/* Detail description */}
          <p className="text-xs text-slate-600 leading-relaxed">{stage.detail}</p>

          {/* Responsible */}
          <div className="flex items-start gap-2">
            <User size={11} className="text-slate-400 mt-0.5 flex-shrink-0" />
            <div>
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-0.5">Responsible</div>
              <div className="text-xs text-slate-700">{stage.responsible}</div>
            </div>
          </div>

          {/* What's needed */}
          {stage.needed.length > 0 && (
            <div className="flex items-start gap-2">
              <CheckSquare size={11} className="text-slate-400 mt-0.5 flex-shrink-0" />
              <div>
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">What's Needed</div>
                <ul className="space-y-0.5">
                  {stage.needed.map((item, i) => (
                    <li key={i} className="text-xs text-slate-700 flex items-start gap-1.5">
                      <span className="text-slate-300 flex-shrink-0 mt-0.5">•</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Clock target */}
          {stage.clockTarget && (
            <div className="flex items-center gap-2">
              <Clock size={11} className="text-slate-400 flex-shrink-0" />
              <div>
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-0.5">Duration</div>
                <div className="text-xs text-slate-700">{stage.clockTarget}</div>
              </div>
            </div>
          )}

          {/* Notes */}
          {stage.notes && (
            <div className="flex items-start gap-2">
              <AlertCircle size={11} className="text-amber-500 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-amber-700 leading-relaxed">{stage.notes}</p>
            </div>
          )}

          {/* Live turnaround stats — shown on Plan Approved node */}
          {stage.showStats && liveStats && (
            <div className="flex items-start gap-2 pt-2 border-t border-slate-100">
              <BarChart2 size={11} className="text-green-500 mt-0.5 flex-shrink-0" />
              <div>
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-0.5">Live Turnaround (last 60 days)</div>
                {liveStats.avgDays !== null ? (
                  <div className="flex items-baseline gap-1.5 flex-wrap">
                    <span className="text-sm font-bold text-slate-800">{liveStats.avgDays} days avg</span>
                    <span className="text-xs text-slate-500">·</span>
                    <span className="text-xs text-slate-600">{liveStats.inProgress} in progress</span>
                    <span className="text-[10px] text-slate-400">
                      (based on {liveStats.sampleSize} plan{liveStats.sampleSize !== 1 ? 's' : ''}
                      {liveStats.sampleSize <= 3 ? ' — limited data' : ''})
                    </span>
                  </div>
                ) : (
                  <span className="text-xs text-slate-400 italic">No completed plans in the last 60 days</span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Connector line */}
      {!isLast && (
        <div className="flex" style={{ marginLeft: 13 }}>
          <div className="border-l-2 border-slate-200" style={{ height: isOpen ? 8 : 20 }} />
        </div>
      )}
    </div>
  );
}

// ── Path column ────────────────────────────────────────────────────────────────

interface PathColumnProps {
  title: string;
  accentColor: string;
  stages: StageInfo[];
  watchStats: ReturnType<typeof getTurnaroundStats>;
  engineeredStats: ReturnType<typeof getTurnaroundStats>;
}

function PathColumn({ title, accentColor, stages, watchStats, engineeredStats }: PathColumnProps) {
  const [openIdx, setOpenIdx] = React.useState<number | null>(null);

  const toggle = (idx: number) => setOpenIdx(prev => (prev === idx ? null : idx));

  return (
    <div className="flex-1 min-w-0 bg-slate-50 border border-slate-200 rounded-xl p-4">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <span
          className="px-3 py-1 rounded-full text-xs font-semibold text-white"
          style={{ backgroundColor: accentColor }}
        >
          {title}
        </span>
        <span className="text-xs text-slate-400">{stages.length} stages</span>
        <span className="ml-auto text-[10px] text-slate-400 italic">Click any stage for details</span>
      </div>

      {/* Stages */}
      <div className="flex flex-col">
        {stages.map((stage, idx) => {
          const stats =
            stage.showStats === 'watch_standard' ? watchStats :
            stage.showStats === 'engineered'     ? engineeredStats :
            null;
          return (
            <StageNode
              key={`${title}-${idx}`}
              stage={stage}
              isLast={idx === stages.length - 1}
              isOpen={openIdx === idx}
              onToggle={() => toggle(idx)}
              liveStats={stats}
            />
          );
        })}
      </div>
    </div>
  );
}

// ── Main export ────────────────────────────────────────────────────────────────

export default function WorkflowGuideSection() {
  const { firestoreData } = useApp();
  const plans = firestoreData.plans;

  const watchStats       = React.useMemo(() => getTurnaroundStats('WATCH',      plans), [plans]);
  const standardStats    = React.useMemo(() => getTurnaroundStats('Standard',   plans), [plans]);
  const engineeredStats  = React.useMemo(() => getTurnaroundStats('Engineered', plans), [plans]);

  // Combine Watch + Standard into a blended stat for the Watch/Standard column
  const watchStandardStats = React.useMemo(() => {
    // Weighted average of the two if both have data
    if (watchStats.sampleSize > 0 && standardStats.sampleSize > 0) {
      const totalN   = watchStats.sampleSize + standardStats.sampleSize;
      const totalAvg = watchStats.avgDays !== null && standardStats.avgDays !== null
        ? Math.round(((watchStats.avgDays * watchStats.sampleSize) + (standardStats.avgDays * standardStats.sampleSize)) / totalN * 10) / 10
        : (watchStats.avgDays ?? standardStats.avgDays);
      return { avgDays: totalAvg, sampleSize: totalN, inProgress: watchStats.inProgress + standardStats.inProgress };
    }
    if (watchStats.sampleSize > 0) return watchStats;
    if (standardStats.sampleSize > 0) return standardStats;
    return { avgDays: null, sampleSize: 0, inProgress: watchStats.inProgress + standardStats.inProgress };
  }, [watchStats, standardStats]);

  return (
    <div>
      {/* Section header */}
      <div className="mb-5">
        <h2 className="text-lg font-bold text-slate-800">Approval Pathway Guide</h2>
        <p className="text-sm text-slate-500 mt-0.5">
          TCP plans follow one of two approval paths depending on plan type. Click any stage to see
          who's responsible, what's needed, and duration targets. Turnaround averages are live from
          the last 60 days of completed plans (excluding plans that required PHE or CD Concurrence).
        </p>
      </div>

      {/* Two-column layout */}
      <div className="flex flex-col sm:flex-row gap-4">
        <PathColumn
          title="Watch / Standard"
          accentColor="#6366F1"
          stages={WATCH_STANDARD_STAGES}
          watchStats={watchStandardStats}
          engineeredStats={engineeredStats}
        />
        <PathColumn
          title="Engineered"
          accentColor="#8B5CF6"
          stages={ENGINEERED_STAGES}
          watchStats={watchStandardStats}
          engineeredStats={engineeredStats}
        />
      </div>

      {/* Footer */}
      <p className="mt-4 text-xs text-slate-400">
        Resubmission may occur if DOT comments require revisions. Additional review cycles are tracked within each plan card.
      </p>
    </div>
  );
}
