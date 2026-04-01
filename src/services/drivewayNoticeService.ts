import { Document, Packer, Paragraph, TextRun, AlignmentType, ImageRun, PageBreak } from 'docx';
import { getDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DrivewayNoticeFields {
  letterDate: string;          // YYYY-MM-DD
  projectName: string;
  businessName: string;
  contactName: string;
  contactTitle: string;
  contactPhone: string;
  contactEmail: string;
  street1: string;
  street2: string;
  segment: string;
  workDates: string;                // e.g. "April 1 – June 30, 2025"
  workHoursDescription: string;    // e.g. "nighttime hours (9:00 PM to 6:00 AM) Monday through Friday"
  recipientAddress: string;        // affected property address
  recipientName: string;           // "Resident/Business Owner" if unknown
  remainingDrivewayOpen?: boolean; // true = one driveway stays open (green in exhibit)
  // AI-generated body
  bodyParagraph: string;
  bodyParagraphEs: string;         // Spanish translation
}

export interface GenerateNoticeResult {
  bodyParagraph: string;
  bodyParagraphEs: string;
}

// ── Gemini AI generation ──────────────────────────────────────────────────────

export async function generateNoticeContent(
  fields: DrivewayNoticeFields,
  corpusExamples: DrivewayNoticeFields[] = []
): Promise<GenerateNoticeResult> {
  const aiSnap = await getDoc(doc(db, 'settings', 'aiConfig'));
  const apiKey: string | undefined = aiSnap.exists() ? aiSnap.data().geminiApiKey : undefined;
  if (!apiKey) throw new Error('No Gemini API key configured. Add it in Settings → System → AI Configuration.');

  const examplesBlock = corpusExamples.length > 0
    ? `\n\nHere are ${corpusExamples.length} previously approved letter(s) for similar work on this project. Match their tone, style, and level of detail:\n\n` +
      corpusExamples.map((e, i) =>
        `--- Example ${i + 1} ---\n${e.bodyParagraph}`
      ).join('\n\n')
    : '';

  const remainingNote = fields.remainingDrivewayOpen
    ? ' Note: one alternate driveway at this property will remain open during work hours.'
    : '';

  const prompt = `You are drafting a professional driveway impact notice letter for a property owner or resident affected by nearby construction work on the Los Angeles Metro Extension (ESFV LRT).

Project details:
- Project name: ${fields.projectName}
- Contractor: ${fields.businessName}
- Work location: ${fields.street1}${fields.street2 ? ` at ${fields.street2}` : ''}, Segment ${fields.segment}
- Work schedule: ${fields.workDates}
- Work hours: ${fields.workHoursDescription}
- Recipient property: ${fields.recipientAddress}${remainingNote}
${examplesBlock}

Generate a professional notice body in BOTH English and Spanish. The English body (4-6 sentences) should:
1. Introduce the project and contractor briefly
2. Explain that driveway access will be temporarily impacted during work hours${fields.remainingDrivewayOpen ? ', and that one alternate driveway will remain accessible' : ''}
3. State the work schedule clearly
4. Invite them to contact the project team for questions or to coordinate access

The Spanish version must be a faithful, professional translation of the English version.

Respond ONLY with valid JSON:
{
  "bodyParagraph": "English body paragraph text.",
  "bodyParagraphEs": "Spanish body paragraph text."
}`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 1024 },
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API error: ${err.slice(0, 300)}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  const clean = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  let parsed: GenerateNoticeResult;
  try {
    parsed = JSON.parse(clean);
  } catch {
    throw new Error(`Could not parse Gemini response as JSON. Raw: ${text.slice(0, 200)}`);
  }
  return parsed;
}

