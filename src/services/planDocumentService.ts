import { doc, updateDoc } from 'firebase/firestore';
import { db, storage, handleFirestoreError, OperationType } from '../firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Plan, PlanDocument, User } from '../types';

/** Upload a document attached to a specific stage transition. */
export const uploadStageAttachment = async (
  pid: string,
  file: File,
  stage: string,
  documentType: import('../types').StageAttachment['documentType'],
  isPrimary: boolean,
  plan: Plan,
  getUserLabel: () => string,
  td: string,
  setSelectedPlan: (plan: Plan | null) => void,
  currentUser: User | null
) => {
  try {
    const fileRef = ref(storage, `plans/${pid}/stage_attachments/${stage}/${Date.now()}_${file.name}`);
    await uploadBytes(fileRef, file);
    const url = await getDownloadURL(fileRef);

    const newAttachment: import('../types').StageAttachment = {
      id: Date.now().toString(),
      name: file.name,
      url,
      uploadedAt: new Date().toISOString(),
      uploadedBy: currentUser?.name || currentUser?.email || 'Unknown',
      stage,
      documentType,
      isPrimary,
    };

    const existingAttachments = plan.stageAttachments || [];
    // If this is marked as primary (signed LOC), demote any existing primary for this stage
    const updatedAttachments = isPrimary
      ? existingAttachments.map(a => a.stage === stage && a.isPrimary ? { ...a, isPrimary: false } : a)
      : [...existingAttachments];
    updatedAttachments.push(newAttachment);

    const updateData: Partial<Plan> = {
      stageAttachments: updatedAttachments,
      log: [
        ...(plan.log || []),
        {
          uniqueId: Date.now().toString(),
          date: td,
          action: `Attached document: ${file.name} (${stage})${isPrimary ? ' — Primary' : ''}`,
          user: getUserLabel(),
        },
      ],
    };

    await updateDoc(doc(db, 'plans', pid), updateData);
    setSelectedPlan({ ...plan, ...updateData } as Plan);
    return newAttachment;
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `plans/${pid}`);
    throw error;
  }
};

/** Delete a single stage attachment by id. */
export const deleteStageAttachment = async (
  pid: string,
  attachmentId: string,
  plan: Plan,
  setSelectedPlan: (plan: Plan | null) => void,
  getUserLabel: () => string,
  td: string
) => {
  const updated = (plan.stageAttachments || []).filter(a => a.id !== attachmentId);
  const removed = (plan.stageAttachments || []).find(a => a.id === attachmentId);
  const updateData: Partial<Plan> = {
    stageAttachments: updated,
    log: [
      ...(plan.log || []),
      {
        uniqueId: Date.now().toString(),
        date: td,
        action: `Deleted submission document: ${removed?.name ?? attachmentId}`,
        user: getUserLabel(),
      },
    ],
  };
  await updateDoc(doc(db, 'plans', pid), updateData);
  setSelectedPlan({ ...plan, ...updateData } as Plan);
};

/**
 * Upload multiple files for a single stage transition in one Firestore write.
 * Automatically promotes TCP drawings to approvedTCPs and LOC files to approvedLOCs.
 */
export const batchUploadStageAttachments = async (
  pid: string,
  files: File[],
  stage: string,
  documentType: import('../types').StageAttachment['documentType'],
  plan: Plan,
  currentUser: User | null,
  setSelectedPlan: (plan: Plan | null) => void
): Promise<void> => {
  try {
    const uploads = await Promise.all(
      files.map(async (file) => {
        const fileRef = ref(storage, `plans/${pid}/stage_attachments/${stage}/${Date.now()}_${file.name}`);
        await uploadBytes(fileRef, file);
        const url = await getDownloadURL(fileRef);
        return {
          id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
          name: file.name,
          url,
          uploadedAt: new Date().toISOString(),
          uploadedBy: currentUser?.name || currentUser?.email || 'Unknown',
          stage,
          documentType,
          isPrimary: false,
        } as import('../types').StageAttachment;
      })
    );
    const updatedAttachments = [...(plan.stageAttachments || []), ...uploads];

    // Auto-promote to Approved Documents based on document type
    const extraUpdates: Partial<Plan> = {};

    const tcpUploads = uploads.filter(u => u.documentType === 'tcp_drawings');
    if (tcpUploads.length > 0) {
      const existingTCPs = plan.approvedTCPs || [];
      const newTCPs = tcpUploads.map((u, i) => ({
        id: u.id,
        name: u.name,
        url: u.url,
        version: existingTCPs.length + i + 1,
        uploadedAt: u.uploadedAt,
        uploadedBy: u.uploadedBy,
      }));
      extraUpdates.approvedTCPs = [...existingTCPs, ...newTCPs];
      extraUpdates.currentTCP = tcpUploads[tcpUploads.length - 1].name;
      extraUpdates.tcpRev = (plan.tcpRev || 0) + tcpUploads.length;
    }

    const locUploads = uploads.filter(u => u.documentType === 'loc_signed');
    if (locUploads.length > 0) {
      const existingLOCs = plan.approvedLOCs || [];
      const newLOCs = locUploads.map((u, i) => ({
        id: u.id,
        name: u.name,
        url: u.url,
        version: existingLOCs.length + i + 1,
        uploadedAt: u.uploadedAt,
        uploadedBy: u.uploadedBy,
      }));
      extraUpdates.approvedLOCs = [...existingLOCs, ...newLOCs];
      extraUpdates.currentLOC = locUploads[locUploads.length - 1].name;
      extraUpdates.locRev = (plan.locRev || 0) + locUploads.length;
    }

    // Clear pending documents flag when a LOC (primary binding doc) is now present
    const finalLOCs = extraUpdates.approvedLOCs ?? plan.approvedLOCs ?? [];
    if (plan.pendingDocuments && finalLOCs.length > 0) {
      extraUpdates.pendingDocuments = false;
    }

    const updatePayload = { stageAttachments: updatedAttachments, ...extraUpdates };
    await updateDoc(doc(db, 'plans', pid), updatePayload);
    setSelectedPlan({ ...plan, ...updatePayload } as Plan);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `plans/${pid}`);
    throw error;
  }
};

