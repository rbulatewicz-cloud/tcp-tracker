import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import * as XLSX from 'xlsx';

export const parseMasterFile = async (
  file: File,
  STAGES: any[],
  IMPORT_TARGET_FIELDS: any[]
) => {
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  
  const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
  if (rawRows.length === 0) throw new Error("Empty sheet");
  
  // Find header row (first row with data)
  let headerRowIdx = 0;
  while (headerRowIdx < rawRows.length && (!rawRows[headerRowIdx] || rawRows[headerRowIdx].length === 0)) {
    headerRowIdx++;
  }
  
  const rawHeaders = rawRows[headerRowIdx] || [];
  const headers = rawHeaders.map((h, i) => h ? String(h).trim() : `Column ${String.fromCharCode(65 + i)}`);
  
  // Generate data objects using these headers
  const rows = XLSX.utils.sheet_to_json(sheet, { header: headers, range: headerRowIdx + 1 });

  // Auto-guess mapping
  const initialMapping: Record<string, string> = {};
  IMPORT_TARGET_FIELDS.forEach(f => {
    const match = headers.find(h => 
      h.toLowerCase().replace(/[^a-z0-9]/g, '') === f.label.toLowerCase().replace(/[^a-z0-9]/g, '') ||
      h.toLowerCase().includes(f.key.toLowerCase()) ||
      f.label.toLowerCase().includes(h.toLowerCase())
    );
    if (match) initialMapping[f.key] = match;
  });
  
  // Special case for Submitted Date (Column P / index 15)
  if (headers.length > 15 && !initialMapping['submitDate']) {
    initialMapping['submitDate'] = headers[15];
  }

  return { headers, rows, initialMapping };
};

export const processImportData = (
  mappingData: any[],
  columnMapping: any,
  plans: any[],
  STAGES: any[],
  td: string,
  getUserLabel: () => string
) => {
  const newPlans: any[] = [];
  const updatedPlans: any[] = [];
  const importedIds = new Set<string>();

  for (const row of mappingData) {
    const idVal = row[columnMapping['id']];
    const id = idVal ? String(idVal).substring(0, 99) : `TCP-${Math.floor(Math.random() * 10000)}`;
    importedIds.add(id);
    
    const existingPlan = plans.find(p => p.id === id);
    
    const parseDate = (val: any) => {
      if (!val) return "";
      if (typeof val === 'number') {
        const date = new Date(Math.round((val - 25569) * 86400 * 1000));
        return date.toISOString().split('T')[0];
      }
      const d = new Date(val);
      if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
      return String(val);
    };

    const submitDateVal = parseDate(row[columnMapping['submitDate']]);
    const approvedDateVal = parseDate(row[columnMapping['approvedDate']]);
    const needByDateVal = parseDate(row[columnMapping['needByDate']]);
    
    const rawStageVal = row[columnMapping['stage']];
    let finalStage = existingPlan?.stage || "requested";
    if (rawStageVal) {
      const rawStr = String(rawStageVal).trim().toLowerCase();
      const matched = STAGES.find(s => s.key.toLowerCase() === rawStr || s.label.toLowerCase() === rawStr);
      if (matched) {
        finalStage = matched.key;
      } else {
        finalStage = String(rawStageVal).substring(0, 49);
      }
    }

    const log = existingPlan?.log ? [...existingPlan.log] : [{ date: td, action: "Imported from Master File", user: getUserLabel() }];
    if (submitDateVal && !existingPlan?.submitDate) {
      log.push({ date: submitDateVal, action: "Submitted to DOT (Imported)", user: "System" });
    }
    if (approvedDateVal && !existingPlan?.approvedDate) {
      log.push({ date: approvedDateVal, action: "Approved (Imported)", user: "System" });
    }
    if (existingPlan && finalStage !== existingPlan.stage) {
      const sl = STAGES.find(s => s.key === finalStage)?.label || finalStage;
      log.push({ date: td, action: `Status → ${sl}`, user: "System" });
    }

    const planData = {
      id,
      type: String(row[columnMapping['type']] || existingPlan?.type || "Standard").substring(0, 49),
      scope: String(row[columnMapping['scope']] || existingPlan?.scope || "Water").substring(0, 49),
      stage: finalStage,
      loc: row[columnMapping['loc']] || existingPlan?.loc || "",
      segment: row[columnMapping['segment']] || existingPlan?.segment || "A1",
      street1: row[columnMapping['street1']] || existingPlan?.street1 || "",
      street2: row[columnMapping['street2']] || existingPlan?.street2 || "",
      lead: row[columnMapping['lead']] || existingPlan?.lead || "Justin",
      priority: row[columnMapping['priority']] || existingPlan?.priority || "Medium",
      needByDate: needByDateVal || existingPlan?.needByDate || "",
      notes: row[columnMapping['notes']] || existingPlan?.notes || "",
      submitDate: submitDateVal || existingPlan?.submitDate || "",
      approvedDate: approvedDateVal || existingPlan?.approvedDate || "",
      
      attachments: existingPlan?.attachments || [],
      approvedTCPs: existingPlan?.approvedTCPs || [],
      approvedLOCs: existingPlan?.approvedLOCs || [],
      outreach: {
        status: ['Not Started', 'In Progress', 'Complete'].includes(existingPlan?.outreach?.status) ? existingPlan.outreach.status : 'Not Started',
        ...(existingPlan?.outreach?.notes ? { notes: String(existingPlan.outreach.notes).substring(0, 4999) } : {}),
        ...(existingPlan?.outreach?.attachments ? { attachments: Array.isArray(existingPlan.outreach.attachments) ? existingPlan.outreach.attachments.slice(0, 100) : [] } : {}),
        ...(existingPlan?.outreach?.impacts ? { 
          impacts: {
            ...(typeof existingPlan.outreach.impacts.driveway === 'boolean' ? { driveway: existingPlan.outreach.impacts.driveway } : {}),
            ...(typeof existingPlan.outreach.impacts.busStop === 'boolean' ? { busStop: existingPlan.outreach.impacts.busStop } : {}),
            ...(typeof existingPlan.outreach.impacts.streetClosure === 'boolean' ? { streetClosure: existingPlan.outreach.impacts.streetClosure } : {})
          } 
        } : {})
      },
      log
    };

    if (existingPlan) {
      updatedPlans.push(planData);
    } else {
      newPlans.push(planData);
    }
  }

  const deletedPlans = plans.filter(p => !importedIds.has(p.id));

  return { newPlans, updatedPlans, deletedPlans };
};

export const confirmImport = async (
  reviewData: { newPlans: any[], updatedPlans: any[], deletedPlans: any[] },
  deleteMissingPlans: boolean
) => {
  // Add/Update plans
  for (const plan of [...reviewData.newPlans, ...reviewData.updatedPlans]) {
    await setDoc(doc(db, 'plans', plan.id), plan, { merge: true });
  }

  // Delete plans if requested
  if (deleteMissingPlans) {
    for (const plan of reviewData.deletedPlans) {
      await deleteDoc(doc(db, 'plans', plan.id));
    }
  }
};
