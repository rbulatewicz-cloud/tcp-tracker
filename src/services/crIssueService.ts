import {
  collection, doc, addDoc, updateDoc, deleteDoc,
  onSnapshot, query, orderBy, arrayUnion, getDoc,
} from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage } from '../firebase';
import { CRIssue, CRIssueNote, CRIssueStatus, CRIssueAttachment } from '../types';
import {
  sendCRIssueAssignedEmail,
  sendCRIssueUpdatedEmail,
  sendConstituentAckEmail,
  sendConstituentResolvedEmail,
} from './emailTriggerActions';

const COL = 'cr_issues';

export function subscribeToCRIssues(
  cb: (issues: CRIssue[]) => void
): () => void {
  const q = query(collection(db, COL), orderBy('createdAt', 'desc'));
  return onSnapshot(q, snap => {
    cb(snap.docs.map(d => ({ id: d.id, ...d.data() } as CRIssue)));
  });
}

export async function createCRIssue(
  data: Omit<CRIssue, 'id' | 'createdAt' | 'updatedAt' | 'resolvedAt' | 'notes'>,
  createdBy: string
): Promise<string> {
  const ref = await addDoc(collection(db, COL), {
    ...data,
    status: data.status ?? 'open',
    notes: [],
    createdBy,
    createdAt: new Date().toISOString(),
  });
  // 5A: Constituent acknowledgment — non-fatal
  const newIssue = { id: ref.id, ...data, notes: [], createdBy, createdAt: new Date().toISOString() } as CRIssue;
  sendConstituentAckEmail(newIssue).catch(console.warn);
  return ref.id;
}

export async function updateCRIssue(
  id: string,
  patch: Partial<Omit<CRIssue, 'id' | 'createdAt' | 'createdBy'>>,
  actorEmail = '',
): Promise<void> {
  await updateDoc(doc(db, COL, id), {
    ...patch,
    updatedAt: new Date().toISOString(),
  });
  // Fetch the updated issue for email context (best-effort)
  if (actorEmail) {
    getDoc(doc(db, COL, id)).then(snap => {
      if (!snap.exists()) return;
      const issue = { id: snap.id, ...snap.data() } as CRIssue;
      // 4C: Issue assigned
      if (patch.assignedTo) {
        sendCRIssueAssignedEmail(issue, actorEmail).catch(console.warn);
      }
      // 4D: Status changed
      if (patch.status) {
        sendCRIssueUpdatedEmail(issue, patch.status, actorEmail).catch(console.warn);
      }
    }).catch(console.warn);
  }
}

export async function resolveCRIssue(id: string, resolvedBy: string): Promise<void> {
  await updateDoc(doc(db, COL, id), {
    status: 'resolved' as CRIssueStatus,
    resolvedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    resolvedBy,
  });
  // 4D + 5B: team updated email + constituent resolved email — non-fatal
  getDoc(doc(db, COL, id)).then(snap => {
    if (!snap.exists()) return;
    const issue = { id: snap.id, ...snap.data() } as CRIssue;
    sendCRIssueUpdatedEmail(issue, 'resolved', resolvedBy).catch(console.warn);
    sendConstituentResolvedEmail(issue).catch(console.warn);
  }).catch(console.warn);
}

export async function addCRIssueNote(
  issueId: string,
  note: Omit<CRIssueNote, 'id'>
): Promise<void> {
  const newNote: CRIssueNote = {
    ...note,
    id: `note_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
  };
  await updateDoc(doc(db, COL, issueId), {
    notes: arrayUnion(newNote),
    updatedAt: new Date().toISOString(),
  });
}

export async function addCRIssueAttachment(
  issueId: string,
  file: File,
  uploadedBy: string
): Promise<CRIssueAttachment> {
  const id = `att_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const storagePath = `cr-issues/${issueId}/${id}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const fileRef = storageRef(storage, storagePath);
  await uploadBytes(fileRef, file);
  const url = await getDownloadURL(fileRef);
  const attachment: CRIssueAttachment = {
    id,
    name: file.name,
    url,
    storagePath,
    uploadedAt: new Date().toISOString(),
    uploadedBy,
  };
  await updateDoc(doc(db, COL, issueId), {
    attachments: arrayUnion(attachment),
    updatedAt: new Date().toISOString(),
  });
  return attachment;
}

export async function removeCRIssueAttachment(
  issueId: string,
  attachment: CRIssueAttachment,
  currentAttachments: CRIssueAttachment[]
): Promise<void> {
  try {
    await deleteObject(storageRef(storage, attachment.storagePath));
  } catch {
    console.warn('Storage delete failed (may already be gone)');
  }
  await updateDoc(doc(db, COL, issueId), {
    attachments: currentAttachments.filter(a => a.id !== attachment.id),
    updatedAt: new Date().toISOString(),
  });
}

export async function deleteCRIssue(id: string): Promise<void> {
  await deleteDoc(doc(db, COL, id));
}

// ── AI parse ──────────────────────────────────────────────────────────────────

export interface ParsedIssueFields {
  title?: string;
  description?: string;
  category?: CRIssueCategory;
  priority?: CRIssuePriority;
  reportedByName?: string;
  reportedByPhone?: string;
  reportedByEmail?: string;
  loggedVia?: CRIssueLogMethod;
  planLoc?: string;
  propertyAddress?: string;
}

export async function parseIssueFromText(text: string): Promise<ParsedIssueFields> {
  const aiSnap = await getDoc(doc(db, 'settings', 'aiConfig'));
  const apiKey: string | undefined = aiSnap.exists() ? (aiSnap.data().geminiApiKey as string) : undefined;
  if (!apiKey) throw new Error('No Gemini API key configured. Add it in Settings → System → AI Configuration.');

  const prompt = `You are a community relations intake assistant for the Los Angeles Metro Extension project (ESFV LRT Extension). Parse the following email chain or chat conversation and extract complaint/issue details.

Return ONLY a raw JSON object — no markdown fences, no explanation. Include only fields you can confidently determine:
{
  "title": "Short, specific issue title (max 80 chars)",
  "description": "Full description of the complaint or concern in 1-4 sentences",
  "category": one of ["noise_complaint","access_blocked","safety_concern","property_damage","communication","schedule_conflict","other"],
  "priority": one of ["low","medium","high","urgent"] — use urgent only for immediate safety/emergency situations,
  "reportedByName": "Full name of the person reporting the issue",
  "reportedByPhone": "Phone number if present",
  "reportedByEmail": "Email address if present",
  "loggedVia": one of ["phone_call","email","in_person","walk_in","online_form","social_media","other"] — infer from context (email thread → "email", text chat → "other"),
  "planLoc": "LOC number or plan identifier if mentioned (e.g. LOC-042)",
  "propertyAddress": "Street address of the affected property if mentioned"
}

TEXT TO PARSE:
${text.slice(0, 8000)}`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 1024 },
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API error: ${err.slice(0, 300)}`);
  }

  const data = await res.json();
  const raw = (data.candidates?.[0]?.content?.parts?.[0]?.text ?? '') as string;
  const clean = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

  try {
    return JSON.parse(clean) as ParsedIssueFields;
  } catch {
    throw new Error(`Could not parse AI response. Raw: ${raw.slice(0, 200)}`);
  }
}
