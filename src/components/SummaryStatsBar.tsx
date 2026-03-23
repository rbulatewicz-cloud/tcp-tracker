import React from 'react';
import { SegmentedMetricBar } from './SegmentedMetricBar';
import { InfoTooltip } from './InfoTooltip';
import { MetricChart } from './MetricChart';
import { User, UserRole, ReportTemplate } from '../types';
import { MONO_FONT as monoFont } from '../constants';

interface SummaryStatsBarProps {
  metrics: any;
  hoveredMetricIndex: number | null;
  setHoveredMetricIndex: (index: number | null) => void;
  currentUser: User | null;
  reportTemplate: ReportTemplate;
  plans: any[];
  td: string;
  TODAY: Date;
}

const SummaryStatsBarComponent: React.FC<SummaryStatsBarProps> = ({
  metrics,
  hoveredMetricIndex,
  setHoveredMetricIndex,
  currentUser,
  reportTemplate,
  plans,
  td,
  TODAY
}) => {
  const stats = [
    {label:"Total Plans",value:metrics.total,color:"#0F172A",formula:"Total number of plans in the system."},
    {label:"At DOT",value:metrics.atDOT,color:"#F59E0B",formula:"Plans in 'Submitted to DOT' or 'In Review' stage."},
    {label:"Past 20 Days",value:metrics.past20,color:metrics.past20>0?"#EF4444":"#10B981",formula:"Plans submitted to DOT > 20 days ago."},
    {label:"At Risk (14d)",value:metrics.atRisk,color:metrics.atRisk>0?"#EF4444":"#10B981",formula:"Active plans with need-by date <= 14 days."},
    {label:"Overdue",value:metrics.overdue,color:metrics.overdue>0?"#DC2626":"#10B981",formula:"Active plans with need-by date < today."},
    {label:"Avg Turnaround",value:(
      <SegmentedMetricBar total={metrics.turnaroundMetric.total} breakdown={metrics.turnaroundMetric.breakdown} monoFont={monoFont} />
    ),color:"#6366F1",formula:"Avg days from submit to approval."},
    {label:"Overall Average",value:(
      <SegmentedMetricBar total={metrics.overageMetric.total} breakdown={metrics.overageMetric.breakdown} monoFont={monoFont} />
    ),color:"#8B5CF6",formula:"Avg days from request date to approval date."},
  ];

  return (
    <div style={{background:"#fff",borderBottom:"1px solid #E2E8F0",padding:"14px 28px"}}>
      <div style={{display:"flex",gap:0,justifyContent:"space-between"}}>
        {stats.map((s,i)=>{
          const isHovered = hoveredMetricIndex === i;
          const canSeeCharts = currentUser?.role && [UserRole.SFTC, UserRole.MOT, UserRole.ADMIN].includes(currentUser.role);
          const showChart = isHovered && canSeeCharts && reportTemplate.showMetricCharts;

          return (
            <div 
              key={i} 
              onMouseEnter={() => setHoveredMetricIndex(i)}
              onMouseLeave={() => setHoveredMetricIndex(null)}
              style={{
                textAlign:"center",
                flex:1,
                padding:"4px 0",
                borderRight:i<stats.length-1?"1px solid #F1F5F9":"none",
                transition: "all 0.2s",
                background: showChart ? "#F8FAFC" : "transparent",
                position: "relative",
                minHeight: 50
              }}
            >
              <div style={{fontSize:22,fontWeight:800,color:s.color,fontFamily:monoFont,lineHeight:1}}>
                {typeof s.value === 'number' && isNaN(s.value) ? 0 : s.value}
              </div>
              <div style={{fontSize:9,fontWeight:600,color:"#94A3B8",letterSpacing:0.5,marginTop:4,textTransform:"uppercase", display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                {s.label}
                {s.formula && <InfoTooltip formula={s.formula} />}
              </div>
              
              {showChart && (
                <div style={{
                  position: "absolute",
                  top: "100%",
                  left: 0,
                  right: 0,
                  background: "#fff",
                  border: "1px solid #E2E8F0",
                  borderRadius: "0 0 12px 12px",
                  padding: "10px",
                  boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)",
                  zIndex: 50
                }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#64748B", marginBottom: 4, textAlign: "left" }}>14-Day Trend</div>
                  <MetricChart metric={s.label} color={s.color} plans={plans} td={td} TODAY={TODAY} />
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 8, color: "#94A3B8" }}>
                    <span>-7d</span>
                    <span>Today</span>
                    <span>+7d</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const SummaryStatsBar = React.memo(SummaryStatsBarComponent);
