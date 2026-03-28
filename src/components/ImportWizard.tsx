import React, { useRef } from 'react';
import { IMPORT_TARGET_FIELDS, LEADS, ALL_STAGES } from '../constants';
import { ImportRow } from '../services/importService';

interface ImportWizardProps {
  step: 1 | 2 | 3 | 4;
  setStep: (s: 1 | 2 | 3 | 4) => void;
  mappingHeaders: string[];
  mappingData: Record<string, unknown>[];
  columnMapping: Record<string, string>;
  setColumnMapping: (m: Record<string, string>) => void;
  importRows: ImportRow[];
  updateImportRow: (idx: number, updates: Partial<ImportRow>) => void;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onProceedToValidation: () => void;
  onProceedToReview: () => void;
  onConfirm: () => void;
  onCancel: () => void;
}

// ─── Step indicator ───────────────────────────────────────────────────────────
const STEPS = ['Upload', 'Map Columns', 'Review Rows', 'Confirm'];

const StepHeader: React.FC<{ current: number }> = ({ current }) => (
  <div className="flex items-center gap-0 mb-6">
    {STEPS.map((label, i) => {
      const n = i + 1;
      const done = n < current;
      const active = n === current;
      return (
        <React.Fragment key={n}>
          <div className="flex flex-col items-center gap-1">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all
              ${done ? 'bg-emerald-500 text-white' : active ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-400'}`}>
              {done ? '✓' : n}
            </div>
            <span className={`text-[9px] font-bold uppercase tracking-wider ${active ? 'text-slate-900' : 'text-slate-400'}`}>
              {label}
            </span>
          </div>
          {i < STEPS.length - 1 && (
            <div className={`flex-1 h-0.5 mb-4 mx-1 ${done ? 'bg-emerald-500' : 'bg-slate-200'}`} />
          )}
        </React.Fragment>
      );
    })}
  </div>
);

// ─── Instruction box ─────────────────────────────────────────────────────────
const Instructions: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 mb-4">
    <div className="text-[10px] font-bold text-blue-600 uppercase tracking-wider mb-1.5">ℹ {title}</div>
    <div className="text-[11px] text-blue-700 leading-relaxed">{children}</div>
  </div>
);

