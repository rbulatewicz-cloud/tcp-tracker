import React from 'react';

interface SegmentedMetricBarProps {
  total: string | number;
  breakdown: { type: string; value: string | number; color: string }[];
  monoFont: string;
}

export const SegmentedMetricBar: React.FC<SegmentedMetricBarProps> = ({ total, breakdown, monoFont }) => {
  // Filter out segments with no data or zero value
  const validBreakdown = breakdown.filter(b => b.value !== '—' && parseFloat(b.value as string) > 0);
  
  // Use the max value for row-based proportionality
  const maxValue = Math.max(...validBreakdown.map(b => parseFloat(b.value as string)));

  return (
    <div style={{ display: 'flex', gap: 12, width: '100%', alignItems: 'center' }}>
      {/* Total KPI */}
      <div style={{ fontSize: 22, fontWeight: 800, fontFamily: monoFont, minWidth: 45 }}>
        {total}d
      </div>
      
      <div style={{ flex: 0.75, display: 'flex', flexDirection: 'column', gap: 3 }}>
        {validBreakdown.map((b, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: '#64748B', minWidth: 8 }}>{b.type}</div>
            <div style={{ flex: 1, height: 6, borderRadius: 3, background: '#E2E8F0', overflow: 'hidden' }}>
              <div style={{ width: `${(parseFloat(b.value as string) / maxValue) * 100}%`, height: '100%', background: b.color }} />
            </div>
            <div style={{ fontSize: 9, fontWeight: 700, fontFamily: monoFont, color: '#1E293B', minWidth: 20 }}>{b.value}d</div>
          </div>
        ))}
      </div>
    </div>
  );
};
