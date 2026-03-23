import { doc, updateDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { db, storage, handleFirestoreError, OperationType } from '../firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Plan, Stage, LogEntry, PlanDocument, User, UserRole, LoadingState } from '../types';
import { FIELD_REGISTRY } from '../constants';
import { showToast } from '../lib/toast';

export const updatePlanStage = async (
  plan: Plan,
  ns: string,
  date: string,
  getUserLabel: () => string,
  setStatusDate: (date: string) => void,
  STAGES: Stage[],
  selectedPlan: Plan | null,
  setSelectedPlan: (plan: Plan | null) => void,
  isDraft: boolean = true,
  draftPlan: Plan | null = null,
  setDraftPlan: (plan: Plan | null) => void = () => {},
  setIsDirty: (dirty: boolean) => void = () => {}
) => {
  try {
    // Pre-build O(1) lookup maps — avoids O(n) find/findIndex inside loops
    const stageKeyToIndex = new Map(STAGES.map((s, i) => [s.key, i]));
    const stageLabelToIndex = new Map(STAGES.map((s, i) => [s.label, i]));

    const newStageIndex = stageKeyToIndex.get(ns) ?? -1;
    const currentStageIndex = stageKeyToIndex.get(plan.stage) ?? -1;
    const sl = STAGES[newStageIndex]?.label || ns;
    const isRewind = newStageIndex < currentStageIndex;

    // Keep full log history
    let newLog = [...(plan.log || [])];
    let newStatusHistory = (plan.statusHistory || []).filter((entry: LogEntry) => {
      const stageLabel = entry.action.replace("Status → ", "");
      const stageIndex = stageLabelToIndex.get(stageLabel);
      return stageIndex === undefined || stageIndex <= newStageIndex;
    });

    if (!isRewind) {
      const previousStage = plan.stage;
      const uniqueId = Date.now().toString();
      const newStageEntry = { 
        uniqueId,
        date: date, 
        action: `Status → ${sl}`, 
        user: getUserLabel(),
        field: 'stage',
        previousValue: previousStage,
        newValue: ns
      };
      newLog.push(newStageEntry);
      newStatusHistory.push({ ...newStageEntry, uniqueId });
    }
    
    setStatusDate(date);
    
    const updateData: Partial<Plan> & { stage: string; log: LogEntry[] } = {
      ...plan,
      stage: ns,
      log: newLog,
      statusHistory: newStatusHistory
    };
    if (ns === 'requested') updateData.dateRequested = date;
    if (ns === 'submitted') updateData.submitDate = date;
    if (ns === 'approved') updateData.approvedDate = date;
    
    if (newStageIndex < 0) {
      updateData.dateRequested = null;
      updateData.submitDate = null;
      updateData.approvedDate = null;
    } else if (newStageIndex < 1) {
      updateData.submitDate = null;
      updateData.approvedDate = null;
    } else if (newStageIndex < 2) {
      updateData.approvedDate = null;
    }

    if (isDraft) {
      setDraftPlan(updateData as Plan);
      setSelectedPlan(updateData as Plan);
      setIsDirty(true);
    } else {
      await updateDoc(doc(db, 'plans', plan.id), updateData);
      if (selectedPlan?.id === plan.id) {
        setSelectedPlan({ ...plan, ...updateData } as Plan);
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `plans/${plan.id}`);
  }
};

export const submitPlan = async (
  form: Partial<Plan> & { attachments: File[] },
  plans: Plan[],
  td: string,
  getUserLabel: () => string
) => {
  // Validate ID format and uniqueness
  const idRegex = /^SFTC-\d{4}$/;
  if (!idRegex.test(form.id)) {
    throw new Error("Invalid Plan ID format. Must be SFTC-xxxx (e.g. SFTC-0001)");
  }
  if (plans.some(p => p.id === form.id)) {
    throw new Error("Plan ID already exists. Please use a unique ID.");
  }

  const existingRequested = plans.filter(p => p.stage === "requested");
  const queuePos = form.isCriticalPath 
    ? (existingRequested.filter(p => p.isCriticalPath).length + 1) 
    : (existingRequested.length + 1);
  const id = form.id;

  try {
    const uploadedAttachments = await Promise.all(
      form.attachments.map(async (file: File) => {
        const fileRef = ref(storage, `plans/${id}/${Date.now()}_${file.name}`);
        
        // Add a timeout to the upload
        const uploadPromise = uploadBytes(fileRef, file);
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error("Upload timed out. Firebase Storage might not be initialized.")), 15000)
        );
        
        await Promise.race([uploadPromise, timeoutPromise]);
        const url = await getDownloadURL(fileRef);
        return { name: file.name, data: url };
      })
    );

    const np = {
      ...form, 
      attachments: uploadedAttachments,
      id,
      stage: "requested", 
      requestDate: td, 
      dateRequested: td,
      log: [
        { uniqueId: Date.now().toString(), date: td, action: "New request submitted", user: getUserLabel(), dateRequested: td },
        ...(form.isCriticalPath ? [{ uniqueId: (Date.now() + 1).toString(), date: td, action: "Submitted as Critical Path Item", user: getUserLabel() }] : [])
      ]
    }; 
    await setDoc(doc(db, 'plans', id), np as Plan);
    return { queuePos, id };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `plans/${id}`);
    throw error;
  }
};