// ─── Main wizard ─────────────────────────────────────────────────────────────
export const ImportWizard: React.FC<ImportWizardProps> = ({
  step, setStep,
  mappingHeaders, mappingData, columnMapping, setColumnMapping,
  importRows, updateImportRow,
  onFileChange, onProceedToValidation, onProceedToReview, onConfirm, onCancel,
}) => {
  const fileRef = useRef<HTMLInputElement>(null);

  const requiredMapped = IMPORT_TARGET_FIELDS
    .filter(f => f.required)
    .every(f => !!columnMapping[f.key]);

  const flaggedRows = importRows.filter(r => r.issues.length > 0);
  const readyRows = importRows.filter(r => r.approved);
  const approvedCount = importRows.filter(r => r.approved).length;

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-[200] p-5">
      <div className="bg-white rounded-2xl w-full max-w-[660px] max-h-[92vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="px-6 pt-5 pb-0 flex-shrink-0">
          <div className="flex justify-between items-center mb-4">
            <div>
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Master File Import</div>
              <div className="text-lg font-bold text-slate-900">Import LOC Records from Excel</div>
            </div>
            <button onClick={onCancel} className="text-slate-400 hover:text-slate-600 text-lg font-bold">✕</button>
          </div>
          <StepHeader current={step} />
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 pb-4">

          {/* ── Step 1: Upload ── */}
          {step === 1 && (
            <div>
              <Instructions title="Step 1 of 4 — Upload Your Excel File">
                Upload your Master TCP/LOC tracking spreadsheet. We support <strong>.xlsx</strong> and <strong>.xls</strong> files.
                Your column headers can be in any order — we'll help you match them in the next step.
                Make sure your file has a header row as the first row of data.
              </Instructions>

              <div
                onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed border-slate-300 rounded-xl p-10 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-all"
              >
                <div className="text-3xl mb-2">📂</div>
                <div className="text-sm font-bold text-slate-700 mb-1">Click to select your Excel file</div>
                <div className="text-[11px] text-slate-400">Supports .xlsx and .xls</div>
                <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={onFileChange} className="hidden" />
              </div>

              <div className="mt-4 bg-slate-50 rounded-lg p-4">
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">What happens next</div>
                <div className="flex flex-col gap-2">
                  {[
                    ['2', 'Map Columns', "Match your Excel column names to the right fields. Required fields are marked with *."],
                    ['3', 'Review Rows', "We'll flag any rows missing required info. You can assign leads and fix issues before importing."],
                    ['4', 'Confirm', "Review a final summary and approve the import. You control exactly what gets written to the database."],
                  ].map(([n, title, desc]) => (
                    <div key={n} className="flex gap-3 items-start">
                      <div className="w-5 h-5 rounded-full bg-slate-200 text-slate-500 text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{n}</div>
                      <div>
                        <div className="text-[11px] font-bold text-slate-700">{title}</div>
                        <div className="text-[10px] text-slate-500">{desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Step 2: Column Mapping ── */}
          {step === 2 && (
            <div>
              <Instructions title="Step 2 of 4 — Match Your Columns">
                Match each field below to the corresponding column in your Excel file.
                Fields marked <span className="text-red-500 font-bold">*</span> are required.
                We've pre-filled matches we're confident about — check them and adjust if needed.
                Unmapped optional fields will be left blank.
              </Instructions>

              <div className="text-[11px] text-slate-500 mb-3">
                <span className="font-bold text-slate-700">{mappingData.length}</span> rows detected ·{' '}
                <span className="font-bold text-slate-700">{mappingHeaders.length}</span> columns found ·{' '}
                <span className={`font-bold ${requiredMapped ? 'text-emerald-600' : 'text-red-500'}`}>
                  {IMPORT_TARGET_FIELDS.filter(f => f.required && columnMapping[f.key]).length} / {IMPORT_TARGET_FIELDS.filter(f => f.required).length} required fields mapped
                </span>
              </div>

              <div className="flex flex-col gap-2">
                {IMPORT_TARGET_FIELDS.map(field => {
                  const isMapped = !!columnMapping[field.key];
                  return (
                    <div key={field.key} className={`flex items-center gap-3 p-3 rounded-lg border transition-all
                      ${field.required && !isMapped ? 'bg-red-50 border-red-200' : isMapped ? 'bg-emerald-50 border-emerald-100' : 'bg-slate-50 border-slate-100'}`}>
                      <div className="w-[44%] flex-shrink-0">
                        <div className="text-[11px] font-bold text-slate-700">
                          {field.label}
                          {field.required && <span className="text-red-500 ml-1">*</span>}
                        </div>
                        {field.required && !isMapped && (
                          <div className="text-[9px] text-red-500 font-semibold mt-0.5">Required — must be mapped</div>
                        )}
                      </div>
                      <div className="flex-1">
                        <select
                          value={columnMapping[field.key] || ''}
                          onChange={e => setColumnMapping({ ...columnMapping, [field.key]: e.target.value })}
                          className="w-full text-xs border border-slate-200 rounded-md p-1.5 bg-white outline-none focus:border-blue-400"
                        >
                          <option value="">— Skip this field —</option>
                          {mappingHeaders.map((h, i) => (
                            <option key={i} value={h}>{h}</option>
                          ))}
                        </select>
                      </div>
                      {isMapped && <span className="text-emerald-500 text-sm flex-shrink-0">✓</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Step 3: Row Validation ── */}
          {step === 3 && (
            <div>
              <Instructions title="Step 3 of 4 — Review Flagged Rows">
                We've checked every row for missing required information.
                <strong> Red rows</strong> have issues that must be fixed before they can import.
                <strong> Green rows</strong> are ready to go.
                Use the controls on each row to assign a lead, fix missing fields, or mark a plan as a historical record.
                Uncheck the approve toggle to skip a row entirely.
              </Instructions>

              <div className="flex items-center gap-4 mb-3 text-[11px]">
                <span><span className="font-bold text-emerald-600">{readyRows.length}</span> ready</span>
                <span><span className="font-bold text-red-500">{flaggedRows.length}</span> need attention</span>
                <span className="text-slate-400">{importRows.length} total rows</span>
                <button
                  onClick={() => setImportRows_all(importRows, updateImportRow, true)}
                  className="ml-auto text-[10px] font-bold text-blue-600 hover:underline"
                >
                  Approve All Ready
                </button>
              </div>

              <div className="flex flex-col gap-2">
                {importRows.map(row => {
                  const hasIssues = row.issues.length > 0;
                  return (
                    <div key={row._rowIndex} className={`rounded-lg border p-3 transition-all ${hasIssues ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-100'}`}>
                      {/* Row header */}
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-bold font-mono ${row.loc ? 'text-slate-900' : 'text-amber-600'}`}>
                            {row.loc || 'TBD'}
                          </span>
                          {row.isTBD && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-bold">⏳ Pending LOC</span>
                          )}
                          {row.isRenewal && row.parentLocId && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 font-bold">⇄ Renewal of {row.parentLocId}</span>
                          )}
                          <span className="text-[10px] text-slate-500">{row.street1}{row.street2 ? ` / ${row.street2}` : ''}</span>
                          <span className="text-[9px] px-1.5 py-0.5 rounded font-bold"
                            style={{ background: ALL_STAGES.find(s => s.key === row.stage)?.color + '22', color: ALL_STAGES.find(s => s.key === row.stage)?.color }}>
                            {ALL_STAGES.find(s => s.key === row.stage)?.label ?? row.stage}
                          </span>
                        </div>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <span className="text-[10px] font-bold text-slate-500">Include</span>
                          <input
                            type="checkbox"
                            checked={row.approved}
                            disabled={hasIssues && !row.street1}
                            onChange={e => updateImportRow(row._rowIndex, { approved: e.target.checked })}
                            className="cursor-pointer"
                          />
                        </label>
                      </div>

                      {/* Issues */}
                      {hasIssues && (
                        <div className="flex flex-col gap-1 mb-2">
                          {row.issues.map((issue, i) => (
                            <div key={i} className="text-[10px] text-red-600 font-semibold flex items-center gap-1">
                              <span>⚠</span> {issue}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Inline fixes */}
                      <div className="grid grid-cols-3 gap-2">
                        {/* LOC # — optional entry for TBD rows */}
                        {row.isTBD && (
                          <div className="col-span-1">
                            <div className="text-[9px] font-bold text-amber-600 uppercase mb-0.5">LOC # (optional)</div>
                            <input
                              type="text"
                              value={row.loc}
                              placeholder="Leave blank → TBD"
                              onChange={e => updateImportRow(row._rowIndex, { loc: e.target.value, isTBD: !e.target.value.trim() })}
                              className="w-full text-[11px] border border-amber-200 rounded p-1 bg-white outline-none"
                            />
                          </div>
                        )}

                        {/* Lead assignment */}
                        <div>
                          <div className="text-[9px] font-bold text-slate-500 uppercase mb-0.5">Lead</div>
                          <select
                            value={row.lead}
                            onChange={e => updateImportRow(row._rowIndex, {
                              lead: e.target.value,
                              issues: row.issues.filter(i => !i.includes('Lead')),
                              approved: !row.issues.filter(i => !i.includes('Lead') && i !== 'Lead not assigned or not recognised').length
                                ? true : row.approved,
                            })}
                            className="w-full text-[11px] border border-slate-200 rounded p-1 bg-white outline-none"
                          >
                            <option value="">— Assign Lead —</option>
                            {LEADS.map(l => <option key={l} value={l}>{l}</option>)}
                          </select>
                        </div>

                        {/* Stage override */}
                        <div>
                          <div className="text-[9px] font-bold text-slate-500 uppercase mb-0.5">Stage</div>
                          <select
                            value={row.stage}
                            onChange={e => updateImportRow(row._rowIndex, {
                              stage: e.target.value,
                              pendingDocuments: ['plan_approved', 'approved', 'expired', 'closed'].includes(e.target.value),
                            })}
                            className="w-full text-[11px] border border-slate-200 rounded p-1 bg-white outline-none"
                          >
                            {ALL_STAGES.filter(s => !['submitted', 'approved'].includes(s.key)).map(s => (
                              <option key={s.key} value={s.key}>{s.label}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Historical flag */}
                      <div className="flex items-center gap-4 mt-2 pt-2 border-t border-slate-100">
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={row.isHistorical}
                            onChange={e => updateImportRow(row._rowIndex, { isHistorical: e.target.checked })}
                          />
                          <span className="text-[10px] font-semibold text-indigo-600">📋 Historical Record</span>
                          <span className="text-[9px] text-slate-400">(excluded from performance metrics)</span>
                        </label>
                        {row.pendingDocuments && (
                          <span className="text-[9px] text-amber-600 font-bold">⚠ Will be flagged for pending documents</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Step 4: Confirm ── */}
          {step === 4 && (
            <div>
              <Instructions title="Step 4 of 4 — Confirm Import">
                Review the summary below and click <strong>Import Records</strong> to write the data to the database.
                Only rows you approved in the previous step will be imported.
                This action creates or updates records — it does not delete anything unless a record shares the same LOC #.
              </Instructions>

              <div className="bg-slate-50 rounded-xl p-4 mb-4 flex flex-col gap-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-600 font-semibold">Records to import</span>
                  <span className="text-xl font-bold text-slate-900">{approvedCount}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-600 font-semibold">Rows skipped</span>
                  <span className="text-xl font-bold text-slate-400">{importRows.length - approvedCount}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-600 font-semibold">Historical records</span>
                  <span className="text-xl font-bold text-indigo-600">{importRows.filter(r => r.approved && r.isHistorical).length}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-600 font-semibold">Flagged for pending documents</span>
                  <span className="text-xl font-bold text-amber-600">{importRows.filter(r => r.approved && r.pendingDocuments).length}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-600 font-semibold">Pending LOC assignment</span>
                  <span className="text-xl font-bold text-amber-500">{importRows.filter(r => r.approved && r.isTBD).length}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-600 font-semibold">Renewal plans linked</span>
                  <span className="text-xl font-bold text-purple-600">{importRows.filter(r => r.approved && r.isRenewal).length}</span>
                </div>
              </div>

              {/* Preview table */}
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Records to import</div>
              <div className="rounded-lg border border-slate-200 overflow-hidden">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="text-left p-2 font-bold text-slate-500">LOC #</th>
                      <th className="text-left p-2 font-bold text-slate-500">Location</th>
                      <th className="text-left p-2 font-bold text-slate-500">Type</th>
                      <th className="text-left p-2 font-bold text-slate-500">Lead</th>
                      <th className="text-left p-2 font-bold text-slate-500">Stage</th>
                      <th className="text-left p-2 font-bold text-slate-500">Flags</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importRows.filter(r => r.approved).map(row => (
                      <tr key={row._rowIndex} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="p-2 font-mono font-bold">
                          {row.loc ? (
                            <span className="text-slate-900">{row.loc}{row.isRenewal && <span className="ml-1 text-[9px] text-purple-600 font-bold">renewal</span>}</span>
                          ) : (
                            <span className="text-amber-600">TBD</span>
                          )}
                        </td>
                        <td className="p-2 text-slate-600">{row.street1}{row.street2 ? ` / ${row.street2}` : ''}</td>
                        <td className="p-2 text-slate-600">{row.type}</td>
                        <td className="p-2 text-slate-600">{row.lead || '—'}</td>
                        <td className="p-2">
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold"
                            style={{ background: ALL_STAGES.find(s => s.key === row.stage)?.color + '22', color: ALL_STAGES.find(s => s.key === row.stage)?.color }}>
                            {ALL_STAGES.find(s => s.key === row.stage)?.label ?? row.stage}
                          </span>
                        </td>
                        <td className="p-2">
                          {row.isHistorical && <span title="Historical" className="mr-1">📋</span>}
                          {row.pendingDocuments && <span title="Pending Docs">⚠️</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer buttons */}
        <div className="border-t border-slate-100 px-6 py-3 flex justify-between flex-shrink-0">
          <button
            onClick={step === 1 ? onCancel : () => setStep((step - 1) as 1 | 2 | 3 | 4)}
            className="px-4 py-2 text-sm font-semibold text-slate-500 rounded-lg bg-slate-100 hover:bg-slate-200"
          >
            {step === 1 ? 'Cancel' : '← Back'}
          </button>

          {step === 1 && (
            <div className="text-[11px] text-slate-400 self-center italic">Select a file to continue</div>
          )}

          {step === 2 && (
            <button
              onClick={onProceedToValidation}
              disabled={!requiredMapped}
              className={`px-5 py-2 text-sm font-bold text-white rounded-lg transition-all
                ${requiredMapped ? 'bg-slate-900 hover:bg-slate-700' : 'bg-slate-300 cursor-not-allowed'}`}
            >
              Validate {mappingData.length} Rows →
            </button>
          )}

          {step === 3 && (
            <button
              onClick={onProceedToReview}
              disabled={approvedCount === 0}
              className={`px-5 py-2 text-sm font-bold text-white rounded-lg transition-all
                ${approvedCount > 0 ? 'bg-slate-900 hover:bg-slate-700' : 'bg-slate-300 cursor-not-allowed'}`}
            >
              Review {approvedCount} Records →
            </button>
          )}

          {step === 4 && (
            <button
              onClick={onConfirm}
              disabled={approvedCount === 0}
              className={`px-5 py-2 text-sm font-bold text-white rounded-lg transition-all
                ${approvedCount > 0 ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-slate-300 cursor-not-allowed'}`}
            >
              Import {approvedCount} Records ✓
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Helper: approve all rows that have no blocking issues
function setImportRows_all(
  rows: ImportRow[],
  updateImportRow: (idx: number, updates: Partial<ImportRow>) => void,
  approve: boolean
) {
  rows.filter(r => r.issues.length === 0 || approve).forEach(r => {
    if (r.issues.length === 0) updateImportRow(r._rowIndex, { approved: approve });
  });
}
