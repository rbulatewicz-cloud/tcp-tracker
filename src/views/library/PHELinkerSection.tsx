import React, { useEffect, useState } from 'react';
import { CheckCircle, Link2, AlertTriangle, MapPin, Calendar, Activity, ChevronRight, ExternalLink } from 'lucide-react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { Plan, PlanCompliance, PHETrack } from '../../types';
import { COMPLETED_STAGES } from '../../constants';
import { fmtDate as fmt } from '../../utils/plans';
import { showToast } from '../../lib/toast';

// ── PHE status helpers ────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  not_started:    { label: 'Not Started',    color: '#991B1B', bg: '#FEE2E2' },
  in_progress:    { label: 'In Progress',    color: '#92400E', bg: '#FEF3C7' },
  submitted:      { label: 'Submitted',      color: '#1E40AF', bg: '#DBEAFE' },
  linked_existing:{ label: 'Linked',         color: '#166534', bg: '#DCFCE7' },
  approved:       { label: 'Approved',       color: '#166534', bg: '#DCFCE7' },
  expired:        { label: 'Expired',        color: '#6B7280', bg: '#F3F4F6' },
};

interface PHESuggestion {
  sourcePlan: Plan;
  permitNumber: string;
  permitDate?: string;
  sourceStatus: string;
}

function getSuggestions(targetPlan: Plan, allPlans: Plan[]): PHESuggestion[] {
  return allPlans
    .filter(p =>
      p.id !== targetPlan.id &&
      p.segment === targetPlan.segment &&
      p.compliance?.phe &&
      ['approved', 'linked_existing'].includes(p.compliance.phe.status) &&
      (p.compliance.phe.boePermitNumber || p.compliance.phe.existingPermitNumber)
    )
    .map(p => ({
      sourcePlan: p,
      permitNumber: (p.compliance!.phe!.boePermitNumber || p.compliance!.phe!.existingPermitNumber)!,
      permitDate: p.compliance!.phe!.approvalDate || p.compliance!.phe!.existingPermitDate,
      sourceStatus: p.compliance!.phe!.status,
    }));
}

async function applyPHELink(plan: Plan, permitNumber: string, permitDate?: string) {
  const currentPHE = plan.compliance?.phe;
  if (!currentPHE) throw new Error('No PHE track on this plan');

  const updatedPHE: PHETrack = {
    ...currentPHE,
    existingPermitNumber: permitNumber,
    existingPermitDate: permitDate,
    status: 'linked_existing',
  };

  const updatedCompliance: PlanCompliance = {
    ...(plan.compliance ?? {}),
    phe: updatedPHE,
  };

  await updateDoc(doc(db, 'plans', plan.id), { compliance: updatedCompliance });
}

// ── Main component ────────────────────────────────────────────────────────────

