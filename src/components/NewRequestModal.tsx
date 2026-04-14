import React, { useState } from 'react';
import { AlertTriangle, Info, ArrowRight, RefreshCw } from 'lucide-react';
import { IMPACT_FIELDS, FIELD_REGISTRY } from '../constants';
import { useAppLists } from '../context/AppListsContext';
import { CollapsibleSection } from './CollapsibleSection';
import { Spinner } from './Spinner';
import { RequestFormFields } from './NewRequestModal/RequestFormFields';
import { HoursOfWorkForm } from './HoursOfWorkForm';
import { ComplianceBanner } from './ComplianceBanner';
import { formatFileSize } from '../utils/plans';
import { usePermissions } from '../hooks/usePermissions';
import { useApp } from '../hooks/useApp';
import { getTurnaroundStats } from '../utils/planStats';
import { User, ReportTemplate, LoadingState, PlanForm, WorkHours, UserRole, DrivewayProperty, Plan } from '../types';
import { subscribeToDrivewayProperties } from '../services/drivewayPropertyService';

// ── Similarity detection helpers ──────────────────────────────────────────────

function normalizeStreet(s: string): string {
  return s.toLowerCase().trim()
    .replace(/\bstreet\b/g, 'st').replace(/\bavenue\b/g, 'ave')
    .replace(/\bboulevard\b/g, 'blvd').replace(/\bdrive\b/g, 'dr')
    .replace(/\broad\b/g, 'rd').replace(/\bplace\b/g, 'pl')
    .replace(/\s+/g, ' ');
}

function isPlanExpired(plan: Plan): boolean {
  const end = plan.implementationWindow?.endDate || plan.softImplementationWindow?.endDate;
  if (!end) return false;
  return new Date(end) < new Date();
}

function getNextRevisionLoc(baseLoc: string, plans: Plan[]): string {
  const base = baseLoc.replace(/\.\d+$/, '');
  const existing = plans
    .map(p => p.loc || p.id)
    .filter(loc => loc.startsWith(base + '.'))
    .map(loc => parseInt(loc.slice(base.length + 1), 10))
    .filter(n => !isNaN(n));
  return `${base}.${existing.length > 0 ? Math.max(...existing) + 1 : 1}`;
}

interface SimilarityResult {
  exact: Plan[];
  near: Plan[];
}

// Workflow path info — updates live as plan type changes
const WORKFLOW_INFO: Record<string, { label: string; color: string; steps: string; description: string }> = {
  WATCH: {
    label: 'Watch/Standard Path',
    color: '#6366F1',
    steps: 'Requested → Drafting → Submitted to DOT → Plan Approved',
    description: 'Short-duration, low-complexity work. Watch Manual based plans. The traffic control plan and letter of concurrence are submitted together as a single package. No separate TCP review cycle with DOT.',
  },
  Standard: {
    label: 'Watch/Standard Path',
    color: '#6366F1',
    steps: 'Requested → Drafting → Submitted to DOT → Plan Approved',
    description: 'Moderate complexity with standard lane or sidewalk impacts. TCP and LOC are submitted together. Follows the same single-submittal process as WATCH but may involve greater traffic impacts or longer duration.',
  },
  Engineered: {
    label: 'Engineered Path',
    color: '#8B5CF6',
    steps: 'Requested → Drafting → Submitted to DOT → TCP Approved → LOC Submitted → Plan Approved',
    description: 'Complex plans requiring a two-phase DOT approval process — TCP drawings are reviewed and approved first, then the Letter of Concurrence is submitted separately. Typically involves full closures, detours, or high-impact work.',
  },
};

const DIR_FIELDS = ['dir_nb', 'dir_sb', 'dir_directional', 'side_street'];

// Visual group divider with label
const GroupLabel = ({ label }: { label: string }) => (
  <div className="flex items-center gap-3 px-7 pt-4 pb-0">
    <div className="flex-1 h-px bg-slate-100" />
    <span className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-300">{label}</span>
    <div className="flex-1 h-px bg-slate-100" />
  </div>
);

