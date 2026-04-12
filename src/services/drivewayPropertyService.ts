import {
  collection, doc, addDoc, updateDoc, deleteDoc,
  onSnapshot, query, orderBy,
} from 'firebase/firestore';
import { db } from '../firebase';
import { DrivewayProperty } from '../types';

const COL = 'driveway_properties';

export function subscribeToDrivewayProperties(
  cb: (props: DrivewayProperty[]) => void
): () => void {
  const q = query(collection(db, COL), orderBy('address'));
  return onSnapshot(q, snap => {
    cb(snap.docs.map(d => ({ id: d.id, ...d.data() } as DrivewayProperty)));
  });
}

export async function createDrivewayProperty(
  data: Omit<DrivewayProperty, 'id' | 'createdAt' | 'createdBy'>,
  createdBy: string
): Promise<string> {
  const ref = await addDoc(collection(db, COL), {
    ...data,
    createdBy,
    createdAt: new Date().toISOString(),
  });
  return ref.id;
}

export async function updateDrivewayProperty(
  id: string,
  patch: Partial<Omit<DrivewayProperty, 'id' | 'createdAt' | 'createdBy'>>
): Promise<void> {
  await updateDoc(doc(db, COL, id), {
    ...patch,
    updatedAt: new Date().toISOString(),
  });
}

export async function deleteDrivewayProperty(id: string): Promise<void> {
  await deleteDoc(doc(db, COL, id));
}