export const deletePlan = async (
  pid: string,
  setSelectedPlan: (plan: Plan | null) => void
) => {
  try {
    await deleteDoc(doc(db, 'plans', pid));
    setSelectedPlan(null);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `plans/${pid}`);
    throw error;
  }
};

export const updatePlanField = async (
  pid: string,
  field: string,
  value: string | number | boolean | null,
  isDraft: boolean,
  plan: Plan | null,
  draftPlan: Plan | null,
  setDraftPlan: (plan: Plan | null) => void,
  setSelectedPlan: (plan: Plan | null) => void,
  setIsDirty: (dirty: boolean) => void,
  getUserLabel: () => string,
  td: string,
  currentUser: User | null,
  role: UserRole | null,
  _UserRole: typeof UserRole
) => {
  if (field === "lead" && currentUser?.role !== _UserRole.MOT && currentUser?.role !== _UserRole.ADMIN) {
    showToast("Only MOT team can assign leads.", "error");
    return;
  }
  const currentPlan = isDraft ? draftPlan : plan;
  if (!currentPlan) return;

  try {
    const updateData: any = { 
      ...currentPlan,
      [field]: value 
    };

    const fieldsToLog = ["rev", "loc", "dateRequested", "isCriticalPath", "submitDate", "approvedDate", "needByDate", "type"];
    if (fieldsToLog.includes(field)) {
      let action = "";
      let logToRemove: string[] = [];
      if (field === "rev") action = `Updated Revision to ${value}`;
      else if (field === "type") {
        action = `Updated Plan Type to ${value}`;
        logToRemove = ["Updated Plan Type to"];
      }
      else if (field === "loc") {
        action = `Updated LOC to ${value}`;
        logToRemove = ["Updated LOC to"];
      }
      if (field === "dateRequested") {
        action = value ? `Updated Requested Date to ${value}` : "Cleared Requested Date";
        logToRemove = ["Updated Requested Date to", "New request submitted"];
      }
      else if (field === "isCriticalPath") action = value ? "Marked as Critical Path" : "Unmarked as Critical Path";
      else if (field === "submitDate") {
        action = value ? `Updated Submitted Date to ${value}` : "Cleared Submitted Date";
        logToRemove = ["Updated Submitted Date to", "Submitted to DOT (Imported)"];
      }
      else if (field === "approvedDate") {
        action = value ? `Updated Approved Date to ${value}` : "Cleared Approved Date";
        logToRemove = ["Updated Approved Date to"];
      }
      else if (field === "needByDate") {
        action = value ? `Updated Need By Date to ${value}` : "Cleared Need By Date";
        logToRemove = ["Updated Need By Date to"];
      }
      
      let newLog = [...(currentPlan.log || [])];
      if (!value && logToRemove.length > 0) {
        newLog = newLog.filter(entry => !logToRemove.some(prefix => entry.action.startsWith(prefix)));
      } else if (logToRemove.length > 0) {
        newLog = newLog.filter(entry => !logToRemove.some(prefix => entry.action.startsWith(prefix)));
      }
      
      const previousValue = currentPlan[field];
      const newValue = value;
      
      const newLogEntry = { 
        uniqueId: Date.now().toString(),
        date: td, 
        action, 
        user: getUserLabel(),
        field,
        previousValue,
        newValue
      };
      newLog.push(newLogEntry);
      updateData.log = newLog;
    }

    if (isDraft) {
      setDraftPlan(updateData as Plan);
      setSelectedPlan(updateData as Plan);
      setIsDirty(true);
    } else {
      await updateDoc(doc(db, 'plans', pid), updateData);
      setSelectedPlan({ ...currentPlan, ...updateData } as Plan);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `plans/${pid}`);
    throw error;
  }
};

