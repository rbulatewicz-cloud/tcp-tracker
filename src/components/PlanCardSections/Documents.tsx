import React, { useRef, useState } from 'react';
import { usePlanData, usePlanActions, usePlanPermissions } from '../PlanCardContext';
import { DocumentViewer } from '../DocumentViewer';
import { StageAttachment, PlanDocument } from '../../types';
import { ALL_STAGES } from '../../constants';
import { showToast } from '../../lib/toast';

const DOC_TYPE_LABELS: Record<StageAttachment['documentType'], string> = {
  tcp_drawings:      'TCP Drawings',
  loc_draft:         'LOC Draft',
  loc_signed:        'Signed LOC ★',
  dot_comments:      'DOT Comments',
  revision_package:  'Revision Package',
  approval_letter:   'Approval Letter',
  other:             'Other',
};

const DOC_TYPES: { value: StageAttachment['documentType']; label: string; primaryEligible?: boolean }[] = [
  { value: 'tcp_drawings',     label: 'TCP Drawings' },
  { value: 'loc_draft',        label: 'LOC Draft' },
  { value: 'loc_signed',       label: 'Signed LOC ★', primaryEligible: true },
  { value: 'dot_comments',     label: 'DOT Comments' },
  { value: 'revision_package', label: 'Revision Package' },
  { value: 'approval_letter',  label: 'Approval Letter' },
  { value: 'other',            label: 'Other' },
];

