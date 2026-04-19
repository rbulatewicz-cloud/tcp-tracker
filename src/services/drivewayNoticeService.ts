import {
  Document, Packer, Paragraph, TextRun, AlignmentType, ImageRun,
  Table, TableRow, TableCell, WidthType, BorderStyle, VerticalAlign,
} from 'docx';
import { getDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { fmtDateLong } from '../utils/plans';

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
  recipientAddress: string;        // mailing address
  drivewayImpactAddress?: string;  // actual impacted driveway address
  recipientName: string;           // "Resident/Business Owner" if unknown
  remainingDrivewayOpen?: boolean; // true = one driveway stays open
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

// ── docx constants ────────────────────────────────────────────────────────────

const FONT = 'Arial';
const BODY_PT = 22;    // 11pt in docx half-points
const SMALL_PT = 18;   // 9pt
const HEADER_PT = 20;  // 10pt

// 8.5" page with 1" margins → 6.5" content = 9360 DXA
const CONTENT_W = 9360;
const LOGO_COL   = 1440;               // 1" for logo
const ORG_COL    = CONTENT_W - LOGO_COL; // 7920 for org text

// Work-details left / exhibit right split (60 / 40)
const BODY_COL    = Math.round(CONTENT_W * 0.60); // 5616
const EXHIBIT_COL = CONTENT_W - BODY_COL;          // 3744

const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const NO_BORDERS = {
  top: NO_BORDER, bottom: NO_BORDER,
  left: NO_BORDER, right: NO_BORDER,
  insideH: NO_BORDER, insideV: NO_BORDER,
};

// ── low-level helpers ─────────────────────────────────────────────────────────

function fmtDateEs(iso: string): string {
  if (!iso) return '';
  return new Date(iso + 'T00:00:00').toLocaleDateString('es-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

/** Create a styled TextRun with the shared font. */
function run(
  text: string,
  opts?: { bold?: boolean; underline?: boolean; size?: number; italic?: boolean }
): TextRun {
  return new TextRun({
    text,
    font: FONT,
    size: opts?.size ?? BODY_PT,
    bold: opts?.bold,
    italics: opts?.italic,
    underline: opts?.underline ? {} : undefined,
  });
}

/** Create a Paragraph from a string or TextRun array. */
function p(
  content: string | TextRun[],
  opts?: {
    align?: (typeof AlignmentType)[keyof typeof AlignmentType];
    spacingAfter?: number;
    spacingBefore?: number;
  }
): Paragraph {
  const children = typeof content === 'string' ? [run(content)] : content;
  return new Paragraph({
    alignment: opts?.align ?? AlignmentType.LEFT,
    spacing: {
      after:  opts?.spacingAfter  ?? 120,
      before: opts?.spacingBefore ?? 0,
    },
    children,
  });
}

/** One or more blank lines. */
function blank(n = 1): Paragraph[] {
  return Array.from({ length: n }, () =>
    new Paragraph({ children: [new TextRun({ text: '', font: FONT, size: BODY_PT })], spacing: { after: 80 } })
  );
}

// ── letterhead header table ───────────────────────────────────────────────────

function buildHeaderTable(logoData?: ArrayBuffer): Table {
  const logoChildren = logoData
    ? [new Paragraph({
        spacing: { after: 0 },
        children: [new ImageRun({
          data: logoData,
          transformation: { width: 64, height: 64 },
          type: 'png',
          altText: { title: 'Metro', description: 'Metro M Logo', name: 'MetroLogo' },
        })],
      })]
    : [p('', { spacingAfter: 0 })];

  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [LOGO_COL, ORG_COL],
    borders: NO_BORDERS,
    rows: [
      new TableRow({
        children: [
          // ── Logo cell ──
          new TableCell({
            width: { size: LOGO_COL, type: WidthType.DXA },
            borders: NO_BORDERS,
            verticalAlign: VerticalAlign.CENTER,
            children: logoChildren,
          }),
          // ── Org info cell ──
          new TableCell({
            width: { size: ORG_COL, type: WidthType.DXA },
            borders: NO_BORDERS,
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 0, bottom: 0, left: 180, right: 0 },
            children: [
              p([run('Los Angeles County Metropolitan Transportation Authority', { bold: true, size: HEADER_PT })],
                { spacingAfter: 60 }),
              p([run('One Gateway Plaza, Los Angeles, CA 90012-2952', { size: SMALL_PT })],
                { spacingAfter: 40 }),
              p([run('213.922.2000 Tel  metro.net', { size: SMALL_PT })],
                { spacingAfter: 0 }),
            ],
          }),
        ],
      }),
    ],
  });
}

