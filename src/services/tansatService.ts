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
  TansatActivity, TansatSide, TansatDayPattern, TansatSettings,
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

// ── AI invoice extraction (T-3.2) ────────────────────────────────────────────
//
// Mirrors `scanDrivewayLetterWithGemini` in drivewayLetterService.ts. Reuses
// the same `settings/aiConfig.geminiApiKey` (single key for the whole app —
// no separate TANSAT key). The prompt targets the LADOT Temporary Sign
// Posting Billing Statement format documented in docs/specs/tansat.md §7.
//
// Failure path: writes scanError + scanCompletedAt onto the request so the
// UI can show a retry hint. Cost guard via SHA-256 hash check — if the
// invoiceAttachment was already extracted from this exact file, skip.

export interface TansatInvoiceExtraction {
  logNumber?: string;
  invoiceAmount?: number;
  paymentDueDate?: string;        // ISO; "DUE TODAY" → today's date
  customerName?: string;
  workArea?: {
    street?: string;
    fromLimit?: string;
    toLimit?: string;
    side?: TansatSide;
  };
  schedule?: { startDate?: string; endDate?: string };
  description?: string;
}

/**
 * Hash the file's bytes (SHA-256, hex) so we can cache extractions and skip
 * re-running Gemini on the exact same upload. Used purely for cost guarding.
 */