export const updatePlanFields = async (
  pid: string,
  updates: Partial<Plan>,
  plan: Plan,
  setSelectedPlan: (plan: Plan | null) => void,
  getUserLabel: () => string,
  td: string
) => {
  try {
    const updateData: any = { 
      ...plan,
      ...updates 
    };

    const fieldsToLog = [...Object.keys(FIELD_REGISTRY), "rev", "isCriticalPath"];
    let newLog = [...(plan.log || [])];
    
    for (const [field, value] of Object.entries(updates)) {
      if (fieldsToLog.includes(field)) {
        const fieldConfig = FIELD_REGISTRY[field];
        const label = fieldConfig ? fieldConfig.label : field;
        
        let action = "";
        let logToRemove: string[] = [];

        // Special handling for specific fields
        if (field === "rev") {
            action = `Updated Revision to ${value}`;
        } else if (field === "isCriticalPath") {
            action = value ? "Marked as Critical Path" : "Unmarked as Critical Path";
        } else if (fieldConfig?.type === 'checkbox') {
            action = value ? `Marked ${label}` : `Unmarked ${label}`;
        } else if (["dateRequested", "submitDate", "approvedDate", "needByDate"].includes(field)) {
            action = value ? `Updated ${label} to ${value}` : `Cleared ${label}`;
            logToRemove = [`Updated ${label} to`];
            if (field === "submitDate") logToRemove.push("Submitted to DOT (Imported)");
        } else {
            action = `Updated ${label} to ${value}`;
            logToRemove = [`Updated ${label} to`];
        }
        
        // Remove old log entries for the same field if needed
        if (logToRemove.length > 0) {
            newLog = newLog.filter(entry => !logToRemove.some(prefix => entry.action.startsWith(prefix)));
        }
        
        const newLogEntry = { 
          uniqueId: Date.now().toString(),
          date: td, 
          action, 
          user: getUserLabel(),
          field,
          previousValue: plan[field],
          newValue: value
        };
        newLog.push(newLogEntry);
      }
    }
    
    updateData.log = newLog;

    await updateDoc(doc(db, 'plans', pid), updateData);
    setSelectedPlan({ ...plan, ...updateData } as Plan);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `plans/${pid}`);
    throw error;
  }
};

export const bulkUpdate = async (
  selectedPlanIds: string[],
  plans: Plan[],
  updates: Partial<Plan>,
  date: string | null,
  currentUser: User | null,
  _UserRole: typeof UserRole,
  setLoading: (loading: (prev: LoadingState) => LoadingState) => void,
  setSelectedPlanIds: (ids: string[]) => void,
  getUserLabel: () => string,
  td: string
) => {
  if (selectedPlanIds.length === 0) return;
  if (updates.lead && currentUser?.role !== _UserRole.MOT && currentUser?.role !== _UserRole.ADMIN) {
    showToast("Only MOT team can assign leads.", "error");
    return;
  }
  setLoading(prev => ({ ...prev, bulk: true }));

  try {
    const plansById = new Map(plans.map(p => [p.id, p]));
    for (const id of selectedPlanIds) {
      const plan = plansById.get(id);
      if (plan) {
        const updateData = { ...plan, ...updates };
        if (updates.stage) {
          if (updates.stage === 'submitted') updateData.submitDate = date;
          else if (updates.stage === 'approved') updateData.approvedDate = date;
          else if (updates.stage === 'requested') updateData.dateRequested = date;
          
          if (updates.stage !== 'approved') updateData.approvedDate = null;
        }

        const logEntry = Object.entries(updates).map(([k, v]) => `${k} → ${v}`).join(", ");
        const newLog = [...plan.log, { date: date || td, action: `Bulk Update: ${logEntry}${date ? ` (Date: ${date})` : ''}`, user: getUserLabel() }];
        updateData.log = newLog;

        await updateDoc(doc(db, 'plans', id), updateData);
      }
    }
    setSelectedPlanIds([]);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `plans`);
    throw error;
  } finally {
    setLoading(prev => ({ ...prev, bulk: false }));
  }
};

