import { useMemo, useState, useEffect } from 'react';
import { Plan, AppConfig, NoiseVariance, DrivewayAddress } from '../types';
import { pheProgress, cdProgress, COMPLIANCE_STATUS_LABELS, CD_STATUS_LABELS, DRIVEWAY_STATUS_LABELS } from '../utils/compliance';
import { subscribeToVariances, getVarianceExpiryStatus, daysUntilExpiry } from '../services/varianceService';
import { VarianceLetterModal } from '../components/VarianceLetterModal';
import { DrivewayNoticeModal } from '../components/DrivewayNoticeModal';

interface ComplianceViewProps {
  plans: Plan[];
  setSelectedPlan: (plan: Plan) => void;
  setView: (view: string) => void;
  appConfig: AppConfig;
}

// ── Small helpers ──────────────────────────────────────────────────────────────

function StatusPill({ status, small }: { status: string; small?: boolean }) {
  const colors: Record<string, string> = {
    not_started:     'bg-slate-100 text-slate-500',
    in_progress:     'bg-blue-50 text-blue-700',
    linked_existing: 'bg-violet-50 text-violet-700',
    submitted:       'bg-amber-50 text-amber-700',
    approved:        'bg-emerald-50 text-emerald-700',
    expired:         'bg-red-50 text-red-600',
    // driveway
    sent:            'bg-amber-50 text-amber-700',
    completed:       'bg-emerald-50 text-emerald-700',
    na:              'bg-slate-50 text-slate-400',
    // CD statuses
    pending:           'bg-slate-100 text-slate-500',
    presentation_sent: 'bg-blue-50 text-blue-700',
    meeting_scheduled: 'bg-indigo-50 text-indigo-700',
    concurred:         'bg-emerald-50 text-emerald-700',
    declined:          'bg-red-50 text-red-600',
  };
  const label = COMPLIANCE_STATUS_LABELS[status] ?? DRIVEWAY_STATUS_LABELS[status] ?? CD_STATUS_LABELS[status] ?? status;
  return (
    <span className={`inline-block rounded-full font-semibold ${small ? 'px-1.5 py-0.5 text-[9px]' : 'px-2 py-0.5 text-[10px]'} ${colors[status] ?? 'bg-slate-100 text-slate-500'}`}>
      {label}
    </span>
  );
}

function ProgressBar({ pct }: { pct: number }) {
  const color = pct === 100 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-400' : 'bg-red-400';
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] font-bold text-slate-500 w-6 text-right">{pct}%</span>
    </div>
  );
}

function PlanRow({ plan, onClick }: { plan: Plan; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 transition-colors group"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[11px] font-bold text-slate-700 group-hover:text-blue-600 transition-colors">
          {plan.loc || plan.id}
        </span>
        <span className="text-[10px] text-slate-400 truncate flex-1 min-w-0">
          {plan.street1}{plan.street2 ? ` / ${plan.street2}` : ''}
        </span>
      </div>
    </button>
  );
}

function SectionHeader({ title, count, color }: { title: string; count: number; color: string }) {
  return (
    <div className={`px-4 py-3 rounded-t-xl border-b border-slate-100 flex items-center justify-between ${color}`}>
      <span className="text-[12px] font-bold text-slate-800">{title}</span>
      <span className="text-[10px] font-bold bg-white/60 text-slate-600 px-2 py-0.5 rounded-full">
        {count} active
      </span>
    </div>
  );
}

// ── Main view ──────────────────────────────────────────────────────────────────

