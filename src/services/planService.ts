import { doc, updateDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase';
import { Plan, Stage, LogEntry, User, UserRole, LoadingState, ReviewCycle, ImplementationWindow, PHETrack, WorkHours, WorkDay } from '../types';
import { detectComplianceTriggers, initializeComplianceTracks } from '../utils/compliance';
import { FIELD_REGISTRY, ALL_STAGES } from '../constants';
import { showToast } from '../lib/toast';

// ── Log formatting helpers ─────────────────────────────────────────────────────

/** Convert a 24-hour "HH:MM" string to a readable "H AM/PM" label */
function fmt12(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return m === 0 ? `${hour} ${ampm}` : `${hour}:${m.toString().padStart(2, '0')} ${ampm}`;
}

/** Format a WorkHours object into a readable summary for activity log entries */
function formatWorkHours(wh: WorkHours): string {
  const dayLabels: Record<WorkDay, string> = { weekday: 'Weekdays', saturday: 'Saturday', sunday: 'Sunday' };
  const days = wh.days.map(d => dayLabels[d]).join(' & ');

  if (wh.shift === 'continuous') return `Continuous · ${days}`;
  if (wh.shift === 'daytime')    return `Daytime · ${days}`;
  if (wh.shift === 'nighttime')  return `Nighttime · ${days}`;

  // 'both' — dual-shift with per-day-type windows
  if (wh.shift === 'both') {
    // Summarise weekday window if weekday is selected
    if (wh.days.includes('weekday')) {
      const dayS = wh.day_start ?? wh.weekday_start;
      const dayE = wh.day_end   ?? wh.weekday_end;
      const parts: string[] = [];
      if (dayS && dayE)                   parts.push(`Day ${fmt12(dayS)}–${fmt12(dayE)}`);
      if (wh.night_start && wh.night_end) parts.push(`Night ${fmt12(wh.night_start)}–${fmt12(wh.night_end)}`);
      if (parts.length) return `${parts.join(' + ')} · ${days}`;
    }
    return `Day & Night · ${days}`;
  }

  // 'mixed' — per-day shifts differ
  if (wh.shift === 'mixed') {
    const dayLabels: Record<WorkDay, string> = { weekday: 'Wkdy', saturday: 'Sat', sunday: 'Sun' };
    const parts = wh.days.map(d => {
      const ds = (wh as any)[`${d}_shift`] as string | undefined ?? 'daytime';
      const icon = ds === 'daytime' ? '☀️' : ds === 'nighttime' ? '🌙' : '☀️+🌙';
      return `${dayLabels[d]}:${icon}`;
    });
    return `Mixed · ${parts.join(' ')}`;
  }

  return `Custom Hours · ${days}`;
}

/** Format an ISO date string "YYYY-MM-DD" as "Mon D, YYYY" */
function formatLogDate(iso: string): string {
  if (!iso) return iso;
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Recursively remove undefined values — Firestore rejects them in updateDoc */
function stripUndefined(val: unknown): unknown {
  if (val === undefined) return null;
  if (val === null) return null;
  if (Array.isArray(val)) return val.map(stripUndefined);
  if (typeof val === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      if (v !== undefined) out[k] = stripUndefined(v);
    }
    return out;
  }
  return val;
}

export const updatePlanStage = async (
  plan: Plan,
  ns: string,
  date: string,
  getUserLabel: () => string,
  setStatusDate: (date: string) => void,
  _STAGES: Stage[],   // kept for call-site compat, superseded by ALL_STAGES lookup
  selectedPlan: Plan | null,
  setSelectedPlan: (plan: Plan | null) => void,
  isDraft: boolean = true,
  draftPlan: Plan | null = null,
  setDraftPlan: (plan: Plan | null) => void = () => {},
  setIsDirty: (dirty: boolean) => void = () => {},
  reviewCycles?: ReviewCycle[],
  implementationWindow?: ImplementationWindow | null,
  onNotify?: (plan: Plan, newStage: string, stageLabel: string, actorEmail: string) => void,
  actorEmail?: string,
) => {
  try {
    // Use ALL_STAGES for comprehensive lookup — the old 4-stage STAGES array
    // causes new status keys (submitted_to_dot, plan_approved, etc.) to get
    // index -1, breaking rewind detection and incorrectly clearing dates.
    const stageLabel = ALL_STAGES.find(s => s.key === ns)?.label ?? ns;

    // Always append new status history entry — the old rewind/filter logic
    // deleted earlier entries when new keys weren't found in STAGES.
    const newLog = [...(plan.log || [])];
    const newStatusHistory = [...(plan.statusHistory || [])];

    const previousStage = plan.stage;
    const uniqueId = Date.now().toString();
    const newStageEntry = {
      uniqueId,
      date,
      action: `Status → ${stageLabel}`,
      user: getUserLabel(),
      field: 'stage',
      previousValue: previousStage,
      newValue: ns,
    };
    newLog.push(newStageEntry);
    newStatusHistory.push({ ...newStageEntry, uniqueId });

    setStatusDate(date);

    // Build the full in-memory plan update (used for draft + local state)
    const updateData: Partial<Plan> & { stage: string; log: LogEntry[] } = {
      ...plan,
      stage: ns,
      log: newLog,
      statusHistory: newStatusHistory,
      ...(reviewCycles !== undefined ? { reviewCycles } : {}),
      ...(implementationWindow !== undefined ? { implementationWindow } : {}),
    };

    // Set relevant date fields based on new status
    if (ns === 'requested') updateData.dateRequested = date;
    if (ns === 'submitted' || ns === 'submitted_to_dot') updateData.submitDate = date;
    if (ns === 'approved' || ns === 'plan_approved') updateData.approvedDate = date;

    if (isDraft) {
      setDraftPlan(updateData as Plan);
      setSelectedPlan(updateData as Plan);
      setIsDirty(true);
    } else {
      // Write ONLY the fields that changed — never spread the full plan into updateDoc.
      // Writing the full plan object risks Firestore rejecting the write if any nested
      // field contains `undefined`, which would fail silently and leave the stage unchanged.
      const firestoreWrite: Record<string, unknown> = {
        stage: ns,
        log: newLog,
        statusHistory: newStatusHistory,
      };
      if (reviewCycles !== undefined) firestoreWrite.reviewCycles = reviewCycles;
      if (implementationWindow !== undefined) firestoreWrite.implementationWindow = implementationWindow;
      if (ns === 'requested') firestoreWrite.dateRequested = date;
      if (ns === 'submitted' || ns === 'submitted_to_dot') firestoreWrite.submitDate = date;
      if (ns === 'approved' || ns === 'plan_approved') firestoreWrite.approvedDate = date;

      await updateDoc(doc(db, 'plans', plan.id), firestoreWrite);
      if (selectedPlan?.id === plan.id) {
        setSelectedPlan({ ...plan, ...updateData } as Plan);
      }
      // Fire notifications for subscribers (non-blocking)
      if (onNotify && actorEmail) {
        onNotify(plan, ns, stageLabel, actorEmail);
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `plans/${plan.id}`);
    throw error;
  }
};

export const submitPlan = async (
  form: Partial<Plan> & { attachments: File[] },
  plans: Plan[],
  td: string,
  getUserLabel: () => string,
  creatorEmail?: string,
) => {
  // LOC # is the primary identifier — validate it is provided and unique
  const locNumber = (form.loc || form.id || '').trim();
  if (!locNumber) {
    throw new Error("LOC # is required.");
  }
  if (plans.some(p => p.id === locNumber || p.loc === locNumber)) {
    throw new Error(`LOC # "${locNumber}" already exists. Please use a unique LOC number.`);
  }

  const existingRequested = plans.filter(p => p.stage === "requested");
  const queuePos = form.isCriticalPath
    ? (existingRequested.filter(p => p.isCriticalPath).length + 1)
    : (existingRequested.length + 1);

  try {
    const uploadedAttachments = await Promise.all(
      form.attachments.map(async (file: File) => {
        const fileRef = ref(storage, `plans/${locNumber}/${Date.now()}_${file.name}`);
        const uploadPromise = uploadBytes(fileRef, file);
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Upload timed out. Firebase Storage might not be initialized.")), 15000)
        );
        await Promise.race([uploadPromise, timeoutPromise]);
        const url = await getDownloadURL(fileRef);
        return { name: file.name, data: url };
      })
    );

    // Detect and initialize compliance tracks from form data
    const triggers = detectComplianceTriggers(form as any);
    const compliance = initializeComplianceTracks(triggers);
    // Carry PHE justification from form into the PHE track
    const formAny = form as Record<string, unknown>;
    if (compliance.phe && formAny.phe_justification) {
      (compliance.phe as PHETrack).peakHourJustification = formAny.phe_justification as string;
    }

    // Seed driveway addresses entered at request time
    const drivewayAddrEntries = (formAny.driveway_addresses as Array<{ address: string; propertyId?: string }> | undefined) ?? [];
    if (compliance.drivewayNotices && drivewayAddrEntries.length > 0) {
      compliance.drivewayNotices.addresses = drivewayAddrEntries.map((entry, i) => ({
        id: `addr_${Date.now()}_${i}`,
        address: entry.address,
        propertyId: entry.propertyId,
        letterStatus: 'not_drafted' as const,
      }));
    }

    const np: Partial<Plan> = {
      ...form,
      attachments: uploadedAttachments,
      id: locNumber,
      loc: locNumber,
      stage: "requested",
      subscribers: creatorEmail ? [creatorEmail] : [],
      requestDate: td,
      dateRequested: td,
      isHistorical: false,
      pendingDocuments: false,
      compliance: Object.keys(compliance).length > 0 ? compliance : undefined,
      log: [
        { uniqueId: Date.now().toString(), date: td, action: "New request submitted", user: getUserLabel(), dateRequested: td },
        ...(form.isCriticalPath
          ? [{ uniqueId: (Date.now() + 1).toString(), date: td, action: "Submitted as Critical Path Item", user: getUserLabel() }]
          : []),
        ...(triggers.phe || triggers.noiseVariance || triggers.cdConcurrence
          ? [{ uniqueId: (Date.now() + 2).toString(), date: td, action: `Compliance tracks auto-generated: ${[triggers.phe && 'PHE', triggers.noiseVariance && 'Noise Variance', triggers.cdConcurrence && 'CD Concurrence'].filter(Boolean).join(', ')}`, user: getUserLabel() }]
          : []),
      ],
    };

    await setDoc(doc(db, 'plans', locNumber), stripUndefined(np) as Plan);
    return { queuePos, id: locNumber };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `plans/${locNumber}`);
    throw error;
  }
};

