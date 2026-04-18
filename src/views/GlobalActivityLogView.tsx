import { GlobalLogEntry } from '../services/logService';

interface GlobalActivityLogViewProps {
  canViewLogs: boolean;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  logCols: any[];
  plans: any[];
  globalLogs: GlobalLogEntry[];
  setSelectedPlan: (plan: any) => void;
  setView: (view: string) => void;
  monoFont: string;
}

const ACTION_STYLES: Record<string, { color: string; bg: string; label: string }> = {
  STATUS:  { color: 'text-blue-600',    bg: 'bg-blue-50',    label: 'STATUS'  },
  UPLOAD:  { color: 'text-emerald-600', bg: 'bg-emerald-50', label: 'UPLOAD'  },
  DELETE:  { color: 'text-red-500',     bg: 'bg-red-50',     label: 'DELETE'  },
  CREATE:  { color: 'text-violet-600',  bg: 'bg-violet-50',  label: 'CREATE'  },
  SYSTEM:  { color: 'text-slate-500',   bg: 'bg-slate-100',  label: 'SYSTEM'  },
  NOTE:    { color: 'text-amber-600',   bg: 'bg-amber-50',   label: 'NOTE'    },
  CR_HUB:  { color: 'text-purple-600',  bg: 'bg-purple-50',  label: 'CR HUB'  },
  LIBRARY: { color: 'text-teal-600',    bg: 'bg-teal-50',    label: 'LIBRARY' },
  INFO:    { color: 'text-slate-400',   bg: 'bg-slate-50',   label: 'INFO'    },
};

function getActionType(action: string, source?: string): string {
  if (source === 'plan')    return 'DELETE';  // source==='plan' is only used for delete audit entries
  if (source === 'cr_hub')  return 'CR_HUB';
  if (source === 'library') return 'LIBRARY';
  if (action.includes('Status changed')) return 'STATUS';
  if (action.includes('Uploaded'))       return 'UPLOAD';
  if (action.includes('Deleted'))        return 'DELETE';
  if (action.includes('New request'))    return 'CREATE';
  if (action.includes('wiped') || action.includes('cleared')) return 'SYSTEM';
  if (action.includes('Note added'))     return 'NOTE';
  return 'INFO';
}

const FILTER_TABS = ['ALL', 'STATUS', 'UPLOAD', 'DELETE', 'CR HUB', 'LIBRARY', 'NOTE'] as const;

// Normalise any date to YYYY-MM-DD for consistent sorting
function toSortKey(entry: any): string {
  return entry.createdAt || entry.date || '';
}

