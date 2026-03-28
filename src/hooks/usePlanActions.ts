import { updatePlanStage, handleClearPlans, uploadTCPRevision, linkNewLOC, deleteDocument, updatePlanField as updatePlanFieldService, updatePlanFields as updatePlanFieldsService, deletePlan as deletePlanService, uploadStageAttachment as uploadStageAttachmentService, batchUploadStageAttachments as batchUploadStageAttachmentsService, renewLoc as renewLocService, convertPlanType as convertPlanTypeService, assignLocToTBD as assignLocToTBDService, deleteStageAttachment as deleteStageAttachmentService } from '../services/planService';
import { addLogEntry, deleteLogEntry, clearLog, handleClearLog } from '../services/logService';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Plan, Stage, User, UserRole, LoadingState, LogEntry, ReviewCycle, ImplementationWindow } from '../types';
import { showToast } from '../lib/toast';

interface UsePlanActionsParams {
  plans: Plan[];
  setPlans: React.Dispatch<React.SetStateAction<Plan[]>>;
  selectedPlan: Plan | null;
  setSelectedPlan: React.Dispatch<React.SetStateAction<Plan | null>>;
  draftPlan: Plan | null;
  setDraftPlan: React.Dispatch<React.SetStateAction<Plan | null>>;
  isDirty: boolean;
  setIsDirty: React.Dispatch<React.SetStateAction<boolean>>;
  td: string;
  getUserLabel: () => string;
  STAGES: Stage[];
  setLoading: React.Dispatch<React.SetStateAction<LoadingState>>;
  setClearLogConfirm: React.Dispatch<React.SetStateAction<any>>;
  setClearPlansConfirm: React.Dispatch<React.SetStateAction<boolean>>;
  setSelectedPlanIds: React.Dispatch<React.SetStateAction<string[]>>;
  currentUser: User | null;
  role: UserRole | null;
  _UserRole: typeof UserRole;
  onStageNotify?: (plan: Plan, newStage: string, stageLabel: string, actorEmail: string) => void;
  onCommentNotify?: (plan: Plan, actorEmail: string, actorName: string) => void;
}

