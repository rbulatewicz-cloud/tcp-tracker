import React from 'react';
import { usePlanCard } from './PlanCardContext';

export const CycleTimeDisplay: React.FC = () => {
  const { dotCourtTime, overallDuration } = usePlanCard();

  if (dotCourtTime === null && overallDuration === null) return null;

  return (
    <div className="flex gap-3 mt-2 text-[11px] text-slate-500">
      {dotCourtTime !== null && <span>DOT Court Time: <strong className="text-slate-700">{dotCourtTime} days</strong></span>}
      {overallDuration !== null && <span>Overall Duration: <strong className="text-slate-700">{overallDuration} days</strong></span>}
    </div>
  );
};
