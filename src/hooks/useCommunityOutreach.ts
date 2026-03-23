import { useState } from 'react';
import { Plan } from '../types';

export const useCommunityOutreach = (plan: Plan) => {
  const [outreachExpanded, setOutreachExpanded] = useState(false);

  const isOutreachTriggered = !!(
    plan.impact_driveway ||
    plan.impact_busStop ||
    plan.impact_fullClosure ||
    plan.mot_peakHour
  );

  const isOpen = isOutreachTriggered || outreachExpanded;

  const toggleOutreach = () => {
    setOutreachExpanded(!isOpen);
  };

  return {
    isOpen,
    isTriggered: isOutreachTriggered,
    toggle: toggleOutreach
  };
};
