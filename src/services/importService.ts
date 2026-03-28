import { doc, setDoc, deleteDoc, runTransaction, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import * as XLSX from 'xlsx';
import { IMPORT_TARGET_FIELDS, ALL_STAGES, LEADS } from '../constants';
import { Plan, LogEntry } from '../types';

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
  approved: boolean;
  issues: string[];
  // New fields
  isTBD: boolean;          // true = no LOC, will get TBD-xxx ID
  isRenewal: boolean;      // true = LOC looks like "366.1"
  parentLocId?: string;    // for renewals: "366" if LOC is "366.1"
  renewalSuffix?: string;  // ".1" if LOC is "366.1"
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

// Detect if LOC looks like a renewal (e.g. "366.1", "LOC-366.1")
function detectRenewal(loc: string): { isRenewal: boolean; parentLocId?: string; renewalSuffix?: string } {
  const match = loc.match(/^(.+)\.(\d+)$/);
  if (match) {
    return { isRenewal: true, parentLocId: match[1], renewalSuffix: `.${match[2]}` };
  }
  return { isRenewal: false };
}

function shouldFlagPendingDocs(stage: string): boolean {
  return ['plan_approved', 'approved', 'expired', 'closed'].includes(stage);
}

export const parseMasterFile = async (file: File) => {
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];

  const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][];
  if (rawRows.length === 0) throw new Error('Empty sheet');

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

    const isTBD = !loc;
    const renewal = loc ? detectRenewal(loc) : { isRenewal: false };

    const issues: string[] = [];
    if (!street1) issues.push('Missing Street 1');
    if (!lead || !LEADS.includes(lead)) issues.push('Lead not assigned or not recognised');
    // Note: missing LOC is no longer a blocking error — gets TBD ID

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
      approved: issues.length === 0, // TBD rows can be approved — they just get a temp ID
      issues,
      isTBD,
      isRenewal: renewal.isRenewal,
      parentLocId: renewal.parentLocId,
      renewalSuffix: renewal.renewalSuffix,
    };
  });
};

export const confirmImport = async (
  rows: ImportRow[],
  existingPlans: { id: string }[],
  td: string,
  getUserLabel: () => string
) => {
  // Include both rows with LOC and TBD rows (isTBD) — all approved rows
  const approvedRows = rows.filter(r => r.approved);
  const existingIds = new Set(existingPlans.map(p => p.id));
  const importBatchId = `import_${td}_${getUserLabel().replace(/\s+/g, '_')}`;

  let tbdCounter = 1;

  for (const row of approvedRows) {
    // Determine document ID: use LOC if present, otherwise generate TBD ID
    const docId = row.loc || `TBD-${Date.now()}-${tbdCounter++}`;
    const isUpdate = row.loc ? existingIds.has(row.loc) : false;

    const log: LogEntry[] = [
      {
        uniqueId: Date.now().toString(),
        date: td,
        action: isUpdate ? 'Updated via Master File Import' : row.isTBD ? 'Imported — LOC Pending Assignment' : 'Imported from Master File',
        user: getUserLabel(),
      },
    ];

    const statusHistory: any[] = [];
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

    const planData: any = {
      id: docId,
      loc: row.loc || '',  // empty string for TBD — shown as "Unassigned" in UI
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
      // New import tracking fields
      importStatus: 'needs_review',
      importBatchId,
      locStatus: row.isTBD ? 'unassigned' : 'assigned',
      // Renewal chain
      ...(row.isRenewal && row.parentLocId ? { parentLocId: row.parentLocId, revisionSuffix: row.renewalSuffix } : {}),
    };

    await setDoc(doc(db, 'plans', docId), planData, { merge: isUpdate });
  }

  // Bump the LOC counter to max(counter, highest imported LOC) so new requests
  // always get a number above everything that was imported.
  const importedNums = approvedRows
    .filter(r => r.loc && !r.isTBD)
    .map(r => parseInt(String(r.loc).replace('LOC-', '').split('.')[0], 10))
    .filter(n => !isNaN(n));
  const maxImported = importedNums.length > 0 ? Math.max(...importedNums) : 0;
  if (maxImported > 0) {
    const counterRef = doc(db, 'settings', 'locCounter');
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(counterRef);
      const current = snap.exists() ? (snap.data().count as number || 0) : 0;
      if (maxImported > current) {
        transaction.set(counterRef, { count: maxImported });
      }
    });
  }

  return {
    imported: approvedRows.length,
    skipped: rows.length - approvedRows.length,
    tbdCount: approvedRows.filter(r => r.isTBD).length,
    renewalCount: approvedRows.filter(r => r.isRenewal).length,
  };
};

// Assign a real LOC number to a TBD plan — auto-increments counter or uses provided LOC
export const assignLocToTBD = async (
  tbdPlan: Plan,
  customLoc: string | null,
  setSelectedPlan: (plan: Plan | null) => void,
  td: string,
  getUserLabel: () => string
): Promise<string> => {
  let locNumber: string;

  if (customLoc && customLoc.trim()) {
    locNumber = customLoc.trim();
  } else {
    locNumber = await runTransaction(db, async (transaction) => {
      const counterRef = doc(db, 'settings', 'locCounter');
      const counterSnap = await transaction.get(counterRef);
      const current = counterSnap.exists() ? (counterSnap.data().value || 0) : 0;
      const next = current + 1;
      transaction.set(counterRef, { value: next });
      return String(next);
    });
  }

  const logEntry: LogEntry = {
    uniqueId: Date.now().toString(),
    date: td,
    action: `LOC number assigned: ${locNumber}`,
    user: getUserLabel(),
  };

  const newPlanData: any = {
    ...tbdPlan,
    id: locNumber,
    loc: locNumber,
    locStatus: 'assigned',
    log: [...(tbdPlan.log || []), logEntry],
  };

  // Write new doc with proper LOC ID, delete the TBD doc
  await setDoc(doc(db, 'plans', locNumber), newPlanData);
  await deleteDoc(doc(db, 'plans', tbdPlan.id));

  setSelectedPlan(newPlanData as Plan);
  return locNumber;
};
