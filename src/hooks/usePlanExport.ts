import { STAGES } from '../constants';
import { exportPlanToPDF } from '../services/pdfService';

export const usePlanExport = (setLoading: any, getUserLabel: () => string, reportTemplate: any) => {
  const handleExportPlanToPDF = async (plan: any) => {
    await exportPlanToPDF(plan, reportTemplate, STAGES, setLoading, getUserLabel);
  };

  return {
    handleExportPlanToPDF
  };
};
