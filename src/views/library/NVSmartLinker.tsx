import { useEffect, useState } from 'react';
import { CheckCircle, Link2, SkipForward, Zap, AlertTriangle, Clock, Tag, MapPin, Calendar, RefreshCw, Eye, X, LayoutList, Layers, Wrench, Pin } from 'lucide-react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { Plan, NoiseVariance, PlanCompliance, NoiseVarianceTrack } from '../../types';
import { subscribeToVariances, daysUntilExpiry, getVarianceExpiryStatus, rescanVarianceFromUrl, unlinkVarianceFromPlan } from '../../services/varianceService';
import { COMPLETED_STAGES } from '../../constants';
import { fmtDate as fmt } from '../../utils/plans';
import { showToast } from '../../lib/toast';
import { writeGlobalLog } from '../../services/logService';
import { sortStreetsByCorridorOrder, findGapsInCoverage, findExtrasOutsideCorridors, getStreetsBetween } from '../../utils/corridor';
import {
  MatchResult,
  scoreMatch,
  confidenceLabel,
  getLinkedVarianceIds,
} from './NVSmartLinker/scoring';
import { SignalBadge } from './NVSmartLinker/SignalBadge';
import { VarianceCard } from './NVSmartLinker/VarianceCard';

// ── Multi-variance link helpers ────────────────────────────────────────────────

async function applyLink(plan: Plan, variance: NoiseVariance) {
  const rootId = variance.parentVarianceId ?? variance.id;
  const currentNV = plan.compliance?.noiseVariance;
  const existingIds = currentNV ? getLinkedVarianceIds(currentNV) : [];
  if (existingIds.includes(rootId)) return; // already linked

  const newIds = [...existingIds, rootId];
  const updatedNV: NoiseVarianceTrack = {
    ...(currentNV ?? {}),
    triggeredBy: currentNV?.triggeredBy ?? [],
    linkedVarianceIds: newIds,
    linkedVarianceId: newIds[0],   // legacy compat — always reflects first linked
    existingPermitNumber: variance.permitNumber || (currentNV?.existingPermitNumber ?? ''),
    status: 'linked_existing' as const,
  };
  const updatedCompliance: PlanCompliance = {
    ...(plan.compliance ?? {}),
    noiseVariance: updatedNV,
  };
  await updateDoc(doc(db, 'plans', plan.id), { compliance: updatedCompliance });
  writeGlobalLog(
    `Noise Variance linked to ${plan.loc || plan.id}`,
    'library',
    variance.permitNumber || variance.title || variance.id,
    variance.parentVarianceId ?? variance.id,
    'variance',
    plan.loc
  );
}


// ── Main component ─────────────────────────────────────────────────────────────

type LinkerTab = 'link' | 'rescan' | 'review';
type LinkViewMode = 'by_plan' | 'by_variance';

