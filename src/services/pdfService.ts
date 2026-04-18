import { jsPDF } from 'jspdf';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { ref as storageRef, getBytes } from 'firebase/storage';
import { storage, auth } from '../firebase';
import { showToast, showPersistentToast, dismissToast } from '../lib/toast';
import type { NoiseVariance, PDFExportOptions } from '../types';
import { fmtDate, fmt12 } from '../utils/plans';

// ── Formatting helpers ──────────────────────────────────────────────────────

function fmtWorkHours(wh: any): string {
  if (!wh) return '—';
  const dayLabels: Record<string, string> = { weekday: 'Weekdays', saturday: 'Saturday', sunday: 'Sunday' };
  const days = (wh.days || []).map((d: string) => dayLabels[d] || d).join(' & ');
  if (wh.shift === 'continuous') return `Continuous · ${days}`;
  if (wh.shift === 'daytime')    return `Daytime · ${days}`;
  if (wh.shift === 'nighttime')  return `Nighttime · ${days}`;
  if (wh.shift === 'both') {
    if ((wh.days || []).includes('weekday')) {
      const dayS = wh.day_start ?? wh.weekday_start;
      const dayE = wh.day_end   ?? wh.weekday_end;
      const parts: string[] = [];
      if (dayS && dayE)                   parts.push(`Day ${fmt12(dayS)}–${fmt12(dayE)}`);
      if (wh.night_start && wh.night_end) parts.push(`Night ${fmt12(wh.night_start)}–${fmt12(wh.night_end)}`);
      if (parts.length) return `${parts.join(' + ')} · ${days}`;
    }
    return `Day & Night · ${days}`;
  }
  if (wh.shift === 'mixed') {
    const dlabels: Record<string, string> = { weekday: 'Wkdy', saturday: 'Sat', sunday: 'Sun' };
    const parts = (wh.days || []).map((d: string) => {
      const ds = (wh as any)[`${d}_shift`] ?? 'daytime';
      const sl = ds === 'daytime' ? 'Day' : ds === 'nighttime' ? 'Night' : 'Day+Night';
      return `${dlabels[d] || d}: ${sl}`;
    });
    return `Mixed · ${parts.join(', ')}`;
  }
  return `Custom Hours · ${days}`;
}

