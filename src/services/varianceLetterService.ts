import { Document, Packer, Paragraph, TextRun, AlignmentType, SectionType } from 'docx';
import { getDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface VarianceLetterFields {
  // Pre-filled from plan / appConfig
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
  workHoursDescription: string;  // e.g. "nighttime hours (9:00 PM to 6:00 AM) Monday through Friday"

  // Variance dates
  validFrom: string;           // YYYY-MM-DD
  validThrough: string;        // YYYY-MM-DD

  // Payment
  checkNumber: string;
  checkAmount: string;

  // CC list
  ccList: string;              // newline-separated names

  // AI-generated (populated after generate step)
  subjectLine: string;
  scopeParagraph: string;
  equipmentList: string;       // newline-separated equipment items
}

export interface GenerateResult {
  subjectLine: string;
  scopeParagraph: string;
  equipmentList: string;
}

// ── Gemini AI generation ──────────────────────────────────────────────────────

export async function generateLetterContent(fields: VarianceLetterFields, isRenewal = false): Promise<GenerateResult> {
  const aiSnap = await getDoc(doc(db, 'settings', 'aiConfig'));
  const apiKey: string | undefined = aiSnap.exists() ? aiSnap.data().geminiApiKey : undefined;
  if (!apiKey) throw new Error('No Gemini API key configured. Add it in Settings → System → AI Configuration.');

  const letterType = isRenewal ? 'Noise Variance Renewal' : 'Noise Variance Application';
  const prompt = `You are drafting a professional ${letterType} letter to the Los Angeles Board of Police Commissioners for a construction project on the Los Angeles Metro Extension (ESFV LRT Extension).

Project details:
- Project name: ${fields.projectName}
- Contractor: ${fields.businessName}
- Work location: ${fields.street1}${fields.street2 ? ` at ${fields.street2}` : ''}, Segment ${fields.segment}
- Work hours requiring variance: ${fields.workHoursDescription}
- Valid from: ${fields.validFrom} through ${fields.validThrough}
${isRenewal ? '- This is a RENEWAL of an existing variance. Reference the renewal context in the subject and opening.' : ''}

Generate the following JSON (respond ONLY with valid JSON, no markdown):
{
  "subjectLine": "A concise Re: subject line for the letter (e.g. 'Re: ${isRenewal ? 'Noise Variance Renewal' : 'Noise Variance Application'} – [Project] – [Streets] – Segment [X]')",
  "scopeParagraph": "3-5 professional sentences describing the scope of nighttime construction work being requested. Include why nighttime work is necessary (traffic impacts, LADOT/Metro requirements), the nature of the work, and the location. Be formal and specific.",
  "equipmentList": "A realistic comma-separated list of heavy construction equipment likely used for this type of work (e.g. Excavator, Vibratory Compactor, Concrete Saw, Jackhammer, Air Compressor, Flatbed Truck, Light Tower). 6-10 items."
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

  // Strip markdown code fences if present
  const clean = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  let parsed: GenerateResult;
  try {
    parsed = JSON.parse(clean);
  } catch {
    throw new Error(`Could not parse Gemini response as JSON. Raw: ${text.slice(0, 200)}`);
  }
  return parsed;
}

// ── docx assembly ─────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  if (!iso) return '';
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function para(text: string, opts?: { bold?: boolean; size?: number; align?: typeof AlignmentType[keyof typeof AlignmentType]; spacingAfter?: number }): Paragraph {
  return new Paragraph({
    alignment: opts?.align ?? AlignmentType.LEFT,
    spacing: { after: opts?.spacingAfter ?? 120 },
    children: [
      new TextRun({
        text,
        bold: opts?.bold,
        size: opts?.size ?? 22,  // half-points: 22 = 11pt
        font: 'Calibri',
      }),
    ],
  });
}

function blank(n = 1): Paragraph[] {
  return Array.from({ length: n }, () => para(''));
}

export function buildLetterDocx(fields: VarianceLetterFields, isRenewal = false): Promise<Blob> {
  const equipment = fields.equipmentList
    .split(/[\n,]+/)
    .map(s => s.trim())
    .filter(Boolean);

  const ccNames = fields.ccList
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean);

  const doc = new Document({
    sections: [
      {
        properties: {
          type: SectionType.CONTINUOUS,
          page: {
            margin: { top: 1080, bottom: 1080, left: 1080, right: 1080 }, // ~0.75in in twentieths of a point
          },
        },
        children: [

          // ── From ──────────────────────────────────────────────────
          para(fields.businessName, { bold: true }),
          para(fields.projectName),
          ...blank(),

          // ── Date ──────────────────────────────────────────────────
          para(fmtDate(fields.letterDate)),
          ...blank(),

          // ── To ────────────────────────────────────────────────────
          para('Board of Police Commissioners', { bold: true }),
          para('City of Los Angeles'),
          para('100 West 1st Street, Suite 250'),
          para('Los Angeles, CA 90012'),
          ...blank(),

          // ── Subject ───────────────────────────────────────────────
          para(fields.subjectLine, { bold: true }),
          ...blank(),

          // ── Salutation ────────────────────────────────────────────
          para('Dear Members of the Board:'),
          ...blank(),

          // ── Opening ───────────────────────────────────────────────
          para(
            isRenewal
              ? `${fields.businessName} respectfully submits this application for renewal of a Noise Variance pursuant to Los Angeles Municipal Code Section 41.40. Our current variance is expiring and we are requesting continued authorization to conduct construction operations during restricted hours at the above-referenced location.`
              : `${fields.businessName} respectfully submits this application for a Noise Variance pursuant to Los Angeles Municipal Code Section 41.40. We are requesting authorization to conduct construction operations during restricted hours at the above-referenced location.`
          ),
          ...blank(),

          // ── Scope paragraph (AI-generated) ────────────────────────
          para(fields.scopeParagraph),
          ...blank(),

          // ── Work hours ────────────────────────────────────────────
          para(`The requested noise variance covers ${fields.workHoursDescription}, for the period from ${fmtDate(fields.validFrom)} through ${fmtDate(fields.validThrough)}.`),
          ...blank(),

          // ── Equipment list ────────────────────────────────────────
          para('The following equipment will be used during nighttime operations:'),
          ...equipment.map(item =>
            new Paragraph({
              spacing: { after: 40 },
              indent: { left: 360 },
              children: [new TextRun({ text: `•  ${item}`, size: 22, font: 'Calibri' })],
            })
          ),
          ...blank(),

          // ── LAMC compliance language ──────────────────────────────
          para(
            'The applicant agrees to comply with all conditions set forth by the Board of Police Commissioners, and will make every reasonable effort to minimize noise impacts to neighboring residents and businesses during the approved work periods.'
          ),
          ...blank(),

          // ── Payment ───────────────────────────────────────────────
          ...(fields.checkNumber || fields.checkAmount ? [
            para(`Enclosed please find Check No. ${fields.checkNumber} in the amount of $${fields.checkAmount} as payment for the required permit fee.`),
            ...blank(),
          ] : []),

          // ── Closing ───────────────────────────────────────────────
          para('Thank you for your consideration of this application. Please do not hesitate to contact our office with any questions.'),
          ...blank(),
          para('Sincerely,'),
          ...blank(3),

          // ── Signature block ───────────────────────────────────────
          para(fields.contactName, { bold: true }),
          para(fields.contactTitle),
          para(fields.businessName),
          ...(fields.contactPhone ? [para(fields.contactPhone)] : []),
          ...(fields.contactEmail ? [para(fields.contactEmail)] : []),

          // ── CC ────────────────────────────────────────────────────
          ...(ccNames.length > 0 ? [
            ...blank(),
            para('cc:'),
            ...ccNames.map(name =>
              new Paragraph({
                spacing: { after: 40 },
                indent: { left: 360 },
                children: [new TextRun({ text: name, size: 22, font: 'Calibri' })],
              })
            ),
          ] : []),
        ],
      },
    ],
  });

  return Packer.toBlob(doc);
}

export async function downloadLetterDocx(fields: VarianceLetterFields, filename: string, isRenewal = false): Promise<void> {
  const blob = await buildLetterDocx(fields, isRenewal);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
