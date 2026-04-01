import { collection, doc, setDoc, updateDoc, deleteDoc, onSnapshot, getDoc, getDocs, writeBatch } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase';
import { NoiseVariance, VarianceExpiryStatus } from '../types';
import { SEGMENT_STREETS, SCOPES } from '../constants';
import { showToast } from '../lib/toast';

// ── Subscriptions ─────────────────────────────────────────────────────────────

export function subscribeToVariances(callback: (variances: NoiseVariance[]) => void) {
  return onSnapshot(collection(db, 'variances'), snap => {
    const items = snap.docs.map(d => ({ id: d.id, ...d.data() }) as NoiseVariance);
    // Sort: scanning first, then by expiry date ascending
    items.sort((a, b) => {
      if (a.scanStatus === 'scanning' && b.scanStatus !== 'scanning') return -1;
      if (b.scanStatus === 'scanning' && a.scanStatus !== 'scanning') return 1;
      if (!a.validThrough && !b.validThrough) return 0;
      if (!a.validThrough) return 1;
      if (!b.validThrough) return -1;
      return a.validThrough.localeCompare(b.validThrough);
    });
    callback(items);
  });
}

// ── Upload + scan ─────────────────────────────────────────────────────────────

export async function uploadAndScanVariance(
  file: File,
  uploadedBy: string
): Promise<string> {
  if (!file.type.includes('pdf')) {
    showToast('Only PDF files are supported for variance documents.', 'error');
    throw new Error('Not a PDF');
  }

  const id = `var_${Date.now()}`;

  // 1. Upload to Storage
  const storageRef = ref(storage, `variances/${id}_${file.name}`);
  await uploadBytes(storageRef, file);
  const fileUrl = await getDownloadURL(storageRef);

  // 2. Create placeholder document
  const placeholder: Omit<NoiseVariance, 'id'> = {
    title: file.name.replace(/\.[^/.]+$/, ''),
    permitNumber: '',
    coveredSegments: [],
    validFrom: '',
    validThrough: '',
    applicableHours: 'nighttime',
    isGeneric: true,
    coveredScopes: [],
    scopeLanguage: '',
    fileUrl,
    fileName: file.name,
    uploadedAt: new Date().toISOString(),
    uploadedBy,
    scanStatus: 'scanning',
    revisionNumber: 0,
    isArchived: false,
  };
  await setDoc(doc(db, 'variances', id), placeholder);

  // 3. Kick off AI scan asynchronously
  scanWithGemini(id, file).catch(err => {
    console.error('Variance scan error:', err);
  });

  return id;
}

// ── Revision upload (auto-archives all previous in the family) ────────────────

export async function uploadRevision(
  file: File,
  rootVarianceId: string,
  uploadedBy: string,
): Promise<string> {
  if (!file.type.includes('pdf')) {
    showToast('Only PDF files are supported.', 'error');
    throw new Error('Not a PDF');
  }

  // Fetch all variances in this family (root + any prior revisions)
  const snap = await getDocs(collection(db, 'variances'));
  const family = snap.docs
    .map(d => ({ id: d.id, ...d.data() }) as NoiseVariance)
    .filter(v => v.id === rootVarianceId || v.parentVarianceId === rootVarianceId);

  // Determine next revision number
  const maxRev = family.reduce((m, v) => Math.max(m, v.revisionNumber ?? 0), 0);

  // Inherit metadata from the most recent active member
  const active = family.find(v => !v.isArchived) ?? family[0];

  const newId = `var_${Date.now()}`;

  // Upload file
  const storageRef = ref(storage, `variances/${newId}_${file.name}`);
  await uploadBytes(storageRef, file);
  const fileUrl = await getDownloadURL(storageRef);

  // Batch: archive every existing family member + create new revision
  const batch = writeBatch(db);

  for (const member of family) {
    batch.update(doc(db, 'variances', member.id), { isArchived: true });
  }

  const newRevision: Omit<NoiseVariance, 'id'> = {
    title: active?.title ?? file.name.replace(/\.[^/.]+$/, ''),
    permitNumber: active?.permitNumber ?? '',
    coveredSegments: active?.coveredSegments ?? [],
    validFrom: '',
    validThrough: '',
    applicableHours: active?.applicableHours ?? 'nighttime',
    isGeneric: active?.isGeneric ?? true,
    coveredScopes: active?.coveredScopes ?? [],
    scopeLanguage: active?.scopeLanguage ?? '',
    fileUrl,
    fileName: file.name,
    uploadedAt: new Date().toISOString(),
    uploadedBy,
    scanStatus: 'scanning',
    parentVarianceId: rootVarianceId,
    revisionNumber: maxRev + 1,
    isArchived: false,
  };

  batch.set(doc(db, 'variances', newId), newRevision);
  await batch.commit();

  // AI scan to update validity dates + any changed metadata
  scanWithGemini(newId, file).catch(err => console.error('Revision scan error:', err));

  return newId;
}