export function ComplianceView({ plans, setSelectedPlan, setView, appConfig }: ComplianceViewProps) {
  const [libraryVariances, setLibraryVariances] = useState<NoiseVariance[]>([]);
  useEffect(() => subscribeToVariances(setLibraryVariances), []);

  const [letterPlan, setLetterPlan] = useState<Plan | null>(null);
  const [draftNoticePlan, setDraftNoticePlan] = useState<Plan | null>(null);
  const [draftNoticeAddress, setDraftNoticeAddress] = useState<DrivewayAddress | null>(null);
  const [communityFilter, setCommunityFilter] = useState<'all' | 'driveway' | 'bus_stop'>('all');

  const openPlan = (plan: Plan) => {
    setSelectedPlan(plan);
    setView('table');
  };

  // All plans with each compliance track
  const allPheItems = useMemo(() =>
    plans.filter(p => p.compliance?.phe).map(p => {
      const phe = p.compliance!.phe!;
      const { done, total, pct } = pheProgress(phe);
      return { plan: p, phe, done, total, pct };
    }),
    [plans]
  );

  const allNvItems = useMemo(() =>
    plans.filter(p => p.compliance?.noiseVariance).map(p => ({
      plan: p,
      nv: p.compliance!.noiseVariance!,
    })),
    [plans]
  );

  const allCdItems = useMemo(() =>
    plans.filter(p => p.compliance?.cdConcurrence).map(p => {
      const cd = p.compliance!.cdConcurrence!;
      const { done, total, pct } = cdProgress(cd.cds);
      return { plan: p, cd, done, total, pct };
    }),
    [plans]
  );

  // Community notices — plans with driveway or bus stop impact
  const allCommunityItems = useMemo(() =>
    plans.filter(p => p.impact_driveway || p.impact_busStop).map(p => ({
      plan: p,
      dn: p.compliance?.drivewayNotices,
    })),
    [plans]
  );

  // Action items only — filter out resolved tracks
  const DONE_STATUSES = ['approved', 'linked_existing'];
  const pheItems = allPheItems.filter(i => !DONE_STATUSES.includes(i.phe.status));
  const nvItems  = allNvItems.filter(i => !DONE_STATUSES.includes(i.nv.status));
  const cdItems  = allCdItems.filter(i => i.pct < 100);
  const communityActionItems = allCommunityItems.filter(i =>
    !i.dn || !['completed', 'na'].includes(i.dn.status)
  );

  // Summary stats
  const pheDone = allPheItems.length - pheItems.length;
  const nvDone  = allNvItems.length - nvItems.length;
  const cdDone  = allCdItems.length - cdItems.length;
  const communityDone = allCommunityItems.length - communityActionItems.length;

  // Filtered community list
  const filteredCommunity = communityActionItems.filter(i => {
    if (communityFilter === 'driveway') return i.plan.impact_driveway;
    if (communityFilter === 'bus_stop') return i.plan.impact_busStop;
    return true;
  });

  // Resolve linked variance for the letter modal
  const letterLinkedVariance = letterPlan?.compliance?.noiseVariance?.linkedVarianceId
    ? libraryVariances.find(v =>
        v.id === letterPlan.compliance!.noiseVariance!.linkedVarianceId ||
        (v.parentVarianceId ?? v.id) === letterPlan.compliance!.noiseVariance!.linkedVarianceId
      ) ?? null
    : null;

  return (
    <div className="p-6 max-w-[1400px] mx-auto">

      {/* Page title */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-900">Compliance Action Items</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Plans with outstanding compliance or community notice requirements. Resolved items drop off automatically.
        </p>
      </div>

      {/* Summary stat strip — 4 cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'PHE Needs Action',       value: pheItems.length,           sub: `${pheDone} of ${allPheItems.length} resolved`,         color: pheItems.length > 0           ? 'bg-orange-50 border-orange-200'  : 'bg-emerald-50 border-emerald-100' },
          { label: 'NV Needs Action',         value: nvItems.length,            sub: `${nvDone} of ${allNvItems.length} resolved`,            color: nvItems.length  > 0           ? 'bg-violet-50 border-violet-200'  : 'bg-emerald-50 border-emerald-100' },
          { label: 'CD Needs Action',         value: cdItems.length,            sub: `${cdDone} of ${allCdItems.length} resolved`,            color: cdItems.length  > 0           ? 'bg-blue-50 border-blue-200'      : 'bg-emerald-50 border-emerald-100' },
          { label: 'Community Needs Action',  value: communityActionItems.length, sub: `${communityDone} of ${allCommunityItems.length} resolved`, color: communityActionItems.length > 0 ? 'bg-green-50 border-green-200'   : 'bg-emerald-50 border-emerald-100' },
        ].map(s => (
          <div key={s.label} className={`rounded-xl border px-4 py-3 ${s.color}`}>
            <div className={`text-2xl font-bold ${s.value > 0 ? 'text-slate-800' : 'text-emerald-600'}`}>{s.value}</div>
            <div className="text-[11px] font-semibold text-slate-600">{s.label}</div>
            <div className="text-[10px] text-slate-400 mt-0.5">{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Three-column layout — regulatory tracks */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-6">

        {/* ── PHE Column ── */}
        <div className="rounded-xl border border-slate-200 bg-white flex flex-col overflow-hidden">
          <SectionHeader title="Peak Hour Exemption" count={pheItems.length} color="bg-orange-50" />
          {pheItems.length === 0 ? (
            <div className="px-4 py-8 text-center text-[12px] text-emerald-600 font-semibold">✓ All caught up</div>
          ) : (
            <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
              {pheItems.map(({ plan, phe, done, total, pct }) => (
                <div key={plan.id} className="px-3 py-3">
                  <PlanRow plan={plan} onClick={() => openPlan(plan)} />
                  <div className="px-3 mt-1.5 flex flex-col gap-1.5">
                    <div className="flex items-center gap-2">
                      <StatusPill status={phe.status} />
                      {phe.boePermitNumber && (
                        <span className="text-[10px] font-mono text-slate-500">BOE #{phe.boePermitNumber}</span>
                      )}
                    </div>
                    <ProgressBar pct={pct} />
                    <div className="text-[10px] text-slate-400">{done}/{total} checklist items</div>
                    {phe.submittedDate && (
                      <div className="text-[10px] text-slate-400">Submitted: {phe.submittedDate}</div>
                    )}
                    {phe.approvalDate && (
                      <div className="text-[10px] text-emerald-600 font-semibold">Approved: {phe.approvalDate}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── NV Column ── */}
        <div className="rounded-xl border border-slate-200 bg-white flex flex-col overflow-hidden">
          <SectionHeader title="Noise Variance" count={nvItems.length} color="bg-violet-50" />
          {nvItems.length === 0 ? (
            <div className="px-4 py-8 text-center text-[12px] text-emerald-600 font-semibold">✓ All caught up</div>
          ) : (
            <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
              {nvItems.map(({ plan, nv }) => {
                const linked = nv.linkedVarianceId
                  ? libraryVariances.find(v =>
                      v.id === nv.linkedVarianceId ||
                      (v.parentVarianceId ?? v.id) === nv.linkedVarianceId
                    )
                  : null;
                const expiryStatus = linked ? getVarianceExpiryStatus(linked) : null;
                const days = linked ? daysUntilExpiry(linked) : null;
                const expiryColors: Record<string, string> = {
                  expired:  'text-red-600 font-bold',
                  critical: 'text-orange-500 font-bold',
                  warning:  'text-amber-600 font-semibold',
                  valid:    'text-emerald-600',
                };
                return (
                  <div key={plan.id} className="px-3 py-3">
                    <PlanRow plan={plan} onClick={() => openPlan(plan)} />
                    <div className="px-3 mt-1.5 flex flex-col gap-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <StatusPill status={nv.status} />
                        <button
                          onClick={() => setLetterPlan(plan)}
                          className="text-[10px] font-semibold text-violet-600 hover:text-violet-800 transition-colors flex-shrink-0"
                        >
                          ✉ Draft Letter
                        </button>
                      </div>
                      {nv.triggeredBy?.length > 0 && (
                        <div className="text-[10px] text-slate-400 italic">{nv.triggeredBy[0]}</div>
                      )}
                      {linked ? (
                        <div className={`text-[10px] ${expiryColors[expiryStatus ?? 'valid']}`}>
                          {expiryStatus === 'expired'
                            ? `⚠ Variance expired ${linked.validThrough}`
                            : expiryStatus === 'critical'
                            ? `⚠ Expires in ${days}d — ${linked.validThrough}`
                            : expiryStatus === 'warning'
                            ? `Expires in ${days}d — ${linked.validThrough}`
                            : `Valid through ${linked.validThrough}`}
                        </div>
                      ) : (
                        <div className="text-[10px] text-violet-600 font-semibold">→ Link a variance from the Library</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── CD Column ── */}
        <div className="rounded-xl border border-slate-200 bg-white flex flex-col overflow-hidden">
          <SectionHeader title="CD Concurrence" count={cdItems.length} color="bg-blue-50" />
          {cdItems.length === 0 ? (
            <div className="px-4 py-8 text-center text-[12px] text-emerald-600 font-semibond">✓ All caught up</div>
          ) : (
            <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
              {cdItems.map(({ plan, cd, done, total, pct }) => (
                <div key={plan.id} className="px-3 py-3">
                  <PlanRow plan={plan} onClick={() => openPlan(plan)} />
                  <div className="px-3 mt-1.5 flex flex-col gap-1.5">
                    <ProgressBar pct={pct} />
                    <div className="text-[10px] text-slate-400">{done}/{total} CDs concurred</div>
                    <div className="flex flex-wrap gap-1 mt-0.5">
                      {cd.cds.map(entry => (
                        entry.applicable ? (
                          <div key={entry.cd} className="flex items-center gap-1">
                            <span className="text-[10px] font-bold text-slate-600">{entry.cd}</span>
                            <StatusPill status={entry.status} small />
                          </div>
                        ) : null
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

      {/* Community Notices section */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="px-4 py-3 bg-green-50 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
          <div>
            <span className="text-[12px] font-bold text-slate-800">Community Notices</span>
            <span className="ml-2 text-[10px] font-bold bg-white/60 text-slate-600 px-2 py-0.5 rounded-full">
              {communityActionItems.length} active
            </span>
          </div>
          <div className="flex gap-1.5">
            {[
              { key: 'all',       label: 'All' },
              { key: 'driveway',  label: '🚗 Driveway' },
              { key: 'bus_stop',  label: '🚌 Bus Stop' },
            ].map(f => (
              <button
                key={f.key}
                onClick={() => setCommunityFilter(f.key as any)}
                className={`px-2.5 py-1 rounded-full text-[10px] font-semibold border transition-all ${
                  communityFilter === f.key
                    ? 'border-green-500 bg-green-600 text-white'
                    : 'border-slate-200 bg-white text-slate-500 hover:border-slate-400'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {filteredCommunity.length === 0 ? (
          <div className="px-4 py-8 text-center text-[12px] text-emerald-600 font-semibold">✓ All caught up</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wide">Plan</th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wide">Location</th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wide">Impacts</th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wide">Driveway Notices</th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wide">Addresses</th>
                  <th className="px-4 py-2.5 text-right text-[10px] font-bold text-slate-500 uppercase tracking-wide">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredCommunity.map(({ plan, dn }) => {
                  const sentCount = dn?.addresses.filter(a => a.noticeSent).length ?? 0;
                  const totalAddresses = dn?.addresses.length ?? 0;
                  const firstUnsent = dn?.addresses.find(a => !a.noticeSent && a.address);
                  return (
                    <tr key={plan.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3">
                        <button
                          onClick={() => openPlan(plan)}
                          className="font-mono text-[11px] font-bold text-slate-700 hover:text-blue-600 transition-colors"
                        >
                          {plan.loc || plan.id}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-[12px] text-slate-700 max-w-[180px] truncate">
                        {plan.street1}{plan.street2 ? ` / ${plan.street2}` : ''}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          {plan.impact_driveway && <span className="text-[11px]" title="Driveway">🚗</span>}
                          {plan.impact_busStop && <span className="text-[11px]" title="Bus Stop">🚌</span>}
                          {plan.impact_fullClosure && <span className="text-[11px]" title="Full Closure">🛑</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {plan.impact_driveway && dn ? (
                          <StatusPill status={dn.status} />
                        ) : plan.impact_driveway ? (
                          <span className="text-[10px] text-slate-400 italic">Open plan to initialize</span>
                        ) : (
                          <span className="text-[10px] text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[11px] text-slate-600">
                        {dn && totalAddresses > 0
                          ? `${sentCount}/${totalAddresses} sent`
                          : plan.impact_driveway
                          ? <span className="text-slate-400">No addresses yet</span>
                          : '—'
                        }
                      </td>
                      <td className="px-4 py-3 text-right">
                        {plan.impact_driveway && firstUnsent ? (
                          <button
                            onClick={() => { setDraftNoticePlan(plan); setDraftNoticeAddress(firstUnsent); }}
                            className="text-[10px] font-semibold text-violet-600 hover:text-violet-800 transition-colors"
                          >
                            ✉ Draft Notice
                          </button>
                        ) : plan.impact_driveway ? (
                          <button
                            onClick={() => openPlan(plan)}
                            className="text-[10px] font-semibold text-green-600 hover:text-green-800 transition-colors"
                          >
                            ✉ Open Plan to Draft
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Variance Letter Modal */}
      {letterPlan && (
        <VarianceLetterModal
          plan={letterPlan}
          appConfig={appConfig}
          linkedVariance={letterLinkedVariance}
          onClose={() => setLetterPlan(null)}
        />
      )}

      {/* Driveway Notice Modal */}
      {draftNoticePlan && draftNoticeAddress && (
        <DrivewayNoticeModal
          plan={draftNoticePlan}
          appConfig={appConfig}
          address={draftNoticeAddress}
          onClose={() => { setDraftNoticePlan(null); setDraftNoticeAddress(null); }}
        />
      )}
    </div>
  );
}
