import { AlertTriangle, Clock, Tag, MapPin, Calendar, Wrench } from 'lucide-react';
import type { Plan, NoiseVariance } from '../../../types';
import { confidenceLabel, MatchResult } from './scoring';
import { SignalBadge } from './SignalBadge';

export interface LinkedPlanScoreRow {
  plan: Plan;
  linkedVars: NoiseVariance[];
  results: MatchResult[];
  minScore: number;
}

/**
 * "Review Links" panel — rescores every already-linked plan against its
 * linked variance(s) so stale or wrong links surface. Weakly-scoring rows
 * (< 6pt) are tinted amber and get a "Fix Link" button that kicks the user
 * back to the Link tab scoped to that plan.
 *
 * Parent owns the scored rows and all navigation — this component only
 * renders and delegates clicks via callbacks.
 */
export function ReviewTab({
  linkedWithScores,
  weakLinkCount,
  onFixLink,
  onOpenPlan,
}: {
  linkedWithScores: LinkedPlanScoreRow[];
  weakLinkCount: number;
  onFixLink: (plan: Plan) => void;
  onOpenPlan: (plan: Plan) => void;
}) {
  return (
    <div>
      <div className="mb-4">
        <h3 className="text-sm font-bold text-slate-800 mb-1">Review existing links</h3>
        <p className="text-[12px] text-slate-500">
          Rescores all already-linked plans against their linked variance. Weak scores may indicate a wrong or outdated link.
        </p>
      </div>

      {weakLinkCount > 0 && (
        <div className="mb-3 flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-[11px] font-semibold text-amber-700">
          <AlertTriangle size={13} />
          {weakLinkCount} link{weakLinkCount !== 1 ? 's' : ''} scored below 6 — worth reviewing
        </div>
      )}

      <div className="flex flex-col gap-3">
        {linkedWithScores.map(({ plan, results }) => {
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
                      onClick={() => onFixLink(plan)}
                      className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-600 hover:text-amber-700 border border-amber-300 bg-amber-50 rounded-lg px-2.5 py-1.5 transition-colors"
                    >
                      <Wrench size={11} />
                      Fix Link
                    </button>
                  )}
                  <button
                    onClick={() => onOpenPlan(plan)}
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
  );
}
