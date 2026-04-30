import React from 'react';
import type { PlanTansatPhase } from '../../types';

interface TansatPhasePlannerProps {
  phases: PlanTansatPhase[];
  onChange: (next: PlanTansatPhase[]) => void;
}

/**
 * Fluid TANSAT phase plan editor — used inside the New Request modal AND on
 * the plan card. The SFTC engineer flags `impact_transit` ("TANSAT Needed")
 * to expand this section. Phases are optional; can be filled in later.
 *
 * MOT later creates TansatRequest records that reference these phase
 * numbers, so the contract is: phaseNumber 1..N stays stable once defined.
 */
export const TansatPhasePlanner: React.FC<TansatPhasePlannerProps> = ({ phases, onChange }) => {
  const setCount = (target: number) => {
    const safe = Math.max(0, Math.min(10, target));
    if (safe === phases.length) return;
    if (safe > phases.length) {
      // Add empty phases. Phase numbers are 1-indexed and stay stable.
      const additions: PlanTansatPhase[] = Array.from({ length: safe - phases.length }, (_, i) => ({
        phaseNumber: phases.length + i + 1,
        label: '',
        anticipatedStart: '',
        anticipatedEnd: '',
        needsTansat: true,
      }));
      onChange([...phases, ...additions]);
    } else {
      onChange(phases.slice(0, safe));
    }
  };

  const update = (idx: number, patch: Partial<PlanTansatPhase>) =>
    onChange(phases.map((p, i) => i === idx ? { ...p, ...patch } : p));

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 mt-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800">
            📋 TANSAT Phase Plan
          </span>
          <span className="text-[10px] text-amber-700 italic">
            optional — can fill in later
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-bold uppercase tracking-wider text-amber-800">Phases</span>
          <input
            type="number"
            min={0}
            max={10}
            value={phases.length}
            onChange={e => setCount(parseInt(e.target.value || '0', 10))}
            className="w-14 rounded border border-amber-300 bg-white px-2 py-1 text-xs font-bold text-amber-900 focus:outline-none focus:ring-1 focus:ring-amber-400"
          />
        </div>
      </div>

      {phases.length === 0 ? (
        <p className="text-[11px] text-amber-700 italic">
          Set the number of phases above to start. MOT will create separate TANSAT requests
          for each phase that needs parking removal.
        </p>
      ) : (
        <div className="space-y-2">
          {phases.map((phase, idx) => (
            <div key={idx} className="flex items-center gap-2 bg-white rounded border border-amber-200 px-2 py-1.5">
              <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-slate-900 text-[11px] font-bold text-white">
                {phase.phaseNumber}
              </div>
              <input
                type="text"
                placeholder="Phase label (optional)"
                value={phase.label ?? ''}
                onChange={e => update(idx, { label: e.target.value })}
                className="flex-1 rounded border border-slate-200 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-amber-400"
              />
              <input
                type="date"
                value={phase.anticipatedStart ?? ''}
                onChange={e => update(idx, { anticipatedStart: e.target.value })}
                className="rounded border border-slate-200 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-amber-400"
              />
              <span className="text-slate-400 text-xs">→</span>
              <input
                type="date"
                value={phase.anticipatedEnd ?? ''}
                onChange={e => update(idx, { anticipatedEnd: e.target.value })}
                className="rounded border border-slate-200 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-amber-400"
              />
              <label className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-600 whitespace-nowrap cursor-pointer">
                <input
                  type="checkbox"
                  checked={phase.needsTansat}
                  onChange={e => update(idx, { needsTansat: e.target.checked })}
                  className="rounded border-slate-300"
                />
                Needs TANSAT
              </label>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
