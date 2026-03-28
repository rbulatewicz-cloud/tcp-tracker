import React from 'react';
import { PermissionToggle } from '../../permissions/PermissionToggle';
import { Plan } from '../../types';
import { FIELD_REGISTRY } from '../../constants';
import { useAppLists } from '../../context/AppListsContext';
import { usePlanData, usePlanActions, usePlanPermissions } from '../PlanCardContext';
import { StreetInput } from '../StreetInput';

const ALL_ROLES = ['GUEST', 'SFTC', 'MOT', 'CR'];
const EDITOR_ROLES = ['MOT', 'CR'];

export const FieldsGrid: React.FC = React.memo(() => {
  const { selectedPlan } = usePlanData();
  const { updatePlanField } = usePlanActions();
  const {
    canView,
    currentUser,
    UserRole,
    isPermissionEditingMode,
    fieldPermissions,
    setFieldPermissions,
    canEditFields,
  } = usePlanPermissions();

  const { scopes, leads } = useAppLists();
  const listOverrides: Record<string, string[]> = { scope: scopes, lead: leads };

  const groups = ['Identification', 'Location', 'Schedule', 'Team & Priority'] as const;

  const renderField = (k: string, v: typeof FIELD_REGISTRY[string]) => {
    // FIELD_REGISTRY uses streetFrom/streetTo but Firestore documents use street1/street2
    const planKey = k === 'streetFrom' ? 'street1' : k === 'streetTo' ? 'street2' : k;
    const fieldKey = planKey as keyof Plan;

    return (
    <div key={k} className="flex flex-col gap-1">
      <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
        {v.label}
        {isPermissionEditingMode && currentUser?.role === UserRole.ADMIN && (
          <PermissionToggle 
            fieldName={v.label}
            allowedEditRoles={fieldPermissions[k]?.edit ?? EDITOR_ROLES}
            allowedViewRoles={fieldPermissions[k]?.view ?? ALL_ROLES}
            onToggleEdit={(role) => setFieldPermissions(prev => { const cur = { view: prev[k]?.view ?? ALL_ROLES, edit: prev[k]?.edit ?? EDITOR_ROLES }; return {...prev, [k]: { view: cur.view, edit: cur.edit.includes(role) ? cur.edit.filter(r => r !== role) : [...cur.edit, role] }}; })}
            onToggleView={(role) => setFieldPermissions(prev => { const cur = { view: prev[k]?.view ?? ALL_ROLES, edit: prev[k]?.edit ?? EDITOR_ROLES }; return {...prev, [k]: { edit: cur.edit, view: cur.view.includes(role) ? cur.view.filter(r => r !== role) : [...cur.view, role] }}; })}
          />
        )}
      </div>
      {canEditFields && (k !== 'lead' || currentUser?.role === UserRole.MOT || currentUser?.role === UserRole.ADMIN) ? (
        v.type === 'select' && v.options ? (
          <select
            value={selectedPlan[fieldKey] as string || ""}
            onChange={(e) => updatePlanField(selectedPlan.id, planKey, e.target.value)}
            className="text-xs font-semibold text-slate-900 bg-white border border-slate-200 rounded-md p-2 w-full"
          >
            {(listOverrides[k] ?? v.options).map(opt => <option key={opt} value={opt}>{opt}</option>)}
          </select>
        ) : v.type === 'checkbox' ? (
          <input
            type="checkbox"
            checked={!!selectedPlan[fieldKey]}
            onChange={(e) => updatePlanField(selectedPlan.id, planKey, e.target.checked)}
            className="mt-1"
          />
        ) : (
          k === 'streetFrom' || k === 'streetTo' ? (
            <StreetInput
              value={selectedPlan[fieldKey] as string || ""}
              onChange={(e) => updatePlanField(selectedPlan.id, planKey, e.target.value)}
            />
          ) : (
            <>
              <input
                type={v.type === 'date' ? 'date' : 'text'}
                value={selectedPlan[fieldKey] as string || ""}
                onChange={(e) => updatePlanField(selectedPlan.id, planKey, e.target.value)}
                className="text-xs font-semibold text-slate-900 bg-white border border-slate-200 rounded-md p-2 w-full"
              />
              {v.type === "date" && selectedPlan[fieldKey] && (currentUser?.role === UserRole.ADMIN || currentUser?.role === UserRole.MOT) && (
                <button
                  onClick={() => updatePlanField(selectedPlan.id, planKey, "")}
                  className="bg-red-50 text-red-700 border-none px-1.5 py-0.5 rounded text-[9px] cursor-pointer mt-0.5"
                >
                  Clear
                </button>
              )}
            </>
          )
        )
      ) : (
        <div className="text-xs font-semibold text-slate-900 p-2 border border-transparent">
          {v.type === 'checkbox' ? (selectedPlan[fieldKey] ? 'Yes' : 'No') : ((selectedPlan[fieldKey] as string) || "—")}
        </div>
      )}
    </div>
    );
  };

  return (
    <div className="pb-4 mb-4 flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4">
        {groups.map(group => (
          <div key={group} className="bg-slate-50 border border-slate-100 rounded-lg p-4">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3">{group}</h3>
            <div className="grid grid-cols-1 gap-3">
              {Object.entries(FIELD_REGISTRY).filter(([k, v]) => v.group === group && canView(k)).map(([k, v]) => renderField(k, v))}
            </div>
          </div>
        ))}
      </div>
      
      <div className="flex flex-wrap gap-4 mt-2 pt-4 border-t border-slate-100">
        {Object.entries(FIELD_REGISTRY).filter(([k]) => ['dir_nb', 'dir_sb', 'dir_directional', 'side_street'].includes(k) && canView(k)).map(([k, v]) => (
          <label key={k} className={`flex items-center gap-2 text-xs text-slate-700 ${canEditFields ? 'cursor-pointer' : 'cursor-default opacity-60'}`}>
            <input
              type="checkbox"
              checked={!!selectedPlan[k as keyof Plan]}
              onChange={(e) => canEditFields && updatePlanField(selectedPlan.id, k, e.target.checked)}
              disabled={!canEditFields}
              className="rounded border-slate-300 text-slate-900 focus:ring-slate-500 disabled:cursor-not-allowed"
            />
            {v.label}
          </label>
        ))}
        <div className="w-px bg-slate-200 self-stretch" />
        <label className={`flex items-center gap-2 text-xs font-semibold text-violet-700 ${canEditFields ? 'cursor-pointer' : 'cursor-default opacity-60'}`}>
          <input
            type="checkbox"
            checked={!!selectedPlan.impact_krail}
            onChange={e => {
              if (!canEditFields) return;
              const checked = e.target.checked;
              updatePlanField(selectedPlan.id, 'impact_krail', checked);
              if (checked && selectedPlan.work_hours?.shift !== 'continuous') {
                updatePlanField(selectedPlan.id, 'work_hours', { shift: 'continuous', days: [] });
              }
            }}
            disabled={!canEditFields}
            className="rounded border-slate-300 accent-violet-600 disabled:cursor-not-allowed"
          />
          Krail
        </label>
      </div>
    </div>
  );
});
