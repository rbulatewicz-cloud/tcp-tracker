import { useState } from 'react';
import {
  Loader, XCircle, RefreshCw, RotateCcw, AlertTriangle, ExternalLink,
  CheckCircle, X, Plus, ChevronUp, ChevronDown, History, Trash2,
} from 'lucide-react';
import type { NoiseVariance, AppConfig, Plan } from '../../../types';
import {
  getVarianceExpiryStatus, daysUntilExpiry, updateVariance,
} from '../../../services/varianceService';
import { VarianceLetterModal } from '../../../components/VarianceLetterModal';
import { fmtDate as fmt } from '../../../utils/plans';
import {
  sortStreetsByCorridorOrder, findGapsInCoverage, findExtrasOutsideCorridors,
} from '../../../utils/corridor';
import { hasActiveLinkedPlans } from './families';
import { ExpiryBadge, SegmentPill, HOURS_LABEL, HOURS_COLOR } from './Badges';
import { RevisionRow } from './RevisionRow';
import { LinkedPlansBadge } from './LinkedPlansBadge';

/**
 * The main noise-variance card rendered in the Library → Noise Variances
 * table. Displays the active revision's metadata, a four-way color-coded
 * street list (verified / in-range / extras / gaps), collapsible specific-
 * scope language, revision history, linked-plan count, and admin actions
 * (upload revision, draft renewal, delete entire family).
 *
 * Firestore writes for street add/remove/verify use `updateVariance` directly.
 * Parent wires `onDelete` / `onRetry` / `onUploadRevision` callbacks.
 */
