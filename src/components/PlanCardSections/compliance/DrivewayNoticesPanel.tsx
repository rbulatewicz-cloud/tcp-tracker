import { useState } from 'react';
import { DrivewayNoticeTrack, DrivewayAddress, DrivewayLetterStatus, DrivewayWaiveReason, Plan, AppConfig, DrivewayProperty } from '../../../types';
import { fmtDate as fmt, daysUntil } from '../../../utils/plans';

const WAIVE_REASON_LABEL: Record<DrivewayWaiveReason, string> = {
  scope_changed: 'Scope change — no longer impacts driveways',
  metro_waived:  'Metro waived notification',
  work_done:     'Work completed without needing notification',
  other:         'Other (see note)',
};

/** Returns the number of days the plan window has shifted since the notice was sent, or null if no shift / already dismissed. */
function detectDateShift(addr: DrivewayAddress, plan: Plan, reissueDays: number): number | null {
  if (!addr.noticeSent || !addr.sentWindowStart || addr.dateShiftDismissed) return null;
  const currentRef = plan.implementationWindow?.startDate ?? plan.softImplementationWindow?.startDate;
  if (!currentRef) return null;
  const sentMs    = new Date(addr.sentWindowStart + 'T00:00:00').getTime();
  const currentMs = new Date(currentRef          + 'T00:00:00').getTime();
  const shiftDays = Math.abs(Math.round((currentMs - sentMs) / (1000 * 60 * 60 * 24)));
  return shiftDays >= reissueDays ? shiftDays : null;
}

const LETTER_STATUS_BADGE: Record<DrivewayLetterStatus, { label: string; cls: string }> = {
  not_drafted:              { label: 'Not Drafted',        cls: 'bg-slate-100 text-slate-500' },
  draft:                    { label: 'Draft',              cls: 'bg-amber-50 text-amber-700 border border-amber-200' },
  submitted_to_metro:       { label: 'With Metro',         cls: 'bg-indigo-50 text-indigo-700 border border-indigo-200' },
  metro_revision_requested: { label: 'Metro: Revise',      cls: 'bg-orange-50 text-orange-700 border border-orange-200' },
  approved:                 { label: 'Metro Approved',     cls: 'bg-blue-50 text-blue-700 border border-blue-200' },
  sent:                     { label: 'Sent',               cls: 'bg-emerald-50 text-emerald-700 border border-emerald-200' },
};

