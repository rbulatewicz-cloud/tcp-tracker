import React, { useEffect, useMemo, useState } from 'react';
import { ParkingSquare } from 'lucide-react';
import type {
  AppConfig, Plan, TansatRequest, TansatStatus,
} from '../types';
import { subscribeToTansatRequests } from '../services/tansatService';
import {
  getRequestsNeedingAttention, getMonthlySpend, getCurrentMonthKey,
  getRequestsByStatus, TansatAttentionItem,
} from '../utils/tansatSpend';
import { getPlansOverdueWithDot, DOT_LEVEL_COLORS } from '../utils/dotOverdue';
import {
  ACTIVITY_LABELS, fmtMoney, PhaseChips,
} from '../components/PlanCardSections/tansat/tansatShared';
import { fmtDate } from '../utils/plans';

interface MotHubViewProps {
  currentUser: { name?: string; displayName?: string; email?: string } | null;
  appConfig: AppConfig;
  plans: Plan[];
  setSelectedPlan: (plan: Plan | null) => void;
  setView: (view: string) => void;
}

/**
 * T-5.5 — MOT Hub view.
 *
 * Mirrors the CR Hub pattern Paula uses. Action-oriented landing page for
 * Justin / Dale / Garrett: opens to "what needs me today" rather than the
 * full historical Library. Future-proofs for sidewalk/crosswalk + I-5/UPRR
 * encroachment workflows.
 *
 * 7 triage cards per spec §5.7:
 *   1. 🔴 TANSAT — needs packet      (red)
 *   2. 🔴 TANSAT — payment due       (red)
 *   3. 🔴 DOT pipeline overdue       (red)
 *   4. 🟡 TANSAT — extension window  (amber)
 *   5. 🟡 TANSAT — awaiting invoice  (amber)
 *   6. ⚪ TANSAT — close-out pending (gray)
 *   7. 🟢 Today's spend tracker      (info, full-width)
 */