export function NVSmartLinker({ plans, setSelectedPlan }: { plans: Plan[]; setSelectedPlan: (p: Plan | null) => void }) {
  const [variances, setVariances] = useState<NoiseVariance[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [linking, setLinking] = useState<string | null>(null);
  const [unlinking, setUnlinking] = useState<string | null>(null);
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [held, setHeld] = useState<Set<string>>(new Set());
  const [showLinked, setShowLinked] = useState(false);
  const [activeTab, setActiveTab] = useState<LinkerTab>('link');
  const [linkViewMode, setLinkViewMode] = useState<LinkViewMode>('by_plan');
  const [selectedVarianceId, setSelectedVarianceId] = useState<string | null>(null);

  // Rescan state
  const [rescanning, setRescanning] = useState(false);
  const [rescanProgress, setRescanProgress] = useState<{ done: number; total: number; current: string } | null>(null);
  const [rescanErrors, setRescanErrors] = useState<{ id: string; title: string; error: string }[]>([]);

  useEffect(() => subscribeToVariances(setVariances), []);

  // Active (non-archived, scan-complete) variances only
  const activeVariances = variances.filter(v => !v.isArchived && v.scanStatus === 'complete');

  // Plans with a NV track but no linked variances yet
  const unlinkdedPlans = plans.filter(p =>
    p.compliance?.noiseVariance &&
    getLinkedVarianceIds(p.compliance.noiseVariance).length === 0 &&
    !COMPLETED_STAGES.includes(p.stage)
  );

  // Plans with at least one linked variance (may still want to add more)
  const linkedPlans = plans.filter(p =>
    p.compliance?.noiseVariance &&
    getLinkedVarianceIds(p.compliance.noiseVariance).length > 0 &&
    !COMPLETED_STAGES.includes(p.stage)
  );

  // Plans explicitly held in queue even after getting a link
  const heldLinkedPlans = linkedPlans.filter(p => held.has(p.id));
  const pendingPlans = [
    ...unlinkdedPlans.filter(p => !skipped.has(p.id)),
    ...heldLinkedPlans,
  ];
  const skippedPlans = unlinkdedPlans.filter(p => skipped.has(p.id));

  // Auto-select first plan when list loads
  useEffect(() => {
    if (!selectedPlanId && pendingPlans.length > 0) {
      setSelectedPlanId(pendingPlans[0].id);
    }
  }, [pendingPlans.length]);

  const activePlan = plans.find(p => p.id === selectedPlanId) ?? null;

  // IDs already linked to the active plan
  const activePlanLinkedIds = activePlan?.compliance?.noiseVariance
    ? getLinkedVarianceIds(activePlan.compliance.noiseVariance)
    : [];

  // Expanded street range for the active plan header
  // Uses saved expandedStreets when confirmed (non-empty), otherwise auto-computes from corridor data
  const _activePlanComputedStreets = activePlan
    ? getStreetsBetween(activePlan.street1 || '', activePlan.street2 || '')
    : [];
  const _savedStreets = activePlan?.expandedStreets;
  const _hasSavedStreets = Array.isArray(_savedStreets) && _savedStreets.length > 0;
  const _activePlanDisplayStreets = _hasSavedStreets
    ? _savedStreets!
    : (_activePlanComputedStreets.length > 1 ? _activePlanComputedStreets : null);
  const activePlanStreetsSorted = _activePlanDisplayStreets
    ? sortStreetsByCorridorOrder(_activePlanDisplayStreets)
    : null;
  const activePlanStreetsAuto = !_hasSavedStreets && activePlanStreetsSorted !== null;

  // Score active variances that aren't already linked to this plan
  const suggestions: MatchResult[] = activePlan
    ? activeVariances
        .filter(v => !activePlanLinkedIds.includes(v.parentVarianceId ?? v.id))
        .map(v => scoreMatch(activePlan, v))
        .filter(r => r.score > 0)
        .sort((a, b) => b.score - a.score)
    : [];

  // ── By-Variance mode ─────────────────────────────────────────────────────────
  const activeVariance = activeVariances.find(v => v.id === selectedVarianceId) ?? null;

  // All NV-tracked plans that aren't in terminal stage, scored against selected variance
  const variancePlanMatches: (MatchResult & { plan: Plan; alreadyLinked: boolean })[] =
    activeVariance
      ? plans
          .filter(p => p.compliance?.noiseVariance && !COMPLETED_STAGES.includes(p.stage))
          .map(p => {
            const result = scoreMatch(p, activeVariance);
            const rootId = activeVariance.parentVarianceId ?? activeVariance.id;
            const linkedIds = getLinkedVarianceIds(p.compliance!.noiseVariance!);
            return { ...result, plan: p, alreadyLinked: linkedIds.includes(rootId) };
          })
          .filter(r => r.score > 0)
          .sort((a, b) => {
            // Already-linked float to top, then sort by score desc
            if (a.alreadyLinked !== b.alreadyLinked) return a.alreadyLinked ? -1 : 1;
            return b.score - a.score;
          })
      : [];

  const handleLink = async (plan: Plan, variance: NoiseVariance) => {
    setLinking(variance.id);
    try {
      await applyLink(plan, variance);
      showToast(`Linked ${plan.loc} → ${variance.permitNumber || variance.title}`, 'success');
      // Auto-advance in by-plan mode when the plan gets its first link — unless it's held in queue
      if (linkViewMode === 'by_plan' && !held.has(plan.id)) {
        const wasUnlinked = getLinkedVarianceIds(plan.compliance?.noiseVariance ?? {}).length === 0;
        if (wasUnlinked) {
          const nextPlan = pendingPlans.find(p => p.id !== plan.id && !skipped.has(p.id));
          setSelectedPlanId(nextPlan?.id ?? plan.id);
        }
      }
    } catch (err) {
      console.error(err);
      showToast('Failed to save link — try again', 'error');
    } finally {
      setLinking(null);
    }
  };

  // In by-variance mode, link a plan to the currently selected variance
  const handleLinkPlanToVariance = async (plan: Plan) => {
    if (!activeVariance) return;
    const key = `${plan.id}__${activeVariance.id}`;
    setLinking(key);
    try {
      await applyLink(plan, activeVariance);
      showToast(`Linked ${plan.loc} → ${activeVariance.permitNumber || activeVariance.title}`, 'success');
    } catch (err) {
      console.error(err);
      showToast('Failed to save link — try again', 'error');
    } finally {
      setLinking(null);
    }
  };

  const handleUnlinkPlanFromVariance = async (plan: Plan) => {
    if (!activeVariance) return;
    const rootId = activeVariance.parentVarianceId ?? activeVariance.id;
    setUnlinking(rootId + plan.id);
    try {
      await unlinkVarianceFromPlan(plan, rootId);
      showToast('Variance unlinked', 'success');
    } catch (err) {
      console.error(err);
      showToast('Failed to remove link — try again', 'error');
    } finally {
      setUnlinking(null);
    }
  };

  const handleUnlink = async (plan: Plan, varianceRootId: string) => {
    setUnlinking(varianceRootId);
    try {
      await unlinkVarianceFromPlan(plan, varianceRootId);
      showToast('Variance unlinked', 'success');
    } catch (err) {
      console.error(err);
      showToast('Failed to remove link — try again', 'error');
    } finally {
      setUnlinking(null);
    }
  };

  const handleSkip = (planId: string) => {
    setSkipped(s => new Set([...s, planId]));
    const nextPlan = pendingPlans.find(p => p.id !== planId && !skipped.has(p.id));
    setSelectedPlanId(nextPlan?.id ?? null);
  };

  const handleHold = (planId: string) => {
    setHeld(s => new Set([...s, planId]));
  };

  const handleRelease = (planId: string) => {
    setHeld(s => { const n = new Set(s); n.delete(planId); return n; });
    const nextPlan = pendingPlans.find(p => p.id !== planId);
    setSelectedPlanId(nextPlan?.id ?? null);
  };

  // ── Rescan all variances ─────────────────────────────────────────────────────

  const handleRescanAll = async () => {
    const targets = activeVariances.filter(v => v.scanStatus !== 'scanning');
    if (targets.length === 0) return;
    setRescanning(true);
    setRescanErrors([]);
    setRescanProgress({ done: 0, total: targets.length, current: '' });

    for (let i = 0; i < targets.length; i++) {
      const v = targets[i];
      setRescanProgress({ done: i, total: targets.length, current: v.permitNumber || v.title || v.id });
      try {
        await rescanVarianceFromUrl(v);
      } catch (err) {
        setRescanErrors(prev => [...prev, {
          id: v.id,
          title: v.permitNumber || v.title || v.id,
          error: err instanceof Error ? err.message : String(err),
        }]);
      }
    }

    setRescanProgress({ done: targets.length, total: targets.length, current: '' });
    setRescanning(false);
    showToast(`Rescan complete — ${targets.length - rescanErrors.length} updated`, 'success');
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  // Already-linked plans with rescored scores (for review tab) — multi-variance aware
  const linkedWithScores = linkedPlans.map(plan => {
    const linkedIds = getLinkedVarianceIds(plan.compliance!.noiseVariance!);
    const linkedVars = linkedIds
      .map(id => variances.find(v => (v.parentVarianceId ?? v.id) === id || v.id === id))
      .filter((v): v is NoiseVariance => v !== undefined);
    const results = linkedVars.map(v => ({ variance: v, ...scoreMatch(plan, v) }));
    const minScore = results.length > 0 ? Math.min(...results.map(r => r.score)) : 0;
    return { plan, linkedVars, results, minScore };
  }).sort((a, b) => a.minScore - b.minScore); // weakest first

  const weakLinks = linkedWithScores.filter(x => x.results.some(r => r.score < 6));

  return (
    <div>
      {/* Tab bar */}
      <div className="flex gap-1 mb-5 border-b border-slate-200">
        {([
          { id: 'link'   as LinkerTab, label: 'Link Plans',    icon: <Link2 size={13} />,     badge: unlinkdedPlans.length },
          { id: 'rescan' as LinkerTab, label: 'Rescan Docs',   icon: <RefreshCw size={13} />, badge: 0 },
          { id: 'review' as LinkerTab, label: 'Review Links',  icon: <Eye size={13} />,        badge: weakLinks.length },
        ]).map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === t.id
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            {t.icon}
            {t.label}
            {t.badge > 0 && (
              <span className={`ml-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                activeTab === t.id ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'
              }`}>
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── RESCAN TAB ── */}
      {activeTab === 'rescan' && (
        <div className="max-w-xl">
          <div className="mb-4">
            <h3 className="text-sm font-bold text-slate-800 mb-1">Re-scan all variance documents</h3>
            <p className="text-[12px] text-slate-500 leading-relaxed">
              Re-runs the AI extraction on every variance PDF to populate the new <strong>coveredStreets</strong> field.
              This improves match scores in the Link Plans tab. Submission tracking data (permit dates, check numbers) is never overwritten.
            </p>
          </div>

          {/* Variance list */}
          <div className="border border-slate-200 rounded-xl overflow-hidden mb-4">
            <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-600">{activeVariances.length} active variances</span>
              <span className="text-[11px] text-slate-400">
                {activeVariances.filter(v => (v.coveredStreets ?? []).length > 0).length} already have street data
              </span>
            </div>
            <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
              {activeVariances.map(v => {
                const hasStreets = (v.coveredStreets ?? []).length > 0;
                return (
                  <div key={v.id} className="flex items-center gap-3 px-4 py-2.5">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${hasStreets ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] font-semibold text-slate-700 truncate">{v.permitNumber || v.title}</div>
                      {hasStreets ? (
                        <div className="flex flex-wrap gap-0.5 mt-0.5">{(v.coveredStreets ?? []).map((s,i) => <span key={i} className="px-1 py-0.5 rounded text-[9px] font-semibold bg-sky-50 text-sky-700 border border-sky-100">{s}</span>)}</div>
                      ) : (
                        <div className="text-[10px] text-amber-600">No street data — will be populated on rescan</div>
                      )}
                    </div>
                    {v.scanStatus === 'scanning' && (
                      <RefreshCw size={12} className="text-blue-500 animate-spin flex-shrink-0" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Progress bar */}
          {rescanProgress && (
            <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
              <div className="flex items-center justify-between mb-1.5 text-[11px] font-semibold text-blue-700">
                <span>{rescanProgress.done < rescanProgress.total ? `Scanning: ${rescanProgress.current}` : 'Rescan complete'}</span>
                <span>{rescanProgress.done} / {rescanProgress.total}</span>
              </div>
              <div className="h-1.5 bg-blue-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all duration-300"
                  style={{ width: `${(rescanProgress.done / rescanProgress.total) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* Errors */}
          {rescanErrors.length > 0 && (
            <div className="mb-4 p-3 bg-red-50 rounded-lg border border-red-200">
              <div className="text-[11px] font-bold text-red-700 mb-1">{rescanErrors.length} error{rescanErrors.length !== 1 ? 's' : ''}</div>
              {rescanErrors.map(e => (
                <div key={e.id} className="text-[10px] text-red-600">{e.title}: {e.error}</div>
              ))}
            </div>
          )}

          <button
            onClick={handleRescanAll}
            disabled={rescanning}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold transition-all ${
              rescanning
                ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                : 'bg-slate-900 text-white hover:bg-slate-700 cursor-pointer'
            }`}
          >
            <RefreshCw size={14} className={rescanning ? 'animate-spin' : ''} />
            {rescanning ? 'Scanning…' : `Rescan all ${activeVariances.length} variances`}
          </button>
        </div>
      )}

      {/* ── REVIEW LINKS TAB ── */}
      {activeTab === 'review' && (
        <div>
          <div className="mb-4">
            <h3 className="text-sm font-bold text-slate-800 mb-1">Review existing links</h3>
            <p className="text-[12px] text-slate-500">
              Rescores all already-linked plans against their linked variance. Weak scores may indicate a wrong or outdated link.
            </p>
          </div>

          {weakLinks.length > 0 && (
            <div className="mb-3 flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-[11px] font-semibold text-amber-700">
              <AlertTriangle size={13} />
              {weakLinks.length} link{weakLinks.length !== 1 ? 's' : ''} scored below 6 — worth reviewing
            </div>
          )}

          <div className="flex flex-col gap-3">
            {linkedWithScores.map(({ plan, linkedVars, results, minScore }) => {
              const hasWeak = results.some(r => r.score < 6);
              return (
                <div
                  key={plan.id}
                  className={`border rounded-xl p-4 ${hasWeak ? 'border-amber-300 bg-amber-50/40' : 'border-slate-200 bg-white'}`}
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-slate-800 text-[13px]">{plan.loc || plan.id}</span>
                        <span className="text-[10px] font-semibold bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">
                          {results.length} variance{results.length !== 1 ? 's' : ''} linked
                        </span>
                        {hasWeak && (
                          <span className="flex items-center gap-1 text-[10px] font-bold text-amber-600">
                            <AlertTriangle size={11} /> Weak link
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {[plan.street1, plan.street2].filter(Boolean).join(' / ')}
                        {plan.segment && <span className="ml-2 font-bold text-slate-400">Seg {plan.segment}</span>}
                      </div>
                      {(plan.expandedStreets ?? []).length > 0 && (
                        <div className="flex flex-wrap gap-0.5 mt-1">
                          {plan.expandedStreets!.map((st, si) => (
                            <span key={si} className="px-1 py-0.5 rounded text-[9px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100">{st}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {hasWeak && (
                        <button
                          onClick={() => {
                            setActiveTab('link');
                            setLinkViewMode('by_plan');
                            setShowLinked(true);
                            setSelectedPlanId(plan.id);
                          }}
                          className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-600 hover:text-amber-700 border border-amber-300 bg-amber-50 rounded-lg px-2.5 py-1.5 transition-colors"
                        >
                          <Wrench size={11} />
                          Fix Link
                        </button>
                      )}
                      <button
                        onClick={() => setSelectedPlan(plan)}
                        className="text-[11px] font-semibold text-blue-600 hover:text-blue-700 border border-blue-200 rounded-lg px-2.5 py-1.5 transition-colors"
                      >
                        Open Plan
                      </button>
                    </div>
                  </div>

                  {/* Per-variance score rows */}
                  <div className="flex flex-col gap-1.5">
                    {results.map(({ variance: lv, score, signals }) => {
                      const conf = confidenceLabel(score);
                      const isWeak = score < 6;
                      return (
                        <div key={lv.id} className={`rounded-lg px-3 py-2 border ${isWeak ? 'border-amber-200 bg-amber-50/40' : 'border-slate-100 bg-slate-50/50'}`}>
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="text-[11px] font-semibold text-slate-700">{lv.permitNumber || lv.title}</span>
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: conf.bg, color: conf.color }}>
                              {score}pt — {conf.label}
                            </span>
                          </div>
                          {(lv.coveredStreets ?? []).length > 0 && (
                            <div className="flex flex-wrap gap-1 mb-1">
                              {lv.coveredStreets!.map((st, si) => (
                                <span key={si} className="px-1 py-0.5 rounded text-[9px] font-semibold bg-sky-50 text-sky-700 border border-sky-100">{st}</span>
                              ))}
                            </div>
                          )}
                          <div className="flex flex-wrap gap-1">
                            <SignalBadge active={signals.segment}  label="Segment"  icon={<MapPin size={9} />} />
                            <SignalBadge active={signals.scope}    label="Scope"    icon={<Tag size={9} />} />
                            <SignalBadge active={signals.date}     label="Date"     icon={<Calendar size={9} />} />
                            <SignalBadge active={signals.hours}    label="Hours"    icon={<Clock size={9} />} />
                            <SignalBadge active={signals.streets}  label="Streets"  icon={<MapPin size={9} />} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {linkedWithScores.length === 0 && (
            <div className="text-center py-12 text-slate-400 text-sm">No linked plans yet.</div>
          )}
        </div>
      )}

      {/* ── LINK TAB ── */}
      {activeTab === 'link' && (<>

      {/* Summary bar + mode toggle */}
      <div className="flex items-center gap-6 mb-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
        <div className="text-center">
          <div className="text-2xl font-black text-slate-800">{unlinkdedPlans.length}</div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Need Linking</div>
        </div>
        <div className="w-px h-10 bg-slate-200" />
        <div className="text-center">
          <div className="text-2xl font-black text-emerald-600">{linkedPlans.length}</div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Linked</div>
        </div>
        <div className="w-px h-10 bg-slate-200" />
        <div className="text-center">
          <div className="text-2xl font-black text-blue-600">{activeVariances.length}</div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Variances</div>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-[11px] text-slate-400 flex items-center gap-1">
            <Zap size={11} className="text-amber-500" />
            Seg (+5) · Streets (+4) · Scope (+2) · Hours (+2) · Date (+1)
          </span>
          {/* View mode toggle */}
          <div className="flex gap-0.5 bg-slate-200 rounded-lg p-0.5">
            <button
              onClick={() => setLinkViewMode('by_plan')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-semibold transition-colors ${
                linkViewMode === 'by_plan' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <LayoutList size={12} />
              By Plan
            </button>
            <button
              onClick={() => setLinkViewMode('by_variance')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-semibold transition-colors ${
                linkViewMode === 'by_variance' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Layers size={12} />
              By Variance
            </button>
          </div>
        </div>
      </div>

      {/* ── BY VARIANCE MODE ── */}
      {linkViewMode === 'by_variance' && (
        <div className="flex gap-4" style={{ minHeight: 500 }}>

          {/* Left: variance list */}
          <div className="flex flex-col gap-1" style={{ width: 260, flexShrink: 0 }}>
            <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1 px-1">
              {activeVariances.length} active variances
            </div>
            {activeVariances.map(v => {
              const isActive = v.id === selectedVarianceId;
              const expiryStatus = getVarianceExpiryStatus(v);
              const days = daysUntilExpiry(v);
              const linkedCount = plans.filter(p => {
                const track = p.compliance?.noiseVariance;
                if (!track) return false;
                const rootId = v.parentVarianceId ?? v.id;
                return getLinkedVarianceIds(track).includes(rootId);
              }).length;
              return (
                <button
                  key={v.id}
                  onClick={() => setSelectedVarianceId(v.id)}
                  className={`w-full text-left rounded-lg px-3 py-2.5 border transition-all ${
                    isActive
                      ? 'border-blue-400 bg-blue-50 shadow-sm'
                      : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <span className="text-[11px] font-bold text-slate-800 truncate">{v.permitNumber || v.title}</span>
                    {linkedCount > 0 && (
                      <span className="text-[9px] font-bold bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full flex-shrink-0">
                        {linkedCount} linked
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {v.coveredSegments.map(s => (
                      <span key={s} className="text-[9px] font-bold bg-blue-50 text-blue-700 px-1 py-0.5 rounded">{s}</span>
                    ))}
                    {v.isGeneric && <span className="text-[9px] font-semibold text-violet-600">Generic</span>}
                    <span className={`text-[9px] font-semibold ${expiryStatus === 'expired' ? 'text-red-500' : expiryStatus === 'critical' ? 'text-red-400' : expiryStatus === 'warning' ? 'text-amber-500' : 'text-emerald-600'}`}>
                      {expiryStatus === 'expired' ? 'Expired' : days !== null ? `${days}d left` : '✓'}
                    </span>
                  </div>
                  {(v.coveredStreets ?? []).length > 0 && (() => {
                    const raw = v.coveredStreets!;
                    const cors = v.corridors ?? [];
                    const sbExtras = findExtrasOutsideCorridors(cors, raw);
                    const sbExtSet = new Set(sbExtras.map(s => s.toLowerCase()));
                    const sbInRange = sortStreetsByCorridorOrder(raw.filter(s => !sbExtSet.has(s.toLowerCase())));
                    const sbExtrasSorted = sortStreetsByCorridorOrder(sbExtras);
                    const sbGaps = findGapsInCoverage(cors, raw);
                    return (
                      <div className="flex flex-wrap gap-0.5 mt-1">
                        {sbInRange.map((st, si) => (
                          <span key={si} className="px-1 py-0.5 rounded text-[9px] font-semibold bg-sky-50 text-sky-700 border border-sky-100">{st}</span>
                        ))}
                        {cors.length > 0 && sbExtrasSorted.map((st, si) => (
                          <span key={`e${si}`} className="px-1 py-0.5 rounded text-[9px] font-semibold bg-violet-50 text-violet-600 border border-dashed border-violet-200" title="Outside stated range">{st}</span>
                        ))}
                        {sbGaps.map((st, si) => (
                          <span key={`g${si}`} className="px-1 py-0.5 rounded text-[9px] font-semibold bg-amber-50 text-amber-600 border border-dashed border-amber-200" title="Possible gap">{st}?</span>
                        ))}
                      </div>
                    );
                  })()}
                </button>
              );
            })}
          </div>

          {/* Right: matching plans for selected variance */}
          <div className="flex-1 min-w-0">
            {!activeVariance ? (
              <div className="flex items-center justify-center h-full text-slate-400 text-sm">
                Select a variance on the left to see matching plans
              </div>
            ) : (
              <>
                {/* Variance header */}
                <div className="mb-3 p-3 bg-white rounded-xl border border-slate-200">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-bold text-slate-800">{activeVariance.permitNumber || activeVariance.title}</span>
                    {activeVariance.coveredSegments.map(s => (
                      <span key={s} className="text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded">Seg {s}</span>
                    ))}
                    {activeVariance.isGeneric && (
                      <span className="text-[10px] font-bold bg-violet-50 text-violet-700 border border-violet-200 px-1.5 py-0.5 rounded">Generic</span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {fmt(activeVariance.validFrom)} – {fmt(activeVariance.validThrough)}
                    {(activeVariance.coveredStreets ?? []).length > 0 && (() => {
                      const hdrSorted = sortStreetsByCorridorOrder(activeVariance.coveredStreets!);
                      const hdrGaps = findGapsInCoverage(activeVariance.corridors ?? [], activeVariance.coveredStreets!);
                      return (
                        <span className="flex flex-wrap gap-1 mt-1">
                          {hdrSorted.map((st, si) => (
                            <span key={si} className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-sky-50 text-sky-700 border border-sky-200">{st}</span>
                          ))}
                          {hdrGaps.map((st, si) => (
                            <span key={`hg${si}`} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-600 border border-dashed border-amber-300" title="Possible gap">
                              <AlertTriangle size={8} />{st}
                            </span>
                          ))}
                        </span>
                      );
                    })()}
                  </div>
                </div>

                {variancePlanMatches.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-slate-400">
                    <AlertTriangle size={24} className="mx-auto mb-2 text-amber-400" />
                    <div className="font-semibold text-slate-600 mb-1">No matching plans</div>
                    <div className="text-sm">No active plans with a NV track score against this variance.</div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">
                      {variancePlanMatches.length} plan{variancePlanMatches.length !== 1 ? 's' : ''} — {variancePlanMatches.filter(m => m.alreadyLinked).length} already linked
                    </div>
                    {variancePlanMatches.map(({ plan, variance: _v, score, signals, alreadyLinked }) => {
                      const conf = confidenceLabel(score);
                      const linkKey = `${plan.id}__${activeVariance.id}`;
                      const isLinking = linking === linkKey;
                      const isUnlinking = unlinking === (activeVariance.parentVarianceId ?? activeVariance.id) + plan.id;
                      return (
                        <div
                          key={plan.id}
                          className={`border rounded-lg p-3 flex items-center gap-3 ${
                            alreadyLinked ? 'border-emerald-200 bg-emerald-50/30' :
                            score >= 10 ? 'border-emerald-100 bg-white' :
                            score >= 6  ? 'border-amber-100 bg-white' : 'border-slate-200 bg-white'
                          }`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-0.5">
                              <span className="text-[11px] font-bold text-slate-800">{plan.loc || plan.id}</span>
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: conf.bg, color: conf.color }}>
                                {score}pt
                              </span>
                              {alreadyLinked && <CheckCircle size={11} className="text-emerald-500" />}
                              {plan.segment && <span className="text-[9px] font-bold bg-slate-100 text-slate-500 px-1 py-0.5 rounded">Seg {plan.segment}</span>}
                            </div>
                            <div className="text-[10px] text-slate-500 mb-1">
                              {[plan.street1, plan.street2].filter(Boolean).join(' / ')}
                              {plan.scope && <span className="ml-2 text-slate-400">{plan.scope}</span>}
                            </div>
                            {(plan.expandedStreets ?? []).length > 0 && (
                              <div className="flex flex-wrap gap-0.5 mb-1">
                                {plan.expandedStreets!.map((st, si) => (
                                  <span key={si} className="px-1 py-0.5 rounded text-[9px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100">{st}</span>
                                ))}
                              </div>
                            )}
                            <div className="flex flex-wrap gap-1">
                              <SignalBadge active={signals.segment}  label="Segment"  icon={<MapPin size={9} />} />
                              <SignalBadge active={signals.streets}  label="Streets"  icon={<MapPin size={9} />} />
                              <SignalBadge active={signals.scope}    label="Scope"    icon={<Tag size={9} />} />
                              <SignalBadge active={signals.hours}    label="Hours"    icon={<Clock size={9} />} />
                              <SignalBadge active={signals.date}     label="Date"     icon={<Calendar size={9} />} />
                            </div>
                          </div>
                          {alreadyLinked ? (
                            <button
                              onClick={() => handleUnlinkPlanFromVariance(plan)}
                              disabled={isUnlinking}
                              className="flex-shrink-0 flex items-center gap-1 text-[10px] font-semibold text-slate-400 hover:text-red-500 border border-slate-200 hover:border-red-200 rounded-lg px-2.5 py-1.5 transition-colors"
                            >
                              <X size={10} />
                              {isUnlinking ? '…' : 'Unlink'}
                            </button>
                          ) : (
                            <button
                              onClick={() => handleLinkPlanToVariance(plan)}
                              disabled={isLinking}
                              className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
                                isLinking
                                  ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                  : 'bg-slate-900 text-white hover:bg-slate-700 cursor-pointer'
                              }`}
                            >
                              <Link2 size={11} />
                              {isLinking ? '…' : 'Link'}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ── BY PLAN MODE ── */}
      {linkViewMode === 'by_plan' && (<>

      {/* All done state */}
      {pendingPlans.length === 0 && skippedPlans.length === 0 && (
        <div className="text-center py-16 text-slate-500">
          <CheckCircle size={40} className="text-emerald-500 mx-auto mb-3" />
          <div className="font-bold text-slate-700 mb-1">All plans are linked!</div>
          <div className="text-sm">Every active plan with a noise variance track has been linked to a library variance.</div>
        </div>
      )}

      {/* Main 2-column layout */}
      {(pendingPlans.length > 0 || skippedPlans.length > 0) && (
        <div className="flex gap-4" style={{ minHeight: 500 }}>

          {/* Left: plan list */}
          <div className="flex flex-col gap-1" style={{ width: 280, flexShrink: 0 }}>
            <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1 px-1">
              Plans needing a link ({pendingPlans.length})
            </div>

            {pendingPlans.map(plan => {
              const isActive = plan.id === selectedPlanId;
              const isHeld = held.has(plan.id);
              const linkedCount = getLinkedVarianceIds(plan.compliance?.noiseVariance ?? {}).length;
              // Best match score for preview
              const bestScore = activeVariances.length > 0
                ? Math.max(0, ...activeVariances.map(v => scoreMatch(plan, v).score))
                : 0;
              const conf = confidenceLabel(bestScore);

              return (
                <button
                  key={plan.id}
                  onClick={() => setSelectedPlanId(plan.id)}
                  className={`w-full text-left rounded-lg px-3 py-2.5 border transition-all ${
                    isActive
                      ? 'border-blue-400 bg-blue-50 shadow-sm'
                      : isHeld
                        ? 'border-amber-300 bg-amber-50/50 hover:border-amber-400'
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <span className="text-[11px] font-bold text-slate-800 flex items-center gap-1">
                      {isHeld && <Pin size={9} className="text-amber-500 flex-shrink-0" />}
                      {plan.loc || plan.id}
                    </span>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {isHeld && linkedCount > 0 && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                          {linkedCount} linked
                        </span>
                      )}
                      {bestScore > 0 && !isHeld && (
                        <span
                          className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                          style={{ background: conf.bg, color: conf.color }}
                        >
                          {bestScore}pt
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-[10px] text-slate-500 truncate">
                    {[plan.street1, plan.street2].filter(Boolean).join(' / ')}
                  </div>
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    {plan.segment && (
                      <span className="text-[9px] font-bold bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">{plan.segment}</span>
                    )}
                    {plan.scope && (
                      <span className="text-[9px] font-semibold text-slate-400 truncate">{plan.scope}</span>
                    )}
                    {(() => {
                      const cs = plan.expandedStreets ?? (getStreetsBetween(plan.street1 || '', plan.street2 || '').length > 1 ? getStreetsBetween(plan.street1 || '', plan.street2 || '') : null);
                      return cs && cs.length > 1 ? (
                        <span className="text-[9px] font-semibold text-sky-600 bg-sky-50 border border-sky-200 px-1.5 py-0.5 rounded">
                          {cs.length} streets
                        </span>
                      ) : null;
                    })()}
                  </div>
                </button>
              );
            })}

            {/* Skipped section */}
            {skippedPlans.length > 0 && (
              <>
                <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mt-3 mb-1 px-1">
                  Skipped ({skippedPlans.length})
                </div>
                {skippedPlans.map(plan => (
                  <button
                    key={plan.id}
                    onClick={() => { setSkipped(s => { const n = new Set(s); n.delete(plan.id); return n; }); setSelectedPlanId(plan.id); }}
                    className={`w-full text-left rounded-lg px-3 py-2 border border-dashed transition-all ${
                      plan.id === selectedPlanId
                        ? 'border-blue-400 bg-blue-50'
                        : 'border-slate-200 bg-white opacity-60 hover:opacity-100'
                    }`}
                  >
                    <div className="text-[11px] font-semibold text-slate-600">{plan.loc || plan.id}</div>
                    <div className="text-[10px] text-slate-400 truncate">{[plan.street1, plan.street2].filter(Boolean).join(' / ')}</div>
                  </button>
                ))}
              </>
            )}

            {/* Linked plans (collapsible) — click to select and add more */}
            {linkedPlans.length > 0 && (
              <button
                onClick={() => setShowLinked(s => !s)}
                className="text-[10px] font-bold uppercase tracking-wide text-emerald-600 mt-3 mb-1 px-1 text-left flex items-center gap-1 hover:text-emerald-700"
              >
                <CheckCircle size={10} />
                Already linked ({linkedPlans.length}) {showLinked ? '▴' : '▾'}
              </button>
            )}
            {showLinked && linkedPlans.map(plan => {
              const linkedIds = getLinkedVarianceIds(plan.compliance!.noiseVariance!);
              const isActive = plan.id === selectedPlanId;
              return (
                <button
                  key={plan.id}
                  onClick={() => setSelectedPlanId(plan.id)}
                  className={`w-full text-left rounded-lg px-3 py-2 border transition-all ${
                    isActive
                      ? 'border-blue-400 bg-blue-50 shadow-sm'
                      : 'border-emerald-200 bg-emerald-50/40 hover:border-emerald-300'
                  }`}
                >
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <CheckCircle size={10} className="text-emerald-600 flex-shrink-0" />
                    <span className="text-[11px] font-semibold text-slate-700">{plan.loc || plan.id}</span>
                    <span className="text-[9px] font-bold text-emerald-600 ml-auto">{linkedIds.length} ×</span>
                  </div>
                  <div className="text-[10px] text-slate-400 truncate">
                    {[plan.street1, plan.street2].filter(Boolean).join(' / ')}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Right: suggestions */}
          <div className="flex-1 min-w-0">
            {!activePlan ? (
              <div className="flex items-center justify-center h-full text-slate-400 text-sm">
                Select a plan on the left to see suggestions
              </div>
            ) : (
              <>
                {/* Plan header */}
                <div className="flex items-start justify-between mb-3 p-3 bg-white rounded-xl border border-slate-200">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-bold text-slate-800">{activePlan.loc || activePlan.id}</span>
                      {activePlan.segment && (
                        <span className="text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded">
                          Seg {activePlan.segment}
                        </span>
                      )}
                      {activePlan.scope && (
                        <span className="text-[10px] font-semibold bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                          {activePlan.scope}
                        </span>
                      )}
                    </div>
                    <div className="text-[12px] text-slate-500 mb-1">
                      {[activePlan.street1, activePlan.street2].filter(Boolean).join(' / ')}
                      {activePlan.needByDate && <span> · Need by {fmt(activePlan.needByDate)}</span>}
                      {activePlan.work_hours?.shift && <span> · {activePlan.work_hours.shift}</span>}
                    </div>
                    {/* Expanded street chips — south→north corridor streets between street1 and street2 */}
                    {activePlanStreetsSorted && activePlanStreetsSorted.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {activePlanStreetsSorted.map((st, i) => (
                          <span
                            key={i}
                            className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border ${
                              activePlanStreetsAuto
                                ? 'bg-slate-50 text-slate-500 border-slate-200'
                                : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            }`}
                          >
                            {st}
                          </span>
                        ))}
                        {activePlanStreetsAuto && (
                          <span className="self-center text-[9px] text-slate-400 italic ml-0.5">auto</span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                    <button
                      onClick={() => setSelectedPlan(activePlan)}
                      className="text-[11px] font-semibold text-blue-600 hover:text-blue-700 border border-blue-200 rounded-lg px-2.5 py-1.5 transition-colors"
                    >
                      Open Plan
                    </button>
                    {held.has(activePlan.id) ? (
                      <button
                        onClick={() => handleRelease(activePlan.id)}
                        className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600 hover:text-emerald-700 border border-emerald-300 bg-emerald-50 rounded-lg px-2.5 py-1.5 transition-colors"
                        title="Done adding variances — release from queue"
                      >
                        <CheckCircle size={11} />
                        Done{activePlanLinkedIds.length > 0 ? ` (${activePlanLinkedIds.length})` : ''}
                      </button>
                    ) : (
                      <button
                        onClick={() => handleHold(activePlan.id)}
                        className="flex items-center gap-1 text-[11px] font-semibold text-amber-600 hover:text-amber-700 border border-amber-200 rounded-lg px-2.5 py-1.5 transition-colors"
                        title="Keep this plan in queue to add more variances"
                      >
                        <Pin size={11} />
                        Hold
                      </button>
                    )}
                    <button
                      onClick={() => handleSkip(activePlan.id)}
                      className="flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-slate-700 border border-slate-200 rounded-lg px-2.5 py-1.5 transition-colors"
                    >
                      <SkipForward size={11} />
                      Skip
                    </button>
                  </div>
                </div>

                {/* Currently linked variances */}
                {activePlanLinkedIds.length > 0 && (
                  <div className="mb-4">
                    <div className="text-[10px] font-bold uppercase tracking-wide text-emerald-600 mb-2 flex items-center gap-1.5">
                      <CheckCircle size={10} />
                      {activePlanLinkedIds.length} variance{activePlanLinkedIds.length !== 1 ? 's' : ''} linked to this plan
                    </div>
                    <div className="flex flex-col gap-1.5">
                      {activePlanLinkedIds.map(linkedId => {
                        const lv = variances.find(v => (v.parentVarianceId ?? v.id) === linkedId || v.id === linkedId);
                        if (!lv) return null;
                        const { score } = scoreMatch(activePlan, lv);
                        const conf = confidenceLabel(score);
                        return (
                          <div key={linkedId} className="border border-emerald-200 bg-emerald-50/30 rounded-lg px-3 py-2.5 flex items-center gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap mb-0.5">
                                <span className="text-[11px] font-semibold text-slate-700">{lv.permitNumber || lv.title}</span>
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: conf.bg, color: conf.color }}>
                                  {score}pt
                                </span>
                              </div>
                              {(lv.coveredStreets ?? []).length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-0.5">
                                  {lv.coveredStreets!.map((st, si) => (
                                    <span key={si} className="inline-flex items-center px-1 py-0.5 rounded text-[9px] font-semibold bg-sky-50 text-sky-700 border border-sky-100">{st}</span>
                                  ))}
                                </div>
                              )}
                            </div>
                            <button
                              onClick={() => handleUnlink(activePlan, linkedId)}
                              disabled={unlinking === linkedId}
                              className="flex-shrink-0 flex items-center gap-1 text-[10px] font-semibold text-slate-400 hover:text-red-500 border border-slate-200 hover:border-red-200 rounded-lg px-2 py-1 transition-colors"
                            >
                              <X size={10} />
                              {unlinking === linkedId ? '…' : 'Unlink'}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Suggestions for additional variances */}
                {suggestions.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-slate-400">
                    {activePlanLinkedIds.length > 0 ? (
                      <>
                        <CheckCircle size={24} className="mx-auto mb-2 text-emerald-400" />
                        <div className="font-semibold text-slate-600 mb-1">No additional matches</div>
                        <div className="text-sm">All available variances are already linked, or none scored a match for the remaining scope.</div>
                      </>
                    ) : (
                      <>
                        <AlertTriangle size={24} className="mx-auto mb-2 text-amber-400" />
                        <div className="font-semibold text-slate-600 mb-1">No matching variances found</div>
                        <div className="text-sm">No active variances scored a match for this plan's segment, scope, or date range.<br />You may need to upload a variance first or skip this plan.</div>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">
                      {activePlanLinkedIds.length > 0
                        ? `${suggestions.length} additional variance${suggestions.length !== 1 ? 's' : ''} — add more if needed`
                        : `${suggestions.length} variance${suggestions.length !== 1 ? 's' : ''} ranked by match score`}
                    </div>
                    {suggestions.map(result => (
                      <VarianceCard
                        key={result.variance.id}
                        result={result}
                        onLink={() => handleLink(activePlan, result.variance)}
                        linking={linking === result.variance.id}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
      </>)}
      </>)}
    </div>
  );
}