interface NewRequestModalProps {
  showForm: boolean;
  setShowForm: (show: boolean) => void;
  onCancel: () => void;
  form: PlanForm;
  setForm: React.Dispatch<React.SetStateAction<PlanForm>>;
  currentUser: User | null;
  canView: (key: string) => boolean;
  reportTemplate: ReportTemplate;
  setWarningMessage: (msg: string) => void;
  setShowNeedByWarningModal: (show: boolean) => void;
  handleSubmit: () => void;
  loading: LoadingState;
  motAllAnswered: boolean;
  onNavigateToPlan: (locId: string) => void;
}

export const NewRequestModal: React.FC<NewRequestModalProps> = ({
  showForm, setShowForm, onCancel, form, setForm, currentUser, canView, reportTemplate,
  setWarningMessage, setShowNeedByWarningModal, handleSubmit, loading, motAllAnswered,
  onNavigateToPlan,
}) => {
  const { fieldPermissions, setFieldPermissions } = usePermissions();
  const { planTypes } = useAppLists();
  const { firestoreData } = useApp();
  const [validationErrors, setValidationErrors] = React.useState<string[]>([]);
  const [acknowledged, setAcknowledged] = React.useState(false);
  // CD slide file attached at request time — uploaded after plan creation
  const [cdSlideFile, setCdSlideFile] = useState<File | null>(null);
  const [properties, setProperties] = React.useState<DrivewayProperty[]>([]);
  React.useEffect(() => subscribeToDrivewayProperties(setProperties), []);

  // Reset acknowledgment whenever streets change
  React.useEffect(() => { setAcknowledged(false); }, [form.street1, form.street2]);

  // Compute similar plans whenever street fields change
  const similarity = React.useMemo((): SimilarityResult => {
    const s1 = normalizeStreet(form.street1 || '');
    if (!s1) return { exact: [], near: [] };
    const s2 = normalizeStreet(form.street2 || '');
    const plans = firestoreData.plans || [];
    const exact: Plan[] = [];
    const near: Plan[] = [];
    for (const p of plans) {
      const p1 = normalizeStreet(p.street1 || '');
      const p2 = normalizeStreet(p.street2 || '');
      const isExact = (s1 === p1 && s2 === p2) || (s1 === p2 && s2 === p1);
      if (isExact) { exact.push(p); continue; }
      const oneMatches = s1 === p1 || s1 === p2 || (s2 && (s2 === p1 || s2 === p2));
      if (oneMatches) near.push(p);
    }
    return { exact, near };
  }, [form.street1, form.street2, firestoreData.plans]);

  const hasExactMatches = similarity.exact.length > 0;
  const [expandedPlanId, setExpandedPlanId] = React.useState<string | null>(null);

  const turnaroundStats = React.useMemo(
    () => getTurnaroundStats(form.type, firestoreData.plans),
    [form.type, firestoreData.plans]
  );

  React.useEffect(() => {
    if (showForm) setValidationErrors([]);
  }, [showForm]);

  if (!showForm) return null;

  const update = (key: string, value: unknown) => {
    setValidationErrors([]);
    setForm(f => ({ ...f, [key]: value }));
  };

  const atLeastOneDirChecked = DIR_FIELDS.some(k => !!form[k]);

  const workHoursValid = (): boolean => {
    const wh = form.work_hours;
    if (!wh) return false;
    if (wh.shift === 'continuous') return true;
    return wh.days.length > 0;
  };

  const getMissingItems = (): string[] => {
    const missing: string[] = [];
    if (!form.type) missing.push('Plan Type is required');
    if (!form.street1) missing.push('Street 1 is required');
    if (!form.needByDate) missing.push('Need By Date is required');
    if (!atLeastOneDirChecked) missing.push('Select at least one direction (NB, SB, DIR, or Side Street)');
    if (!workHoursValid()) missing.push('Hours of Work: select a shift and at least one day (or 24/7 Continuous)');
    if (form.attachments.length === 0) missing.push('At least one PDF attachment is required');
    return missing;
  };

  const handleSubmitClick = () => {
    if (loading.submit) return;
    const missing = getMissingItems();
    if (missing.length > 0) {
      setValidationErrors(missing);
      return;
    }
    if (hasExactMatches && !acknowledged) {
      setValidationErrors(['You must review and acknowledge the similar existing plans before submitting.']);
      return;
    }
    setValidationErrors([]);
    // Attach the CD slide file to form state so planService can upload it post-creation
    if (cdSlideFile) {
      setForm(f => ({ ...f, cd_slide_file: cdSlideFile } as typeof f));
    }
    handleSubmit();
  };

  const handleRenewal = (original: Plan) => {
    const newLoc = getNextRevisionLoc(original.loc || original.id, firestoreData.plans || []);
    const suffix = newLoc.slice((original.loc || original.id).replace(/\.\d+$/, '').length);
    setForm(f => ({
      ...f,
      loc: newLoc,
      street1: original.street1 || f.street1,
      street2: original.street2 || f.street2,
      scope: original.scope || f.scope,
      parentLocId: original.id,
      revisionSuffix: suffix,
    }));
    setAcknowledged(true);
  };

  const workflowInfo = form.type ? WORKFLOW_INFO[form.type] ?? null : null;
  const street1 = form.street1 || '';
  const street2 = form.street2 || '';

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-5 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-[580px] max-h-[90vh] shadow-2xl flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 pb-0 flex-shrink-0">
          <div className="pb-3 mb-1">
            <div className="flex justify-between items-start mb-1">
              <div>
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">New LOC Request</div>
                <div className="text-[22px] font-bold text-slate-900 font-mono">
                  {form.loc || <span className="text-slate-300">LOC-—</span>}
                </div>
              </div>
              {form.parentLocId ? (
                <div className="flex items-center gap-1.5 bg-indigo-50 px-2.5 py-1 rounded-md border border-indigo-200 mt-1">
                  <RefreshCw size={10} className="text-indigo-500" />
                  <span className="text-[10px] text-indigo-600 font-bold uppercase tracking-wider">Renewal</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 bg-slate-100 px-2.5 py-1 rounded-md border border-slate-200 mt-1">
                  <div className="w-2 h-2 rounded-full bg-slate-400" />
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Draft</span>
                </div>
              )}
            </div>
            <div className="text-sm font-medium text-slate-500">
              {street1 ? street1 : <span className="text-slate-300 italic text-xs">Street 1</span>}
              <span className="text-slate-300 mx-1">/</span>
              {street2 ? street2 : <span className="text-slate-300 italic text-xs">Street 2</span>}
            </div>
            {form.requestedBy && (
              <div className="text-[11px] text-slate-400 mt-0.5">
                Requested by <span className="font-semibold text-slate-600">{form.requestedBy}</span>
              </div>
            )}
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto min-h-0">

          {/* ── Plan Identification ── */}
          <CollapsibleSection title="Plan Identification">
            <div className="flex flex-col gap-3">

              {/* LOC # */}
              {currentUser?.role === UserRole.SFTC ? (
                <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3">
                  <div className="text-[9px] font-bold text-indigo-500 uppercase tracking-widest mb-2">LOC # — Primary Identifier</div>
                  <div className="text-sm font-bold text-slate-400 font-mono p-2">Auto-assigned on submit</div>
                  <div className="text-[10px] text-indigo-400 mt-1">Your LOC number will be automatically assigned when you submit this request.</div>
                </div>
              ) : (
                <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3">
                  <div className="text-[9px] font-bold text-indigo-500 uppercase tracking-widest mb-2">LOC # — Primary Identifier</div>
                  <input
                    type="text"
                    value={form.loc || ""}
                    onChange={e => update('loc', e.target.value)}
                    placeholder="e.g. LOC-366"
                    className="text-sm font-bold text-slate-900 bg-white border border-indigo-200 rounded-md p-2 w-full focus:outline-none focus:border-indigo-400 font-mono"
                  />
                  <div className="text-[10px] text-indigo-400 mt-1">Pre-filled with the next available number. Edit only if a specific LOC is required.</div>
                </div>
              )}

              {/* Requested By */}
              <div className="bg-slate-50 border border-slate-100 rounded-lg p-3">
                <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">Requested By</div>
                <input
                  type="text"
                  value={form.requestedBy || ""}
                  onChange={e => update('requestedBy', e.target.value)}
                  placeholder="Your name"
                  className="text-xs font-semibold text-slate-900 bg-white border border-slate-200 rounded-md p-2 w-full focus:outline-none focus:border-blue-400"
                />
                <div className="text-[10px] text-slate-400 mt-1">Auto-filled from your account. Edit if submitting on behalf of someone else.</div>
              </div>

              {/* Plan Type + Workflow preview */}
              <div className="bg-slate-50 border border-slate-100 rounded-lg p-3">
                <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">Plan Type <span className="text-red-500">*</span></div>
                <select
                  value={form.type || ""}
                  onChange={e => update('type', e.target.value)}
                  className="text-xs font-semibold text-slate-900 bg-white border border-slate-200 rounded-md p-2 w-full cursor-pointer mb-3"
                >
                  <option value="" disabled>Select a plan type…</option>
                  {planTypes.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
                {workflowInfo ? (
                  <div className="rounded-lg border px-3 py-2" style={{ borderColor: `${workflowInfo.color}44`, background: `${workflowInfo.color}08` }}>
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-2 h-2 rounded-full" style={{ background: workflowInfo.color }} />
                      <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: workflowInfo.color }}>
                        {workflowInfo.label}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-600 leading-relaxed mb-1.5">{workflowInfo.description}</div>
                    <div className="text-[10px] text-slate-400 leading-relaxed border-t border-slate-200 pt-1.5 mt-1">{workflowInfo.steps}</div>
                  </div>
                ) : (
                  <div className="rounded-lg border border-slate-200 px-3 py-2 bg-white text-[10px] text-slate-400 italic">
                    Select a plan type above to see its description and approval workflow.
                  </div>
                )}

                {/* ── Turnaround stats ── */}
                {form.type && (
                  <div className="mt-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
                    <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mr-0.5">📊 Avg Turnaround</span>
                      {turnaroundStats.avgDays !== null ? (
                        <span className="text-[12px] font-bold text-slate-800">{turnaroundStats.avgDays} days</span>
                      ) : (
                        <span className="text-[11px] text-slate-400 italic">No recent data</span>
                      )}
                      <span className="text-slate-300 text-[11px]">·</span>
                      <span className="text-[11px] text-slate-600">
                        {turnaroundStats.inProgress} currently in progress
                      </span>
                      {turnaroundStats.sampleSize > 0 && (
                        <span className="text-[10px] text-slate-400">
                          (based on {turnaroundStats.sampleSize} plan{turnaroundStats.sampleSize !== 1 ? 's' : ''}, last 60 days
                          {turnaroundStats.sampleSize <= 3 ? ' — limited data' : ''})
                        </span>
                      )}
                    </div>
                    {turnaroundStats.sampleSize > 0 && turnaroundStats.sampleSize <= 3 && (
                      <div className="mt-1 text-[10px] text-amber-600">
                        ⚠ Small sample — contributing plans: {turnaroundStats.contributingLocs.join(', ')}. If any were imported/trued-up, mark them as Historical on the plan card to exclude them.
                      </div>
                    )}
                  </div>
                )}
              </div>

            </div>
          </CollapsibleSection>

          {/* ── Scope & Location ── */}
          <CollapsibleSection title="Scope & Location">
            <RequestFormFields
              form={form}
              setForm={setForm}
              currentUser={currentUser}
              canView={canView}
              fieldPermissions={fieldPermissions}
              setFieldPermissions={setFieldPermissions}
              reportTemplate={reportTemplate}
              setWarningMessage={setWarningMessage}
              setShowNeedByWarningModal={setShowNeedByWarningModal}
              TODAY={new Date()}
            />
          </CollapsibleSection>

          {/* ── Similar Plans Check ── */}
          {(similarity.exact.length > 0 || similarity.near.length > 0) && (
            <div className="px-7 py-4 space-y-3">

              {/* Exact matches — hard warning */}
              {similarity.exact.length > 0 && (
                <div className="rounded-xl border border-amber-300 bg-amber-50 overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-100 border-b border-amber-200">
                    <AlertTriangle size={13} className="text-amber-600 flex-shrink-0" />
                    <span className="text-[11px] font-bold text-amber-800 uppercase tracking-wide">
                      Similar Plans Found — Review Required
                    </span>
                  </div>
                  <div className="p-3 space-y-2">
                    {similarity.exact.map(p => {
                      const expired = isPlanExpired(p);
                      const isRenewal = !!form.parentLocId && form.parentLocId === p.id;
                      const isExpanded = expandedPlanId === p.id;
                      const winStart = p.implementationWindow?.startDate || p.softImplementationWindow?.startDate;
                      const winEnd   = p.implementationWindow?.endDate   || p.softImplementationWindow?.endDate;
                      return (
                        <div key={p.id} className="bg-white rounded-lg border border-amber-100 overflow-hidden">
                          <div className="flex items-center gap-2 px-3 py-2">
                            <button
                              type="button"
                              onClick={() => setExpandedPlanId(isExpanded ? null : p.id)}
                              className="flex-1 min-w-0 text-left"
                            >
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-[12px] font-bold text-slate-800 font-mono">{p.loc || p.id}</span>
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold bg-slate-100 text-slate-600">{p.stage}</span>
                                {expired && <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold bg-red-100 text-red-600">Expired</span>}
                                <span className="text-[10px] text-slate-400 ml-auto">{isExpanded ? '▲' : '▼'}</span>
                              </div>
                              <p className="text-[10px] text-slate-500 mt-0.5 truncate">
                                {p.street1}{p.street2 ? ` / ${p.street2}` : ''}{p.scope ? ` · ${p.scope}` : ''}
                              </p>
                            </button>
                            <div className="flex-shrink-0">
                              {expired ? (
                                isRenewal ? (
                                  <span className="text-[10px] font-bold text-emerald-600 flex items-center gap-1">
                                    <RefreshCw size={10} /> Renewal: {form.loc}
                                  </span>
                                ) : (
                                  <button type="button" onClick={() => handleRenewal(p)}
                                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-600 text-white text-[10px] font-bold hover:bg-indigo-700 transition-colors">
                                    <RefreshCw size={10} /> Request Renewal
                                  </button>
                                )
                              ) : (
                                <button type="button" onClick={() => onNavigateToPlan(p.loc || p.id)}
                                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 text-white text-[10px] font-bold hover:bg-slate-600 transition-colors">
                                  <ArrowRight size={10} /> Use This Plan
                                </button>
                              )}
                            </div>
                          </div>
                          {isExpanded && (
                            <div className="border-t border-amber-100 bg-amber-50/60 px-3 py-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[10px]">
                              {p.type     && <div><span className="font-bold text-slate-500">Type</span> <span className="text-slate-700">{p.type}</span></div>}
                              {p.lead     && <div><span className="font-bold text-slate-500">Lead</span> <span className="text-slate-700">{p.lead}</span></div>}
                              {p.priority && <div><span className="font-bold text-slate-500">Priority</span> <span className="text-slate-700">{p.priority}</span></div>}
                              {p.requestedBy && <div><span className="font-bold text-slate-500">Requested by</span> <span className="text-slate-700">{p.requestedBy}</span></div>}
                              {(winStart || winEnd) && (
                                <div className="col-span-2">
                                  <span className="font-bold text-slate-500">Window</span>{' '}
                                  <span className="text-slate-700">{winStart ?? '—'} → {winEnd ?? '—'}</span>
                                </div>
                              )}
                              {p.scope && (
                                <div className="col-span-2">
                                  <span className="font-bold text-slate-500">Scope</span>{' '}
                                  <span className="text-slate-700">{p.scope}</span>
                                </div>
                              )}
                              {p.notes && (
                                <div className="col-span-2">
                                  <span className="font-bold text-slate-500">Notes</span>{' '}
                                  <span className="text-slate-600 italic line-clamp-2">{p.notes}</span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {!acknowledged && (
                      <label className="flex items-start gap-2 cursor-pointer pt-1">
                        <input
                          type="checkbox"
                          checked={acknowledged}
                          onChange={e => setAcknowledged(e.target.checked)}
                          className="mt-0.5 w-3.5 h-3.5 rounded accent-amber-600 flex-shrink-0"
                        />
                        <span className="text-[11px] text-amber-800 font-semibold leading-snug">
                          I have reviewed these plans and confirm this request is not a duplicate.
                        </span>
                      </label>
                    )}
                    {acknowledged && (
                      <div className="flex items-center gap-1.5 pt-1">
                        <div className="w-3.5 h-3.5 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0">
                          <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1.5 4l2 2 3-3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        </div>
                        <span className="text-[11px] text-emerald-700 font-semibold">Acknowledged — you may proceed.</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Near matches — informational */}
              {similarity.near.length > 0 && (
                <div className="rounded-xl border border-blue-200 bg-blue-50 overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-2 bg-blue-100 border-b border-blue-200">
                    <Info size={12} className="text-blue-500 flex-shrink-0" />
                    <span className="text-[11px] font-bold text-blue-700 uppercase tracking-wide">Nearby Plans (informational)</span>
                  </div>
                  <div className="p-3 space-y-1.5">
                    {similarity.near.slice(0, 4).map(p => {
                      const isExpanded = expandedPlanId === p.id;
                      const winStart = p.implementationWindow?.startDate || p.softImplementationWindow?.startDate;
                      const winEnd   = p.implementationWindow?.endDate   || p.softImplementationWindow?.endDate;
                      return (
                        <div key={p.id} className="bg-white rounded-lg border border-blue-100 overflow-hidden">
                          <button type="button" onClick={() => setExpandedPlanId(isExpanded ? null : p.id)}
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-left">
                            <div className="flex-1 min-w-0">
                              <span className="text-[11px] font-bold text-slate-700 font-mono">{p.loc || p.id}</span>
                              <span className="text-[10px] text-slate-400 ml-1.5">{p.street1}{p.street2 ? ` / ${p.street2}` : ''}</span>
                            </div>
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium">{p.stage}</span>
                            <span className="text-[10px] text-slate-300">{isExpanded ? '▲' : '▼'}</span>
                          </button>
                          {isExpanded && (
                            <div className="border-t border-blue-100 bg-blue-50/50 px-3 py-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[10px]">
                              {p.type     && <div><span className="font-bold text-slate-500">Type</span> <span className="text-slate-700">{p.type}</span></div>}
                              {p.lead     && <div><span className="font-bold text-slate-500">Lead</span> <span className="text-slate-700">{p.lead}</span></div>}
                              {p.priority && <div><span className="font-bold text-slate-500">Priority</span> <span className="text-slate-700">{p.priority}</span></div>}
                              {p.requestedBy && <div><span className="font-bold text-slate-500">Requested by</span> <span className="text-slate-700">{p.requestedBy}</span></div>}
                              {(winStart || winEnd) && (
                                <div className="col-span-2">
                                  <span className="font-bold text-slate-500">Window</span>{' '}
                                  <span className="text-slate-700">{winStart ?? '—'} → {winEnd ?? '—'}</span>
                                </div>
                              )}
                              {p.scope && (
                                <div className="col-span-2">
                                  <span className="font-bold text-slate-500">Scope</span>{' '}
                                  <span className="text-slate-700">{p.scope}</span>
                                </div>
                              )}
                              {p.notes && (
                                <div className="col-span-2">
                                  <span className="font-bold text-slate-500">Notes</span>{' '}
                                  <span className="text-slate-600 italic line-clamp-2">{p.notes}</span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

            </div>
          )}

          {/* ── Work Conditions ── */}
          <GroupLabel label="Work Conditions" />

          <CollapsibleSection title="Hours of Work">
            <div className="text-[10px] text-slate-400 mb-3">
              Required — specify when work will occur so the traffic team can plan accordingly.
            </div>
            <HoursOfWorkForm
              value={form.work_hours as WorkHours | undefined}
              onChange={wh => update('work_hours', wh)}
            />
          </CollapsibleSection>

          <CollapsibleSection title="Traffic Impacts">
            {/* Direction flags + Krail */}
            <div className="flex flex-wrap gap-4 pb-3 mb-3 border-b border-slate-100">
              {DIR_FIELDS.map(k => {
                const v = FIELD_REGISTRY[k];
                if (!v) return null;
                return (
                  <label key={k} className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!form[k]}
                      onChange={e => update(k, e.target.checked)}
                      className="rounded border-slate-300"
                    />
                    {v.label}
                  </label>
                );
              })}
              <div className="w-px bg-slate-200 self-stretch" />
              <label className="flex items-center gap-2 text-xs text-violet-700 font-semibold cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!form.impact_krail}
                  onChange={e => {
                    const checked = e.target.checked;
                    setForm(f => ({
                      ...f,
                      impact_krail: checked,
                      // Checking Krail forces continuous shift; unchecking clears it
                      // so compliance triggers reset correctly
                      work_hours: checked
                        ? { shift: 'continuous' as const, days: [] }
                        : undefined,
                    }));
                  }}
                  className="rounded border-slate-300 accent-violet-600"
                />
                Krail
              </label>
            </div>

            {/* Closure / impact checkboxes */}
            <div className="grid grid-cols-2 gap-2">
              {IMPACT_FIELDS.map(field => (
                <label key={field.key} className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!form[field.key]}
                    onChange={e => update(field.key, e.target.checked)}
                    className="rounded border-slate-300"
                  />
                  {field.label}
                </label>
              ))}
            </div>
          </CollapsibleSection>

          <CollapsibleSection title="Compliance Preview">
            <ComplianceBanner
              form={form}
              onJustificationChange={val => update('phe_justification', val)}
              properties={properties}
              plans={firestoreData.plans}
              drivewayAddresses={(form.driveway_addresses as Array<{ address: string; propertyId?: string }>) ?? []}
              onDrivewayAddressesChange={addrs => update('driveway_addresses', addrs)}
              cdSlideFile={cdSlideFile}
              onCdSlideChange={setCdSlideFile}
            />
          </CollapsibleSection>

          {/* ── Submission ── */}
          <GroupLabel label="Submission" />

          <CollapsibleSection title="Documents">
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 p-3 text-xs font-semibold text-slate-500 transition-all hover:border-blue-400">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              Upload PDF Plans (Multiple)
              <input
                type="file"
                accept=".pdf"
                multiple
                onChange={e => {
                  const files = Array.from(e.target.files || []);
                  if (files.length > 0) update('attachments', [...form.attachments, ...files]);
                }}
                className="hidden"
              />
            </label>
            {form.attachments.length === 0 && (
              <p className="mt-2 text-[10px] text-red-500 font-semibold">At least one PDF attachment is required to submit.</p>
            )}
            {form.attachments.length > 0 && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                {form.attachments.map((file: File, idx: number) => (
                  <div key={idx} className="relative flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-2 shadow-sm">
                    <button
                      onClick={() => update('attachments', form.attachments.filter((_: File, i: number) => i !== idx))}
                      className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-100 text-[10px] text-red-500"
                    >✕</button>
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-500">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
                      </svg>
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <div className="truncate text-[11px] font-bold text-slate-900">{file.name}</div>
                      <div className="text-[9px] font-semibold text-slate-400">{formatFileSize(file.size)} • PDF</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CollapsibleSection>

          <CollapsibleSection title="Notes">
            <textarea
              value={form.notes || ""}
              onChange={e => update('notes', e.target.value)}
              rows={3}
              placeholder="Additional details or context for the traffic team..."
              className="w-full rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm outline-none focus:border-blue-400 resize-none"
            />
          </CollapsibleSection>

        </div>

        {/* Footer */}
        <div className="border-t border-slate-100 flex-shrink-0 bg-white rounded-b-2xl">
          {validationErrors.length > 0 && (
            <div className="px-5 pt-3 pb-0">
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                <div className="text-[11px] font-bold text-red-600 mb-1">Please fix the following before submitting:</div>
                <ul className="list-disc list-inside space-y-0.5">
                  {validationErrors.map((err, i) => (
                    <li key={i} className="text-[11px] text-red-500">{err}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
          <div className="px-5 py-3 flex items-center justify-between">
            <button
              onClick={onCancel}
              className="px-4 py-2 text-sm font-semibold text-slate-500 rounded-lg bg-slate-100 hover:bg-slate-200 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmitClick}
              disabled={loading.submit}
              className="flex items-center gap-2 px-6 py-2.5 text-sm font-bold text-white rounded-lg bg-slate-900 hover:bg-slate-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loading.submit && <Spinner size={14} color="#fff" />}
              {loading.submit ? "Submitting..." : "Submit Request"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
