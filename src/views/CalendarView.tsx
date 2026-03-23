import React from 'react';

interface CalendarViewProps {
  TODAY: Date;
  filtered: any[];
  hoveredPlanId: string | null;
  setHoveredPlanId: (id: string | null) => void;
  setSelectedPlan: (plan: any) => void;
}

export const CalendarView = React.memo<CalendarViewProps>(({
  TODAY,
  filtered,
  hoveredPlanId,
  setHoveredPlanId,
  setSelectedPlan
}) => {
  return (
    <div style={{background:"#fff", borderRadius:12, border:"1px solid #E2E8F0", padding:24}}>
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:24}}>
        <div>
          <div style={{fontSize:18, fontWeight:800, color:"#0F172A"}}>Project Calendar</div>
          <div style={{fontSize:12, color:"#94A3B8"}}>{TODAY.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</div>
        </div>
        <div style={{display:"flex", gap:16, fontSize:11, fontWeight:600}}>
          <div style={{display:"flex", alignItems:"center", gap:6}}><div style={{width:8, height:8, borderRadius:2, background:"#3B82F6"}}></div> Submitted</div>
          <div style={{display:"flex", alignItems:"center", gap:6}}><div style={{width:8, height:8, borderRadius:2, background:"#EF4444"}}></div> Need By</div>
        </div>
      </div>
      
      <div style={{display:"grid", gridTemplateColumns:"repeat(7, 1fr)", gap:1, background:"#E2E8F0", border:"1px solid #E2E8F0", borderRadius:8, overflow:"hidden"}}>
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => (
          <div key={d} style={{background:"#F8FAFC", padding:"10px", textAlign:"center", fontSize:10, fontWeight:700, color:"#64748B", textTransform:"uppercase"}}>{d}</div>
        ))}
        {/* Padding for first day of month */}
        {Array.from({length: new Date(TODAY.getFullYear(), TODAY.getMonth(), 1).getDay()}).map((_, i) => (
          <div key={`pad-${i}`} style={{background:"#F8FAFC", minHeight:100}} />
        ))}
        {Array.from({length: new Date(TODAY.getFullYear(), TODAY.getMonth() + 1, 0).getDate()}).map((_, i) => {
          const day = i + 1;
          const dateStr = `${TODAY.getFullYear()}-${String(TODAY.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          
          // Get all plans that have either date on this day
          const dayPlans: {plan: any, type: 'SUB' | 'NEED'}[] = [];
          filtered.forEach(p => {
            if (p.submitDate === dateStr) dayPlans.push({plan: p, type: 'SUB'});
            if (p.needByDate === dateStr) dayPlans.push({plan: p, type: 'NEED'});
          });

          const isToday = day === TODAY.getDate() && TODAY.getMonth() === new Date().getMonth();

          return (
            <div key={day} style={{background:"#fff", minHeight:100, padding:8, position:"relative"}}>
              <div style={{fontSize:12, fontWeight:700, color:isToday?"#F59E0B":"#1E293B", marginBottom:4}}>{day}</div>
              <div style={{display:"flex", flexDirection:"column", gap:2}}>
                {dayPlans.map(({plan, type}) => {
                  const isHovered = hoveredPlanId === plan.id;
                  const isOtherHovered = hoveredPlanId !== null && hoveredPlanId !== plan.id;
                  const isSubmit = type === 'SUB';
                  
                  return (
                    <div 
                      key={`${plan.id}-${type}`}
                      onClick={() => setSelectedPlan(plan)}
                      onMouseEnter={() => setHoveredPlanId(plan.id)}
                      onMouseLeave={() => setHoveredPlanId(null)}
                      style={{
                        fontSize:9, 
                        padding:"2px 4px", 
                        borderRadius:3, 
                        background:isSubmit ? "#DBEAFE" : "#FEE2E2", 
                        color:isSubmit ? "#1E40AF" : "#991B1B",
                        borderLeft: `3px solid ${isSubmit ? '#3B82F6' : '#EF4444'}`,
                        cursor:"pointer",
                        whiteSpace:"nowrap",
                        overflow:"hidden",
                        textOverflow:"ellipsis",
                        opacity: isOtherHovered ? 0.3 : 1,
                        transform: isHovered ? "scale(1.05)" : "scale(1)",
                        boxShadow: isHovered ? "0 2px 4px rgba(0,0,0,0.1)" : "none",
                        zIndex: isHovered ? 10 : 1,
                        transition: "all 0.1s ease",
                        fontWeight: isHovered ? 700 : 500
                      }}
                    >
                      <span style={{fontWeight:800, marginRight:4}}>{type}</span>
                      {plan.loc || "TBD"} - {plan.street1}
                      {plan.outreach?.impacts?.driveway && " 🚗"}
                      {plan.outreach?.impacts?.busStop && " 🚌"}
                      {plan.outreach?.impacts?.streetClosure && " 🛑"}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});
