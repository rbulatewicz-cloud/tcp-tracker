import React from 'react';
import { Spinner } from '../components/Spinner';
import { daysFromToday, daysBetween } from '../utils/plans';
import { COMPLETED_STAGES, ALL_STAGES } from '../constants';
import { UserRole, Plan, Stage, FilterState, SortConfig, ColumnDef, LoadingState, User, NoiseVariance } from '../types';
import { detectComplianceTriggers } from '../utils/compliance';
import { getVarianceExpiryStatus } from '../services/varianceService';


interface TableViewProps {
  STAGES: Stage[];
  plans: Plan[];
  filter: FilterState;
  setFilter: React.Dispatch<React.SetStateAction<FilterState>>;
  monoFont: string;
  font: string;
  inp: React.CSSProperties;
  PLAN_TYPES: string[];
  LEADS: string[];
  PRIORITIES: string[];
  canExport: boolean;
  exportToCSV: () => void;
  loading: LoadingState;
  canEditPlan: boolean;
  selectedPlanIds: string[];
  bulkUpdate: (updates: Partial<Plan>, date: string | null) => void;
  currentUser: User | null;
  setSelectedPlanIds: (ids: string[]) => void;
  filtered: Plan[];
  toggleSelectAll: () => void;
  mainCols: ColumnDef[];
  requestSort: (key: string) => void;
  sortConfig: SortConfig | null;
  sortedData: Plan[];
  TODAY: Date;
  td: string;
  toggleSelectPlan: (id: string) => void;
  setSelectedPlan: (plan: Plan | null) => void;
  isDark?: boolean;
  libraryVariances?: NoiseVariance[];
}

