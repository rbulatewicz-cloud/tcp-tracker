/**
 * T-6.2 — TANSAT legacy xlsx import.
 *
 * Imports Justin's "TANSAT Tracking Log" spreadsheet into the
 * `tansatRequests` collection. Handles his real-world data quirks:
 *
 * - Activity column has typos and inconsistent casing
 *   (`Conduit Work` vs `Conduit work` vs `Plummer Conduit Work`)
 *   → mapped to a curated TansatActivity enum + 'other' fallback.
 * - Phase column uses "1", "2", "3,4,5", "1-9", "1 & 2", "(1-4)", "All"
 *   → parsed into a numeric phaseNumbers[] array.
 * - Plan/Location names ("UA 4 WATCH", "Pacoima Wash Engineered") are
 *   corridor names, not LOC numbers — so we DO NOT auto-link to plans.
 *   We preserve the raw text in `importedPlanText` and let MOT use the
 *   Library → "Link" button to reconcile at their own pace.
 * - Money column has "$751.52" / "$751.52 " (trailing space) /
 *   "$1,234.00" → strip non-digits, parse float.
 * - Dates column: "12/9/23-12/23/23" / "4/27/2026-5/1/2026" / "1/15/24"
 *   → parse to ISO YYYY-MM-DD.
 *
 * Idempotent: re-running matches by (logNumber + paidAt month-key) and
 * skips rows already imported. Each imported request gets
 * `importedFrom: 'TANSAT Tracking Log xlsx'`.
 */

import * as XLSX from 'xlsx';
import { collection, doc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import type { TansatActivity, TansatRequest } from '../types';
import { writeGlobalLog } from './logService';

// ── Activity vocab map ──────────────────────────────────────────────────────
// All known typos and aliases from Justin's xlsx. Anything not in this map
// falls through to 'other' with the raw string preserved in activityOther.
const ACTIVITY_MAP: Record<string, TansatActivity> = {
  'potholing':                       'potholing',
  'paving':                          'paving',
  'paving ':                         'paving',
  'paving/restoration':              'paving_restoration',
  'paving / restoration':            'paving_restoration',
  'restoration':                     'restoration',
  'asbestos pipe':                   'asbestos_pipe',
  'potholing/paving':                'paving',
  'conduit work':                    'conduit_work',
  'conduit work ':                   'conduit_work',
  'plummer conduit work':            'conduit_work',
  'sawcutting':                      'sawcutting',
  'krail implementation':            'krail_implementation',
  'krail delivery':                  'krail_delivery',
  'temp street light installation':  'temp_street_light',
  'vault/conduit':                   'vault_conduit',
  'vault / conduit':                 'vault_conduit',
  'pile installation':               'pile_installation',
  'demo':                            'demo',
  'building demo':                   'building_demo',
  'implementation':                  'implementation',
  'utility support':                 'utility_support',
  'ultility support':                'utility_support',
  'utiltiy support / att':           'utility_support',
  'utility support / att':           'utility_support',
  'median removal':                  'median_removal',
  'inside out':                      'inside_out',
  'stage 2':                         'implementation',
  'tree planting':                   'tree_planting',
  'tree removal':                    'tree_removal',
};

function normalizeActivity(raw: string): { activity: TansatActivity; activityOther?: string } {
  const key = raw.trim().toLowerCase();
  const mapped = ACTIVITY_MAP[key];
  if (mapped) return { activity: mapped };
  return { activity: 'other', activityOther: raw.trim() };
}

// ── Phase notation parser ────────────────────────────────────────────────────
// Handles "1" / "2" / "3,4,5" / "1-9" / "1, 10" / "1 & 2" / "1,2 & 3" /
// "(1-4)" / "(5-8)" / "All" / "24" (single multi-digit phase number).
// Returns sorted unique phase numbers; empty array if "All" or unparseable.
export function parsePhaseNotation(raw: string | null | undefined): number[] {
  if (!raw) return [];
  const s = String(raw).trim();
  if (!s) return [];
  if (/^all$/i.test(s)) return [];                           // "All" → empty (means every phase)
  // Strip parens, replace " & " and "and" with ","
  const cleaned = s.replace(/[()]/g, '').replace(/\s*&\s*|\s+and\s+/gi, ',');
  const out = new Set<number>();
  for (const part of cleaned.split(',')) {
    const tok = part.trim();
    if (!tok) continue;
    // Range: "3-5"
    const range = tok.match(/^(\d+)\s*-\s*(\d+)$/);
    if (range) {
      const a = parseInt(range[1], 10);
      const b = parseInt(range[2], 10);
      const lo = Math.min(a, b), hi = Math.max(a, b);
      for (let n = lo; n <= hi; n++) out.add(n);
      continue;
    }
    // Single number
    const num = parseInt(tok, 10);
    if (!isNaN(num)) out.add(num);
  }
  return Array.from(out).sort((a, b) => a - b);
}

// ── Date range parser ────────────────────────────────────────────────────────
// Handles "12/9/23-12/23/23" / "4/27/2026-5/1/2026" / "1/15/24" (single date).
// Returns ISO YYYY-MM-DD start + end. Bare 2-digit years assumed 2000+ and
// disambiguated: <50 → 2000s, ≥50 → 1900s (irrelevant here — log starts 2023).
export function parseDateRange(raw: string | null | undefined): { startDate: string; endDate: string } {
  if (!raw) return { startDate: '', endDate: '' };
  const s = String(raw).trim();
  // Split on unambiguous separators: en-dash, em-dash, hyphen surrounded by digits/spaces
  // (avoid splitting on hyphens that are inside the date itself).
  const parts = s.split(/\s*[-–—]\s*/);
  // If the dash split gave us 2 chunks where each looks like a date → range
  if (parts.length === 2 && /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(parts[0]) && /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(parts[1])) {
    return { startDate: toIso(parts[0]), endDate: toIso(parts[1]) };
  }
  // Single date — use it for both start + end
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(s)) {
    const iso = toIso(s);
    return { startDate: iso, endDate: iso };
  }
  return { startDate: '', endDate: '' };
}

