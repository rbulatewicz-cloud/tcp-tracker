import React from 'react';

interface LocManagerPortalViewProps {
  canManageUsers: boolean;
  setSelectedLOC: (loc: any) => void;
  setLocForm: (form: any) => void;
  setShowLOCForm: (show: boolean) => void;
  font: string;
  locCols: any[];
  requestLocSort: (key: string) => void;
  locSortConfig: { key: string; direction: 'asc' | 'desc' } | null;
  sortedLocs: any[];
  locs: any[];
}

export const LocManagerPortalView: React.FC<LocManagerPortalViewProps> = ({
  canManageUsers,
  setSelectedLOC,
  setLocForm,
  setShowLOCForm,
  font,
  locCols,
  requestLocSort,
  locSortConfig,
  sortedLocs,
  locs
}) => {
  return (
    <div style={{background:"#fff",borderRadius:12,border:"1px solid #E2E8F0",padding:24}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:24}}>
        <div>
          <div style={{fontSize:20,fontWeight:800,color:"#0F172A",marginBottom:8}}>LOC Manager Portal</div>
          <div style={{fontSize:13,color:"#64748B"}}>Manage Letters of Concurrence and tie them to TCP Plans.</div>
        </div>
        {canManageUsers && (
          <button 
            onClick={() => {
              setSelectedLOC(null);
              setLocForm({
                locNumber: "",
                revision: 1,
                startDate: "",
                endDate: "",
                dotSubmittalDate: "",
                planIds: [],
                notes: "",
                file: null
              });
              setShowLOCForm(true);
            }} 
            style={{background:"#0F172A",color:"#fff",border:"none",padding:"10px 20px",borderRadius:8,fontWeight:600,cursor:"pointer",fontSize:13,fontFamily:font,display:"flex",alignItems:"center",gap:8}}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            New LOC
          </button>
        )}
      </div>

      <div style={{overflowX:"auto", borderRadius:12, border:"1px solid #E2E8F0"}}>
        <table style={{width:"100%", borderCollapse:"collapse", background:"#fff"}}>
          <thead>
            <tr style={{background:"#F8FAFC", borderBottom:"1px solid #E2E8F0"}}>
              {locCols.map(col => (
                <th 
                  key={col.id} 
                  onClick={() => requestLocSort(col.id)}
                  style={{
                    padding:"12px 20px", 
                    textAlign:"left", 
                    fontSize:10, 
                    fontWeight:700, 
                    color:"#64748B", 
                    textTransform:"uppercase", 
                    letterSpacing:0.5,
                    cursor: "pointer",
                    userSelect: "none"
                  }}
                >
                  {col.label}
                  <span style={{fontSize: 8, marginLeft: 4, color: locSortConfig?.key === col.id ? "#F59E0B" : "#CBD5E1"}}>
                    {locSortConfig?.key === col.id ? (locSortConfig.direction === 'asc' ? '▲' : '▼') : '↕'}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedLocs.map((loc, idx) => (
              <tr key={loc.id} style={{borderBottom:"1px solid #F1F5F9", background: idx % 2 === 0 ? "#fff" : "#FAFBFC"}}>
                {locCols.map(col => {
                  switch(col.id) {
                    case "loc": return <td key={col.id} style={{padding:"12px 20px", fontSize:14, fontWeight:700, color:"#0F172A"}}>{loc.locNumber}</td>;
                    case "rev": return (
                      <td key={col.id} style={{padding:"12px 20px", fontSize:12, fontWeight:600, color:"#64748B"}}>
                        <span style={{background:"#F1F5F9", padding:"2px 8px", borderRadius:4}}>Rev {loc.revision}</span>
                      </td>
                    );
                    case "validity": return (
                      <td key={col.id} style={{padding:"12px 20px", fontSize:12, color:"#334155"}}>
                        <div style={{fontWeight:600}}>{loc.startDate} to {loc.endDate}</div>
                        {new Date(loc.endDate) < new Date() && <span style={{fontSize:10, color:"#EF4444", fontWeight:700}}>EXPIRED</span>}
                      </td>
                    );
                    case "plans": return (
                      <td key={col.id} style={{padding:"12px 20px", fontSize:12, color:"#334155"}}>
                        <div style={{display:"flex", flexWrap:"wrap", gap:4}}>
                          {loc.planIds.map((pid: string) => (
                            <span key={pid} style={{background:"#DBEAFE", color:"#1E40AF", padding:"2px 6px", borderRadius:4, fontSize:10, fontWeight:700}}>{pid}</span>
                          ))}
                        </div>
                      </td>
                    );
                    case "file": return (
                      <td key={col.id} style={{padding:"12px 20px", fontSize:12}}>
                        {loc.fileUrl ? (
                          <a href={loc.fileUrl} target="_blank" rel="noreferrer" style={{color:"#3B82F6", fontWeight:600, textDecoration:"none", display:"flex", alignItems:"center", gap:4}}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>
                            {loc.fileName || "View File"}
                          </a>
                        ) : <span style={{color:"#94A3B8"}}>No File</span>}
                      </td>
                    );
                    case "actions": return (
                      <td key={col.id} style={{padding:"12px 20px", textAlign:"right"}}>
                        <div style={{display:"flex", gap:8, justifyContent:"flex-end"}}>
                          {canManageUsers && (
                            <>
                              <button 
                                onClick={() => {
                                  setSelectedLOC(loc);
                                  setLocForm({
                                    locNumber: loc.locNumber,
                                    revision: loc.revision + 1,
                                    startDate: loc.startDate,
                                    endDate: loc.endDate,
                                    dotSubmittalDate: loc.dotSubmittalDate || "",
                                    planIds: loc.planIds,
                                    notes: loc.notes,
                                    file: null,
                                    isNewRevision: true
                                  });
                                  setShowLOCForm(true);
                                }}
                                style={{background:"#F1F5F9", color:"#475569", border:"1px solid #E2E8F0", padding:"6px 12px", borderRadius:6, fontSize:11, fontWeight:600, cursor:"pointer"}}
                              >
                                New Rev
                              </button>
                              <button 
                                onClick={() => {
                                  setSelectedLOC(loc);
                                  setLocForm({
                                    locNumber: loc.locNumber,
                                    revision: loc.revision,
                                    startDate: loc.startDate,
                                    endDate: loc.endDate,
                                    dotSubmittalDate: loc.dotSubmittalDate || "",
                                    planIds: loc.planIds,
                                    notes: loc.notes,
                                    file: null,
                                    isNewRevision: false
                                  });
                                  setShowLOCForm(true);
                                }}
                                style={{background:"#F1F5F9", color:"#475569", border:"1px solid #E2E8F0", padding:"6px 12px", borderRadius:6, fontSize:11, fontWeight:600, cursor:"pointer"}}
                              >
                                Edit
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    );
                    default: return null;
                  }
                })}
              </tr>
            ))}
            {locs.length === 0 && (
              <tr>
                <td colSpan={locCols.length} style={{padding:40, textAlign:"center", color:"#94A3B8"}}>No LOCs found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
