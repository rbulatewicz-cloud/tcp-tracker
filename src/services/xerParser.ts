/**
 * Lightweight XER parser — extracts only the "phonebook" data we need
 * to power the P6 activity picker on TCP request forms.
 *
 * We deliberately ignore dates, status, codes, predecessors, etc. The app is
 * NOT a schedule mirror — P6 owns the schedule. We only need:
 *   • activity_id (human code like "A1245")
 *   • activity name
 *   • full WBS path for context in the picker
 *
 * XER is tab-delimited with section markers:
 *   %T <TABLE_NAME>
 *   %F <field1>\t<field2>\t...
 *   %R <value1>\t<value2>\t...
 *   %E   (end of file marker; ignored)
 */

export interface P6Activity {
  id: string;          // activity_code from XER, e.g. "A1245"
  name: string;        // task_name
  wbsPath: string;     // "Phase 2 > Segment B > B2 > Stage 2"
}

export interface XerParseResult {
  projectName: string;
  activities: P6Activity[];
}

interface WbsNode {
  wbsId: string;
  parentId: string | null;
  name: string;
}

const SEP = '\t';

/**
 * Parse the raw text content of an .xer file. Synchronous and pure.
 * Throws if the file is missing required tables (PROJECT, PROJWBS, TASK).
 */
export function parseXer(text: string): XerParseResult {
  const lines = text.split(/\r?\n/);

  let projectName = '';
  const wbsById = new Map<string, WbsNode>();
  const activities: P6Activity[] = [];

  // Section state — which table we're inside, plus the field order for that table.
  let currentTable: string | null = null;
  let fieldOrder: string[] = [];
  const idx = (field: string) => fieldOrder.indexOf(field);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const tag = line.slice(0, 2);

    if (tag === '%T') {
      currentTable = line.slice(3).trim();
      fieldOrder = [];
      continue;
    }
    if (tag === '%F') {
      fieldOrder = line.slice(3).split(SEP).map(s => s.trim());
      continue;
    }
    if (tag !== '%R' || !currentTable) continue;

    const cols = line.slice(3).split(SEP);

    if (currentTable === 'PROJECT') {
      // Take the first project row's name (most exports have only one).
      if (!projectName) {
        const nameIdx = idx('proj_short_name');
        if (nameIdx >= 0) projectName = (cols[nameIdx] || '').trim();
      }
      continue;
    }

    if (currentTable === 'PROJWBS') {
      const wbsId = (cols[idx('wbs_id')] || '').trim();
      const parentId = (cols[idx('parent_wbs_id')] || '').trim() || null;
      const name = (cols[idx('wbs_name')] || '').trim();
      if (wbsId) wbsById.set(wbsId, { wbsId, parentId, name });
      continue;
    }

    if (currentTable === 'TASK') {
      const id = (cols[idx('task_code')] || '').trim();
      const name = (cols[idx('task_name')] || '').trim();
      const wbsId = (cols[idx('wbs_id')] || '').trim();
      if (!id) continue;
      activities.push({ id, name, wbsPath: '' /* filled in below */, _wbsId: wbsId } as P6Activity & { _wbsId: string });
      continue;
    }
  }

  if (!wbsById.size) throw new Error('XER file is missing PROJWBS section');
  if (!activities.length) throw new Error('XER file is missing TASK section (no activities found)');

  // Resolve WBS paths once, cached by wbsId.
  const pathCache = new Map<string, string>();
  const resolvePath = (wbsId: string): string => {
    if (pathCache.has(wbsId)) return pathCache.get(wbsId)!;
    const parts: string[] = [];
    let cur: string | null = wbsId;
    const seen = new Set<string>();
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      const node = wbsById.get(cur);
      if (!node) break;
      parts.unshift(node.name);
      cur = node.parentId;
    }
    const path = parts.join(' > ');
    pathCache.set(wbsId, path);
    return path;
  };

  for (const a of activities as Array<P6Activity & { _wbsId?: string }>) {
    a.wbsPath = a._wbsId ? resolvePath(a._wbsId) : '';
    delete a._wbsId;
  }

  return { projectName, activities };
}

/**
 * Build searchable lowercased tokens from id, name, and WBS path so the
 * picker can do cheap client-side substring matching without a search index.
 */
export function buildSearchTokens(a: P6Activity): string[] {
  const blob = `${a.id} ${a.name} ${a.wbsPath}`.toLowerCase();
  // Split on anything that isn't alphanumeric, drop empties, dedupe.
  const tokens = blob.split(/[^a-z0-9]+/).filter(Boolean);
  return Array.from(new Set(tokens));
}
