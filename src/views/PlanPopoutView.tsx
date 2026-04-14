import { useState, useEffect } from 'react';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db, loginWithGoogle } from '../firebase';
import { Plan } from '../types';

interface Props { locId: string; }

// ── Helpers ────────────────────────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="px-6 py-2 bg-slate-50 border-y border-slate-100">
      <span className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400">{title}</span>
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div>
      <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">{label}</div>
      <div className="text-[12px] text-slate-800 font-medium">{value}</div>
    </div>
  );
}

const STAGE_ORDER = ['requested','drafting','submitted_to_dot','tcp_approved','loc_submitted','plan_approved'];
const STAGE_LABELS: Record<string, string> = {
  requested: 'Requested', drafting: 'Drafting', submitted_to_dot: 'Submitted to DOT',
  tcp_approved: 'TCP Approved', loc_submitted: 'LOC Submitted', plan_approved: 'Plan Approved',
};
const COMPLIANCE_STATUS_CLS: Record<string, string> = {
  not_started: 'bg-slate-100 text-slate-500',
  in_progress: 'bg-blue-100 text-blue-700',
  submitted:   'bg-amber-100 text-amber-700',
  approved:    'bg-emerald-100 text-emerald-700',
  na:          'bg-slate-100 text-slate-400',
  pending:     'bg-yellow-100 text-yellow-700',
};

