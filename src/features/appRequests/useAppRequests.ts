import React, { useState } from 'react';
import { db, storage } from '../../firebase';
import { doc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { showToast } from '../../lib/toast';
import { User, LoadingState } from '../../types';

export const useAppRequests = (
  currentUser: User | null,
  loading: LoadingState,
  setLoading: React.Dispatch<React.SetStateAction<LoadingState>>,
  showAppRequestModal: boolean,
  setShowAppRequestModal: React.Dispatch<React.SetStateAction<boolean>>
) => {
  const [appRequestForm, setAppRequestForm] = useState({ description: "", files: [] as (File | string)[] });

  const handleAppRequestFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setAppRequestForm(prev => ({ ...prev, files: [...prev.files, ...Array.from(e.target.files!)] }));
    }
  };

  const submitAppRequest = async () => {
    if (!appRequestForm.description) {
      showToast("Please provide a description of the requested change.", "warning");
      return;
    }
    if (!currentUser) return;

    setLoading(prev => ({ ...prev, appRequest: true }));
    try {
      const requestId = `REQ-${Math.floor(100000 + Math.random() * 900000)}`;
      
      const uploadedFiles = await Promise.all(
        appRequestForm.files.map(async (file: File | string) => {
          if (typeof file === 'string') return file;
          const fileRef = ref(storage, `app_feedback/${requestId}/${Date.now()}_${file.name}`);
          const uploadPromise = uploadBytes(fileRef, file);
          const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Upload timed out.")), 15000));
          await Promise.race([uploadPromise, timeoutPromise]);
          const url = await getDownloadURL(fileRef);
          return url;
        })
      );

      await setDoc(doc(db, 'app_feedback', requestId), {
        id: requestId,
        description: appRequestForm.description,
        files: uploadedFiles,
        userEmail: currentUser.email,
        userName: currentUser.name,
        userId: currentUser.uid,
        createdAt: new Date().toISOString(),
        status: "pending"
      });
      setAppRequestForm({ description: "", files: [] });
      setShowAppRequestModal(false);
      showToast("Request submitted! The developer will review it soon.", "success");
    } catch (err) {
      console.error("Failed to submit request:", err);
      showToast("Failed to submit request. Please try again.", "error");
    } finally {
      setLoading(prev => ({ ...prev, appRequest: false }));
    }
  };

  return {
    appRequestForm,
    setAppRequestForm,
    showAppRequestModal,
    setShowAppRequestModal,
    handleAppRequestFileUpload,
    submitAppRequest
  };
};