export function GlobalActivityLogView({
  canViewLogs,
  searchQuery,
  setSearchQuery,
  logCols,
  plans,
  globalLogs,
  setSelectedPlan,
  setView,
  monoFont,
}: GlobalActivityLogViewProps) {
  if (!canViewLogs) return null;

  // ── Build merged entry list ──────────────────────────────────────────────────
  const planEntries = plans.flatMap(p =>
    (p.log || []).map((l: any) => ({ ...l, planId: p.id, loc: p.loc, _source: 'plan' }))
  );

  const crossEntries = globalLogs.map(g => ({
    action:   g.action,
    date:     g.date,
    createdAt: g.createdAt,
    user:     g.user,
    loc:      g.planLoc || g.reference,
    source:   g.source,
    referenceId: g.referenceId,
    referenceType: g.referenceType,
    reference: g.reference,
    _source:  'global',
    planId:   null,
  }));

  const allEntries = [...planEntries, ...crossEntries];

  // ── Filter ───────────────────────────────────────────────────────────────────
  const seenGlobalWipes = new Set<string>();

  const filtered = allEntries.filter(l => {
    if (l.action?.includes('Status → Implemented')) return false;

    const type = getActionType(l.action || '', l.source);

    if (searchQuery) {
      const q = searchQuery.toUpperCase();
      // Match filter tabs
      if (['STATUS', 'UPLOAD', 'DELETE', 'NOTE', 'CREATE', 'SYSTEM', 'CR HUB', 'LIBRARY'].includes(q)) {
        if (type !== q.replace(' ', '_')) return false;
      } else {
        const lq = searchQuery.toLowerCase();
        const match =
          l.action?.toLowerCase().includes(lq) ||
          l.user?.toLowerCase().includes(lq) ||
          String(l.loc || '').toLowerCase().includes(lq) ||
          l.date?.toLowerCase().includes(lq) ||
          l.reference?.toLowerCase().includes(lq);
        if (!match) return false;
      }
    }

    if (l.action === 'Global log wiped' || l.action === 'Global log cleared by Admin') {
      const key = `${l.date}-${l.user}`;
      if (seenGlobalWipes.has(key)) return false;
      seenGlobalWipes.add(key);
      l.loc = 'ALL';
    }

    return true;
  });

  const sorted = [...filtered].sort((a, b) => toSortKey(b).localeCompare(toSortKey(a)));

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">

      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-slate-500 dark:text-slate-400">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/>
              <polyline points="13 2 13 9 20 9"/>
              <line x1="9" y1="14" x2="15" y2="14"/>
              <line x1="9" y1="18" x2="15" y2="18"/>
              <line x1="9" y1="10" x2="11" y2="10"/>
            </svg>
          </div>
          <div>
            <div className="text-sm font-bold text-slate-900 dark:text-slate-100">Global Activity Log</div>
            <div className="text-[11px] text-slate-400 dark:text-slate-500">Plans · CR Hub · Library — all actions in one place</div>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex bg-slate-100 dark:bg-slate-700 p-1 rounded-lg gap-1">
          {FILTER_TABS.map(f => {
            const active = f === 'ALL' ? !searchQuery : searchQuery.toUpperCase() === f;
            return (
              <button
                key={f}
                onClick={() => setSearchQuery(f === 'ALL' ? '' : f)}
                className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-colors ${
                  active
                    ? 'bg-white dark:bg-slate-600 text-slate-900 dark:text-slate-100 shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
              >
                {f}
              </button>
            );
          })}
        </div>
      </div>

      {/* Table */}
      <div className="max-h-[70vh] overflow-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-700/50 border-b border-slate-200 dark:border-slate-700">
              {logCols.map(col => (
                <th
                  key={col.id}
                  className={`px-5 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide ${
                    col.id === 'operator' ? 'text-right' : 'text-left'
                  } ${
                    col.id === 'timestamp' ? 'w-36' :
                    col.id === 'reference' ? 'w-28' :
                    col.id === 'operator'  ? 'w-44' : ''
                  }`}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((entry, i) => {
              const type  = getActionType(entry.action || '', entry.source);
              const style = ACTION_STYLES[type] ?? ACTION_STYLES.INFO;
              const plan  = entry.planId ? plans.find(p => p.id === entry.planId) : null;
              const [datePart, timePart] = (entry.date || '').split(',');
              const isGlobal = entry._source === 'global';

              return (
                <tr
                  key={i}
                  className={`border-b border-slate-50 dark:border-slate-700/50 ${
                    i % 2 === 0 ? 'bg-white dark:bg-slate-800' : 'bg-slate-50/50 dark:bg-slate-800/50'
                  } hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors`}
                >
                  {logCols.map(col => {
                    switch (col.id) {

                      case 'timestamp':
                        return (
                          <td key={col.id} className="px-5 py-3">
                            <div className="flex flex-col">
                              <span className="text-[11px] text-slate-500 dark:text-slate-400" style={{ fontFamily: monoFont }}>{datePart}</span>
                              {timePart && <span className="text-[9px] text-slate-400 dark:text-slate-500" style={{ fontFamily: monoFont }}>{timePart.trim()}</span>}
                            </div>
                          </td>
                        );

                      case 'reference':
                        return (
                          <td key={col.id} className="px-5 py-3">
                            {entry.loc === 'ALL' ? (
                              <span className="text-[11px] font-extrabold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded" style={{ fontFamily: monoFont }}>
                                ALL
                              </span>
                            ) : isGlobal ? (
                              <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-[80px] block" style={{ fontFamily: monoFont }} title={entry.reference}>
                                {entry.reference?.length > 12 ? entry.reference.slice(0, 12) + '…' : entry.reference}
                              </span>
                            ) : (
                              <button
                                onClick={() => { if (plan) { setSelectedPlan(plan); setView('table'); } }}
                                className="text-[12px] font-bold text-amber-600 hover:text-amber-800 dark:text-amber-400 dark:hover:text-amber-300 underline bg-transparent border-none p-0 cursor-pointer"
                                style={{ fontFamily: monoFont }}
                              >
                                #{entry.loc || 'TBD'}
                              </button>
                            )}
                          </td>
                        );

                      case 'activity':
                        return (
                          <td key={col.id} className="px-5 py-3">
                            <div className="flex items-center gap-2">
                              <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded tracking-wide ${style.color} ${style.bg} dark:bg-opacity-20`}>
                                {style.label}
                              </span>
                              <span className="text-[13px] text-slate-700 dark:text-slate-200 font-medium">
                                {entry.action}
                              </span>
                            </div>
                          </td>
                        );

                      case 'operator':
                        return (
                          <td key={col.id} className="px-5 py-3 text-right">
                            <div className="flex flex-col items-end">
                              <span className="text-[12px] font-bold text-slate-600 dark:text-slate-300">{entry.user}</span>
                              <span className="text-[10px] text-slate-400 dark:text-slate-500">
                                {isGlobal
                                  ? (entry.source === 'cr_hub' ? 'CR Hub'
                                    : entry.source === 'plan'   ? 'Plan Delete'
                                    : 'Library')
                                  : 'System User'}
                              </span>
                            </div>
                          </td>
                        );

                      default: return null;
                    }
                  })}
                </tr>
              );
            })}

            {sorted.length === 0 && (
              <tr>
                <td colSpan={logCols.length} className="px-5 py-12 text-center text-sm text-slate-400 dark:text-slate-500">
                  No log entries match your filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
