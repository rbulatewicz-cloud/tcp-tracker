import { useState } from 'react';
import { CheckCircle, AlertTriangle, ExternalLink, Mail, Home } from 'lucide-react';
import { Plan, DrivewayLetter, DrivewayAddress } from '../../types';
import { COMPLETED_STAGES } from '../../constants';
import { fmtDate as fmt } from '../../utils/plans';

// ── Status helpers ────────────────────────────────────────────────────────────

type DWStatus = 'no_track' | 'not_started' | 'in_progress' | 'sent' | 'complete' | 'na';

function getPlanDWStatus(plan: Plan): DWStatus {
  const track = plan.compliance?.drivewayNotices;
  if (!track) return 'no_track';
  if (track.status === 'na') return 'na';
  if (track.status === 'completed') return 'complete';
  if (track.status === 'sent') return 'sent';
  if (track.status === 'in_progress') return 'in_progress';
  return 'not_started';
}

const DW_STATUS_CONFIG: Record<DWStatus, { label: string; color: string; bg: string; dot: string }> = {
  no_track:    { label: 'Not Started',   color: '#991B1B', bg: '#FEE2E2',  dot: 'bg-red-400' },
  not_started: { label: 'Not Started',   color: '#991B1B', bg: '#FEE2E2',  dot: 'bg-red-400' },
  in_progress: { label: 'In Progress',   color: '#92400E', bg: '#FEF3C7',  dot: 'bg-amber-400' },
  sent:        { label: 'Sent',          color: '#1E40AF', bg: '#DBEAFE',  dot: 'bg-blue-400' },
  complete:    { label: 'Complete',      color: '#166534', bg: '#DCFCE7',  dot: 'bg-emerald-400' },
  na:          { label: 'N/A',           color: '#6B7280', bg: '#F3F4F6',  dot: 'bg-slate-300' },
};

function addrSummary(addresses: DrivewayAddress[]): string {
  if (addresses.length === 0) return 'No addresses';
  const sent = addresses.filter(a => a.noticeSent || a.letterStatus === 'sent').length;
  return `${sent} / ${addresses.length} sent`;
}

function letterStatusLabel(status: string): { label: string; color: string } {
  switch (status) {
    case 'sent':              return { label: 'Sent',           color: '#166534' };
    case 'approved':          return { label: 'Metro Approved', color: '#166534' };
    case 'submitted_to_metro':return { label: 'At Metro',       color: '#1E40AF' };
    case 'metro_revision_requested': return { label: 'Revision Needed', color: '#92400E' };
    case 'draft':             return { label: 'Draft',          color: '#92400E' };
    default:                  return { label: 'Not Drafted',    color: '#991B1B' };
  }
}

// ── Main component ────────────────────────────────────────────────────────────

type FilterTab = 'all' | 'needs_action' | 'in_progress' | 'complete';

