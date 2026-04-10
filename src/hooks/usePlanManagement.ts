import { useState, useEffect } from 'react';
import { Plan, FilterState, SortConfig } from '../types';

export const usePlanManagement = (plans: Plan[]) => {
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);

  const [draftPlan, setDraftPlan] = useState<Plan | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  // Only reacts to plan selection changes — not dirty state.
  // This prevents an in-progress edit from being overwritten when isDirty toggles.
  // After a save, setSelectedPlan is always called with the updated plan, which
  // re-triggers this effect and correctly re-syncs the draft.
  useEffect(() => {
    if (selectedPlan) {
      if (!isDirty) setDraftPlan(selectedPlan);
    } else {
      setDraftPlan(null);
      setIsDirty(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPlan]);

  const [filter, setFilter] = useState<FilterState>({ stage: "all", type: "all", lead: "all", priority: "all", importStatus: "all", requestedBy: "all", scope: "all" });
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);
  const [planSearch, setPlanSearch] = useState("");
  const [selectedPlanIds, setSelectedPlanIds] = useState<string[]>([]);

  return {
    selectedPlan, setSelectedPlan,
    draftPlan, setDraftPlan,
    isDirty, setIsDirty,
    filter, setFilter,
    sortConfig, setSortConfig,
    planSearch, setPlanSearch,
    selectedPlanIds, setSelectedPlanIds
  };
};
