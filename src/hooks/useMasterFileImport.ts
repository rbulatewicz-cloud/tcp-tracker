import { useState } from 'react';
import * as XLSX from 'xlsx';
import { IMPORT_TARGET_FIELDS } from '../constants';
import { processImportData, confirmImport as confirmImportService } from '../services/importService';
import { UserRole } from '../types';
import { showToast } from '../lib/toast';

export function useMasterFileImport(
  plans: any[],
  role: UserRole,
  td: string,
  getUserLabel: () => string,
  setLoading: React.Dispatch<React.SetStateAction<{ upload?: boolean }>>
) {
  const [showMappingModal, setShowMappingModal] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewData, setReviewData] = useState<{newPlans: any[], updatedPlans: any[], deletedPlans: any[]}>({newPlans: [], updatedPlans: [], deletedPlans: []});
  const [deleteMissingPlans, setDeleteMissingPlans] = useState(false);
  const [mappingHeaders, setMappingHeaders] = useState<string[]>([]);
  const [mappingData, setMappingData] = useState<any[]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});

  const handleMasterUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (role !== UserRole.ADMIN) {
      showToast("Only Admins are authorized to upload master files.", "error");
      return;
    }
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(prev => ({ ...prev, upload: true }));
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      
      const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
      if (rawRows.length === 0) throw new Error("Empty sheet");
      
      let headerRowIdx = 0;
      while (headerRowIdx < rawRows.length && (!rawRows[headerRowIdx] || rawRows[headerRowIdx].length === 0)) {
        headerRowIdx++;
      }
      
      const rawHeaders = rawRows[headerRowIdx] || [];
      const headers = rawHeaders.map((h, i) => h ? String(h).trim() : `Column ${String.fromCharCode(65 + i)}`);
      
      const rows = XLSX.utils.sheet_to_json(sheet, { header: headers, range: headerRowIdx + 1 });

      const initialMapping: Record<string, string> = {};
      IMPORT_TARGET_FIELDS.forEach(f => {
        const match = headers.find(h => 
          h.toLowerCase().replace(/[^a-z0-9]/g, '') === f.label.toLowerCase().replace(/[^a-z0-9]/g, '') ||
          h.toLowerCase().includes(f.key.toLowerCase()) ||
          f.label.toLowerCase().includes(h.toLowerCase())
        );
        if (match) initialMapping[f.key] = match;
      });
      
      if (headers.length > 15 && !initialMapping['submitDate']) {
        initialMapping['submitDate'] = headers[15];
      }

      setMappingHeaders(headers);
      setMappingData(rows);
      setColumnMapping(initialMapping);
      setShowMappingModal(true);
    } catch (error) {
      console.error("Error parsing master file:", error);
      showToast("Failed to process master file. Ensure it is a valid Excel file.", "error");
    } finally {
      setLoading(prev => ({ ...prev, upload: false }));
      e.target.value = '';
    }
  };

  const handleReviewImport = (STAGES: any) => {
    if (role !== UserRole.ADMIN) return;
    
    const { newPlans, updatedPlans, deletedPlans } = processImportData(
      mappingData,
      columnMapping,
      plans,
      STAGES,
      td,
      getUserLabel
    );

    setReviewData({ newPlans, updatedPlans, deletedPlans });
    setShowMappingModal(false);
    setShowReviewModal(true);
  };

  const confirmImport = async () => {
    if (role !== UserRole.ADMIN) return;
    setLoading(prev => ({ ...prev, upload: true }));
    setShowReviewModal(false);
    
    try {
      await confirmImportService(reviewData, deleteMissingPlans);
    } catch (error) {
      console.error("Error importing data:", error);
      showToast("Failed to import data.", "error");
    } finally {
      setLoading(prev => ({ ...prev, upload: false }));
      setMappingData([]);
      setMappingHeaders([]);
      setReviewData({ newPlans: [], updatedPlans: [], deletedPlans: [] });
      setDeleteMissingPlans(false);
    }
  };

  return {
    handleMasterUpload,
    handleReviewImport,
    confirmImport,
    showMappingModal, setShowMappingModal,
    showReviewModal, setShowReviewModal,
    reviewData, setReviewData,
    deleteMissingPlans, setDeleteMissingPlans,
    mappingHeaders, setMappingHeaders,
    mappingData, setMappingData,
    columnMapping, setColumnMapping
  };
}
