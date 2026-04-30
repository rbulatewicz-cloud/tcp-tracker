import React, { useMemo, useState } from 'react';
import type { Plan, NoiseVariance, TansatSettings, TansatContact } from '../../types';
import { updateTansatRequest } from '../../services/tansatService';
import { showToast } from '../../lib/toast';
import { DEFAULT_TANSAT_SETTINGS } from '../../constants';

interface EmailComposerModalProps {
  requestId: string;
  plan: Plan;
  appConfig?: { tansatSettings?: TansatSettings };
  draftBody: string;
  subject: string;
  mapAttachmentName?: string;
  attachedVariances: NoiseVariance[];
  onClose: () => void;
}

type GroupKey = 'dot' | 'internal' | 'client';

/**
 * T-2.3a — Email Composer Modal with `mailto:` hand-off.
 *
 * Phase 1 of the email integration: app builds the full email (subject,
 * body, recipients) and opens the user's default mail client via a
 * `mailto:` URL. MOT then drags the attachments into the compose window
 * and clicks Send themselves. From: address comes from MOT's logged-in
 * mail client, which means it lands in the recipient's inbox as a real
 * corporate email — no IT dependency.
 *
 * Phase 2 (T-2.3b) swaps the `mailto:` URL for `emailService.sendEmail()`.
 * Same UX, same data shape, only the send path changes.
 */
