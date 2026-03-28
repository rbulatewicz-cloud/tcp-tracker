/**
 * PHE Packet Generator
 *
 * Assembles the BOE Peak Hour Exemption Application Packet:
 *   - Page 1: Checklist cover (from original PDF, as-is)
 *   - Page 2: Request Form filled with plan + settings data
 *   - Page 3: Additional Information (work description, peak justification, CD concurrence)
 *   - Exhibits: divider page + uploaded attachment pages for each completed checklist item
 */

import { PDFDocument, StandardFonts, rgb, PDFPage, PDFFont } from 'pdf-lib';
import { Plan, AppConfig, WorkHours } from '../types';
import { showToast } from '../lib/toast';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';
import { DEFAULT_APP_CONFIG } from '../constants';

// ── Field coordinates (letter page: 612 × 792 pts, bottom-left origin) ─────────

/** Page index 1 — "PEAK HOUR REQUEST FORM" */
const P2 = {
  date:             { x: 108, y: 701 },
  projectName:      { x: 183, y: 683 },
  projectAddress:   { x: 292, y: 664 },
  personAuthorized: { x: 318, y: 645 },
  businessName:     { x: 172, y: 627 },
  address:          { x: 112, y: 609 },
  contact:          { x: 107, y: 590 },
  contactPhone:     { x: 344, y: 590 },
  contactEmail:     { x: 200, y: 572 },
  // Subcontractor
  subYes:           { x: 291, y: 554 },
  subNo:            { x: 331, y: 554 },
  primeName:        { x: 233, y: 535 },
  primeContact:     { x: 434, y: 535 },
  primePhone:       { x: 154, y: 516 },
  primeEmail:       { x: 362, y: 516 },
  // BOE Permit type checkboxes
  permitA:          { x: 127, y: 459 },
  permitB:          { x: 203, y: 459 },
  permitE:          { x: 279, y: 459 },
  permitU:          { x: 355, y: 459 },
  permitS:          { x: 427, y: 459 },
  permitNumber:     { x: 113, y: 438 },
  // Dates + duration
  datesFrom:        { x: 235, y: 377 },
  datesTo:          { x: 443, y: 377 },
  duration:         { x: 303, y: 358 },
  morningHours:     { x: 140, y: 340 },
  afternoonHours:   { x: 372, y: 340 },
  // Day checkboxes
  monday:           { x: 105, y: 309 },
  tuesday:          { x: 170, y: 309 },
  wednesday:        { x: 244, y: 309 },
  thursday:         { x: 327, y: 309 },
  friday:           { x: 406, y: 309 },
  saturday:         { x: 465, y: 309 },
  sunday:           { x: 532, y: 309 },
  // Impacted lanes box
  impactedLanes:    { x: 77,  y: 272 },
};

/** Page index 2 — "Additional Information" */
const P3 = {
  workDescription:    { x: 77, y: 652 },
  peakJustification:  { x: 77, y: 472 },
  affectedCDs:        { x: 272, y: 301 },
  cdConcurYes:        { x: 348, y: 284 },
  cdConcurNo:         { x: 388, y: 284 },
};

