import React, { useMemo, useState } from 'react';
import type { Plan, TansatRequest, TansatSettings, TansatExtension } from '../../types';
import { addExtension, updateTansatRequest } from '../../services/tansatService';
import { showToast } from '../../lib/toast';
import { fmtDate } from '../../utils/plans';
import { DEFAULT_TANSAT_SETTINGS } from '../../constants';
import { getBusinessDaysUntil } from '../../utils/tansatSpend';

interface ExtensionRequestModalProps {
  request: TansatRequest;
  plan: Plan;
  appConfig?: { tansatSettings?: TansatSettings };
  onClose: () => void;
}

/**
 * T-4.1 — Extension Request Modal.
 *
 * Per Adam's team feedback (spec §4), extensions are FREE and lightweight —
 * a one-sentence email reply to Reggie's original thread with the log # and
 * new dates. No new payment, no new packet, no new map. Same log # stays
 * in effect.
 *
 * LADOT requirement: must be requested 10 business days before phase end.
 * In practice flexible, but we still surface the deadline as a warning.
 *
 * UX flow:
 *   1. MOT picks new end date + (optional) note about why
 *   2. Modal previews the email body
 *   3. "Open in Outlook" builds a mailto: URL replying to Reggie with the
 *      original CC list
 *   4. On click: appends a TansatExtension to extensions[] on the parent
 *      request with status 'sent', `requestedAt = now`. Same log # stays.
 *
 * Once expired, extensions are no longer possible — MOT renews instead
 * (separate workflow; new TansatRequest with full payment).
 */
