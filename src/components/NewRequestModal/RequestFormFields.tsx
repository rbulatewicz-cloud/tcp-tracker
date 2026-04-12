import React, { useMemo } from 'react';
import { FIELD_REGISTRY } from '../../constants';
import { useAppLists } from '../../context/AppListsContext';
import { UserRole, User, ReportTemplate, PlanForm } from '../../types';
import { Permission } from '../../permissions/PermissionContextDef';
import { StreetInput } from '../StreetInput';

const FORM_GROUPS = ['Identification', 'Location', 'Schedule', 'Team & Priority'] as const;
const DIR_FIELDS = ['dir_nb', 'dir_sb', 'dir_directional', 'side_street'];
// Fields handled separately at the modal level
const EXCLUDED_FORM_FIELDS = ['lead', 'id', 'loc', 'requestedBy'];

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
  const { scopes, leads } = useAppLists();
  const listOverrides: Record<string, string[]> = { scope: scopes, lead: leads };

  const estimatedEndDate = useMemo(() => {
    if (!form.needByDate || !form.planDurationDays) return null;
    const d = new Date(form.needByDate + 'T00:00:00');
    d.setDate(d.getDate() + form.planDurationDays);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }, [form.needByDate, form.planDurationDays]);

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
            {(listOverrides[k] ?? v.options).map(opt => <option key={opt} value={opt}>{opt}</option>)}
          </select>
        ) : v.type === 'date' ? (
          <input
            type="date"
            value={(form[formKey] as string) || ""}
            onChange={e => update(formKey, e.target.value)}
            ref={k === 'needByDate' ? (el: HTMLInputElement | null) => {
              // React's synthetic onChange fires on every input event — including calendar
              // navigation arrows. The native DOM 'change' event fires only when the user
              // actually commits a date selection (clicks a date cell or types + tabs away).
              // We use a callback ref so the handler always captures the latest closure values.
              if (!el) return;
              if ((el as any).__thresholdHandler) {
                el.removeEventListener('change', (el as any).__thresholdHandler);
              }
              const handler = (evt: Event) => {
                const date = (evt.target as HTMLInputElement).value;
                if (!date || !reportTemplate?.needByThresholds) return;
                const threshold = reportTemplate.needByThresholds[form.type as keyof typeof reportTemplate.needByThresholds] || 0;
                if (threshold > 0) {
                  const daysToNeed = Math.ceil((new Date(date + 'T00:00:00').getTime() - TODAY.getTime()) / (1000 * 60 * 60 * 24));
                  if (daysToNeed < threshold) {
                    setWarningMessage(`The selected need-by date is less than the threshold of ${threshold} days for ${form.type} plans.`);
                    setShowNeedByWarningModal(true);
                  }
                }
              };
              (el as any).__thresholdHandler = handler;
              el.addEventListener('change', handler);
            } : undefined}
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
              {group === 'Schedule' && (
                <div className="flex flex-col gap-1">
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Plan Duration</div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="1"
                      max="365"
                      value={form.planDurationDays ?? ''}
                      onChange={e => update('planDurationDays', e.target.value ? parseInt(e.target.value, 10) : undefined)}
                      placeholder="—"
                      className="text-xs font-semibold text-slate-900 bg-white border border-slate-200 rounded-md p-2 w-20 outline-none focus:border-blue-400"
                    />
                    <span className="text-[11px] text-slate-500">days</span>
                  </div>
                  {estimatedEndDate && (
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      Est. end: <span className="font-semibold text-slate-600">{estimatedEndDate}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