export function PHELinkerSection({
  plans,
  setSelectedPlan,
}: {
  plans: Plan[];
  setSelectedPlan: (p: Plan | null) => void;
}) {
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [manualPermit, setManualPermit] = useState('');
  const [manualDate, setManualDate] = useState('');
  const [linking, setLinking] = useState(false);

  // Plans with a PHE track that aren't approved / linked / na / expired
  const pendingPlans = plans.filter(p =>
    p.compliance?.phe &&
    !['approved', 'linked_existing', 'na', 'expired'].includes(p.compliance.phe.status) &&
    !COMPLETED_STAGES.includes(p.stage)
  );

  const donePlans = plans.filter(p =>
    p.compliance?.phe &&
    ['approved', 'linked_existing'].includes(p.compliance.phe.status) &&
    !COMPLETED_STAGES.includes(p.stage)
  );

  // Auto-select first pending plan
  useEffect(() => {
    if (!selectedPlanId && pendingPlans.length > 0) {
      setSelectedPlanId(pendingPlans[0].id);
    }
  }, [pendingPlans.length]);

  const activePlan = plans.find(p => p.id === selectedPlanId) ?? null;
  const suggestions = activePlan ? getSuggestions(activePlan, plans) : [];

  const handleLink = async (permitNumber: string, permitDate?: string) => {
    if (!activePlan || !permitNumber.trim()) return;
    setLinking(true);
    try {
      await applyPHELink(activePlan, permitNumber.trim(), permitDate);
      showToast(`Linked ${activePlan.loc} → BOE Permit ${permitNumber.trim()}`, 'success');
      setManualPermit('');
      setManualDate('');
      const next = pendingPlans.find(p => p.id !== activePlan.id);
      setSelectedPlanId(next?.id ?? null);
    } catch (err) {
      console.error(err);
      showToast('Failed to save link — try again', 'error');
    } finally {
      setLinking(false);
    }
  };

  const pheStatus = (plan: Plan) => {
    const s = plan.compliance?.phe?.status ?? 'not_started';
    return STATUS_LABELS[s] ?? STATUS_LABELS.not_started;
  };

  return (
    <div>
      {/* Summary bar */}
      <div className="flex items-center gap-6 mb-5 p-4 bg-slate-50 rounded-xl border border-slate-200">
        <div className="text-center">
          <div className="text-2xl font-black text-slate-800">{pendingPlans.length}</div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Pending</div>
        </div>
        <div className="w-px h-10 bg-slate-200" />
        <div className="text-center">
          <div className="text-2xl font-black text-emerald-600">{donePlans.length}</div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Linked / Approved</div>
        </div>
        <div className="ml-auto text-[11px] text-slate-400 flex items-center gap-1.5">
          <Activity size={12} className="text-blue-500" />
          Smart-matches existing BOE permit numbers within the same segment
        </div>
      </div>

      {pendingPlans.length === 0 && (
        <div className="text-center py-16">
          <CheckCircle size={40} className="text-emerald-500 mx-auto mb-3" />
          <div className="font-bold text-slate-700 mb-1">All PHE permits are linked!</div>
          <div className="text-sm text-slate-400">Every active plan with a PHE track has been linked or approved.</div>
        </div>
      )}

      {pendingPlans.length > 0 && (
        <div className="flex gap-4" style={{ minHeight: 480 }}>

          {/* Left: plan list */}
          <div className="flex flex-col gap-1" style={{ width: 260, flexShrink: 0 }}>
            <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1 px-1">
              Plans needing a PHE link ({pendingPlans.length})
            </div>

            {pendingPlans.map(plan => {
              const isActive = plan.id === selectedPlanId;
              const st = pheStatus(plan);
              const hasSuggestion = getSuggestions(plan, plans).length > 0;

              return (
                <button
                  key={plan.id}
                  onClick={() => setSelectedPlanId(plan.id)}
                  className={`w-full text-left rounded-lg px-3 py-2.5 border transition-all ${
                    isActive
                      ? 'border-blue-400 bg-blue-50 shadow-sm'
                      : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <span className="text-[11px] font-bold text-slate-800">{plan.loc || plan.id}</span>
                    <span
                      className="text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0"
                      style={{ background: st.bg, color: st.color }}
                    >
                      {st.label}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-500 truncate">
                    {[plan.street1, plan.street2].filter(Boolean).join(' / ')}
                  </div>
                  <div className="flex items-center gap-1.5 mt-1">
                    {plan.segment && (
                      <span className="text-[9px] font-bold bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                        Seg {plan.segment}
                      </span>
                    )}
                    {hasSuggestion && (
                      <span className="text-[9px] font-bold bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded">
                        Permit available
                      </span>
                    )}
                  </div>
                </button>
              );
            })}

            {/* Done plans (collapsed) */}
            {donePlans.length > 0 && (
              <div className="mt-3 px-1">
                <div className="text-[10px] font-bold uppercase tracking-wide text-emerald-600 mb-1">
                  Linked / Approved ({donePlans.length})
                </div>
                {donePlans.map(plan => {
                  const permit = plan.compliance?.phe?.boePermitNumber || plan.compliance?.phe?.existingPermitNumber;
                  return (
                    <div key={plan.id} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-emerald-200 bg-emerald-50/40 opacity-70 mb-1">
                      <CheckCircle size={10} className="text-emerald-600 flex-shrink-0" />
                      <div className="min-w-0">
                        <div className="text-[10px] font-semibold text-slate-700">{plan.loc || plan.id}</div>
                        {permit && <div className="text-[9px] text-slate-400 truncate">Permit: {permit}</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right: detail + link panel */}
          <div className="flex-1 min-w-0">
            {!activePlan ? (
              <div className="flex items-center justify-center h-full text-slate-400 text-sm">
                Select a plan on the left to see PHE options
              </div>
            ) : (
              <>
                {/* Plan header */}
                <div className="flex items-start justify-between mb-4 p-3 bg-white rounded-xl border border-slate-200">
                  <div>
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-bold text-slate-800">{activePlan.loc || activePlan.id}</span>
                      {activePlan.segment && (
                        <span className="text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded">
                          Seg {activePlan.segment}
                        </span>
                      )}
                      {(() => { const st = pheStatus(activePlan); return (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: st.bg, color: st.color }}>
                          {st.label}
                        </span>
                      ); })()}
                    </div>
                    <div className="text-[12px] text-slate-500">
                      {[activePlan.street1, activePlan.street2].filter(Boolean).join(' / ')}
                      {activePlan.needByDate && <span> · Need by {fmt(activePlan.needByDate)}</span>}
                    </div>
                    {activePlan.compliance?.phe?.peakHourJustification && (
                      <div className="text-[11px] text-slate-400 mt-1 italic">
                        "{activePlan.compliance.phe.peakHourJustification}"
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => setSelectedPlan(activePlan)}
                    className="flex-shrink-0 flex items-center gap-1.5 text-[11px] font-semibold text-blue-600 hover:text-blue-700 border border-blue-200 rounded-lg px-2.5 py-1.5 transition-colors"
                  >
                    <ExternalLink size={11} />
                    Open Plan
                  </button>
                </div>

                {/* Smart suggestions */}
                {suggestions.length > 0 && (
                  <div className="mb-4">
                    <div className="text-[10px] font-bold uppercase tracking-wide text-amber-600 mb-2 flex items-center gap-1.5">
                      <Activity size={10} />
                      Permit available from another plan in Segment {activePlan.segment}
                    </div>
                    <div className="flex flex-col gap-2">
                      {suggestions.map((s, i) => {
                        const srcSt = STATUS_LABELS[s.sourceStatus] ?? STATUS_LABELS.approved;
                        return (
                          <div key={i} className="border border-amber-200 bg-amber-50/40 rounded-xl p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap mb-1">
                                  <span className="text-[11px] font-bold text-slate-800">
                                    BOE Permit: {s.permitNumber}
                                  </span>
                                  <span
                                    className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                                    style={{ background: srcSt.bg, color: srcSt.color }}
                                  >
                                    {srcSt.label}
                                  </span>
                                </div>
                                <div className="text-[11px] text-slate-500">
                                  From {s.sourcePlan.loc || s.sourcePlan.id}
                                  {s.permitDate && <span> · Approved {fmt(s.permitDate)}</span>}
                                </div>
                                <div className="text-[10px] text-slate-400 truncate">
                                  {[s.sourcePlan.street1, s.sourcePlan.street2].filter(Boolean).join(' / ')}
                                </div>
                              </div>
                              <button
                                onClick={() => handleLink(s.permitNumber, s.permitDate)}
                                disabled={linking}
                                className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
                                  linking
                                    ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                    : 'bg-amber-600 text-white hover:bg-amber-700 cursor-pointer'
                                }`}
                              >
                                <Link2 size={11} />
                                {linking ? 'Linking…' : 'Use Permit'}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Manual entry */}
                <div className="border border-slate-200 rounded-xl p-4">
                  <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-3">
                    {suggestions.length > 0 ? 'Or enter a different permit number' : 'Enter BOE permit number'}
                  </div>
                  <div className="flex gap-2 mb-3">
                    <div className="flex-1">
                      <label className="text-[10px] font-semibold text-slate-500 mb-1 block">BOE Permit Number</label>
                      <input
                        type="text"
                        value={manualPermit}
                        onChange={e => setManualPermit(e.target.value)}
                        placeholder="e.g. 12345678"
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-[12px] focus:outline-none focus:border-blue-400"
                      />
                    </div>
                    <div style={{ width: 160 }}>
                      <label className="text-[10px] font-semibold text-slate-500 mb-1 block">Approval Date (optional)</label>
                      <input
                        type="date"
                        value={manualDate}
                        onChange={e => setManualDate(e.target.value)}
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-[12px] focus:outline-none focus:border-blue-400"
                      />
                    </div>
                  </div>
                  <button
                    onClick={() => handleLink(manualPermit, manualDate || undefined)}
                    disabled={!manualPermit.trim() || linking}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-[12px] font-bold transition-all ${
                      !manualPermit.trim() || linking
                        ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                        : 'bg-slate-900 text-white hover:bg-slate-700 cursor-pointer'
                    }`}
                  >
                    <Link2 size={12} />
                    {linking ? 'Linking…' : 'Link Permit'}
                  </button>
                  {suggestions.length === 0 && (
                    <p className="text-[11px] text-slate-400 mt-2">
                      No existing permits found in Segment {activePlan.segment || '—'}. Enter the BOE permit number manually or open the plan to update the PHE checklist.
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
