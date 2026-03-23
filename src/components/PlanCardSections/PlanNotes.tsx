import React from 'react';
import { PermissionToggle } from '../../permissions/PermissionToggle';
import { usePlanData, usePlanActions, usePlanPermissions } from '../PlanCardContext';

export const PlanNotes: React.FC = React.memo(() => {
  const { selectedPlan } = usePlanData();
  const { updatePlanField } = usePlanActions();
  const {
    canView,
    canEditPlan,
    isPermissionEditingMode,
    currentUser,
    UserRole,
    fieldPermissions,
    setFieldPermissions,
  } = usePlanPermissions();

  if (!canView('notes')) return null;

  return canEditPlan ? (
    <div className="pb-4 mb-4">
      <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1">
        {isPermissionEditingMode && currentUser?.role === UserRole.ADMIN && (
          <PermissionToggle 
            fieldName="Notes"
            allowedEditRoles={fieldPermissions['notes']?.edit ?? ['MOT', 'CR']}
            allowedViewRoles={fieldPermissions['notes']?.view ?? ['GUEST', 'SFTC', 'MOT', 'CR']}
            onToggleEdit={(role) => setFieldPermissions(prev => { const cur = { view: prev.notes?.view ?? ['GUEST','SFTC','MOT','CR'], edit: prev.notes?.edit ?? ['MOT','CR'] }; return {...prev, notes: { view: cur.view, edit: cur.edit.includes(role) ? cur.edit.filter(r => r !== role) : [...cur.edit, role] }}; })}
            onToggleView={(role) => setFieldPermissions(prev => { const cur = { view: prev.notes?.view ?? ['GUEST','SFTC','MOT','CR'], edit: prev.notes?.edit ?? ['MOT','CR'] }; return {...prev, notes: { edit: cur.edit, view: cur.view.includes(role) ? cur.view.filter(r => r !== role) : [...cur.view, role] }}; })}
          />
        )}
      </div>
      <textarea 
        value={selectedPlan.notes || ""} 
        onChange={(e) => updatePlanField(selectedPlan.id, "notes", e.target.value)}
        className="w-full bg-white rounded-md p-2 text-xs text-slate-900 border border-slate-200 min-h-[80px]"
        placeholder="Additional details..."
      />
    </div>
  ) : (
    selectedPlan.notes && (
      <div className="pb-4 mb-4">
        <div className="bg-white rounded-md p-2 text-xs text-slate-900 border border-slate-200">
          {selectedPlan.notes}
        </div>
      </div>
    )
  );
});
