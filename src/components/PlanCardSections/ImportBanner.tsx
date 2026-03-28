import React, { useState } from 'react';
import { usePlanData, usePlanActions, usePlanPermissions } from '../PlanCardContext';
import { showToast } from '../../lib/toast';

export const ImportBanner: React.FC = React.memo(() => {
  const { selectedPlan } = usePlanData();
  const { assignLocToTBD, updatePlanField } = usePlanActions();
  const { currentUser, UserRole } = usePlanPermissions();

  const [showAssignModal, setShowAssignModal] = useState(false);
  const [customLoc, setCustomLoc] = useState('');
  const [loading, setLoading] = useState(false);

  if (!selectedPlan) return null;

  const isImported = selectedPlan.importStatus === 'needs_review';
  const isTBD = selectedPlan.locStatus === 'unassigned';
  const canEdit = currentUser?.role === UserRole.ADMIN || currentUser?.role === UserRole.MOT;

  if (!isImported && !isTBD) return null;

  const handleAssignLoc = async () => {
    setLoading(true);
    try {
      const assigned = await assignLocToTBD(selectedPlan.id, customLoc || null);
      showToast(`LOC ${assigned} assigned successfully.`, 'success');
      setShowAssignModal(false);
      setCustomLoc('');
    } catch {
      showToast('Failed to assign LOC number. Please try again.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleMarkReviewed = async () => {
    await updatePlanField(selectedPlan.id, 'importStatus', 'active', false);
    await updatePlanField(selectedPlan.id, 'pendingDocuments', false, false);
    showToast('Plan marked as reviewed.', 'success');
  };

  return (
    <>
      {/* Assign LOC modal */}
      {showAssignModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/50 p-5 backdrop-blur-sm">
          <div className="w-full max-w-[380px] rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="text-lg font-bold text-slate-900 mb-1">Assign LOC Number</h2>
            <p className="text-xs text-slate-500 mb-4">
              Leave blank to auto-assign the next available number. ADMIN and MOT can enter a custom LOC.
            </p>
            <div className="mb-4">
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">LOC Number</label>
              <input
                type="text"
                value={customLoc}
                onChange={e => setCustomLoc(e.target.value)}
                placeholder="Auto-assign next number"
                className="w-full rounded-lg border border-slate-200 p-2 text-sm"
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => { setShowAssignModal(false); setCustomLoc(''); }}
                className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-200"
              >
                Cancel
              </button>
              <button
                onClick={handleAssignLoc}
                disabled={loading}
                className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-white hover:bg-amber-600 disabled:opacity-50"
              >
                {loading ? 'Assigning…' : 'Assign LOC'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Banner */}
      <div
        style={{
          background: isTBD ? '#FFFBEB' : '#F0F9FF',
          borderBottom: `1px solid ${isTBD ? '#FDE68A' : '#BAE6FD'}`,
          padding: '10px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14 }}>{isTBD ? '⏳' : '⚑'}</span>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: isTBD ? '#92400E' : '#0369A1' }}>
              {isTBD ? 'LOC Pending Assignment' : 'Imported — Needs Review'}
            </div>
            {selectedPlan.importBatchId && (
              <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 1 }}>
                Batch: {selectedPlan.importBatchId.replace('import_', '').replace(/_/g, ' ')}
              </div>
            )}
          </div>
        </div>

        {canEdit && (
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            {isTBD && (
              <button
                onClick={() => setShowAssignModal(true)}
                style={{ background: '#F59E0B', color: '#fff', border: 'none', borderRadius: 8, padding: '5px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
              >
                Assign LOC
              </button>
            )}
            {isImported && !isTBD && (
              <button
                onClick={handleMarkReviewed}
                style={{ background: '#0EA5E9', color: '#fff', border: 'none', borderRadius: 8, padding: '5px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
              >
                Mark Reviewed
              </button>
            )}
          </div>
        )}
      </div>
    </>
  );
});