export const usePlanActions = ({
  plans, setPlans,
  selectedPlan, setSelectedPlan,
  draftPlan, setDraftPlan,
  isDirty, setIsDirty,
  td, getUserLabel, STAGES, setLoading,
  setClearLogConfirm, setClearPlansConfirm, setSelectedPlanIds,
  currentUser, role, _UserRole, onStageNotify, onCommentNotify,
}: UsePlanActionsParams) => {
  // O(1) plan lookup — avoids repeated O(n) .find() across every action handler
  const plansById = new Map(plans.map(p => [p.id, p]));

  const updateStage = async (
    pid: string,
    ns: string,
    date: string = td,
    reviewCycles?: ReviewCycle[],
    implementationWindow?: ImplementationWindow | null
  ) => {
    if (role === _UserRole.SFTC) return;
    // Status changes always save immediately to Firestore (not buffered as drafts)
    const plan = plansById.get(pid) ?? draftPlan;
    if (!plan) return;
    await updatePlanStage(plan, ns, date, getUserLabel, () => {}, STAGES, selectedPlan, setSelectedPlan, false, draftPlan, setDraftPlan, setIsDirty, reviewCycles, implementationWindow, onStageNotify, currentUser?.email);
  };

  const handleDOTCommentsRec = async (pid: string) => {
    if (role === _UserRole.SFTC || role === _UserRole.GUEST) return;
    const currentDate = td;
    const plan = plansById.get(pid);
    if (!plan) return;

    const dotCommentsLogs = (plan.log || []).filter((l: LogEntry) => l.action.includes("DOT Comments Received"));
    const m = dotCommentsLogs.length;
    const newAction = m > 0 ? `  DOT Comments Received (Rev.${m})` : "  DOT Comments Received";

    const newLog = [...(plan.log || []), { date: currentDate, action: newAction, user: getUserLabel() }];

    try {
      const planRef = doc(db, 'plans', pid);
      await updateDoc(planRef, { log: newLog });
      if (selectedPlan?.id === pid) {
        setSelectedPlan({ ...plan, log: newLog });
      }
    } catch (e) {
      console.error("Error updating plan:", e);
      showToast("Failed to record DOT comments. Please try again.", "error");
    }
  };

  const pushTicket = async (pid: string, target: 'sftc' | 'engineering') => {
    if (role === _UserRole.SFTC || role === _UserRole.GUEST) return;
    const plan = plansById.get(pid);
    if (!plan) return;
    
    const newType = target === 'engineering' ? 'Engineered' : (plan.type === 'Engineered' ? 'Standard' : plan.type);
    const actionText = target === 'engineering' ? 'Pushed to Engineering Team' : 'Pushed to SFTC Drafting';
    
    try {
      const newLog = [...plan.log, { date: td, action: actionText, user: getUserLabel() }];
      const updateData = {
        ...plan,
        type: newType,
        stage: "drafting",
        log: newLog
      };
      await updateDoc(doc(db, 'plans', pid), updateData);
      if (selectedPlan?.id === pid) {
        setSelectedPlan({ ...plan, type: newType, stage: "drafting", log: newLog });
      }
    } catch (error) {
      console.error("Error pushing ticket:", error);
      showToast("Failed to push ticket. Please try again.", "error");
    }
  };

  const addLogEntryHandler = async (pid: string, entry: string, attachments?: File[], field?: string, previousValue?: any, newValue?: any) => {
    await addLogEntry(pid, entry, attachments, td, getUserLabel, field, previousValue, newValue);
    // Fire comment notification for real user-authored entries only
    if (!field && onCommentNotify && currentUser?.email) {
      const plan = plansById.get(pid);
      if (plan) onCommentNotify(plan, currentUser.email, currentUser.displayName || currentUser.name || currentUser.email);
    }
  };

const deleteLogEntryHandler = async (pid: string, logEntryIndex: string) => {
    const plan = plansById.get(pid) ?? selectedPlan;
    if (!plan) return;
    const idx = parseInt(logEntryIndex, 10);
    const updatedLog = (plan.log || []).filter((_: LogEntry, i: number) => i !== idx);
    await updateDoc(doc(db, 'plans', pid), { log: updatedLog });
    if (selectedPlan?.id === pid) {
      setSelectedPlan({ ...plan, log: updatedLog });
    }
  };

  const deleteDocumentHandler = async (pid: string, docId: string, type: 'tcp' | 'loc', plan: Plan, isDraft: boolean = true) => {
    const p = isDraft ? draftPlan : plan;
    await deleteDocument(pid, docId, type, p, setSelectedPlan, getUserLabel, td, isDraft, draftPlan, setDraftPlan, setIsDirty);
  };

  const deleteStageAttachmentHandler = async (pid: string, attachmentId: string, plan: Plan) => {
    await deleteStageAttachmentService(pid, attachmentId, plan, setSelectedPlan, getUserLabel, td);
  };

  const clearLogHandler = async (pid: string, isDraft: boolean) => {
    if (isDraft) {
      if (!draftPlan) return;
      const updatedDraft = { ...draftPlan, log: [] };
      setDraftPlan(updatedDraft);
      setSelectedPlan(updatedDraft);
      setIsDirty(true);
    } else {
      await clearLog(pid, td, getUserLabel);
      if (selectedPlan?.id === pid) {
        setSelectedPlan({ ...selectedPlan, log: [] });
      }
    }
  };

  const handleClearLogHandler = async (clearLogConfirm: { isOpen: boolean; type: 'global' | 'plan'; planId: string | null } | null) => {
    await handleClearLog(clearLogConfirm, plans, td, getUserLabel, setClearLogConfirm, setLoading);
  };

  const uploadTCPRevisionHandler = async (pid: string, file: File) => {
    const plan = plansById.get(pid);
    if (!plan) return;
    await uploadTCPRevision(pid, file, plan, getUserLabel, td, setSelectedPlan, currentUser);
  };

  const linkNewLOCHandler = async (pid: string, file: File) => {
    const plan = plansById.get(pid);
    if (!plan) return;
    await linkNewLOC(pid, file, plan, getUserLabel, td, setSelectedPlan, currentUser);
  };

  const handleClearPlansHandler = async () => {
    await handleClearPlans(plans, setPlans, setSelectedPlan, setSelectedPlanIds, setLoading, setClearPlansConfirm);
  };

  const updatePlanField = async (pid: string, field: string, value: string | number | boolean | null, isDraft: boolean = true) => {
    await updatePlanFieldService(pid, field, value, isDraft, selectedPlan, draftPlan, setDraftPlan, setSelectedPlan, setIsDirty, getUserLabel, td, currentUser, role, _UserRole);
  };

  const discardDraft = () => {
    const originalPlan = plansById.get(selectedPlan.id);
    setDraftPlan(originalPlan);
    setSelectedPlan(originalPlan);
    setIsDirty(false);
  };

  const handleClosePlanCard = () => {
    if (isDirty) {
      if (window.confirm("You have unsaved changes. Are you sure you want to discard them and close?")) {
        discardDraft();
        setSelectedPlan(null);
      }
    } else {
      setSelectedPlan(null);
    }
  };

  const saveDraft = async () => {
    if (!draftPlan) return;
    // Diff against the original DB version (plansById), NOT selectedPlan —
    // because updatePlanField sets both draftPlan and selectedPlan to the same
    // value, making a selectedPlan diff always return empty.
    const originalPlan = plansById.get(draftPlan.id);
    if (!originalPlan) return;

    const changes: Partial<Plan> = {};
    for (const key in draftPlan) {
      const dv = draftPlan[key as keyof Plan];
      const sv = originalPlan[key as keyof Plan];
      const changed =
        dv !== sv &&
        (typeof dv !== 'object' || typeof sv !== 'object'
          ? true
          : JSON.stringify(dv) !== JSON.stringify(sv));
      if (changed) (changes as any)[key] = dv;
    }

    await updatePlanFieldsService(draftPlan.id, changes, originalPlan, setSelectedPlan, getUserLabel, td);
    setIsDirty(false);
  };

  const updateLogEntry = async (pid: string, index: number, field: string, value: string | number | boolean | null, isDraft: boolean = true) => {
    const plan = plansById.get(pid);
    if (!plan) return;

    try {
      const currentPlan = isDraft ? draftPlan : plan;
      const newLog = [...currentPlan.log];
      newLog[index] = { ...newLog[index], [field]: value };
      const updateData = {
        ...currentPlan,
        log: newLog
      };
      
      if (isDraft) {
        setDraftPlan(updateData);
        setSelectedPlan(updateData);
        setIsDirty(true);
      } else {
        await updateDoc(doc(db, 'plans', pid), updateData);
        if (selectedPlan?.id === pid) {
          setSelectedPlan({ ...plan, log: newLog });
        }
      }
    } catch (error) {
      console.error("Error updating log entry:", error);
      showToast("Failed to update log entry. Please try again.", "error");
    }
  };

  const deletePlan = async (pid: string) => {
    if (!window.confirm(`Are you sure you want to permanently delete ${pid}? This cannot be undone.`)) return;
    await deletePlanService(pid, setSelectedPlan);
  };

  const renewLoc = async (pid: string): Promise<string | null> => {
    const plan = plansById.get(pid) ?? selectedPlan;
    if (!plan) return null;
    return renewLocService(plan, plans, td, getUserLabel, setSelectedPlan);
  };

  const convertPlanType = async (pid: string, newType: string): Promise<{ remappedStage: string | null }> => {
    const plan = plansById.get(pid) ?? selectedPlan;
    if (!plan) return { remappedStage: null };
    return convertPlanTypeService(pid, newType, plan, setSelectedPlan, td, getUserLabel);
  };

  const assignLocToTBD = async (pid: string, customLoc: string | null): Promise<string> => {
    const plan = plansById.get(pid) ?? selectedPlan;
    if (!plan) return '';
    return assignLocToTBDService(plan, customLoc, setSelectedPlan, td, getUserLabel);
  };

  const uploadStageAttachmentHandler = async (
    pid: string,
    file: File,
    stage: string,
    documentType: import('../types').StageAttachment['documentType'],
    isPrimary: boolean
  ) => {
    const plan = plansById.get(pid) ?? selectedPlan;
    if (!plan) return;
    await uploadStageAttachmentService(pid, file, stage, documentType, isPrimary, plan, getUserLabel, td, setSelectedPlan, currentUser);
  };

  const batchUploadStageAttachmentsHandler = async (
    pid: string,
    files: File[],
    stage: string,
    documentType: import('../types').StageAttachment['documentType']
  ) => {
    const plan = plansById.get(pid) ?? selectedPlan;
    if (!plan) return;
    await batchUploadStageAttachmentsService(pid, files, stage, documentType, plan, currentUser, setSelectedPlan);
  };

  return {
    updateStage,
    handleDOTCommentsRec,
    pushTicket,
    deletePlan,
    addLogEntry: addLogEntryHandler,

    deleteLogEntry: deleteLogEntryHandler,
    deleteDocument: deleteDocumentHandler,
    deleteStageAttachment: deleteStageAttachmentHandler,
    clearLog: clearLogHandler,
    uploadTCPRevision: uploadTCPRevisionHandler,
    linkNewLOC: linkNewLOCHandler,
    handleClearLog: handleClearLogHandler,
    handleClearPlans: handleClearPlansHandler,
    updatePlanField,
    discardDraft,
    handleClosePlanCard,
    saveDraft,
    updateLogEntry,
    uploadStageAttachment: uploadStageAttachmentHandler,
    batchUploadStageAttachments: batchUploadStageAttachmentsHandler,
    renewLoc,
    convertPlanType,
    assignLocToTBD,
  };
};
