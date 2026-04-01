import { useState } from 'react';
import {
  DrivewayNoticeTrack, DrivewayAddress,
  DrivewayLetterStatus, DrivewayLetter, Plan, AppConfig,
} from '../../../types';

const LETTER_STATUS_BADGE: Record<DrivewayLetterStatus, { label: string; cls: string }> = {
  not_drafted: { label: 'Not Drafted', cls: 'bg-slate-100 text-slate-500' },
  draft:       { label: 'Draft',       cls: 'bg-amber-50 text-amber-700 border border-amber-200' },
  approved:    { label: 'Approved',    cls: 'bg-blue-50 text-blue-700 border border-blue-200' },
  sent:        { label: 'Sent',        cls: 'bg-emerald-50 text-emerald-700 border border-emerald-200' },
};

function fmt(iso: string) {
  if (!iso) return '—';
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function DrivewayNoticesPanel({
  dn, canEdit, canLink, onChange, plan, appConfig,
  onDraftNotice, libraryLetters,
}: {
  dn: DrivewayNoticeTrack;
  canEdit: boolean;
  canLink: boolean;
  onChange: (d: DrivewayNoticeTrack) => void;
  plan: Plan;
  appConfig: AppConfig;
  onDraftNotice: (address: DrivewayAddress) => void;
  libraryLetters: DrivewayLetter[];
}) {
  const [pickerForAddress, setPickerForAddress] = useState<string | null>(null);
  const [panelPickerOpen, setPanelPickerOpen] = useState(false);

  const addAddress = () => {
    const newAddr: DrivewayAddress = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2),
      address: '',
    };
    onChange({ ...dn, addresses: [...dn.addresses, newAddr] });
  };

  // Create a blank address entry and immediately open the draft modal
  const draftNewLetter = () => {
    const newAddr: DrivewayAddress = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2),
      address: '',
    };
    onChange({ ...dn, addresses: [...dn.addresses, newAddr] });
    onDraftNotice(newAddr);
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

  const markSent = (id: string) => {
    updateAddress(id, { noticeSent: true, sentDate: new Date().toISOString().slice(0, 10) });
  };

  const linkLetter = (addressId: string, letter: DrivewayLetter) => {
    updateAddress(addressId, {
      letterId: letter.id,
      letterStatus: letter.status,
    });
    setPickerForAddress(null);
  };

  // Link a library letter and auto-create an address row from it
  const linkLetterAsNewAddress = (letter: DrivewayLetter) => {
    const newAddr: DrivewayAddress = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2),
      address: letter.address || letter.fields.recipientAddress || '',
      ownerName: letter.ownerName || letter.fields.recipientName || '',
      letterId: letter.id,
      letterStatus: letter.status,
    };
    onChange({ ...dn, addresses: [...dn.addresses, newAddr] });
    setPanelPickerOpen(false);
  };

  const unlinkLetter = (addressId: string) => {
    updateAddress(addressId, { letterId: undefined, letterStatus: undefined });
  };

  // Letters available to link: complete scan + matching segment
  const linkableLetters = libraryLetters.filter(
    l => (!l.scanStatus || l.scanStatus === 'complete') && l.status !== 'not_drafted'
  );

  const segmentLetters = linkableLetters.filter(l => l.segment === plan.segment);
  const otherLetters   = linkableLetters.filter(l => l.segment !== plan.segment);

  const sentCount = dn.addresses.filter(a => a.noticeSent).length;

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

      <div className="rounded-lg border border-green-100 bg-green-50 px-3 py-2.5">
        <p className="text-[11px] text-green-700 font-medium">
          🏠 Advance notice is required for property owners with affected driveway access. Draft or link one letter per address below.
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
            const linkedLetter = addr.letterId
              ? libraryLetters.find(l => l.id === addr.letterId) ?? null
              : null;
            const pickerOpen = pickerForAddress === addr.id;

            return (
              <div
                key={addr.id}
                className={`rounded-lg border px-3 py-2.5 ${addr.noticeSent ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-white'}`}
              >
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    {canEdit && !addr.noticeSent ? (
                      <input
                        value={addr.address}
                        onChange={e => updateAddress(addr.id, { address: e.target.value })}
                        placeholder="Street address (e.g. 12345 Sherman Way)"
                        className="w-full rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[12px] outline-none focus:border-green-400 focus:bg-white"
                      />
                    ) : (
                      <div className="text-[12px] font-semibold text-slate-800">{addr.address || `Address ${idx + 1}`}</div>
                    )}
                    {addr.ownerName && !canEdit && (
                      <div className="text-[10px] text-slate-500 mt-0.5">{addr.ownerName}</div>
                    )}
                    {canEdit && !addr.noticeSent && (
                      <input
                        value={addr.ownerName || ''}
                        onChange={e => updateAddress(addr.id, { ownerName: e.target.value })}
                        placeholder="Owner/resident name (optional)"
                        className="mt-1 w-full rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] outline-none focus:border-green-400 focus:bg-white"
                      />
                    )}
                    {addr.noticeSent && addr.sentDate && (
                      <div className="text-[10px] text-emerald-600 font-semibold mt-0.5">
                        ✓ Notice sent {addr.sentDate}
                      </div>
                    )}

                    {/* Linked letter details */}
                    {linkedLetter && (
                      <div className="mt-1.5 rounded-md border border-green-200 bg-green-50 px-2.5 py-2">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <div className="text-[10px] font-bold uppercase tracking-widest text-green-700">Linked Letter</div>
                          {canLink && (
                            <button
                              onClick={() => unlinkLetter(addr.id)}
                              className="text-[9px] text-slate-400 hover:text-red-500 transition-colors font-semibold"
                            >
                              Unlink
                            </button>
                          )}
                        </div>
                        <div className="text-[11px] font-semibold text-slate-800">{linkedLetter.address}</div>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${LETTER_STATUS_BADGE[linkedLetter.status].cls}`}>
                            {LETTER_STATUS_BADGE[linkedLetter.status].label}
                          </span>
                          {linkedLetter.approvedAt && (
                            <span className="text-[10px] text-slate-500">Approved {fmt(linkedLetter.approvedAt)}</span>
                          )}
                          {linkedLetter.sentAt && (
                            <span className="text-[10px] text-slate-500">Sent {fmt(linkedLetter.sentAt)}</span>
                          )}
                        </div>
                        {linkedLetter.letterUrl && (
                          <a
                            href={linkedLetter.letterUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-green-700 hover:underline"
                          >
                            📄 View in Library →
                          </a>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center gap-1.5 flex-shrink-0 mt-0.5">
                    {/* Letter status badge when linked */}
                    {addr.letterStatus && addr.letterStatus !== 'not_drafted' && !linkedLetter && (
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${LETTER_STATUS_BADGE[addr.letterStatus].cls}`}>
                        {LETTER_STATUS_BADGE[addr.letterStatus].label}
                      </span>
                    )}
                    {addr.address && (
                      <button
                        onClick={() => onDraftNotice(addr)}
                        className="text-[10px] font-semibold text-violet-600 hover:text-violet-800 transition-colors flex items-center gap-0.5"
                        title={addr.letterId ? 'Open letter' : 'Draft letter'}
                      >
                        {addr.letterId ? '✉ Open' : '✉ Draft'}
                      </button>
                    )}
                    {canLink && addr.address && !linkedLetter && (
                      <button
                        onClick={() => setPickerForAddress(pickerOpen ? null : addr.id)}
                        className={`text-[10px] font-semibold transition-colors ${
                          pickerOpen ? 'text-slate-400' : 'text-green-600 hover:text-green-800'
                        }`}
                      >
                        🔗 {pickerOpen ? 'Cancel' : 'Link'}
                      </button>
                    )}
                    {canEdit && addr.address && !addr.noticeSent && (
                      <button
                        onClick={() => markSent(addr.id)}
                        className="text-[10px] font-semibold text-emerald-600 hover:text-emerald-800 transition-colors"
                        title="Mark as sent"
                      >
                        ✓ Sent
                      </button>
                    )}
                    {canEdit && !addr.noticeSent && (
                      <button
                        onClick={() => removeAddress(addr.id)}
                        className="text-[10px] text-slate-300 hover:text-red-400 transition-colors"
                        title="Remove"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>

                {/* Inline library picker */}
                {pickerOpen && (
                  <div className="mt-2 rounded-lg border border-green-200 bg-white overflow-hidden">
                    {linkableLetters.length === 0 ? (
                      <p className="text-[11px] text-slate-400 px-3 py-2">No letters in library yet. Upload or draft letters first.</p>
                    ) : (
                      <div className="divide-y divide-slate-100 max-h-48 overflow-y-auto">
                        {segmentLetters.length > 0 && (
                          <div className="px-3 py-1 bg-green-50">
                            <span className="text-[9px] font-bold uppercase text-green-600 tracking-wide">Segment {plan.segment} match</span>
                          </div>
                        )}
                        {segmentLetters.map(l => (
                          <button key={l.id} onClick={() => linkLetter(addr.id, l)} className="w-full text-left px-3 py-2 hover:bg-green-50 transition-colors">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="text-[11px] font-semibold text-slate-800 truncate">{l.address}</div>
                                <div className="text-[10px] text-slate-500 mt-0.5">
                                  {l.fields.workDates && <span>{l.fields.workDates} · </span>}
                                  {l.fields.contactName}
                                </div>
                              </div>
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${LETTER_STATUS_BADGE[l.status].cls}`}>
                                {LETTER_STATUS_BADGE[l.status].label}
                              </span>
                              <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded flex-shrink-0">Match</span>
                            </div>
                          </button>
                        ))}
                        {otherLetters.length > 0 && (
                          <div className="px-3 py-1 bg-slate-50">
                            <span className="text-[9px] font-bold uppercase text-slate-400 tracking-wide">Other segments</span>
                          </div>
                        )}
                        {otherLetters.map(l => (
                          <button key={l.id} onClick={() => linkLetter(addr.id, l)} className="w-full text-left px-3 py-2 hover:bg-slate-50 transition-colors">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="text-[11px] font-semibold text-slate-800 truncate">{l.address}</div>
                                <div className="text-[10px] text-slate-500 mt-0.5">
                                  Seg {l.segment}{l.fields.workDates ? ` · ${l.fields.workDates}` : ''}
                                </div>
                              </div>
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${LETTER_STATUS_BADGE[l.status].cls}`}>
                                {LETTER_STATUS_BADGE[l.status].label}
                              </span>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Panel-level: Link from Library */}
      {canLink && linkableLetters.length > 0 && (
        <div>
          <button
            onClick={() => setPanelPickerOpen(o => !o)}
            className="flex items-center gap-1.5 text-[11px] font-semibold text-green-600 hover:text-green-800 transition-colors"
          >
            <span className="text-base leading-none">🔗</span>
            {panelPickerOpen ? 'Cancel' : `Link from Library${linkableLetters.length > 0 ? ` (${linkableLetters.length})` : ''}`}
          </button>
          {panelPickerOpen && (
            <div className="mt-2 rounded-lg border border-green-200 bg-white overflow-hidden">
              <div className="divide-y divide-slate-100 max-h-52 overflow-y-auto">
                {segmentLetters.length > 0 && (
                  <div className="px-3 py-1 bg-green-50">
                    <span className="text-[9px] font-bold uppercase text-green-600 tracking-wide">Segment {plan.segment} match</span>
                  </div>
                )}
                {segmentLetters.map(l => (
                  <button key={l.id} onClick={() => linkLetterAsNewAddress(l)} className="w-full text-left px-3 py-2 hover:bg-green-50 transition-colors">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] font-semibold text-slate-800 truncate">{l.address || l.fields.recipientAddress}</div>
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          {l.fields.workDates && <span>{l.fields.workDates} · </span>}
                          {l.fields.contactName}
                        </div>
                      </div>
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${LETTER_STATUS_BADGE[l.status].cls}`}>
                        {LETTER_STATUS_BADGE[l.status].label}
                      </span>
                      <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded flex-shrink-0">Match</span>
                    </div>
                  </button>
                ))}
                {otherLetters.length > 0 && (
                  <div className="px-3 py-1 bg-slate-50">
                    <span className="text-[9px] font-bold uppercase text-slate-400 tracking-wide">Other segments</span>
                  </div>
                )}
                {otherLetters.map(l => (
                  <button key={l.id} onClick={() => linkLetterAsNewAddress(l)} className="w-full text-left px-3 py-2 hover:bg-slate-50 transition-colors">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] font-semibold text-slate-800 truncate">{l.address || l.fields.recipientAddress}</div>
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          Seg {l.segment}{l.fields.workDates ? ` · ${l.fields.workDates}` : ''}
                        </div>
                      </div>
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${LETTER_STATUS_BADGE[l.status].cls}`}>
                        {LETTER_STATUS_BADGE[l.status].label}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Draft + Add actions */}
      {canEdit && (
        <div className="flex items-center gap-4">
          <button
            onClick={draftNewLetter}
            className="flex items-center gap-1.5 text-[11px] font-semibold text-violet-600 hover:text-violet-800 transition-colors"
          >
            ✉ Draft New Letter
          </button>
          <button
            onClick={addAddress}
            className="flex items-center gap-1.5 text-[11px] font-semibold text-green-600 hover:text-green-800 transition-colors"
          >
            <span className="text-base leading-none">+</span> Add Address
          </button>
        </div>
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
    </div>
  );
}
