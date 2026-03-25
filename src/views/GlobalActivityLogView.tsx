import React from 'react';

interface GlobalActivityLogViewProps {
  canViewLogs: boolean;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  logCols: any[];
  plans: any[];
  setSelectedPlan: (plan: any) => void;
  setView: (view: string) => void;
  monoFont: string;
}

export function GlobalActivityLogView({
  canViewLogs,
  searchQuery,
  setSearchQuery,
  logCols,
  plans,
  setSelectedPlan,
  setView,
  monoFont
}: GlobalActivityLogViewProps) {
  if (!canViewLogs) return null;

  return (
    <div style={{background:"#fff", borderRadius:12, border:"1px solid #E2E8F0", overflow:"hidden"}}>
      <div style={{padding:20, borderBottom:"1px solid #F1F5F9", display: "flex", justifyContent: "space-between", alignItems: "center"}}>
        <div style={{display:"flex", alignItems:"center", gap:12}}>
          <div style={{width:40, height:40, borderRadius:10, background:"#F1F5F9", display:"flex", alignItems:"center", justifyContent:"center", color:"#64748B"}}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline><line x1="9" y1="14" x2="15" y2="14"></line><line x1="9" y1="18" x2="15" y2="18"></line><line x1="9" y1="10" x2="11" y2="10"></line></svg>
          </div>
          <div>
            <div style={{fontSize:14, fontWeight:700, color:"#0F172A"}}>Global Activity Log</div>
            <div style={{fontSize:11, color:"#94A3B8"}}>Real-time feed of all plan updates and system actions</div>
          </div>
        </div>
        <div style={{display:"flex", gap:8, alignItems:"center"}}>
          <div style={{display:"flex", background:"#F1F5F9", padding:4, borderRadius:8, gap:4}}>
            {["ALL", "STATUS", "UPLOAD", "DELETE", "NOTE"].map(f => (
              <button 
                key={f}
                onClick={() => setSearchQuery(f === "ALL" ? "" : f)}
                style={{
                  padding: "4px 10px", 
                  borderRadius: 6, 
                  border: "none", 
                  fontSize: 10, 
                  fontWeight: 700, 
                  cursor: "pointer",
                  background: (searchQuery === f || (f === "ALL" && !searchQuery)) ? "#fff" : "transparent",
                  color: (searchQuery === f || (f === "ALL" && !searchQuery)) ? "#0F172A" : "#64748B",
                  boxShadow: (searchQuery === f || (f === "ALL" && !searchQuery)) ? "0 1px 3px rgba(0,0,0,0.1)" : "none"
                }}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div style={{maxHeight:"70vh", overflow:"auto"}}>
        <table style={{width:"100%", borderCollapse:"collapse"}}>
          <thead>
            <tr style={{background:"#F8FAFC", borderBottom:"1px solid #E2E8F0"}}>
              {logCols.map(col => (
                <th 
                  key={col.id} 
                  style={{
                    padding:"12px 20px", 
                    textAlign: col.id === "operator" ? "right" : "left", 
                    fontSize:10, 
                    fontWeight:700, 
                    color:"#64748B", 
                    textTransform:"uppercase", 
                    letterSpacing:0.5, 
                    width: col.id === "timestamp" ? 140 : col.id === "reference" ? 100 : col.id === "operator" ? 180 : "auto"
                  }}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(() => {
              const allLogs = plans.flatMap(p => p.log.map((l: any) => ({ ...l, planId: p.id, loc: p.loc })));
              const seenGlobalWipes = new Set();
              const filteredLogs = allLogs.filter(l => {
                if (l.action && l.action.includes("Status → Implemented")) return false;
                
                const getActionType = (action: string) => {
                  if (action.includes("Status changed")) return "STATUS";
                  if (action.includes("Uploaded")) return "UPLOAD";
                  if (action.includes("Deleted")) return "DELETE";
                  if (action.includes("New request")) return "CREATE";
                  if (action.includes("wiped") || action.includes("cleared")) return "SYSTEM";
                  if (action.includes("Note added")) return "NOTE";
                  return "INFO";
                };

                if (searchQuery) {
                  const q = searchQuery.toUpperCase();
                  const type = getActionType(l.action || "");
                  
                  // If it's one of our filter keywords, match by type
                  if (["STATUS", "UPLOAD", "DELETE", "NOTE", "CREATE", "SYSTEM"].includes(q)) {
                    if (type !== q) return false;
                  } else {
                    // Otherwise do a general search
                    const lowerQ = searchQuery.toLowerCase();
                    const match = 
                      (l.action && l.action.toLowerCase().includes(lowerQ)) ||
                      (l.user && l.user.toLowerCase().includes(lowerQ)) ||
                      (l.loc && String(l.loc).toLowerCase().includes(lowerQ)) ||
                      (l.date && l.date.toLowerCase().includes(lowerQ));
                    if (!match) return false;
                  }
                }
                if (l.action === "Global log wiped" || l.action === "Global log cleared by Admin") {
                  const key = `${l.date}-${l.user}`;
                  if (seenGlobalWipes.has(key)) return false;
                  seenGlobalWipes.add(key);
                  l.loc = "ALL";
                  return true;
                }
                return true;
              });
              return filteredLogs.sort((a, b) => b.date.localeCompare(a.date)).map((entry, i) => {
                const getActionStyle = (action: string) => {
                  if (action.includes("Status changed")) return { color: "#3B82F6", bg: "#DBEAFE", icon: "🔄", label: "STATUS" };
                  if (action.includes("Uploaded")) return { color: "#10B981", bg: "#D1FAE5", icon: "📤", label: "UPLOAD" };
                  if (action.includes("Deleted")) return { color: "#EF4444", bg: "#FEE2E2", icon: "🗑️", label: "DELETE" };
                  if (action.includes("New request")) return { color: "#8B5CF6", bg: "#EDE9FE", icon: "🆕", label: "CREATE" };
                  if (action.includes("wiped") || action.includes("cleared")) return { color: "#6B7280", bg: "#F3F4F6", icon: "🧹", label: "SYSTEM" };
                  if (action.includes("Note added")) return { color: "#F59E0B", bg: "#FEF3C7", icon: "📝", label: "NOTE" };
                  return { color: "#64748B", bg: "#F1F5F9", icon: "ℹ️", label: "INFO" };
                };
                const style = getActionStyle(entry.action || "");
                const plan = plans.find(p => p.id === entry.planId);

                return (
                  <tr key={i} style={{borderBottom:"1px solid #F1F5F9", background: i % 2 === 0 ? "#fff" : "#FAFBFC", transition: "background 0.2s"}}>
                    {logCols.map(col => {
                      switch(col.id) {
                        case "timestamp": return (
                          <td key={col.id} style={{padding:"12px 20px", fontSize:11, fontFamily:monoFont, color:"#64748B"}}>
                            <div style={{display:"flex", flexDirection:"column"}}>
                              <span>{entry.date.split(',')[0]}</span>
                              <span style={{fontSize:9, opacity:0.7}}>{entry.date.split(',')[1]}</span>
                            </div>
                          </td>
                        );
                        case "reference": return (
                          <td key={col.id} style={{padding:"12px 20px"}}>
                            {entry.loc === "ALL" ? (
                              <span style={{fontSize:11, fontWeight:800, color:"#64748B", fontFamily:monoFont, background:"#F1F5F9", padding:"2px 6px", borderRadius:4}}>ALL</span>
                            ) : (
                              <button 
                                onClick={() => {
                                  if (plan) {
                                    setSelectedPlan(plan);
                                    setView("table");
                                  }
                                }}
                                style={{
                                  fontSize:12, 
                                  fontWeight:700, 
                                  color:"#D97706", 
                                  fontFamily:monoFont, 
                                  background:"transparent", 
                                  border:"none", 
                                  padding:0, 
                                  cursor:"pointer",
                                  textDecoration:"underline"
                                }}
                              >
                                #{entry.loc || "TBD"}
                              </button>
                            )}
                          </td>
                        );
                        case "activity": return (
                          <td key={col.id} style={{padding:"12px 20px"}}>
                            <div style={{display:"flex", alignItems:"center", gap:8}}>
                              <span style={{
                                fontSize:9, 
                                fontWeight:800, 
                                color: style.color, 
                                background: style.bg, 
                                padding: "2px 6px", 
                                borderRadius: 4,
                                letterSpacing: "0.02em"
                              }}>
                                {style.label}
                              </span>
                              <span style={{fontSize:13, color:"#1E293B", fontWeight: 500}}>
                                <span style={{marginRight:6}}>{style.icon}</span>
                                {entry.action}
                              </span>
                            </div>
                          </td>
                        );
                        case "operator": return (
                          <td key={col.id} style={{padding:"12px 20px", textAlign:"right"}}>
                            <div style={{display:"flex", flexDirection:"column", alignItems:"flex-end"}}>
                              <span style={{fontSize:12, fontWeight:700, color:"#475569"}}>{entry.user}</span>
                              <span style={{fontSize:10, color:"#94A3B8"}}>System User</span>
                            </div>
                          </td>
                        );
                        default: return null;
                      }
                    })}
                  </tr>
                );
              });
            })()}
          </tbody>
        </table>
      </div>
    </div>
  );
}
