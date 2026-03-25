import React from 'react';
import { Spinner } from '../components/Spinner';
import { daysFromToday, daysBetween } from '../utils/plans';
import { COMPLETED_STAGES, ALL_STAGES } from '../constants';
import { UserRole, Plan, Stage, FilterState, SortConfig, ColumnDef, LoadingState, User } from '../types';

// Stages shown as summary cards at the top — key milestones only
const CARD_STAGES = [
  { key: 'requested',        label: 'Requested',        color: '#6B7280' },
  { key: 'drafting',         label: 'Drafting',          color: '#3B82F6' },
  { key: 'submitted_to_dot', label: 'Submitted to DOT',  color: '#F59E0B' },
  { key: 'plan_approved',    label: 'Plan Approved',      color: '#10B981' },
  { key: 'expired',          label: 'Expired',            color: '#DC2626' },
];

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
}: TableViewProps) {
  const [statusDateModal, setStatusDateModal] = React.useState<{ status: string; date: string } | null>(null);
  const [showLegend, setShowLegend] = React.useState(false);

  // Normalize plan stage for display — handle legacy keys
  const getStage = (stageKey: string) =>
    ALL_STAGES.find(s => s.key === stageKey) ?? { key: stageKey, label: stageKey, color: '#94A3B8' };

  return (
    <>
      {statusDateModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 300, padding: 24, boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
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
        <select value={filter.stage} onChange={e => setFilter(pr => ({ ...pr, stage: e.target.value }))} style={{ ...inp, width: 'auto', padding: '7px 12px', fontSize: 11, cursor: 'pointer', background: '#fff' }}>
          <option value="all">All Statuses</option>
          {ALL_STAGES.filter(s => !['submitted', 'approved'].includes(s.key)).map(s => (
            <option key={s.key} value={s.key}>{s.label}</option>
          ))}
        </select>
        {([
          { key: 'type', options: PLAN_TYPES, label: 'Type' },
          { key: 'lead', options: LEADS, label: 'Lead' },
          { key: 'priority', options: PRIORITIES, label: 'Priority' },
        ] as { key: keyof FilterState; options: string[]; label: string }[]).map(f => (
          <select key={f.key} value={filter[f.key] || 'all'} onChange={e => setFilter(pr => ({ ...pr, [f.key]: e.target.value }))} style={{ ...inp, width: 'auto', padding: '7px 12px', fontSize: 11, cursor: 'pointer', background: '#fff' }}>
            <option value="all">All {f.label === 'Priority' ? 'Priorities' : f.label + 's'}</option>
            {f.options.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        ))}
        {(filter.stage !== 'all' || filter.type !== 'all' || filter.lead !== 'all' || filter.priority !== 'all') && (
          <button onClick={() => setFilter({ stage: 'all', type: 'all', lead: 'all', priority: 'all' })} style={{ background: 'transparent', color: '#F59E0B', border: '1px solid #FDE68A', borderRadius: 6, padding: '7px 12px', fontSize: 11, cursor: 'pointer', fontFamily: font, fontWeight: 600 }}>Clear</button>
        )}
        {canExport && (
          <button onClick={exportToCSV} disabled={loading.export} style={{ background: '#fff', color: '#64748B', border: '1px solid #E2E8F0', padding: '7px 12px', borderRadius: 6, fontSize: 11, cursor: loading.export ? 'not-allowed' : 'pointer', fontFamily: font, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, opacity: loading.export ? 0.7 : 1 }}>
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

        {canEditPlan && selectedPlanIds.length > 0 && (
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
        <div style={{ marginBottom: 10, padding: '12px 16px', background: '#fff', borderRadius: 10, border: '1px solid #E2E8F0', fontSize: 11, display: 'flex', flexWrap: 'wrap', gap: 16 }}>
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
        </div>
      )}

      {/* Table */}
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E2E8F0', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: '#F8FAFC', borderBottom: '2px solid #E2E8F0' }}>
              {canEditPlan && (
                <th style={{ padding: '10px 8px', width: 30, textAlign: 'center' }}>
                  <input type="checkbox" checked={selectedPlanIds.length === filtered.length && filtered.length > 0} onChange={toggleSelectAll} style={{ cursor: 'pointer' }} />
                </th>
              )}
              {mainCols.map(col => (
                <th key={col.id} onClick={() => requestSort(col.label)} style={{ padding: '10px 8px', textAlign: 'left', fontWeight: 700, color: '#64748B', fontSize: 9, letterSpacing: 0.8, textTransform: 'uppercase', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
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
              const rowBg = isSelected ? '#F0F9FF' : isRisk ? '#FFFBEB' : idx % 2 === 0 ? '#fff' : '#FAFBFC';

              return (
                <tr
                  key={plan.id}
                  style={{ borderBottom: '1px solid #F1F5F9', cursor: 'pointer', background: rowBg, transition: 'background 0.1s' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#F0F9FF')}
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
                              {plan.loc || plan.id}
                              {plan.isHistorical && <span title="Historical Record" style={{ fontSize: 10 }}>📋</span>}
                              {plan.pendingDocuments && <span title="Pending Documents" style={{ fontSize: 10 }}>⚠️</span>}
                            </div>
                          </td>
                        );
                      case 'rev':
                        return <td key={col.id} onClick={() => setSelectedPlan(plan)} style={{ padding: '10px 8px', fontFamily: monoFont, fontWeight: 700, color: '#94A3B8', fontSize: 11 }}>{plan.rev || 0}</td>;
                      case 'type':
                        return <td key={col.id} onClick={() => setSelectedPlan(plan)} style={{ padding: '10px 8px', color: '#64748B', fontSize: 11 }}>{plan.type}</td>;
                      case 'scope':
                        return <td key={col.id} onClick={() => setSelectedPlan(plan)} style={{ padding: '10px 8px', fontSize: 11 }}>{plan.scope}</td>;
                      case 'segment':
                        return <td key={col.id} onClick={() => setSelectedPlan(plan)} style={{ padding: '10px 8px', fontFamily: monoFont, color: '#94A3B8', fontSize: 11 }}>{plan.segment}</td>;
                      case 'location':
                        return <td key={col.id} onClick={() => setSelectedPlan(plan)} style={{ padding: '10px 8px', fontSize: 12, fontWeight: 500 }}>{plan.street1}{plan.street2 ? ` / ${plan.street2}` : ''}</td>;
                      case 'lead':
                        return <td key={col.id} onClick={() => setSelectedPlan(plan)} style={{ padding: '10px 8px', fontSize: 11 }}>{plan.lead}</td>;
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