export const ExtensionRequestModal: React.FC<ExtensionRequestModalProps> = ({
  request, plan, appConfig, onClose,
}) => {
  const settings = (appConfig?.tansatSettings ?? DEFAULT_TANSAT_SETTINGS) as TansatSettings;

  const originalEnd = request.schedule?.endDate ?? '';
  const [newEndDate, setNewEndDate] = useState('');
  const [notes, setNotes] = useState('');
  const [sending, setSending] = useState(false);

  const businessDaysToOriginalEnd = useMemo(
    () => originalEnd ? getBusinessDaysUntil(originalEnd) : Infinity,
    [originalEnd],
  );
  const insideExtensionWindow = businessDaysToOriginalEnd <= settings.thresholds.extensionWindowBusinessDays;
  const pastDeadline = businessDaysToOriginalEnd <= 0;

  const subject = `RE: TANSAT Request — Plan ${plan.loc || plan.id} — Extension request (LOG #${request.logNumber ?? '—'})`;
  const body = useMemo(() => buildExtensionBody({
    request, plan, newEndDate, notes,
  }), [request, plan, newEndDate, notes]);

  // Recipient list reuses the same groups MOT chose for the original email,
  // so the reply lands in the same thread for Reggie's team.
  const recipients = useMemo(() => {
    const dot = settings.ccGroups?.dot?.contacts ?? [];
    const internal = settings.ccGroups?.internal?.contacts ?? [];
    const client = settings.ccGroups?.client?.contacts ?? [];
    const used = request.ccGroupsUsed ?? { dot: true, internal: true, client: true };
    const cc: string[] = [];
    const seen = new Set<string>([settings.reggieEmail.toLowerCase()]);
    const add = (e: string) => {
      const k = e.toLowerCase();
      if (!seen.has(k)) { seen.add(k); cc.push(e); }
    };
    if (used.dot)      dot.forEach(c => c.defaultIncluded && add(c.email));
    if (used.internal) internal.forEach(c => c.defaultIncluded && add(c.email));
    if (used.client)   client.forEach(c => c.defaultIncluded && add(c.email));
    return { to: settings.reggieEmail, cc };
  }, [settings, request.ccGroupsUsed]);

  const handleSend = async () => {
    if (!newEndDate) {
      showToast('Pick a new end date', 'error');
      return;
    }
    setSending(true);
    try {
      const ext: Omit<TansatExtension, 'id' | 'requestedAt' | 'status'> & { status?: TansatExtension['status'] } = {
        newEndDate,
        notes: notes || undefined,
        status: 'sent',
      };
      await addExtension(request.id, ext);
      // Optionally update the schedule end on the request so downstream
      // notifications use the new date. Keep the original record-of-truth
      // in the extension entry; this is the "effective" end going forward.
      await updateTansatRequest(request.id, {
        schedule: {
          ...request.schedule,
          endDate: newEndDate,
        },
      });
      // Open the mail client with the reply
      const mailto = buildMailto({ ...recipients, subject, body });
      const a = document.createElement('a');
      a.href = mailto;
      a.target = '_blank';
      a.rel = 'noopener';
      a.click();
      showToast(`Extension request sent — new end ${fmtDate(newEndDate)}`, 'success');
      onClose();
    } catch (err) {
      console.error('Failed to send extension:', err);
      showToast('Failed to send extension', 'error');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[55] flex items-start justify-center bg-black/60 p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full my-8">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h3 className="text-lg font-bold">Request Extension</h3>
            <p className="text-xs text-slate-500">
              <span className="font-mono">LOG #{request.logNumber ?? '—'}</span>
              {' · '}
              Original ends <b>{fmtDate(originalEnd)}</b>
              {' · '}
              <span className="text-slate-400">extensions are free; same log # stays in effect</span>
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-2xl leading-none">×</button>
        </div>

        {/* Deadline banner */}
        <div className={`px-6 py-3 border-b ${
          pastDeadline ? 'bg-red-50 border-red-200' :
          insideExtensionWindow ? 'bg-amber-50 border-amber-200' :
          'bg-blue-50 border-blue-200'
        }`}>
          <div className="text-xs">
            {pastDeadline ? (
              <span className="text-red-800">
                <b>⛔ Past LADOT deadline:</b> phase end ({fmtDate(originalEnd)}) is in {Math.abs(businessDaysToOriginalEnd)} business days or already passed.
                Once the log # expires you'll need to <b>renew</b> instead (new request + new payment).
              </span>
            ) : insideExtensionWindow ? (
              <span className="text-amber-900">
                <b>⚠ Inside the {settings.thresholds.extensionWindowBusinessDays}-business-day window:</b> {businessDaysToOriginalEnd} business days until phase end. LADOT prefers earlier notice but is generally flexible in practice.
              </span>
            ) : (
              <span className="text-blue-900">
                ✓ Plenty of lead time: {businessDaysToOriginalEnd} business days until phase end.
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6">
          {/* LEFT: form */}
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">
                New End Date <span className="text-red-600 font-bold">required</span>
              </label>
              <input
                type="date"
                min={originalEnd}
                value={newEndDate}
                onChange={e => setNewEndDate(e.target.value)}
                className="w-full md:w-56 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">
                Reason / Notes <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <textarea
                rows={3}
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="e.g. Conduit work running ~1 week behind schedule due to subsurface utility conflict."
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
            <div className="text-[11px] text-slate-500">
              Same log # stays in effect. No new payment required.
            </div>
          </div>

          {/* RIGHT: live email preview */}
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">📨 Email Preview</label>
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs whitespace-pre-line min-h-[200px]">
              {body}
            </div>
            <p className="text-[10px] text-slate-400 italic mt-1">
              To: {recipients.to} · {recipients.cc.length} CC{recipients.cc.length === 1 ? '' : 's'}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-xl">
          <button
            type="button"
            onClick={onClose}
            className="text-xs font-bold px-4 py-2 rounded border border-slate-300 bg-white hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSend}
            disabled={sending || !newEndDate}
            className="text-xs font-bold px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {sending ? 'Sending…' : '📨 Send Extension Request'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Email body builder ──────────────────────────────────────────────────────
function buildExtensionBody(opts: { request: TansatRequest; plan: Plan; newEndDate: string; notes: string }): string {
  const { request, plan, newEndDate, notes } = opts;
  const orig = request.schedule?.endDate ?? '';
  return [
    'Reggie,',
    '',
    `Requesting an extension on the below TANSAT for Plan ${plan.loc || plan.id}:`,
    '',
    `LOG #: ${request.logNumber ?? '—'}`,
    `Original end: ${orig ? fmtDate(orig) : '—'}`,
    `New end:      ${newEndDate ? fmtDate(newEndDate) : '—'}`,
    '',
    notes ? notes : '',
    '',
    'Thanks,',
  ].filter(Boolean).join('\n');
}

// ── mailto: URL builder ─────────────────────────────────────────────────────
function buildMailto(opts: { to: string; cc: string[]; subject: string; body: string }): string {
  const params: string[] = [];
  if (opts.cc.length > 0) params.push('cc=' + encodeURIComponent(opts.cc.join(',')));
  params.push('subject=' + encodeURIComponent(opts.subject));
  params.push('body=' + encodeURIComponent(opts.body));
  return `mailto:${encodeURIComponent(opts.to)}?${params.join('&')}`;
}
