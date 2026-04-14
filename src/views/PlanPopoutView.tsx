import { useState, useEffect } from 'react';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db, loginWithGoogle } from '../firebase';
import { Plan } from '../types';

interface Props { locId: string; }

function StatusBadge({ stage }: { stage: string }) {
  const map: Record<string, string> = {
    requested:      'bg-slate-100 text-slate-600',
    drafting:       'bg-blue-100 text-blue-700',
    submitted:      'bg-amber-100 text-amber-700',
    submitted_to_dot: 'bg-amber-100 text-amber-700',
    tcp_approved:   'bg-purple-100 text-purple-700',
    loc_submitted:  'bg-indigo-100 text-indigo-700',
    plan_approved:  'bg-emerald-100 text-emerald-700',
    approved:       'bg-emerald-100 text-emerald-700',
    cancelled:      'bg-red-100 text-red-600',
    closed:         'bg-slate-200 text-slate-500',
  };
  const cls = map[stage] ?? 'bg-slate-100 text-slate-500';
  const label = stage.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cls}`}>{label}</span>;
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

export function PlanPopoutView({ locId }: Props) {
  const [fbUser, setFbUser]     = useState<FirebaseUser | null | 'loading'>('loading');
  const [plan,   setPlan]       = useState<Plan | null | 'loading'>('loading');
  const [error,  setError]      = useState<string | null>(null);
  const [signing, setSigning]   = useState(false);

  // Auth listener
  useEffect(() => {
    return onAuthStateChanged(auth, user => setFbUser(user));
  }, []);

  // Fetch plan once signed in
  useEffect(() => {
    if (!fbUser || fbUser === 'loading') return;
    setPlan('loading');
    getDoc(doc(db, 'plans', locId))
      .then(snap => {
        if (!snap.exists()) { setError(`Plan "${locId}" not found.`); setPlan(null); }
        else setPlan({ id: snap.id, ...snap.data() } as Plan);
      })
      .catch(() => { setError('Failed to load plan.'); setPlan(null); });
  }, [fbUser, locId]);

  const handleSignIn = async () => {
    setSigning(true);
    try { await loginWithGoogle(); } catch { /* user cancelled */ }
    finally { setSigning(false); }
  };

  // ── Auth gate ──────────────────────────────────────────────────────────────
  if (fbUser === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-5 h-5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!fbUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xl p-8 w-80 text-center">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">TCP Tracker</div>
          <div className="text-lg font-bold text-slate-900 mb-1 font-mono">{locId}</div>
          <p className="text-sm text-slate-500 mb-6">Sign in to view this plan.</p>
          <button
            onClick={handleSignIn}
            disabled={signing}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-900 text-white text-sm font-bold rounded-xl hover:bg-slate-700 disabled:opacity-50 transition-colors"
          >
            {signing ? 'Signing in…' : 'Sign in with Google'}
          </button>
        </div>
      </div>
    );
  }

  // ── Loading plan ───────────────────────────────────────────────────────────
  if (plan === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-5 h-5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
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

  const winStart = plan.implementationWindow?.startDate || plan.softImplementationWindow?.startDate;
  const winEnd   = plan.implementationWindow?.endDate   || plan.softImplementationWindow?.endDate;
  const daysOpen = (() => {
    const start = new Date(plan.dateRequested || plan.requestDate || '');
    if (isNaN(start.getTime())) return null;
    const done = ['plan_approved', 'approved', 'closed'].includes(plan.stage || '');
    const end = done && plan.approvedDate ? new Date(plan.approvedDate) : new Date();
    return Math.ceil(Math.abs(end.getTime() - start.getTime()) / 86400000);
  })();
  const appUrl = `${window.location.origin}${window.location.pathname}?plan=${encodeURIComponent(locId)}`;

  // ── Plan view ──────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-100 flex items-start justify-center py-6 px-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-[560px] overflow-hidden">

        {/* Header */}
        <div className="px-6 pt-5 pb-4 border-b border-slate-100">
          <div className="flex items-start justify-between mb-1">
            <div className="text-[22px] font-bold text-slate-900 font-mono">{plan.loc || plan.id}</div>
            <div className="flex items-center gap-2">
              {daysOpen !== null && (
                <div className="flex items-center gap-1 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-100">
                  <span className="text-sm font-bold text-amber-700">{daysOpen}</span>
                  <span className="text-[9px] text-amber-700 font-bold uppercase tracking-wider">days open</span>
                </div>
              )}
              <StatusBadge stage={plan.stage || ''} />
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

        {/* Fields grid */}
        <div className="px-6 py-4 grid grid-cols-2 gap-x-6 gap-y-3 border-b border-slate-100">
          <Field label="Plan Type"    value={plan.type} />
          <Field label="Priority"     value={plan.priority} />
          <Field label="Scope"        value={plan.scope} />
          <Field label="Segment"      value={plan.segment} />
          <Field label="Lead"         value={plan.lead} />
          <Field label="Need By"      value={plan.needByDate} />
          {(winStart || winEnd) && (
            <div className="col-span-2">
              <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Implementation Window</div>
              <div className="text-[12px] text-slate-800 font-medium">{winStart ?? '—'} → {winEnd ?? '—'}</div>
            </div>
          )}
        </div>

        {/* Notes */}
        {plan.notes && (
          <div className="px-6 py-4 border-b border-slate-100">
            <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Notes</div>
            <p className="text-[12px] text-slate-700 leading-relaxed whitespace-pre-line">{plan.notes}</p>
          </div>
        )}

        {/* Documents */}
        {(plan.attachments?.length ?? 0) > 0 && (
          <div className="px-6 py-4 border-b border-slate-100">
            <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-2">Documents</div>
            <div className="space-y-1">
              {(plan.attachments as { name: string; data: string }[]).map((a, i) => (
                <a key={i} href={a.data} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 text-[11px] text-indigo-600 hover:text-indigo-800 font-medium truncate">
                  <span className="text-slate-300">📄</span>{a.name}
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
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