export function DrivewayLinkerSection({
  plans,
  setSelectedPlan,
  letters,
}: {
  plans: Plan[];
  setSelectedPlan: (p: Plan | null) => void;
  letters: DrivewayLetter[];
}) {
  const [filterTab, setFilterTab] = useState<FilterTab>('needs_action');

  // All active plans with driveway impact
  const drivewayPlans = plans.filter(p =>
    p.impact_driveway &&
    !COMPLETED_STAGES.includes(p.stage)
  );

  // Letters indexed by planId
  const lettersByPlan: Record<string, DrivewayLetter[]> = {};
  for (const l of letters) {
    if (!lettersByPlan[l.planId]) lettersByPlan[l.planId] = [];
    lettersByPlan[l.planId].push(l);
  }

  // Group counts
  const needsAction = drivewayPlans.filter(p => ['no_track', 'not_started'].includes(getPlanDWStatus(p)));
  const inProgress  = drivewayPlans.filter(p => getPlanDWStatus(p) === 'in_progress');
  const complete    = drivewayPlans.filter(p => ['sent', 'complete', 'na'].includes(getPlanDWStatus(p)));

  const filteredPlans =
    filterTab === 'needs_action' ? needsAction :
    filterTab === 'in_progress'  ? inProgress :
    filterTab === 'complete'     ? complete :
    drivewayPlans;

  return (
    <div>
      {/* Summary bar */}
      <div className="flex items-center gap-6 mb-5 p-4 bg-slate-50 rounded-xl border border-slate-200">
        <div className="text-center">
          <div className="text-2xl font-black text-red-600">{needsAction.length}</div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Not Started</div>
        </div>
        <div className="w-px h-10 bg-slate-200" />
        <div className="text-center">
          <div className="text-2xl font-black text-amber-600">{inProgress.length}</div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">In Progress</div>
        </div>
        <div className="w-px h-10 bg-slate-200" />
        <div className="text-center">
          <div className="text-2xl font-black text-emerald-600">{complete.length}</div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Sent / Complete</div>
        </div>
        <div className="ml-auto text-[11px] text-slate-400 flex items-center gap-1.5">
          <Mail size={12} className="text-slate-400" />
          {drivewayPlans.length} plans with driveway impact
        </div>
      </div>

      {drivewayPlans.length === 0 && (
        <div className="text-center py-16 text-slate-400 text-sm">
          <Home size={36} className="mx-auto mb-3 text-slate-300" />
          No active plans with driveway impact flagged.
        </div>
      )}

      {drivewayPlans.length > 0 && (
        <>
          {/* Filter tabs */}
          <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit mb-5">
            {([
              { id: 'all'          as FilterTab, label: 'All',          count: drivewayPlans.length },
              { id: 'needs_action' as FilterTab, label: 'Needs Action', count: needsAction.length },
              { id: 'in_progress'  as FilterTab, label: 'In Progress',  count: inProgress.length },
              { id: 'complete'     as FilterTab, label: 'Complete',     count: complete.length },
            ]).map(t => (
              <button
                key={t.id}
                onClick={() => setFilterTab(t.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-semibold transition-colors ${
                  filterTab === t.id
                    ? 'bg-white text-slate-800 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {t.label}
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                  filterTab === t.id ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 text-slate-500'
                }`}>
                  {t.count}
                </span>
              </button>
            ))}
          </div>

          {filteredPlans.length === 0 && (
            <div className="text-center py-12 text-slate-400 text-sm">
              <CheckCircle size={28} className="mx-auto mb-2 text-emerald-400" />
              No plans in this category.
            </div>
          )}

          {/* Plan cards */}
          <div className="flex flex-col gap-2">
            {filteredPlans.map(plan => {
              const dwStatus = getPlanDWStatus(plan);
              const cfg = DW_STATUS_CONFIG[dwStatus];
              const track = plan.compliance?.drivewayNotices;
              const addresses = track?.addresses ?? [];
              const planLetters = lettersByPlan[plan.id] ?? [];
              const isAlert = dwStatus === 'no_track' || dwStatus === 'not_started';

              // Check for date-shift warnings on any address
              const hasDateShift = addresses.some(a =>
                a.sentWindowStart &&
                a.letterStatus === 'sent' &&
                !a.dateShiftDismissed &&
                plan.implementationWindow &&
                (plan.implementationWindow.startDate !== a.sentWindowStart ||
                 plan.implementationWindow.endDate !== a.sentWindowEnd)
              );

              return (
                <div
                  key={plan.id}
                  className={`border rounded-xl p-4 transition-all ${
                    isAlert
                      ? 'border-red-200 bg-red-50/30'
                      : hasDateShift
                      ? 'border-amber-300 bg-amber-50/20'
                      : 'border-slate-200 bg-white'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      {/* Top row */}
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-bold text-slate-800 text-[13px]">{plan.loc || plan.id}</span>
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`} />
                        <span
                          className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                          style={{ background: cfg.bg, color: cfg.color }}
                        >
                          {cfg.label}
                        </span>
                        {hasDateShift && (
                          <span className="flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                            <AlertTriangle size={9} />
                            Date shift — may need reissue
                          </span>
                        )}
                      </div>

                      {/* Street + segment */}
                      <div className="text-[11px] text-slate-500 mb-2">
                        {[plan.street1, plan.street2].filter(Boolean).join(' / ')}
                        {plan.segment && <span className="ml-2 text-[10px] font-bold bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">Seg {plan.segment}</span>}
                        {plan.needByDate && <span className="ml-2">· NB {fmt(plan.needByDate)}</span>}
                      </div>

                      {/* Address + letter summary */}
                      <div className="flex flex-wrap items-center gap-3 text-[11px]">
                        {addresses.length > 0 ? (
                          <span className="flex items-center gap-1 text-slate-600">
                            <Home size={10} />
                            {addrSummary(addresses)}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[10px]">No addresses on file</span>
                        )}

                        {planLetters.length > 0 && (
                          <span className="flex items-center gap-1 text-slate-500">
                            <Mail size={10} />
                            {planLetters.length} letter{planLetters.length !== 1 ? 's' : ''} in library
                            <span className="text-slate-400">
                              ({planLetters.filter(l => l.status === 'sent' || l.status === 'approved').length} sent)
                            </span>
                          </span>
                        )}

                        {/* Per-address statuses (first 4) */}
                        {addresses.slice(0, 4).map((addr, i) => {
                          const ls = letterStatusLabel(addr.letterStatus ?? 'not_drafted');
                          return (
                            <span
                              key={i}
                              className="text-[10px] px-1.5 py-0.5 rounded border"
                              style={{ color: ls.color, borderColor: ls.color + '44', background: ls.color + '11' }}
                            >
                              {addr.address.split(',')[0]} — {ls.label}
                            </span>
                          );
                        })}
                        {addresses.length > 4 && (
                          <span className="text-[10px] text-slate-400">+{addresses.length - 4} more</span>
                        )}
                      </div>
                    </div>

                    <button
                      onClick={() => setSelectedPlan(plan)}
                      className="flex-shrink-0 flex items-center gap-1.5 text-[11px] font-semibold text-blue-600 hover:text-blue-700 border border-blue-200 rounded-lg px-2.5 py-1.5 transition-colors"
                    >
                      <ExternalLink size={11} />
                      Open Plan
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