function toIso(mdy: string): string {
  const [m, d, y] = mdy.split('/').map(s => s.trim());
  if (!m || !d || !y) return '';
  let yr = parseInt(y, 10);
  if (yr < 100) yr = yr < 50 ? 2000 + yr : 1900 + yr;
  return `${yr}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

// ── Money parser ─────────────────────────────────────────────────────────────
function parseMoney(raw: string | number | null | undefined): number | undefined {
  if (raw == null || raw === '') return undefined;
  if (typeof raw === 'number') return raw;
  const cleaned = String(raw).replace(/[$,\s]/g, '');
  const n = parseFloat(cleaned);
  return isNaN(n) ? undefined : n;
}

// ── Row parser ───────────────────────────────────────────────────────────────
export interface ParsedRow {
  rowIndex: number;                     // 1-indexed within the sheet (after header)
  sheet: string;
  logNumber?: string;
  importedPlanText: string;
  activity: TansatActivity;
  activityOther?: string;
  phaseNumbers: number[];
  phaseNotation?: string;               // raw phase string, preserved when "All" or unparseable
  startDate: string;
  endDate: string;
  paidAmount?: number;
  notes?: string;
  // Computed flags
  warnings: string[];                   // human-readable problems with this row
}

/**
 * Parse a single Excel row into a ParsedRow. Sheet name is folded in as a
 * fallback activity hint when the Activity column is blank.
 */
export function parseRow(
  row: Record<string, unknown>,
  sheet: string,
  rowIndex: number,
): ParsedRow | null {
  // Header detection: skip the literal "Log #" row from the xlsx
  const logRaw = (row['Log #'] ?? row['Log#'] ?? row['LogNumber'] ?? '').toString().trim();
  if (!logRaw || logRaw.toLowerCase() === 'log #' || logRaw.toLowerCase() === 'log#') {
    return null;
  }

  const planText = (row['Trafic Plan/Location'] ?? row['Traffic Plan/Location']
    ?? row['Plan/Location'] ?? row['Plan'] ?? '').toString().trim();
  const activityRaw = (row['Activity'] ?? sheet ?? '').toString();
  const phasesRaw = (row['Phases'] ?? row['Phase'] ?? '').toString();
  const datesRaw = (row['Dates'] ?? row['Date'] ?? row['Date Range'] ?? '').toString();
  const moneyRaw = row['Money'] ?? row['Amount'] ?? row['Paid'] ?? '';
  const notesRaw = (row['Notes'] ?? row['Note'] ?? '').toString().trim();

  const { activity, activityOther } = normalizeActivity(activityRaw);
  const phaseNumbers = parsePhaseNotation(phasesRaw);
  const { startDate, endDate } = parseDateRange(datesRaw);
  const paidAmount = parseMoney(moneyRaw as string | number);

  const warnings: string[] = [];
  if (!startDate) warnings.push(`Could not parse dates: "${datesRaw}"`);
  if (activity === 'other') warnings.push(`Unknown activity: "${activityRaw}" — saved as "Other"`);
  if (!planText) warnings.push('No plan/location text');
  if (paidAmount == null && moneyRaw) warnings.push(`Could not parse amount: "${moneyRaw}"`);

  // Phase notation preserved if not parsed cleanly (so MOT can review)
  const cleanedNotation = phasesRaw.trim();
  const isAll = /^all$/i.test(cleanedNotation);
  const phaseNotation = (isAll || (cleanedNotation && phaseNumbers.length === 0))
    ? cleanedNotation : undefined;

  return {
    rowIndex,
    sheet,
    logNumber: logRaw,
    importedPlanText: planText,
    activity,
    activityOther,
    phaseNumbers,
    phaseNotation,
    startDate,
    endDate,
    paidAmount,
    notes: notesRaw || undefined,
    warnings,
  };
}

// ── Workbook → ParsedRow[] ───────────────────────────────────────────────────

export function parseWorkbook(file: File): Promise<ParsedRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        const out: ParsedRow[] = [];
        for (const sheetName of wb.SheetNames) {
          const ws = wb.Sheets[sheetName];
          // Justin's log has a "TANSAT Tracking" header row before the actual
          // column headers, so use header: 1 then find the header row.
          const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: false }) as unknown[][];
          // Find the row that contains "Log #" — that's the real header
          let headerIdx = -1;
          for (let i = 0; i < Math.min(matrix.length, 10); i++) {
            const r = matrix[i];
            if (r && r.some(c => String(c).trim().toLowerCase() === 'log #')) {
              headerIdx = i;
              break;
            }
          }
          if (headerIdx < 0) continue;
          const headers = matrix[headerIdx].map(c => String(c ?? '').trim());
          for (let i = headerIdx + 1; i < matrix.length; i++) {
            const r = matrix[i];
            if (!r || !r[0]) continue; // skip blank rows
            const obj: Record<string, unknown> = {};
            headers.forEach((h, j) => { obj[h] = r[j]; });
            const parsed = parseRow(obj, sheetName, i - headerIdx);
            if (parsed) out.push(parsed);
          }
        }
        resolve(out);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

// ── Idempotent batch write ──────────────────────────────────────────────────

export interface ImportResult {
  total: number;
  imported: number;
  skipped: number;
  failures: Array<{ row: ParsedRow; error: string }>;
}

/**
 * Write parsed rows to Firestore. Skips rows whose logNumber already exists
 * in the collection (fetched once up-front). Each imported request:
 * - status: 'closed' (these are historical, paid)
 * - importedFrom: 'TANSAT Tracking Log xlsx'
 * - paidAt: end date of the date range (best-guess)
 * - phaseNotation preserved when "All" or non-parseable
 */
export async function writeParsedRows(
  rows: ParsedRow[],
  existingLogNumbers: Set<string>,
  uploadedBy: string,
): Promise<ImportResult> {
  const result: ImportResult = { total: rows.length, imported: 0, skipped: 0, failures: [] };
  const now = new Date().toISOString();
  const importBatchId = `xlsx_${Date.now().toString(36)}`;

  // Firestore batch limit = 500 writes; chunk to be safe at 400.
  const CHUNK = 400;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const batch = writeBatch(db);
    let chunkWrites = 0;
    const chunkSkipped: ParsedRow[] = [];
    for (const row of chunk) {
      // Skip duplicates by logNumber
      if (row.logNumber && existingLogNumbers.has(row.logNumber)) {
        chunkSkipped.push(row);
        continue;
      }
      const id = `tansat_imp_${row.logNumber || 'noLog'}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      const requestDoc: Partial<TansatRequest> & { id: string; phaseNotation?: string; importBatchId: string } = {
        id,
        // planId intentionally unset — MOT links via Library button
        importedPlanText: row.importedPlanText,
        phaseNumbers: row.phaseNumbers,
        ...(row.phaseNotation ? { phaseNotation: row.phaseNotation } : {}),
        activity: row.activity,
        ...(row.activityOther ? { activityOther: row.activityOther } : {}),
        workArea: { side: 'BOTH', street: '', fromLimit: '', toLimit: '' },
        schedule: {
          dayPattern: 'daily',
          startDate: row.startDate,
          startTime: '',
          endDate: row.endDate,
          endTime: '',
        },
        ...(row.logNumber ? { logNumber: row.logNumber } : {}),
        ...(row.paidAmount != null ? {
          invoiceAmount: row.paidAmount,
          paidAmount: row.paidAmount,
          paidAt: row.endDate || now.slice(0, 10),
        } : {}),
        status: 'closed',
        ...(row.notes ? { notes: row.notes } : {}),
        createdBy: `import:${uploadedBy}`,
        createdAt: now,
        updatedAt: now,
        importedFrom: 'TANSAT Tracking Log xlsx',
        importBatchId,
      };
      batch.set(doc(collection(db, 'tansatRequests'), id), requestDoc);
      chunkWrites++;
      if (row.logNumber) existingLogNumbers.add(row.logNumber);
    }
    if (chunkWrites > 0) {
      try {
        await batch.commit();
        result.imported += chunkWrites;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        for (const row of chunk) result.failures.push({ row, error: msg });
        continue;
      }
    }
    result.skipped += chunkSkipped.length;
  }

  // Audit log
  if (result.imported > 0) {
    writeGlobalLog(
      `Imported ${result.imported} TANSAT requests from xlsx (batch ${importBatchId})`,
      'tansat',
      'xlsx_import',
      importBatchId,
      'tansat_request',
    );
  }

  return result;
}

/** Fetch all existing logNumbers so the import can skip duplicates. */
export async function loadExistingLogNumbers(): Promise<Set<string>> {
  const { collection: col, getDocs } = await import('firebase/firestore');
  const snap = await getDocs(col(db, 'tansatRequests'));
  const set = new Set<string>();
  snap.forEach(d => {
    const ln = (d.data() as { logNumber?: string }).logNumber;
    if (ln) set.add(ln);
  });
  return set;
}
