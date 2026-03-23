import React from 'react';

interface CommunityRelationsViewProps {
  activeImpactFilter: string | null;
  setActiveImpactFilter: (filter: string | null) => void;
  communityCols: any[];
  requestCommunitySort: (key: string) => void;
  communitySortConfig: { key: string; direction: 'asc' | 'desc' } | null;
  sortedCommunity: any[];
  monoFont: string;
  setSelectedPlan: (plan: any) => void;
}

function CommunityRelationsView({
  activeImpactFilter,
  setActiveImpactFilter,
  communityCols,
  requestCommunitySort,
  communitySortConfig,
  sortedCommunity,
  monoFont,
  setSelectedPlan
}: CommunityRelationsViewProps) {
  return (
    <div style={{background:"#fff",borderRadius:12,border:"1px solid #E2E8F0",padding:24}}>
      <h2 style={{fontSize:20,fontWeight:800,color:"#0F172A",marginBottom:24}}>Community Relations</h2>
      <div style={{display:"flex",gap:12,marginBottom:24}}>
        {[
          { label: "Driveway Impact", key: "impact_driveway" },
          { label: "Bus Stop Impact", key: "impact_busStop" },
          { label: "Street Closure", key: "impact_fullClosure" }
        ].map(impact => (
          <button 
            key={impact.key}
            onClick={() => setActiveImpactFilter(activeImpactFilter === impact.key ? null : impact.key)}
            style={{
              padding:"8px 16px",
              borderRadius:20,
              border:"1px solid #E2E8F0",
              background: activeImpactFilter === impact.key ? "#E0E7FF" : "#F8FAFC",
              fontSize:12,
              fontWeight:600,
              color: activeImpactFilter === impact.key ? "#4338CA" : "#475569",
              cursor:"pointer"
            }}
          >
            {impact.label}
          </button>
        ))}
      </div>
      <table style={{width:"100%",borderCollapse:"collapse"}}>
        <thead>
          <tr style={{background:"#F8FAFC",borderBottom:"1px solid #E2E8F0"}}>
            {communityCols.map(col => (
              <th 
                key={col.id} 
                onClick={() => requestCommunitySort(col.id)}
                style={{
                  padding:"12px 20px",
                  textAlign:"left",
                  fontSize:10,
                  fontWeight:700,
                  color:"#64748B",
                  textTransform:"uppercase",
                  cursor: "pointer",
                  userSelect: "none"
                }}
              >
                {col.label}
                <span style={{fontSize: 8, marginLeft: 4, color: communitySortConfig?.key === col.id ? "#F59E0B" : "#CBD5E1"}}>
                  {communitySortConfig?.key === col.id ? (communitySortConfig.direction === 'asc' ? '▲' : '▼') : '↕'}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedCommunity.map(p => (
            <tr key={p.id} style={{borderBottom:"1px solid #F1F5F9", cursor: "pointer"}} onClick={() => setSelectedPlan(p)}>
              {communityCols.map(col => {
                switch(col.id) {
                  case "id": return <td key={col.id} style={{padding:"12px 20px",fontSize:12,fontFamily:monoFont,fontWeight:700,color:"#D97706"}}>#{p.id}</td>;
                  case "street": return <td key={col.id} style={{padding:"12px 20px",fontSize:13,fontWeight:500,color:"#1E293B"}}>{p.street1}</td>;
                  case "impacts": return (
                    <td key={col.id} style={{padding:"12px 20px",fontSize:12,color:"#64748B"}}>
                      {p.impact_driveway && "🚗 "}
                      {p.impact_busStop && "🚌 "}
                      {p.impact_fullClosure && "🛑 "}
                      {p.impact_transit && "🚇 "}
                      {!p.impact_driveway && !p.impact_busStop && !p.impact_fullClosure && !p.impact_transit && "—"}
                    </td>
                  );
                  case "status": return <td key={col.id} style={{padding:"12px 20px",fontSize:12,color:"#64748B"}}>{p.outreach?.status || "Not Started"}</td>;
                  default: return null;
                }
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const CommunityRelationsViewMemo = React.memo(CommunityRelationsView);
export { CommunityRelationsViewMemo as CommunityRelationsView };
