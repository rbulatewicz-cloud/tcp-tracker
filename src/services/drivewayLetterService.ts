import {
  collection, doc, addDoc, updateDoc, deleteDoc,
  onSnapshot, query, orderBy, getDoc, setDoc, arrayUnion, deleteField,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase';
import { DrivewayLetter, DrivewayLetterStatus, MetroComment } from '../types';
import { DrivewayNoticeFields } from './drivewayNoticeService';
import { SEGMENT_STREETS } from '../constants';

const COL = 'driveway_letters';

// ── Subscribe ─────────────────────────────────────────────────────────────────

export function subscribeToDrivewayLetters(
  cb: (letters: DrivewayLetter[]) => void
): () => void {
  const q = query(collection(db, COL), orderBy('createdAt', 'desc'));
  return onSnapshot(q, snap => {
    cb(snap.docs.map(d => ({ id: d.id, ...d.data() } as DrivewayLetter)));
  });
}

// ── Create / save draft ───────────────────────────────────────────────────────

export async function saveDrivewayLetterDraft(
  letter: Omit<DrivewayLetter, 'id'>
): Promise<string> {
  const docRef = await addDoc(collection(db, COL), {
    ...letter,
    createdAt: new Date().toISOString(),
    status: 'draft',
    source: 'drafted',
    scanStatus: 'complete',
  });
  return docRef.id;
}

export async function updateDrivewayLetter(
  id: string,
  patch: Partial<Omit<DrivewayLetter, 'id'>>
): Promise<void> {
  await updateDoc(doc(db, COL, id), {
    ...patch,
    updatedAt: new Date().toISOString(),
  });
}

// ── Status transitions ────────────────────────────────────────────────────────

export async function approveDrivewayLetter(id: string): Promise<void> {
  await updateDoc(doc(db, COL, id), {
    status: 'approved' as DrivewayLetterStatus,
    approvedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}

export async function markDrivewayLetterSent(id: string, dateStr?: string): Promise<void> {
  const ts = dateStr ? new Date(dateStr + 'T12:00:00').toISOString() : new Date().toISOString();
  await updateDoc(doc(db, COL, id), {
    status: 'sent' as DrivewayLetterStatus,
    sentAt: ts,
    updatedAt: new Date().toISOString(),
  });
}

// ── Metro review workflow ─────────────────────────────────────────────────────

export async function submitLetterToMetro(id: string, dateStr?: string): Promise<void> {
  const ts = dateStr ? new Date(dateStr + 'T12:00:00').toISOString() : new Date().toISOString();
  await updateDoc(doc(db, COL, id), {
    status: 'submitted_to_metro' as DrivewayLetterStatus,
    metroSubmittedAt: ts,
    updatedAt: new Date().toISOString(),
  });
}

export async function metroApproveLetter(id: string, dateStr?: string): Promise<void> {
  const ts = dateStr ? new Date(dateStr + 'T12:00:00').toISOString() : new Date().toISOString();
  await updateDoc(doc(db, COL, id), {
    status: 'approved' as DrivewayLetterStatus,
    metroApprovedAt: ts,
    approvedAt: ts,
    updatedAt: new Date().toISOString(),
  });
}

export async function metroRequestRevision(
  id: string,
  commentText: string,
  addedBy: string
): Promise<void> {
  const comment: MetroComment = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2),
    text: commentText,
    addedAt: new Date().toISOString(),
    addedBy,
    isRevisionRequest: true,
  };
  await updateDoc(doc(db, COL, id), {
    status: 'metro_revision_requested' as DrivewayLetterStatus,
    metroRevisionCount: (await getDoc(doc(db, COL, id))).data()?.metroRevisionCount + 1 || 1,
    metroComments: arrayUnion(comment),
    updatedAt: new Date().toISOString(),
  });
}

export async function resubmitLetterToMetro(id: string, dateStr?: string): Promise<void> {
  const ts = dateStr ? new Date(dateStr + 'T12:00:00').toISOString() : new Date().toISOString();
  await updateDoc(doc(db, COL, id), {
    status: 'submitted_to_metro' as DrivewayLetterStatus,
    metroSubmittedAt: ts,
    updatedAt: new Date().toISOString(),
  });
}

export async function revertDrivewayLetterStatus(
  id: string,
  toStatus: DrivewayLetterStatus
): Promise<void> {
  const clearFields: Record<string, unknown> = {
    status: toStatus,
    updatedAt: new Date().toISOString(),
  };
  // Clear forward-state timestamps when reverting back
  if (toStatus === 'draft') {
    clearFields.metroSubmittedAt = null;
    clearFields.metroApprovedAt  = null;
    clearFields.approvedAt       = null;
  } else if (toStatus === 'submitted_to_metro') {
    clearFields.metroApprovedAt = null;
    clearFields.approvedAt      = null;
    clearFields.metroSubmittedAt = new Date().toISOString();
  } else if (toStatus === 'approved') {
    clearFields.sentAt = null;
  }
  await updateDoc(doc(db, COL, id), clearFields);
}

export async function addMetroComment(
  id: string,
  text: string,
  addedBy: string
): Promise<void> {
  const comment: MetroComment = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2),
    text,
    addedAt: new Date().toISOString(),
    addedBy,
  };
  await updateDoc(doc(db, COL, id), {
    metroComments: arrayUnion(comment),
    updatedAt: new Date().toISOString(),
  });
}

