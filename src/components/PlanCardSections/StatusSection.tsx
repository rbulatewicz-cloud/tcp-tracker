import React, { useState } from 'react';
import { usePlanData, usePlanActions, usePlanPermissions, usePlanUtils } from '../PlanCardContext';
import { PermissionToggle } from '../../permissions/PermissionToggle';
import { STAGES } from '../../constants';
import { showToast } from '../../lib/toast';

export const StatusSection: React.FC = React.memo(() => {
  const { selectedPlan } = usePlanData();
  const { updateStage } = usePlanActions();
  const { getLocalDateString } = usePlanUtils();
  const { 
    canEditPlan, 
    isPermissionEditingMode, 
    currentUser, 
    UserRole, 
    fieldPermissions, 
    setFieldPermissions 
  } = usePlanPermissions();
  
  if (!selectedPlan) return null;
  
  const [loadingStage, setLoadingStage] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [pendingStatusKey, setPendingStatusKey] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(getLocalDateString());

  const statusConfig = [
    { label: 'Requested', key: 'requested', color: STAGES[0].color },
    { label: 'Drafting', key: 'drafting', color: STAGES[1].color },
    { label: 'Submitted', key: 'submitted', color: STAGES[2].color },
    { label: 'Approved', key: 'approved', color: STAGES[3].color },
  ];

  const stage = selectedPlan.stage || '';
  const activeIndex = statusConfig.findIndex(s => s.key === stage);

  const handleStatusClick = (statusKey: string) => {
    if (!canEditPlan || (currentUser?.role !== UserRole.ADMIN && currentUser?.role !== UserRole.MOT)) {
      return;
    }
    setPendingStatusKey(statusKey);
    setSelectedDate(getLocalDateString());
    setIsModalOpen(true);
  };

  const handleConfirmStatusChange = async () => {
    if (!pendingStatusKey) return;
    
    setLoadingStage(pendingStatusKey);
    setIsModalOpen(false);
    try {
      await updateStage(selectedPlan.id, pendingStatusKey, selectedDate);
    } catch (error) {
      console.error("Failed to update stage:", error);
      showToast("Failed to update stage. Please try again.", "error");
    } finally {
      setLoadingStage(null);
      setPendingStatusKey(null);
    }
  };

  return (
    <div className="pb-0 mb-0">
      {isModalOpen && (
        <div className="fixed inset-0 z-100 flex items-center justify-center bg-slate-900/50 p-5 backdrop-blur-sm">
          <div className="w-full max-w-[400px] rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="text-lg font-bold text-slate-900 mb-2">Confirm Status Change</h2>
            <p className="text-sm text-slate-600 mb-4">
              Change status to <strong>{statusConfig.find(s => s.key === pendingStatusKey)?.label}</strong>?
            </p>
            <div className="mb-6">
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Date</label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                disabled={currentUser?.role !== UserRole.ADMIN && currentUser?.role !== UserRole.MOT}
                className="w-full rounded-lg border border-slate-200 p-2 text-sm"
              />
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setIsModalOpen(false)} className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-500">Cancel</button>
              <button onClick={handleConfirmStatusChange} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white">Confirm</button>
            </div>
          </div>
        </div>
      )}
      {isPermissionEditingMode && currentUser?.role === UserRole.ADMIN && (
        <div className="mb-2">
          <PermissionToggle 
            fieldName="Status"
            allowedEditRoles={fieldPermissions['status']?.edit ?? ['MOT', 'CR']}
            allowedViewRoles={fieldPermissions['status']?.view ?? ['GUEST', 'SFTC', 'MOT', 'CR']}
            onToggleEdit={(role) => setFieldPermissions(prev => { const cur = { view: prev.status?.view ?? ['GUEST','SFTC','MOT','CR'], edit: prev.status?.edit ?? ['MOT','CR'] }; return {...prev, status: { view: cur.view, edit: cur.edit.includes(role) ? cur.edit.filter((r:string) => r !== role) : [...cur.edit, role] }}; })}
            onToggleView={(role) => setFieldPermissions(prev => { const cur = { view: prev.status?.view ?? ['GUEST','SFTC','MOT','CR'], edit: prev.status?.edit ?? ['MOT','CR'] }; return {...prev, status: { edit: cur.edit, view: cur.view.includes(role) ? cur.view.filter((r:string) => r !== role) : [...cur.view, role] }}; })}
          />
        </div>
      )}
      <div className="flex rounded-md border border-slate-200 overflow-hidden mb-3">
        {statusConfig.map((status, index) => (
          <button
            key={status.key}
            onClick={() => handleStatusClick(status.key)}
            disabled={loadingStage === status.key || status.key === selectedPlan.stage || !canEditPlan || (currentUser?.role !== UserRole.ADMIN && currentUser?.role !== UserRole.MOT)}
            className={`flex-1 text-center py-1.5 text-[11px] font-bold transition-colors ${
              index === activeIndex
                ? 'text-white'
                : 'text-slate-500 bg-white hover:bg-slate-50'
            } ${index !== 0 ? 'border-l border-slate-200' : ''} ${
              (canEditPlan && (currentUser?.role === UserRole.ADMIN || currentUser?.role === UserRole.MOT) && status.key !== selectedPlan.stage) 
                ? 'cursor-pointer' 
                : 'cursor-default'
            } disabled:opacity-50`}
            style={index === activeIndex ? { backgroundColor: status.color } : {}}
          >
            {loadingStage === status.key ? '...' : status.label}
          </button>
        ))}
      </div>
    </div>
  );
});
