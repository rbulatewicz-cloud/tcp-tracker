import { doc, updateDoc, setDoc, deleteDoc, getDoc, runTransaction } from 'firebase/firestore';
import { db, storage, handleFirestoreError, OperationType } from '../firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Plan, LogEntry, LoadingState, User } from '../types';
import { showToast } from '../lib/toast';

// ── private helpers ───────────────────────────────────────────────────────────

/** Extract the base integer from a LOC string like "LOC-373", "373", "366.1" */
function locToInt(loc: unknown): number {
  const n = parseInt(String(loc || '').replace('LOC-', '').split('.')[0], 10);
  return isNaN(n) ? 0 : n;
}

function maxLocFromPlans(plans: Plan[]): number {
  return plans.reduce((max, p) => Math.max(max, locToInt(p.loc || p.id || '')), 0);
}

/** Supports both current 'count' field and legacy 'value' field */
function safeCounterVal(data: Record<string, unknown> | undefined): number {
  if (!data) return 0;
  const raw = data.count ?? data.value ?? 0;
  const n = Number(raw);
  return isNaN(n) ? 0 : n;
}

// ── exports ───────────────────────────────────────────────────────────────────

/**
 * Reserve and return the next LOC number (e.g. "LOC-374") using a Firestore
 * transaction. Always takes max(counter, highest existing LOC) + 1 — safe even
 * with imported gaps.
 */
export const getNextLocNumber = async (plans: Plan[]): Promise<string> => {
  const counterRef = doc(db, 'settings', 'locCounter');
  const maxFromPlans = maxLocFromPlans(plans);
  let nextNum = 1;
  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(counterRef);
    const counterVal = safeCounterVal(snap.exists() ? snap.data() : undefined);
    nextNum = Math.max(counterVal, maxFromPlans) + 1;
    transaction.set(counterRef, { count: nextNum });
  });
  return `LOC-${nextNum}`;
};

/** Read-only preview of the next LOC number (no reservation — for display only). */
export const peekNextLocNumber = async (plans: Plan[]): Promise<string> => {
  const snap = await getDoc(doc(db, 'settings', 'locCounter'));
  const counterVal = safeCounterVal(snap.exists() ? snap.data() : undefined);
  const maxFromPlans = maxLocFromPlans(plans);
  return `LOC-${Math.max(counterVal, maxFromPlans) + 1}`;
};

/** Assign a LOC number to a TBD plan — creates the new plan doc and deletes the old TBD one. */
export const assignLocToTBD = async (
  tbdPlan: Plan,
  customLoc: string | null,
  setSelectedPlan: (plan: Plan | null) => void,
  td: string,
  getUserLabel: () => string
): Promise<string> => {
  let locNumber: string;

  if (customLoc && customLoc.trim()) {
    locNumber = customLoc.trim();
  } else {
    locNumber = await runTransaction(db, async (transaction) => {
      const counterRef = doc(db, 'settings', 'locCounter');
      const counterSnap = await transaction.get(counterRef);
      const current = counterSnap.exists() ? (counterSnap.data().count as number || 0) : 0;
      const next = current + 1;
      transaction.set(counterRef, { count: next });
      return String(next);
    });
  }

  const logEntry: LogEntry = {
    uniqueId: Date.now().toString(),
    date: td,
    action: `LOC number assigned: ${locNumber}`,
    user: getUserLabel(),
  };

  const newPlanData: any = {
    ...tbdPlan,
    id: locNumber,
    loc: locNumber,
    locStatus: 'assigned',
    log: [...(tbdPlan.log || []), logEntry],
  };

  await setDoc(doc(db, 'plans', locNumber), newPlanData);
  await deleteDoc(doc(db, 'plans', tbdPlan.id));

  setSelectedPlan(newPlanData as Plan);
  return locNumber;
};