// ── Upload + AI scan ──────────────────────────────────────────────────────────

const EMPTY_FIELDS: DrivewayNoticeFields = {
  letterDate: '',
  projectName: '',
  businessName: '',
  contactName: '',
  contactTitle: '',
  contactPhone: '',
  contactEmail: '',
  street1: '',
  street2: '',
  segment: '',
  workDates: '',
  workHoursDescription: '',
  recipientAddress: '',
  recipientName: '',
  remainingDrivewayOpen: false,
  bodyParagraph: '',
  bodyParagraphEs: '',
};

export async function uploadAndScanDrivewayLetter(
  file: File,
  uploadedBy: string
): Promise<string> {
  if (!file.type.includes('pdf')) throw new Error('Only PDF files are supported.');

  const id = `dl_${Date.now()}`;

  // 1. Upload PDF to Storage
  const storageRef = ref(storage, `driveway-letters/${id}/original_${file.name}`);
  await uploadBytes(storageRef, file);
  const letterUrl = await getDownloadURL(storageRef);

  // 2. Create placeholder record
  const placeholder: Omit<DrivewayLetter, 'id'> = {
    planId: '',
    planLoc: '',
    addressId: '',
    address: file.name.replace(/\.[^/.]+$/, ''),
    segment: '',
    status: 'draft',
    source: 'uploaded',
    fields: { ...EMPTY_FIELDS },
    letterUrl,
    scanStatus: 'scanning',
    createdAt: new Date().toISOString(),
    createdBy: uploadedBy,
  };
  await setDoc(doc(db, COL, id), placeholder);

  // 3. AI scan async
  scanDrivewayLetterWithGemini(id, file).catch(err =>
    console.error('Driveway letter scan error:', err)
  );

  return id;
}

