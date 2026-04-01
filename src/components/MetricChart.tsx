import { LineChart, Line, ResponsiveContainer, Tooltip } from 'recharts';
import { daysBetween } from '../utils/plans';

const getTrendData = (plans: any[], metric: string, td: string, TODAY: Date) => {
    const pastDays = 7;
    const futureDays = 7;
    const data = [];
    
    for (let i = -pastDays; i <= futureDays; i++) {
      const d = new Date(TODAY);
      d.setDate(TODAY.getDate() + i);
      const dateStr = d.toISOString().split('T')[0];
      
      let value = 0;
      if (metric === "Total Plans") {
        // Count plans created on or before this date
        value = plans.filter(p => {
          if (!p.log || !Array.isArray(p.log)) return true;
          const createLog = p.log.find((l: any) => l.action && l.action.includes("Plan created"));
          return createLog ? createLog.date <= dateStr : true;
        }).length;
      } else if (metric === "Active") {
        // Count plans active on this date
        value = plans.filter(p => {
          if (!p.log || !Array.isArray(p.log)) return true;
          const createLog = p.log.find((l: any) => l.action && l.action.includes("Plan created"));
          const createdOnOrBefore = createLog ? createLog.date <= dateStr : true;
          const approveLog = p.log.find((l: any) => l.action && l.action.includes("Status → Approved"));
          const approvedAfter = approveLog ? approveLog.date > dateStr : true;
          return createdOnOrBefore && approvedAfter;
        }).length;
      } else if (metric === "At DOT") {
        // Count plans at DOT on this date
        value = plans.filter(p => {
          if (!p.log || !Array.isArray(p.log)) return false;
          const submitLog = p.log.find((l: any) => l.action && (l.action.includes("Status → Submitted to DOT") || l.action.includes("Status → In Review")));
          const submittedOnOrBefore = submitLog ? submitLog.date <= dateStr : false;
          const approveLog = p.log.find((l: any) => l.action && l.action.includes("Status → Approved"));
          const approvedAfter = approveLog ? approveLog.date > dateStr : true;
          return submittedOnOrBefore && approvedAfter;
        }).length;
      } else if (metric === "Past 20 Days") {
        // Count plans at DOT for > 20 days on this date
        value = plans.filter(p => {
          if (!p.log || !Array.isArray(p.log)) return false;
          const submitLog = p.log.find((l: any) => l.action && (l.action.includes("Status → Submitted to DOT") || l.action.includes("Status → In Review")));
          if (!submitLog || submitLog.date > dateStr) return false;
          const approveLog = p.log.find((l: any) => l.action && l.action.includes("Status → Approved"));
          if (approveLog && approveLog.date <= dateStr) return false;
          return daysBetween(submitLog.date, dateStr) > 20;
        }).length;
      } else if (metric === "At Risk (14d)") {
        // Count plans at risk on this date
        value = plans.filter(p => {
          if (!p.needByDate) return false;
          if (!p.log || !Array.isArray(p.log)) return true;
          const approveLog = p.log.find((l: any) => l.action && l.action.includes("Status → Approved"));
          if (approveLog && approveLog.date <= dateStr) return false;
          const daysToNeed = Math.floor((new Date(p.needByDate).getTime() - new Date(dateStr).getTime()) / 86400000);
          return daysToNeed >= 0 && daysToNeed <= 14;
        }).length;
      } else if (metric === "Overdue") {
        // Count plans overdue on this date
        value = plans.filter(p => {
          if (!p.needByDate) return false;
          if (!p.log || !Array.isArray(p.log)) return true;
          const approveLog = p.log.find((l: any) => l.action && l.action.includes("Status → Approved"));
          if (approveLog && approveLog.date <= dateStr) return false;
          const daysToNeed = Math.floor((new Date(p.needByDate).getTime() - new Date(dateStr).getTime()) / 86400000);
          return daysToNeed < 0;
        }).length;
      } else if (metric === "Avg Turnaround") {
        // Avg turnaround of plans approved on or before this date
        const approvedOnOrBefore = plans.filter(p => {
          if (!p.log || !Array.isArray(p.log)) return false;
          const approveLog = p.log.find((l: any) => l.action && l.action.includes("Status → Approved"));
          return approveLog && approveLog.date <= dateStr && p.submitDate;
        });
        if (approvedOnOrBefore.length === 0) value = 0;
        else {
          const sum = approvedOnOrBefore.reduce((s, p) => {
            const approveLog = p.log.find((l: any) => l.action && l.action.includes("Status → Approved"));
            return s + daysBetween(p.submitDate, approveLog.date);
          }, 0);
          value = parseFloat((sum / approvedOnOrBefore.length).toFixed(1));
        }
      } else if (metric === "Avg Wait (DOT)") {
        // Avg wait of plans currently at DOT on this date
        const atDOTOnDate = plans.filter(p => {
          if (!p.log || !Array.isArray(p.log)) return false;
          const submitLog = p.log.find((l: any) => l.action && (l.action.includes("Status → Submitted to DOT") || l.action.includes("Status → In Review")));
          if (!submitLog || submitLog.date > dateStr) return false;
          const approveLog = p.log.find((l: any) => l.action && l.action.includes("Status → Approved"));
          if (approveLog && approveLog.date <= dateStr) return false;
          return true;
        });
        if (atDOTOnDate.length === 0) value = 0;
        else {
          const sum = atDOTOnDate.reduce((s, p) => {
            const submitLog = p.log.find((l: any) => l.action && (l.action.includes("Status → Submitted to DOT") || l.action.includes("Status → In Review")));
            return s + daysBetween(submitLog.date, dateStr);
          }, 0);
          value = parseFloat((sum / atDOTOnDate.length).toFixed(1));
        }
      }
      
      data.push({ 
        date: dateStr, 
        value, 
        isProjected: i > 0,
        displayDate: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      });
    }
    return data;
  };

export const MetricChart = ({ metric, color, plans, td, TODAY }: { metric: string, color: string, plans: any[], td: string, TODAY: Date }) => {
    const data = getTrendData(plans, metric, td, TODAY);
    const pastData = data.filter(d => !d.isProjected);
    const futureData = data.filter(d => d.isProjected || d.date === td);

    return (
      <div style={{ height: 60, width: '100%', marginTop: 8, minWidth: 0, minHeight: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <Tooltip 
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  return (
                    <div style={{ background: "#fff", border: "1px solid #E2E8F0", padding: "4px 8px", borderRadius: 4, fontSize: 9, fontWeight: 700, boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)" }}>
                      <div style={{ color: "#64748B" }}>{payload[0].payload.displayDate}</div>
                      <div style={{ color }}>{isNaN(Number(payload[0].value)) ? 0 : payload[0].value} {payload[0].payload.isProjected ? "(Projected)" : ""}</div>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Line 
              type="monotone" 
              dataKey="value" 
              stroke={color} 
              strokeWidth={2} 
              dot={false} 
              data={pastData}
              isAnimationActive={false}
            />
            <Line 
              type="monotone" 
              dataKey="value" 
              stroke={color} 
              strokeWidth={2} 
              strokeDasharray="3 3"
              strokeOpacity={0.4}
              dot={false} 
              data={futureData}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  };
