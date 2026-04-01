import { collection, addDoc, deleteDoc, getDocs, query } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase';

export const addLogEntry = async (
  pid: string,
  entry: string,
  attachments: File[] | undefined,
  td: string,
  getUserLabel: () => string,
  field?: string,
  previousValue?: any,
  newValue?: any
) => {
  try {
    let uploadedAttachments: { name: string, data: string }[] = [];
    if (attachments && attachments.length > 0) {
      uploadedAttachments = await Promise.all(
        attachments.map(async (file: File) => {
          const fileRef = ref(storage, `plans/${pid}/logs/${Date.now()}_${file.name}`);
          const uploadPromise = uploadBytes(fileRef, file);
          const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Upload timed out.")), 15000));
          await Promise.race([uploadPromise, timeoutPromise]);
          const url = await getDownloadURL(fileRef);
          return { name: file.name, data: url };
        })
      );
    }

    const newLogEntry = { 
      uniqueId: Date.now().toString(),
      date: td, 
      action: entry, 
      user: getUserLabel(), 
      userId: auth.currentUser?.uid || 'unknown',
      attachments: uploadedAttachments,
      field,
      previousValue,
      newValue
    };
    
    await addDoc(collection(db, 'plans', pid, 'logs'), newLogEntry);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `plans/${pid}/logs`);
    throw error;
  }
};

export const deleteLogEntry = async (
  pid: string,
  logEntryUniqueId: string
) => {
  try {
    const logSnapshot = await getDocs(query(collection(db, 'plans', pid, 'logs')));
    const logDoc = logSnapshot.docs.find(d => d.data().uniqueId === logEntryUniqueId);
    if (logDoc) {
      await deleteDoc(logDoc.ref);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `plans/${pid}/logs`);
    throw error;
  }
};

export const clearLog = async (
  pid: string,
  td: string,
  getUserLabel: () => string
) => {
  try {
    // Delete all logs in subcollection
    const logsSnapshot = await getDocs(collection(db, 'plans', pid, 'logs'));
    for (const docSnapshot of logsSnapshot.docs) {
      await deleteDoc(docSnapshot.ref);
    }
    
    await addDoc(collection(db, 'plans', pid, 'logs'), {
      uniqueId: Date.now().toString(),
      date: td,
      action: "Log wiped",
      user: getUserLabel()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `plans/${pid}/logs`);
    throw error;
  }
};

export const handleClearLog = async (
  clearLogConfirm: any,
  plans: any[],
  td: string,
  getUserLabel: () => string,
  setClearLogConfirm: (confirm: any) => void,
  setLoading: (loading: (prev: any) => any) => void
) => {
  if (clearLogConfirm.type === 'plan' && clearLogConfirm.planId) {
    const pid = clearLogConfirm.planId;
    try {
      await clearLog(pid, td, getUserLabel);
      setClearLogConfirm({isOpen: false, type: 'plan'});
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `plans/${pid}`);
      throw error;
    }
  } else if (clearLogConfirm.type === 'global') {
    try {
      setLoading(prev => ({ ...prev, bulk: true }));
      for (const p of plans) {
        await clearLog(p.id, td, getUserLabel);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `plans`);
      throw error;
    } finally {
      setLoading(prev => ({ ...prev, bulk: false }));
    }
  }
  setClearLogConfirm({isOpen: false, type: 'plan'});
};
