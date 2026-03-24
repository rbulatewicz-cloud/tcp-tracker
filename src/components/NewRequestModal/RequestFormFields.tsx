import React from 'react';
import { FIELD_REGISTRY } from '../../constants';
import { UserRole, User, ReportTemplate, PlanForm } from '../../types';
import { Permission } from '../../permissions/PermissionContextDef';
import { StreetInput } from '../StreetInput';

const FORM_GROUPS = ['Identification', 'Location', 'Schedule', 'Team & Priority'] as const;
const DIR_FIELDS = ['dir_nb', 'dir_sb', 'dir_directional', 'side_street'];
// Fields handled separately or retired
const EXCLUDED_FORM_FIELDS = ['lead', 'id', 'loc', 'requestedBy'];

// Workflow path info based on plan type
const WORKFLOW_INFO: Record<string, { label: string; color: string; steps: string }> = {
  WATCH:      { label: 'Watch/Standard Path',  color: '#6366F1', steps: 'Requested → Drafting → Submitted to DOT → Plan Approved' },
  Standard:   { label: 'Watch/Standard Path',  color: '#6366F1', steps: 'Requested → Drafting → Submitted to DOT → Plan Approved' },
  Engineered: { label: 'Engineered Path',       color: '#8B5CF6', steps: 'Requested → Drafting → Submitted to DOT → TCP Approved → LOC Submitted → Plan Approved' },
};

interface RequestFormFieldsProps {
  form: PlanForm;
  setForm: React.Dispatch<React.SetStateAction<PlanForm>>;
  currentUser: User | null;
  canView: (key: string) => boolean;
  fieldPermissions: Record<string, Permission>;
  setFieldPermissions: React.Dispatch<React.SetStateAction<Record<string, Permission>>>;
  reportTemplate: ReportTemplate;
  setWarningMessage: (msg: string) => void;
  setShowNeedByWarningModal: (show: boolean) => void;
  TODAY: Date;
}

export const RequestFormFields: React.FC<RequestFormFieldsProps> = ({
  form, setForm, currentUser, canView, reportTemplate, setWarningMessage, setShowNeedByWarningModal, TODAY,
}) => {
  const update = (key: string, value: unknown) => setForm(f => ({ ...f, [key]: value }));

  const workflowInfo = WORKFLOW_INFO[form.type] ?? WORKFLOW_INFO['Standard'];

  const renderField = (k: string, v: typeof FIELD_REGISTRY[string]) => {
    if (!canView(k)) return null;
    const formKey = k === 'streetFrom' ? 'street1' : k === 'streetTo' ? 'street2' : k;
    const isLeadDisabled = k === 'lead' && currentUser?.role !== UserRole.MOT && currentUser?.role !== UserRole.ADMIN;

    return (
      <div key={k} className="flex flex-col gap-1">
        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{v.label}</div>
        {v.type === 'select' && v.options ? (
          <select
            value={(form[formKey] as string) || ""}
            disabled={isLeadDisabled}
            onChange={e => update(formKey, e.target.value)}
            className={`text-xs font-semibold text-slate-900 bg-white border border-slate-200 rounded-md p-2 w-full ${isLeadDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            {v.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
          </select>
        ) : v.type === 'date' ? (
          <input
            type="date"
            value={(form[formKey] as string) || ""}
            onChange={e => {
              const newDate = e.target.value;
              update(formKey, newDate);
              if (k === 'needByDate' && reportTemplate?.needByThresholds) {
                const threshold = reportTemplate.needByThresholds[form.type as keyof typeof reportTemplate.needByThresholds] || 0;
                const daysToNeed = Math.ceil((new Date(newDate).getTime() - TODAY.getTime()) / (1000 * 60 * 60 * 24));
                if (daysToNeed < threshold) {
                  setWarningMessage(`The selected need-by date is less than the threshold of ${threshold} days for ${form.type} plans.`);
                  setShowNeedByWarningModal(true);
                }
              }
            }}
            className="text-xs font-semibold text-slate-900 bg-white border border-slate-200 rounded-md p-2 w-full"
          />
        ) : k === 'streetFrom' || k === 'streetTo' ? (
          <StreetInput value={(form[formKey] as string) || ""} onChange={e => update(formKey, e.target.value)} />
        ) : (
          <input
            type="text"
            value={(form[formKey] as string) || ""}
            onChange={e => update(formKey, e.target.value)}
            className="text-xs font-semibold text-slate-900 bg-white border border-slate-200 rounded-md p-2 w-full"
          />
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-3">

      {/* LOC # — primary identifier, always at top */}
      <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3">
        <div className="text-[9px] font-bold text-indigo-500 uppercase tracking-widest mb-2">
          LOC # — Primary Identifier <span className="text-red-500">*</span>
        </div>
        <input
          type="text"
          value={form.loc || ""}
          onChange={e => update('loc', e.target.value)}
          placeholder="e.g. LOC-366"
          className="text-sm font-bold text-slate-900 bg-white border border-indigo-200 rounded-md p-2 w-full focus:outline-none focus:border-indigo-400 font-mono"
        />
        <div className="text-[10px] text-indigo-400 mt-1">
          This is your team-assigned LOC number. It becomes the record's permanent identifier.
        </div>
      </div>

      {/* Requested By — auto-filled from current user, editable */}
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

      {/* Workflow path preview — updates live as plan type changes */}
      <div className="rounded-lg border px-3 py-2" style={{ borderColor: `${workflowInfo.color}44`, background: `${workflowInfo.color}08` }}>
        <div className="flex items-center gap-2 mb-1">
          <div className="w-2 h-2 rounded-full" style={{ background: workflowInfo.color }} />
          <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: workflowInfo.color }}>
            {workflowInfo.label}
          </span>
        </div>
        <div className="text-[10px] text-slate-500 leading-relaxed">{workflowInfo.steps}</div>
      </div>

      {/* Plan Type — shown prominently since it drives the workflow */}
      <div className="bg-slate-50 border border-slate-100 rounded-lg p-3">
        <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">Plan Type <span className="text-red-500">*</span></div>
        <select
          value={form.type || "Standard"}
          onChange={e => update('type', e.target.value)}
          className="text-xs font-semibold text-slate-900 bg-white border border-slate-200 rounded-md p-2 w-full cursor-pointer"
        >
          {['WATCH', 'Standard', 'Engineered'].map(opt => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      </div>

      {/* Remaining form groups */}
      <div className="grid grid-cols-2 gap-3">
        {FORM_GROUPS.map(group => {
          const fields = Object.entries(FIELD_REGISTRY).filter(
            ([k, v]) => v.group === group && v.inForm && !DIR_FIELDS.includes(k) && !EXCLUDED_FORM_FIELDS.includes(k) && k !== 'type'
          );
          if (fields.length === 0) return null;
          return (
            <div key={group} className="bg-slate-50 border border-slate-100 rounded-lg p-3">
              <h3 className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">{group}</h3>
              <div className="flex flex-col gap-2">
                {fields.map(([k, v]) => renderField(k, v))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Direction checkboxes */}
      <div className="flex gap-4 pt-2 border-t border-slate-100">
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
      </div>
    </div>
  );
};