export const EmailComposerModal: React.FC<EmailComposerModalProps> = ({
  requestId, plan, appConfig, draftBody, subject, mapAttachmentName, attachedVariances, onClose,
}) => {
  const settings = (appConfig?.tansatSettings ?? DEFAULT_TANSAT_SETTINGS) as TansatSettings;

  const [to, setTo] = useState(settings.reggieEmail);
  const [editableSubject, setEditableSubject] = useState(subject);
  const [editableBody, setEditableBody] = useState(draftBody);

  // Per-recipient toggles seeded from `defaultIncluded`
  const [included, setIncluded] = useState<Record<string, boolean>>(() => {
    const map: Record<string, boolean> = {};
    for (const groupKey of ['dot', 'internal', 'client'] as GroupKey[]) {
      const group = settings.ccGroups?.[groupKey];
      if (!group) continue;
      for (const c of group.contacts) {
        // Skip duplicates of the To: address
        if (c.email.toLowerCase() === to.toLowerCase()) {
          map[c.email] = false;
          continue;
        }
        map[c.email] = c.defaultIncluded;
      }
    }
    return map;
  });

  // Compute final CC list (deduped, lowercase-compared)
  const ccList = useMemo(() => {
    const lower = to.toLowerCase();
    const all: string[] = [];
    const seen = new Set<string>([lower]);
    for (const groupKey of ['dot', 'internal', 'client'] as GroupKey[]) {
      const group = settings.ccGroups?.[groupKey];
      if (!group) continue;
      for (const c of group.contacts) {
        if (!included[c.email]) continue;
        const norm = c.email.toLowerCase();
        if (seen.has(norm)) continue;
        seen.add(norm);
        all.push(c.email);
      }
    }
    return all;
  }, [included, settings, to]);

  const totalRecipients = 1 + ccList.length;
  const groupCount = (key: GroupKey): { included: number; total: number } => {
    const group = settings.ccGroups?.[key];
    if (!group) return { included: 0, total: 0 };
    let inc = 0;
    for (const c of group.contacts) {
      if (c.email.toLowerCase() !== to.toLowerCase() && included[c.email]) inc++;
    }
    return { included: inc, total: group.contacts.length };
  };

  // Open Outlook / default mail client
  const handleSend = async () => {
    const mailto = buildMailto({ to, cc: ccList, subject: editableSubject, body: editableBody });
    // Length guard — most clients cap mailto URLs around 2000 chars
    if (mailto.length > 1900) {
      const ok = confirm(
        `This email is large (${mailto.length} characters). Some mail clients truncate the body.\n\nClick OK to copy the body to clipboard so you can paste it manually after the client opens.`
      );
      if (ok) {
        try {
          await navigator.clipboard.writeText(editableBody);
          showToast('Body copied to clipboard — paste into your mail client', 'info');
        } catch {
          /* clipboard unavailable; user proceeds anyway */
        }
      }
    }

    // Mark request as emailed (audit trail). emailMessageId stays blank in
    // Phase 1 — the source of truth for the actual email is the user's Sent
    // folder.
    const groupsUsed = {
      dot: groupCount('dot').included > 0,
      internal: groupCount('internal').included > 0,
      client: groupCount('client').included > 0,
    };
    await updateTansatRequest(requestId, {
      status: 'emailed',
      emailSentAt: new Date().toISOString(),
      ccGroupsUsed: groupsUsed,
    });

    // Open mail client. Use a hidden link click rather than window.open to
    // avoid the popup blocker.
    const a = document.createElement('a');
    a.href = mailto;
    a.target = '_blank';
    a.rel = 'noopener';
    a.click();

    showToast('Mail client opened — drag attachments in, then Send. Status updated to "emailed".', 'success');
    onClose();
  };

  const handleMarkNotSent = async () => {
    await updateTansatRequest(requestId, { status: 'packet_ready' });
    showToast('Reverted to packet_ready. You can re-send when ready.', 'info');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/60 p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl max-w-5xl w-full my-8">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h3 className="text-lg font-bold">📨 Email TANSAT Packet to Reggie</h3>
            <p className="text-xs text-slate-500">
              Plan <span className="font-mono font-bold">{plan.loc || plan.id}</span> · {totalRecipients} recipient{totalRecipients === 1 ? '' : 's'}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-2xl leading-none">×</button>
        </div>

        {/* Phase 1 banner */}
        <div className="px-6 py-3 bg-amber-50 border-b border-amber-200">
          <div className="text-xs text-amber-900">
            <b>Phase 1 (mailto handoff):</b> Click <b>"Open in Outlook"</b> below — the email opens in your mail client
            with body + recipients pre-filled. Drag the attachments listed below into the compose window before sending.
            Status will auto-advance to <b>emailed</b> on click.
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6">
          {/* LEFT: form */}
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">To</label>
              <input
                type="email"
                value={to}
                onChange={e => setTo(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">CC Groups</label>
              <div className="space-y-2">
                {(['dot', 'internal', 'client'] as GroupKey[]).map(key => {
                  const group = settings.ccGroups?.[key];
                  if (!group || group.contacts.length === 0) return null;
                  const { included: inc, total } = groupCount(key);
                  return (
                    <CcGroupSection
                      key={key}
                      group={group}
                      includedMap={included}
                      onToggle={(email, value) => setIncluded(prev => ({ ...prev, [email]: value }))}
                      includedCount={inc}
                      total={total}
                      excludeEmail={to}
                    />
                  );
                })}
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">Subject</label>
              <input
                type="text"
                value={editableSubject}
                onChange={e => setEditableSubject(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">
                Attachments to drag into compose window
              </label>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-2 space-y-1">
                {mapAttachmentName ? (
                  <div className="flex items-center gap-2 text-xs">
                    📎 <span className="font-mono">{mapAttachmentName}</span>
                  </div>
                ) : (
                  <div className="text-xs text-slate-400 italic">No map attached</div>
                )}
                {attachedVariances.length === 0 ? (
                  <div className="text-xs text-slate-400 italic">No NVs attached</div>
                ) : (
                  attachedVariances.map(nv => (
                    <a
                      key={nv.id}
                      href={nv.fileUrl}
                      target="_blank"
                      rel="noopener"
                      className="flex items-center gap-2 text-xs text-blue-700 hover:underline"
                    >
                      📎 <span className="font-mono">{nv.fileName || nv.title}</span>
                    </a>
                  ))
                )}
              </div>
              <p className="text-[10px] text-slate-400 italic mt-1">
                <b>Map screenshot</b> is local to your browser — drag from your downloads folder. NVs above link to the file in storage so you can download fresh copies if needed.
              </p>
            </div>
          </div>

          {/* RIGHT: editable body */}
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">Email Body</label>
            <textarea
              value={editableBody}
              onChange={e => setEditableBody(e.target.value)}
              rows={22}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs font-sans focus:outline-none focus:ring-2 focus:ring-blue-400 whitespace-pre"
            />
            <p className="text-[10px] text-slate-400 mt-1">
              You can edit before sending. The format mirrors Dale's existing template (one token per line).
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-xl">
          <button
            type="button"
            onClick={handleMarkNotSent}
            className="text-xs font-bold text-slate-500 hover:text-slate-800 hover:underline"
          >
            ← Mark as not sent (revert to packet_ready)
          </button>
          <div className="flex gap-2">
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
              className="text-xs font-bold px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 inline-flex items-center gap-1.5"
            >
              📨 Open in Outlook
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── CC Group section ────────────────────────────────────────────────────────
const CcGroupSection: React.FC<{
  group: { name: string; contacts: TansatContact[] };
  includedMap: Record<string, boolean>;
  onToggle: (email: string, value: boolean) => void;
  includedCount: number;
  total: number;
  excludeEmail: string;
}> = ({ group, includedMap, onToggle, includedCount, total, excludeEmail }) => {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 hover:bg-slate-100 text-left"
      >
        <div className="text-xs font-bold text-slate-700">{group.name}</div>
        <div className="text-[10px] text-slate-500">
          {includedCount} of {total} included {expanded ? '▾' : '▸'}
        </div>
      </button>
      {expanded && (
        <div className="px-3 py-2 space-y-1">
          {group.contacts.map(c => {
            const isToAddr = c.email.toLowerCase() === excludeEmail.toLowerCase();
            return (
              <label key={c.email} className={`flex items-center gap-2 text-xs ${isToAddr ? 'opacity-50' : ''}`}>
                <input
                  type="checkbox"
                  checked={!isToAddr && !!includedMap[c.email]}
                  disabled={isToAddr}
                  onChange={e => onToggle(c.email, e.target.checked)}
                />
                <span className="font-semibold w-32 truncate">{c.name}</span>
                <span className="text-slate-500 font-mono text-[10px] truncate">{c.email}</span>
                {isToAddr && <span className="text-[9px] text-slate-400 italic">already in To:</span>}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ── mailto: URL builder ─────────────────────────────────────────────────────
function buildMailto(opts: { to: string; cc: string[]; subject: string; body: string }): string {
  const params: string[] = [];
  if (opts.cc.length > 0) params.push('cc=' + encodeURIComponent(opts.cc.join(',')));
  params.push('subject=' + encodeURIComponent(opts.subject));
  params.push('body=' + encodeURIComponent(opts.body));
  return `mailto:${encodeURIComponent(opts.to)}?${params.join('&')}`;
}
