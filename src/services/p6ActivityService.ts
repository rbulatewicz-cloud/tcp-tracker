/**
 * P6 activity phonebook — Firestore read/write layer.
 *
 * Two collections:
 *   p6_activities/{activityId}    — one doc per activity (id, name, wbsPath, searchTokens, lastSeenAt)
 *   p6_schedule_meta/current      — single doc with last-upload metadata
 *
 * Upload strategy is MERGE (user chose option b): new uploads add new activities
 * and refresh existing ones (name/wbsPath/lastSeenAt). Activities not in the latest
 * upload are left in place so historical plan links keep displaying. A future
 * "clear all" admin action can prune them when stale entries become noisy.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  Timestamp,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { P6Activity, buildSearchTokens } from './xerParser';

const ACTIVITIES_COLLECTION = 'p6_activities';
const META_COLLECTION = 'p6_schedule_meta';
const META_DOC = 'current';

// Firestore batched writes cap at 500 ops. Stay safely under.
const BATCH_SIZE = 400;

export interface P6ActivityDoc extends P6Activity {
  searchTokens: string[];
  lastSeenAt: Timestamp | null;
}

export interface P6ScheduleMeta {
  uploadedAt: Timestamp | null;
  uploadedBy: string;       // email
  fileName: string;
  projectName: string;
  activityCount: number;
}

/**
 * Merge an array of parsed activities into the phonebook collection.
 * Existing docs are updated (name, wbsPath, searchTokens, lastSeenAt refreshed).
 * Missing docs are created. Activities not present in this upload are NOT deleted.
 */
export async function uploadP6Activities(
  activities: P6Activity[],
  meta: { fileName: string; projectName: string; uploadedBy: string }
): Promise<{ written: number }> {
  if (!activities.length) throw new Error('No activities to upload');

  let written = 0;
  try {
    for (let i = 0; i < activities.length; i += BATCH_SIZE) {
      const chunk = activities.slice(i, i + BATCH_SIZE);
      const batch = writeBatch(db);
      for (const a of chunk) {
        const ref = doc(db, ACTIVITIES_COLLECTION, a.id);
        const payload: Omit<P6ActivityDoc, 'lastSeenAt'> & { lastSeenAt: ReturnType<typeof serverTimestamp> } = {
          id: a.id,
          name: a.name,
          wbsPath: a.wbsPath,
          searchTokens: buildSearchTokens(a),
          lastSeenAt: serverTimestamp(),
        };
        batch.set(ref, payload, { merge: true });
      }
      await batch.commit();
      written += chunk.length;
    }

    const metaRef = doc(db, META_COLLECTION, META_DOC);
    const metaPayload = {
      uploadedAt: serverTimestamp(),
      uploadedBy: meta.uploadedBy,
      fileName: meta.fileName,
      projectName: meta.projectName,
      activityCount: written,
    };
    const metaBatch = writeBatch(db);
    metaBatch.set(metaRef, metaPayload, { merge: true });
    await metaBatch.commit();

    return { written };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `${ACTIVITIES_COLLECTION}/*`);
    throw error;
  }
}

/**
 * Fetch the current schedule metadata. Returns null if no upload has happened yet —
 * the request form uses this to gate submission (block until first upload).
 */
export async function getCurrentScheduleMeta(): Promise<P6ScheduleMeta | null> {
  try {
    const snap = await getDoc(doc(db, META_COLLECTION, META_DOC));
    if (!snap.exists()) return null;
    return snap.data() as P6ScheduleMeta;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `${META_COLLECTION}/${META_DOC}`);
    return null;
  }
}

/**
 * One-shot fetch of every activity for the picker. The phonebook is bounded
 * (157k upper bound from the SF schedule but typically far fewer), and the picker
 * does client-side substring search across the full list — simpler than maintaining
 * an external search index for a one-screen utility.
 */
export async function listAllP6Activities(): Promise<P6ActivityDoc[]> {
  try {
    const snap = await getDocs(collection(db, ACTIVITIES_COLLECTION));
    return snap.docs.map(d => d.data() as P6ActivityDoc);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, ACTIVITIES_COLLECTION);
    return [];
  }
}