/** Create a renewal plan from an existing one, keeping descriptive fields and resetting workflow state. */
export const renewLoc = async (
  plan: Plan,
  existingPlans: Plan[],
  td: string,
  getUserLabel: () => string,
  setSelectedPlan: (plan: Plan | null) => void
): Promise<string> => {
  // Find root LOC id — if this plan is itself a renewal, walk to the parent
  const rootId = plan.parentLocId || plan.id;

  // Count how many renewals already exist for this root
  const existingRenewals = existingPlans.filter(
    p => p.parentLocId === rootId || (p.id !== rootId && p.id.startsWith(rootId + '.'))
  );
  const nextSuffix = `.${existingRenewals.length + 1}`;
  const newId = `${rootId}${nextSuffix}`;

  const today = td;
  const newPlan: Plan = {
    // Identity
    id: newId,
    loc: newId,
    rev: 0,
    revisionSuffix: nextSuffix,
    parentLocId: rootId,
    // Carry over key descriptive fields
    type: plan.type,
    scope: plan.scope,
    segment: plan.segment,
    street1: plan.street1,
    street2: plan.street2 || '',
    lead: plan.lead,
    requestedBy: plan.requestedBy || '',
    priority: plan.priority,
    notes: plan.notes || '',
    // Carry over direction & impact fields
    dir_nb: plan.dir_nb ?? false,
    dir_sb: plan.dir_sb ?? false,
    dir_directional: plan.dir_directional ?? false,
    side_street: plan.side_street ?? false,
    impact_krail: plan.impact_krail ?? false,
    impact_driveway: plan.impact_driveway ?? false,
    impact_fullClosure: plan.impact_fullClosure ?? false,
    impact_busStop: plan.impact_busStop ?? false,
    impact_transit: plan.impact_transit ?? false,
    // Carry over hours of work
    work_hours: plan.work_hours,
    // Reset workflow fields
    stage: 'requested',
    needByDate: '',
    dateRequested: today,
    requestDate: today,
    submitDate: null,
    approvedDate: null,
    isHistorical: false,
    pendingDocuments: false,
    isCriticalPath: false,
    // Empty history
    attachments: [],
    approvedTCPs: [],
    approvedLOCs: [],
    stageAttachments: [],
    reviewCycles: [],
    implementationWindow: null,
    log: [{
      uniqueId: Date.now().toString(),
      date: today,
      action: `Renewed from ${plan.id}`,
      user: getUserLabel(),
    }],
    statusHistory: [{
      uniqueId: `renew_req_${Date.now()}`,
      date: today,
      action: 'Status → Requested',
      user: getUserLabel(),
    }],
  };

  // Write new plan
  await setDoc(doc(db, 'plans', newId), newPlan);

  // Log the renewal on the original plan
  const updatedLog = [
    ...(plan.log || []),
    {
      uniqueId: `renew_log_${Date.now()}`,
      date: today,
      action: `Renewed — new record created as ${newId}`,
      user: getUserLabel(),
    },
  ];
  await updateDoc(doc(db, 'plans', plan.id), { log: updatedLog });

  // Open the new plan in the panel
  setSelectedPlan(newPlan);
  return newId;
};

/** Upload a LOC file once and attach it to all selected plans. */
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
      startDate: td,
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      planIds: selectedPlanIds,
      notes: `Bulk upload for ${selectedPlanIds.length} plans.`,
      fileUrl: url,
      fileName: bulkLOCFile.name,
      uploadedBy: currentUser?.email || "Unknown",
      uploadedAt: new Date().toISOString()
    };
    await setDoc(doc(db, 'locs', locNumber), locData);

    // 3. Update each plan with the new LOC
    const total = selectedPlanIds.length;
    let completed = 0;
    const plansById = new Map(plans.map(p => [p.id, p]));

    for (const pid of selectedPlanIds) {
      const plan = plansById.get(pid);
      if (plan) {
        const newLOCEntry = {
          id: `${Date.now()}_${pid}`,
          name: bulkLOCFile.name,
          url,
          version: (plan.locRev || 0) + 1,
          uploadedAt: new Date().toISOString(),
          uploadedBy: currentUser?.email || "Unknown"
        };
        const updateData = {
          approvedLOCs: [...(plan.approvedLOCs || []), newLOCEntry],
          currentLOC: bulkLOCFile.name,
          locRev: (plan.locRev || 0) + 1,
          pendingDocuments: false,
          log: [
            ...(plan.log || []),
            {
              uniqueId: Date.now().toString(),
              date: td,
              action: `Bulk LOC attached: ${bulkLOCFile.name}`,
              user: getUserLabel()
            }
          ]
        };
        await updateDoc(doc(db, 'plans', pid), updateData);
      }
      completed++;
      setBulkLOCProgress(Math.round((completed / total) * 100));
    }

    showToast(`LOC attached to ${total} plan${total !== 1 ? 's' : ''}.`, "success");
    setShowBulkLOCModal(false);
    setBulkLOCFile(null);
    setSelectedPlanIds([]);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'bulk_locs');
    throw error;
  } finally {
    setLoading(prev => ({ ...prev, bulk: false }));
    setBulkLOCProgress(0);
  }
};

/** Upload a new LOC file and add it to a plan's approved LOCs. */
export const linkNewLOC = async (
  pid: string,
  file: File,
  plan: Plan,
  getUserLabel: () => string,
  td: string,
  setSelectedPlan: (planOrUpdater: Plan | null | ((prev: Plan | null) => Plan | null)) => void,
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
    // Only write the fields that actually changed — never spread full plan into Firestore
    const updatePayload: Partial<Plan> = {
      approvedLOCs: newLOCs,
      currentLOC: file.name,
      locRev: version,
      // LOC is the primary binding document — uploading it clears the pending flag
      ...(plan.pendingDocuments ? { pendingDocuments: false } : {}),
      log: [...(plan.log || []), { date: td, action: `Linked New LOC: ${file.name.replace(/^\d+_/, '')}`, user: getUserLabel() }]
    };

    await updateDoc(doc(db, 'plans', pid), updatePayload);
    // Use functional updater to merge with current state — avoids stale closure reverting stage
    setSelectedPlan(prev => (prev ? { ...prev, ...updatePayload } : { ...plan, ...updatePayload }) as Plan);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `plans/${pid}`);
    throw error;
  }
};
