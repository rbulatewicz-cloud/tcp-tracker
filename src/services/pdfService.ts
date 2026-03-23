import { jsPDF } from 'jspdf';
import { PDFDocument } from 'pdf-lib';
import { showToast } from '../lib/toast';

export const exportPlanToPDF = async (
  plan: any,
  reportTemplate: any,
  STAGES: any[],
  setLoading: (loading: (prev: any) => any) => void,
  getUserLabel: () => string
) => {
  setLoading(prev => ({ ...prev, export: true }));
  try {
    const doc = new jsPDF();
    const margin = 20;
    let y = 15;

    // --- HEADER SECTION ---
    if (reportTemplate.logo) {
      let format = 'PNG';
      if (reportTemplate.logo.startsWith('data:image/jpeg')) format = 'JPEG';
      doc.addImage(reportTemplate.logo, format, margin, y, 60, 30);
    } else {
      // Fallback Mock Logo
      doc.setFont("helvetica", "bold");
      doc.setFontSize(32);
      doc.setTextColor(0, 82, 155);
      doc.text("SFTC", margin, y + 15);
      doc.setDrawColor(245, 158, 11);
      doc.setLineWidth(1.5);
      doc.moveTo(margin, y + 18);
      doc.curveTo(margin + 15, y + 22, margin + 30, y + 18, margin + 45, y + 15);
      doc.stroke();
      doc.setFontSize(14);
      doc.text("San Fernando Transit", margin + 50, y + 8);
      doc.text("Constructors", margin + 50, y + 15);
    }

    // Top Right Header: TCP and LOC Revisions
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    const tcpText = `TCP: ${plan.currentTCP || "N/A"} Rev: ${plan.tcpRev || "0"}`;
    const locText = `LOC: ${plan.currentLOC || "N/A"} Rev: ${plan.locRev || "0"}`;
    doc.text(tcpText, 210 - margin, y + 5, { align: "right" });
    doc.text(locText, 210 - margin, y + 10, { align: "right" });

    y += 40;

    // --- STATUS BANNER ---
    const stage = STAGES.find(s => s.key === plan.stage) || STAGES[0];
    doc.setFillColor(stage.color);
    doc.rect(margin, y, 170, 14, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text(stage.label.toUpperCase(), 105, y + 9.5, { align: "center" });
    y += 20;

    // --- ADDRESS & PROJECT INFO ---
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(0, 0, 0);
    
    // Left side: Company Info
    doc.text(reportTemplate.companyName, margin, y);
    doc.text(reportTemplate.address, margin, y + 4);
    doc.text(reportTemplate.cityStateZip, margin, y + 8);

    // Right side: Project Info
    reportTemplate.projectInfo.forEach((line: string, i: number) => {
      doc.text(line, 210 - margin, y + (i * 4), { align: "right" });
    });

    y += 20;

    // --- TITLE ---
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.5);
    doc.line(margin, y, 210 - margin, y);
    y += 8;
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    const title = `${plan.street1}${plan.street2 ? ` / ${plan.street2}` : ""}`;
    doc.text(title.toUpperCase(), 105, y, { align: "center" });
    y += 4;
    doc.line(margin, y, 210 - margin, y);
    
    y += 10;

    // --- METADATA TABLE ---
    const drawTableRow = (label1: string, val1: string, label2: string, val2: string) => {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.text(label1 + ":", margin, y);
      doc.setFont("helvetica", "normal");
      doc.text(String(val1 || "N/A"), margin + 35, y);

      doc.setFont("helvetica", "bold");
      doc.text(label2 + ":", 110, y);
      doc.setFont("helvetica", "normal");
      doc.text(String(val2 || "N/A"), 145, y);
      
      y += 2;
      doc.setDrawColor(200, 200, 200);
      doc.line(margin, y, 210 - margin, y);
      y += 6;
    };

    drawTableRow("TO", plan.lead, "FROM", getUserLabel());
    drawTableRow("Sent Date", plan.dateRequested || plan.requestDate, "STATUS", STAGES.find(s => s.key === plan.stage)?.label || plan.stage);
    drawTableRow("LOCATION", plan.segment, "DUE DATE", plan.needByDate);
    drawTableRow("COST CODE", "N/A", "REFERENCE", plan.id);
    drawTableRow("COST IMPACT", plan.impact_fullClosure ? "Yes" : "No", "SCHEDULE IMPACT", plan.impact_transit ? "Yes" : "No");
    drawTableRow("DRAWING NUMBER", "Various", "SPEC SECTION", plan.scope);
    drawTableRow("PRIORITY", plan.priority, "TYPE", plan.type);

    y += 5;

    // --- QUESTION SECTION ---
    doc.setFillColor(0, 0, 0);
    doc.rect(margin, y, 170, 8, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.text(`Request Details for ${plan.id}`, margin + 2, y + 5.5);
    
    y += 8;
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    const notes = doc.splitTextToSize(plan.notes || "No additional notes.", 166);
    doc.text(notes, margin + 2, y + 5);
    y += (notes.length * 4) + 10;

    // --- REPLIES / LOG SECTION ---
    doc.setFillColor(100, 116, 139); // Gray header
    doc.rect(margin, y, 170, 8, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.text("Activity Log / Replies:", margin + 2, y + 5.5);
    
    y += 8;
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "normal");
    
    [...plan.log].reverse().forEach((entry: any) => {
      if (y > 260) {
        doc.addPage();
        y = 20;
      }
      
      doc.setFillColor(245, 245, 245);
      doc.rect(margin, y, 170, 6, 'F');
      doc.setFont("helvetica", "bold");
      doc.text(`${entry.user} at ${entry.date}`, margin + 2, y + 4.5);
      y += 6;
      
      doc.setFont("helvetica", "normal");
      const action = doc.splitTextToSize(entry.action, 166);
      doc.text(action, margin + 2, y + 4);
      y += (action.length * 4) + 6;
    });

    // --- FOOTER ---
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text("Skanska USA Civil", margin, 285);
      doc.text(`Page ${i} of ${pageCount}`, 105, 285, { align: "center" });
      doc.text(`Printed On: ${new Date().toLocaleString()}`, 210 - margin, 285, { align: "right" });
    }

    // Convert jsPDF to ArrayBuffer
    const pdfBytes = doc.output('arraybuffer');
    
    // Use pdf-lib to merge existing PDFs
    const mergedPdf = await PDFDocument.create();
    
    // Add pages from jsPDF
    const jspdfDoc = await PDFDocument.load(pdfBytes);
    const jspdfPages = await mergedPdf.copyPages(jspdfDoc, jspdfDoc.getPageIndices());
    jspdfPages.forEach(page => mergedPdf.addPage(page));

    // Add approved LOCs and TCPs
    const allFiles = [
      ...(plan.approvedLOCs || []).map((f: any) => f.file),
      ...(plan.approvedTCPs || []).map((f: any) => f.file)
    ];

    for (const file of allFiles) {
      try {
        const fileBytes = await file.arrayBuffer();
        if (file.type === "application/pdf") {
          const externalDoc = await PDFDocument.load(fileBytes);
          const externalPages = await mergedPdf.copyPages(externalDoc, externalDoc.getPageIndices());
          externalPages.forEach(page => mergedPdf.addPage(page));
        } else if (file.type.startsWith("image/")) {
          let image;
          if (file.type === "image/jpeg" || file.type === "image/jpg") image = await mergedPdf.embedJpg(fileBytes);
          else if (file.type === "image/png") image = await mergedPdf.embedPng(fileBytes);
          
          if (image) {
            const page = mergedPdf.addPage();
            const { width, height } = image.scaleToFit(page.getWidth() - 40, page.getHeight() - 40);
            page.drawImage(image, {
              x: page.getWidth() / 2 - width / 2,
              y: page.getHeight() / 2 - height / 2,
              width,
              height,
            });
          }
        }
      } catch (err) {
        console.error("Error adding file to PDF:", file.name, err);
      }
    }

    const finalPdfBytes = await mergedPdf.save();
    const blob = new Blob([finalPdfBytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Report_${plan.id}_${plan.street1.replace(/\s+/g, '_')}.pdf`;
    link.click();
    URL.revokeObjectURL(url);

  } catch (error) {
    console.error("Error exporting to PDF:", error);
    showToast("Failed to export PDF.", "error");
  } finally {
    setLoading(prev => ({ ...prev, export: false }));
  }
};
