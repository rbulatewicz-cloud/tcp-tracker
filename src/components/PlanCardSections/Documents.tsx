import React, { useRef, useState } from 'react';
import { usePlanData, usePlanActions, usePlanPermissions } from '../PlanCardContext';
import { DocumentViewer } from '../DocumentViewer';
import { StageAttachment, PlanDocument } from '../../types';
import { ALL_STAGES } from '../../constants';

const DOC_TYPE_LABELS: Record<StageAttachment['documentType'], string> = {
  tcp_drawings:      'TCP Drawings',
  loc_draft:         'LOC Draft',
  loc_signed:        'Signed LOC ★',
  dot_comments:      'DOT Comments',
  revision_package:  'Revision Package',
  other:             'Other',
};

export const Documents: React.FC = React.memo(() => {
  const { selectedPlan } = usePlanData();
  const { uploadTCPRevision, linkNewLOC, deleteDocument } = usePlanActions();
  const { currentUser, UserRole } = usePlanPermissions();
  const canDelete = currentUser?.role === UserRole.MOT || currentUser?.role === UserRole.ADMIN;
  const tcpInputRef = useRef<HTMLInputElement>(null);
  const locInputRef = useRef<HTMLInputElement>(null);
  const [expanded, setExpanded] = useState<{ tcp: boolean; loc: boolean }>({ tcp: false, loc: false });
  const [viewingDoc, setViewingDoc] = useState<{ url: string; name: string } | null>(null);

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
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Draft Plans</div>
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
      {stageKeys.length > 0 && (
        <div>
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Submission Documents</div>
          <div className="flex flex-col gap-3">
            {stageKeys.map(stageKey => (
              <div key={stageKey}>
                <div className="text-[10px] font-semibold text-slate-500 mb-1 flex items-center gap-1">
                  <div
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ background: ALL_STAGES.find(s => s.key === stageKey)?.color ?? '#94A3B8' }}
                  />
                  {getStageLabelForKey(stageKey)}
                </div>
                <div className="flex flex-col gap-1 pl-3">
                  {attachmentsByStage[stageKey].map(att => (
                    <div key={att.id} className="flex items-center gap-2">
                      {att.isPrimary && (
                        <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-1 rounded">PRIMARY</span>
                      )}
                      <span className="text-[10px] text-slate-500">{DOC_TYPE_LABELS[att.documentType]}</span>
                      <button
                        onClick={() => setViewingDoc({ url: att.url, name: att.name })}
                        className="text-teal-600 hover:underline text-[11px] truncate max-w-[180px]"
                      >
                        {att.name}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Approved documents & revisions */}
      <div>
        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">Approved Documents & Revisions</div>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <div className="flex justify-between items-center">
              <span className="font-bold text-slate-800 text-xs">Approved TCPs</span>
              <input type="file" ref={tcpInputRef} onChange={handleTCPUpload} className="hidden" />
              <button onClick={() => tcpInputRef.current?.click()} className="text-teal-600 text-[10px] font-bold hover:underline">
                Upload Revision
              </button>
            </div>
            {renderDocHistory(selectedPlan.approvedTCPs || [], 'tcp')}
          </div>

          <div className="flex flex-col gap-1">
            <div className="flex justify-between items-center">
              <span className="font-bold text-slate-800 text-xs">Approved LOCs</span>
              <input type="file" ref={locInputRef} onChange={handleLOCLink} className="hidden" />
              <button onClick={() => locInputRef.current?.click()} className="text-teal-600 text-[10px] font-bold hover:underline">
                + Link New LOC
              </button>
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
