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
    toggleSectionPermission,
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
            onToggleEdit={(role) => toggleSectionPermission(['notes'], role, 'edit')}
            onToggleView={(role) => toggleSectionPermission(['notes'], role, 'view')}
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
