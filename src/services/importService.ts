import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import * as XLSX from 'xlsx';
import { IMPORT_TARGET_FIELDS, ALL_STAGES, LEADS } from '../constants';

export interface ImportRow {
  _rowIndex: number;
  _raw: Record<string, unknown>;
  // Resolved fields
  loc: string;
  type: string;
  street1: string;
  street2: string;
  lead: string;
  requestedBy: string;
  scope: string;
  segment: string;
  stage: string;
  priority: string;
  needByDate: string;
  dateRequested: string;
  submitDate: string;
  approvedDate: string;
  notes: string;
  // Admin-set overrides (Step 3)
  isHistorical: boolean;
  pendingDocuments: boolean;
  approved: boolean;         // admin approved this row for import
  issues: string[];          // validation issues
}

// Parse Excel date serial to ISO string
function parseDate(val: unknown): string {
  if (!val) return '';
  if (typeof val === 'number') {
    const d = new Date(Math.round((val - 25569) * 86400 * 1000));
    return d.toISOString().split('T')[0];
  }
  const d = new Date(String(val));
  if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  return String(val);
}

// Normalize plan type to known values
function normalizeType(val: string): string {
  const v = val.trim().toLowerCase();
  if (v === 'watch' || v === 'w') return 'WATCH';
  if (v === 'engineered' || v === 'eng' || v === 'e') return 'Engineered';
  return 'Standard';
}

// Normalize stage to ALL_STAGES key
function normalizeStage(val: string): string {
  const v = val.trim().toLowerCase();
  const match = ALL_STAGES.find(
    s => s.key.toLowerCase() === v || s.label.toLowerCase() === v
  );
  return match?.key ?? 'requested';
}

// Auto-determine pendingDocuments: any plan beyond "requested" that has no docs should be flagged
function shouldFlagPendingDocs(stage: string): boolean {
  return ['plan_approved', 'approved', 'expired', 'tcp_approved_final', 'closed'].includes(stage);
}

export const parseMasterFile = async (file: File) => {
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];

  const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][];
  if (rawRows.length === 0) throw new Error('Empty sheet');

  // Find header row
  let headerRowIdx = 0;
  while (headerRowIdx < rawRows.length && (!rawRows[headerRowIdx] || (rawRows[headerRowIdx] as unknown[]).length === 0)) {
    headerRowIdx++;
  }

  const rawHeaders = (rawRows[headerRowIdx] as unknown[]) || [];
  const headers = rawHeaders.map((h, i) =>
    h ? String(h).trim() : `Column ${String.fromCharCode(65 + i)}`
  );

  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: headers,
    range: headerRowIdx + 1,
  }) as Record<string, unknown>[];

  // Auto-guess column mapping
  const initialMapping: Record<string, string> = {};
  IMPORT_TARGET_FIELDS.forEach(f => {
    const match = headers.find(h =>
      h.toLowerCase().replace(/[^a-z0-9]/g, '') === f.label.toLowerCase().replace(/[^a-z0-9]/g, '') ||
      h.toLowerCase().includes(f.key.toLowerCase()) ||
      f.label.toLowerCase().includes(h.toLowerCase())
    );
    if (match) initialMapping[f.key] = match;
  });

  return { headers, rows, initialMapping };
};

// Validate and map raw rows using column mapping — returns ImportRow[] with issues flagged
export const buildImportRows = (
  rawRows: Record<string, unknown>[],
  columnMapping: Record<string, string>
): ImportRow[] => {
  return rawRows.map((row, idx) => {
    const get = (key: string) => {
      const col = columnMapping[key];
      return col ? String(row[col] ?? '') : '';
    };

    const loc = get('loc').trim();
    const type = get('type') ? normalizeType(get('type')) : 'Standard';
    const street1 = get('street1').trim();
    const lead = get('lead').trim();
    const rawStage = get('stage').trim();
    const stage = rawStage ? normalizeStage(rawStage) : 'requested';

    const issues: string[] = [];
    if (!loc) issues.push('Missing LOC #');
    if (!street1) issues.push('Missing Street 1');
    if (!lead || !LEADS.includes(lead)) issues.push('Lead not assigned or not recognised');

    const pendingDocuments = shouldFlagPendingDocs(stage);

    return {
      _rowIndex: idx,
      _raw: row,
      loc,
      type,
      street1,
      street2: get('street2').trim(),
      lead,
      requestedBy: get('requestedBy').trim(),
      scope: get('scope').trim() || 'Water',
      segment: get('segment').trim() || 'A1',
      stage,
      priority: get('priority').trim() || 'Medium',
      needByDate: parseDate(row[columnMapping['needByDate']]),
      dateRequested: parseDate(row[columnMapping['dateRequested']]),
      submitDate: parseDate(row[columnMapping['submitDate']]),
      approvedDate: parseDate(row[columnMapping['approvedDate']]),
      notes: get('notes'),
      isHistorical: false,
      pendingDocuments,
      approved: issues.length === 0,
      issues,
    };
  });
};

export const confirmImport = async (
  rows: ImportRow[],
  existingPlans: { id: string }[],
  td: string,
  getUserLabel: () => string
) => {
  const approvedRows = rows.filter(r => r.approved && r.loc);
  const existingIds = new Set(existingPlans.map(p => p.id));

  for (const row of approvedRows) {
    const isUpdate = existingIds.has(row.loc);
    const log = [
      {
        uniqueId: Date.now().toString(),
        date: td,
        action: isUpdate ? 'Updated via Master File Import' : 'Imported from Master File',
        user: getUserLabel(),
      },
    ];

    // Synthetic status history entries from imported dates
    const statusHistory = [];
    if (row.dateRequested) {
      statusHistory.push({ uniqueId: `import_req_${row._rowIndex}`, date: row.dateRequested, action: 'Status → Requested', newValue: 'requested', user: 'Import' });
    }
    if (row.submitDate) {
      statusHistory.push({ uniqueId: `import_sub_${row._rowIndex}`, date: row.submitDate, action: 'Status → Submitted to DOT', newValue: 'submitted_to_dot', user: 'Import' });
      log.push({ uniqueId: `log_sub_${row._rowIndex}`, date: row.submitDate, action: 'Submitted to DOT (Imported)', user: 'System' });
    }
    if (row.approvedDate) {
      statusHistory.push({ uniqueId: `import_app_${row._rowIndex}`, date: row.approvedDate, action: 'Status → Plan Approved', newValue: 'plan_approved', user: 'Import' });
      log.push({ uniqueId: `log_app_${row._rowIndex}`, date: row.approvedDate, action: 'Plan Approved (Imported)', user: 'System' });
    }

    const planData = {
      id: row.loc,
      loc: row.loc,
      rev: 0,
      type: row.type,
      scope: row.scope,
      segment: row.segment,
      street1: row.street1,
      street2: row.street2,
      lead: row.lead,
      requestedBy: row.requestedBy,
      priority: row.priority,
      needByDate: row.needByDate,
      dateRequested: row.dateRequested || td,
      requestDate: row.dateRequested || td,
      submitDate: row.submitDate || null,
      approvedDate: row.approvedDate || null,
      notes: row.notes,
      stage: row.stage,
      isHistorical: row.isHistorical,
      pendingDocuments: row.pendingDocuments,
      isCriticalPath: false,
      attachments: [],
      approvedTCPs: [],
      approvedLOCs: [],
      log,
      statusHistory,
      reviewCycles: [],
    };

    await setDoc(doc(db, 'plans', row.loc), planData, { merge: isUpdate });
  }

  return { imported: approvedRows.length, skipped: rows.length - approvedRows.length };
};