export const handleBulkLOCUpload = async (
  bulkLOCFile: File | null,
  selectedPlanIds: string[],
  plans: Plan[],
  currentUser: User | null,
  getUserLabel: () => string,
  td: string,
  setLoading: (loading: (prev: LoadingState) => LoadingState) => void,
  setBulkLOCProgress: (progress: number) => void,
  setShowBulkLOCModal: (show: boolean) => void,
  setBulkLOCFile: (file: File | null) => void,
  setSelectedPlanIds: (ids: string[]) => void
) => {
  if (!bulkLOCFile || selectedPlanIds.length === 0) {
    console.warn("Bulk upload aborted: No file or no plans selected.", { file: !!bulkLOCFile, count: selectedPlanIds.length });
    return;
  }
  setLoading(prev => ({ ...prev, bulk: true }));
  setBulkLOCProgress(0);

  try {
    // 1. Upload file once
    const fileRef = ref(storage, `bulk_locs/${Date.now()}_${bulkLOCFile.name}`);
    await uploadBytes(fileRef, bulkLOCFile);
    const url = await getDownloadURL(fileRef);

    // 2. Create a new LOC document linked to all selected plans
    const locNumber = `BULK-${Date.now()}`;
    const locData = {
      locNumber,
      revision: 1,
      startDate: td, // Default to today
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // Default 30 days
      planIds: selectedPlanIds,
      notes: `Bulk upload for ${selectedPlanIds.length} plans.`,
      fileUrl: url,
      fileName: bulkLOCFile.name,
      uploadedBy: currentUser?.email || "Unknown",
      uploadedAt: new Date().toISOString()
    };

    await setDoc(doc(db, "locs", locNumber), locData);

    // 3. Update each selected plan's log
    const plansById = new Map(plans.map(p => [p.id, p]));
    let completed = 0;
    for (const pid of selectedPlanIds) {
      const plan = plansById.get(pid);
      if (plan) {
        const newLog = [...(plan.log || []), { 
          date: td, 
          action: `Bulk LOC Linked: ${bulkLOCFile.name} (${locNumber})`, 
          user: getUserLabel() 
        }];

        const updateData = {
          ...plan,
          log: newLog
        };
        await updateDoc(doc(db, 'plans', pid), updateData);
      }
      completed++;
      setBulkLOCProgress(Math.round((completed / selectedPlanIds.length) * 100));
    }

    showToast(`Successfully linked LOC to ${selectedPlanIds.length} plans.`, "success");
    setShowBulkLOCModal(false);
    setBulkLOCFile(null);
    setSelectedPlanIds([]);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `plans`);
    showToast("Failed to upload bulk LOC. Check console for details.", "error");
  } finally {
    setLoading(prev => ({ ...prev, bulk: false }));
  }
};

export const handleClearPlans = async (
  plans: Plan[],
  setPlans: (plans: Plan[]) => void,
  setSelectedPlan: (plan: Plan | null) => void,
  setSelectedPlanIds: (ids: string[]) => void,
  setLoading: (loading: (prev: LoadingState) => LoadingState) => void,
  setClearPlansConfirm: (confirm: boolean) => void
) => {
  try {
    setLoading(prev => ({ ...prev, bulk: true }));
    for (const p of plans) {
      await deleteDoc(doc(db, 'plans', p.id));
    }
    setPlans([]);
    setSelectedPlan(null);
    setSelectedPlanIds([]);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `plans`);
    throw error;
  } finally {
    setLoading(prev => ({ ...prev, bulk: false }));
    setClearPlansConfirm(false);
  }
};

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
    const updateData = {
      ...plan,
      approvedTCPs: newTCPs,
      currentTCP: file.name,
      tcpRev: version,
      log: [...(plan.log || []), { date: td, action: `Uploaded TCP Revision: ${file.name}`, user: getUserLabel() }]
    };

    await updateDoc(doc(db, 'plans', pid), updateData);
    setSelectedPlan({ ...plan, ...updateData } as Plan);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `plans/${pid}`);
    throw error;
  }
};

export const linkNewLOC = async (
  pid: string,
  file: File,
  plan: Plan,
  getUserLabel: () => string,
  td: string,
  setSelectedPlan: (plan: Plan | null) => void,
  currentUser: User | null
) => {
  try {
    const fileRef = ref(storage, `plans/${pid}/locs/${Date.now()}_${file.name}`);
    await uploadBytes(fileRef, file);
    const url = await getDownloadURL(fileRef);

    const version = (plan.locRev || 0) + 1;
    const newLOC = {
      id: `${Date.now()}`,
      name: file.name,
      url,
      version,
      uploadedAt: new Date().toISOString(),
      uploadedBy: currentUser?.email || "Unknown"
    };

    const newLOCs = [...(plan.approvedLOCs || []), newLOC];
    const updateData = {
      ...plan,
      approvedLOCs: newLOCs,
      currentLOC: file.name,
      locRev: version,
      log: [...(plan.log || []), { date: td, action: `Linked New LOC: ${file.name}`, user: getUserLabel() }]
    };

    await updateDoc(doc(db, 'plans', pid), updateData);
    setSelectedPlan({ ...plan, ...updateData } as Plan);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `plans/${pid}`);
    throw error;
  }
};

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