async function scanDrivewayLetterWithGemini(id: string, file: File): Promise<void> {
  try {
    const aiSnap = await getDoc(doc(db, 'settings', 'aiConfig'));
    const apiKey: string | undefined = aiSnap.exists() ? aiSnap.data().geminiApiKey : undefined;

    if (!apiKey) {
      await updateDoc(doc(db, COL, id), {
        scanStatus: 'error',
        scanError: 'No Gemini API key configured. Add it in Settings → System → AI Configuration.',
      });
      return;
    }

    // Convert PDF to base64
    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = '';
    const chunkSize = 8192;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    const base64 = btoa(binary);

    const segRef = Object.entries(SEGMENT_STREETS)
      .map(([seg, streets]) => `  ${seg}: ${streets.join(', ')}`)
      .join('\n');

    const today = new Date().toISOString().slice(0, 10);

    const prompt = `You are analyzing a driveway impact notice letter for the ESFV Light Rail Transit construction project in Los Angeles.

Extract the information below and return ONLY valid JSON — no markdown fences, no extra text.

Today's date: ${today}

Segment reference (map streets/locations to these codes):
${segRef}

Return this exact JSON structure:
{
  "letterDate": "YYYY-MM-DD, or empty string if not found",
  "recipientAddress": "Mailing address of the letter recipient — who the letter is physically sent to (may be a property management company at a different address than the impacted driveway)",
  "drivewayImpactAddress": "The specific driveway or property address that will be physically impacted/blocked. Look in the body of the letter for phrases like 'your driveway at [ADDRESS]' or 'the property at [ADDRESS]'. If only one address appears, use it for both this field and recipientAddress.",
  "recipientName": "Recipient name, or empty string if not found",
  "street1": "Primary work location street",
  "street2": "Cross street or empty string",
  "segment": "One segment code from: A1, A2, B1, B2, B3, C1, C2, C3, or empty string",
  "workDates": "Work date range exactly as written in the letter, e.g. 'April 1 – June 30, 2025'",
  "workHoursDescription": "Work hours exactly as written, e.g. 'nighttime hours (9:00 PM to 6:00 AM) Monday through Friday'",
  "projectName": "Project name",
  "businessName": "Contractor or company name",
  "contactName": "Contact person full name",
  "contactTitle": "Contact person title or role",
  "contactPhone": "Contact phone number",
  "contactEmail": "Contact email address",
  "remainingDrivewayOpen": false,
  "bodyParagraph": "The main English body paragraph text of the letter",
  "bodyParagraphEs": "The Spanish body paragraph text, or empty string if not present"
}

Important: set remainingDrivewayOpen to true only if the letter explicitly states that one driveway will remain open/accessible.`;

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
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error(`No JSON in AI response: ${text.slice(0, 300)}`);

    const extracted = JSON.parse(jsonMatch[0]);

    const fields: DrivewayNoticeFields = {
      letterDate:            extracted.letterDate || '',
      recipientAddress:      extracted.recipientAddress || '',
      drivewayImpactAddress: extracted.drivewayImpactAddress || extracted.recipientAddress || '',
      recipientName:         extracted.recipientName || '',
      street1:               extracted.street1 || '',
      street2:               extracted.street2 || '',
      segment:               extracted.segment || '',
      workDates:             extracted.workDates || '',
      workHoursDescription:  extracted.workHoursDescription || '',
      projectName:           extracted.projectName || '',
      businessName:          extracted.businessName || '',
      contactName:           extracted.contactName || '',
      contactTitle:          extracted.contactTitle || '',
      contactPhone:          extracted.contactPhone || '',
      contactEmail:          extracted.contactEmail || '',
      remainingDrivewayOpen: extracted.remainingDrivewayOpen === true,
      bodyParagraph:         extracted.bodyParagraph || '',
      bodyParagraphEs:       extracted.bodyParagraphEs || '',
    };

    // letter.address = impacted driveway address (not mailing address)
    const impactAddress = fields.drivewayImpactAddress || fields.recipientAddress || 'Unknown address';

    await updateDoc(doc(db, COL, id), {
      fields,
      address: impactAddress,
      ownerName: fields.recipientName || '',
      segment: fields.segment || '',
      scanStatus: 'needs_review',
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await updateDoc(doc(db, COL, id), {
      scanStatus: 'error',
      scanError: message,
    });
  }
}

export async function retryDrivewayLetterScan(id: string, file: File): Promise<void> {
  await updateDoc(doc(db, COL, id), { scanStatus: 'scanning', scanError: deleteField() });
  scanDrivewayLetterWithGemini(id, file).catch(err => console.error('Retry scan error:', err));
}

/**
 * Re-run AI extraction on a previously confirmed letter using its stored PDF URL.
 * No file re-upload needed — fetches from Firebase Storage and rescans.
 * Puts the letter back into needs_review so the user can confirm the updated fields.
 */
export async function rescanDrivewayLetterFromUrl(id: string, letterUrl: string): Promise<void> {
  await updateDoc(doc(db, COL, id), { scanStatus: 'scanning', scanError: deleteField() });
  try {
    const response = await fetch(letterUrl);
    if (!response.ok) throw new Error(`Failed to fetch PDF (${response.status})`);
    const blob = await response.blob();
    const file = new File([blob], 'letter.pdf', { type: 'application/pdf' });
    scanDrivewayLetterWithGemini(id, file).catch(err => console.error('Rescan error:', err));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await updateDoc(doc(db, COL, id), { scanStatus: 'error', scanError: `Could not fetch stored PDF: ${message}` });
  }
}

// ── Exhibit 1 image upload ────────────────────────────────────────────────────

export async function uploadExhibitImage(
  letterId: string,
  file: File
): Promise<string> {
  const storageRef = ref(storage, `driveway-letters/${letterId}/exhibit1${getExt(file.name)}`);
  await uploadBytes(storageRef, file);
  const url = await getDownloadURL(storageRef);
  await updateDoc(doc(db, COL, letterId), {
    exhibitImageUrl: url,
    updatedAt: new Date().toISOString(),
  });
  return url;
}

// ── Final letter file upload (approved docx/PDF) ──────────────────────────────

export async function uploadFinalLetter(
  letterId: string,
  blob: Blob,
  filename: string
): Promise<string> {
  const storageRef = ref(storage, `driveway-letters/${letterId}/final_${filename}`);
  await uploadBytes(storageRef, blob);
  const url = await getDownloadURL(storageRef);
  await updateDoc(doc(db, COL, letterId), {
    letterUrl: url,
    updatedAt: new Date().toISOString(),
  });
  return url;
}

// ── Delete ────────────────────────────────────────────────────────────────────

export async function deleteDrivewayLetter(id: string): Promise<void> {
  await deleteDoc(doc(db, COL, id));
}

// ── Corpus helpers ────────────────────────────────────────────────────────────

export function pickCorpusExamples(
  allLetters: DrivewayLetter[],
  segment: string,
  limit = 3
): DrivewayNoticeFields[] {
  const MATURE_STATUSES: DrivewayLetterStatus[] = ['submitted_to_metro', 'metro_revision_requested', 'approved', 'sent'];
  return allLetters
    .filter(l => MATURE_STATUSES.includes(l.status) && l.segment === segment)
    .slice(0, limit)
    .map(l => l.fields);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getExt(filename: string): string {
  const m = filename.match(/\.[^.]+$/);
  return m ? m[0] : '';
}
