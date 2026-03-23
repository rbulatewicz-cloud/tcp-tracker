import React from 'react';
import { COMPLETED_STAGES } from '../constants';

interface TicketsViewProps {
  canViewTickets: boolean;
  metrics: any;
  monoFont: string;
  filtered: any[];
  LEADS: string[];
  updatePlanField: (id: string, field: string, value: any) => void;
  setSelectedPlan: (plan: any) => void;
  setView: (view: string) => void;
  pushTicket: (id: string, stage: string) => void;
  plans: any[];
}

export function TicketsView({
  canViewTickets,
  metrics,
  monoFont,
  filtered,
  LEADS,
  updatePlanField,
  setSelectedPlan,
  setView,
  pushTicket,
  plans
}: TicketsViewProps) {
  if (!canViewTickets) return null;

  return (
    <div style={{background:"#fff",borderRadius:12,border:"1px solid #E2E8F0",padding:24}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:24}}>
        <div>
          <div style={{fontSize:20,fontWeight:800,color:"#0F172A",marginBottom:8}}>TCP Request Tickets</div>
          <div style={{fontSize:13,color:"#64748B"}}>Review and prioritize new TCP requests. Push them to drafting or engineering.</div>
        </div>
        <div style={{background:"#F8FAFC",padding:"12px 20px",borderRadius:12,border:"1px solid #E2E8F0",textAlign:"right"}}>
          <div style={{fontSize:9,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:0.8,marginBottom:4}}>Avg Drafting Time</div>
          <div style={{fontSize:24,fontWeight:800,color:"#3B82F6",fontFamily:monoFont}}>{metrics.avgDrafting} <span style={{fontSize:12,fontWeight:600,color:"#64748B"}}>days</span></div>
        </div>
      </div>
      
      <div style={{display:"flex",flexDirection:"column",gap:12}}>
        {filtered.filter(p=>p.stage==="requested").sort((a,b) => {
          if (a.isCriticalPath !== b.isCriticalPath) return a.isCriticalPath ? -1 : 1;
          return new Date(a.dateRequested || a.requestDate).getTime() - new Date(b.dateRequested || b.requestDate).getTime();
        }).map((ticket, index)=>(
          <div key={ticket.id} style={{background:"#fff",borderRadius:12,border:"1px solid #E2E8F0",padding:20,display:"flex",justifyContent:"space-between",alignItems:"center",boxShadow:"0 4px 6px -1px rgba(0, 0, 0, 0.05)"}}>
            <div style={{display:"flex",alignItems:"center",gap:16}}>
              <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",width:40,height:40,borderRadius:10,background:ticket.isCriticalPath?"#FEE2E2":"#F1F5F9",border:`1.5px solid ${ticket.isCriticalPath?"#FECACA":"#E2E8F0"}`,flexShrink:0}}>
                <span style={{fontSize:9,fontWeight:700,color:ticket.isCriticalPath?"#DC2626":"#94A3B8",textTransform:"uppercase",letterSpacing:0.5}}>#{index+1}</span>
              </div>
            <div>
              <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:8}}>
                <span style={{fontFamily:monoFont,fontWeight:700,fontSize:14,color:"#D97706"}}>{ticket.id}</span>
                <span style={{padding:"4px 8px",borderRadius:6,fontSize:10,fontWeight:700,background:"#F1F5F9",color:"#64748B"}}>{ticket.type}</span>
                <span style={{padding:"4px 8px",borderRadius:6,fontSize:10,fontWeight:700,background:ticket.priority==="Critical"?"#FEE2E2":ticket.priority==="High"?"#FEF3C7":ticket.priority==="Medium"?"#DBEAFE":"#F1F5F9",color:ticket.priority==="Critical"?"#DC2626":ticket.priority==="High"?"#D97706":ticket.priority==="Medium"?"#2563EB":"#64748B"}}>{ticket.priority} Priority</span>
                {ticket.isCriticalPath && !COMPLETED_STAGES.includes(ticket.stage) && (
                  <span style={{padding:"4px 8px",borderRadius:6,fontSize:10,fontWeight:700,background:"#FEF2F2",color:"#DC2626", display:"flex", alignItems:"center", gap:4}}>🔥 Critical Path</span>
                )}
              </div>
              <div style={{fontSize:15,fontWeight:600,color:"#1E293B",marginBottom:4}}>{ticket.street1} {ticket.street2?`/ ${ticket.street2}`:""}</div>
              <div style={{fontSize:12,color:"#64748B"}}>
                Requested on {ticket.dateRequested || ticket.requestDate}{ticket.lead ? ` • Lead: ${ticket.lead}` : ""}
              </div>
              {ticket.notes && <div style={{fontSize:12,color:"#475569",marginTop:8,fontStyle:"italic"}}>"{ticket.notes}"</div>}
            </div>
            </div>
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              <button onClick={()=>{setSelectedPlan(ticket);setView("table");}} style={{background:"#F8FAFC",color:"#475569",border:"1px solid #E2E8F0",padding:"8px 16px",borderRadius:8,fontWeight:600,cursor:"pointer",fontSize:12}}>View Details</button>
              <button onClick={()=>pushTicket(ticket.id,"sftc")} style={{background:"#3B82F6",color:"#fff",border:"none",padding:"8px 16px",borderRadius:8,fontWeight:600,cursor:"pointer",fontSize:12}}>Push to SFTC Drafting</button>
            </div>
          </div>
        ))}
        {plans.filter(p=>p.stage==="requested").length===0 && (
          <div style={{padding:40,textAlign:"center",color:"#94A3B8",background:"#F8FAFC",borderRadius:12,border:"1px dashed #CBD5E1"}}>
            No pending TCP requests. You're all caught up!
          </div>
        )}
      </div>
    </div>
  );
}
