import React, { useMemo, useState } from 'react';
import { MapPin, Plus, X } from 'lucide-react';
import { PermissionToggle } from '../../permissions/PermissionToggle';
import { Plan } from '../../types';
import { FIELD_REGISTRY } from '../../constants';
import { useAppLists } from '../../context/AppListsContext';
import { usePlanData, usePlanActions, usePlanPermissions } from '../PlanCardContext';
import { StreetInput } from '../StreetInput';
import { getStreetsBetween, sortStreetsByCorridorOrder } from '../../utils/corridor';

const ALL_ROLES = ['GUEST', 'SFTC', 'MOT', 'CR'];
const EDITOR_ROLES = ['MOT', 'CR'];

// ── Street Coverage Section ───────────────────────────────────────────────────

function StreetCoverageSection({
  plan,
  canEdit,
  onSave,
}: {
  plan: Plan;
  canEdit: boolean;
  onSave: (streets: string[]) => void;
}) {
  const [streetInput, setStreetInput] = useState('');
  const [adding, setAdding] = useState(false);

  const computed = getStreetsBetween(plan.street1 || '', plan.street2 || '');
  const saved = plan.expandedStreets;
  const isRange = computed.length > 1;
  const hasSaved = Array.isArray(saved) && saved.length > 0; // true once user has confirmed/edited with actual streets

  // Only render when a corridor range is detectable or streets were previously saved
  if (!isRange && !hasSaved) return null;

  // Display list: use saved if confirmed, otherwise show computed as a preview
  // Always sort south→north regardless of source
  const rawDisplayList = hasSaved ? saved! : computed;
  const streets = sortStreetsByCorridorOrder(rawDisplayList);
  const isPreview = !hasSaved; // showing auto-computed, not yet saved to Firestore

  const removeStreet = (st: string) => {
    const updated = sortStreetsByCorridorOrder(rawDisplayList.filter(s => s !== st));
    onSave(updated);
  };

  const addStreet = () => {
    const t = streetInput.trim();
    if (!t || rawDisplayList.includes(t)) { setStreetInput(''); setAdding(false); return; }
    onSave(sortStreetsByCorridorOrder([...rawDisplayList, t]));
    setStreetInput(''); setAdding(false);
  };

  return (
    <div className="bg-slate-50 border border-slate-100 rounded-lg p-4">
      <div className="flex items-center justify-between gap-2 mb-2">
        <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
          <MapPin size={11} className="text-sky-500" />
          Street Coverage
          {isPreview && (
            <span className="text-[9px] font-semibold text-slate-400 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded normal-case">
              Auto-detected · not saved
            </span>
          )}
        </h3>
        <div className="flex items-center gap-1.5">
          {canEdit && isRange && isPreview && (
            <button
              onClick={() => onSave(sortStreetsByCorridorOrder(computed))}
              className="text-[10px] font-bold text-sky-600 hover:text-sky-700 flex items-center gap-1 border border-sky-200 bg-sky-50 hover:bg-sky-100 rounded-md px-2 py-1 transition-colors"
            >
              <Plus size={10} />
              Confirm &amp; Save
            </button>
          )}
          {canEdit && hasSaved && isRange && (
            <button
              onClick={() => onSave(sortStreetsByCorridorOrder(computed))}
              className="text-[9px] font-semibold text-slate-400 hover:text-sky-600 transition-colors"
            >
              Reset to corridor
            </button>
          )}
        </div>
      </div>

      {/* Range label */}
      {isRange && (
        <div className="flex items-center gap-1 text-[10px] text-slate-500 mb-2">
          <span className="font-semibold text-sky-700">{plan.street1}</span>
          <span className="text-slate-300 mx-0.5">→</span>
          <span className="font-semibold text-sky-700">{plan.street2}</span>
          <span className="text-slate-400 ml-0.5">· {computed.length} cross streets along corridor</span>
        </div>
      )}

      {/* Street chips — always sorted south→north */}
      <div className="flex flex-wrap gap-1">
        {streets.map((st, i) => (
          <span
            key={i}
            className={`group inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border ${
              isPreview
                ? 'bg-white text-slate-500 border-slate-200 border-dashed'
                : 'bg-sky-50 text-sky-700 border-sky-200'
            }`}
          >
            {st}
            {canEdit && !isPreview && (
              <button
                onClick={() => removeStreet(st)}
                className="opacity-0 group-hover:opacity-100 hover:text-red-500 transition-all ml-0.5 leading-none"
              >
                <X size={9} />
              </button>
            )}
          </span>
        ))}

        {/* Add button — only shown when streets are confirmed (not preview) */}
        {canEdit && !isPreview && (
          adding ? (
            <span className="inline-flex items-center gap-1">
              <input
                autoFocus
                value={streetInput}
                onChange={e => setStreetInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') addStreet();
                  if (e.key === 'Escape') { setAdding(false); setStreetInput(''); }
                }}
                placeholder="Street name…"
                className="text-[10px] px-1.5 py-0.5 rounded border border-sky-300 bg-white w-28 outline-none focus:border-sky-400"
              />
              <button onClick={addStreet} className="text-[10px] font-bold text-sky-600 hover:text-sky-800 transition-colors">Add</button>
              <button onClick={() => { setAdding(false); setStreetInput(''); }} className="text-[10px] text-slate-400 hover:text-slate-600 transition-colors">Cancel</button>
            </span>
          ) : (
            <button
              onClick={() => setAdding(true)}
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold text-slate-400 hover:text-sky-600 border border-dashed border-slate-300 hover:border-sky-300 transition-colors"
            >
              <Plus size={9} /> Add
            </button>
          )
        )}

        {streets.length === 0 && (
          <p className="text-[10px] text-slate-400 italic">No streets set.</p>
        )}
      </div>

      {isPreview && canEdit && (
        <p className="text-[9px] text-slate-400 mt-1.5 italic">
          These streets are auto-detected from the corridor — click "Confirm &amp; Save" to lock them in and improve variance matching.
        </p>
      )}
    </div>
  );
}

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

  const hasConfirmedWindow = !!selectedPlan.implementationWindow?.startDate;

  const estimatedEndDate = useMemo(() => {
    if (!selectedPlan.needByDate || !selectedPlan.planDurationDays) return null;
    const d = new Date(selectedPlan.needByDate + 'T00:00:00');
    d.setDate(d.getDate() + selectedPlan.planDurationDays);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  }, [selectedPlan.needByDate, selectedPlan.planDurationDays]);

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

              {group === 'Schedule' && (
                <>
                  {/* Plan Duration */}
                  <div className="flex flex-col gap-1">
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Plan Duration</div>
                    {canEditFields ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="1"
                          max="365"
                          value={selectedPlan.planDurationDays ?? ''}
                          onChange={e => updatePlanField(selectedPlan.id, 'planDurationDays', e.target.value ? parseInt(e.target.value, 10) : null)}
                          placeholder="—"
                          className="text-xs font-semibold text-slate-900 bg-white border border-slate-200 rounded-md p-2 w-20 outline-none focus:border-blue-400"
                        />
                        <span className="text-[11px] text-slate-500">days</span>
                      </div>
                    ) : (
                      <div className="text-xs font-semibold text-slate-900 p-2 border border-transparent">
                        {selectedPlan.planDurationDays ? `${selectedPlan.planDurationDays} days` : '—'}
                      </div>
                    )}
                  </div>

                  {/* Estimated / Confirmed End Date */}
                  {(estimatedEndDate || hasConfirmedWindow) && (
                    <div className="flex flex-col gap-1 pt-1 border-t border-slate-200">
                      <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                        Est. End Date
                        {hasConfirmedWindow && (
                          <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-1 py-0.5 rounded">
                            Confirmed
                          </span>
                        )}
                      </div>
                      <div className={`text-xs font-semibold p-2 border border-transparent ${hasConfirmedWindow ? 'text-emerald-700' : 'text-amber-700'}`}>
                        {hasConfirmedWindow
                          ? new Date(selectedPlan.implementationWindow!.endDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
                          : estimatedEndDate}
                      </div>
                      <p className="text-[9px] text-slate-400 italic leading-relaxed">
                        {hasConfirmedWindow
                          ? 'From confirmed implementation window.'
                          : 'Estimate only — will update when LOC is approved.'}
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        ))}
      </div>
      
      {/* Street Coverage — auto-expand cross streets between street1 → street2 on the corridor */}
      <StreetCoverageSection
        plan={selectedPlan}
        canEdit={canEditFields}
        onSave={streets => updatePlanField(selectedPlan.id, 'expandedStreets', streets)}
      />

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
