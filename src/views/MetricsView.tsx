import React from 'react';
import { daysFromToday, daysBetween } from '../utils/plans';
import { ReportGenerator } from '../components/ReportGenerator';
import { ReportTemplate } from '../types';
import { COMPLETED_STAGES, AT_DOT_STAGES } from '../constants';

interface MetricsViewProps {
  filtered: any[];
  metrics: any;
  STAGES: any[];
  monoFont: string;
  TODAY: Date;
  td: string;
  setSelectedPlan: (plan: any) => void;
  setView: (view: string) => void;
  reportTemplate: ReportTemplate;
}

function MetricsView({
  filtered,
  metrics,
  STAGES,
  monoFont,
  TODAY,
  td,
  setSelectedPlan,
  setView,
  reportTemplate
}: MetricsViewProps) {
  return (
    <div id="metrics-view-container" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
      <div style={{gridColumn:"span 2", display:"flex", justifyContent:"flex-end", marginBottom:10}}>
        <ReportGenerator template={reportTemplate} elementId="metrics-view-container" />
      </div>
      {/* Pipeline */}
      <div style={{background:"#fff",borderRadius:12,border:"1px solid #E2E8F0",padding:24}}>
        <div style={{fontSize:13,fontWeight:700,color:"#0F172A",marginBottom:16}}>Pipeline by Stage</div>
        {STAGES.map(s=>{const c=filtered.filter(p=>p.stage===s.key).length;const pct=metrics.total>0?(c/metrics.total)*100:0;return(
          <div key={s.key} style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
            <div style={{width:110,fontSize:11,color:"#64748B",fontWeight:500,textAlign:"right"}}>{s.label}</div>
            <div style={{flex:1,height:26,background:"#F1F5F9",borderRadius:6,overflow:"hidden",position:"relative"}}>
              <div style={{width:`${pct}%`,height:"100%",background:s.color,borderRadius:6,transition:"width 0.5s",minWidth:c>0?28:0}}/>
              <div style={{position:"absolute",left:8,top:"50%",transform:"translateY(-50%)",fontSize:12,fontWeight:700,color:pct>15?"#fff":"#1E293B",fontFamily:monoFont}}>{c}</div>
            </div>
          </div>
        );})}
      </div>

      {/* Lead Workload */}
      <div style={{background:"#fff",borderRadius:12,border:"1px solid #E2E8F0",padding:24}}>
        <div style={{fontSize:13,fontWeight:700,color:"#0F172A",marginBottom:16}}>Workload by Lead</div>
        {Object.entries(metrics.leadLoad).sort((a: any,b: any)=>b[1].total-a[1].total).map(([lead,data]: [string, any])=>{const maxT=Math.max(...Object.values(metrics.leadLoad).map((d: any)=>d.total));return(
          <div key={lead} style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
            <div style={{width:60,fontSize:12,fontWeight:600,color:"#1E293B",textAlign:"right"}}>{lead}</div>
            <div style={{flex:1,height:26,background:"#F1F5F9",borderRadius:6,overflow:"hidden",display:"flex"}}>
              <div style={{width:`${(data.pending/maxT)*100}%`,height:"100%",background:"#F59E0B",borderRadius:"6px 0 0 6px",minWidth:data.pending>0?4:0}}/>
              <div style={{width:`${((data.total-data.pending)/maxT)*100}%`,height:"100%",background:"#10B981",minWidth:(data.total-data.pending)>0?4:0}}/>
            </div>
            <div style={{fontSize:11,fontFamily:monoFont,color:"#64748B",minWidth:55}}>
              <span style={{color:"#F59E0B",fontWeight:600}}>{data.pending}</span><span style={{color:"#CBD5E1"}}> / </span><span>{data.total}</span>
            </div>
          </div>
        );})}
        <div style={{display:"flex",gap:16,marginTop:14,fontSize:10,color:"#94A3B8"}}>
          <div style={{display:"flex",alignItems:"center",gap:4}}><div style={{width:8,height:8,background:"#F59E0B",borderRadius:2}}/> Pending</div>
          <div style={{display:"flex",alignItems:"center",gap:4}}><div style={{width:8,height:8,background:"#10B981",borderRadius:2}}/> Complete</div>
        </div>
      </div>

      {/* At Risk */}
      <div style={{background:"#fff",borderRadius:12,border:"1px solid #E2E8F0",padding:24}}>
        <div style={{fontSize:13,fontWeight:700,color:"#0F172A",marginBottom:4}}>At-Risk Plans</div>
        <div style={{fontSize:10,color:"#EF4444",marginBottom:14}}>Need-by ≤ 14 days, not yet approved</div>
        {filtered.filter(p=>!COMPLETED_STAGES.includes(p.stage)&&p.needByDate&&daysFromToday(p.needByDate, TODAY)<=14).sort((a,b)=>daysFromToday(a.needByDate, TODAY)-daysFromToday(b.needByDate, TODAY)).length===0
          ?<div style={{padding:20,textAlign:"center",color:"#10B981",fontSize:13}}>No at-risk plans</div>
          :filtered.filter(p=>!COMPLETED_STAGES.includes(p.stage)&&p.needByDate&&daysFromToday(p.needByDate, TODAY)<=14).sort((a,b)=>daysFromToday(a.needByDate, TODAY)-daysFromToday(b.needByDate, TODAY)).map(p=>{const dl=daysFromToday(p.needByDate, TODAY);return(
            <div key={p.id} onClick={()=>{setSelectedPlan(p);setView("table");}} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 10px",borderRadius:8,marginBottom:4,cursor:"pointer",background:dl<=0?"#FEF2F2":dl<=7?"#FFFBEB":"#F8FAFC",border:`1px solid ${dl<=0?"#FECACA":dl<=7?"#FDE68A":"#E2E8F0"}`}}>
              <div>
                <span style={{fontFamily:monoFont,fontWeight:700,fontSize:12,color:"#D97706",marginRight:8}}>#{p.loc||"TBD"}</span>
                <span style={{fontSize:12,color:"#475569"}}>{p.street1}{p.street2?` / ${p.street2}`:""}</span>
                <span style={{fontSize:10,color:"#94A3B8",marginLeft:8}}>{p.type}</span>
              </div>
              <div style={{fontFamily:monoFont,fontWeight:700,fontSize:13,color:dl<=0?"#DC2626":dl<=7?"#D97706":"#F59E0B"}}>{dl<=0?`${Math.abs(dl)}d OVER`:`${dl}d`}</div>
            </div>
        );})
        }
      </div>

      {/* Past 20-Day */}
      <div style={{background:"#fff",borderRadius:12,border:"1px solid #E2E8F0",padding:24}}>
        <div style={{fontSize:13,fontWeight:700,color:"#0F172A",marginBottom:4}}>Past 20-Day DOT Threshold</div>
        <div style={{fontSize:10,color:"#EF4444",marginBottom:14}}>Submitted, not approved, exceeding target review period</div>
        {filtered.filter(p=>AT_DOT_STAGES.includes(p.stage)&&p.submitDate&&daysBetween(p.submitDate,td)>20).sort((a,b)=>daysBetween(b.submitDate,td)-daysBetween(a.submitDate,td)).length===0
          ?<div style={{padding:20,textAlign:"center",color:"#10B981",fontSize:13}}>All within 20-day window</div>
          :filtered.filter(p=>AT_DOT_STAGES.includes(p.stage)&&p.submitDate&&daysBetween(p.submitDate,td)>20).sort((a,b)=>daysBetween(b.submitDate,td)-daysBetween(a.submitDate,td)).map(p=>{const w=daysBetween(p.submitDate,td);return(
            <div key={p.id} onClick={()=>{setSelectedPlan(p);setView("table");}} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 10px",borderRadius:8,marginBottom:4,cursor:"pointer",background:"#FEF2F2",border:"1px solid #FECACA"}}>
              <div>
                <span style={{fontFamily:monoFont,fontWeight:700,fontSize:12,color:"#D97706",marginRight:8}}>#{p.loc||"TBD"}</span>
                <span style={{fontSize:12,color:"#475569"}}>{p.street1}{p.street2?` / ${p.street2}`:""}</span>
                <span style={{fontSize:10,color:"#94A3B8",marginLeft:8}}>{p.type}</span>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontFamily:monoFont,fontWeight:700,fontSize:13,color:"#DC2626"}}>{w}d</div>
                <div style={{fontFamily:monoFont,fontSize:10,color:"#EF4444"}}>+{w-20}d over</div>
              </div>
            </div>
        );})
        }
      </div>
    </div>
  );
}

export const MetricsViewMemo = React.memo(MetricsView);
export { MetricsViewMemo as MetricsView };