async function hashFile(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Run Gemini extraction on an uploaded invoice PDF and merge the results
 * into the request. Caller is responsible for uploading the file to Storage
 * first (so `invoiceAttachment` is set).
 *
 * Settings flag `tansatSettings.aiExtractionEnabled` short-circuits the call
 * (still no extraction, but UX-wise the field stays empty so MOT enters
 * manually).
 */
export async function scanTansatInvoiceWithGemini(
  requestId: string,
  file: File,
  appConfig?: { tansatSettings?: TansatSettings },
): Promise<TansatInvoiceExtraction> {
  const aiEnabled = appConfig?.tansatSettings?.aiExtractionEnabled !== false;
  if (!aiEnabled) {
    throw new Error('AI invoice extraction is disabled in Settings → TANSAT.');
  }

  // Cache check — same file already extracted? Skip the API call.
  const fileHash = await hashFile(file);
  const cur = (await getTansatRequest(requestId)) as unknown as Record<string, unknown> | null;
  const cachedHash = cur?.['invoiceFileHash'] as string | undefined;
  const cachedExtraction = cur?.['invoiceExtraction'] as TansatInvoiceExtraction | undefined;
  if (cachedHash === fileHash && cachedExtraction) {
    return cachedExtraction;
  }

  // Get the API key from settings/aiConfig (shared with driveway letter scan)
  const aiSnap = await getDoc(doc(db, 'settings', 'aiConfig'));
  const apiKey: string | undefined = aiSnap.exists()
    ? (aiSnap.data() as Record<string, unknown>).geminiApiKey as string | undefined
    : undefined;

  if (!apiKey) {
    await updateDoc(doc(db, 'tansatRequests', requestId), {
      scanError: 'No Gemini API key configured. Add it in Settings → System → AI Configuration.',
      scanCompletedAt: nowIso(),
    });
    throw new Error('No Gemini API key configured.');
  }

  // PDF → base64
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  const base64 = btoa(binary);

  const today = new Date().toISOString().slice(0, 10);

  // Prompt: targets the exact LADOT Temporary Sign Posting Billing Statement
  // format. Real example from 454469.docx:
  //   "Invoice / Work Order / Log #" → "454469"
  //   "Amount Due"                   → "$341.60"
  //   "Payment Due Date"             → "DUE TODAY"
  //   "Customer Name"                → "SFT CONSTRUCTORS / DALE GATICA Jr"
  //   "S/S OXNARD ST F/ CEDROS AVE - VAN NUYS BLVD" → side/street/from/to
  const prompt = `You are extracting structured data from an LADOT Temporary Sign Posting Billing Statement (TANSAT invoice).

Today's date: ${today}

Return ONLY valid JSON — no markdown fences, no surrounding text.

If a field isn't present in the document, use null (or omit it). Use this exact schema:

{
  "logNumber": "string — value next to 'Invoice / Work Order / Log #'",
  "invoiceAmount": number — value next to 'Amount Due', strip the $ sign,
  "paymentDueDate": "YYYY-MM-DD — if 'Payment Due Date' says 'DUE TODAY' return today (${today}); otherwise parse the literal date",
  "customerName": "string — value next to 'Customer Name'",
  "workArea": {
    "street":    "primary street name (e.g. 'OXNARD ST')",
    "fromLimit": "from-cross-street (e.g. 'CEDROS AVE')",
    "toLimit":   "to-cross-street (e.g. 'VAN NUYS BLVD')",
    "side":      "one of: 'N','S','E','W','NB','SB','EB','WB','BOTH' — interpret 'S/S' = 'S' (Southside), 'N/S' = 'N', 'E/S' = 'E', 'W/S' = 'W'"
  },
  "schedule": {
    "startDate": "YYYY-MM-DD",
    "endDate":   "YYYY-MM-DD"
  },
  "description": "the work-description line (e.g. 'TEMPORARY TOW AWAY NO PARKING ANYTIME EXCEPT SATURDAY & SUNDAY')"
}`;

  let extracted: Record<string, unknown> = {};
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { inline_data: { mime_type: file.type || 'application/pdf', data: base64 } },
              { text: prompt },
            ],
          }],
          generationConfig: { temperature: 0.1 },
        }),
      }
    );
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini ${response.status}: ${errText.slice(0, 400)}`);
    }
    const data = await response.json();
    const text: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error(`No JSON in AI response: ${text.slice(0, 300)}`);
    extracted = JSON.parse(jsonMatch[0]);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await updateDoc(doc(db, 'tansatRequests', requestId), {
      scanError: msg,
      scanCompletedAt: nowIso(),
    });
    throw err;
  }

  // Normalize and trim
  const result: TansatInvoiceExtraction = {
    logNumber:       typeof extracted.logNumber === 'string' ? extracted.logNumber.trim() : undefined,
    invoiceAmount:   typeof extracted.invoiceAmount === 'number' ? extracted.invoiceAmount
                   : typeof extracted.invoiceAmount === 'string'
                     ? parseFloat((extracted.invoiceAmount as string).replace(/[$,]/g, ''))
                     : undefined,
    paymentDueDate:  typeof extracted.paymentDueDate === 'string' ? extracted.paymentDueDate.trim() : undefined,
    customerName:    typeof extracted.customerName === 'string' ? extracted.customerName.trim() : undefined,
    workArea:        (extracted.workArea && typeof extracted.workArea === 'object')
      ? extracted.workArea as TansatInvoiceExtraction['workArea']
      : undefined,
    schedule:        (extracted.schedule && typeof extracted.schedule === 'object')
      ? extracted.schedule as TansatInvoiceExtraction['schedule']
      : undefined,
    description:     typeof extracted.description === 'string' ? extracted.description.trim() : undefined,
  };

  // Persist the extraction + cache the file hash so re-uploads short-circuit.
  await updateDoc(doc(db, 'tansatRequests', requestId), stripUndefined({
    invoiceFileHash: fileHash,
    invoiceExtraction: result,
    scanError: '',
    scanCompletedAt: nowIso(),
    updatedAt: nowIso(),
  }));

  writeGlobalLog(
    `TANSAT invoice scanned (LOG #${result.logNumber ?? '—'})`,
    'tansat',
    '',
    requestId,
    'tansat_request',
  );

  return result;
}

// Re-export `serverTimestamp` so callers can use it without a separate firestore import.
// (The service uses ISO strings consistently for createdAt/updatedAt; this is here in
// case a caller needs Firestore-native timestamps for ordering.)
export { serverTimestamp };
