import {
  collection, doc, addDoc, updateDoc, deleteDoc,
  onSnapshot, query, orderBy,
} from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase';
import { CDMeeting } from '../types';

const COL = 'cd_meetings';

// ── Subscriptions ─────────────────────────────────────────────────────────────

export function subscribeToCDMeetings(
  cb: (meetings: CDMeeting[]) => void
): () => void {
  const q = query(collection(db, COL), orderBy('meetingDate', 'desc'));
  return onSnapshot(q, snap => {
    cb(snap.docs.map(d => ({ id: d.id, ...d.data() } as CDMeeting)));
  });
}

// ── Create ────────────────────────────────────────────────────────────────────

export async function createCDMeeting(
  data: Omit<CDMeeting, 'id' | 'createdAt' | 'createdBy'>,
  createdBy: string
): Promise<string> {
  const ref = await addDoc(collection(db, COL), {
    ...data,
    createdBy,
    createdAt: new Date().toISOString(),
  });
  return ref.id;
}

// ── Update ────────────────────────────────────────────────────────────────────

export async function updateCDMeeting(
  id: string,
  patch: Partial<Omit<CDMeeting, 'id' | 'createdAt' | 'createdBy'>>
): Promise<void> {
  await updateDoc(doc(db, COL, id), patch as Record<string, unknown>);
}

export async function deleteCDMeeting(id: string): Promise<void> {
  await deleteDoc(doc(db, COL, id));
}

// ── Combined deck upload ──────────────────────────────────────────────────────

export async function uploadCombinedDeck(
  meetingId: string,
  file: File,
  uploadedBy: string
): Promise<{ url: string; name: string }> {
  const ext = file.name.split('.').pop() ?? 'pptx';
  const path = `cd-meetings/${meetingId}/combined_${Date.now()}.${ext}`;
  const fileRef = storageRef(storage, path);
  await uploadBytes(fileRef, file);
  const url = await getDownloadURL(fileRef);
  return { url, name: file.name };
}

// ── CD slide upload (per plan) ────────────────────────────────────────────────

export async function uploadCDSlide(
  planId: string,
  file: File,
  uploadedBy: string
): Promise<{ url: string; name: string; uploadedAt: string; uploadedBy: string }> {
  const path = `cd-slides/${planId}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const fileRef = storageRef(storage, path);
  await uploadBytes(fileRef, file);
  const url = await getDownloadURL(fileRef);
  return { url, name: file.name, uploadedAt: new Date().toISOString(), uploadedBy };
}

// ── Concurrence letter upload (per plan per CD) ───────────────────────────────

export async function uploadConcurrenceLetter(
  planId: string,
  cd: string,
  file: File,
  uploadedBy: string
): Promise<{ url: string; name: string; uploadedAt: string; uploadedBy: string }> {
  const ext = file.name.split('.').pop() ?? 'pdf';
  const path = `cd-slides/${planId}/concurrence_${cd}_${Date.now()}.${ext}`;
  const fileRef = storageRef(storage, path);
  await uploadBytes(fileRef, file);
  const url = await getDownloadURL(fileRef);
  return { url, name: file.name, uploadedAt: new Date().toISOString(), uploadedBy };
}

// ── ZIP download helper ───────────────────────────────────────────────────────

/**
 * Downloads all CD slides for a set of plans as individual files.
 * (In-browser ZIP assembly requires JSZip — we use a simpler approach:
 *  open each slide URL in a new tab for manual save, or use the anchor trick.)
 *
 * Returns the list of { locLabel, url, name } for the caller to present.
 */
export function collectSlideDownloads(
  plans: Array<{ id: string; loc?: string; locLabel?: string; slideUrl?: string; slideName?: string }>
): Array<{ label: string; url: string; name: string }> {
  return plans
    .filter(p => p.slideUrl)
    .map(p => ({
      label: p.loc ?? p.locLabel ?? p.id,
      url:   p.slideUrl!,
      name:  p.slideName ?? `${p.loc ?? p.id}_cd_slide.pptx`,
    }));
}
