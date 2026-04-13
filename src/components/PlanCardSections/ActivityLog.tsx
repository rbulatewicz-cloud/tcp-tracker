import React, { useState, useRef } from 'react';
import { usePlanData, usePlanActions, usePlanPermissions } from '../PlanCardContext';
import { ConfirmationModal } from '../ConfirmationModal';
import { UserRole } from '../../types';
import { showToast } from '../../lib/toast';

export const ActivityLog: React.FC = React.memo(() => {
  const { selectedPlan, draftPlan, isDirty } = usePlanData();
  const plan = isDirty ? draftPlan : selectedPlan;
  const { addLogEntry, deleteLogEntry } = usePlanActions();
  const { canEditPlan, canView, currentUser } = usePlanPermissions();
  const [newLogEntry, setNewLogEntry] = useState('');
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [confirmDelete, setConfirmDelete] = useState<{isOpen: boolean, index: number | null}>({isOpen: false, index: null});

  if (!plan) return null;

  const isPrivileged = currentUser?.role === UserRole.ADMIN || currentUser?.role === UserRole.MOT;

  const handleAddEntry = async () => {
    if (!newLogEntry.trim() && pendingFiles.length === 0) return;
    setSaving(true);
    const text = newLogEntry.trim();
    const files = [...pendingFiles];
    try {
      await addLogEntry(plan.id, text, files);
      setNewLogEntry('');
      setPendingFiles([]);
      if (files.length > 0) showToast('Entry saved with attachment', 'success');
    } catch (err: any) {
      showToast(`Failed to save: ${err?.message || 'Unknown error'}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="pb-4 mb-4">

      {/* Add Log Entry — available to all authenticated users (non-GUEST) */}
      {canEditPlan && canView('add_log_entry') && (
        <div className="mb-4 pb-4 border-b border-slate-100 dark:border-slate-700 flex flex-col gap-2">
          <textarea
            value={newLogEntry}
            onChange={(e) => setNewLogEntry(e.target.value)}
            className="w-full p-2 border border-slate-200 dark:border-slate-600 rounded-md text-xs bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
            placeholder="Add a log entry or note..."
            rows={2}
          />
          {pendingFiles.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {pendingFiles.map((f, i) => (
                <div key={i} className="flex items-center gap-1 bg-slate-100 border border-slate-200 rounded px-2 py-1 text-[10px] font-semibold text-slate-700">
                  <span className="truncate max-w-[120px]">{f.name}</span>
                  <button
                    onClick={() => setPendingFiles(prev => prev.filter((_, idx) => idx !== i))}
                    className="text-slate-400 hover:text-red-500 border-none bg-transparent cursor-pointer p-0 leading-none"
                  >✕</button>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 border-none cursor-pointer shrink-0"
              title="Attach files"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
              {pendingFiles.length > 0 ? `${pendingFiles.length} file${pendingFiles.length > 1 ? 's' : ''}` : 'Attach'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files || []);
                if (files.length) setPendingFiles(prev => [...prev, ...files]);
                e.target.value = '';
              }}
            />
            <button
              onClick={handleAddEntry}
              disabled={saving || (!newLogEntry.trim() && pendingFiles.length === 0)}
              className="flex-1 bg-slate-900 text-white border-none px-4 py-1.5 rounded-md text-[12px] font-bold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving...' : 'Add Entry'}
            </button>
          </div>
        </div>
      )}


      {/* Log Entries */}
      <div className="flex flex-col gap-2">
        {[...plan.log].reverse().map((entry, index) => {
          const actualIndex = plan.log.length - 1 - index;
          const isTransitionNote = entry.field === 'transition_note';
          // Show paperclip if this is a status change that has attachments in that stage
          const attachmentCount = entry.field === 'stage' && entry.newValue
            ? (plan.stageAttachments || []).filter(a => a.stage === entry.newValue).length
            : 0;

          // Transition notes get a distinct quoted style
          if (isTransitionNote) {
            return (
              <div key={index} className="flex gap-2 items-start pl-1">
                <div className="w-0.5 self-stretch bg-slate-300 dark:bg-slate-600 rounded-full flex-shrink-0 mt-1" />
                <div className="flex-1 py-1">
                  <div className="flex justify-between text-[10px] text-slate-400 dark:text-slate-500 mb-0.5">
                    <span className="flex items-center gap-1">
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                      {entry.user}
                    </span>
                    <span>{entry.date}</span>
                  </div>
                  <p className="m-0 text-[11px] text-slate-600 dark:text-slate-400 italic leading-relaxed">
                    {entry.action}
                  </p>
                </div>
              </div>
            );
          }

          return (
            <div key={index} className="p-2 bg-slate-50 dark:bg-slate-800 rounded-md border border-slate-100 dark:border-slate-700 text-xs flex justify-between items-start">
              <div className="flex-1">
                <div className="flex justify-between text-[10px] text-slate-400 dark:text-slate-500 mb-1">
                  <span>{entry.user}</span>
                  <span>{entry.date}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-800 dark:text-slate-200">{entry.action}</span>
                  {attachmentCount > 0 && (
                    <span title={`${attachmentCount} document${attachmentCount !== 1 ? 's' : ''} attached`} className="text-slate-400 text-[11px]">
                      📎{attachmentCount > 1 ? <span className="text-[9px]">{attachmentCount}</span> : null}
                    </span>
                  )}
                </div>
                {entry.attachments && entry.attachments.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {entry.attachments.map((att: { name: string; data: string }, i: number) => (
                      <a
                        key={i}
                        href={att.data}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-[10px] font-semibold text-indigo-600 hover:text-indigo-800 bg-indigo-50 border border-indigo-100 rounded px-1.5 py-0.5 no-underline"
                      >
                        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
                        {att.name}
                      </a>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex flex-col items-end gap-1">
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
