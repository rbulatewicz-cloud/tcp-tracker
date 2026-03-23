import React, { ReactNode, useMemo, useCallback } from 'react';
import { useApp } from '../../hooks/useApp';
import { PlanContext } from './PlanContext';
import { usePlanManagement } from '../../hooks/usePlanManagement';
import { usePlanActions } from '../../hooks/usePlanActions';
import { usePlanExport } from '../../hooks/usePlanExport';
import { STAGES } from '../../constants';
import { UserRole } from '../../types';

export const PlanProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { auth, firestoreData, uiState, planManagement } = useApp();

  const td = useMemo(() => new Date().toLocaleDateString('en-CA'), []);
  const getUserLabel = useCallback(
    () => auth.currentUser ? `${auth.currentUser.name} (${auth.currentUser.role})` : "Guest",
    [auth.currentUser]
  );

  const planActions = usePlanActions({
    plans: firestoreData.plans,
    setPlans: firestoreData.setPlans,
    selectedPlan: planManagement.selectedPlan,
    setSelectedPlan: planManagement.setSelectedPlan,
    draftPlan: planManagement.draftPlan,
    setDraftPlan: planManagement.setDraftPlan,
    isDirty: planManagement.isDirty,
    setIsDirty: planManagement.setIsDirty,
    td,
    getUserLabel,
    STAGES,
    setLoading: uiState.setLoading,
    setClearLogConfirm: uiState.setClearLogConfirm,
    setClearPlansConfirm: uiState.setClearPlansConfirm,
    setSelectedPlanIds: planManagement.setSelectedPlanIds,
    currentUser: auth.currentUser,
    role: auth.role,
    _UserRole: UserRole,
  });

  const planExport = usePlanExport(uiState.setLoading, () => auth.currentUser ? `${auth.currentUser.name} (${auth.currentUser.role})` : "Guest", firestoreData.reportTemplate);

  return (
    <PlanContext.Provider value={{ planManagement, planActions, planExport }}>
      {children}
    </PlanContext.Provider>
  );
};
