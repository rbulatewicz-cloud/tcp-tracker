import React, { useRef, useState } from 'react';
import { usePlanData, usePlanActions, usePlanPermissions } from '../PlanCardContext';
import { DocumentViewer } from '../DocumentViewer';

export const Documents: React.FC = React.memo(() => {
  const { selectedPlan } = usePlanData();
  const { uploadTCPRevision, linkNewLOC, deleteDocument } = usePlanActions();
  const { currentUser, UserRole } = usePlanPermissions();
  const canDelete = currentUser?.role === UserRole.MOT || currentUser?.role === UserRole.ADMIN;
  const tcpInputRef = useRef<HTMLInputElement>(null);
  const locInputRef = useRef<HTMLInputElement>(null);
  const [expanded, setExpanded] = useState<{ tcp: boolean, loc: boolean }>({ tcp: false, loc: false });
  const [viewingDoc, setViewingDoc] = useState<{ url: string, name: string } | null>(null);

  const handleTCPUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      uploadTCPRevision(selectedPlan.id, e.target.files[0]);
    }
  };

  const handleLOCLink = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      linkNewLOC(selectedPlan.id, e.target.files[0]);
    }
  };

  const renderDocHistory = (docs: any[], type: 'tcp' | 'loc') => {
    if (!docs || docs.length === 0) return <span className="text-[11px] italic text-slate-400">No {type.toUpperCase()}s uploaded yet.</span>;

    const sortedDocs = [...docs].sort((a, b) => b.version - a.version);
    const current = sortedDocs[0];
    const history = sortedDocs.slice(1);

    return (
      <div className="flex flex-col gap-1">
        <div className="text-xs text-slate-800 font-medium flex items-center gap-2">
          Current: <button onClick={() => setViewingDoc({ url: current.url, name: current.name })} className="text-teal-600 hover:underline">{current.name}</button> (v{current.version})
          {canDelete && (
            <button onClick={() => deleteDocument(selectedPlan.id, current.id, type, selectedPlan)} className="text-[10px] text-red-500 hover:underline">Delete</button>
          )}
        </div>
        {history.length > 0 && (
          <>
            <button onClick={() => setExpanded(prev => ({ ...prev, [type]: !prev[type] }))} className="text-[10px] text-slate-500 font-bold hover:underline self-start">
              {expanded[type] ? 'Hide History' : `Show ${history.length} Older Versions`}
            </button>
            {expanded[type] && (
              <div className="pl-4 flex flex-col gap-1 border-l-2 border-slate-200">
                {history.map(doc => (
                  <div key={doc.id} className="text-[11px] text-slate-600 flex items-center gap-2">
                    v{doc.version}: <button onClick={() => setViewingDoc({ url: doc.url, name: doc.name })} className="text-slate-600 hover:underline">{doc.name}</button>
                    {canDelete && (
                      <button onClick={() => deleteDocument(selectedPlan.id, doc.id, type, selectedPlan)} className="text-[10px] text-red-500 hover:underline">Delete</button>
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

  return (
    <div className="pb-4 mb-4">
      <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">APPROVED DOCUMENTS & REVISIONS</div>
      
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex justify-between items-center">
            <span className="font-bold text-slate-800 text-xs">Approved TCPs</span>
            <input type="file" ref={tcpInputRef} onChange={handleTCPUpload} className="hidden" />
            <button onClick={() => tcpInputRef.current?.click()} className="text-teal-600 text-[10px] font-bold hover:underline">Upload Revision</button>
          </div>
          {renderDocHistory(selectedPlan.approvedTCPs || [], 'tcp')}
        </div>

        <div className="flex flex-col gap-1">
          <div className="flex justify-between items-center">
            <span className="font-bold text-slate-800 text-xs">Approved LOCs</span>
            <input type="file" ref={locInputRef} onChange={handleLOCLink} className="hidden" />
            <button onClick={() => locInputRef.current?.click()} className="text-teal-600 text-[10px] font-bold hover:underline">+ Link New LOC</button>
          </div>
          {renderDocHistory(selectedPlan.approvedLOCs || [], 'loc')}
        </div>
      </div>

      {viewingDoc && (
        <DocumentViewer 
          url={viewingDoc.url} 
          name={viewingDoc.name} 
          onClose={() => setViewingDoc(null)} 
        />
      )}
    </div>
  );
});
