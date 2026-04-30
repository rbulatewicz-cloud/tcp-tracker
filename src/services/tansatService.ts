/**
 * TANSAT request service — CRUD + subscriptions + lifecycle helpers.
 *
 * Top-level Firestore collection: `tansatRequests/*`. Each doc is a single
 * submission to LADOT covering one or more phases on a plan. See
 * docs/specs/tansat.md §3.2 for the full data model and §4 for the state
 * machine.
 *
 * UI entry points consume these functions:
 * - Plan card "TANSAT" track:    subscribeToTansatRequests, createTansatRequest
 * - MOT Hub:                     subscribeToTansatRequests + tansatSpend util
 * - Library "TANSAT Log":        subscribeToTansatRequests
 * - Build packet modal:          updateTansatRequest, advanceStatus
 * - Invoice intake / Mark paid:  updateTansatRequest, uploadAttachment
 * - Extensions:                  addExtension
 * - Renewal:                     createRenewal
 *
 * AI invoice extraction (T-3.2) lives in this service too — mirrors
 * `scanDrivewayLetterWithGemini` in `drivewayLetterService.ts`.
 */

import {
  collection, doc, setDoc, updateDoc, onSnapshot, query, where, orderBy,
  arrayUnion, getDoc, serverTimestamp,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase';
import {
  TansatRequest, TansatStatus, TansatExtension, TansatAttachment,
  TansatActivity, TansatSide, TansatDayPattern,
} from '../types';
import { writeGlobalLog } from './logService';

// ── ID generation ────────────────────────────────────────────────────────────
function newRequestId(): string {
  // tansat_<base36-timestamp>_<random4> — sortable by creation time
  return `tansat_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function newExtensionId(): string {
  return `ext_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

// ── Subscriptions ────────────────────────────────────────────────────────────

export function subscribeToTansatRequests(
  callback: (requests: TansatRequest[]) => void,
): () => void {
  const q = query(collection(db, 'tansatRequests'), orderBy('createdAt', 'desc'));
  return onSnapshot(q, snap => {
    const items = snap.docs.map(d => ({ id: d.id, ...d.data() }) as TansatRequest);
    callback(items);
  });
}

export function subscribeToTansatRequestsForPlan(
  planId: string,
  callback: (requests: TansatRequest[]) => void,
): () => void {
  const q = query(collection(db, 'tansatRequests'), where('planId', '==', planId));
  return onSnapshot(q, snap => {
    const items = snap.docs.map(d => ({ id: d.id, ...d.data() }) as TansatRequest);
    // Sort newest first (createdAt is ISO so localeCompare works)
    items.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
    callback(items);
  });
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

export interface CreateTansatRequestInput {
  planId?: string;
  importedPlanText?: string;
  phaseNumbers: number[];
  activity: TansatActivity;
  activityOther?: string;
  workArea?: Partial<TansatRequest['workArea']>;
  schedule?: Partial<TansatRequest['schedule']>;
  notes?: string;
  createdBy: string;
  importedFrom?: string;
}

export async function createTansatRequest(
  input: CreateTansatRequestInput,
): Promise<string> {
  const id = newRequestId();
  const now = nowIso();

  const requestDoc: TansatRequest = {
    id,
    planId: input.planId,
    importedPlanText: input.importedPlanText,
    phaseNumbers: input.phaseNumbers ?? [],
    activity: input.activity,
    activityOther: input.activityOther,
    workArea: {
      side: (input.workArea?.side ?? 'BOTH') as TansatSide,
      street: input.workArea?.street ?? '',
      fromLimit: input.workArea?.fromLimit ?? '',
      toLimit: input.workArea?.toLimit ?? '',
    },
    schedule: {
      dayPattern: (input.schedule?.dayPattern ?? 'daily') as TansatDayPattern,
      startDate: input.schedule?.startDate ?? '',
      startTime: input.schedule?.startTime ?? '',
      endDate: input.schedule?.endDate ?? '',
      endTime: input.schedule?.endTime ?? '',
    },
    notes: input.notes,
    status: 'draft',
    createdBy: input.createdBy,
    createdAt: now,
    updatedAt: now,
    importedFrom: input.importedFrom,
  };

  await setDoc(doc(db, 'tansatRequests', id), stripUndefined(requestDoc));
  writeGlobalLog(
    `TANSAT request created${input.planId ? ` for ${input.planId}` : ''}`,
    'tansat',
    input.planId ?? '',
    id,
    'tansat_request',
  );
  return id;
}

export async function updateTansatRequest(
  id: string,
  patch: Partial<TansatRequest>,
): Promise<void> {
  const safe = stripUndefined({ ...patch, updatedAt: nowIso() });
  await updateDoc(doc(db, 'tansatRequests', id), safe);
}

export async function getTansatRequest(id: string): Promise<TansatRequest | null> {
  const snap = await getDoc(doc(db, 'tansatRequests', id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as TansatRequest;
}

// ── Status transitions ────────────────────────────────────────────────────────

/**
 * Advance a request's status. Doesn't enforce the state machine — UI is
 * responsible for guards (NV attached when required, receipt before paid, etc).
 * Centralizing the call here keeps audit logging consistent.
 */
export async function setStatus(id: string, status: TansatStatus): Promise<void> {
  await updateTansatRequest(id, { status });
  writeGlobalLog(
    `TANSAT request ${id} → ${status}`,
    'tansat',
    '',
    id,
    'tansat_request',
  );
}

// ── Attachments ──────────────────────────────────────────────────────────────

export async function uploadTansatAttachment(
  requestId: string,
  file: File,
  kind: 'map' | 'invoice' | 'receipt' | 'email' | 'extension',
  uploadedBy: string,
): Promise<TansatAttachment> {
  const storagePath = `tansatRequests/${requestId}/${kind}_${Date.now()}_${file.name}`;
  const fileRef = ref(storage, storagePath);
  await uploadBytes(fileRef, file);
  const url = await getDownloadURL(fileRef);
  return {
    name: file.name,
    url,
    storagePath,
    uploadedAt: nowIso(),
    uploadedBy,
    size: file.size,
  };
}

// ── Extensions (FREE; same log #) ────────────────────────────────────────────

export async function addExtension(
  requestId: string,
  ext: Omit<TansatExtension, 'id' | 'requestedAt' | 'status'> & {
    status?: TansatExtension['status'];
  },
): Promise<string> {
  const extension: TansatExtension = {
    id: newExtensionId(),
    requestedAt: nowIso(),
    status: ext.status ?? 'pending',
    ...ext,
  };
  await updateDoc(doc(db, 'tansatRequests', requestId), {
    extensions: arrayUnion(stripUndefined(extension)),
    updatedAt: nowIso(),
  });
  writeGlobalLog(
    `TANSAT extension filed (new end ${ext.newEndDate})`,
    'tansat',
    '',
    requestId,
    'tansat_request',
  );
  return extension.id;
}

// ── Renewal ───────────────────────────────────────────────────────────────────

/**
 * Create a renewal request when the original log # has expired. Pre-fills
 * activity, phaseNumbers, workArea, NVs, and notes from the parent. New
 * schedule + email + payment required. Both records get updated with
 * cross-references for traceability.
 */
export async function createRenewal(
  parentId: string,
  createdBy: string,
): Promise<string> {
  const parent = await getTansatRequest(parentId);
  if (!parent) throw new Error(`Parent TANSAT request ${parentId} not found`);

  const newId = await createTansatRequest({
    planId: parent.planId,
    importedPlanText: parent.importedPlanText,
    phaseNumbers: parent.phaseNumbers,
    activity: parent.activity,
    activityOther: parent.activityOther,
    workArea: parent.workArea,
    schedule: undefined,                         // fresh schedule for the new posting
    notes: parent.notes ? `Renewal of ${parent.logNumber ?? parentId}\n\n${parent.notes}` : undefined,
    createdBy,
  });

  await updateTansatRequest(newId, { renewalOfRequestId: parentId });
  await updateTansatRequest(parentId, { renewedByRequestId: newId, status: 'expired' });

  writeGlobalLog(
    `TANSAT renewal created (parent ${parent.logNumber ?? parentId} expired)`,
    'tansat',
    parent.planId ?? '',
    newId,
    'tansat_request',
  );
  return newId;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Firestore rejects `undefined` field values. Strip them so optional fields
 * left blank in the form don't blow up the write. Recursive on plain objects.
 */
function stripUndefined<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(stripUndefined) as unknown as T;
  if (typeof obj !== 'object') return obj;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (v === undefined) continue;
    out[k] = (typeof v === 'object' && v !== null && !(v instanceof Date))
      ? stripUndefined(v)
      : v;
  }
  return out as T;
}

// Re-export `serverTimestamp` so callers can use it without a separate firestore import.
// (The service uses ISO strings consistently for createdAt/updatedAt; this is here in
// case a caller needs Firestore-native timestamps for ordering.)
export { serverTimestamp };
