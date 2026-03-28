import React, { useMemo } from 'react';
import { Plan } from '../types';
import { pheProgress, cdProgress, COMPLIANCE_STATUS_LABELS, CD_STATUS_LABELS } from '../utils/compliance';

interface ComplianceViewProps {
  plans: Plan[];
  setSelectedPlan: (plan: Plan) => void;
  setView: (view: string) => void;
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
    // CD statuses
    pending:           'bg-slate-100 text-slate-500',
    presentation_sent: 'bg-blue-50 text-blue-700',
    meeting_scheduled: 'bg-indigo-50 text-indigo-700',
    concurred:         'bg-emerald-50 text-emerald-700',
    declined:          'bg-red-50 text-red-600',
    na:                'bg-slate-50 text-slate-400',
  };
  const label = COMPLIANCE_STATUS_LABELS[status] ?? CD_STATUS_LABELS[status] ?? status;
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

// ── Section header ─────────────────────────────────────────────────────────────

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

export function ComplianceView({ plans, setSelectedPlan, setView }: ComplianceViewProps) {
  const openPlan = (plan: Plan) => {
    setSelectedPlan(plan);
    setView('table');
  };

  const pheItems = useMemo(() =>
    plans.filter(p => p.compliance?.phe).map(p => {
      const phe = p.compliance!.phe!;
      const { done, total, pct } = pheProgress(phe);
      return { plan: p, phe, done, total, pct };
    }),
    [plans]
  );

  const nvItems = useMemo(() =>
    plans.filter(p => p.compliance?.noiseVariance).map(p => ({
      plan: p,
      nv: p.compliance!.noiseVariance!,
    })),
    [plans]
  );

  const cdItems = useMemo(() =>
    plans.filter(p => p.compliance?.cdConcurrence).map(p => {
      const cd = p.compliance!.cdConcurrence!;
      const { done, total, pct } = cdProgress(cd.cds);
      return { plan: p, cd, done, total, pct };
    }),
    [plans]
  );

  // Summary stats
  const pheApproved   = pheItems.filter(i => i.phe.status === 'approved').length;
  const pheSubmitted  = pheItems.filter(i => i.phe.status === 'submitted').length;
  const nvApproved    = nvItems.filter(i => i.nv.status === 'approved').length;
  const cdFullyDone   = cdItems.filter(i => i.pct === 100).length;

  return (
    <div className="p-6 max-w-[1400px] mx-auto">

      {/* Page title */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-900">Compliance Tracker</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Active PHE applications, Noise Variance requests, and CD Concurrence tracks across all plans.
        </p>
      </div>

      {/* Summary stat strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'PHE Active',        value: pheItems.length,  sub: `${pheApproved} approved, ${pheSubmitted} submitted`, color: 'bg-orange-50 border-orange-100' },
          { label: 'PHE Checklist 100%',value: pheItems.filter(i => i.pct === 100).length, sub: 'all items complete', color: 'bg-emerald-50 border-emerald-100' },
          { label: 'NV Active',         value: nvItems.length,   sub: `${nvApproved} approved`, color: 'bg-violet-50 border-violet-100' },
          { label: 'CD Concurrence',    value: cdItems.length,   sub: `${cdFullyDone} fully concurred`, color: 'bg-blue-50 border-blue-100' },
        ].map(s => (
          <div key={s.label} className={`rounded-xl border px-4 py-3 ${s.color}`}>
            <div className="text-2xl font-bold text-slate-800">{s.value}</div>
            <div className="text-[11px] font-semibold text-slate-600">{s.label}</div>
            <div className="text-[10px] text-slate-400 mt-0.5">{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Three-column layout */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">

        {/* ── PHE Column ── */}
        <div className="rounded-xl border border-slate-200 bg-white flex flex-col overflow-hidden">
          <SectionHeader title="Peak Hour Exemption" count={pheItems.length} color="bg-orange-50" />
          {pheItems.length === 0 ? (
            <div className="px-4 py-8 text-center text-[12px] text-slate-400">No active PHE applications</div>
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
            <div className="px-4 py-8 text-center text-[12px] text-slate-400">No active Noise Variance requests</div>
          ) : (
            <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
              {nvItems.map(({ plan, nv }) => (
                <div key={plan.id} className="px-3 py-3">
                  <PlanRow plan={plan} onClick={() => openPlan(plan)} />
                  <div className="px-3 mt-1.5 flex flex-col gap-1.5">
                    <StatusPill status={nv.status} />
                    {nv.submittedDate && (
                      <div className="text-[10px] text-slate-400">Submitted: {nv.submittedDate}</div>
                    )}
                    {nv.approvalDate && (
                      <div className="text-[10px] text-emerald-600 font-semibold">Approved: {nv.approvalDate}</div>
                    )}
                    {nv.triggeredBy?.length > 0 && (
                      <div className="text-[10px] text-slate-400 italic">{nv.triggeredBy[0]}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── CD Column ── */}
        <div className="rounded-xl border border-slate-200 bg-white flex flex-col overflow-hidden">
          <SectionHeader title="CD Concurrence" count={cdItems.length} color="bg-blue-50" />
          {cdItems.length === 0 ? (
            <div className="px-4 py-8 text-center text-[12px] text-slate-400">No active CD Concurrence tracks</div>
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
    </div>
  );
}
