import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { ReportTemplate } from '../types';

export const generateReport = async (template: ReportTemplate, elementId: string) => {
  const element = document.getElementById(elementId);
  if (!element) return;

  const canvas = await html2canvas(element);
  const imgData = canvas.toDataURL('image/png');
  
  const doc = new jsPDF('p', 'mm', 'a4');
  const imgProps = doc.getImageProperties(imgData);
  const pdfWidth = doc.internal.pageSize.getWidth();
  const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
  
  doc.text(template.companyName, 10, 10);
  doc.addImage(imgData, 'PNG', 0, 20, pdfWidth, pdfHeight);
  doc.save('report.pdf');
};
