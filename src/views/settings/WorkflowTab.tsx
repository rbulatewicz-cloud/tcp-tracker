import React from 'react';
import { AppConfig } from '../../types';
import { CLOCK_TARGETS } from '../../constants';

const PHASES: { key: string; label: string }[] = [
  { key: 'drafting',         label: 'Drafting' },
  { key: 'dot_review',       label: 'DOT Review (1st)' },
  { key: 'team_response',    label: 'Team Response' },
  { key: 'dot_review_final', label: 'DOT Review (Final)' },
  { key: 'loc_review',       label: 'LOC Review (Engineered only)' },
];

const PLAN_TYPE_COLS = ['WATCH', 'Standard', 'Engineered'];

interface WorkflowTabProps {
  form: AppConfig;
  setForm: React.Dispatch<React.SetStateAction<AppConfig>>;
}

export const WorkflowTab: React.FC<WorkflowTabProps> = ({ form, setForm }) => {
  const setClockTarget = (planType: string, phase: string, field: 'target' | 'warning', value: number) => {
    setForm(p => {
      const existing = (p.clockTargets[planType] || {})[phase] || { target: 1, warning: 1 };
      return {
        ...p,
        clockTargets: {
          ...p.clockTargets,
          [planType]: {
            ...p.clockTargets[planType],
            [phase]: { target: existing.target, warning: existing.warning, [field]: value },
          },
        },
      } as AppConfig;
    });
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-base font-bold text-slate-800 dark:text-slate-200 mb-1">Alert Thresholds</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">Controls when plans are flagged as "At Risk" or "Overdue" in the table view.</p>
        <div className="flex gap-6">
          <div>
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1 block">At Risk Window (days)</label>
            <input
              type="number" min={1}
              className="w-28 border border-amber-300 bg-amber-50 rounded-lg px-3 py-2 text-sm font-semibold text-amber-800 focus:outline-none focus:ring-2 focus:ring-amber-400"
              value={form.atRiskDays}
              onChange={e => setForm(p => ({ ...p, atRiskDays: parseInt(e.target.value) || 14 }))}
            />
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Plans due within this many days turn amber.</p>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1 block">Overdue Threshold (days)</label>
            <input
              type="number" min={0}
              className="w-28 border border-red-300 bg-red-50 rounded-lg px-3 py-2 text-sm font-semibold text-red-800 focus:outline-none focus:ring-2 focus:ring-red-400"
              value={form.overdueDays}
              onChange={e => setForm(p => ({ ...p, overdueDays: parseInt(e.target.value) || 7 }))}
            />
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Plans past due by this many days turn red.</p>
          </div>
        </div>
      </div>

      <div className="border-t border-slate-100 dark:border-slate-700 pt-6">
        <h2 className="text-base font-bold text-slate-800 dark:text-slate-200 mb-1">Clock Targets by Phase</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
          Target and warning day counts per review phase per plan type. These drive the color coding in Progression History.
          <span className="ml-2 text-emerald-600 font-semibold">Green = on track</span>
          <span className="ml-2 text-amber-600 font-semibold">Amber = approaching warning</span>
          <span className="ml-2 text-red-600 font-semibold">Red = over target</span>
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b-2 border-slate-200 dark:border-slate-700">
                <th className="text-left py-2 pr-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide w-40">Phase</th>
                {PLAN_TYPE_COLS.map(pt => (
                  <th key={pt} colSpan={2} className="text-center py-2 px-2 text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide border-l border-slate-100 dark:border-slate-700">
                    {pt}
                  </th>
                ))}
              </tr>
              <tr className="border-b border-slate-100 dark:border-slate-700">
                <th />
                {PLAN_TYPE_COLS.map(pt => (
                  <React.Fragment key={pt}>
                    <th className="text-center py-1 px-2 text-xs font-semibold text-emerald-600 border-l border-slate-100 dark:border-slate-700">Target d</th>
                    <th className="text-center py-1 px-2 text-xs font-semibold text-amber-600">Warning d</th>
                  </React.Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {PHASES.map(phase => (
                <tr key={phase.key} className="border-b border-slate-50 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700">
                  <td className="py-2 pr-4 text-xs font-semibold text-slate-700 dark:text-slate-300">{phase.label}</td>
                  {PLAN_TYPE_COLS.map(pt => {
                    const cell = (form.clockTargets?.[pt] || CLOCK_TARGETS[pt] || {})[phase.key];
                    const isNA = pt !== 'Engineered' && phase.key === 'loc_review';
                    return (
                      <React.Fragment key={pt}>
                        <td className="py-1 px-2 text-center border-l border-slate-100 dark:border-slate-700">
                          {isNA ? (
                            <span className="text-slate-300 text-xs">—</span>
                          ) : (
                            <input
                              type="number" min={1}
                              className="w-16 text-center border border-slate-200 dark:border-slate-600 rounded px-1 py-1 text-sm font-semibold text-emerald-700 dark:text-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400 bg-white dark:bg-slate-700"
                              value={cell?.target ?? ''}
                              onChange={e => setClockTarget(pt, phase.key, 'target', parseInt(e.target.value) || 1)}
                            />
                          )}
                        </td>
                        <td className="py-1 px-2 text-center">
                          {isNA ? (
                            <span className="text-slate-300 text-xs">—</span>
                          ) : (
                            <input
                              type="number" min={1}
                              className="w-16 text-center border border-slate-200 dark:border-slate-600 rounded px-1 py-1 text-sm font-semibold text-amber-700 dark:text-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 bg-white dark:bg-slate-700"
                              value={cell?.warning ?? ''}
                              onChange={e => setClockTarget(pt, phase.key, 'warning', parseInt(e.target.value) || 1)}
                            />
                          )}
                        </td>
                      </React.Fragment>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <button
          onClick={() => setForm(p => ({ ...p, clockTargets: { ...CLOCK_TARGETS } }))}
          className="mt-3 text-xs text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 underline"
        >
          Reset to defaults
        </button>
      </div>
    </div>
  );
};
