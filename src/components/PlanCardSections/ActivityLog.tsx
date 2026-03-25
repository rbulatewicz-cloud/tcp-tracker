import React, { useState } from 'react';
import { usePlanData, usePlanActions, usePlanPermissions, usePlanUtils } from '../PlanCardContext';
import { ConfirmationModal } from '../ConfirmationModal';
import { UserRole } from '../../types';

export const ActivityLog: React.FC = React.memo(() => {
  const { selectedPlan, draftPlan, isDirty } = usePlanData();
  const plan = isDirty ? draftPlan : selectedPlan;
  const { addLogEntry, revertLogEntry, deleteLogEntry } = usePlanActions();
  const { canEditPlan, canView, currentUser } = usePlanPermissions();
  const [newLogEntry, setNewLogEntry] = useState('');
  const { getLocalDateString } = usePlanUtils();
  const [confirmDelete, setConfirmDelete] = useState<{isOpen: boolean, index: number | null}>({isOpen: false, index: null});

  if (!plan) return null;

  const isPrivileged = currentUser?.role === UserRole.ADMIN || currentUser?.role === UserRole.MOT;

  return (
    <div className="pb-4 mb-4">
      
      {/* Add Log Entry */}
      {canEditPlan && canView('add_log_entry') && (
        <div className="mb-4 pb-4 border-b border-slate-100 flex gap-2">
          <textarea 
            value={newLogEntry}
            onChange={(e) => setNewLogEntry(e.target.value)}
            className="flex-1 p-2 border border-slate-200 rounded-md text-xs"
            placeholder="Add a log entry..."
          />
          <button 
            onClick={() => {
              addLogEntry(plan.id, newLogEntry, []);
              setNewLogEntry('');
            }}
            className="bg-slate-900 text-white border-none px-4 py-2 rounded-md text-[12px] font-bold cursor-pointer shrink-0"
          >
            Add Entry
          </button>
        </div>
      )}


      {/* Log Entries */}
      <div className="flex flex-col gap-2">
        {[...plan.log].reverse().map((entry, index) => {
          const actualIndex = plan.log.length - 1 - index;
          const canRevert = entry.field && entry.previousValue !== undefined;
          return (
            <div key={index} className="p-2 bg-slate-50 rounded-md border border-slate-100 text-xs flex justify-between items-start">
              <div className="flex-1">
                <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                  <span>{entry.user}</span>
                  <span>{entry.date}</span>
                </div>
                <div className="text-slate-800">{entry.action}</div>
              </div>
              <div className="flex flex-col items-end gap-1">
                {canRevert && canEditPlan && (
                  <button
                    onClick={() => revertLogEntry(plan.id, entry.uniqueId)}
                    className="text-[10px] text-amber-600 hover:text-amber-800 font-bold"
                  >
                    Revert
                  </button>
                )}
                {isPrivileged && (
                  <button
                    onClick={() => setConfirmDelete({isOpen: true, index: actualIndex})}
                    className="text-[10px] text-red-600 hover:text-red-800 font-bold"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <ConfirmationModal 
        isOpen={confirmDelete.isOpen}
        onClose={() => setConfirmDelete({isOpen: false, index: null})}
        onConfirm={() => {
          if (confirmDelete.index !== null) {
            deleteLogEntry(plan.id, String(confirmDelete.index));
          }
        }}
        title="Delete Log Entry"
        message="Are you sure you want to delete this log entry? This action cannot be undone."
      />

    </div>
  );
});
