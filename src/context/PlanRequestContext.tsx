import React from 'react';
import type { Plan } from '../types';

/**
 * Lightweight context for plan-level request actions that live OUTSIDE the
 * PlanCardProvider tree (e.g. actions that open the top-level New Request
 * modal and mutate its form state). PlanHeader consumes this so SFTC can
 * kick off a renewal request from the plan card.
 */
interface PlanRequestContextShape {
  onRequestRenewal: (plan: Plan) => void;
}

export const PlanRequestContext = React.createContext<PlanRequestContextShape>({
  onRequestRenewal: () => {},
});

export const usePlanRequest = (): PlanRequestContextShape =>
  React.useContext(PlanRequestContext);
