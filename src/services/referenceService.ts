import { collection, addDoc, onSnapshot, deleteDoc, doc, query, orderBy } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage } from '../firebase';
import type { ReferenceDoc, ReferenceDocCategory } from '../types';

export async function uploadReferenceDoc(
  file: File,
  title: string,
  category: ReferenceDocCategory,
  description: string,
  uploadedBy: string
): Promise<void> {
  const id = `ref_${Date.now()}`;
  const storagePath = `reference/${id}_${file.name}`;
  const storageRef = ref(storage, storagePath);
  await uploadBytes(storageRef, file);
  const fileUrl = await getDownloadURL(storageRef);

  await addDoc(collection(db, 'reference_docs'), {
    id,
    title,
    category,
    description: description.trim(),
    fileUrl,
    fileName: file.name,
    storagePath,
    uploadedAt: new Date().toISOString(),
    uploadedBy,
  });
}

export async function deleteReferenceDoc(firestoreId: string, storagePath: string): Promise<void> {
  try {
    await deleteObject(ref(storage, storagePath));
  } catch (e) {
    console.warn('Storage delete failed (may already be gone):', e);
  }
  await deleteDoc(doc(db, 'reference_docs', firestoreId));
}

export function subscribeReferenceDocs(
  callback: (docs: (ReferenceDoc & { _fid: string })[]) => void
): () => void {
  const q = query(collection(db, 'reference_docs'), orderBy('uploadedAt', 'desc'));
  return onSnapshot(q, snapshot => {
    callback(
      snapshot.docs.map(d => ({ _fid: d.id, ...(d.data() as ReferenceDoc) }))
    );
  });
}
