import React, { useEffect, useMemo, useState } from 'react';
import { Plan, TansatRequest, TansatStatus, TansatActivity } from '../../types';
import { subscribeToTansatRequests, updateTansatRequest } from '../../services/tansatService';
import {
  getMonthlySpend, getCurrentMonthKey, getRequestsNeedingAttention, getTotalPaid,
} from '../../utils/tansatSpend';
import {
  TansatStatusPill, ACTIVITY_LABELS, fmtMoney, PhaseChips,
} from '../../components/PlanCardSections/tansat/tansatShared';
import { fmtDate } from '../../utils/plans';
import { useApp } from '../../hooks/useApp';

interface TansatLogSectionProps {
  plans: Plan[];
  setSelectedPlan: (plan: Plan | null) => void;
}

/**
 * T-5.1 — Library → TANSAT Log.
 *
 * The full historical catalog of every TANSAT request, searchable, filterable,
 * exportable. Hub is action-oriented; this is reference-oriented — where you
 * go when you need to look something up rather than triage what's pending.
 *
 * Imports from Justin's xlsx (T-6.2) preserve `importedPlanText`. Rows whose
 * `planId` doesn't match a real plan show the original text + a 🔗 Link
 * button so MOT can reconcile at their own pace. The "Unlinked imports
 * only" filter chip surfaces the remaining work.
 */
