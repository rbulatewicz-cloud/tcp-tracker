import React, { useState } from 'react';
import {
  parseWorkbook, ParsedRow, ImportResult,
  writeParsedRows, loadExistingLogNumbers,
} from '../../services/tansatImport';
import { ACTIVITY_LABELS, fmtMoney } from '../PlanCardSections/tansat/tansatShared';
import { showToast } from '../../lib/toast';

interface ImportLegacyXlsxModalProps {
  uploadedBy: string;
  onClose: () => void;
}

type Phase = 'pick' | 'preview' | 'importing' | 'done';

/**
 * T-6.2 — Admin tool: import Justin's "TANSAT Tracking Log" xlsx into the
 * tansatRequests collection. Three-phase UX:
 *
 *   1. Pick file
 *   2. Preview parsed rows (parse warnings inline, dupe count, totals)
 *   3. Confirm → batch write (idempotent — skips logs already in Firestore)
 *
 * Per the spec, rows do NOT auto-link to plans. importedPlanText is preserved
 * and the Library "Link" button reconciles later.
 */
export const ImportLegacyXlsxModal: React.FC<ImportLegacyXlsxModalProps> = ({ uploadedBy, onClose }) => {
  const [phase, setPhase] = useState<Phase>('pick');
  const [, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [existingLogs, setExistingLogs] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<ImportResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  const handleParse = async (f: File) => {
    setFile(f);
    setParseError(null);
    try {
      const [parsed, existing] = await Promise.all([
        parseWorkbook(f),
        loadExistingLogNumbers(),
      ]);
      setRows(parsed);
      setExistingLogs(existing);
      setPhase('preview');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setParseError(msg);
    }
  };

  const handleImport = async () => {
    setPhase('importing');
    try {
      const r = await writeParsedRows(rows, new Set(existingLogs), uploadedBy);
      setResult(r);
      setPhase('done');
      if (r.imported > 0) {
        showToast(`Imported ${r.imported} TANSAT requests`, 'success');
      } else {
        showToast(`Nothing to import — all ${r.skipped} rows already exist`, 'info');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast(`Import failed: ${msg.slice(0, 80)}`, 'error');
      setPhase('preview');
    }
  };

  // ── Header counts (preview phase) ───────────────────────────────────────
  const totalRows = rows.length;
  const dupeRows = rows.filter(r => r.logNumber && existingLogs.has(r.logNumber)).length;
  const newRows = totalRows - dupeRows;
  const warningCount = rows.filter(r => r.warnings.length > 0).length;
  const totalSpend = rows.reduce((s, r) => s + (r.paidAmount ?? 0), 0);

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/60 p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full my-8">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h3 className="text-lg font-bold">📥 Import Legacy TANSAT Log (xlsx)</h3>
            <p className="text-xs text-slate-500">
              One-time import of Justin's "TANSAT Tracking Log" spreadsheet. Rows preserve their original
              plan/location text — link to real plans later via the Library.
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-2xl leading-none">×</button>
        </div>

        {/* PHASE: pick file */}
        {phase === 'pick' && (
          <div className="p-6">
            <label className="cursor-pointer block rounded-lg border-2 border-dashed border-violet-300 bg-violet-50 p-10 text-center hover:bg-violet-100 transition-colors">
              <div className="text-4xl">📊</div>
              <div className="text-sm font-bold mt-2">Drop or click to upload xlsx</div>
              <div className="text-xs text-slate-500 mt-1">Excel format — supports the existing "TANSAT Tracking Log" column shape</div>
              <input
                type="file"
                accept=".xlsx,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                hidden
                onChange={e => e.target.files?.[0] && handleParse(e.target.files[0])}
              />
            </label>
            {parseError && (
              <div className="mt-3 rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-800">
                ⚠ Parse failed: {parseError}
              </div>
            )}
            <div className="mt-4 text-[11px] text-slate-500 space-y-1">
              <div><b>Expected columns:</b> Log #, Trafic Plan/Location, Activity, Phases, Dates, Money, Notes</div>
              <div><b>Idempotent:</b> rows with existing Log #s in Firestore are skipped automatically.</div>
            </div>
          </div>
        )}

        {/* PHASE: preview */}
        {phase === 'preview' && (
          <div className="p-6 space-y-4">
            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat label="Total rows" value={String(totalRows)} accent="gray" />
              <Stat label="New" value={String(newRows)} accent="emerald" />
              <Stat label="Already imported" value={String(dupeRows)} accent="blue" />
              <Stat label="With warnings" value={String(warningCount)} accent={warningCount > 0 ? 'amber' : 'gray'} />
            </div>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs">
              <b className="text-emerald-800">Total spend in import:</b>{' '}
              <span className="font-mono text-emerald-700 font-bold">{fmtMoney(totalSpend)}</span>
            </div>

            {/* Sample preview */}
            <div className="border border-slate-200 rounded-lg overflow-hidden max-h-96 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 sticky top-0">
                  <tr className="text-[9px] uppercase tracking-wider text-slate-500">
                    <th className="text-left px-2 py-1.5 font-bold">Log #</th>
                    <th className="text-left px-2 py-1.5 font-bold">Plan/Location</th>
                    <th className="text-left px-2 py-1.5 font-bold">Activity</th>
                    <th className="text-left px-2 py-1.5 font-bold">Phases</th>
                    <th className="text-left px-2 py-1.5 font-bold">Dates</th>
                    <th className="text-right px-2 py-1.5 font-bold">$</th>
                    <th className="text-left px-2 py-1.5 font-bold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 200).map(r => {
                    const isDupe = !!r.logNumber && existingLogs.has(r.logNumber);
                    const hasWarnings = r.warnings.length > 0;
                    return (
                      <tr
                        key={r.rowIndex + '-' + r.sheet + '-' + r.logNumber}
                        className={`border-t border-slate-100 ${isDupe ? 'bg-blue-50/40' : hasWarnings ? 'bg-amber-50/40' : ''}`}
                        title={r.warnings.length > 0 ? r.warnings.join('\n') : ''}
                      >
                        <td className="px-2 py-1.5 font-mono font-bold">{r.logNumber || '—'}</td>
                        <td className="px-2 py-1.5 truncate max-w-[200px]" title={r.importedPlanText}>
                          {r.importedPlanText}
                        </td>
                        <td className="px-2 py-1.5">
                          {r.activity === 'other' ? (
                            <span className="text-amber-700">{r.activityOther} <span className="text-[9px]">(other)</span></span>
                          ) : ACTIVITY_LABELS[r.activity]}
                        </td>
                        <td className="px-2 py-1.5 font-mono text-[10px]">
                          {r.phaseNumbers.length > 0
                            ? r.phaseNumbers.map(n => `P${n}`).join(',')
                            : <span className="text-slate-400 italic">{r.phaseNotation || '—'}</span>}
                        </td>
                        <td className="px-2 py-1.5 font-mono text-[10px] whitespace-nowrap">
                          {r.startDate ? `${r.startDate} → ${r.endDate}` : <span className="text-red-600">unparsed</span>}
                        </td>
                        <td className="px-2 py-1.5 text-right font-mono">
                          {r.paidAmount != null ? fmtMoney(r.paidAmount) : '—'}
                        </td>
                        <td className="px-2 py-1.5">
                          {isDupe ? (
                            <span className="text-[9px] font-bold text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded">Skip · dupe</span>
                          ) : hasWarnings ? (
                            <span className="text-[9px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">⚠ {r.warnings.length}</span>
                          ) : (
                            <span className="text-[9px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">✓ ready</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {rows.length > 200 && (
                <div className="bg-slate-50 px-3 py-2 text-[10px] text-slate-500 text-center italic">
                  Showing first 200 of {rows.length} rows. All rows import on confirm.
                </div>
              )}
            </div>
          </div>
        )}

        {/* PHASE: importing */}
        {phase === 'importing' && (
          <div className="p-12 text-center">
            <div className="text-4xl">⏳</div>
            <div className="text-sm font-bold mt-3">Importing {newRows} rows…</div>
            <div className="text-xs text-slate-500 mt-1">Batched in chunks of 400 — should be quick.</div>
          </div>
        )}

        {/* PHASE: done */}
        {phase === 'done' && result && (
          <div className="p-6">
            <div className="rounded-lg border-2 border-emerald-200 bg-emerald-50 p-5 text-center">
              <div className="text-4xl">✓</div>
              <div className="text-lg font-bold mt-2 text-emerald-900">Import complete</div>
              <div className="grid grid-cols-3 gap-3 mt-4 text-sm">
                <div>
                  <div className="text-2xl font-extrabold text-emerald-700">{result.imported}</div>
                  <div className="text-[10px] uppercase tracking-wider text-emerald-800">Imported</div>
                </div>
                <div>
                  <div className="text-2xl font-extrabold text-blue-700">{result.skipped}</div>
                  <div className="text-[10px] uppercase tracking-wider text-blue-800">Skipped (dupes)</div>
                </div>
                <div>
                  <div className="text-2xl font-extrabold text-red-700">{result.failures.length}</div>
                  <div className="text-[10px] uppercase tracking-wider text-red-800">Failed</div>
                </div>
              </div>
            </div>
            <p className="text-xs text-slate-500 mt-3">
              Visit <b>Library → TANSAT Log</b> to browse the imported records. Use the per-row 🔗 Link button
              to map each unlinked row to its real plan when you have time — the import does NOT auto-link
              because Justin's log uses corridor names instead of LOC numbers.
            </p>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-xl">
          {phase === 'preview' && (
            <>
              <button
                onClick={() => { setPhase('pick'); setFile(null); setRows([]); setParseError(null); }}
                className="text-xs font-bold px-4 py-2 rounded border border-slate-300 bg-white hover:bg-slate-50"
              >
                ← Pick another file
              </button>
              <button
                onClick={handleImport}
                disabled={newRows === 0}
                className="text-xs font-bold px-4 py-2 rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {newRows > 0 ? `Import ${newRows} new row${newRows === 1 ? '' : 's'} →` : 'Nothing to import'}
              </button>
            </>
          )}
          {(phase === 'pick' || phase === 'done') && (
            <button
              onClick={onClose}
              className="text-xs font-bold px-4 py-2 rounded bg-slate-900 text-white hover:bg-slate-700"
            >
              {phase === 'done' ? 'Close' : 'Cancel'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

const Stat: React.FC<{ label: string; value: string; accent: 'emerald' | 'blue' | 'amber' | 'gray' }> = ({ label, value, accent }) => {
  const palette = {
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    blue:    'border-blue-200 bg-blue-50 text-blue-700',
    amber:   'border-amber-200 bg-amber-50 text-amber-700',
    gray:    'border-slate-200 bg-white text-slate-700',
  }[accent];
  return (
    <div className={`rounded-lg border ${palette} px-3 py-2 text-center`}>
      <div className="text-2xl font-bold font-mono">{value}</div>
      <div className="text-[10px] uppercase tracking-wider mt-0.5">{label}</div>
    </div>
  );
};
