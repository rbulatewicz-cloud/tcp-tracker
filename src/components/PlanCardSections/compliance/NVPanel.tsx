import { useState } from 'react';
import { NoiseVarianceTrack, NoiseVariance } from '../../../types';
import { getVarianceExpiryStatus, daysUntilExpiry } from '../../../services/varianceService';

export function NVPanel({
  nv, canEdit, onChange, variances, planSegment, onDraftLetter,
}: {
  nv: NoiseVarianceTrack;
  canEdit: boolean;
  onChange: (n: NoiseVarianceTrack) => void;
  variances: NoiseVariance[];
  planSegment: string;
  onDraftLetter: () => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [scopeConfirm, setScopeConfirm] = useState<NoiseVariance | null>(null);

  // Live variances available to link (complete, not archived)
  const liveVariances = variances.filter(v => v.scanStatus === 'complete' && !v.isArchived);

  // Sort: segment-matching first, then generic, then others
  const sorted = [...liveVariances].sort((a, b) => {
    const aMatch = a.coveredSegments.includes(planSegment) ? 0 : 1;
    const bMatch = b.coveredSegments.includes(planSegment) ? 0 : 1;
    if (aMatch !== bMatch) return aMatch - bMatch;
    if (a.isGeneric && !b.isGeneric) return -1;
    if (!a.isGeneric && b.isGeneric) return 1;
    return 0;
  });

  // Currently linked variance
  const linked = nv.linkedVarianceId ? liveVariances.find(v => (v.parentVarianceId ?? v.id) === nv.linkedVarianceId || v.id === nv.linkedVarianceId) : null;

  const doLink = (v: NoiseVariance) => {
    const rootId = v.parentVarianceId ?? v.id;
    onChange({
      ...nv,
      linkedVarianceId: rootId,
      existingPermitNumber: v.permitNumber || nv.existingPermitNumber,
      status: 'linked_existing',
    });
    setPickerOpen(false);
    setScopeConfirm(null);
  };

  const handleSelect = (v: NoiseVariance) => {
    if (!v.isGeneric) {
      setScopeConfirm(v);
    } else {
      doLink(v);
    }
  };

  const handleUnlink = () => {
    onChange({ ...nv, linkedVarianceId: undefined });
  };

  const fmt = (iso: string) => {
    if (!iso) return '—';
    return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="space-y-3 px-3 pb-3">
      <div className="flex flex-wrap gap-1">
        {nv.triggeredBy.map(r => (
          <span key={r} className="bg-violet-50 border border-violet-200 text-violet-700 text-[10px] font-semibold px-2 py-0.5 rounded-full">
            {r}
          </span>
        ))}
      </div>

      <div className="rounded-lg border border-violet-100 bg-violet-50 px-3 py-2.5">
        <p className="text-[11px] text-violet-700 font-medium">
          🔊 A Police Commission Noise Variance is required for night work (LAMC 41.40). Contact the Police Commission at (323) 236-1400.
        </p>
      </div>

      {/* Linked variance display */}
      {linked ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5">
          {/* Expiry warning */}
          {(() => {
            const status = getVarianceExpiryStatus(linked);
            const days = daysUntilExpiry(linked);
            if (status === 'expired') return (
              <div className="mb-2 rounded-md bg-red-100 border border-red-300 px-2 py-1.5 text-[11px] font-semibold text-red-700">
                ⚠ Variance expired — renewal required
              </div>
            );
            if (status === 'critical') return (
              <div className="mb-2 rounded-md bg-red-50 border border-red-200 px-2 py-1.5 text-[11px] font-semibold text-red-600">
                ⚠ Expires in {days} day{days !== 1 ? 's' : ''} — renew soon
              </div>
            );
            if (status === 'warning') return (
              <div className="mb-2 rounded-md bg-amber-50 border border-amber-200 px-2 py-1.5 text-[11px] font-semibold text-amber-700">
                Expires in {days} days
              </div>
            );
            return null;
          })()}
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-600">Linked from Library</div>
            {canEdit && (
              <button onClick={handleUnlink} className="text-[10px] font-semibold text-slate-400 hover:text-red-500 transition-colors flex-shrink-0">
                Unlink
              </button>
            )}
          </div>
          <div className="text-[12px] font-semibold text-slate-800 leading-snug mb-2">{linked.title || linked.fileName}</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            {linked.permitNumber && (
              <div>
                <div className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">Permit #</div>
                <div className="text-[11px] font-mono font-semibold text-slate-700">{linked.permitNumber}</div>
              </div>
            )}
            <div>
              <div className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">Valid Through</div>
              <div className="text-[11px] font-semibold text-slate-700">{fmt(linked.validThrough)}</div>
            </div>
            {linked.coveredSegments.length > 0 && (
              <div>
                <div className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">Segments</div>
                <div className="text-[11px] font-semibold text-slate-700">{linked.coveredSegments.join(', ')}</div>
              </div>
            )}
            <div>
              <div className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">Hours</div>
              <div className="text-[11px] font-semibold text-slate-700">
                {linked.applicableHours === 'nighttime' ? 'Nighttime' : linked.applicableHours === '24_7' ? '24/7 Continuous' : 'Nighttime + 24/7'}
              </div>
            </div>
            {linked.submittedDate && (
              <div>
                <div className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">Submitted</div>
                <div className="text-[11px] font-semibold text-slate-700">{fmt(linked.submittedDate)}</div>
              </div>
            )}
            {linked.approvalDate && (
              <div>
                <div className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">Approved</div>
                <div className="text-[11px] font-semibold text-emerald-700 font-bold">{fmt(linked.approvalDate)}</div>
              </div>
            )}
          </div>
        </div>
      ) : canEdit && liveVariances.length > 0 && (
        <button
          onClick={() => setPickerOpen(o => !o)}
          className="flex items-center gap-1.5 text-[11px] font-semibold text-violet-600 hover:text-violet-800 transition-colors"
        >
          <span className="text-base leading-none">🔗</span>
          {pickerOpen ? 'Cancel' : 'Link from Library'}
        </button>
      )}

      {/* Variance picker */}
      {pickerOpen && !linked && (
        <div className="rounded-lg border border-violet-200 bg-white overflow-hidden">
          {sorted.length === 0 ? (
            <p className="text-[11px] text-slate-400 px-3 py-2">No variances in library yet.</p>
          ) : (
            <div className="divide-y divide-slate-100 max-h-52 overflow-y-auto">
              {sorted.map(v => {
                const isMatch = v.coveredSegments.includes(planSegment);
                return (
                  <button
                    key={v.id}
                    onClick={() => handleSelect(v)}
                    className="w-full text-left px-3 py-2 hover:bg-violet-50 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] font-semibold text-slate-800 truncate">{v.title || v.fileName}</div>
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          {v.permitNumber && <span className="font-mono mr-1">{v.permitNumber} · </span>}
                          Segs: {v.coveredSegments.join(', ') || 'All'} · Expires {fmt(v.validThrough)}
                          {!v.isGeneric && <span className="ml-1 text-amber-600 font-semibold">· Specific scope ⚠</span>}
                        </div>
                      </div>
                      {isMatch && <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded flex-shrink-0">Match</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Scope confirmation gate */}
      {scopeConfirm && (
        <div className="rounded-lg border-2 border-amber-300 bg-amber-50 p-3 space-y-2">
          <div className="text-[11px] font-bold text-amber-800">⚠ Confirm scope coverage</div>
          <p className="text-[11px] text-slate-700">This variance has a specific scope restriction. Verbatim language:</p>
          <p className="text-[11px] italic text-slate-600 bg-white border border-amber-200 rounded px-2 py-1.5">
            &ldquo;{scopeConfirm.scopeLanguage}&rdquo;
          </p>
          <p className="text-[11px] font-semibold text-amber-800">Does this plan&apos;s work fall within this scope?</p>
          <div className="flex gap-2">
            <button onClick={() => doLink(scopeConfirm)} className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold transition-colors">
              Yes, link it
            </button>
            <button onClick={() => setScopeConfirm(null)} className="px-3 py-1 rounded-lg bg-white border border-slate-200 text-slate-600 text-[11px] font-semibold hover:bg-slate-50 transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      {canEdit && (
        <div className="grid grid-cols-2 gap-3">
          {[
            ...(!linked ? [{ key: 'existingPermitNumber', label: 'Existing Permit # (if obtained)' }] : []),
            ...(!linked ? [{ key: 'submittedDate', label: 'Submitted Date' }] : []),
            ...(!linked ? [{ key: 'approvalDate',  label: 'Approval Date'  }] : []),
          ].map(f => (
            <div key={f.key}>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block mb-1">{f.label}</label>
              <input
                type={f.key.includes('Date') ? 'date' : 'text'}
                value={(nv as any)[f.key] || ''}
                onChange={e => onChange({ ...nv, [f.key]: e.target.value })}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[12px] outline-none focus:border-violet-400"
              />
            </div>
          ))}
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block mb-1">Notes</label>
            <input
              value={nv.notes || ''}
              onChange={e => onChange({ ...nv, notes: e.target.value })}
              placeholder="Additional notes..."
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[12px] outline-none focus:border-violet-400"
            />
          </div>
        </div>
      )}

      <div>
        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Variance Letter</div>
        {linked?.fileUrl ? (
          <a
            href={linked.fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 transition-colors"
          >
            <span className="text-emerald-600">📄</span>
            <span className="text-[11px] font-semibold text-emerald-700 truncate flex-1">{linked.fileName}</span>
            <span className="text-[10px] font-semibold text-emerald-600 flex-shrink-0">View PDF →</span>
          </a>
        ) : (
          <div className="rounded-lg border border-dashed border-violet-200 bg-slate-50 px-3 py-2.5 flex items-center justify-between gap-3">
            <p className="text-[11px] text-slate-400">Draft an application letter to the LA Police Commission.</p>
            <button
              onClick={onDraftLetter}
              className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-[11px] font-bold transition-colors"
            >
              ✉ Draft Letter
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