export const TansatLogSection: React.FC<TansatLogSectionProps> = ({ plans, setSelectedPlan }) => {
  const { firestoreData } = useApp();
  const appConfig = firestoreData?.appConfig;

  const [requests, setRequests] = useState<TansatRequest[]>([]);
  useEffect(() => {
    const unsub = subscribeToTansatRequests(setRequests);
    return () => unsub();
  }, []);

  // ── Filters ──────────────────────────────────────────────────────────────
  const [statusFilter, setStatusFilter] = useState<TansatStatus | 'all' | 'unpaid'>('all');
  const [activityFilter, setActivityFilter] = useState<TansatActivity | 'all'>('all');
  const [unlinkedOnly, setUnlinkedOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [linkPickerFor, setLinkPickerFor] = useState<TansatRequest | null>(null);

  // ── Plan lookup index ────────────────────────────────────────────────────
  const planById = useMemo(() => {
    const m = new Map<string, Plan>();
    for (const p of plans) m.set(p.id, p);
    return m;
  }, [plans]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return requests.filter(r => {
      if (statusFilter === 'unpaid') {
        if (r.status === 'paid' || r.status === 'posted' || r.status === 'active' || r.status === 'closed') return false;
      } else if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (activityFilter !== 'all' && r.activity !== activityFilter) return false;
      if (unlinkedOnly && !!r.planId && planById.has(r.planId)) return false;
      if (q) {
        const planText = (r.planId && planById.get(r.planId)?.loc) || r.importedPlanText || '';
        const hay = [
          r.logNumber ?? '',
          planText,
          r.activity,
          r.activityOther ?? '',
          r.workArea?.street ?? '',
          r.notes ?? '',
        ].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [requests, statusFilter, activityFilter, unlinkedOnly, searchQuery, planById]);

  // ── Header rollups ───────────────────────────────────────────────────────
  const totalSpend = getTotalPaid(requests);
  const monthlySpend = getMonthlySpend(requests, getCurrentMonthKey());
  const needsAttention = getRequestsNeedingAttention(plans, requests, appConfig?.tansatSettings);

  // ── CSV export — column shape mirrors Justin's xlsx for accounting ───────
  const exportCsv = () => {
    const rows = [
      ['Log #', 'Plan/Location', 'Activity', 'Phases', 'Date Range', 'Money', 'Status', 'Notes'],
      ...filtered.map(r => {
        const planLabel = (r.planId && planById.get(r.planId)?.loc) || r.importedPlanText || '';
        const dateRange = r.schedule?.startDate
          ? `${r.schedule.startDate} → ${r.schedule.endDate}`
          : '';
        const phases = (r.phaseNumbers ?? []).map(n => `P${n}`).join(',');
        return [
          r.logNumber ?? '',
          planLabel,
          r.activity === 'other' && r.activityOther ? r.activityOther : ACTIVITY_LABELS[r.activity] ?? r.activity,
          phases,
          dateRange,
          r.paidAmount != null ? `$${r.paidAmount.toFixed(2)}` : '',
          r.status,
          (r.notes ?? '').replace(/[\r\n]+/g, ' '),
        ];
      }),
    ];
    const csv = rows.map(r => r.map(cell => {
      const s = String(cell);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tansat_log_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Activity options for filter dropdown ─────────────────────────────────
  const activityOptions = useMemo(() => {
    const seen = new Set<TansatActivity>();
    requests.forEach(r => seen.add(r.activity));
    return Array.from(seen).sort();
  }, [requests]);

  return (
    <div className="space-y-4">
      {/* Header summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard label="Total requests" value={String(requests.length)} />
        <SummaryCard label="All-time spend" value={fmtMoney(totalSpend)} accent="emerald" />
        <SummaryCard label="This month" value={fmtMoney(monthlySpend.total)} accent="blue" />
        <SummaryCard label="Needs attention" value={String(needsAttention.length)} accent={needsAttention.length > 0 ? 'red' : 'gray'} />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="text"
          placeholder="Search log #, plan, activity, notes…"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm flex-1 min-w-[220px] focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as TansatStatus | 'all' | 'unpaid')}
          className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm"
        >
          <option value="all">All status</option>
          <option value="unpaid">Unpaid (any)</option>
          <option value="draft">Draft</option>
          <option value="emailed">Emailed</option>
          <option value="invoice_received">Invoice received</option>
          <option value="paid">Paid</option>
          <option value="posted">Posted</option>
          <option value="active">Active</option>
          <option value="closed">Closed</option>
          <option value="cancelled">Cancelled</option>
          <option value="expired">Expired</option>
        </select>
        <select
          value={activityFilter}
          onChange={e => setActivityFilter(e.target.value as TansatActivity | 'all')}
          className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm"
        >
          <option value="all">All activities</option>
          {activityOptions.map(a => (
            <option key={a} value={a}>{ACTIVITY_LABELS[a] ?? a}</option>
          ))}
        </select>
        <label className="text-xs font-semibold inline-flex items-center gap-1.5">
          <input type="checkbox" checked={unlinkedOnly} onChange={e => setUnlinkedOnly(e.target.checked)} />
          Unlinked imports only
        </label>
        <button
          onClick={exportCsv}
          className="ml-auto text-xs font-bold px-3 py-1.5 rounded border border-slate-300 hover:bg-slate-50"
        >
          ⬇ Export CSV
        </button>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-slate-200 overflow-hidden bg-white">
        <table className="w-full text-xs">
          <thead className="bg-slate-50">
            <tr className="text-[9px] uppercase tracking-wider text-slate-500">
              <th className="text-left px-2 py-2 font-bold">Log #</th>
              <th className="text-left px-2 py-2 font-bold">Plan</th>
              <th className="text-left px-2 py-2 font-bold">Activity</th>
              <th className="text-left px-2 py-2 font-bold">Phases</th>
              <th className="text-left px-2 py-2 font-bold">Schedule</th>
              <th className="text-right px-2 py-2 font-bold">Amount</th>
              <th className="text-right px-2 py-2 font-bold">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-400 italic text-sm">
                  No TANSAT requests match the current filters.
                </td>
              </tr>
            ) : (
              filtered.map(r => {
                const linkedPlan = r.planId ? planById.get(r.planId) : undefined;
                return (
                  <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-2 py-2 font-mono font-bold text-slate-700">
                      {r.logNumber || <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-2 py-2">
                      {linkedPlan ? (
                        <button
                          onClick={() => setSelectedPlan(linkedPlan)}
                          className="text-blue-700 font-mono font-bold hover:underline"
                        >
                          {linkedPlan.loc}
                        </button>
                      ) : (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="text-slate-400 italic text-[11px]">{r.importedPlanText || '— unlinked —'}</span>
                          <button
                            onClick={() => setLinkPickerFor(r)}
                            className="text-[10px] font-bold border border-slate-300 hover:border-blue-400 rounded px-1.5 py-0.5"
                            title="Link to a plan"
                          >
                            🔗 Link
                          </button>
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      {r.activity === 'other' && r.activityOther
                        ? r.activityOther
                        : ACTIVITY_LABELS[r.activity] ?? r.activity}
                    </td>
                    <td className="px-2 py-2"><PhaseChips numbers={r.phaseNumbers ?? []} /></td>
                    <td className="px-2 py-2 font-mono text-[10px] text-slate-600 whitespace-nowrap">
                      {r.schedule?.startDate
                        ? `${fmtDate(r.schedule.startDate)} → ${fmtDate(r.schedule.endDate)}`
                        : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-2 py-2 text-right font-mono font-bold">
                      {r.paidAmount != null ? fmtMoney(r.paidAmount) : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-2 py-2 text-right">
                      <TansatStatusPill status={r.status} />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Link picker modal */}
      {linkPickerFor && (
        <LinkToPlanModal
          request={linkPickerFor}
          plans={plans}
          onClose={() => setLinkPickerFor(null)}
          onPick={async (planId) => {
            await updateTansatRequest(linkPickerFor.id, { planId });
            setLinkPickerFor(null);
          }}
        />
      )}
    </div>
  );
};

// ── Summary card ────────────────────────────────────────────────────────────
const SummaryCard: React.FC<{ label: string; value: string; accent?: 'emerald' | 'blue' | 'red' | 'gray' }> = ({ label, value, accent = 'gray' }) => {
  const palette = {
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    blue:    'border-blue-200 bg-blue-50 text-blue-700',
    red:     'border-red-200 bg-red-50 text-red-700',
    gray:    'border-slate-200 bg-white text-slate-700',
  }[accent];
  return (
    <div className={`rounded-lg border ${palette} px-4 py-3`}>
      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</div>
      <div className="text-2xl font-bold font-mono mt-1">{value}</div>
    </div>
  );
};

// ── Link-to-plan modal ──────────────────────────────────────────────────────
const LinkToPlanModal: React.FC<{
  request: TansatRequest;
  plans: Plan[];
  onClose: () => void;
  onPick: (planId: string) => Promise<void>;
}> = ({ request, plans, onClose, onPick }) => {
  const [q, setQ] = useState('');
  const matches = useMemo(() => {
    const lc = q.trim().toLowerCase();
    if (!lc) return plans.slice(0, 20);
    return plans.filter(p => {
      const hay = [p.loc, p.id, p.street1, p.street2, p.scope, p.segment].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(lc);
    }).slice(0, 50);
  }, [plans, q]);

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/60 p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full my-8">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200">
          <div>
            <h3 className="text-sm font-bold">Link TANSAT to a Plan</h3>
            <p className="text-xs text-slate-500">
              Imported as <span className="italic font-mono">{request.importedPlanText || '—'}</span>
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-2xl leading-none">×</button>
        </div>
        <div className="p-4 space-y-3">
          <input
            type="text"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search by LOC #, street, segment…"
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            autoFocus
          />
          <div className="max-h-72 overflow-y-auto space-y-1 border border-slate-200 rounded">
            {matches.length === 0 ? (
              <div className="text-xs text-slate-400 italic p-3">No matches.</div>
            ) : matches.map(p => (
              <button
                key={p.id}
                onClick={() => onPick(p.id)}
                className="w-full text-left px-3 py-2 text-xs hover:bg-blue-50 border-b border-slate-100 last:border-b-0"
              >
                <span className="font-mono font-bold text-blue-700">{p.loc || p.id}</span>
                <span className="text-slate-500 ml-2">{p.street1}{p.street2 ? ` / ${p.street2}` : ''}</span>
                <span className="text-slate-400 text-[10px] ml-2">{p.type}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