export default function MotHubView({ currentUser, appConfig, plans, setSelectedPlan, setView }: MotHubViewProps) {
  const [requests, setRequests] = useState<TansatRequest[]>([]);
  useEffect(() => {
    const unsub = subscribeToTansatRequests(setRequests);
    return () => unsub();
  }, []);

  const settings = appConfig?.tansatSettings;
  const monthSpend = getMonthlySpend(requests, getCurrentMonthKey());

  // Group attention items by reason for the cards
  const attention = useMemo(
    () => getRequestsNeedingAttention(plans, requests, settings),
    [plans, requests, settings],
  );
  const byReason = useMemo(() => {
    const map: Record<string, TansatAttentionItem[]> = {
      needs_packet: [], awaiting_invoice: [], payment_due: [],
      extension_window: [], closeout_pending: [],
    };
    for (const item of attention) {
      const arr = map[item.reason];
      if (arr) arr.push(item);
    }
    return map;
  }, [attention]);

  // DOT pipeline overdue — surfaces alongside TANSAT triage
  const activePlans = useMemo(
    () => plans.filter(p => !['approved','plan_approved','implemented','tcp_approved_final','closed','cancelled','expired'].includes(p.stage) && !p.isHistorical),
    [plans],
  );
  const dotOverdueRows = getPlansOverdueWithDot(activePlans, appConfig, { includeWarnings: true });
  const dotOverdueOnly = dotOverdueRows.filter(r => r.status.level === 'overdue');

  // Last 5 paid requests for the spend tracker
  const recentlyPaid = useMemo(
    () => getRequestsByStatus(requests, 'paid', 'posted', 'active', 'closed' as TansatStatus)
      .filter(r => r.paidAt)
      .sort((a, b) => (b.paidAt ?? '').localeCompare(a.paidAt ?? ''))
      .slice(0, 5),
    [requests],
  );
  const ytdSpend = useMemo(() => {
    const yyyy = new Date().getFullYear();
    return requests.reduce((sum, r) => {
      if (!r.paidAt || r.paidAmount == null) return sum;
      if (!r.paidAt.startsWith(String(yyyy))) return sum;
      return sum + r.paidAmount;
    }, 0);
  }, [requests]);

  const planById = useMemo(() => {
    const m = new Map<string, Plan>();
    plans.forEach(p => m.set(p.id, p));
    return m;
  }, [plans]);

  const urgentCount = byReason.needs_packet.filter(i => i.severity === 'red').length
    + byReason.payment_due.length + dotOverdueOnly.length;
  const weekCount = byReason.extension_window.length + byReason.awaiting_invoice.length;

  const greetName = currentUser?.name ?? currentUser?.displayName ?? 'team';
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  const openPlanFromItem = (item: TansatAttentionItem) => {
    const planId = item.plan?.id ?? item.request?.planId;
    if (!planId) return;
    const plan = planById.get(planId);
    if (plan) setSelectedPlan(plan);
  };

  return (
    <div className="max-w-6xl mx-auto px-6 pt-8 pb-12">
      {/* Header bar */}
      <div className="flex items-center justify-between rounded-xl bg-slate-900 text-white px-5 py-4 mb-5">
        <div>
          <div className="text-xl font-extrabold flex items-center gap-2">
            <ParkingSquare size={20} /> MOT Hub
          </div>
          <div className="text-xs text-slate-300 mt-0.5">
            Good morning, {greetName} · {today} · {attention.length + dotOverdueOnly.length} item{attention.length + dotOverdueOnly.length === 1 ? '' : 's'} need attention
          </div>
        </div>
        <div className="flex gap-5">
          <Stat value={urgentCount} label="Urgent" tone="red" />
          <Stat value={weekCount} label="This week" tone="amber" />
          <Stat value={fmtMoney(monthSpend.total)} label="Spent this month" tone="emerald" />
        </div>
      </div>

      {/* Triage card grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5">
        <NeedsPacketCard items={byReason.needs_packet} onOpen={openPlanFromItem} />
        <PaymentDueCard items={byReason.payment_due} onOpen={openPlanFromItem} />
        <DotOverdueCard rows={dotOverdueOnly} onOpen={r => setSelectedPlan(r)} setView={setView} />
        <ExtensionWindowCard items={byReason.extension_window} onOpen={openPlanFromItem} />
        <AwaitingInvoiceCard items={byReason.awaiting_invoice} onOpen={openPlanFromItem} />
        <CloseoutCard items={byReason.closeout_pending} onOpen={openPlanFromItem} />
      </div>

      {/* Spend tracker — full-width */}
      <SpendTrackerCard
        recentlyPaid={recentlyPaid}
        monthTotal={monthSpend.total}
        ytdTotal={ytdSpend}
        planById={planById}
        onOpenLibrary={() => setView('variances')}
      />

      <p className="text-xs text-slate-400 mt-6 text-center italic">
        💡 Tip: TANSAT actions live on the plan card too — open any plan and expand the TANSAT section to log invoices, mark paid, or file extensions.
      </p>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

const Stat: React.FC<{ value: number | string; label: string; tone: 'red' | 'amber' | 'emerald' }> = ({ value, label, tone }) => {
  const fg = { red: '#F87171', amber: '#FCD34D', emerald: '#34D399' }[tone];
  const sub = { red: '#FCA5A5', amber: '#FDE68A', emerald: '#6EE7B7' }[tone];
  return (
    <div className="text-center">
      <div className="text-2xl font-extrabold" style={{ color: fg }}>{value}</div>
      <div className="text-[10px] uppercase tracking-wider font-bold" style={{ color: sub }}>{label}</div>
    </div>
  );
};

interface CardShellProps {
  title: string;
  emoji: string;
  count: number;
  description: string;
  tone: 'red' | 'amber' | 'gray';
  children: React.ReactNode;
  onViewAll?: () => void;
}

const CardShell: React.FC<CardShellProps> = ({ title, emoji, count, description, tone, children, onViewAll }) => {
  const palette = {
    red:   { border: 'border-red-300',    bg: 'bg-red-50',     text: 'text-red-800',     desc: 'text-red-700',    pill: 'bg-red-100 text-red-700' },
    amber: { border: 'border-amber-300',  bg: 'bg-amber-50',   text: 'text-amber-900',   desc: 'text-amber-800',  pill: 'bg-amber-100 text-amber-800' },
    gray:  { border: 'border-slate-300',  bg: 'bg-slate-50',   text: 'text-slate-700',   desc: 'text-slate-500',  pill: 'bg-slate-100 text-slate-600' },
  }[tone];
  return (
    <div className={`rounded-xl border-2 ${palette.border} ${palette.bg} p-3 flex flex-col`}>
      <div className="flex items-center justify-between mb-2">
        <div className={`text-sm font-bold ${palette.text}`}>{emoji} {title}</div>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${palette.pill}`}>{count}</span>
      </div>
      <div className={`text-[11px] mb-2 ${palette.desc}`}>{description}</div>
      <div className="space-y-1.5 flex-1">{children}</div>
      {count > 0 && onViewAll && (
        <button onClick={onViewAll} className="mt-2 w-full text-[11px] font-bold border border-slate-300 bg-white rounded py-1 hover:bg-slate-50">
          View all {count} →
        </button>
      )}
    </div>
  );
};

const Row: React.FC<{ children: React.ReactNode; onClick?: () => void }> = ({ children, onClick }) => (
  <div
    onClick={onClick}
    className={`bg-white border border-slate-200 rounded-md px-2 py-1.5 ${onClick ? 'cursor-pointer hover:border-blue-400' : ''}`}
  >
    {children}
  </div>
);

const NeedsPacketCard: React.FC<{ items: TansatAttentionItem[]; onOpen: (i: TansatAttentionItem) => void }> = ({ items, onOpen }) => (
  <CardShell
    emoji="🔴" title="TANSAT — Needs Packet" count={items.length} tone="red"
    description="Phase starts within the threshold and no TANSAT request has been built yet."
  >
    {items.length === 0 ? (
      <div className="text-[11px] text-slate-400 italic">All phases covered ✓</div>
    ) : (
      items.slice(0, 5).map((item, i) => (
        <Row key={i} onClick={() => onOpen(item)}>
          <div className="text-xs font-bold">{item.plan?.loc ?? item.plan?.id ?? '—'} · Phase {item.phase?.phaseNumber}</div>
          <div className="text-[10px] text-slate-600">{item.detail}</div>
        </Row>
      ))
    )}
  </CardShell>
);

const PaymentDueCard: React.FC<{ items: TansatAttentionItem[]; onOpen: (i: TansatAttentionItem) => void }> = ({ items, onOpen }) => (
  <CardShell
    emoji="🔴" title="TANSAT — Payment Due" count={items.length} tone="red"
    description="Invoice received, payment due window approaching."
  >
    {items.length === 0 ? (
      <div className="text-[11px] text-slate-400 italic">No payments due 🎉</div>
    ) : (
      items.slice(0, 5).map((item, i) => (
        <Row key={i} onClick={() => onOpen(item)}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold font-mono">LOG #{item.request?.logNumber ?? '—'}</span>
            <span className="text-xs font-bold text-red-700 font-mono">
              {item.request?.invoiceAmount != null ? fmtMoney(item.request.invoiceAmount) : '—'}
            </span>
          </div>
          <div className="text-[10px] text-slate-600">{item.detail}</div>
        </Row>
      ))
    )}
  </CardShell>
);

const DotOverdueCard: React.FC<{ rows: ReturnType<typeof getPlansOverdueWithDot>; onOpen: (p: Plan) => void; setView: (v: string) => void }> = ({ rows, onOpen, setView }) => (
  <CardShell
    emoji="🔴" title="DOT Pipeline — Overdue" count={rows.length} tone="red"
    description="Plans submitted but past SLA target with DOT."
    onViewAll={() => setView('table')}
  >
    {rows.length === 0 ? (
      <div className="text-[11px] text-slate-400 italic">DOT responding on time ✓</div>
    ) : (
      rows.slice(0, 5).map(({ plan, status }, i) => {
        const colors = DOT_LEVEL_COLORS[status.level];
        return (
          <Row key={i} onClick={() => onOpen(plan)}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold font-mono">{plan.loc || plan.id}</span>
              <span style={{ background: colors.bg, color: colors.fg, border: `1px solid ${colors.border}` }} className="text-[9px] font-bold px-1.5 py-0.5 rounded">
                {status.daysOpen}d
              </span>
            </div>
            <div className="text-[10px] text-slate-600 truncate">{plan.street1}</div>
          </Row>
        );
      })
    )}
  </CardShell>
);

const ExtensionWindowCard: React.FC<{ items: TansatAttentionItem[]; onOpen: (i: TansatAttentionItem) => void }> = ({ items, onOpen }) => (
  <CardShell
    emoji="🟡" title="TANSAT — Extension Window" count={items.length} tone="amber"
    description="Phase ends ≤ 10 business days. File extension if work overruns."
  >
    {items.length === 0 ? (
      <div className="text-[11px] text-slate-400 italic">All clear</div>
    ) : (
      items.slice(0, 5).map((item, i) => (
        <Row key={i} onClick={() => onOpen(item)}>
          <div className="text-xs font-bold font-mono">LOG #{item.request?.logNumber ?? '—'}</div>
          <div className="text-[10px] text-slate-600">{item.detail}</div>
        </Row>
      ))
    )}
  </CardShell>
);

const AwaitingInvoiceCard: React.FC<{ items: TansatAttentionItem[]; onOpen: (i: TansatAttentionItem) => void }> = ({ items, onOpen }) => (
  <CardShell
    emoji="🟡" title="TANSAT — Awaiting Invoice" count={items.length} tone="amber"
    description="Emailed Reggie > 7 days ago, no log # received yet."
  >
    {items.length === 0 ? (
      <div className="text-[11px] text-slate-400 italic">No outstanding follow-ups</div>
    ) : (
      items.slice(0, 5).map((item, i) => (
        <Row key={i} onClick={() => onOpen(item)}>
          <div className="text-xs font-bold">
            {(item.request?.planId && item.request?.activity)
              ? `Plan ${item.request.planId} · ${ACTIVITY_LABELS[item.request.activity] ?? item.request.activity}`
              : '—'}
          </div>
          <div className="text-[10px] text-slate-600">{item.detail}</div>
        </Row>
      ))
    )}
  </CardShell>
);

const CloseoutCard: React.FC<{ items: TansatAttentionItem[]; onOpen: (i: TansatAttentionItem) => void }> = ({ items, onOpen }) => (
  <CardShell
    emoji="⚪" title="TANSAT — Close-out Pending" count={items.length} tone="gray"
    description="Work end date passed, status not yet closed."
  >
    {items.length === 0 ? (
      <div className="text-[11px] text-slate-400 italic">All closed</div>
    ) : (
      items.slice(0, 5).map((item, i) => (
        <Row key={i} onClick={() => onOpen(item)}>
          <div className="text-xs font-bold font-mono">LOG #{item.request?.logNumber ?? '—'}</div>
          <div className="text-[10px] text-slate-600">{item.detail}</div>
        </Row>
      ))
    )}
  </CardShell>
);

const SpendTrackerCard: React.FC<{
  recentlyPaid: TansatRequest[];
  monthTotal: number;
  ytdTotal: number;
  planById: Map<string, Plan>;
  onOpenLibrary: () => void;
}> = ({ recentlyPaid, monthTotal, ytdTotal, planById, onOpenLibrary }) => (
  <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50 p-4">
    <div className="flex items-center justify-between mb-3">
      <div className="text-sm font-bold text-emerald-900">🟢 Today's Spend Tracker</div>
      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
        {fmtMoney(monthTotal)} this month
      </span>
    </div>
    {recentlyPaid.length === 0 ? (
      <div className="text-xs text-slate-500 italic">No paid TANSAT requests yet.</div>
    ) : (
      <div className="overflow-hidden rounded border border-emerald-200 bg-white">
        <table className="w-full text-xs">
          <thead className="bg-emerald-50">
            <tr className="text-[9px] uppercase tracking-wider text-emerald-700">
              <th className="text-left px-2 py-1.5 font-bold">Last 5 paid</th>
              <th className="text-left px-2 py-1.5 font-bold">Plan</th>
              <th className="text-left px-2 py-1.5 font-bold">Activity</th>
              <th className="text-left px-2 py-1.5 font-bold">Phases</th>
              <th className="text-left px-2 py-1.5 font-bold">Paid</th>
              <th className="text-right px-2 py-1.5 font-bold">Amount</th>
            </tr>
          </thead>
          <tbody>
            {recentlyPaid.map(r => {
              const plan = r.planId ? planById.get(r.planId) : undefined;
              return (
                <tr key={r.id} className="border-t border-emerald-100">
                  <td className="px-2 py-1.5 font-mono font-bold">{r.logNumber || '—'}</td>
                  <td className="px-2 py-1.5">{plan?.loc ?? r.importedPlanText ?? '—'}</td>
                  <td className="px-2 py-1.5">{ACTIVITY_LABELS[r.activity] ?? r.activity}</td>
                  <td className="px-2 py-1.5"><PhaseChips numbers={r.phaseNumbers ?? []} /></td>
                  <td className="px-2 py-1.5 font-mono text-[10px]">{r.paidAt ? fmtDate(r.paidAt) : '—'}</td>
                  <td className="px-2 py-1.5 text-right font-mono font-bold">{fmtMoney(r.paidAmount)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    )}
    <div className="flex items-center justify-between mt-2 text-[10px]">
      <span className="text-emerald-800">YTD: <b>{fmtMoney(ytdTotal)}</b></span>
      <button onClick={onOpenLibrary} className="text-emerald-800 hover:underline font-bold">View Library Log →</button>
    </div>
  </div>
);
