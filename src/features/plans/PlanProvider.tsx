import React, { ReactNode, useMemo, useCallback } from 'react';
import { useApp } from '../../hooks/useApp';
import { PlanContext } from './PlanContext';
import { usePlanManagement } from '../../hooks/usePlanManagement';
import { usePlanActions } from '../../hooks/usePlanActions';
import { usePlanExport } from '../../hooks/usePlanExport';
import { STAGES } from '../../constants';
import { UserRole, Plan } from '../../types';
import { writeNotificationsForPlanEvent, buildStatusChangeNotif, buildCommentNotif } from '../../services/notificationService';

export const PlanProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { auth, firestoreData, uiState, planManagement } = useApp();

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

  const handleCommentNotify = useCallback((plan: Plan, actorEmail: string, actorName: string) => {
    if (!plan.subscribers?.length) return;
    const { title, body, type } = buildCommentNotif(plan, actorName);
    const subscriberUsers = (plan.subscribers || [])
      .filter(email => email !== actorEmail)
      .map(email => firestoreData.users.find(u => u.email === email) ?? { email, notifyOn: ['comment'] as any });
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
    onCommentNotify: handleCommentNotify,
  });

  const planExport = usePlanExport(uiState.setLoading, () => auth.currentUser ? `${auth.currentUser.name} (${auth.currentUser.role})` : "Guest", firestoreData.reportTemplate);

  return (
    <PlanContext.Provider value={{ planManagement, planActions, planExport }}>
      {children}
    </PlanContext.Provider>
  );
};