function TableView({
  STAGES,
  plans,
  filter,
  setFilter,
  monoFont,
  font,
  inp,
  PLAN_TYPES,
  LEADS,
  PRIORITIES,
  canExport,
  exportToCSV,
  loading,
  canEditPlan,
  selectedPlanIds,
  bulkUpdate,
  currentUser,
  setSelectedPlanIds,
  filtered,
  toggleSelectAll,
  mainCols,
  requestSort,
  sortConfig,
  sortedData,
  TODAY,
  td,
  toggleSelectPlan,
  setSelectedPlan,
  isDark,
  libraryVariances = [],
}: TableViewProps) {
  const [statusDateModal, setStatusDateModal] = React.useState<{ status: string; date: string } | null>(null);
  const [showLegend, setShowLegend] = React.useState(false);

  // Normalize plan stage for display — handle legacy keys
  const getStage = (stageKey: string) =>
    ALL_STAGES.find(s => s.key === stageKey) ?? { key: stageKey, label: stageKey, color: '#94A3B8' };

  // Impact flag pills — only renders flags that are true
  const ImpactPills = ({ plan }: { plan: Plan }) => {
    const pills: { label: string; bg: string; color: string; title: string }[] = [];
    if (plan.dir_nb)              pills.push({ label: '↑NB',  bg: '#EFF6FF', color: '#2563EB', title: 'Northbound' });
    if (plan.dir_sb)              pills.push({ label: '↓SB',  bg: '#EFF6FF', color: '#2563EB', title: 'Southbound' });
    if (plan.dir_directional)     pills.push({ label: '↔DIR', bg: '#F0FDF4', color: '#16A34A', title: 'Directional' });
    if (plan.side_street)         pills.push({ label: '⊥SS',  bg: '#F8FAFC', color: '#64748B', title: 'Side Street' });
    if (plan.impact_krail)        pills.push({ label: 'K',    bg: '#F5F3FF', color: '#7C3AED', title: 'Krail Required' });
    if (plan.impact_fullClosure)  pills.push({ label: 'FC',   bg: '#FEF2F2', color: '#DC2626', title: 'Full Street Closure' });
    if (plan.impact_driveway)     pills.push({ label: 'DW',   bg: '#FFFBEB', color: '#D97706', title: 'Driveway Closures' });
    if (plan.impact_busStop)      pills.push({ label: 'BS',   bg: '#EFF6FF', color: '#0284C7', title: 'Bus Stop Impacts' });
    if (plan.impact_transit)      pills.push({ label: 'TN',   bg: '#F0FDFA', color: '#0F766E', title: 'TANSAT Needed' });
    if (pills.length === 0) return <span style={{ color: '#CBD5E1', fontSize: 10 }}>—</span>;
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
        {pills.map(p => (
          <span key={p.label} title={p.title} style={{
            background: p.bg, color: p.color,
            fontSize: 9, fontWeight: 800, letterSpacing: 0.3,
            padding: '2px 4px', borderRadius: 3,
            border: `1px solid ${p.color}30`,
            lineHeight: 1.4,
          }}>
            {p.label}
          </span>
        ))}
      </div>
    );
  };

  return (
    <>
      {statusDateModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
          <div style={{ background: 'var(--bg-surface)', borderRadius: 12, width: '100%', maxWidth: 300, padding: 24, boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
            <h3 style={{ fontSize: 16, fontWeight: 800, color: '#0F172A', margin: '0 0 16px 0' }}>Confirm Status Change</h3>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', marginBottom: 4 }}>Select Date</div>
              <input type="date" value={statusDateModal.date} onChange={e => setStatusDateModal({ ...statusDateModal, date: e.target.value })} style={{ ...inp, width: '100%' }} />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setStatusDateModal(null)} style={{ flex: 1, background: '#F1F5F9', border: 'none', padding: 8, borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
              <button onClick={() => { bulkUpdate({ stage: statusDateModal.status }, statusDateModal.date); setStatusDateModal(null); }} style={{ flex: 1, background: '#0F172A', color: '#fff', border: 'none', padding: 8, borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Confirm</button>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={filter.stage} onChange={e => setFilter(pr => ({ ...pr, stage: e.target.value }))} style={{ ...inp, width: 'auto', padding: '7px 12px', fontSize: 11, cursor: 'pointer' }}>
          <option value="all">All Statuses</option>
          {ALL_STAGES.filter(s => !['submitted', 'approved'].includes(s.key)).map(s => (
            <option key={s.key} value={s.key}>{s.label}</option>
          ))}
        </select>
        <select value={filter.importStatus || 'all'} onChange={e => setFilter(pr => ({ ...pr, importStatus: e.target.value }))} style={{ ...inp, width: 'auto', padding: '7px 12px', fontSize: 11, cursor: 'pointer' }}>
          <option value="all">All Records</option>
          <option value="needs_review">⚑ Needs Review</option>
          <option value="tbd">⏳ Pending LOC</option>
        </select>
        {([
          { key: 'type', options: PLAN_TYPES, label: 'Type' },
          { key: 'lead', options: LEADS, label: 'Lead' },
          { key: 'priority', options: PRIORITIES, label: 'Priority' },
        ] as { key: keyof FilterState; options: string[]; label: string }[]).map(f => (
          <select key={f.key} value={filter[f.key] || 'all'} onChange={e => setFilter(pr => ({ ...pr, [f.key]: e.target.value }))} style={{ ...inp, width: 'auto', padding: '7px 12px', fontSize: 11, cursor: 'pointer' }}>
            <option value="all">All {f.label === 'Priority' ? 'Priorities' : f.label + 's'}</option>
            {f.options.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        ))}
        {(filter.stage !== 'all' || filter.type !== 'all' || filter.lead !== 'all' || filter.priority !== 'all' || filter.importStatus !== 'all') && (
          <button onClick={() => setFilter({ stage: 'all', type: 'all', lead: 'all', priority: 'all', importStatus: 'all' })} style={{ background: 'transparent', color: '#F59E0B', border: '1px solid #FDE68A', borderRadius: 6, padding: '7px 12px', fontSize: 11, cursor: 'pointer', fontFamily: font, fontWeight: 600 }}>Clear</button>
        )}
        {canExport && (
          <button onClick={exportToCSV} disabled={loading.export} style={{ background: 'var(--bg-surface)', color: '#64748B', border: '1px solid var(--border)', padding: '7px 12px', borderRadius: 6, fontSize: 11, cursor: loading.export ? 'not-allowed' : 'pointer', fontFamily: font, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, opacity: loading.export ? 0.7 : 1 }}>
            {loading.export ? <Spinner size={12} /> : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
            )}
            {loading.export ? 'Exporting...' : 'Export CSV'}
          </button>
        )}
        <button
          onClick={() => setShowLegend(p => !p)}
          title="Toggle legend"
          style={{ background: showLegend ? '#F1F5F9' : 'transparent', border: '1px solid #E2E8F0', borderRadius: 6, padding: '7px 10px', fontSize: 11, cursor: 'pointer', color: '#64748B', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}
        >
          ⓘ Legend
        </button>

        <div style={{ flex: 1 }} />

        {(currentUser?.role === UserRole.MOT || currentUser?.role === UserRole.ADMIN) && selectedPlanIds.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#0F172A', padding: '4px 12px', borderRadius: 8, color: '#fff', fontSize: 11, fontWeight: 600 }}>
            {loading.bulk ? <Spinner size={12} color="#fff" /> : <span>{selectedPlanIds.length} Selected</span>}
            <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.2)' }} />
            <select onChange={e => bulkUpdate({ lead: e.target.value }, null)} disabled={loading.bulk || (currentUser?.role !== UserRole.MOT && currentUser?.role !== UserRole.ADMIN)} style={{ background: 'transparent', color: '#fff', border: 'none', fontSize: 11, fontWeight: 600, outline: 'none', cursor: (loading.bulk || (currentUser?.role !== UserRole.MOT && currentUser?.role !== UserRole.ADMIN)) ? 'not-allowed' : 'pointer' }} defaultValue="">
              <option value="" disabled style={{ color: '#000' }}>Change Lead...</option>
              {LEADS.map(l => <option key={l} value={l} style={{ color: '#000' }}>{l}</option>)}
            </select>
            <select onChange={e => bulkUpdate({ priority: e.target.value }, null)} disabled={loading.bulk} style={{ background: 'transparent', color: '#fff', border: 'none', fontSize: 11, fontWeight: 600, outline: 'none', cursor: loading.bulk ? 'not-allowed' : 'pointer' }} defaultValue="">
              <option value="" disabled style={{ color: '#000' }}>Set Priority...</option>
              {PRIORITIES.map(p => <option key={p} value={p} style={{ color: '#000' }}>{p}</option>)}
            </select>
            <select onChange={e => setStatusDateModal({ status: e.target.value, date: td })} disabled={loading.bulk} style={{ background: 'transparent', color: '#fff', border: 'none', fontSize: 11, fontWeight: 600, outline: 'none', cursor: loading.bulk ? 'not-allowed' : 'pointer' }} defaultValue="">
              <option value="" disabled style={{ color: '#000' }}>Set Status...</option>
              {ALL_STAGES.filter(s => !['submitted', 'approved'].includes(s.key)).map(s => <option key={s.key} value={s.key} style={{ color: '#000' }}>{s.label}</option>)}
            </select>
            <button onClick={() => setSelectedPlanIds([])} disabled={loading.bulk} style={{ background: 'transparent', border: 'none', color: '#94A3B8', cursor: loading.bulk ? 'not-allowed' : 'pointer', fontSize: 10, fontWeight: 700, padding: 4 }}>Cancel</button>
          </div>
        )}

        <div style={{ fontSize: 11, color: '#94A3B8', alignSelf: 'center' }}>{filtered.length} of {plans.length}</div>
      </div>

      {/* Legend popover */}
      {showLegend && (
        <div style={{ marginBottom: 10, padding: '12px 16px', background: 'var(--bg-surface)', borderRadius: 10, border: '1px solid var(--border)', fontSize: 11, display: 'flex', flexWrap: 'wrap', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 12, height: 12, borderRadius: 3, background: '#FFFBEB', border: '1px solid #FDE68A' }} />
            <span style={{ color: '#64748B' }}>Row highlight = At Risk (due ≤ 14d)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontWeight: 700, color: '#475569' }}>Priority:</span>
            <span style={{ padding: '2px 6px', borderRadius: 4, fontSize: 9, fontWeight: 700, background: '#FEE2E2', color: '#DC2626' }}>CRITICAL</span>
            <span style={{ padding: '2px 6px', borderRadius: 4, fontSize: 9, fontWeight: 700, background: '#FEF3C7', color: '#D97706' }}>HIGH</span>
            <span style={{ padding: '2px 6px', borderRadius: 4, fontSize: 9, fontWeight: 700, background: '#DBEAFE', color: '#2563EB' }}>MEDIUM</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontWeight: 700, color: '#475569' }}>Wait:</span>
            <span style={{ color: '#10B981', fontWeight: 700 }}>✓ Approved</span>
            <span style={{ color: '#DC2626', fontWeight: 700 }}>&gt;20d</span>
            <span style={{ color: '#D97706', fontWeight: 700 }}>&gt;10d</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontWeight: 700, color: '#475569' }}>Due:</span>
            <span style={{ color: '#DC2626', fontWeight: 700 }}>Overdue</span>
            <span style={{ color: '#D97706', fontWeight: 700 }}>≤ 7d</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 9, fontWeight: 700, color: '#6366F1' }}>📋 Historical</span>
            <span style={{ fontSize: 9, fontWeight: 700, color: '#D97706' }}>⚠ Pending Docs</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontWeight: 700, color: '#475569', fontSize: 11 }}>Hours:</span>
            {[
              { label: 'DAY',  bg: '#FFFBEB', color: '#D97706', title: 'Daytime only' },
              { label: 'NGT',  bg: '#EFF6FF', color: '#1D4ED8', title: 'Nighttime only' },
              { label: 'BOTH', bg: '#FDF4FF', color: '#A21CAF', title: 'Day + Night' },
              { label: '24/7', bg: '#F5F3FF', color: '#7C3AED', title: '24/7 Continuous' },
            ].map(h => (
              <span key={h.label} title={h.title} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ background: h.bg, color: h.color, fontSize: 9, fontWeight: 800, padding: '2px 5px', borderRadius: 3, border: `1px solid ${h.color}30` }}>{h.label}</span>
                <span style={{ color: '#94A3B8', fontSize: 10 }}>{h.title}</span>
              </span>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontWeight: 700, color: '#475569', fontSize: 11 }}>Compliance:</span>
            {[
              { label: 'PHE', title: 'Peak Hour Exemption' },
              { label: 'NV',  title: 'Noise Variance' },
              { label: 'CD',  title: 'CD Concurrence' },
            ].map(c => (
              <span key={c.label} title={c.title} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 9, fontWeight: 800, color: '#94A3B8', background: '#94A3B818', padding: '2px 4px', borderRadius: 3, border: '1px solid #94A3B840' }}>{c.label}</span>
                <span style={{ color: '#94A3B8', fontSize: 10 }}>{c.title}</span>
              </span>
            ))}
            <span style={{ color: '#94A3B8', fontSize: 10 }}>· color = status: </span>
            {[
              { color: '#94A3B8', label: 'Not started' },
              { color: '#3B82F6', label: 'In progress' },
              { color: '#F59E0B', label: 'Submitted' },
              { color: '#10B981', label: 'Approved' },
              { color: '#DC2626', label: 'Expired' },
            ].map(s => (
              <span key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
                <span style={{ color: '#94A3B8', fontSize: 10 }}>{s.label}</span>
              </span>
            ))}
          </div>
          {/* Impacts column legend */}
          <div style={{ width: '100%', borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 2, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
            <span style={{ fontWeight: 700, color: '#475569', fontSize: 11, marginRight: 2 }}>Impacts:</span>
            {[
              { label: '↑NB',  bg: '#EFF6FF', color: '#2563EB', title: 'Northbound' },
              { label: '↓SB',  bg: '#EFF6FF', color: '#2563EB', title: 'Southbound' },
              { label: '↔DIR', bg: '#F0FDF4', color: '#16A34A', title: 'Directional' },
              { label: '⊥SS',  bg: '#F8FAFC', color: '#64748B', title: 'Side Street' },
              { label: 'K',    bg: '#F5F3FF', color: '#7C3AED', title: 'Krail Required' },
              { label: 'FC',   bg: '#FEF2F2', color: '#DC2626', title: 'Full Street Closure' },
              { label: 'DW',   bg: '#FFFBEB', color: '#D97706', title: 'Driveway Closures' },
              { label: 'BS',   bg: '#EFF6FF', color: '#0284C7', title: 'Bus Stop Impacts' },
              { label: 'TN',   bg: '#F0FDFA', color: '#0F766E', title: 'TANSAT Needed' },
            ].map(p => (
              <span key={p.label} title={p.title} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ background: p.bg, color: p.color, fontSize: 9, fontWeight: 800, padding: '2px 4px', borderRadius: 3, border: `1px solid ${p.color}30` }}>{p.label}</span>
                <span style={{ color: '#94A3B8', fontSize: 10 }}>{p.title}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Table */}
      <div style={{ background: 'var(--bg-surface)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, tableLayout: 'fixed' }}>
          <colgroup>
            {canEditPlan && <col style={{ width: 32 }} />}
            {mainCols.map(col => {
              const w: Record<string, number | string> = {
                loc: 90, type: 82, location: '22%',
                hours: 58, impacts: 108, lead: 78,
                priority: 76, compliance: 86, status: 138,
                needBy: 80, wait: 48,
                scope: 100, segment: 80, rev: 48,
                requestedBy: 100, submittedToDOT: 90, requested: 90,
              };
              return <col key={col.id} style={{ width: w[col.id] ?? 90 }} />;
            })}
          </colgroup>
          <thead>
            <tr style={{ background: 'var(--bg-surface-2)', borderBottom: '2px solid var(--border)' }}>
              {canEditPlan && (
                <th style={{ padding: '10px 8px', textAlign: 'center' }}>
                  <input type="checkbox" checked={selectedPlanIds.length === filtered.length && filtered.length > 0} onChange={toggleSelectAll} style={{ cursor: 'pointer' }} />
                </th>
              )}
              {mainCols.map(col => (
                <th key={col.id} onClick={() => requestSort(col.label)} style={{ padding: '10px 8px', textAlign: 'left', fontWeight: 700, color: '#64748B', fontSize: 9, letterSpacing: 0.8, textTransform: 'uppercase', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap', overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    {col.label}
                    <span style={{ fontSize: 8, color: sortConfig?.key === col.label ? '#F59E0B' : '#CBD5E1' }}>
                      {sortConfig?.key === col.label ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '↕'}
                    </span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedData.map((plan, idx) => {
              const dl = plan.needByDate ? daysFromToday(plan.needByDate, TODAY) : 999;
              const stage = getStage(plan.stage);
              const isRisk = !COMPLETED_STAGES.includes(plan.stage) && dl <= 14;
              const wd = plan.submitDate && !COMPLETED_STAGES.includes(plan.stage)
                ? daysBetween(plan.submitDate, td)
                : plan.submitDate && plan.approvedDate
                  ? daysBetween(plan.submitDate, plan.approvedDate)
                  : null;
              const isSelected = selectedPlanIds.includes(plan.id);
              const rowBg = isSelected ? (isDark ? '#1C3B5A' : '#F0F9FF')
                : isRisk ? (isDark ? '#3D2B0A' : '#FFFBEB')
                : idx % 2 === 0 ? 'var(--bg-surface)' : 'var(--bg-surface-3)';

              return (
                <tr
                  key={plan.id}
                  style={{ borderBottom: '1px solid var(--border-subtle)', cursor: 'pointer', background: rowBg, transition: 'background 0.1s' }}
                  onMouseEnter={e => (e.currentTarget.style.background = isDark ? '#1C3B5A' : '#F0F9FF')}
                  onMouseLeave={e => (e.currentTarget.style.background = rowBg)}
                >
                  {canEditPlan && (
                    <td style={{ padding: '10px 8px', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                      <input type="checkbox" checked={isSelected} onChange={() => toggleSelectPlan(plan.id)} style={{ cursor: 'pointer' }} />
                    </td>
                  )}
                  {mainCols.map(col => {
                    switch (col.id) {
                      case 'loc':
                      case 'id':
                        // LOC # is primary — show LOC field (falls back to id for legacy data)
                        return (
                          <td key={col.id} onClick={() => setSelectedPlan(plan)} style={{ padding: '10px 8px', fontFamily: monoFont, fontWeight: 700, color: '#0F172A', fontSize: 12 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              {plan.locStatus === 'unassigned' ? (
                                <span style={{ color: '#D97706', fontWeight: 700 }}>TBD</span>
                              ) : (plan.loc || plan.id)}
                              {plan.isHistorical && <span title="Historical Record" style={{ fontSize: 10 }}>📋</span>}
                              {plan.pendingDocuments && <span title="Pending Documents" style={{ fontSize: 10 }}>⚠️</span>}
                              {plan.importStatus === 'needs_review' && <span title="Needs Review" style={{ fontSize: 10, color: '#0EA5E9' }}>⚑</span>}
                            </div>
                          </td>
                        );
                      case 'rev':
                        return <td key={col.id} onClick={() => setSelectedPlan(plan)} style={{ padding: '10px 8px', fontFamily: monoFont, fontWeight: 700, color: '#94A3B8', fontSize: 11 }}>{plan.rev || 0}</td>;
                      case 'type':
                        return <td key={col.id} onClick={() => setSelectedPlan(plan)} style={{ padding: '10px 8px', color: '#64748B', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{plan.type}</td>;
                      case 'scope':
                        return <td key={col.id} onClick={() => setSelectedPlan(plan)} style={{ padding: '10px 8px', fontSize: 11 }}>{plan.scope}</td>;
                      case 'segment':
                        return <td key={col.id} onClick={() => setSelectedPlan(plan)} style={{ padding: '10px 8px', fontFamily: monoFont, color: '#94A3B8', fontSize: 11 }}>{plan.segment}</td>;
                      case 'location':
                        return (
                          <td key={col.id} onClick={() => setSelectedPlan(plan)} style={{ padding: '10px 8px', overflow: 'hidden' }}>
                            <div style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{plan.street1}{plan.street2 ? ` / ${plan.street2}` : ''}</div>
                            <div style={{ display: 'flex', gap: 3, marginTop: 3 }}>
                              {plan.scope   && <span style={{ fontSize: 9, fontWeight: 700, background: '#F1F5F9', color: '#64748B', padding: '1px 4px', borderRadius: 3, whiteSpace: 'nowrap' }}>{plan.scope}</span>}
                              {plan.segment && <span style={{ fontSize: 9, fontWeight: 700, background: '#F1F5F9', color: '#64748B', padding: '1px 4px', borderRadius: 3, whiteSpace: 'nowrap' }}>{plan.segment}</span>}
                            </div>
                          </td>
                        );
                      case 'hours': {
                        const wh = plan.work_hours;
                        const hoursMap: Record<string, { label: string; bg: string; color: string }> = {
                          continuous: { label: '24/7',  bg: '#F5F3FF', color: '#7C3AED' },
                          both:       { label: 'BOTH',  bg: '#FDF4FF', color: '#A21CAF' },
                          nighttime:  { label: 'NGT',   bg: '#EFF6FF', color: '#1D4ED8' },
                          daytime:    { label: 'DAY',   bg: '#FFFBEB', color: '#D97706' },
                        };
                        const h = wh ? hoursMap[wh.shift] : null;
                        return (
                          <td key={col.id} onClick={() => setSelectedPlan(plan)} style={{ padding: '10px 8px' }}>
                            {h
                              ? <span style={{ fontSize: 9, fontWeight: 800, background: h.bg, color: h.color, padding: '2px 5px', borderRadius: 3, border: `1px solid ${h.color}30` }}>{h.label}</span>
                              : <span style={{ color: '#CBD5E1', fontSize: 10 }}>—</span>
                            }
                          </td>
                        );
                      }
                      case 'compliance': {
                        const triggers = detectComplianceTriggers(plan);
                        const statusColor = (s?: string) => {
                          if (!s || s === 'not_started') return '#94A3B8';
                          if (s === 'approved')  return '#10B981';
                          if (s === 'submitted') return '#F59E0B';
                          if (s === 'expired')   return '#DC2626';
                          return '#3B82F6';
                        };
                        // NV color — override with expiry status if linked
                        const nvStatus = plan.compliance?.noiseVariance?.status;
                        let nvColor = statusColor(nvStatus);
                        let nvTitle = `Noise Variance — ${nvStatus ?? 'not started'}`;
                        if (plan.compliance?.noiseVariance?.linkedVarianceId) {
                          const linked = libraryVariances.find(v =>
                            v.id === plan.compliance!.noiseVariance!.linkedVarianceId ||
                            (v.parentVarianceId ?? v.id) === plan.compliance!.noiseVariance!.linkedVarianceId
                          );
                          if (linked) {
                            const expiry = getVarianceExpiryStatus(linked);
                            if (expiry === 'expired')  { nvColor = '#DC2626'; nvTitle = `NV expired — ${linked.validThrough}`; }
                            else if (expiry === 'critical') { nvColor = '#F97316'; nvTitle = `NV expiring soon — ${linked.validThrough}`; }
                            else if (expiry === 'warning')  { nvColor = '#F59E0B'; nvTitle = `NV expires ${linked.validThrough}`; }
                          }
                        }
                        // DN pill — sent / total addresses
                        const dn = plan.compliance?.drivewayNotices;
                        const dnSent  = dn?.addresses.filter(a => a.noticeSent).length ?? 0;
                        const dnTotal = dn?.addresses.length ?? 0;
                        const dnColor = dnSent === dnTotal && dnTotal > 0 ? '#10B981' : '#F59E0B';
                        const dnLabel = dnTotal > 0 ? `DN ${dnSent}/${dnTotal}` : 'DN';

                        const dots: { label: string; color: string; title: string }[] = [];
                        if (triggers.phe)            dots.push({ label: 'PHE',   color: statusColor(plan.compliance?.phe?.status),     title: `PHE — ${plan.compliance?.phe?.status ?? 'not started'}` });
                        if (triggers.noiseVariance)  dots.push({ label: 'NV',    color: nvColor,                                        title: nvTitle });
                        if (triggers.cdConcurrence)  dots.push({ label: 'CD',    color: statusColor(plan.compliance?.cdConcurrence?.status), title: `CD Concurrence — ${plan.compliance?.cdConcurrence?.status ?? 'not started'}` });
                        if (triggers.drivewayNotices) dots.push({ label: dnLabel, color: dnColor, title: `Driveway Notices — ${dnSent}/${dnTotal} sent` });
                        return (
                          <td key={col.id} onClick={() => setSelectedPlan(plan)} style={{ padding: '10px 8px' }}>
                            {dots.length === 0
                              ? <span style={{ color: '#CBD5E1', fontSize: 10 }}>—</span>
                              : <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                                  {dots.map(d => (
                                    <span key={d.label} title={d.title} style={{ fontSize: 9, fontWeight: 800, color: d.color, background: `${d.color}18`, padding: '2px 4px', borderRadius: 3, border: `1px solid ${d.color}40` }}>
                                      {d.label}
                                    </span>
                                  ))}
                                </div>
                            }
                          </td>
                        );
                      }
                      case 'impacts':
                        return <td key={col.id} onClick={() => setSelectedPlan(plan)} style={{ padding: '10px 8px', minWidth: 80 }}><ImpactPills plan={plan} /></td>;
                      case 'lead':
                        return <td key={col.id} onClick={() => setSelectedPlan(plan)} style={{ padding: '10px 8px', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{plan.lead}</td>;
                      case 'requestedBy':
                        return <td key={col.id} onClick={() => setSelectedPlan(plan)} style={{ padding: '10px 8px', fontSize: 11, color: '#64748B' }}>{plan.requestedBy || '—'}</td>;
                      case 'priority':
                        return (
                          <td key={col.id} onClick={() => setSelectedPlan(plan)} style={{ padding: '10px 8px' }}>
                            <span style={{ padding: '3px 8px', borderRadius: 4, fontSize: 9, fontWeight: 700, letterSpacing: 0.3, background: plan.priority === 'Critical' ? '#FEE2E2' : plan.priority === 'High' ? '#FEF3C7' : plan.priority === 'Medium' ? '#DBEAFE' : '#F1F5F9', color: plan.priority === 'Critical' ? '#DC2626' : plan.priority === 'High' ? '#D97706' : plan.priority === 'Medium' ? '#2563EB' : '#64748B' }}>
                              {(plan.priority || '').toUpperCase()}
                            </span>
                          </td>
                        );
                      case 'status':
                        return (
                          <td key={col.id} onClick={() => setSelectedPlan(plan)} style={{ padding: '10px 8px' }}>
                            <span style={{ padding: '3px 8px', borderRadius: 4, fontSize: 9, fontWeight: 700, background: `${stage.color}18`, color: stage.color, letterSpacing: 0.3 }}>
                              {stage.label.toUpperCase()}
                            </span>
                          </td>
                        );
                      case 'submittedToDOT':
                        return <td key={col.id} onClick={() => setSelectedPlan(plan)} style={{ padding: '10px 8px', fontFamily: monoFont, fontSize: 10, color: '#94A3B8' }}>{plan.submitDate || '—'}</td>;
                      case 'requested':
                        return <td key={col.id} onClick={() => setSelectedPlan(plan)} style={{ padding: '10px 8px', fontFamily: monoFont, fontSize: 10, color: '#94A3B8' }}>{plan.dateRequested || plan.requestDate || '—'}</td>;
                      case 'needBy':
                        return <td key={col.id} onClick={() => setSelectedPlan(plan)} style={{ padding: '10px 8px', fontFamily: monoFont, fontSize: 10, color: dl <= 0 ? '#DC2626' : dl <= 7 ? '#D97706' : '#64748B' }}>{plan.needByDate || '—'}</td>;
                      case 'wait':
                        return (
                          <td key={col.id} onClick={() => setSelectedPlan(plan)} style={{ padding: '10px 8px', fontFamily: monoFont, fontWeight: 700, fontSize: 12, textAlign: 'center', color: COMPLETED_STAGES.includes(plan.stage) ? '#10B981' : (wd as number) > 20 ? '#DC2626' : (wd as number) > 10 ? '#D97706' : '#64748B' }}>
                            {COMPLETED_STAGES.includes(plan.stage) ? '✓' : wd !== null ? `${wd}d` : '—'}
                          </td>
                        );
                      default:
                        return null;
                    }
                  })}
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={canEditPlan ? mainCols.length + 1 : mainCols.length} style={{ padding: 40, textAlign: 'center', color: '#94A3B8' }}>
                  No plans match filters
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

export const TableViewMemo = React.memo(TableView);
export { TableViewMemo as TableView };