export function VarianceCard({
  active, history, canManage, onDelete, onRetry, onUploadRevision, appConfig, plans, setSelectedPlan,
}: {
  active: NoiseVariance;
  history: NoiseVariance[];
  canManage: boolean;
  onDelete: (v: NoiseVariance) => void;
  onRetry: (v: NoiseVariance) => void;
  onUploadRevision: (rootId: string) => void;
  appConfig: AppConfig;
  plans: Plan[];
  setSelectedPlan: (plan: Plan | null) => void;
}) {
  const [showHistory, setShowHistory] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [scopeExpanded, setScopeExpanded] = useState(false);
  const [renewalModalOpen, setRenewalModalOpen] = useState(false);
  const [streetInput, setStreetInput] = useState('');

  const expiryStatus = getVarianceExpiryStatus(active);
  const days = daysUntilExpiry(active);
  const isScanning = active.scanStatus === 'scanning';
  const isError = active.scanStatus === 'error';
  const rootId = active.parentVarianceId ?? active.id;

  // Only surface expiry urgency when this NV is actually backing active plans
  const activelyLinked = hasActiveLinkedPlans(rootId, plans);

  const borderColor =
    isError ? 'border-red-200' :
    (activelyLinked && expiryStatus === 'expired')  ? 'border-red-300' :
    (activelyLinked && expiryStatus === 'critical') ? 'border-red-200' :
    (activelyLinked && expiryStatus === 'warning')  ? 'border-amber-200' :
    'border-slate-200';

  return (
    <div className={`bg-white dark:bg-slate-800 rounded-xl border ${borderColor} dark:border-slate-700 overflow-hidden shadow-sm`}>
      {isScanning && (
        <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 dark:bg-blue-900/30 border-b border-blue-100">
          <Loader size={12} className="animate-spin text-blue-500" />
          <span className="text-[11px] font-semibold text-blue-700 dark:text-blue-300">Rafi is reading your doc…</span>
        </div>
      )}
      {isError && (
        <div className="flex items-center justify-between gap-2 px-4 py-2 bg-red-50 border-b border-red-100">
          <div className="flex items-center gap-2 min-w-0">
            <XCircle size={12} className="text-red-500 flex-shrink-0" />
            <span className="text-[11px] font-semibold text-red-700 break-all">
              Scan failed{active.scanError ? `: ${active.scanError}` : ''}
            </span>
          </div>
          <button onClick={() => onRetry(active)} className="text-[11px] font-semibold text-red-600 hover:text-red-800 underline flex-shrink-0 flex items-center gap-1">
            <RefreshCw size={10} /> Retry
          </button>
        </div>
      )}
      {active.revisionNumber > 0 && (
        <div className="flex items-center gap-1.5 px-4 pt-3 pb-0">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-indigo-50 text-indigo-600 border border-indigo-100">
            <RotateCcw size={8} /> Rev {active.revisionNumber}
          </span>
          <span className="text-[10px] text-slate-400">
            {history.length} previous revision{history.length !== 1 ? 's' : ''}
          </span>
          {(active.verifiedStreets?.length ?? 0) > 0 && history.length > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 ml-auto">
              <CheckCircle size={8} /> {active.verifiedStreets?.length} verified streets inherited
            </span>
          )}
        </div>
      )}
      <div className="p-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0 flex-1">
            {/* Permit number is the primary identifier */}
            {active.permitNumber ? (
              <>
                <div className="text-sm font-bold text-slate-900 dark:text-slate-100 leading-snug mb-0.5">
                  {active.permitNumber}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug line-clamp-2">
                  {active.title || active.fileName}
                </div>
              </>
            ) : (
              <div className="text-sm font-bold text-slate-900 dark:text-slate-100 leading-snug mb-0.5">
                {active.title || active.fileName}
              </div>
            )}
          </div>
          <ExpiryBadge status={activelyLinked ? expiryStatus : 'valid'} days={days} />
        </div>
        {!isScanning && active.scanStatus === 'complete' && (
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 mb-3">
            <div>
              <div className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-1">Segments</div>
              <div className="flex flex-wrap gap-1">
                {active.coveredSegments.length > 0
                  ? active.coveredSegments.map(s => <SegmentPill key={s} seg={s} />)
                  : <span className="text-[10px] text-slate-400 italic">Not specified</span>}
              </div>
            </div>
            <div>
              <div className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-1">Applicable Hours</div>
              <span className={`inline-block px-2 py-0.5 rounded-full border text-[10px] font-semibold ${HOURS_COLOR[active.applicableHours] ?? 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                {HOURS_LABEL[active.applicableHours] ?? active.applicableHours}
              </span>
            </div>
            <div>
              <div className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-1">Valid Period</div>
              <div className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                {active.validFrom ? `${fmt(active.validFrom)} – ${fmt(active.validThrough)}` : fmt(active.validThrough)}
              </div>
            </div>
            <div>
              <div className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-1">Scope Coverage</div>
              {active.isGeneric
                ? <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">Generic — All Work Types</span>
                : <div className="flex flex-wrap gap-1">
                    {active.coveredScopes.map(s => (
                      <span key={s} className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">{s}</span>
                    ))}
                  </div>
              }
            </div>
            {/* Street Limits — corridor range label + full editable chip list */}
            {((active.corridors ?? []).length > 0 || (active.coveredStreets ?? []).length > 0 || canManage) && (
              <div className="col-span-2">
                <div className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">Street Limits</div>

                {/* Corridor range label */}
                {(active.corridors ?? []).length > 0 && (
                  <div className="flex flex-col gap-0.5 mb-1.5">
                    {active.corridors!.map((c, i) => (
                      <div key={i} className="flex items-center gap-1 text-[10px]">
                        <span className="font-bold text-sky-700 dark:text-sky-300">{c.mainStreet}</span>
                        <span className="text-slate-400">from</span>
                        <span className="font-semibold text-sky-600">{c.from}</span>
                        <span className="text-slate-400">to</span>
                        <span className="font-semibold text-sky-600">{c.to}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Full street list — four-way classification: verified (green) / in-range (blue) / extra (violet) / gap (amber) */}
                {(() => {
                  const rawStreets = active.coveredStreets ?? [];
                  const corridors = active.corridors ?? [];
                  const hasCorridors = corridors.length > 0;
                  const verifiedSet = new Set((active.verifiedStreets ?? []).map(s => s.toLowerCase()));

                  const gaps   = findGapsInCoverage(corridors, rawStreets);
                  const extras = findExtrasOutsideCorridors(corridors, rawStreets);
                  const extraSet = new Set(extras.map(s => s.toLowerCase()));

                  // Verified streets come first (green) — may be from any category
                  const verifiedList = sortStreetsByCorridorOrder(active.verifiedStreets ?? []);
                  // In-range = covered streets NOT in extras and NOT already verified
                  const inRange = sortStreetsByCorridorOrder(
                    rawStreets.filter(s => !extraSet.has(s.toLowerCase()) && !verifiedSet.has(s.toLowerCase()))
                  );
                  // Extras outside range, not yet verified
                  const extrasSorted = sortStreetsByCorridorOrder(
                    extras.filter(s => !verifiedSet.has(s.toLowerCase()))
                  );
                  // Gaps not yet verified
                  const unverifiedGaps = gaps.filter(s => !verifiedSet.has(s.toLowerCase()));

                  const removeStreet = (st: string) =>
                    updateVariance(active.id, { coveredStreets: rawStreets.filter(s => s !== st) });

                  const verifyStreet = (st: string) =>
                    updateVariance(active.id, { verifiedStreets: [...(active.verifiedStreets ?? []), st] });

                  const unverifyStreet = (st: string) =>
                    updateVariance(active.id, { verifiedStreets: (active.verifiedStreets ?? []).filter(s => s !== st) });

                  // Banner counts exclude already-verified streets
                  const unverifiedExtras = extras.filter(s => !verifiedSet.has(s.toLowerCase()));

                  return (
                    <>
                      {/* Warning banners — only show for unverified issues */}
                      {unverifiedExtras.length > 0 && (
                        <div className="flex items-center gap-1.5 mb-1.5 px-2 py-1 bg-violet-50 border border-violet-200 rounded-lg">
                          <AlertTriangle size={10} className="text-violet-500 flex-shrink-0" />
                          <span className="text-[10px] font-semibold text-violet-700">
                            {unverifiedExtras.length} street{unverifiedExtras.length !== 1 ? 's' : ''} outside the stated corridor range — may be AI over-extraction
                          </span>
                          <a href={active.fileUrl} target="_blank" rel="noopener noreferrer"
                            className="ml-auto text-[10px] font-bold text-violet-600 hover:text-violet-800 flex items-center gap-0.5 flex-shrink-0">
                            <ExternalLink size={9} /> Verify PDF
                          </a>
                        </div>
                      )}
                      {unverifiedGaps.length > 0 && (
                        <div className="flex items-center gap-1.5 mb-1.5 px-2 py-1 bg-amber-50 border border-amber-200 rounded-lg">
                          <AlertTriangle size={10} className="text-amber-500 flex-shrink-0" />
                          <span className="text-[10px] font-semibold text-amber-700">
                            {unverifiedGaps.length} street{unverifiedGaps.length !== 1 ? 's' : ''} missing from stated range — may be AI under-extraction
                          </span>
                          <a href={active.fileUrl} target="_blank" rel="noopener noreferrer"
                            className="ml-auto text-[10px] font-bold text-amber-600 hover:text-amber-800 flex items-center gap-0.5 flex-shrink-0">
                            <ExternalLink size={9} /> Verify PDF
                          </a>
                        </div>
                      )}

                      <div className="flex flex-wrap gap-1 items-center">
                        {/* Verified chips — solid green with ✓, shown first */}
                        {verifiedList.map((st, i) => (
                          <span key={`verified-${i}`}
                            className="inline-flex items-center gap-1 pl-1.5 pr-1 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-300 group"
                            title="Manually verified from PDF"
                          >
                            <CheckCircle size={8} className="flex-shrink-0 text-emerald-500" />
                            {st}
                            {canManage && (
                              <button onClick={() => unverifyStreet(st)}
                                className="opacity-0 group-hover:opacity-100 text-emerald-400 hover:text-red-500 transition-opacity ml-0.5" title="Remove verification">
                                <X size={9} />
                              </button>
                            )}
                          </span>
                        ))}

                        {/* In-range chips — blue, sorted south→north */}
                        {inRange.map((st, i) => (
                          <span key={i}
                            className="inline-flex items-center gap-1 pl-1.5 pr-1 py-0.5 rounded text-[10px] font-semibold bg-sky-50 text-sky-700 border border-sky-200 dark:bg-sky-900/30 dark:text-sky-300 dark:border-sky-700 group"
                          >
                            {st}
                            {canManage && (
                              <button onClick={() => removeStreet(st)}
                                className="opacity-0 group-hover:opacity-100 text-sky-400 hover:text-red-500 transition-opacity ml-0.5" title="Remove">
                                <X size={9} />
                              </button>
                            )}
                          </span>
                        ))}

                        {/* Extra chips — violet dashed, outside stated range */}
                        {hasCorridors && extrasSorted.map((st, i) => (
                          <span key={`extra-${i}`}
                            className="inline-flex items-center gap-1 pl-1.5 pr-1 py-0.5 rounded text-[10px] font-semibold bg-violet-50 text-violet-600 border border-dashed border-violet-300 group"
                            title="Outside stated corridor range — verify in PDF"
                          >
                            <AlertTriangle size={8} className="flex-shrink-0 opacity-60" />
                            {st}
                            {canManage && (<>
                              <button onClick={() => verifyStreet(st)}
                                className="opacity-0 group-hover:opacity-100 text-violet-400 hover:text-emerald-600 transition-opacity" title="Mark as verified from PDF">
                                <CheckCircle size={9} />
                              </button>
                              <button onClick={() => removeStreet(st)}
                                className="opacity-0 group-hover:opacity-100 text-violet-400 hover:text-red-500 transition-opacity" title="Remove">
                                <X size={9} />
                              </button>
                            </>)}
                          </span>
                        ))}

                        {/* Gap chips — amber dashed, missing from range */}
                        {unverifiedGaps.map((st, i) => (
                          <span key={`gap-${i}`}
                            className="inline-flex items-center gap-1 pl-1.5 pr-1 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-600 border border-dashed border-amber-300 group"
                            title="Within stated range but not extracted — verify in PDF"
                          >
                            <AlertTriangle size={8} className="flex-shrink-0" />
                            {st}
                            {canManage && (
                              <button onClick={() => verifyStreet(st)}
                                className="opacity-0 group-hover:opacity-100 text-amber-400 hover:text-emerald-600 transition-opacity ml-0.5" title="Mark as verified from PDF">
                                <CheckCircle size={9} />
                              </button>
                            )}
                          </span>
                        ))}

                        {/* Inline add-street form */}
                        {canManage && (
                          <form onSubmit={e => {
                            e.preventDefault();
                            const val = streetInput.trim();
                            if (!val) return;
                            updateVariance(active.id, { coveredStreets: [...rawStreets, val] });
                            setStreetInput('');
                          }} className="inline-flex items-center gap-1">
                            <input type="text" value={streetInput} onChange={e => setStreetInput(e.target.value)}
                              placeholder="Add street…"
                              className="px-1.5 py-0.5 rounded text-[10px] border border-dashed border-sky-300 text-sky-600 placeholder-sky-300 focus:outline-none focus:border-sky-500 w-24 bg-transparent"
                            />
                            {streetInput.trim() && (
                              <button type="submit"
                                className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-sky-600 text-white hover:bg-sky-700 transition-colors">
                                <Plus size={9} /> Add
                              </button>
                            )}
                          </form>
                        )}

                        {rawStreets.length === 0 && gaps.length === 0 && !canManage && (
                          <span className="text-[10px] text-slate-400 italic">No streets extracted yet — run Rescan</span>
                        )}
                      </div>
                    </>
                  );
                })()}
              </div>
            )}
          </div>
        )}
        {!isScanning && active.scanStatus === 'complete' && canManage && (
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 mb-3 pt-2 border-t border-slate-100 dark:border-slate-700">
            <div>
              <label className="text-[9px] font-bold uppercase tracking-widest text-slate-400 block mb-1">Submitted to Police Commission</label>
              <input type="date" value={active.submittedDate || ''}
                onChange={e => updateVariance(active.id, { submittedDate: e.target.value || undefined })}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 px-2 py-1 text-[11px] outline-none focus:border-indigo-400" />
            </div>
            <div>
              <label className="text-[9px] font-bold uppercase tracking-widest text-slate-400 block mb-1">Approval Date</label>
              <input type="date" value={active.approvalDate || ''}
                onChange={e => updateVariance(active.id, { approvalDate: e.target.value || undefined })}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 px-2 py-1 text-[11px] outline-none focus:border-indigo-400" />
            </div>
            <div>
              <label className="text-[9px] font-bold uppercase tracking-widest text-slate-400 block mb-1">Check Number</label>
              <input type="text" value={active.checkNumber || ''}
                onChange={e => updateVariance(active.id, { checkNumber: e.target.value || undefined })}
                placeholder="Optional"
                className="w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 px-2 py-1 text-[11px] outline-none focus:border-indigo-400" />
            </div>
            <div>
              <label className="text-[9px] font-bold uppercase tracking-widest text-slate-400 block mb-1">Check Amount ($)</label>
              <input type="text" value={active.checkAmount || ''}
                onChange={e => updateVariance(active.id, { checkAmount: e.target.value || undefined })}
                placeholder="553.00"
                className="w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 px-2 py-1 text-[11px] outline-none focus:border-indigo-400" />
            </div>
          </div>
        )}
        {!isScanning && active.scanStatus === 'complete' && !active.isGeneric && active.scopeLanguage && (
          <>
            <button
              onClick={() => setScopeExpanded(e => !e)}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-left mb-2"
            >
              <div className="flex items-center gap-2">
                <AlertTriangle size={12} className="text-amber-500 flex-shrink-0" />
                <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">Specific scope — confirmation required when linking</span>
              </div>
              {scopeExpanded ? <ChevronUp size={12} className="text-amber-500 flex-shrink-0" /> : <ChevronDown size={12} className="text-amber-500 flex-shrink-0" />}
            </button>
            {scopeExpanded && (
              <div className="px-3 py-2 mb-2 rounded-lg bg-amber-50/60 border border-amber-100">
                <div className="text-[9px] font-bold uppercase tracking-widest text-amber-600 mb-1">Verbatim scope language</div>
                <p className="text-[11px] text-slate-700 dark:text-slate-300 italic leading-relaxed">&ldquo;{active.scopeLanguage}&rdquo;</p>
              </div>
            )}
          </>
        )}
        {history.length > 0 && (
          <div className="mb-2">
            <button
              onClick={() => setShowHistory(h => !h)}
              className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-400 hover:text-slate-600 transition-colors"
            >
              <History size={11} />
              {showHistory ? 'Hide' : 'Show'} revision history ({history.length})
              {showHistory ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
            </button>
            {showHistory && (
              <div className="mt-2 border-t border-slate-100 dark:border-slate-700">
                {history.map(v => <RevisionRow key={v.id} v={v} />)}
              </div>
            )}
          </div>
        )}
        <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <LinkedPlansBadge rootId={rootId} plans={plans} setSelectedPlan={setSelectedPlan} canManage={canManage} />
            <span className="text-[10px] text-slate-400">
              Uploaded {fmt(active.uploadedAt.slice(0, 10))} · {active.uploadedBy.split(' ')[0]}
            </span>
          </div>
          <div className="flex items-center gap-3">
            {active.scanStatus === 'complete' && (
              <button
                onClick={() => setRenewalModalOpen(true)}
                className="flex items-center gap-1 text-[11px] font-semibold text-violet-600 hover:text-violet-800 transition-colors"
              >
                ✉ Draft Renewal
              </button>
            )}
            {canManage && active.scanStatus === 'complete' && (
              <button
                onClick={() => onUploadRevision(rootId)}
                className="flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 transition-colors"
              >
                <RotateCcw size={11} /> Upload Revision
              </button>
            )}
            <a href={active.fileUrl} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-800">
              <ExternalLink size={11} /> View PDF
            </a>
            {canManage && (
              confirmDelete ? (
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-red-600 font-semibold">Delete all?</span>
                  <button onClick={() => onDelete(active)} className="text-[10px] font-bold text-red-600 hover:text-red-800 underline">Yes</button>
                  <button onClick={() => setConfirmDelete(false)} className="text-[10px] font-bold text-slate-400 hover:text-slate-600 underline">No</button>
                </div>
              ) : (
                <button onClick={() => setConfirmDelete(true)} className="flex items-center gap-1 text-[11px] font-semibold text-slate-400 hover:text-red-500 transition-colors">
                  <Trash2 size={11} />
                </button>
              )
            )}
          </div>
        </div>
      </div>
      {renewalModalOpen && (
        <VarianceLetterModal
          plan={{
            id: active.id,
            loc: active.permitNumber || active.title || active.id,
            street1: active.coveredSegments.join(', '),
            street2: '',
            segment: active.coveredSegments[0] || '',
          } as any}
          appConfig={appConfig}
          linkedVariance={active}
          isRenewal
          onClose={() => setRenewalModalOpen(false)}
        />
      )}
    </div>
  );
}