// Stages that only exist in the Engineered workflow — need remap when converting down
const ENGINEERED_ONLY_STAGES = ['tcp_approved', 'loc_submitted', 'loc_review'];

export const convertPlanType = async (
  pid: string,
  newType: string,
  plan: Plan,
  setSelectedPlan: (plan: Plan | null) => void,
  td: string,
  getUserLabel: () => string
): Promise<{ remappedStage: string | null }> => {
  const currentStage = plan.stage || 'requested';
  const needsRemap = newType !== 'Engineered' && ENGINEERED_ONLY_STAGES.includes(currentStage);
  const targetStage = needsRemap ? 'submitted_to_dot' : currentStage;

  const logEntry: LogEntry = {
    uniqueId: Date.now().toString(),
    date: td,
    action: `Plan type converted: ${plan.type} → ${newType}${needsRemap ? ' (stage reset to Submitted to DOT)' : ''}`,
    user: getUserLabel(),
    field: 'type_conversion',
    previousValue: plan.type,
    newValue: newType,
  };

  const updates: any = {
    type: newType,
    log: [...(plan.log || []), logEntry],
    ...(needsRemap ? { stage: targetStage } : {}),
  };

  await updateDoc(doc(db, 'plans', pid), updates);
  setSelectedPlan({ ...plan, ...updates });

  return { remappedStage: needsRemap ? targetStage : null };
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
  value: string | number | boolean | null | object,
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
    const updateData: Partial<Plan> & Record<string, unknown> = {
      ...currentPlan,
      [field]: value,
    };

    const fieldsToLog = ["rev", "loc", "dateRequested", "isCriticalPath", "submitDate", "approvedDate", "needByDate", "type", "work_hours"];
    if (fieldsToLog.includes(field)) {
      let action = "";
      let logToRemove: string[] = [];
      if (field === "work_hours") action = "Updated Hours of Work";
      else if (field === "rev") action = `Updated Revision to ${value}`;
      else if (field === "type") {
        action = `Updated Plan Type to ${value}`;
        logToRemove = ["Updated Plan Type to"];
      }
      else if (field === "loc") {
        action = `Updated LOC to ${value}`;
        logToRemove = ["Updated LOC to"];
      }
      if (field === "dateRequested") {
        action = value ? `Updated Requested Date to ${formatLogDate(value as string)}` : "Cleared Requested Date";
        logToRemove = ["Updated Requested Date to", "New request submitted"];
      }
      else if (field === "isCriticalPath") action = value ? "Marked as Critical Path" : "Unmarked as Critical Path";
      else if (field === "submitDate") {
        action = value ? `Updated Submitted Date to ${formatLogDate(value as string)}` : "Cleared Submitted Date";
        logToRemove = ["Updated Submitted Date to", "Submitted to DOT (Imported)"];
      }
      else if (field === "approvedDate") {
        action = value ? `Updated Approved Date to ${formatLogDate(value as string)}` : "Cleared Approved Date";
        logToRemove = ["Updated Approved Date to"];
      }
      else if (field === "needByDate") {
        action = value ? `Updated Need By Date to ${formatLogDate(value as string)}` : "Cleared Need By Date";
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
      // Write only the changed field (+ log if updated) — not the full plan
      const toWrite: Record<string, unknown> = { [field]: value };
      if (updateData.log) toWrite.log = updateData.log;
      await updateDoc(doc(db, 'plans', pid), stripUndefined(toWrite) as Record<string, unknown>);
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
    const updateData: Partial<Plan> & Record<string, unknown> = {
      ...plan,
      ...updates,
    };

    const fieldsToLog = [...Object.keys(FIELD_REGISTRY), "rev", "isCriticalPath"];
    let newLog = [...(plan.log || [])];

    for (const [field, value] of Object.entries(updates)) {
      if (fieldsToLog.includes(field)) {
        const fieldConfig = FIELD_REGISTRY[field];
        const label = fieldConfig ? fieldConfig.label : field;

        let action = "";
        let logToRemove: string[] = [];

        if (field === "rev") {
          action = `Updated Revision to ${value}`;
        } else if (field === "isCriticalPath") {
          action = value ? "Marked as Critical Path" : "Unmarked as Critical Path";
        } else if (field === "work_hours") {
          const wh = value as WorkHours;
          action = `Updated Hours of Work to ${formatWorkHours(wh)}`;
          logToRemove = ["Updated Hours of Work to"];
        } else if (fieldConfig?.type === 'checkbox') {
          action = value ? `Marked ${label}` : `Unmarked ${label}`;
        } else if (["dateRequested", "submitDate", "approvedDate", "needByDate"].includes(field)) {
          action = value ? `Updated ${label} to ${formatLogDate(value as string)}` : `Cleared ${label}`;
          logToRemove = [`Updated ${label} to`];
          if (field === "submitDate") logToRemove.push("Submitted to DOT (Imported)");
        } else {
          action = `Updated ${label} to ${value}`;
          logToRemove = [`Updated ${label} to`];
        }

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

    // Write only the changed fields + log — not the full plan
    const toWrite = { ...updates, log: newLog };
    await updateDoc(doc(db, 'plans', pid), stripUndefined(toWrite) as Record<string, unknown>);
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
  // SFTC and GUEST cannot perform bulk edits
  if (currentUser?.role === _UserRole.SFTC || currentUser?.role === _UserRole.GUEST) {
    showToast("Only MOT team can perform bulk updates.", "error");
    return;
  }
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
