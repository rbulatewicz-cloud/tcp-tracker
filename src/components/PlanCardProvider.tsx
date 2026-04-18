import React, { ReactNode } from 'react';
import { PlanCardContext } from './PlanCardContextDef';
import { Plan, UserRole, User, NoiseVariance, PDFExportOptions } from '../types';

export interface PlanData {
  selectedPlan: Plan;
  draftPlan: Plan;
  isDirty: boolean;
  loading: any;
  statusDate: string;
  dotCourtTime: number | null;
  overallDuration: number | null;
}

export interface PlanActions {
  handleClosePlanCard: () => void;
  deletePlan: (pid: string, deletionReason?: string) => Promise<void>;
  updatePlanField: (pid: string, field: string, value: any, isDraft?: boolean) => void;
  saveDraft: () => void;
  discardDraft: () => void;
  updateStage: (pid: string, ns: string, date: string, reviewCycles?: import('../types').ReviewCycle[], implementationWindow?: import('../types').ImplementationWindow | null) => Promise<void>;
  handleDOTCommentsRec: (pid: string) => void;
  handleExportPlanToPDF: (plan: Plan, options?: PDFExportOptions) => void;
  setStatusDate: (date: string) => void;
  addLogEntry: (pid: string, entry: string, attachments?: File[], field?: string, previousValue?: any, newValue?: any) => Promise<void>;
  deleteLogEntry: (pid: string, logEntryUniqueId: string) => void;
  deleteDocument: (pid: string, docId: string, type: 'tcp' | 'loc', plan: any, isDraft?: boolean) => void;
  clearLog: (pid: string, plan: any, setSelectedPlan: (plan: any) => void, getUserLabel: () => string, td: string, isDraft?: boolean) => void;
  uploadTCPRevision: (pid: string, file: File) => void;
  linkNewLOC: (pid: string, file: File) => void;
  uploadStageAttachment: (pid: string, file: File, stage: string, documentType: import('../types').StageAttachment['documentType'], isPrimary: boolean) => Promise<void>;
  batchUploadStageAttachments: (pid: string, files: File[], stage: string, documentType: import('../types').StageAttachment['documentType']) => Promise<void>;
  renewLoc: (pid: string) => Promise<string | null>;
  convertPlanType: (pid: string, newType: string) => Promise<{ remappedStage: string | null }>;
  assignLocToTBD: (pid: string, customLoc: string | null) => Promise<string>;
  deleteStageAttachment: (pid: string, attachmentId: string, plan: any) => Promise<void>;
}

export interface PlanPermissions {
  canView: (field: string) => boolean;
  currentUser: User | null;
  UserRole: typeof UserRole;
  isPermissionEditingMode: boolean;
  fieldPermissions: any;
  setFieldPermissions: React.Dispatch<React.SetStateAction<any>>;
  toggleSectionPermission: (keys: string[], role: string, type: 'edit' | 'view') => void;
  canEditPlan: boolean;
  canEditFields: boolean;
}

export interface PlanUtils {
  STAGES: any[];
  font: string;
  monoFont: string;
  IMPACT_SECTION_KEYS: string[];
  IMPACT_FIELDS: any[];
  getLocalDateString: () => string;
  getStageDurations: (plan: Plan, stages: any[], getLocalDateString: () => string) => any[];
  daysBetween: (start: string, end: string) => number;
  libraryVariances: NoiseVariance[];
}

export interface PlanCardContextType {
  data: PlanData;
  actions: PlanActions;
  permissions: PlanPermissions;
  utils: PlanUtils;
}

export const PlanCardProvider: React.FC<{ 
  value: PlanCardContextType; 
  children: ReactNode 
}> = ({ value, children }) => {
  return <PlanCardContext.Provider value={value}>{children}</PlanCardContext.Provider>;
};

