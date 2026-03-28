import React, { ReactNode, useCallback, useMemo } from 'react';
import { AppContext } from './AppContext';
import { useUIState } from '../hooks/useUIState';
import { usePlanManagement } from '../hooks/usePlanManagement';
import { useTableState } from '../hooks/useTableState';
import { useAuth } from '../hooks/useAuth';
import { useFirestoreData } from '../hooks/useFirestoreData';
import { usePermissions } from '../hooks/usePermissions';
import { usePlanActions } from '../hooks/usePlanActions';
import { useUserManagement } from '../hooks/useUserManagement';
import { useLOCManagement } from '../hooks/useLOCManagement';
import { STAGES } from '../constants';
import { UserRole, Plan } from '../types';
import { writeNotificationsForPlanEvent, buildStatusChangeNotif, buildCommentNotif } from '../services/notificationService';

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const uiState = useUIState();
  const tableState = useTableState();
  const auth = useAuth();
  const firestoreData = useFirestoreData(auth.currentUser, auth.role, auth.canManageApp);
  const planManagement = usePlanManagement(firestoreData.plans);
  const permissions = usePermissions();
  const td = useMemo(() => new Date().toLocaleDateString('en-CA'), []);
  const getUserLabel = useCallback(
    () => auth.currentUser ? `${auth.currentUser.name} (${auth.currentUser.role})` : "Guest",
    [auth.currentUser]
  );

  const handleStageNotify = useCallback((plan: Plan, newStage: string, stageLabel: string, actorEmail: string) => {
    if (!plan.subscribers?.length) return;
    const { title, body, type } = buildStatusChangeNotif(plan, newStage, stageLabel);
    const subscriberUsers = (plan.subscribers || [])
      .filter(email => email !== actorEmail)
      .map(email => firestoreData.users.find(u => u.email === email) ?? { email, notifyOn: ['status_change'] as any });
    if (subscriberUsers.length === 0) return;
    writeNotificationsForPlanEvent(plan, type, actorEmail, subscriberUsers as any, title, body);
  }, [firestoreData.users]);

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
    onStageNotify: handleStageNotify,
    onCommentNotify: useCallback((plan: Plan, actorEmail: string, actorName: string) => {
      if (!plan.subscribers?.length) return;
      const { title, body, type } = buildCommentNotif(plan, actorName);
      const subscriberUsers = (plan.subscribers || [])
        .filter(email => email !== actorEmail)
        .map(email => firestoreData.users.find(u => u.email === email) ?? { email, notifyOn: ['comment'] as any });
      if (subscriberUsers.length === 0) return;
      writeNotificationsForPlanEvent(plan, type, actorEmail, subscriberUsers as any, title, body);
    }, [firestoreData.users]),
  });
  const userManagement = useUserManagement(auth.role, uiState.setShowUserForm);
  const locManagement = useLOCManagement(planManagement.selectedPlanIds, firestoreData.plans, auth.currentUser, getUserLabel, td, uiState.setLoading, planManagement.setSelectedPlanIds);

  const value = {
    uiState,
    planManagement,
    tableState,
    auth,
    firestoreData,
    permissions,
    planActions,
    userManagement,
    locManagement
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};