// ── Gemini AI scan ────────────────────────────────────────────────────────────

async function scanWithGemini(id: string, file: File): Promise<void> {
  try {
    // Fetch API key from Firestore admin settings
    const aiSnap = await getDoc(doc(db, 'settings', 'aiConfig'));
    const apiKey: string | undefined = aiSnap.exists() ? aiSnap.data().geminiApiKey : undefined;

    if (!apiKey) {
      await updateDoc(doc(db, 'variances', id), {
        scanStatus: 'error',
        scanError: 'No Gemini API key configured. Add it in Settings → System → AI Configuration.',
      });
      return;
    }

    // Convert PDF to base64
    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = '';
    // Process in chunks to avoid call stack overflow on large files
    const chunkSize = 8192;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    const base64 = btoa(binary);

    // Build segment reference string for the prompt
    const segRef = Object.entries(SEGMENT_STREETS)
      .map(([seg, streets]) => `  ${seg}: ${streets.join(', ')}`)
      .join('\n');

    const scopeList = SCOPES.join(', ');

    const prompt = `You are analyzing a noise variance permit document for the ESFV Light Rail Transit construction project in Los Angeles.

Extract the information below and return ONLY valid JSON — no markdown fences, no extra text.

Segment reference (map streets/locations in the document to these codes):
${segRef}

Return this exact JSON structure:
{
  "title": "Concise descriptive title, e.g. 'Nighttime Noise Variance — Segments A1–A2, valid through Dec 2026'",
  "permitNumber": "The variance or permit number/identifier from the document, or empty string if not found",
  "validFrom": "Start date as YYYY-MM-DD, or empty string if not found",
  "validThrough": "Expiration date as YYYY-MM-DD, or empty string if not found",
  "applicableHours": "One of: nighttime, 24_7, both — what work hours this variance covers",
  "coveredSegments": ["Array of segment codes from: A1, A2, B1, B2, B3, C1, C2, C3"],
  "isGeneric": true,
  "coveredScopes": [],
  "scopeLanguage": "The exact verbatim sentence(s) from the document describing the scope of work covered. If there are no scope restrictions, use 'No specific scope restrictions — all construction work types covered.'"
}

Important rules:
- Set isGeneric to true if the variance covers ALL work types with no specific restrictions. Set to false if it restricts to specific types of work.
- If isGeneric is false, populate coveredScopes with applicable values from: ${scopeList}
- If isGeneric is false, populate coveredScopes with applicable values and leave it empty if isGeneric is true.`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { inline_data: { mime_type: 'application/pdf', data: base64 } },
              { text: prompt },
            ],
          }],
          generationConfig: { temperature: 0.1 },
        }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini API ${response.status}: ${errText.slice(0, 500)}`);
    }

    const data = await response.json();
    const text: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

    // Strip markdown fences if Gemini added them anyway
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error(`No JSON in AI response: ${text.slice(0, 300)}`);

    const extracted = JSON.parse(jsonMatch[0]);

    // Fetch existing variances to run duplicate/revision detection
    const existingSnap = await getDocs(collection(db, 'variances'));
    const existing = existingSnap.docs
      .map(d => ({ id: d.id, ...d.data() }) as NoiseVariance)
      .filter(v => v.id !== id && v.scanStatus === 'complete' && !v.isArchived);

    const reviewFlags = detectReviewFlags(extracted, existing);
    const needsReview = reviewFlags !== null;

    await updateDoc(doc(db, 'variances', id), {
      title: extracted.title || file.name.replace(/\.[^/.]+$/, ''),
      permitNumber: extracted.permitNumber || '',
      validFrom: extracted.validFrom || '',
      validThrough: extracted.validThrough || '',
      applicableHours: (['nighttime', '24_7', 'both'].includes(extracted.applicableHours)
        ? extracted.applicableHours : 'nighttime'),
      coveredSegments: Array.isArray(extracted.coveredSegments) ? extracted.coveredSegments : [],
      isGeneric: extracted.isGeneric === false ? false : true,
      coveredScopes: Array.isArray(extracted.coveredScopes) ? extracted.coveredScopes : [],
      scopeLanguage: extracted.scopeLanguage || '',
      scanStatus: needsReview ? 'pending_review' : 'complete',
      ...(needsReview ? { reviewFlags } : { reviewFlags: null }),
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await updateDoc(doc(db, 'variances', id), {
      scanStatus: 'error',
      scanError: message,
    });
  }
}

// ── Review flag detection ─────────────────────────────────────────────────────

function detectReviewFlags(
  extracted: Record<string, unknown>,
  existing: NoiseVariance[],
): NoiseVariance['reviewFlags'] | null {
  const flags: NonNullable<NoiseVariance['reviewFlags']> = {};
  let hasFlags = false;

  // 1. Permit number exact match → very likely a revision
  const permitNumber = (extracted.permitNumber as string | undefined)?.trim().toLowerCase();
  if (permitNumber) {
    const match = existing.find(v => v.permitNumber?.trim().toLowerCase() === permitNumber);
    if (match) {
      flags.possibleRevision = {
        varianceId: match.id,
        title: match.title,
        reason: 'Permit number matches an existing variance',
      };
      hasFlags = true;
    }
  }

  // 2. Segment overlap + date range overlap → probable revision (only if no permit match)
  if (!flags.possibleRevision) {
    const newSegments = (extracted.coveredSegments as string[] | undefined) ?? [];
    const newValidFrom = extracted.validFrom as string | undefined;

    if (newSegments.length && newValidFrom) {
      const overlap = existing.find(v =>
        v.coveredSegments.some(s => newSegments.includes(s)) &&
        v.validThrough &&
        newValidFrom <= v.validThrough   // new starts before old expires
      );
      if (overlap) {
        flags.possibleRevision = {
          varianceId: overlap.id,
          title: overlap.title,
          reason: `Overlapping segments (${newSegments.filter(s => overlap.coveredSegments.includes(s)).join(', ')}) with an active variance`,
        };
        hasFlags = true;
      }
    }
  }

  // 3. Missing critical fields
  const missing: string[] = [];
  if (!extracted.validThrough)                                   missing.push('Expiration date');
  if (!(extracted.coveredSegments as string[] | undefined)?.length) missing.push('Covered segments');
  if (!extracted.permitNumber)                                   missing.push('Permit number');
  if (missing.length) { flags.missingFields = missing; hasFlags = true; }

  // 4. Low confidence — nothing meaningful extracted
  if (!extracted.validThrough && !(extracted.coveredSegments as string[] | undefined)?.length && !extracted.permitNumber) {
    flags.lowConfidence = true;
    hasFlags = true;
  }

  return hasFlags ? flags : null;
}

// ── Review queue actions ──────────────────────────────────────────────────────

/** Approve a pending_review variance as a brand-new standalone document. */
export async function approveVariance(id: string): Promise<void> {
  await updateDoc(doc(db, 'variances', id), {
    scanStatus: 'complete',
    reviewFlags: null,
  });
}

/** Approve a pending_review variance as a revision of an existing variance.
 *  Archives the entire target family and links this doc as the new active revision. */
export async function approveAsRevision(
  newId: string,
  targetRootId: string,
): Promise<void> {
  const snap = await getDocs(collection(db, 'variances'));
  const family = snap.docs
    .map(d => ({ id: d.id, ...d.data() }) as NoiseVariance)
    .filter(v => v.id === targetRootId || v.parentVarianceId === targetRootId);

  const maxRev = family.reduce((m, v) => Math.max(m, v.revisionNumber ?? 0), 0);

  const batch = writeBatch(db);
  for (const member of family) {
    batch.update(doc(db, 'variances', member.id), { isArchived: true });
  }
  batch.update(doc(db, 'variances', newId), {
    parentVarianceId: targetRootId,
    revisionNumber: maxRev + 1,
    isArchived: false,
    scanStatus: 'complete',
    reviewFlags: null,
  });
  await batch.commit();
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

export async function updateVariance(id: string, updates: Partial<Omit<NoiseVariance, 'id'>>) {
  await updateDoc(doc(db, 'variances', id), updates as Record<string, unknown>);
}

export async function deleteVariance(id: string) {
  await deleteDoc(doc(db, 'variances', id));
}

export async function retryVarianceScan(variance: NoiseVariance): Promise<void> {
  await updateDoc(doc(db, 'variances', variance.id), { scanStatus: 'scanning', scanError: undefined });
  // Re-fetch the file and scan
  try {
    const response = await fetch(variance.fileUrl);
    const blob = await response.blob();
    const file = new File([blob], variance.fileName, { type: 'application/pdf' });
    await scanWithGemini(variance.id, file);
  } catch (err) {
    await updateDoc(doc(db, 'variances', variance.id), {
      scanStatus: 'error',
      scanError: err instanceof Error ? err.message : 'Failed to fetch file for retry',
    });
  }
}

// ── Expiry helpers ────────────────────────────────────────────────────────────

export function getVarianceExpiryStatus(variance: NoiseVariance): VarianceExpiryStatus {
  if (!variance.validThrough) return 'unknown';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(variance.validThrough + 'T00:00:00');
  const daysUntil = Math.ceil((expiry.getTime() - today.getTime()) / 86400000);
  if (daysUntil < 0) return 'expired';
  if (daysUntil <= 30) return 'critical';
  if (daysUntil <= 90) return 'warning';
  return 'valid';
}

export function daysUntilExpiry(variance: NoiseVariance): number | null {
  if (!variance.validThrough) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(variance.validThrough + 'T00:00:00');
  return Math.ceil((expiry.getTime() - today.getTime()) / 86400000);
}

// ── Recommendation engine ─────────────────────────────────────────────────────

export interface VarianceMatch {
  variance: NoiseVariance;
  score: number;   // 0–3: segment match (2) + scope match (1) + valid (bonus)
  reasons: string[];
}

export function recommendVariances(
  variances: NoiseVariance[],
  planSegment: string,
  planScope: string,
  planNeedByDate: string,
): VarianceMatch[] {
  const eligible = variances.filter(v => v.scanStatus === 'complete');

  return eligible
    .map(v => {
      let score = 0;
      const reasons: string[] = [];

      // Segment match
      if (v.coveredSegments.includes(planSegment)) {
        score += 2;
        reasons.push(`Covers Segment ${planSegment}`);
      }

      // Scope match
      if (v.isGeneric) {
        score += 1;
        reasons.push('Generic — covers all work types');
      } else if (v.coveredScopes.includes(planScope)) {
        score += 1;
        reasons.push(`Covers ${planScope} scope`);
      }

      // Validity check
      const expiryStatus = getVarianceExpiryStatus(v);
      if (expiryStatus === 'valid' || expiryStatus === 'warning') {
        reasons.push(`Valid through ${formatDate(v.validThrough)}`);
      } else if (expiryStatus === 'critical') {
        reasons.push(`Expires soon — ${formatDate(v.validThrough)}`);
      } else if (expiryStatus === 'expired') {
        score = 0; // expired variances never recommend
        reasons.push('Expired');
      }

      // Need-by date coverage
      if (planNeedByDate && v.validThrough && planNeedByDate <= v.validThrough) {
        score += 1;
        reasons.push('Covers your Need By date');
      }

      return { variance: v, score, reasons };
    })
    .filter(m => m.score > 0)
    .sort((a, b) => b.score - a.score);
}

function formatDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