export function DrivewayNoticesPanel({
  dn, canEdit, onChange, plan, appConfig, drivewayProperties, currentUserEmail,
}: {
  dn: DrivewayNoticeTrack;
  canEdit: boolean;
  onChange: (d: DrivewayNoticeTrack) => void;
  plan: Plan;
  appConfig: AppConfig;
  drivewayProperties: DrivewayProperty[];
  currentUserEmail?: string;
}) {
  const [showWaiveForm, setShowWaiveForm] = useState(false);
  const [waiveReason, setWaiveReason] = useState<DrivewayWaiveReason>('scope_changed');
  const [waiveNote, setWaiveNote] = useState('');

  const isWaived = dn.status === 'waived';

  function applyWaive() {
    // Note is required when reason is 'other'
    if (waiveReason === 'other' && !waiveNote.trim()) return;
    onChange({
      ...dn,
      status: 'waived',
      waivedReason: waiveReason,
      waivedNote:   waiveNote.trim() || undefined,
      waivedAt:     new Date().toISOString(),
      waivedBy:     currentUserEmail || 'Unknown',
    });
    setShowWaiveForm(false);
    setWaiveNote('');
    setWaiveReason('scope_changed');
  }

  function unwaive() {
    // Reverting: drop waive metadata, reset status based on what addresses exist.
    const nextStatus = dn.addresses.some(a => a.letterStatus === 'sent' || a.noticeSent)
      ? 'in_progress'
      : 'not_started';
    onChange({
      ...dn,
      status: nextStatus,
      waivedReason: undefined,
      waivedNote:   undefined,
      waivedAt:     undefined,
      waivedBy:     undefined,
    });
  }
  const addAddress = () => {
    const newAddr: DrivewayAddress = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2),
      address: '',
    };
    onChange({ ...dn, addresses: [...dn.addresses, newAddr] });
  };

  const updateAddress = (id: string, patch: Partial<DrivewayAddress>) => {
    onChange({
      ...dn,
      addresses: dn.addresses.map(a => a.id === id ? { ...a, ...patch } : a),
    });
  };

  const removeAddress = (id: string) => {
    onChange({ ...dn, addresses: dn.addresses.filter(a => a.id !== id) });
  };

  const sentCount = dn.addresses.filter(
    a => a.noticeSent || a.letterStatus === 'sent'
  ).length;

  // Lead time alert
  const leadTimeDays = appConfig.driveway_leadTimeDays ?? 10;
  const hasSentOrApproved = dn.addresses.some(
    a => a.letterStatus === 'sent' || a.letterStatus === 'approved'
  );
  const referenceDate = plan.softImplementationWindow?.startDate || plan.needByDate;
  const days = referenceDate ? daysUntil(referenceDate) : null;
  const showLeadTimeAlert = referenceDate && !hasSentOrApproved && days !== null && days < leadTimeDays;
  const leadTimeOverdue = days !== null && days < 0;
  const usingSoftWindow = !!plan.softImplementationWindow?.startDate;

  return (
    <div className="space-y-3 px-3 pb-3">
      {/* Trigger reasons */}
      <div className="flex flex-wrap gap-1">
        {dn.triggeredBy.map(r => (
          <span key={r} className="bg-green-50 border border-green-200 text-green-700 text-[10px] font-semibold px-2 py-0.5 rounded-full">
            {r}
          </span>
        ))}
      </div>

      {/* Waived banner — shows reason + who/when, with option to un-waive */}
      {isWaived && (
        <div className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-bold text-slate-700 mb-0.5">
                🚫 Notices waived
                {dn.waivedReason && (
                  <span className="ml-1.5 font-semibold text-slate-600">· {WAIVE_REASON_LABEL[dn.waivedReason]}</span>
                )}
              </p>
              {dn.waivedNote && (
                <p className="text-[11px] text-slate-600 mt-1 whitespace-pre-wrap">{dn.waivedNote}</p>
              )}
              {(dn.waivedBy || dn.waivedAt) && (
                <p className="text-[10px] text-slate-400 mt-1">
                  {dn.waivedBy && <>By {dn.waivedBy}</>}
                  {dn.waivedBy && dn.waivedAt && ' · '}
                  {dn.waivedAt && <>{fmt(dn.waivedAt)}</>}
                </p>
              )}
            </div>
            {canEdit && (
              <button
                onClick={unwaive}
                className="text-[10px] font-bold text-slate-500 hover:text-slate-800 px-2 py-1 rounded border border-slate-300 bg-white hover:bg-slate-100 transition-colors shrink-0"
                title="Reopen — return this plan to the CR queue"
              >
                Un-waive
              </button>
            )}
          </div>
        </div>
      )}

      {/* Lead time alert */}
      {!isWaived && showLeadTimeAlert && (
        <div className={`rounded-lg border px-3 py-2.5 ${leadTimeOverdue ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50'}`}>
          <p className={`text-[11px] font-semibold ${leadTimeOverdue ? 'text-red-700' : 'text-amber-800'}`}>
            {leadTimeOverdue
              ? `⚠ ${usingSoftWindow ? 'Estimated work start' : 'Need-by date'} has passed (${fmt(referenceDate!)}) — no driveway notice was sent.`
              : `⚠ Only ${days} day${days === 1 ? '' : 's'} until ${usingSoftWindow ? 'estimated work start' : 'need-by date'} (${fmt(referenceDate!)}) — a driveway notice should be sent ${leadTimeDays}+ days in advance.`
            }
          </p>
        </div>
      )}

      {/* Info callout directing CR team to the Library */}
      <div className="rounded-lg border border-green-100 bg-green-50 px-3 py-2.5">
        <p className="text-[11px] text-green-700 font-medium">
          🏠 Advance notice is required for property owners with affected driveway access.
          {' '}Visit <span className="font-semibold">Library → Properties → All Letters</span> to draft, upload, and manage notices.
        </p>
      </div>

      {/* Progress */}
      {dn.addresses.length > 0 && (
        <div className="text-[11px] font-semibold text-slate-600">
          {sentCount}/{dn.addresses.length} notices sent
        </div>
      )}

      {/* Address list */}
      {dn.addresses.length > 0 && (
        <div className="space-y-2">
          {dn.addresses.map((addr, idx) => {
            const isSent = addr.noticeSent || addr.letterStatus === 'sent';

            return (
              <div
                key={addr.id}
                className={`rounded-lg border px-3 py-2.5 ${isSent ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-white'}`}
              >
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    {/* Address — editable when canEdit and not yet sent */}
                    {canEdit && !isSent ? (
                      <input
                        value={addr.address}
                        onChange={e => updateAddress(addr.id, { address: e.target.value })}
                        placeholder="Street address (e.g. 12345 Sherman Way)"
                        className="w-full rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[12px] outline-none focus:border-green-400 focus:bg-white"
                      />
                    ) : (
                      <div className="text-[12px] font-semibold text-slate-800">{addr.address || `Address ${idx + 1}`}</div>
                    )}

                    {/* Owner name */}
                    {canEdit && !isSent ? (
                      <input
                        value={addr.ownerName || ''}
                        onChange={e => updateAddress(addr.id, { ownerName: e.target.value })}
                        placeholder="Owner/resident name (optional)"
                        className="mt-1 w-full rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] outline-none focus:border-green-400 focus:bg-white"
                      />
                    ) : (
                      addr.ownerName && (
                        <div className="text-[10px] text-slate-500 mt-0.5">{addr.ownerName}</div>
                      )
                    )}

                    {/* Property record (read-only) */}
                    {addr.propertyId && (() => {
                      const prop = drivewayProperties.find(p => p.id === addr.propertyId);
                      if (!prop) return null;
                      return (
                        <div className="mt-1.5 rounded-md border border-indigo-200 bg-indigo-50 px-2.5 py-2">
                          <div className="text-[10px] font-bold uppercase tracking-widest text-indigo-600 mb-1">🏠 Property Record</div>
                          <div className="space-y-0.5 text-[11px] text-indigo-900">
                            {prop.ownerName && <div className="font-semibold">{prop.ownerName}</div>}
                            {prop.ownerPhone && <div className="text-indigo-700">{prop.ownerPhone}</div>}
                            {prop.ownerEmail && <div className="text-indigo-700">{prop.ownerEmail}</div>}
                            {prop.notes && <div className="text-indigo-500 italic text-[10px]">{prop.notes}</div>}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Letter status badge */}
                    {addr.letterStatus && addr.letterStatus !== 'not_drafted' && (
                      <div className="mt-1">
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${LETTER_STATUS_BADGE[addr.letterStatus].cls}`}>
                          {LETTER_STATUS_BADGE[addr.letterStatus].label}
                        </span>
                      </div>
                    )}

                    {/* Sent confirmation */}
                    {addr.noticeSent && addr.sentDate && (
                      <div className="text-[10px] text-emerald-600 font-semibold mt-0.5">
                        ✓ Notice sent {addr.sentDate}
                        {addr.sentWindowStart && (
                          <span className="text-slate-400 font-normal ml-1">
                            (window: {fmt(addr.sentWindowStart)}{addr.sentWindowEnd ? ` → ${fmt(addr.sentWindowEnd)}` : ''})
                          </span>
                        )}
                      </div>
                    )}

                    {/* Date-shift warning */}
                    {(() => {
                      const reissueDays = appConfig.driveway_reissueDays ?? 5;
                      const shift = detectDateShift(addr, plan, reissueDays);
                      if (!shift) return null;
                      const currentRef = plan.implementationWindow?.startDate ?? plan.softImplementationWindow?.startDate;
                      return (
                        <div className="mt-1.5 rounded-md border border-orange-200 bg-orange-50 px-2.5 py-2 flex items-start justify-between gap-2">
                          <p className="text-[11px] text-orange-700 font-semibold leading-snug">
                            ⚠ Plan dates shifted {shift} day{shift !== 1 ? 's' : ''} since this notice was sent
                            {currentRef ? ` (now ${fmt(currentRef)})` : ''}.
                            {' '}Consider reissuing.
                          </p>
                          {canEdit && (
                            <button
                              onClick={() => updateAddress(addr.id, { dateShiftDismissed: true })}
                              className="text-[10px] text-orange-400 hover:text-orange-700 flex-shrink-0 font-semibold transition-colors"
                              title="Dismiss this warning"
                            >
                              Dismiss
                            </button>
                          )}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Remove button */}
                  {canEdit && !isSent && (
                    <button
                      onClick={() => removeAddress(addr.id)}
                      className="text-[10px] text-slate-300 hover:text-red-400 transition-colors flex-shrink-0 mt-0.5"
                      title="Remove"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Address */}
      {canEdit && (
        <button
          onClick={addAddress}
          className="flex items-center gap-1.5 text-[11px] font-semibold text-green-600 hover:text-green-800 transition-colors"
        >
          <span className="text-base leading-none">+</span> Add Address
        </button>
      )}

      {/* Notes */}
      {canEdit && (
        <div>
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block mb-1">Notes</label>
          <input
            value={dn.notes || ''}
            onChange={e => onChange({ ...dn, notes: e.target.value })}
            placeholder="Additional outreach notes..."
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[12px] outline-none focus:border-green-400"
          />
        </div>
      )}
      {!canEdit && dn.notes && (
        <div className="text-[11px] text-slate-600">{dn.notes}</div>
      )}

      {/* Waive action — hidden if already waived */}
      {canEdit && !isWaived && !showWaiveForm && (
        <div className="pt-1">
          <button
            onClick={() => setShowWaiveForm(true)}
            className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 transition-colors"
            title="Remove this plan from the CR queue without sending notices"
          >
            Waive notices for this plan…
          </button>
        </div>
      )}

      {/* Waive inline form */}
      {canEdit && !isWaived && showWaiveForm && (
        <div className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 space-y-2">
          <p className="text-[11px] font-bold text-slate-700">Waive driveway notices</p>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block mb-1">Reason</label>
            <select
              value={waiveReason}
              onChange={e => setWaiveReason(e.target.value as DrivewayWaiveReason)}
              className="w-full rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[12px] outline-none focus:border-slate-400 focus:bg-white"
            >
              {(Object.keys(WAIVE_REASON_LABEL) as DrivewayWaiveReason[]).map(r => (
                <option key={r} value={r}>{WAIVE_REASON_LABEL[r]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block mb-1">
              Note {waiveReason === 'other' && <span className="text-red-500">*</span>}
            </label>
            <textarea
              value={waiveNote}
              onChange={e => setWaiveNote(e.target.value)}
              placeholder={waiveReason === 'other' ? 'Describe why notices are being waived (required)' : 'Optional details'}
              rows={2}
              className="w-full rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[12px] outline-none focus:border-slate-400 focus:bg-white resize-none"
            />
          </div>
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              onClick={() => { setShowWaiveForm(false); setWaiveNote(''); setWaiveReason('scope_changed'); }}
              className="px-2.5 py-1 text-[11px] font-semibold text-slate-500 hover:text-slate-800 rounded"
            >
              Cancel
            </button>
            <button
              onClick={applyWaive}
              disabled={waiveReason === 'other' && !waiveNote.trim()}
              className="px-2.5 py-1 text-[11px] font-semibold bg-slate-700 text-white rounded hover:bg-slate-800 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors"
            >
              Waive notices
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