/** Upload a new TCP revision file and add it to the plan's approved TCPs. */
export const uploadTCPRevision = async (
  pid: string,
  file: File,
  plan: Plan,
  getUserLabel: () => string,
  td: string,
  setSelectedPlan: (plan: Plan | null) => void,
  currentUser: User | null
) => {
  try {
    const fileRef = ref(storage, `plans/${pid}/tcps/${Date.now()}_${file.name}`);
    await uploadBytes(fileRef, file);
    const url = await getDownloadURL(fileRef);

    const version = (plan.tcpRev || 0) + 1;
    const newTCP = {
      id: `${Date.now()}`,
      name: file.name,
      url,
      version,
      uploadedAt: new Date().toISOString(),
      uploadedBy: currentUser?.email || "Unknown"
    };

    const newTCPs = [...(plan.approvedTCPs || []), newTCP];
    const finalLOCs = plan.approvedLOCs || [];
    const updateData = {
      ...plan,
      approvedTCPs: newTCPs,
      currentTCP: file.name,
      tcpRev: version,
      ...(plan.pendingDocuments && finalLOCs.length > 0 ? { pendingDocuments: false } : {}),
      log: [...(plan.log || []), { date: td, action: `Uploaded TCP Revision: ${file.name.replace(/^\d+_/, '')}`, user: getUserLabel() }]
    };

    await updateDoc(doc(db, 'plans', pid), updateData);
    setSelectedPlan({ ...plan, ...updateData } as Plan);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `plans/${pid}`);
    throw error;
  }
};

/** Delete a TCP or LOC document from a plan. Supports draft mode. */
export const deleteDocument = async (
  pid: string,
  docId: string,
  type: 'tcp' | 'loc',
  plan: Plan,
  setSelectedPlan: (plan: Plan | null) => void,
  getUserLabel: () => string,
  td: string,
  isDraft: boolean = true,
  draftPlan: Plan | null = null,
  setDraftPlan: (plan: Plan | null) => void = () => {},
  setIsDirty: (dirty: boolean) => void = () => {}
) => {
  try {
    const docListKey = type === 'tcp' ? 'approvedTCPs' : 'approvedLOCs';
    const currentDocKey = type === 'tcp' ? 'currentTCP' : 'currentLOC';
    const revKey = type === 'tcp' ? 'tcpRev' : 'locRev';

    const docs = plan[docListKey] || [];
    const docToDelete = docs.find((d: PlanDocument) => d.id === docId);
    if (!docToDelete) return;

    const newDocs = docs.filter((d: PlanDocument) => d.id !== docId);

    const updateData: Partial<Plan> = {
      ...plan,
      [docListKey]: newDocs,
      log: [...(plan.log || []), { date: td, action: `Deleted ${type.toUpperCase()}: ${docToDelete.name}`, user: getUserLabel() }]
    };

    if (plan[currentDocKey] === docToDelete.name) {
      updateData[currentDocKey] = newDocs.length > 0 ? newDocs[newDocs.length - 1].name : null;
      updateData[revKey] = newDocs.length > 0 ? newDocs[newDocs.length - 1].version : 0;
    }

    if (isDraft) {
      setDraftPlan(updateData as Plan);
      setSelectedPlan(updateData as Plan);
      setIsDirty(true);
    } else {
      await updateDoc(doc(db, 'plans', pid), updateData);
      setSelectedPlan({ ...plan, ...updateData } as Plan);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `plans/${pid}`);
    throw error;
  }
};

