import React from 'react';
import { generateReport } from '../services/reportService';
import { ReportTemplate } from '../types';

interface ReportGeneratorProps {
  template: ReportTemplate;
  elementId: string;
}

export const ReportGenerator: React.FC<ReportGeneratorProps> = ({ template, elementId }) => {
  return (
    <button
      onClick={() => generateReport(template, elementId)}
      className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
    >
      Generate PDF Report
    </button>
  );
};
