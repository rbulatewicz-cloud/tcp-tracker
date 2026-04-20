import React, { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { IMPACT_CLOSURE_FIELDS, IMPACT_ENCROACHMENT_FIELDS, FIELD_REGISTRY } from '../constants';
import { useAppLists } from '../context/AppListsContext';
import { CollapsibleSection } from './CollapsibleSection';
import { Spinner } from './Spinner';
import { RequestFormFields } from './NewRequestModal/RequestFormFields';
import { findSimilarPlans } from './NewRequestModal/similarity';
import { SimilarPlansBanner } from './NewRequestModal/SimilarPlansBanner';
import { PlanIdentificationSection } from './NewRequestModal/PlanIdentificationSection';
import { HoursOfWorkForm } from './HoursOfWorkForm';
import { ComplianceBanner } from './ComplianceBanner';
import { formatFileSize, getNextRevisionLoc } from '../utils/plans';
import { usePermissions } from '../hooks/usePermissions';
import { useApp } from '../hooks/useApp';
import { getTurnaroundStats } from '../utils/planStats';
import { User, ReportTemplate, LoadingState, PlanForm, WorkHours, DrivewayProperty, Plan } from '../types';
import { subscribeToDrivewayProperties } from '../services/drivewayPropertyService';

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

  // Compute similar plans whenever street fields change.
  // On a renewal, the renewal family (parent + all dot-revisions) is excluded
  // by findSimilarPlans — they share the address by design.
  const similarity = React.useMemo(
    () => findSimilarPlans(
      form.street1 || '',
      form.street2 || '',
      form.parentLocId,
      firestoreData.plans || []
    ),
    [form.street1, form.street2, form.parentLocId, firestoreData.plans]
  );

  const hasExactMatches = similarity.exact.length > 0;

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
    // Renewal requests inherit parent's drawings — uploads are optional. For non-renewals, drawings are required.
    if (!form.parentLocId && form.attachments.length === 0) missing.push('At least one PDF attachment is required');
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
          <PlanIdentificationSection
            loc={form.loc}
            parentLocId={form.parentLocId}
            requestedBy={form.requestedBy}
            type={form.type}
            onChange={update}
            currentUser={currentUser}
            planTypes={planTypes}
            turnaroundStats={turnaroundStats}
          />

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
          <SimilarPlansBanner
            similarity={similarity}
            acknowledged={acknowledged}
            onAcknowledgedChange={setAcknowledged}
            parentLocId={form.parentLocId}
            currentLoc={form.loc}
            onNavigateToPlan={onNavigateToPlan}
            onRenewPlan={handleRenewal}
          />

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

            {/* Closures — public ROW work */}
            <div className="mb-3">
              <div className="text-[9px] font-black uppercase tracking-[0.15em] text-slate-400 mb-1.5">
                Closures
              </div>
              <div className="grid grid-cols-2 gap-2">
                {IMPACT_CLOSURE_FIELDS.map(field => (
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
            </div>

            {/* Encroachments — third-party-agency coordination.
                These flag a need for future MOT-team workflows (Caltrans / UPRR
                encroachment permits) — see project_deferred_features.md. */}
            <div className="pt-3 mt-3 border-t border-slate-100">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-[9px] font-black uppercase tracking-[0.15em] text-slate-400">
                  Encroachments
                </span>
                <span className="text-[9px] text-amber-600 italic">
                  MOT workflow coming soon
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {IMPACT_ENCROACHMENT_FIELDS.map(field => (
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
            {form.attachments.length === 0 && !form.parentLocId && (
              <p className="mt-2 text-[10px] text-red-500 font-semibold">At least one PDF attachment is required to submit.</p>
            )}
            {form.parentLocId && (
              <p className="mt-2 text-[10px] text-indigo-600 font-semibold">
                Renewal: drawings from {form.parentLocId} carry over. Upload revised drawings only if the plan changed.
              </p>
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
