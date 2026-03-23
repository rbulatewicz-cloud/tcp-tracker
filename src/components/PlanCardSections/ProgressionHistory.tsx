import React from 'react';
import { usePlanData, usePlanUtils } from '../PlanCardContext';

export const ProgressionHistory: React.FC = React.memo(() => {
  const { selectedPlan } = usePlanData();
  const {
    STAGES,
    getLocalDateString,
    daysBetween,
  } = usePlanUtils();

  // Get full history of status changes, sorted by date
  const history = (selectedPlan.statusHistory || selectedPlan.log || [])
    .filter((s: any) => s.action.includes("Status →"))
    .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return (
    <div className="pb-4 mb-4">
      <div className="flex flex-col gap-2">
        {STAGES.map((stage) => {
          const isActive = stage.key === selectedPlan.stage;
          const stageEntries = history.filter((s: any) => s.action.includes(`Status → ${stage.label}`));
          const isPassed = stageEntries.length > 0;

          return (
            <div key={stage.key} className="flex flex-col gap-1 text-[11px] p-2 bg-slate-50 rounded-md border border-slate-100">
              <div className="flex items-center gap-2 justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ background: isActive ? stage.color : (isPassed ? stage.color : "#E2E8F0") }} />
                  <span className={`font-bold ${isActive ? "text-slate-900" : (isPassed ? "text-slate-500" : "text-slate-400")}`}>
                    {stage.label}
                  </span>
                </div>
              </div>
              {stageEntries.map((entry: any, i: number) => {
                // Find the index of this entry in the full history to find the next status change
                const historyIndex = history.findIndex((h: any) => h.uniqueId === entry.uniqueId);
                const nextEntry = history[historyIndex + 1];
                
                const startDate = entry.date.split(" ")[0];
                const endDate = nextEntry ? nextEntry.date.split(" ")[0] : getLocalDateString().split(" ")[0];
                const duration = daysBetween(startDate, endDate);

                return (
                  <div key={entry.uniqueId || i} className="flex justify-between text-slate-500 pl-4">
                    <span>{startDate} to {nextEntry ? endDate : 'Present'}</span>
                    <span className="font-mono font-bold">{duration} days</span>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
});
