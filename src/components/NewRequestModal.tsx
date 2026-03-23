import React from 'react';
import { MOT_FIELDS, IMPACT_FIELDS } from '../constants';
import { CollapsibleSection } from './CollapsibleSection';
import { Spinner } from './Spinner';
import { RequestFormFields } from './NewRequestModal/RequestFormFields';
import { formatFileSize } from '../utils/plans';
import { usePermissions } from '../hooks/usePermissions';
import { User, ReportTemplate, LoadingState, PlanForm } from '../types';

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
}

export const NewRequestModal: React.FC<NewRequestModalProps> = ({
  showForm, setShowForm, onCancel, form, setForm, currentUser, canView, reportTemplate,
  setWarningMessage, setShowNeedByWarningModal, handleSubmit, loading, motAllAnswered
}) => {
  const { fieldPermissions, setFieldPermissions } = usePermissions();
  const [validationErrors, setValidationErrors] = React.useState<string[]>([]);

  React.useEffect(() => {
    if (showForm) setValidationErrors([]);
  }, [showForm]);

  if (!showForm) return null;

  const atLeastOneMotAnswered = MOT_FIELDS.some(f => form[f.key] !== undefined && form[f.key] !== null);
  const update = (key: string, value: unknown) => {
    setValidationErrors([]);
    setForm(f => ({ ...f, [key]: value }));
  };

  const atLeastOneDirChecked = ['dir_nb', 'dir_sb', 'dir_directional', 'side_street'].some(k => !!form[k]);

  const getMissingItems = (): string[] => {
    const missing: string[] = [];
    if (!form.street1) missing.push('Street 1 is required');
    if (!form.needByDate) missing.push('Need By Date is required');
    if (!atLeastOneDirChecked) missing.push('Select at least one direction (NB, SB, DIR, or Side Street)');
    if (!atLeastOneMotAnswered) missing.push('Answer at least one Impacts & Requirements question');
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
    setValidationErrors([]);
    handleSubmit();
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
        {/* Header — matches PlanHeader style */}
        <div className="p-5 pb-0 flex-shrink-0">
          <div className="pb-3 mb-1">
            <div className="flex justify-between items-start mb-1.5">
              <div>
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">New TCP Request</div>
                <div className="text-[22px] font-bold text-slate-900">{form.id || <span className="text-slate-300">SFTC-—</span>}</div>
              </div>
              <div className="flex items-center gap-1.5 bg-slate-100 px-2.5 py-1 rounded-md border border-slate-200 mt-1">
                <div className="w-2 h-2 rounded-full bg-slate-400" />
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Draft</span>
              </div>
            </div>
            <div className="text-sm font-medium text-slate-500">
              {street1 ? street1 : <span className="text-slate-300 italic text-xs">Street 1</span>}
              <span className="text-slate-300 mx-1">/</span>
              {street2 ? street2 : <span className="text-slate-300 italic text-xs">Street 2</span>}
            </div>
          </div>

        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto min-h-0">
          <CollapsibleSection title="Plan Details">
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

          <CollapsibleSection title="Impacts & Requirements">
            <div className="text-[10px] text-slate-400 mb-3">All fields required — helps the traffic team optimize plan development.</div>
            {MOT_FIELDS.map(field => {
              const val = form[field.key];
              const unanswered = val === undefined || val === null;
              return (
                <div key={field.key} className={`mb-2 rounded-lg border-[1.5px] bg-white p-3 ${unanswered ? 'border-sky-200' : 'border-slate-200'}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-xs font-semibold text-slate-900 flex-1">
                      {field.label} <span className="text-red-500">*</span>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <button
                        onClick={() => update(field.key, true)}
                        className={`rounded-md px-3.5 py-1 text-[11px] font-bold transition-all ${val === true ? 'border-2 border-emerald-500 bg-emerald-50 text-emerald-600' : 'border border-slate-200 bg-white text-slate-400'}`}
                      >Yes</button>
                      <button
                        onClick={() => update(field.key, false)}
                        className={`rounded-md px-3.5 py-1 text-[11px] font-bold transition-all ${val === false ? 'border-2 border-slate-600 bg-slate-100 text-slate-900' : 'border border-slate-200 bg-white text-slate-400'}`}
                      >No</button>
                    </div>
                  </div>
                </div>
              );
            })}
            <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-slate-100">
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

          <CollapsibleSection title="Notes" defaultOpen={true}>
            <textarea
              value={form.notes || ""}
              onChange={e => update('notes', e.target.value)}
              rows={3}
              placeholder="Additional details or context for the traffic team..."
              className="w-full rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm outline-none focus:border-blue-400 resize-none"
            />
          </CollapsibleSection>

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
        </div>

        {/* Footer — matches PlanCardActions style */}
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
