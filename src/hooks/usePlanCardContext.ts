import React from 'react';
import { PlanCardContextType } from '../components/PlanCardProvider';
import { STAGES, FONT as font, MONO_FONT as monoFont, IMPACT_SECTION_KEYS, IMPACT_FIELDS } from '../constants';
import { getLocalDateString, getStageDurations, daysBetween } from '../utils/plans';
import { UserRole } from '../types';

export const usePlanCardContext = (
  planManagement: any,
  planActions: any,
  permissions: any,
  auth: any,
  firestoreData: any,
  statusDate: string,
  setStatusDate: React.Dispatch<React.SetStateAction<string>>,
  isPermissionEditingMode: boolean = false
): PlanCardContextType => {
  const { selectedPlan, isDirty, draftPlan } = planManagement;
  const { handleClosePlanCard, updatePlanField, saveDraft, discardDraft, updateStage, handleDOTCommentsRec, addLogEntry, revertLogEntry, deleteLogEntry, deleteDocument, clearLog, uploadTCPRevision, linkNewLOC, deletePlan } = planActions;

  return React.useMemo(() => ({
    data: {
      selectedPlan,
      draftPlan,
      isDirty,
      loading: false,
      statusDate,
      dotCourtTime: null,
      overallDuration: null
    },
    actions: {
      handleClosePlanCard,
      deletePlan,
      updatePlanField,
      saveDraft,
      discardDraft,
      updateStage,
      handleDOTCommentsRec,
      handleExportPlanToPDF: (plan: any) => import('../services/pdfService').then(service => service.exportPlanToPDF(plan, firestoreData.reportTemplate, STAGES, () => {}, () => "")),
      setStatusDate,
      addLogEntry,
      revertLogEntry,
      deleteLogEntry,
      deleteDocument,
      clearLog,
      uploadTCPRevision,
      linkNewLOC
    },
    permissions: {
      ...permissions,
      isPermissionEditingMode,
      currentUser: auth.currentUser,
      UserRole: UserRole,
      canEditPlan: auth.role !== UserRole.GUEST,
      canView: permissions.canView || (() => true),
      fieldPermissions: permissions.fieldPermissions || {},
      setFieldPermissions: permissions.setFieldPermissions || (() => {}),
      toggleSectionPermission: permissions.toggleSectionPermission || (() => {})
    },
    utils: {
      STAGES,
      font,
      monoFont,
      IMPACT_SECTION_KEYS,
      IMPACT_FIELDS,
      getLocalDateString,
      getStageDurations,
      daysBetween
    }
  }), [
    selectedPlan, isDirty, statusDate, handleClosePlanCard, deletePlan, updatePlanField, saveDraft, discardDraft, updateStage,
    handleDOTCommentsRec, setStatusDate, addLogEntry, revertLogEntry, deleteLogEntry, deleteDocument, clearLog, uploadTCPRevision,
    linkNewLOC, permissions, auth.currentUser, auth.role, firestoreData.reportTemplate, isPermissionEditingMode
  ]);
};