function hexToRgb(hex: string): [number, number, number] {
  if (!hex || !hex.startsWith('#') || hex.length < 7) return [100, 116, 139];
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

const COMPLIANCE_STATUS_LABELS: Record<string, string> = {
  not_started:     'Not Started',
  in_progress:     'In Progress',
  linked_existing: 'Existing Permit',
  submitted:       'Submitted',
  approved:        'Approved',
  expired:         'Expired',
};

const CD_STATUS_LABELS: Record<string, string> = {
  pending:              'Pending',
  presentation_sent:    'Presentation Sent',
  meeting_scheduled:    'Meeting Scheduled',
  concurred:            'Concurred',
  declined:             'Declined',
  na:                   'N/A',
};

// ── Light divider page (pdf-lib) ───────────────────────────────────────────

function addDividerPage(
  mergedPdf: PDFDocument,
  boldFont: any,
  regularFont: any,
  title: string,
  subtitle: string
): void {
  const page = mergedPdf.addPage([595.28, 841.89]); // A4 in points
  const { width, height } = page.getSize();
  const midY = height / 2;

  // Amber top bar
  page.drawRectangle({
    x: 0, y: height - 10,
    width, height: 10,
    color: rgb(0.957, 0.62, 0.043), // amber-500
  });

  // Slate-100 bottom bar
  page.drawRectangle({
    x: 0, y: 0,
    width, height: 8,
    color: rgb(0.941, 0.945, 0.953),
  });

  // Horizontal rules framing the text block
  const ruleColor = rgb(0.82, 0.839, 0.871); // slate-300
  page.drawLine({ start: { x: 40, y: midY + 32 }, end: { x: width - 40, y: midY + 32 }, thickness: 0.75, color: ruleColor });
  page.drawLine({ start: { x: 40, y: midY - 18 }, end: { x: width - 40, y: midY - 18 }, thickness: 0.75, color: ruleColor });

  // Section title — centered
  const titleSize = 22;
  const titleWidth = boldFont.widthOfTextAtSize(title, titleSize);
  page.drawText(title, {
    x: (width - titleWidth) / 2,
    y: midY + 10,
    size: titleSize,
    font: boldFont,
    color: rgb(0.059, 0.09, 0.165), // slate-900
  });

  // Subtitle — centered
  const subSize = 11;
  const subWidth = regularFont.widthOfTextAtSize(subtitle, subSize);
  page.drawText(subtitle, {
    x: (width - subWidth) / 2,
    y: midY - 8,
    size: subSize,
    font: regularFont,
    color: rgb(0.388, 0.455, 0.545), // slate-500
  });
}

// ── Main export ────────────────────────────────────────────────────────────

export const exportPlanToPDF = async (
  plan: any,
  reportTemplate: any,
  STAGES: any[],
  setLoading: (loading: (prev: any) => any) => void,
  libraryVariances?: NoiseVariance[],
  options?: PDFExportOptions
) => {
  setLoading(prev => ({ ...prev, export: true }));
  const toastId = showPersistentToast('Building PDF — fetching documents…');
  try {
    const doc = new jsPDF();
    const margin = 15;
    const pageW = 210;
    const usableW = pageW - margin * 2;
    let y = margin;

    const checkPage = (needed = 20) => {
      if (y + needed > 276) { doc.addPage(); y = margin; }
    };

    const stage = STAGES.find((s: any) => s.key === plan.stage);
    const stageLabel = stage?.label?.toUpperCase() || (plan.stage || 'UNKNOWN').toUpperCase();
    const [sr, sg, sb] = hexToRgb(stage?.color || '#64748b');

    // ── TITLE PAGE ──────────────────────────────────────────────────────────

    // Logo / company name
    if (reportTemplate?.logo) {
      const fmt = reportTemplate.logo.startsWith('data:image/jpeg') ? 'JPEG' : 'PNG';
      doc.addImage(reportTemplate.logo, fmt, margin, y, 45, 22);
    } else {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(22);
      doc.setTextColor(0, 82, 155);
      doc.text('SFTC', margin, y + 12);
    }

    // Company info — right-aligned
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(reportTemplate?.companyName || '', pageW - margin, y + 3,  { align: 'right' });
    doc.text(reportTemplate?.address      || '', pageW - margin, y + 7,  { align: 'right' });
    doc.text(reportTemplate?.cityStateZip || '', pageW - margin, y + 11, { align: 'right' });
    y += 28;

    // Amber accent bar
    doc.setFillColor(245, 158, 11);
    doc.rect(margin, y, usableW, 1.5, 'F');
    y += 7;

    // LOC # — large
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(26);
    doc.setTextColor(15, 23, 42);
    doc.text(plan.loc || plan.id, margin, y + 8);

    // Stage badge — right-aligned, same vertical band
    doc.setFillColor(sr, sg, sb);
    doc.roundedRect(pageW - margin - 48, y, 48, 10, 2, 2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(255, 255, 255);
    doc.text(stageLabel, pageW - margin - 24, y + 6.8, { align: 'center' });
    y += 16;

    // Street title
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(15, 23, 42);
    const streetTitle = plan.street1 + (plan.street2 ? ` / ${plan.street2}` : '');
    doc.text(streetTitle, margin, y);
    y += 6;

    // Segment
    if (plan.segment) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      doc.text(plan.segment, margin, y);
      y += 9;
    } else {
      y += 4;
    }

    // 2-column info grid
    y += 2;
    const col1x = margin;
    const col2x = margin + usableW / 2 + 4;
    const colW  = usableW / 2 - 6;

    const drawTitleInfoCell = (lbl: string, val: string, x: number) => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      doc.text(lbl.toUpperCase(), x, y);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(15, 23, 42);
      const lines = doc.splitTextToSize(val || '—', colW);
      doc.text(lines[0], x, y + 4.5);
    };

    const leftRows  = [['Plan Type', plan.type], ['Priority', plan.priority], ['Lead', plan.lead], ['Requested By', plan.requestedBy]];
    const rightRows = [['Requested', fmtDate(plan.dateRequested || plan.requestDate)], ['Need By', fmtDate(plan.needByDate)], ['Submitted', fmtDate(plan.submitDate)], ['Approved', fmtDate(plan.approvedDate)]];

    if (!options || options.includeMetadata) {
      const gridStartY = y;
      leftRows.forEach(([l, v]) => { drawTitleInfoCell(l, v, col1x); y += 11; });
      y = gridStartY;
      rightRows.forEach(([l, v]) => { drawTitleInfoCell(l, v, col2x); y += 11; });
      y += 8;
    } else {
      y += 4;
    }

    // Separator
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.line(margin, y, pageW - margin, y);
    y += 5;

    // Generated line
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text(`Generated ${new Date().toLocaleString()} · TCP Tracker`, margin, y);

    // ── PLAN SUMMARY PAGE ──────────────────────────────────────────────────

    doc.addPage();
    y = margin;

    // Dark section header
    const drawSectionHeader = (title: string) => {
      checkPage(16);
      doc.setFillColor(15, 23, 42);
      doc.rect(margin, y, usableW, 8, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text(title, margin + 3, y + 5.5);
      y += 12;
    };

    // Light sub-header
    const drawSubHeader = (title: string) => {
      checkPage(14);
      doc.setFillColor(241, 245, 249);
      doc.rect(margin, y, usableW, 6.5, 'F');
      doc.setTextColor(71, 85, 105);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.text(title, margin + 3, y + 4.5);
      y += 9;
    };

    // Two-column metadata row with separator line
    const drawMetaRow = (lbl1: string, val1: string, lbl2?: string, val2?: string) => {
      checkPage(10);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      doc.text(lbl1, margin + 2, y);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(15, 23, 42);
      doc.text(String(val1 || '—'), margin + 32, y);
      if (lbl2 !== undefined) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(100, 116, 139);
        doc.text(lbl2, 110, y);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(15, 23, 42);
        doc.text(String(val2 || '—'), 142, y);
      }
      y += 1.5;
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.2);
      doc.line(margin, y, pageW - margin, y);
      y += 5.5;
    };

    drawSectionHeader(`PLAN SUMMARY — ${plan.loc || plan.id}`);
    drawMetaRow('Location', `${plan.street1}${plan.street2 ? ` / ${plan.street2}` : ''}`, 'Segment', plan.segment);
    if (!options || options.includeMetadata) {
      drawMetaRow('Plan Type', plan.type, 'Priority', plan.priority);
      drawMetaRow('Lead', plan.lead, 'Requested By', plan.requestedBy);
      drawMetaRow('Requested', fmtDate(plan.dateRequested || plan.requestDate), 'Need By', fmtDate(plan.needByDate));
      drawMetaRow('Submitted', fmtDate(plan.submitDate), 'Approved', fmtDate(plan.approvedDate));
    }
    drawMetaRow('Status', stage?.label || plan.stage || '—', 'Critical Path', plan.isCriticalPath ? 'Yes' : 'No');
    y += 4;

    // Scope & Notes
    if ((!options || options.includeScopeNotes) && (plan.scope || plan.notes)) {
      drawSubHeader('SCOPE & NOTES');
      if (plan.scope) {
        checkPage(10);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(100, 116, 139);
        doc.text('Scope:', margin + 2, y);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(15, 23, 42);
        const scopeLines = doc.splitTextToSize(plan.scope, usableW - 22);
        doc.text(scopeLines, margin + 18, y);
        y += scopeLines.length * 4.2 + 3;
      }
      if (plan.notes) {
        checkPage(10);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(100, 116, 139);
        doc.text('Notes:', margin + 2, y);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(15, 23, 42);
        const noteLines = doc.splitTextToSize(plan.notes, usableW - 22);
        doc.text(noteLines, margin + 18, y);
        y += noteLines.length * 4.2 + 3;
      }
      y += 3;
    }

    // Hours of Work
    if ((!options || options.includeWorkHours) && plan.work_hours) {
      checkPage(16);
      drawSubHeader('HOURS OF WORK');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(15, 23, 42);
      doc.text(fmtWorkHours(plan.work_hours), margin + 2, y);
      y += 9;
    }

    // Impacts
    const impacts = [
      plan.impact_krail        && 'K-Rail',
      plan.impact_driveway     && 'Driveway Impact',
      plan.impact_fullClosure  && 'Full Closure',
      plan.impact_busStop      && 'Bus Stop Affected',
      plan.impact_transit      && 'Transit Impact',
    ].filter(Boolean) as string[];
    if ((!options || options.includeImpacts) && impacts.length > 0) {
      checkPage(16);
      drawSubHeader('IMPACTS');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(15, 23, 42);
      doc.text(impacts.join('  ·  '), margin + 2, y);
      y += 9;
    }

    // ── COMPLIANCE SUMMARY ─────────────────────────────────────────────────

    const comp = plan.compliance;
    const hasCompliance = comp && (comp.phe || comp.noiseVariance || comp.cdConcurrence || comp.drivewayNotices);

    if ((!options || options.includeCompliance) && hasCompliance) {
      checkPage(20);
      y += 4;
      drawSectionHeader('COMPLIANCE SUMMARY');

      const drawCompRow = (label: string, statusText: string, detail?: string) => {
        checkPage(12);
        doc.setFillColor(248, 250, 252);
        doc.rect(margin, y, usableW, 9.5, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(15, 23, 42);
        doc.text(label, margin + 3, y + 6.3);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(71, 85, 105);
        doc.text(statusText, pageW - margin - 3, y + 6.3, { align: 'right' });
        y += 9.5;
        if (detail) {
          checkPage(8);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7.5);
          doc.setTextColor(100, 116, 139);
          const dLines = doc.splitTextToSize(detail, usableW - 10);
          doc.text(dLines, margin + 6, y + 3.5);
          y += dLines.length * 3.8 + 2;
        }
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.2);
        doc.line(margin, y, pageW - margin, y);
        y += 3;
      };

      // PHE
      if (comp.phe) {
        const phe = comp.phe;
        const statusLbl = COMPLIANCE_STATUS_LABELS[phe.status] || phe.status;
        const parts: string[] = [];
        if (phe.boePermitNumber) parts.push(`BOE Permit: ${phe.boePermitNumber}`);
        if (phe.submittedDate)   parts.push(`Submitted: ${fmtDate(phe.submittedDate)}`);
        if (phe.approvalDate)    parts.push(`Approved: ${fmtDate(phe.approvalDate)}`);
        drawCompRow('Peak Hour Exemption (PHE)', statusLbl, parts.join('   ') || undefined);
      }

      // Noise Variance
      if (comp.noiseVariance) {
        const nv = comp.noiseVariance;
        const statusLbl = COMPLIANCE_STATUS_LABELS[nv.status] || nv.status;
        const linked = libraryVariances?.find(v => v.id === nv.linkedVarianceId);
        const parts: string[] = [];
        if (linked) {
          if (linked.permitNumber) parts.push(`Permit: ${linked.permitNumber}`);
          parts.push(`Valid Through: ${fmtDate(linked.validThrough)}`);
          const today = new Date();
          const exp   = new Date(linked.validThrough + 'T00:00:00');
          const days  = Math.ceil((exp.getTime() - today.getTime()) / 86400000);
          parts.push(days >= 0 ? `${days} days remaining` : `Expired ${Math.abs(days)} days ago`);
        } else if (nv.existingPermitNumber) {
          parts.push(`Permit: ${nv.existingPermitNumber}`);
        }
        drawCompRow('Noise Variance (NV)', statusLbl, parts.join('   ') || undefined);
      }

      // CD Concurrence
      if (comp.cdConcurrence) {
        const cd = comp.cdConcurrence;
        const statusLbl = COMPLIANCE_STATUS_LABELS[cd.status] || cd.status;
        const applicable = (cd.cds || []).filter((c: any) => c.applicable);
        const detail = applicable.map((c: any) => `${c.cd}: ${CD_STATUS_LABELS[c.status] || c.status}`).join('   ');
        drawCompRow('Community Development Concurrence', statusLbl, detail || undefined);
      }

      // Driveway Notices
      if (comp.drivewayNotices) {
        const dn = comp.drivewayNotices;
        const addrs = dn.addresses || [];
        const sent  = addrs.filter((a: any) => a.noticeSent).length;
        const statusLbl = addrs.length > 0 ? `${sent} of ${addrs.length} sent` : 'No addresses';
        drawCompRow('Driveway Impact Notices', statusLbl);
      }

      y += 4;
    }

    // ── ACTIVITY LOG ───────────────────────────────────────────────────────

    if (!options || options.includeActivityLog) {
    checkPage(20);
    y += 2;
    drawSectionHeader('ACTIVITY LOG');

    const logEntries = [...(plan.log || [])].reverse();
    if (logEntries.length === 0) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(148, 163, 184);
      doc.text('No activity recorded.', margin + 2, y);
      y += 8;
    } else {
      logEntries.forEach((entry: any) => {
        checkPage(14);
        doc.setFillColor(248, 250, 252);
        doc.rect(margin, y, usableW, 6, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(71, 85, 105);
        doc.text(`${entry.user || ''}   ·   ${entry.date || ''}`, margin + 2, y + 4.2);
        y += 6;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(15, 23, 42);
        const actionLines = doc.splitTextToSize(entry.action || '', usableW - 4);
        doc.text(actionLines, margin + 2, y + 3.8);
        y += actionLines.length * 4 + 5;
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.15);
        doc.line(margin, y - 2, pageW - margin, y - 2);
      });
    }
    } // end includeActivityLog

    // ── FOOTER on all jsPDF pages ───────────────────────────────────────────

    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(148, 163, 184);
      doc.text(reportTemplate?.companyName || 'SFTC', margin, 291);
      doc.text(`Page ${i} of ${pageCount}`, 105, 291, { align: 'center' });
      doc.text(new Date().toLocaleString(), pageW - margin, 291, { align: 'right' });
    }

    // ── MERGE: jsPDF pages + attached documents ─────────────────────────────

    const pdfBytes  = doc.output('arraybuffer');
    const mergedPdf = await PDFDocument.create();

    // Embed fonts for divider pages
    const boldFont    = await mergedPdf.embedFont(StandardFonts.HelveticaBold);
    const regularFont = await mergedPdf.embedFont(StandardFonts.Helvetica);

    // Copy jsPDF pages
    const jspdfDoc   = await PDFDocument.load(pdfBytes);
    const jspdfPages = await mergedPdf.copyPages(jspdfDoc, jspdfDoc.getPageIndices());
    jspdfPages.forEach(p => mergedPdf.addPage(p));

    // Build attachment list: TCPs → LOCs → NV (if linked and has a file)
    const linkedVariance = libraryVariances?.find(v => v.id === plan.compliance?.noiseVariance?.linkedVarianceId);

    const STAGE_DOC_LABELS: Record<string, string> = {
      tcp_drawings:     'TCP DRAWINGS',
      loc_draft:        'LOC DRAFT',
      loc_signed:       'LETTER OF CONCURRENCE',
      dot_comments:     'DOT COMMENTS',
      revision_package: 'REVISION PACKAGE',
      approval_letter:  'APPROVAL LETTER',
      other:            'DOCUMENT',
    };

    const fmtStageKey = (s: string) =>
      s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
       .replace(/\bDot\b/, 'DOT').replace(/\bLoc\b/, 'LOC');

    const attachments: { url: string; label: string; subtitle: string }[] = [
      ...(plan.approvedTCPs || [])
        .filter((f: any) => !options || options.includedTCPUrls.includes(f.url))
        .map((f: any) => ({
          url:      f.url,
          label:    'TCP DRAWING',
          subtitle: `Rev ${f.version ?? '—'}  ·  ${plan.loc || plan.id}`,
        })),
      ...(plan.approvedLOCs || [])
        .filter((f: any) => !options || options.includedLOCUrls.includes(f.url))
        .map((f: any) => ({
          url:      f.url,
          label:    'LETTER OF CONCURRENCE',
          subtitle: `Rev ${f.version ?? '—'}  ·  ${plan.loc || plan.id}`,
        })),
      ...(plan.stageAttachments || [])
        .filter((f: any) => !options || options.includedStageAttachmentUrls.includes(f.url))
        .map((f: any) => ({
          url:      f.url,
          label:    STAGE_DOC_LABELS[f.documentType] || 'DOCUMENT',
          subtitle: `${fmtStageKey(f.stage)}  ·  ${plan.loc || plan.id}`,
        })),
      ...(!options || options.includeNoiseVariance) && linkedVariance?.fileUrl ? [{
        url:      linkedVariance.fileUrl,
        label:    'NOISE VARIANCE',
        subtitle: `Permit ${linkedVariance.permitNumber}  ·  Valid Through ${fmtDate(linkedVariance.validThrough)}`,
      }] : [],
    ];

    // ── Fetch all attachments in parallel, then embed in order ────────────────
    const validAttachments = attachments.filter(att => att.url);

    // Parse bucket and path from a Firebase Storage download URL
    const parseStorageUrl = (url: string): { bucket: string; path: string } | null => {
      try {
        const bucketMatch = url.match(/\/v0\/b\/([^/]+)\/o\//);
        const pathMatch   = url.match(/\/o\/([^?#]+)/);
        if (!bucketMatch || !pathMatch) return null;
        return {
          bucket: decodeURIComponent(bucketMatch[1]),
          path:   decodeURIComponent(pathMatch[1]),
        };
      } catch { return null; }
    };

    const fetched = await Promise.all(
      validAttachments.map(async (att) => {
        let lastErr: unknown;

        // ── Attempt 1: Firebase SDK getBytes (uses internal auth, no CORS issues) ──
        try {
          const parsed = parseStorageUrl(att.url);
          const bytes  = await getBytes(storageRef(storage, parsed?.path ?? att.url));
          return { att, fileBytes: bytes as ArrayBuffer, error: null };
        } catch (e1) { lastErr = e1; }

        // ── Attempt 2: Authenticated REST fetch using Firebase ID token ────────────
        try {
          const parsed  = parseStorageUrl(att.url);
          const idToken = await auth.currentUser?.getIdToken();
          if (parsed && idToken) {
            const apiUrl = `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(parsed.bucket)}/o/${encodeURIComponent(parsed.path)}?alt=media`;
            const resp   = await fetch(apiUrl, { headers: { Authorization: `Bearer ${idToken}` } });
            if (!resp.ok) throw new Error(`Storage responded ${resp.status}: ${await resp.text()}`);
            return { att, fileBytes: await resp.arrayBuffer(), error: null };
          }
        } catch (e2) { lastErr = e2; }

        // ── Attempt 3: Plain fetch (works if CORS is configured on the bucket) ─────
        try {
          const resp = await fetch(att.url);
          if (!resp.ok) throw new Error(`Fetch responded ${resp.status}`);
          return { att, fileBytes: await resp.arrayBuffer(), error: null };
        } catch (e3) { lastErr = e3; }

        console.error(`[PDF] All fetch attempts failed for "${att.label}":`, lastErr);
        return { att, fileBytes: null as ArrayBuffer | null, error: lastErr };
      })
    );

    let failCount = 0;
    for (const { att, fileBytes, error } of fetched) {
      // Always add the divider page so order is preserved
      addDividerPage(mergedPdf, boldFont, regularFont, att.label, att.subtitle);

      if (error || !fileBytes) { failCount++; continue; }

      // Try loading as PDF
      let mergedAsDoc = false;
      try {
        const extDoc   = await PDFDocument.load(fileBytes, { ignoreEncryption: true });
        const extPages = await mergedPdf.copyPages(extDoc, extDoc.getPageIndices());
        extPages.forEach(p => mergedPdf.addPage(p));
        mergedAsDoc = true;
      } catch { /* not a PDF — try image below */ }

      // Fallback: try embedding as image
      if (!mergedAsDoc) {
        try {
          const uint8  = new Uint8Array(fileBytes);
          const isJpeg = uint8[0] === 0xFF && uint8[1] === 0xD8;
          const image  = isJpeg ? await mergedPdf.embedJpg(fileBytes) : await mergedPdf.embedPng(fileBytes);
          const imgPage = mergedPdf.addPage([595.28, 841.89]);
          const { width, height } = imgPage.getSize();
          const scaled = image.scaleToFit(width - 60, height - 60);
          imgPage.drawImage(image, {
            x: (width  - scaled.width)  / 2,
            y: (height - scaled.height) / 2,
            width:  scaled.width,
            height: scaled.height,
          });
        } catch (imgErr) {
          console.error(`Could not embed ${att.label} as image:`, imgErr);
          failCount++;
        }
      }
    }

    // Save & download
    const finalBytes = await mergedPdf.save();
    const blob = new Blob([finalBytes], { type: 'application/pdf' });
    const url  = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href     = url;
    link.download = `Report_${plan.loc || plan.id}_${(plan.street1 || '').replace(/\s+/g, '_')}.pdf`;
    link.click();
    URL.revokeObjectURL(url);

    dismissToast(toastId);
    if (failCount > 0) {
      const firstFail = fetched.find(f => f.error);
      const hint = firstFail?.error instanceof Error ? ` (${firstFail.error.message.slice(0, 60)})` : '';
      showToast(`PDF saved — ${failCount} attachment${failCount > 1 ? 's' : ''} could not be loaded.${hint}`, 'warning');
    } else {
      showToast('PDF ready — check your downloads.', 'success');
    }

  } catch (error) {
    console.error('Error exporting to PDF:', error);
    dismissToast(toastId);
    showToast('Failed to export PDF.', 'error');
  } finally {
    setLoading(prev => ({ ...prev, export: false }));
  }
};