const EXHIBIT_LABELS: Record<string, string> = {
  tcp_wtcp:         'LADOT Approved TCP / WTCP',
  council_comms:    'City Council District Communication',
  fee_payment:      'Fee Payment Confirmation',
  closure_schedule: 'Schedule of Street Closures',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(dateStr?: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr.includes('T') ? dateStr : dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return dateStr;
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}

function to12h(t: string): string {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const period = h < 12 ? 'a.m.' : 'p.m.';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${m.toString().padStart(2, '0')} ${period}`;
}

function wrapText(text: string, maxW: number, font: PDFFont, size: number): string[] {
  const lines: string[] = [];
  let cur = '';
  for (const word of text.split(/\s+/)) {
    const test = cur ? `${cur} ${word}` : word;
    if (font.widthOfTextAtSize(test, size) > maxW && cur) {
      lines.push(cur);
      cur = word;
    } else {
      cur = test;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function txt(page: PDFPage, text: string, x: number, y: number, font: PDFFont, size = 9) {
  if (!text) return;
  page.drawText(text, { x, y, font, size, color: rgb(0, 0, 0) });
}

function chk(page: PDFPage, x: number, y: number, font: PDFFont) {
  page.drawText('X', { x, y, font, size: 8, color: rgb(0, 0, 0) });
}

function wrappedTxt(
  page: PDFPage, text: string,
  x: number, y: number, maxW: number,
  font: PDFFont, size = 9
) {
  if (!text) return;
  const lines = wrapText(text, maxW, font, size);
  const lh = size * 1.5;
  lines.forEach((line, i) => {
    if (y - i * lh < 50) return;
    page.drawText(line, { x, y: y - i * lh, font, size, color: rgb(0, 0, 0) });
  });
}

async function addExhibitPage(
  output: PDFDocument,
  letter: string,
  label: string,
  font: PDFFont,
  boldFont: PDFFont
) {
  const page = output.addPage([612, 792]);
  // Dark blue header bar
  page.drawRectangle({ x: 0, y: 702, width: 612, height: 90, color: rgb(0.06, 0.26, 0.52) });
  page.drawText(`EXHIBIT ${letter}`, { x: 72, y: 752, font: boldFont, size: 28, color: rgb(1, 1, 1) });
  page.drawText(label,               { x: 72, y: 720, font,           size: 13, color: rgb(0.8, 0.88, 1) });
  // Thin rule
  page.drawLine({ start: { x: 72, y: 698 }, end: { x: 540, y: 698 }, thickness: 0.5, color: rgb(0.75, 0.75, 0.75) });
  // Body note
  page.drawText('See following page(s) for the submitted document.', {
    x: 72, y: 380, font, size: 11, color: rgb(0.55, 0.55, 0.55),
  });
}

// ── Fetch appConfig from Firestore ────────────────────────────────────────────

async function fetchAppConfig(): Promise<AppConfig> {
  try {
    const snap = await getDoc(doc(db, 'settings', 'appConfig'));
    if (snap.exists()) return { ...DEFAULT_APP_CONFIG, ...snap.data() } as AppConfig;
  } catch (e) {
    handleFirestoreError(e, OperationType.GET, 'settings/appConfig');
  }
  return DEFAULT_APP_CONFIG as AppConfig;
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function generatePHEPacket(plan: Plan): Promise<void> {
  try {
    showToast('Assembling PHE packet…', 'info');

    // Load form template + appConfig in parallel
    const [formRes, appConfig] = await Promise.all([
      fetch('/forms/phe_application.pdf'),
      fetchAppConfig(),
    ]);
    if (!formRes.ok) throw new Error('PHE form template not found at /forms/phe_application.pdf');
    const formBytes = await formRes.arrayBuffer();

    const templatePdf = await PDFDocument.load(formBytes);
    const output      = await PDFDocument.create();
    const font        = await output.embedFont(StandardFonts.Helvetica);
    const boldFont    = await output.embedFont(StandardFonts.HelveticaBold);

    // Copy all 3 template pages
    const [p0, p1, p2] = await output.copyPages(templatePdf, [0, 1, 2]);
    output.addPage(p0); // Checklist — no modifications
    output.addPage(p1); // Request Form
    output.addPage(p2); // Additional Info

    const page1 = output.getPage(1);
    const page2 = output.getPage(2);

    const phe = plan.compliance?.phe;
    const win = plan.implementationWindow;
    const wh  = plan.work_hours as WorkHours | undefined;

    // ── Page 2: Request Form ─────────────────────────────────────────────────

    txt(page1, fmt(new Date().toISOString()), P2.date.x, P2.date.y, font);
    txt(page1, appConfig.phe_projectName || '', P2.projectName.x, P2.projectName.y, font);
    txt(page1, [plan.street1, plan.street2].filter(Boolean).join(' / '), P2.projectAddress.x, P2.projectAddress.y, font);
    txt(page1, appConfig.phe_contactName  || '', P2.personAuthorized.x, P2.personAuthorized.y, font);
    txt(page1, appConfig.phe_businessName || '', P2.businessName.x, P2.businessName.y, font);
    txt(page1, appConfig.phe_address      || '', P2.address.x, P2.address.y, font);
    txt(page1, appConfig.phe_contactName  || '', P2.contact.x, P2.contact.y, font);
    txt(page1, appConfig.phe_contactPhone || '', P2.contactPhone.x, P2.contactPhone.y, font);
    txt(page1, appConfig.phe_contactEmail || '', P2.contactEmail.x, P2.contactEmail.y, font);

    if (appConfig.phe_isSubcontractor) {
      chk(page1, P2.subYes.x, P2.subYes.y, font);
      txt(page1, appConfig.phe_primeContractorName || '', P2.primeName.x, P2.primeName.y, font);
      txt(page1, appConfig.phe_primeContactName    || '', P2.primeContact.x, P2.primeContact.y, font);
      txt(page1, appConfig.phe_primePhone          || '', P2.primePhone.x, P2.primePhone.y, font);
      txt(page1, appConfig.phe_primeEmail          || '', P2.primeEmail.x, P2.primeEmail.y, font);
    } else {
      chk(page1, P2.subNo.x, P2.subNo.y, font);
    }

    // Permit type
    const permitType = phe?.permitType || appConfig.phe_defaultPermitType;
    const permitCheckMap: Record<string, typeof P2.permitA> = {
      A: P2.permitA, B: P2.permitB, E: P2.permitE, U: P2.permitU, S: P2.permitS,
    };
    if (permitType && permitCheckMap[permitType]) {
      chk(page1, permitCheckMap[permitType].x, permitCheckMap[permitType].y, font);
    }
    if (phe?.boePermitNumber) txt(page1, phe.boePermitNumber, P2.permitNumber.x, P2.permitNumber.y, font);

    // Dates
    if (win?.startDate) txt(page1, fmt(win.startDate), P2.datesFrom.x, P2.datesFrom.y, font);
    if (win?.endDate)   txt(page1, fmt(win.endDate),   P2.datesTo.x,   P2.datesTo.y,   font);
    if (phe?.projectDurationMonths) {
      txt(page1, String(phe.projectDurationMonths), P2.duration.x, P2.duration.y, font);
    }

    // Work hours → morning / afternoon fields + day checkboxes
    if (wh) {
      if (wh.shift === 'continuous') {
        txt(page1, '6:00 a.m. - 9:00 a.m.', P2.morningHours.x,   P2.morningHours.y,   font);
        txt(page1, '3:30 p.m. - 7:00 p.m.', P2.afternoonHours.x, P2.afternoonHours.y, font);
      } else {
        // Use weekday hours if available, otherwise first available day
        const dayKey = wh.days.includes('weekday') ? 'weekday' : wh.days[0];
        const s = wh[`${dayKey}_start` as keyof WorkHours] as string | undefined;
        const e = wh[`${dayKey}_end`   as keyof WorkHours] as string | undefined;
        if (s && e) {
          const formatted = `${to12h(s)} - ${to12h(e)}`;
          const startHour = parseInt(s.split(':')[0]);
          if (startHour < 12) txt(page1, formatted, P2.morningHours.x,   P2.morningHours.y,   font);
          else                 txt(page1, formatted, P2.afternoonHours.x, P2.afternoonHours.y, font);
        }
      }
      // Day checkboxes
      if (wh.days.includes('weekday')) {
        [P2.monday, P2.tuesday, P2.wednesday, P2.thursday, P2.friday]
          .forEach(p => chk(page1, p.x, p.y, font));
      }
      if (wh.days.includes('saturday')) chk(page1, P2.saturday.x, P2.saturday.y, font);
      if (wh.days.includes('sunday'))   chk(page1, P2.sunday.x,   P2.sunday.y,   font);
    }

    // Impacted lanes
    if (phe?.impactedLanes) {
      wrappedTxt(page1, phe.impactedLanes, P2.impactedLanes.x, P2.impactedLanes.y, 450, font);
    }

    // ── Page 3: Additional Information ──────────────────────────────────────

    wrappedTxt(page2, plan.notes || '', P3.workDescription.x, P3.workDescription.y, 450, font);
    wrappedTxt(page2, phe?.peakHourJustification || '', P3.peakJustification.x, P3.peakJustification.y, 450, font);

    const cdTrack = plan.compliance?.cdConcurrence;
    if (cdTrack) {
      const applicable = cdTrack.cds.filter(c => c.applicable);
      txt(page2, applicable.map(c => c.cd).join(', '), P3.affectedCDs.x, P3.affectedCDs.y, font);
      const allConcurred = applicable.length > 0 && applicable.every(c => c.status === 'concurred');
      if (allConcurred) chk(page2, P3.cdConcurYes.x, P3.cdConcurYes.y, font);
      else              chk(page2, P3.cdConcurNo.x,  P3.cdConcurNo.y,  font);
    }

    // ── Exhibits ─────────────────────────────────────────────────────────────

    const exhibitItems = (phe?.checklist ?? []).filter(
      item => item.id !== 'phe_form' && item.attachments && item.attachments.length > 0
    );
    const letters = 'ABCDEFGHIJ';

    for (let i = 0; i < exhibitItems.length; i++) {
      const item   = exhibitItems[i];
      const letter = letters[i] ?? String(i + 1);
      const label  = EXHIBIT_LABELS[item.id] ?? item.label;

      await addExhibitPage(output, letter, label, font, boldFont);

      for (const attachment of item.attachments ?? []) {
        try {
          const res = await fetch(attachment.url);
          if (!res.ok) continue;
          const bytes       = await res.arrayBuffer();
          const contentType = res.headers.get('content-type') ?? '';
          const isPdf  = contentType.includes('pdf') || attachment.name.toLowerCase().endsWith('.pdf');
          const isPng  = contentType.includes('png') || attachment.name.toLowerCase().endsWith('.png');
          const isJpeg = !isPdf && !isPng;

          if (isPdf) {
            const attachDoc   = await PDFDocument.load(bytes);
            const attachPages = await output.copyPages(attachDoc, attachDoc.getPageIndices());
            attachPages.forEach(p => output.addPage(p));
          } else {
            const imgPage = output.addPage([612, 792]);
            const img = isPng ? await output.embedPng(bytes) : await output.embedJpg(bytes);
            const { width, height } = img.scaleToFit(560, 740);
            imgPage.drawImage(img, {
              x: (612 - width) / 2,
              y: (792 - height) / 2,
              width, height,
            });
          }
        } catch (err) {
          console.warn(`PHE packet: could not embed "${attachment.name}"`, err);
        }
      }
    }

    // ── Download ─────────────────────────────────────────────────────────────

    const pdfBytes = await output.save();
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `PHE_Packet_${plan.loc || plan.id}_${(plan.street1 ?? '').replace(/\s+/g, '_')}.pdf`;
    a.click();
    URL.revokeObjectURL(url);

    showToast('PHE packet downloaded.', 'success');
  } catch (err) {
    console.error('PHE packet error:', err);
    showToast('Failed to generate PHE packet.', 'error');
  }
}
