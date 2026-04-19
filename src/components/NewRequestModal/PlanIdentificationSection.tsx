import React from 'react';
import { CollapsibleSection } from '../CollapsibleSection';
import { User, UserRole } from '../../types';
import type { TurnaroundStats } from '../../utils/planStats';

// Workflow path info — updates live as plan type changes. Plain data; kept
// with this component since nothing else consumes it.
const WORKFLOW_INFO: Record<string, { label: string; color: string; steps: string; description: string }> = {
  WATCH: {
    label: 'Watch/Standard Path',
    color: '#6366F1',
    steps: 'Requested → Drafting → Submitted to DOT → Plan Approved',
    description: 'Short-duration, low-complexity work. Watch Manual based plans. The traffic control plan and letter of concurrence are submitted together as a single package. No separate TCP review cycle with DOT.',
  },
  Standard: {
    label: 'Watch/Standard Path',
    color: '#6366F1',
    steps: 'Requested → Drafting → Submitted to DOT → Plan Approved',
    description: 'Moderate complexity with standard lane or sidewalk impacts. TCP and LOC are submitted together. Follows the same single-submittal process as WATCH but may involve greater traffic impacts or longer duration.',
  },
  Engineered: {
    label: 'Engineered Path',
    color: '#8B5CF6',
    steps: 'Requested → Drafting → Submitted to DOT → TCP Approved → LOC Submitted → Plan Approved',
    description: 'Complex plans requiring a two-phase DOT approval process — TCP drawings are reviewed and approved first, then the Letter of Concurrence is submitted separately. Typically involves full closures, detours, or high-impact work.',
  },
};

interface PlanIdentificationSectionProps {
  loc?: string;
  parentLocId?: string;
  requestedBy?: string;
  type?: string;
  onChange: (key: string, value: unknown) => void;
  currentUser: User | null;
  planTypes: string[];
  turnaroundStats: TurnaroundStats;
}

export const PlanIdentificationSection: React.FC<PlanIdentificationSectionProps> = ({
  loc,
  parentLocId,
  requestedBy,
  type,
  onChange,
  currentUser,
  planTypes,
  turnaroundStats,
}) => {
  const workflowInfo = type ? WORKFLOW_INFO[type] ?? null : null;

  return (
    <CollapsibleSection title="Plan Identification">
      <div className="flex flex-col gap-3">

        {/* LOC # */}
        {parentLocId ? (
          <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3">
            <div className="text-[9px] font-bold text-indigo-500 uppercase tracking-widest mb-2">LOC # — Primary Identifier</div>
            <div className="text-sm font-bold text-slate-900 font-mono p-2">{loc}</div>
            <div className="text-[10px] text-indigo-400 mt-1">Automatic revision of {parentLocId}. Cannot be changed.</div>
          </div>
        ) : currentUser?.role === UserRole.SFTC ? (
          <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3">
            <div className="text-[9px] font-bold text-indigo-500 uppercase tracking-widest mb-2">LOC # — Primary Identifier</div>
            <div className="text-sm font-bold text-slate-400 font-mono p-2">Auto-assigned on submit</div>
            <div className="text-[10px] text-indigo-400 mt-1">Your LOC number will be automatically assigned when you submit this request.</div>
          </div>
        ) : (
          <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3">
            <div className="text-[9px] font-bold text-indigo-500 uppercase tracking-widest mb-2">LOC # — Primary Identifier</div>
            <input
              type="text"
              value={loc || ''}
              onChange={e => onChange('loc', e.target.value)}
              placeholder="e.g. LOC-366"
              className="text-sm font-bold text-slate-900 bg-white border border-indigo-200 rounded-md p-2 w-full focus:outline-none focus:border-indigo-400 font-mono"
            />
            <div className="text-[10px] text-indigo-400 mt-1">Pre-filled with the next available number. Edit only if a specific LOC is required.</div>
          </div>
        )}

        {/* Requested By */}
        <div className="bg-slate-50 border border-slate-100 rounded-lg p-3">
          <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">Requested By</div>
          <input
            type="text"
            value={requestedBy || ''}
            onChange={e => onChange('requestedBy', e.target.value)}
            placeholder="Your name"
            className="text-xs font-semibold text-slate-900 bg-white border border-slate-200 rounded-md p-2 w-full focus:outline-none focus:border-blue-400"
          />
          <div className="text-[10px] text-slate-400 mt-1">Auto-filled from your account. Edit if submitting on behalf of someone else.</div>
        </div>

        {/* Plan Type + Workflow preview */}
        <div className="bg-slate-50 border border-slate-100 rounded-lg p-3">
          <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">Plan Type <span className="text-red-500">*</span></div>
          <select
            value={type || ''}
            onChange={e => onChange('type', e.target.value)}
            className="text-xs font-semibold text-slate-900 bg-white border border-slate-200 rounded-md p-2 w-full cursor-pointer mb-3"
          >
            <option value="" disabled>Select a plan type…</option>
            {planTypes.map(opt => <option key={opt} value={opt}>{opt}</option>)}
          </select>
          {workflowInfo ? (
            <div className="rounded-lg border px-3 py-2" style={{ borderColor: `${workflowInfo.color}44`, background: `${workflowInfo.color}08` }}>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-2 h-2 rounded-full" style={{ background: workflowInfo.color }} />
                <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: workflowInfo.color }}>
                  {workflowInfo.label}
                </span>
              </div>
              <div className="text-[10px] text-slate-600 leading-relaxed mb-1.5">{workflowInfo.description}</div>
              <div className="text-[10px] text-slate-400 leading-relaxed border-t border-slate-200 pt-1.5 mt-1">{workflowInfo.steps}</div>
            </div>
          ) : (
            <div className="rounded-lg border border-slate-200 px-3 py-2 bg-white text-[10px] text-slate-400 italic">
              Select a plan type above to see its description and approval workflow.
            </div>
          )}

          {/* Turnaround stats */}
          {type && (
            <div className="mt-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
              <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mr-0.5">📊 Avg Turnaround</span>
                {turnaroundStats.avgDays !== null ? (
                  <span className="text-[12px] font-bold text-slate-800">{turnaroundStats.avgDays} days</span>
                ) : (
                  <span className="text-[11px] text-slate-400 italic">No recent data</span>
                )}
                <span className="text-slate-300 text-[11px]">·</span>
                <span className="text-[11px] text-slate-600">
                  {turnaroundStats.inProgress} currently in progress
                </span>
                {turnaroundStats.sampleSize > 0 && (
                  <span className="text-[10px] text-slate-400">
                    (based on {turnaroundStats.sampleSize} plan{turnaroundStats.sampleSize !== 1 ? 's' : ''}, last 60 days
                    {turnaroundStats.sampleSize <= 3 ? ' — limited data' : ''})
                  </span>
                )}
              </div>
              {turnaroundStats.sampleSize > 0 && turnaroundStats.sampleSize <= 3 && (
                <div className="mt-1 text-[10px] text-amber-600">
                  ⚠ Small sample — contributing plans: {turnaroundStats.contributingLocs.join(', ')}. If any were imported/trued-up, mark them as Historical on the plan card to exclude them.
                </div>
              )}
            </div>
          )}
        </div>

      </div>
    </CollapsibleSection>
  );
};