/** Thin horizontal rule rendered via paragraph border-bottom. */
function hrule(): Paragraph {
  return new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: '000000', space: 1 } },
    spacing: { after: 280, before: 80 },
    children: [],
  });
}

// ── letter content builder ────────────────────────────────────────────────────

function letterChildren(
  fields: DrivewayNoticeFields,
  lang: 'en' | 'es',
  logoData?: ArrayBuffer,
  exhibitData?: ArrayBuffer,
  exhibitType: 'png' | 'jpg' = 'png',
): (Paragraph | Table)[] {
  const isEs = lang === 'es';
  const date = isEs ? fmtDateEs(fields.letterDate) : fmtDateLong(fields.letterDate);
  const body = isEs ? fields.bodyParagraphEs : fields.bodyParagraph;

  const items: (Paragraph | Table)[] = [
    // ── Metro letterhead ──
    buildHeaderTable(logoData),
    hrule(),

    // ── Date ──
    p(date, { spacingAfter: 240 }),

    // ── Recipient block ──
    p(fields.recipientName || (isEs ? 'Residente/Dueño de Negocio' : 'Resident/Business Owner'),
      { spacingAfter: 60 }),
    p(fields.recipientAddress, { spacingAfter: 240 }),

    // ── Salutation ──
    p(
      isEs
        ? `Estimado Residente/Dueño de Negocio en ${fields.recipientAddress}:`
        : `Dear Resident/Business Owner at ${fields.recipientAddress}:`,
      { spacingAfter: 120 }
    ),

    // ── RE: line — bold + underlined subject ──
    p([
      run('RE:  ', { bold: true }),
      run(
        isEs
          ? `Aviso de Próximas Obras de Construcción — ${fields.street1}${fields.street2 ? ` en ${fields.street2}` : ''}`
          : `Notice of Upcoming Construction Work — ${fields.street1}${fields.street2 ? ` at ${fields.street2}` : ''}`,
        { bold: true, underline: true }
      ),
    ], { spacingAfter: 240 }),

    // ── Body paragraph ──
    p(body, { spacingAfter: 240 }),
  ];

  // ── Work-details paragraphs ───────────────────────────────────────────────

  const closureLabel = isEs ? 'Fechas y Horas de Cierre de Entrada:' : 'Driveway Closure Dates and Hours:';
  const questionsText = isEs
    ? 'Si tiene preguntas o necesita coordinar el acceso a su entrada, contáctenos:'
    : 'If you have questions or need to coordinate driveway access, please contact us:';

  const workDetails: Paragraph[] = [
    // Section header — bold + underlined
    p([run(closureLabel, { bold: true, underline: true })], { spacingAfter: 100 }),

    // Location / Dates / Hours
    p([
      run(`${isEs ? 'Ubicación' : 'Location'}:  `, { bold: true }),
      run(`${fields.street1}${fields.street2 ? ` / ${fields.street2}` : ''}`),
    ], { spacingAfter: 80 }),
    p([
      run(`${isEs ? 'Fechas de Trabajo' : 'Work Dates'}:  `, { bold: true }),
      run(fields.workDates),
    ], { spacingAfter: 80 }),
    p([
      run(`${isEs ? 'Horario de Trabajo' : 'Work Hours'}:  `, { bold: true }),
      run(fields.workHoursDescription),
    ], { spacingAfter: 200 }),

    // Contact info intro
    p(questionsText, { spacingAfter: 100 }),
    p(`${fields.contactName}${fields.contactTitle ? `, ${fields.contactTitle}` : ''}`,
      { spacingAfter: 60 }),
    p(fields.businessName, { spacingAfter: 60 }),
    p([run(`${isEs ? 'Teléfono' : 'Phone'}:  `, { bold: true }), run(fields.contactPhone)],
      { spacingAfter: 60 }),
    p([run(`${isEs ? 'Correo' : 'Email'}:  `, { bold: true }), run(fields.contactEmail)],
      { spacingAfter: 0 }),
  ];

  // ── Exhibit: place alongside work-details if present, else inline ─────────

  if (exhibitData) {
    const legendText = fields.remainingDrivewayOpen
      ? (isEs
          ? '🟢 Verde = entrada abierta\n🔴 Rojo = entrada afectada'
          : '🟢 Green = driveway open\n🔴 Red = driveway affected by construction')
      : (isEs
          ? '🔴 Rojo = entrada afectada por la construcción'
          : '🔴 Red = driveway affected by construction');

    items.push(
      new Table({
        width: { size: CONTENT_W, type: WidthType.DXA },
        columnWidths: [BODY_COL, EXHIBIT_COL],
        borders: NO_BORDERS,
        rows: [
          new TableRow({
            children: [
              // Left: work details
              new TableCell({
                width: { size: BODY_COL, type: WidthType.DXA },
                borders: NO_BORDERS,
                verticalAlign: VerticalAlign.TOP,
                children: workDetails,
              }),
              // Right: exhibit image
              new TableCell({
                width: { size: EXHIBIT_COL, type: WidthType.DXA },
                borders: NO_BORDERS,
                verticalAlign: VerticalAlign.TOP,
                margins: { top: 0, bottom: 0, left: 240, right: 0 },
                children: [
                  p([run(isEs ? 'Exhibición 1:' : 'Exhibit 1:', { bold: true, size: SMALL_PT })],
                    { spacingAfter: 80 }),
                  new Paragraph({
                    spacing: { after: 80 },
                    children: [new ImageRun({
                      data: exhibitData,
                      transformation: { width: 230, height: 175 },
                      type: exhibitType,
                      altText: {
                        title: 'Exhibit 1',
                        description: 'Driveway impact area photo',
                        name: 'Exhibit1',
                      },
                    })],
                  }),
                  p([run(legendText, { size: SMALL_PT })], { spacingAfter: 0 }),
                ],
              }),
            ],
          }),
        ],
      })
    );
  } else {
    items.push(...workDetails);
  }

  // ── Appreciation ──
  items.push(
    ...blank(1),
    p(
      isEs
        ? 'Agradecemos su paciencia y comprensión mientras trabajamos para completar este importante proyecto de infraestructura.'
        : 'We appreciate your patience and understanding as we work to complete this important infrastructure project.',
      { spacingAfter: 240 }
    )
  );

  // ── Signature block ──
  items.push(
    p(isEs ? 'Atentamente,' : 'Sincerely,', { spacingAfter: 360 }),
    p([run(fields.contactName, { bold: true })], { spacingAfter: 60 }),
    p(fields.contactTitle, { spacingAfter: 60 }),
    p(fields.businessName, { spacingAfter: 60 }),
    p(fields.contactPhone, { spacingAfter: 60 }),
    p(fields.contactEmail, { spacingAfter: 0 }),
    ...blank(1),
    p(
      `${fields.projectName} — ${isEs ? 'Segmento' : 'Segment'} ${fields.segment}`,
      { align: AlignmentType.CENTER, spacingAfter: 0 }
    )
  );

  return items;
}

