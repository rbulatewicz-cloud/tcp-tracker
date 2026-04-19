import React, { useEffect, useState, useRef } from 'react';
import {
  Upload, FileWarning, AlertTriangle, ChevronDown, ChevronUp,
  Loader, ClipboardCheck,
} from 'lucide-react';
import {
  subscribeToVariances, uploadAndScanVariance, uploadRevision,
  deleteVariance, retryVarianceScan, getVarianceExpiryStatus, daysUntilExpiry,
  approveVariance, approveAsRevision,
} from '../../services/varianceService';
import { NoiseVariance, User, UserRole, AppConfig, Plan } from '../../types';
import { fmtDate as fmt } from '../../utils/plans';
import { buildFamilies, hasActiveLinkedPlans } from './NoiseVariancesSection/families';
import { ReviewQueueItem } from './NoiseVariancesSection/ReviewQueueItem';
import { VarianceCard } from './NoiseVariancesSection/VarianceCard';

// ── Main section ──────────────────────────────────────────────────────────────

interface NoiseVariancesSectionProps {
  currentUser: User | null;
  appConfig: AppConfig;
  plans: Plan[];
  setSelectedPlan: (plan: Plan | null) => void;
}

export const NoiseVariancesSection: React.FC<NoiseVariancesSectionProps> = ({ currentUser, appConfig, plans, setSelectedPlan }) => {
  const [variances, setVariances] = useState<NoiseVariance[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(true);
  const [alertsOpen, setAlertsOpen] = useState(true);
  const newFileRef = useRef<HTMLInputElement>(null);
  const revFileRef = useRef<HTMLInputElement>(null);
  const pendingRevRootId = useRef<string | null>(null);

  const canManage = currentUser?.role === UserRole.ADMIN || currentUser?.role === UserRole.MOT;

  useEffect(() => subscribeToVariances(setVariances), []);

  const handleNewFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const pdfs = Array.from(files).filter(f => f.type === 'application/pdf');
    if (!pdfs.length) { alert('Only PDF files are accepted.'); return; }
    setUploading(true);
    try {
      for (const f of pdfs) await uploadAndScanVariance(f, currentUser?.name ?? 'Unknown');
    } finally { setUploading(false); }
  };

  const handleRevisionFile = async (files: FileList | null) => {
    const rootId = pendingRevRootId.current;
    if (!files?.length || !rootId) return;
    const file = files[0];
    if (file.type !== 'application/pdf') { alert('Only PDF files are accepted.'); return; }
    setUploading(true);
    try {
      await uploadRevision(file, rootId, currentUser?.name ?? 'Unknown');
    } finally {
      setUploading(false);
      pendingRevRootId.current = null;
    }
  };

  const triggerRevisionUpload = (rootId: string) => {
    pendingRevRootId.current = rootId;
    revFileRef.current?.click();
  };

  const handleDeleteFamily = async (active: NoiseVariance) => {
    const rootId = active.parentVarianceId ?? active.id;
    const family = variances.filter(v => v.id === rootId || v.parentVarianceId === rootId);
    for (const v of family) await deleteVariance(v.id);
  };

  const families = buildFamilies(variances);
  const pendingReview = variances.filter(v => v.scanStatus === 'pending_review');
  const alerts = families
    .map(f => f.active)
    .filter(v => {
      const s = getVarianceExpiryStatus(v);
      if (s !== 'warning' && s !== 'critical' && s !== 'expired') return false;
      // Only flag if this NV is actively backing at least one non-completed plan
      const rootId = v.parentVarianceId ?? v.id;
      return hasActiveLinkedPlans(rootId, plans);
    });
  const scanning = variances.filter(v => v.scanStatus === 'scanning').length;
  const errors   = variances.filter(v => v.scanStatus === 'error').length;

  return (
    <div>
      <input ref={newFileRef} type="file" accept="application/pdf" multiple className="hidden"
        onChange={e => { handleNewFiles(e.target.files); e.target.value = ''; }} />
      <input ref={revFileRef} type="file" accept="application/pdf" className="hidden"
        onChange={e => { handleRevisionFile(e.target.files); e.target.value = ''; }} />

      {/* Section header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Upload variance PDFs — Rafi extracts title, segments, scope, and validity. Revisions auto-archive the previous version.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {families.length > 0 && (
            <div className="flex items-center gap-2 text-[11px]">
              <span className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-700 font-semibold text-slate-600 dark:text-slate-300">
                {families.length} variance{families.length !== 1 ? 's' : ''}
              </span>
              {scanning > 0 && (
                <span className="px-2 py-1 rounded-lg bg-blue-50 font-semibold text-blue-600 flex items-center gap-1">
                  <Loader size={10} className="animate-spin" />{scanning} scanning
                </span>
              )}
              {errors > 0 && (
                <span className="px-2 py-1 rounded-lg bg-red-50 font-semibold text-red-600">
                  {errors} error{errors > 1 ? 's' : ''}
                </span>
              )}
            </div>
          )}
          {canManage && (
            <button
              onClick={() => newFileRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold transition-colors disabled:opacity-50"
            >
              <Upload size={14} />
              {uploading ? 'Uploading…' : 'Upload Variance'}
            </button>
          )}
        </div>
      </div>

      {/* Review Queue */}
      {pendingReview.length > 0 && (
        <div className="mb-6 rounded-xl border-2 border-violet-300 dark:border-violet-700 bg-violet-50 dark:bg-violet-900/20 overflow-hidden">
          <button
            onClick={() => setReviewOpen(o => !o)}
            className="w-full flex items-center gap-2 px-4 py-3 border-b border-violet-200 dark:border-violet-700 bg-violet-100 dark:bg-violet-900/40 text-left"
          >
            <ClipboardCheck size={15} className="text-violet-600 dark:text-violet-400 flex-shrink-0" />
            <span className="text-sm font-bold text-violet-800 dark:text-violet-200">
              {pendingReview.length} document{pendingReview.length > 1 ? 's' : ''} pending review
            </span>
            <span className="text-xs text-violet-500 dark:text-violet-400 ml-1 flex-1">
              — AI flagged these before publishing. Confirm or redirect each one.
            </span>
            {reviewOpen ? <ChevronUp size={14} className="text-violet-500 flex-shrink-0" /> : <ChevronDown size={14} className="text-violet-500 flex-shrink-0" />}
          </button>
          {reviewOpen && (
            <div className="divide-y divide-violet-100 dark:divide-violet-800">
              {pendingReview.map(v => (
                <ReviewQueueItem
                  key={v.id}
                  variance={v}
                  allVariances={variances}
                  onApproveNew={() => approveVariance(v.id)}
                  onApproveRevision={(targetId) => approveAsRevision(v.id, targetId)}
                  onDelete={() => deleteVariance(v.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Expiry alerts */}
      {alerts.length > 0 && (
        <div className="mb-6 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 overflow-hidden">
          <button
            onClick={() => setAlertsOpen(o => !o)}
            className="w-full flex items-center gap-2 px-4 py-3 text-left"
          >
            <AlertTriangle size={14} className="text-amber-500 flex-shrink-0" />
            <span className="text-sm font-bold text-amber-800 dark:text-amber-300 flex-1">
              {alerts.length} variance{alerts.length > 1 ? 's' : ''} need{alerts.length === 1 ? 's' : ''} attention
            </span>
            {alertsOpen ? <ChevronUp size={14} className="text-amber-500 flex-shrink-0" /> : <ChevronDown size={14} className="text-amber-500 flex-shrink-0" />}
          </button>
          {alertsOpen && (
            <div className="px-4 pb-4 space-y-2">
              {alerts.map(v => {
                const s = getVarianceExpiryStatus(v);
                const d = daysUntilExpiry(v);
                const isExpired = s === 'expired';
                const isCritical = s === 'critical';
                return (
                  <div key={v.id} className={`flex items-center justify-between gap-3 px-3 py-2 rounded-lg border ${isExpired ? 'bg-red-50 border-red-200' : isCritical ? 'bg-red-50 border-red-100' : 'bg-amber-50 border-amber-100'}`}>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">{v.title || v.fileName}</div>
                      <div className="text-[10px] text-slate-500">
                        Segments: {v.coveredSegments.join(', ') || '—'} · Expires: {fmt(v.validThrough)}
                        {(v.revisionNumber ?? 0) > 0 && <span className="ml-1 text-indigo-500">· Rev {v.revisionNumber}</span>}
                      </div>
                    </div>
                    <div className="flex-shrink-0">
                      {isExpired
                        ? <span className="text-[11px] font-bold text-red-600">EXPIRED</span>
                        : <span className="text-[11px] font-bold text-amber-700">{d}d remaining</span>
                      }
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Empty drop zone */}
      {families.length === 0 && canManage && (
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); handleNewFiles(e.dataTransfer.files); }}
          onClick={() => newFileRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-16 flex flex-col items-center justify-center gap-3 cursor-pointer transition-all ${
            dragOver ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 dark:border-slate-700 hover:border-indigo-300 hover:bg-slate-50 dark:hover:bg-slate-800/50'
          }`}
        >
          <Upload size={32} className={dragOver ? 'text-indigo-400' : 'text-slate-300'} />
          <div className="text-center">
            <div className="text-sm font-bold text-slate-700 dark:text-slate-300">Drop variance PDFs here</div>
            <div className="text-xs text-slate-400 mt-1">Rafi extracts title, segments, scope, and validity dates automatically</div>
          </div>
        </div>
      )}

      {/* Compact drop strip */}
      {families.length > 0 && canManage && (
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); handleNewFiles(e.dataTransfer.files); }}
          onClick={() => newFileRef.current?.click()}
          className={`mb-4 border-2 border-dashed rounded-xl px-4 py-3 flex items-center gap-3 cursor-pointer transition-all text-xs ${
            dragOver ? 'border-indigo-400 bg-indigo-50 text-indigo-600' : 'border-slate-200 dark:border-slate-700 text-slate-400 hover:border-slate-300'
          }`}
        >
          <Upload size={14} />
          <span>Drop new variance PDFs here, or use <strong>Upload Revision</strong> on a card to renew an existing one</span>
        </div>
      )}

      {/* Variance grid */}
      {families.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {families.map(({ rootId, active, history }) => (
            <VarianceCard
              key={rootId}
              active={active}
              history={history}
              canManage={canManage}
              onDelete={handleDeleteFamily}
              onRetry={retryVarianceScan}
              onUploadRevision={triggerRevisionUpload}
              appConfig={appConfig}
              plans={plans}
              setSelectedPlan={setSelectedPlan}
            />
          ))}
        </div>
      )}

      {families.length === 0 && !canManage && (
        <div className="text-center py-16 text-slate-400 dark:text-slate-500">
          <FileWarning size={32} className="mx-auto mb-3 opacity-30" />
          <div className="text-sm font-semibold">No variances in library yet</div>
          <div className="text-xs mt-1">An admin or MOT member will add variance documents here.</div>
        </div>
      )}
    </div>
  );
};