// ── docx helpers ──────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  if (!iso) return '';
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function fmtDateEs(iso: string): string {
  if (!iso) return '';
  return new Date(iso + 'T00:00:00').toLocaleDateString('es-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function para(
  text: string,
  opts?: { bold?: boolean; size?: number; align?: typeof AlignmentType[keyof typeof AlignmentType]; spacingAfter?: number }
): Paragraph {
  return new Paragraph({
    alignment: opts?.align ?? AlignmentType.LEFT,
    spacing: { after: opts?.spacingAfter ?? 120 },
    children: [
      new TextRun({
        text,
        bold: opts?.bold,
        size: opts?.size ?? 22,
        font: 'Calibri',
      }),
    ],
  });
}

function blank(n = 1): Paragraph[] {
  return Array.from({ length: n }, () => para(''));
}

function letterChildren(fields: DrivewayNoticeFields, lang: 'en' | 'es', exhibitData?: ArrayBuffer): (Paragraph)[] {
  const isEs = lang === 'es';
  const date = isEs ? fmtDateEs(fields.letterDate) : fmtDate(fields.letterDate);
  const body = isEs ? fields.bodyParagraphEs : fields.bodyParagraph;

  const children: Paragraph[] = [
    para(date, { spacingAfter: 240 }),
    para(fields.recipientName || (isEs ? 'Residente/Dueño de Negocio' : 'Resident/Business Owner')),
    para(fields.recipientAddress, { spacingAfter: 240 }),
    para(isEs
      ? `Estimado Residente/Dueño de Negocio en ${fields.recipientAddress}:`
      : `Dear Resident/Business Owner at ${fields.recipientAddress}:`,
      { spacingAfter: 120 }
    ),
    para(
      isEs
        ? `RE: Aviso de Próximas Obras de Construcción — ${fields.street1}${fields.street2 ? ` en ${fields.street2}` : ''}`
        : `RE: Notice of Upcoming Construction Work — ${fields.street1}${fields.street2 ? ` at ${fields.street2}` : ''}`,
      { bold: true, spacingAfter: 240 }
    ),
    para(body, { spacingAfter: 240 }),
    para(isEs ? 'Detalles del Trabajo Programado:' : 'Scheduled Work Details:', { bold: true, spacingAfter: 60 }),
    para(`${isEs ? 'Ubicación' : 'Location'}:    ${fields.street1}${fields.street2 ? ` / ${fields.street2}` : ''}`, { spacingAfter: 60 }),
    para(`${isEs ? 'Fechas de Trabajo' : 'Work Dates'}:  ${fields.workDates}`, { spacingAfter: 60 }),
    para(`${isEs ? 'Horario de Trabajo' : 'Work Hours'}:  ${fields.workHoursDescription}`, { spacingAfter: 240 }),
    para(
      isEs
        ? 'Si tiene preguntas o necesita coordinar el acceso a su entrada, contáctenos:'
        : 'If you have questions or need to coordinate driveway access, please contact us:',
      { spacingAfter: 120 }
    ),
    para(`${fields.contactName}${fields.contactTitle ? `, ${fields.contactTitle}` : ''}`, { spacingAfter: 60 }),
    para(fields.businessName, { spacingAfter: 60 }),
    para(`${isEs ? 'Teléfono' : 'Phone'}: ${fields.contactPhone}`, { spacingAfter: 60 }),
    para(`${isEs ? 'Correo' : 'Email'}: ${fields.contactEmail}`, { spacingAfter: 240 }),
    para(
      isEs
        ? 'Agradecemos su paciencia y comprensión mientras trabajamos para completar este importante proyecto de infraestructura.'
        : 'We appreciate your patience and understanding as we work to complete this important infrastructure project.',
      { spacingAfter: 240 }
    ),
    para(isEs ? 'Atentamente,' : 'Sincerely,', { spacingAfter: 360 }),
    para(fields.contactName, { bold: true, spacingAfter: 60 }),
    para(fields.contactTitle, { spacingAfter: 60 }),
    para(fields.businessName, { spacingAfter: 60 }),
    para(fields.contactPhone, { spacingAfter: 60 }),
    para(fields.contactEmail, { spacingAfter: 0 }),
    ...blank(2),
    para(`${fields.projectName} — ${isEs ? 'Segmento' : 'Segment'} ${fields.segment}`, {
      size: 18,
      align: AlignmentType.CENTER,
    }),
  ];

  // Exhibit 1 page
  if (exhibitData) {
    children.push(
      new Paragraph({
        children: [new PageBreak()],
        spacing: { after: 0 },
      })
    );
    children.push(para(isEs ? 'Exhibición 1 — Área de Impacto de Entrada' : 'Exhibit 1 — Driveway Impact Area', { bold: true, spacingAfter: 240 }));
    children.push(
      new Paragraph({
        children: [
          new ImageRun({
            data: exhibitData,
            transformation: { width: 500, height: 350 },
            type: 'png',
          }),
        ],
        spacing: { after: 120 },
      })
    );
    if (fields.remainingDrivewayOpen) {
      children.push(para(
        isEs
          ? '🟢 Verde = entrada que permanece abierta   🔴 Rojo = entrada afectada por la construcción'
          : '🟢 Green = driveway remaining open   🔴 Red = driveway affected by construction',
        { size: 18, spacingAfter: 0 }
      ));
    } else {
      children.push(para(
        isEs ? '🔴 Rojo = entrada afectada por la construcción' : '🔴 Red = driveway affected by construction',
        { size: 18, spacingAfter: 0 }
      ));
    }
  }

  return children;
}

// ── docx assembly ─────────────────────────────────────────────────────────────

export async function buildNoticeDocx(
  fields: DrivewayNoticeFields,
  exhibitImageUrl?: string
): Promise<Blob> {
  // Fetch exhibit image if provided
  let exhibitData: ArrayBuffer | undefined;
  if (exhibitImageUrl) {
    try {
      const resp = await fetch(exhibitImageUrl);
      exhibitData = await resp.arrayBuffer();
    } catch {
      // Exhibit fetch failed — continue without it
    }
  }

  const d = new Document({
    sections: [
      {
        properties: {
          page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } },
        },
        children: letterChildren(fields, 'en', exhibitData),
      },
      {
        properties: {
          page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } },
        },
        children: letterChildren(fields, 'es', exhibitData),
      },
    ],
  });

  return Packer.toBlob(d);
}

export async function downloadNoticeDocx(
  fields: DrivewayNoticeFields,
  filename: string,
  exhibitImageUrl?: string
): Promise<void> {
  const blob = await buildNoticeDocx(fields, exhibitImageUrl);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