export const Documents: React.FC = React.memo(() => {
  const { selectedPlan } = usePlanData();
  const { uploadTCPRevision, linkNewLOC, deleteDocument, uploadStageAttachment } = usePlanActions();
  const { currentUser, UserRole, canEditPlan } = usePlanPermissions();
  const canDelete = currentUser?.role === UserRole.MOT || currentUser?.role === UserRole.ADMIN;
  const canUpload = currentUser?.role === UserRole.MOT || currentUser?.role === UserRole.ADMIN;
  const tcpInputRef = useRef<HTMLInputElement>(null);
  const locInputRef = useRef<HTMLInputElement>(null);
  const stageFileRef = useRef<HTMLInputElement>(null);
  const [expanded, setExpanded] = useState<{ tcp: boolean; loc: boolean }>({ tcp: false, loc: false });
  const [expandedStages, setExpandedStages] = useState<Record<string, boolean>>({});
  const [viewingDoc, setViewingDoc] = useState<{ url: string; name: string } | null>(null);
  const [showAddDoc, setShowAddDoc] = useState(false);
  const [addDocStage, setAddDocStage] = useState(selectedPlan.stage || 'requested');
  const [addDocType, setAddDocType] = useState<StageAttachment['documentType']>('tcp_drawings');
  const [addDocPrimary, setAddDocPrimary] = useState(false);
  const [addDocFile, setAddDocFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const handleStageUpload = async () => {
    if (!addDocFile) { showToast('Select a file first.', 'warning'); return; }
    setUploading(true);
    try {
      await uploadStageAttachment(selectedPlan.id, addDocFile, addDocStage, addDocType, addDocPrimary);
      showToast('Document attached.', 'success');
      setShowAddDoc(false);
      setAddDocFile(null);
      setAddDocPrimary(false);
    } catch {
      showToast('Upload failed. Please try again.', 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleTCPUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) uploadTCPRevision(selectedPlan.id, e.target.files[0]);
  };
  const handleLOCLink = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) linkNewLOC(selectedPlan.id, e.target.files[0]);
  };

  const renderDocHistory = (docs: PlanDocument[], type: 'tcp' | 'loc') => {
    if (!docs || docs.length === 0)
      return <span className="text-[11px] italic text-slate-400">No {type.toUpperCase()}s uploaded yet.</span>;

    const sorted = [...docs].sort((a, b) => b.version - a.version);
    const current = sorted[0];
    const older = sorted.slice(1);

    return (
      <div className="flex flex-col gap-1">
        <div className="text-xs text-slate-800 font-medium flex items-center gap-2 flex-wrap">
          <span className="text-slate-500">Current:</span>
          <button onClick={() => setViewingDoc({ url: current.url, name: current.name })} className="text-teal-600 hover:underline truncate max-w-[200px]">
            {current.name}
          </button>
          <span className="text-slate-400">(v{current.version})</span>
          {canDelete && (
            <button onClick={() => deleteDocument(selectedPlan.id, current.id, type, selectedPlan)} className="text-[10px] text-red-500 hover:underline">
              Delete
            </button>
          )}
        </div>
        {older.length > 0 && (
          <>
            <button
              onClick={() => setExpanded(prev => ({ ...prev, [type]: !prev[type] }))}
              className="text-[10px] text-slate-500 font-bold hover:underline self-start"
            >
              {expanded[type] ? 'Hide History' : `Show ${older.length} older version${older.length > 1 ? 's' : ''}`}
            </button>
            {expanded[type] && (
              <div className="pl-4 flex flex-col gap-1 border-l-2 border-slate-200">
                {older.map(d => (
                  <div key={d.id} className="text-[11px] text-slate-600 flex items-center gap-2">
                    <span className="text-slate-400">v{d.version}:</span>
                    <button onClick={() => setViewingDoc({ url: d.url, name: d.name })} className="text-slate-600 hover:underline truncate max-w-[180px]">
                      {d.name}
                    </button>
                    {canDelete && (
                      <button onClick={() => deleteDocument(selectedPlan.id, d.id, type, selectedPlan)} className="text-[10px] text-red-500 hover:underline">
                        Delete
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  // Group stage attachments by stage key
  const stageAttachments = selectedPlan.stageAttachments || [];
  const attachmentsByStage = stageAttachments.reduce<Record<string, StageAttachment[]>>((acc, a) => {
    (acc[a.stage] = acc[a.stage] || []).push(a);
    return acc;
  }, {});
  const stageKeys = Object.keys(attachmentsByStage);

  const getStageLabelForKey = (key: string) =>
    ALL_STAGES.find(s => s.key === key)?.label ?? key;

  return (
    <div className="pb-4 mb-4 flex flex-col gap-5">
      {/* Pending documents warning */}
      {selectedPlan.pendingDocuments && (
        <div className="px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
          <span className="text-amber-500 text-sm mt-0.5">⚠</span>
          <div>
            <div className="text-[11px] font-bold text-amber-700">Pending Documents</div>
            <div className="text-[10px] text-amber-600 mt-0.5">
              Please upload the signed LOC and TCP drawings to complete this record.
            </div>
          </div>
        </div>
      )}

      {/* Draft Plans — attachments from the original request */}
      {selectedPlan.attachments && selectedPlan.attachments.length > 0 && (
        <div>
          <div className="text-xs font-extrabold text-slate-800 uppercase tracking-wide mb-2 pb-1.5 border-b border-slate-200">Draft Plans</div>
          <div className="flex flex-col gap-1">
            {selectedPlan.attachments.map((att, i) => (
              <div key={i} className="text-xs text-slate-700 flex items-center gap-2">
                <span className="text-slate-400">📄</span>
                <button
                  onClick={() => setViewingDoc({ url: att.data, name: att.name })}
                  className="text-teal-600 hover:underline truncate max-w-[220px]"
                >
                  {att.name}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stage Attachments — documents attached at each workflow step */}
      <div className="pt-3 mt-1 border-t border-slate-100">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-extrabold text-slate-800 uppercase tracking-wide pb-1.5 border-b border-slate-200">Submission Documents</div>
          {canUpload && (
            <button
              onClick={() => { setShowAddDoc(v => !v); setAddDocStage(selectedPlan.stage || 'requested'); }}
              className="text-[10px] font-bold text-teal-600 hover:underline"
            >
              {showAddDoc ? 'Cancel' : '+ Add Document'}
            </button>
          )}
        </div>

        {/* Add document panel */}
        {showAddDoc && (
          <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-3 flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Stage</div>
                <select
                  value={addDocStage}
                  onChange={e => setAddDocStage(e.target.value)}
                  className="text-xs font-semibold text-slate-800 bg-white border border-slate-200 rounded-md p-1.5 w-full"
                >
                  {ALL_STAGES.map(s => (
                    <option key={s.key} value={s.key}>{s.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Document Type</div>
                <select
                  value={addDocType}
                  onChange={e => { setAddDocType(e.target.value as StageAttachment['documentType']); setAddDocPrimary(false); }}
                  className="text-xs font-semibold text-slate-800 bg-white border border-slate-200 rounded-md p-1.5 w-full"
                >
                  {DOC_TYPES.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {DOC_TYPES.find(t => t.value === addDocType)?.primaryEligible && (
              <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={addDocPrimary}
                  onChange={e => setAddDocPrimary(e.target.checked)}
                  className="rounded border-slate-300"
                />
                Mark as Primary (signed LOC — replaces previous primary)
              </label>
            )}

            <div>
              <input
                ref={stageFileRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                className="hidden"
                onChange={e => setAddDocFile(e.target.files?.[0] ?? null)}
              />
              {addDocFile ? (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-600 font-semibold truncate max-w-[180px]">{addDocFile.name}</span>
                  <button onClick={() => { setAddDocFile(null); if (stageFileRef.current) stageFileRef.current.value = ''; }} className="text-red-400 hover:underline text-[10px]">Remove</button>
                </div>
              ) : (
                <button
                  onClick={() => stageFileRef.current?.click()}
                  className="text-xs font-semibold text-teal-600 border border-dashed border-teal-300 rounded-md px-3 py-1.5 w-full hover:bg-teal-50 transition-colors"
                >
                  Choose File (PDF / Image)
                </button>
              )}
            </div>

            <button
              onClick={handleStageUpload}
              disabled={!addDocFile || uploading}
              className="w-full py-2 text-xs font-bold text-white rounded-lg bg-slate-900 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {uploading ? 'Uploading…' : 'Attach Document'}
            </button>
          </div>
        )}

        {stageKeys.length > 0 ? (
          <div className="flex flex-col gap-1">
            {stageKeys.map(stageKey => {
              const isOpen = expandedStages[stageKey] ?? false;
              const stageColor = ALL_STAGES.find(s => s.key === stageKey)?.color ?? '#94A3B8';
              const count = attachmentsByStage[stageKey].length;
              return (
                <div key={stageKey} className="rounded-lg border border-slate-100 overflow-hidden">
                  {/* Collapsible header */}
                  <button
                    onClick={() => setExpandedStages(prev => ({ ...prev, [stageKey]: !isOpen }))}
                    className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ background: stageColor }} />
                      <span className="text-[11px] font-semibold text-slate-700">{getStageLabelForKey(stageKey)}</span>
                      <span className="text-[10px] text-slate-400 font-mono">({count} file{count !== 1 ? 's' : ''})</span>
                    </div>
                    <span className="text-slate-400 text-xs">{isOpen ? '▲' : '▼'}</span>
                  </button>

                  {/* File list */}
                  {isOpen && (
                    <div className="flex flex-col divide-y divide-slate-100">
                      {attachmentsByStage[stageKey].map(att => (
                        <div key={att.id} className="flex items-center gap-2 px-3 py-2">
                          <span className="text-[10px]">📄</span>
                          {att.isPrimary && (
                            <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-1 rounded shrink-0">PRIMARY</span>
                          )}
                          <span className="text-[10px] text-slate-400 shrink-0">{DOC_TYPE_LABELS[att.documentType]}</span>
                          <button
                            onClick={() => setViewingDoc({ url: att.url, name: att.name })}
                            className="text-teal-600 hover:underline text-[11px] truncate flex-1 text-left"
                          >
                            {att.name}
                          </button>
                          <span className="text-[9px] text-slate-300 shrink-0">{att.uploadedAt.slice(0, 10)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          !showAddDoc && <span className="text-[11px] italic text-slate-400">No submission documents yet.</span>
        )}
      </div>

      {/* Approved documents & revisions */}
      <div className="pt-3 mt-1 border-t border-slate-100">
        <div className="text-xs font-extrabold text-slate-800 uppercase tracking-wide mb-3 pb-1.5 border-b border-slate-200">Approved Documents & Revisions</div>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <div className="flex justify-between items-center">
              <span className="font-bold text-slate-800 text-xs">Approved TCPs</span>
              <input type="file" ref={tcpInputRef} onChange={handleTCPUpload} className="hidden" />
              {canEditPlan && (
                <button onClick={() => tcpInputRef.current?.click()} className="text-teal-600 text-[10px] font-bold hover:underline">
                  Upload Revision
                </button>
              )}
            </div>
            {renderDocHistory(selectedPlan.approvedTCPs || [], 'tcp')}
          </div>

          <div className="flex flex-col gap-1">
            <div className="flex justify-between items-center">
              <span className="font-bold text-slate-800 text-xs">Approved LOCs</span>
              <input type="file" ref={locInputRef} onChange={handleLOCLink} className="hidden" />
              {canEditPlan && (
                <button onClick={() => locInputRef.current?.click()} className="text-teal-600 text-[10px] font-bold hover:underline">
                  + Link New LOC
                </button>
              )}
            </div>
            {renderDocHistory(selectedPlan.approvedLOCs || [], 'loc')}
          </div>
        </div>
      </div>

      {viewingDoc && (
        <DocumentViewer url={viewingDoc.url} name={viewingDoc.name} onClose={() => setViewingDoc(null)} />
      )}
    </div>
  );
});