// ── docx assembly ─────────────────────────────────────────────────────────────

export async function buildNoticeDocx(
  fields: DrivewayNoticeFields,
  exhibitImageUrl?: string
): Promise<Blob> {
  // Fetch Metro logo (stored in /public/metro-logo.png)
  let logoData: ArrayBuffer | undefined;
  try {
    const logoResp = await fetch('/metro-logo.png');
    if (logoResp.ok) logoData = await logoResp.arrayBuffer();
  } catch {
    // Continue without logo
  }

  // Fetch exhibit image if provided
  let exhibitData: ArrayBuffer | undefined;
  let exhibitType: 'png' | 'jpg' = 'png';
  if (exhibitImageUrl) {
    try {
      const resp = await fetch(exhibitImageUrl);
      exhibitData = await resp.arrayBuffer();
      // Detect image type from URL extension
      const ext = exhibitImageUrl.split('?')[0].split('.').pop()?.toLowerCase() ?? 'png';
      exhibitType = (ext === 'jpg' || ext === 'jpeg') ? 'jpg' : 'png';
    } catch {
      // Exhibit fetch failed — continue without it
    }
  }

  const sectionProps = {
    properties: {
      page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } },
    },
  };

  const d = new Document({
    sections: [
      {
        ...sectionProps,
        children: letterChildren(fields, 'en', logoData, exhibitData, exhibitType),
      },
      {
        ...sectionProps,
        children: letterChildren(fields, 'es', logoData, exhibitData, exhibitType),
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
