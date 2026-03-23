import { useState } from 'react';
import { handleBulkLOCUpload as bulkLOCUploadService } from '../services/planService';

export const useLOCManagement = (selectedPlanIds: string[], plans: any[], currentUser: any, getUserLabel: () => string, td: string, setLoading: (loading: any) => void, setSelectedPlanIds: (ids: string[]) => void) => {
  const [selectedLOC, setSelectedLOC] = useState<any>(null);
  const [locForm, setLocForm] = useState<any>({
    locNumber: "",
    revision: 1,
    startDate: "",
    endDate: "",
    dotSubmittalDate: "",
    planIds: [],
    notes: "",
    file: null as File | null
  });
  const [showBulkLOCModal, setShowBulkLOCModal] = useState(false);
  const [bulkLOCFile, setBulkLOCFile] = useState<File | null>(null);
  const [bulkLOCProgress, setBulkLOCProgress] = useState(0);

  const handleBulkLOCUpload = async () => {
    await bulkLOCUploadService(
      bulkLOCFile, 
      selectedPlanIds, 
      plans, 
      currentUser, 
      getUserLabel, 
      td, 
      setLoading, 
      setBulkLOCProgress, 
      setShowBulkLOCModal, 
      setBulkLOCFile, 
      setSelectedPlanIds
    );
  };

  return {
    selectedLOC, setSelectedLOC,
    locForm, setLocForm,
    showBulkLOCModal, setShowBulkLOCModal,
    bulkLOCFile, setBulkLOCFile,
    bulkLOCProgress, setBulkLOCProgress,
    handleBulkLOCUpload
  };
};