function ComplianceBadge({ status }: { status?: string }) {
  if (!status) return null;
  const cls = COMPLIANCE_STATUS_CLS[status] ?? 'bg-slate-100 text-slate-500';
  const label = status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  return <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${cls}`}>{label}</span>;
}

function DocLink({ name, url }: { name: string; url: string }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer"
      className="flex items-center gap-2 text-[11px] text-indigo-600 hover:text-indigo-800 font-medium truncate py-0.5">
      <span className="text-slate-300 flex-shrink-0">📄</span>{name}
    </a>
  );
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

// ── Main component ─────────────────────────────────────────────────────────────

export function PlanPopoutView({ locId }: Props) {
  const [fbUser,  setFbUser]  = useState<FirebaseUser | null | 'loading'>('loading');
  const [plan,    setPlan]    = useState<Plan | null | 'loading'>('loading');
  const [error,   setError]   = useState<string | null>(null);
  const [signing, setSigning] = useState(false);

  useEffect(() => onAuthStateChanged(auth, u => setFbUser(u)), []);

  useEffect(() => {
    if (!fbUser || fbUser === 'loading') return;
    getDoc(doc(db, 'plans', locId))
      .then(snap => {
        if (!snap.exists()) { setError(`Plan "${locId}" not found.`); setPlan(null); }
        else setPlan({ id: snap.id, ...snap.data() } as Plan);
      })
      .catch(() => { setError('Failed to load plan.'); setPlan(null); });
  }, [fbUser, locId]);

  const handleSignIn = async () => {
    setSigning(true);
    try { await loginWithGoogle(); } catch { /* cancelled */ } finally { setSigning(false); }
  };

  const Spinner = () => (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="w-5 h-5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (fbUser === 'loading' || plan === 'loading') return <Spinner />;

  if (!fbUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xl p-8 w-80 text-center">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">TCP Tracker</div>
          <div className="text-lg font-bold text-slate-900 mb-1 font-mono">{locId}</div>
          <p className="text-sm text-slate-500 mb-6">Sign in to view this plan.</p>
          <button onClick={handleSignIn} disabled={signing}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-900 text-white text-sm font-bold rounded-xl hover:bg-slate-700 disabled:opacity-50 transition-colors">
            {signing ? 'Signing in…' : 'Sign in with Google'}
          </button>
        </div>
      </div>
    );
  }

  if (!plan || error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-sm text-slate-500">{error ?? 'Plan not found.'}</div>
      </div>
    );
  }

  // ── Derived values ───────────────────────────────────────────────────────────
  const winStart = plan.implementationWindow?.startDate || plan.softImplementationWindow?.startDate;
  const winEnd   = plan.implementationWindow?.endDate   || plan.softImplementationWindow?.endDate;
  const daysOpen = (() => {
    const start = new Date(plan.dateRequested || plan.requestDate || '');
    if (isNaN(start.getTime())) return null;
    const done = ['plan_approved','approved','closed'].includes(plan.stage || '');
    const end = done && plan.approvedDate ? new Date(plan.approvedDate) : new Date();
    return Math.ceil(Math.abs(end.getTime() - start.getTime()) / 86400000);
  })();
  const stageIdx = STAGE_ORDER.indexOf(plan.stage || '');
  const wh = plan.work_hours;
  const c  = plan.compliance;
  const allDocs = [
    ...(Array.isArray(plan.attachments) ? (plan.attachments as {name:string;data:string}[]).map(a => ({ name: a.name, url: a.data, tag: 'Submission' })) : []),
    ...(plan.approvedTCPs ?? []).map(d => ({ name: d.name, url: d.url, tag: 'TCP' })),
    ...(plan.approvedLOCs ?? []).map(d => ({ name: d.name, url: d.url, tag: 'LOC' })),
    ...(plan.reviewCycles ?? []).flatMap(rc =>
      (rc.attachments ?? []).map(a => ({ name: a.name || `Cycle ${rc.cycleNumber}`, url: a.url || a.data || '', tag: `Cycle ${rc.cycleNumber}` }))
    ),
  ].filter(d => d.url);
  const appUrl = `${window.location.origin}${window.location.pathname}?plan=${encodeURIComponent(locId)}`;
  const impactFlags = [
    plan.dir_nb && 'NB', plan.dir_sb && 'SB', plan.dir_directional && 'DIR', plan.side_street && 'Side St',
    plan.impact_krail && 'Krail', plan.impact_fullClosure && 'Full Closure', plan.impact_driveway && 'Driveway',
    plan.impact_busStop && 'Bus Stop', plan.impact_transit && 'TANSAT',
  ].filter(Boolean) as string[];

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-100 flex items-start justify-center py-6 px-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-[560px] overflow-hidden">

        {/* ── Header ── */}
        <div className="px-6 pt-5 pb-4 border-b border-slate-100">
          <div className="flex items-start justify-between mb-1">
            <div className="text-[22px] font-bold text-slate-900 font-mono">{plan.loc || plan.id}</div>
            <div className="flex items-center gap-2 flex-wrap justify-end">
              {daysOpen !== null && (
                <div className="flex items-center gap-1 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-100">
                  <span className="text-sm font-bold text-amber-700">{daysOpen}</span>
                  <span className="text-[9px] text-amber-700 font-bold uppercase tracking-wider">days open</span>
                </div>
              )}
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                plan.stage === 'plan_approved' || plan.stage === 'approved' ? 'bg-emerald-100 text-emerald-700' :
                plan.stage === 'submitted_to_dot' ? 'bg-amber-100 text-amber-700' :
                plan.stage === 'drafting' ? 'bg-blue-100 text-blue-700' :
                plan.stage === 'tcp_approved' ? 'bg-purple-100 text-purple-700' :
                plan.stage === 'loc_submitted' ? 'bg-indigo-100 text-indigo-700' :
                'bg-slate-100 text-slate-600'
              }`}>
                {(STAGE_LABELS[plan.stage || ''] || plan.stage || '').replace(/_/g, ' ')}
              </span>
            </div>
          </div>
          <div className="text-base font-semibold text-slate-800 mb-1">
            {plan.street1}{plan.street2 ? <> <span className="text-slate-400 font-normal">/</span> {plan.street2}</> : null}
          </div>
          {plan.requestedBy && (
            <div className="text-[11px] text-slate-400">
              Requested by <span className="font-semibold text-slate-600">{plan.requestedBy}</span>
              {(plan.dateRequested || plan.requestDate) && (
                <span className="ml-2">{(plan.dateRequested || plan.requestDate || '').split('T')[0]}</span>
              )}
            </div>
          )}
        </div>

        {/* ── Stage progression ── */}
        {stageIdx >= 0 && (
          <div className="px-6 py-3 border-b border-slate-100">
            <div className="flex items-center gap-0">
              {STAGE_ORDER.map((s, i) => {
                const done    = i < stageIdx;
                const current = i === stageIdx;
                const last    = i === STAGE_ORDER.length - 1;
                return (
                  <div key={s} className="flex items-center flex-1 min-w-0">
                    <div className={`flex-shrink-0 w-2 h-2 rounded-full ${current ? 'bg-indigo-600' : done ? 'bg-emerald-500' : 'bg-slate-200'}`} />
                    {!last && <div className={`flex-1 h-px ${done ? 'bg-emerald-300' : 'bg-slate-200'}`} />}
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between mt-1">
              {STAGE_ORDER.map((s, i) => (
                <div key={s} className={`text-[8px] font-semibold text-center flex-1 leading-tight ${i === stageIdx ? 'text-indigo-600' : i < stageIdx ? 'text-emerald-600' : 'text-slate-300'}`}>
                  {STAGE_LABELS[s]}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Plan Details ── */}
        <SectionHeader title="Plan Details" />
        <div className="px-6 py-4 grid grid-cols-2 gap-x-6 gap-y-3 border-b border-slate-100">
          <Field label="Plan Type"  value={plan.type} />
          <Field label="Priority"   value={plan.priority} />
          <Field label="Scope"      value={plan.scope} />
          <Field label="Segment"    value={plan.segment} />
          <Field label="Lead"       value={plan.lead} />
          <Field label="Need By"    value={plan.needByDate} />
          {plan.planDurationDays && <Field label="Duration" value={`${plan.planDurationDays} days`} />}
          {(winStart || winEnd) && (
            <div className="col-span-2">
              <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Implementation Window</div>
              <div className="text-[12px] text-slate-800 font-medium">{winStart ?? '—'} → {winEnd ?? '—'}</div>
            </div>
          )}
        </div>

        {/* ── Traffic Impacts ── */}
        {impactFlags.length > 0 && (
          <>
            <SectionHeader title="Traffic Impacts" />
            <div className="px-6 py-3 flex flex-wrap gap-1.5 border-b border-slate-100">
              {impactFlags.map(f => (
                <span key={f} className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">{f}</span>
              ))}
            </div>
          </>
        )}

        {/* ── Hours of Work ── */}
        {wh && (
          <>
            <SectionHeader title="Hours of Work" />
            <div className="px-6 py-3 border-b border-slate-100 text-[11px] text-slate-700">
              {wh.shift === 'continuous' ? (
                <span className="font-semibold">24/7 Continuous</span>
              ) : (
                <div className="space-y-0.5">
                  <div><span className="font-bold text-slate-500">Shift:</span> {wh.shift}</div>
                  {wh.days.length > 0 && <div><span className="font-bold text-slate-500">Days:</span> {wh.days.join(', ')}</div>}
                  {wh.weekday_start && <div><span className="font-bold text-slate-500">Weekday:</span> {wh.weekday_start} – {wh.weekday_end}</div>}
                  {wh.saturday_start && <div><span className="font-bold text-slate-500">Saturday:</span> {wh.saturday_start} – {wh.saturday_end}</div>}
                  {wh.sunday_start && <div><span className="font-bold text-slate-500">Sunday:</span> {wh.sunday_start} – {wh.sunday_end}</div>}
                </div>
              )}
            </div>
          </>
        )}

        {/* ── Compliance ── */}
        {c && (Object.keys(c).length > 0) && (
          <>
            <SectionHeader title="Compliance" />
            <div className="px-6 py-3 space-y-2 border-b border-slate-100">
              {c.phe && (
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-[11px] font-bold text-slate-700">Peak Hour Exemption</div>
                    {c.phe.peakHourJustification && <p className="text-[10px] text-slate-500 mt-0.5">{c.phe.peakHourJustification}</p>}
                    {c.phe.boePermitNumber && <p className="text-[10px] text-slate-500">Permit #{c.phe.boePermitNumber}</p>}
                  </div>
                  <ComplianceBadge status={c.phe.status} />
                </div>
              )}
              {c.noiseVariance && (
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-[11px] font-bold text-slate-700">Noise Variance</div>
                    {c.noiseVariance.existingPermitNumber && <p className="text-[10px] text-slate-500">Permit #{c.noiseVariance.existingPermitNumber}</p>}
                    {c.noiseVariance.notes && <p className="text-[10px] text-slate-500 mt-0.5">{c.noiseVariance.notes}</p>}
                  </div>
                  <ComplianceBadge status={c.noiseVariance.status} />
                </div>
              )}
              {c.cdConcurrence && (
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-[11px] font-bold text-slate-700">CD Concurrence</div>
                    {c.cdConcurrence.cds && c.cdConcurrence.cds.length > 0 && (
                      <p className="text-[10px] text-slate-500 mt-0.5">
                        {c.cdConcurrence.cds.map(cd => `${cd.cd}: ${cd.status.replace(/_/g,' ')}`).join(' · ')}
                      </p>
                    )}
                  </div>
                  <ComplianceBadge status={c.cdConcurrence.status} />
                </div>
              )}
              {c.drivewayNotices && (
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-[11px] font-bold text-slate-700">Driveway Notices</div>
                    {(c.drivewayNotices.addresses?.length ?? 0) > 0 && (
                      <p className="text-[10px] text-slate-500 mt-0.5">{c.drivewayNotices.addresses!.length} address{c.drivewayNotices.addresses!.length !== 1 ? 'es' : ''}</p>
                    )}
                  </div>
                  <ComplianceBadge status={c.drivewayNotices.status} />
                </div>
              )}
            </div>
          </>
        )}

        {/* ── Notes ── */}
        {plan.notes && (
          <>
            <SectionHeader title="Notes" />
            <div className="px-6 py-3 border-b border-slate-100">
              <p className="text-[12px] text-slate-700 leading-relaxed whitespace-pre-line">{plan.notes}</p>
            </div>
          </>
        )}

        {/* ── Documents ── */}
        {allDocs.length > 0 && (
          <>
            <SectionHeader title="Documents" />
            <div className="px-6 py-3 border-b border-slate-100 space-y-0.5">
              {allDocs.map((d, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-[9px] font-bold text-slate-400 w-14 flex-shrink-0 uppercase">{d.tag}</span>
                  <DocLink name={d.name} url={d.url} />
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── Review Cycles ── */}
        {(plan.reviewCycles?.length ?? 0) > 0 && (
          <>
            <SectionHeader title="Review Cycles" />
            <div className="px-6 py-3 border-b border-slate-100 space-y-2">
              {plan.reviewCycles!.map((rc, i) => (
                <div key={i} className="text-[11px]">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-bold text-slate-700">Cycle {rc.cycleNumber}</span>
                    <span className="text-slate-400 text-[10px]">{rc.cycleType?.replace(/_/g,' ')}</span>
                  </div>
                  {rc.commentsReceivedDate && <div className="text-slate-500">Comments received: {rc.commentsReceivedDate}</div>}
                  {rc.commentsDescription && <div className="text-slate-600 italic mt-0.5 text-[10px] leading-snug">{rc.commentsDescription}</div>}
                  {rc.revisionSubmittedDate && <div className="text-slate-500">Resubmitted: {rc.revisionSubmittedDate}</div>}
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── Activity Log ── */}
        {(plan.log?.length ?? 0) > 0 && (
          <>
            <SectionHeader title="Activity Log" />
            <div className="px-6 py-3 border-b border-slate-100 space-y-2 max-h-64 overflow-y-auto">
              {[...plan.log].reverse().map((entry, i) => (
                <div key={entry.uniqueId ?? i} className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-slate-300 flex-shrink-0 mt-1.5" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] text-slate-700 leading-snug">{entry.action}</div>
                    <div className="text-[9px] text-slate-400 mt-0.5">
                      {entry.user} · {timeAgo(entry.date)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── Footer ── */}
        <div className="px-6 py-3 bg-slate-50 flex items-center justify-between">
          <span className="text-[10px] text-slate-400">Read-only · TCP Tracker</span>
          <a href={appUrl} target="_blank" rel="noopener noreferrer"
            className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 transition-colors">
            Open in app →
          </a>
        </div>

      </div>
    </div>
  );
}
