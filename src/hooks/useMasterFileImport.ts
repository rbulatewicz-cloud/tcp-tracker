import { useState } from 'react';
import { IMPORT_TARGET_FIELDS } from '../constants';
import { parseMasterFile, buildImportRows, confirmImport as confirmImportService, ImportRow } from '../services/importService';
import { UserRole, Plan, LoadingState } from '../types';
import { showToast } from '../lib/toast';

export function useMasterFileImport(
  plans: Plan[],
  role: UserRole,
  td: string,
  getUserLabel: () => string,
  setLoading: React.Dispatch<React.SetStateAction<LoadingState>>
) {
  const [showImportWizard, setShowImportWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3 | 4>(1);

  // Step 2 state
  const [mappingHeaders, setMappingHeaders] = useState<string[]>([]);
  const [mappingData, setMappingData] = useState<Record<string, unknown>[]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});

  // Step 3 & 4 state
  const [importRows, setImportRows] = useState<ImportRow[]>([]);

  // Step 1 — file picked, parse and go to step 2
  const handleMasterUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (role !== UserRole.ADMIN) {
      showToast('Only Admins are authorized to upload master files.', 'error');
      return;
    }
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(prev => ({ ...prev, upload: true }));
    try {
      const { headers, rows, initialMapping } = await parseMasterFile(file);
      setMappingHeaders(headers);
      setMappingData(rows);
      setColumnMapping(initialMapping);
      setShowImportWizard(true);
      setWizardStep(2); // advance past upload step — file is already parsed
    } catch (error) {
      console.error('Error parsing master file:', error);
      showToast('Failed to process file. Make sure it is a valid Excel (.xlsx) file.', 'error');
    } finally {
      setLoading(prev => ({ ...prev, upload: false }));
      e.target.value = '';
    }
  };

  // Step 2 → 3: build validated rows
  const handleProceedToValidation = () => {
    const rows = buildImportRows(mappingData, columnMapping);
    setImportRows(rows);
    setWizardStep(3);
  };

  // Step 3 → 4: move to final review
  const handleProceedToReview = () => {
    setWizardStep(4);
  };

  // Step 4: confirm import
  const confirmImport = async () => {
    if (role !== UserRole.ADMIN) return;
    setLoading(prev => ({ ...prev, upload: true }));

    try {
      const result = await confirmImportService(importRows, plans, td, getUserLabel);
      const tbdMsg = result.tbdCount > 0 ? ` (${result.tbdCount} pending LOC assignment)` : '';
      const renewalMsg = result.renewalCount > 0 ? `, ${result.renewalCount} renewals linked` : '';
      showToast(`Import complete — ${result.imported} records imported${tbdMsg}${renewalMsg}, ${result.skipped} skipped.`, 'success');
      resetImport();
    } catch (error) {
      console.error('Error importing data:', error);
      showToast('Failed to import data. Please try again.', 'error');
    } finally {
      setLoading(prev => ({ ...prev, upload: false }));
    }
  };

  const resetImport = () => {
    setShowImportWizard(false);
    setWizardStep(1);
    setMappingData([]);
    setMappingHeaders([]);
    setColumnMapping({});
    setImportRows([]);
  };

  const updateImportRow = (rowIndex: number, updates: Partial<ImportRow>) => {
    setImportRows(prev =>
      prev.map(r => r._rowIndex === rowIndex ? { ...r, ...updates } : r)
    );
  };

  return {
    showImportWizard,
    setShowImportWizard,
    wizardStep,
    setWizardStep,
    handleMasterUpload,
    handleProceedToValidation,
    handleProceedToReview,
    confirmImport,
    resetImport,
    mappingHeaders,
    mappingData,
    columnMapping,
    setColumnMapping,
    importRows,
    setImportRows,
    updateImportRow,
    IMPORT_TARGET_FIELDS,
  };
}
