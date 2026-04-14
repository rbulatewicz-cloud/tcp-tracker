import { useRef, useState } from 'react';
import { Upload, FileText, Clock, CheckCircle, RefreshCw } from 'lucide-react';
import { CDConcurrenceTrack, CDEntry, CDStatus, User } from '../../../types';
import { cdProgress, CD_STATUS_LABELS } from '../../../utils/compliance';
import { CD_STATUS_COLORS } from './complianceShared';
import { uploadCDSlide, uploadConcurrenceLetter } from '../../../services/cdMeetingService';

// ── Types ──────────────────────────────────────────────────────────────────────

interface CDPanelProps {
  cd: CDConcurrenceTrack;
  canEdit: boolean;
  planId: string;
  currentUser: User | null;
  onChange: (c: CDConcurrenceTrack) => void;
  /** When true, status/dates/letters are read-only — managed via Library → CD Concurrence */
  readOnlyStatus?: boolean;
}

const CD_STATUS_OPTIONS: { value: CDStatus; label: string }[] = [
  { value: 'pending',            label: 'Pending' },
  { value: 'presentation_sent',  label: 'Presentation Sent' },
  { value: 'meeting_scheduled',  label: 'Meeting Scheduled' },
  { value: 'follow_up_sent',     label: 'Follow-Up Sent' },
  { value: 'concurred',          label: 'Concurred ✓' },
  { value: 'declined',           label: 'Declined ✗' },
  { value: 'na',                 label: 'N/A — Not in section' },
];

/** Days since an ISO date string. Returns null if no date. */
function daysSince(iso?: string): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
}

/** Color-coded aging badge */
function AgingBadge({ days, label }: { days: number; label: string }) {
  const color =
    days >= 21 ? 'bg-red-100 text-red-700 border border-red-200' :
    days >= 10 ? 'bg-amber-100 text-amber-700 border border-amber-200' :
                 'bg-sky-100 text-sky-700 border border-sky-200';
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${color}`}>
      <Clock size={10} />
      {days}d {label}
    </span>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function CDPanel({ cd, canEdit, planId, currentUser, onChange, readOnlyStatus = false }: CDPanelProps) {
  const prog = cdProgress(cd.cds);
  const [uploading, setUploading] = useState<string | null>(null); // key being uploaded
  const slideInputRef = useRef<HTMLInputElement>(null);
  const letterInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // ── Helpers ──────────────────────────────────────────────────────────────────

  const updateCD = (cdName: string, patch: Partial<CDEntry>) => {
    onChange({
      ...cd,
      cds: cd.cds.map(c => c.cd === cdName ? { ...c, ...patch } : c),
    });
  };

  // ── Slide upload ─────────────────────────────────────────────────────────────

  const handleSlideUpload = async (file: File) => {
    if (!file) return;
    setUploading('slide');
    try {
      const att = await uploadCDSlide(planId, file, currentUser?.email ?? 'unknown');
      onChange({ ...cd, presentationAttachment: att });
    } catch (e) {
      console.error('CD slide upload failed', e);
    } finally {
      setUploading(null);
    }
  };

  // ── Concurrence letter upload ─────────────────────────────────────────────

  const handleLetterUpload = async (cdName: string, file: File) => {
    if (!file) return;
    setUploading(`letter-${cdName}`);
    try {
      const att = await uploadConcurrenceLetter(planId, cdName, file, currentUser?.email ?? 'unknown');
      updateCD(cdName, { concurrenceLetter: att, status: 'concurred' });
    } catch (e) {
      console.error('Concurrence letter upload failed', e);
    } finally {
      setUploading(null);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 px-3 pb-3">

      {/* Triggered-by tags */}
      <div className="flex flex-wrap gap-1">
        {cd.triggeredBy.map(r => (
          <span key={r} className="bg-blue-50 border border-blue-200 text-blue-700 text-[10px] font-semibold px-2 py-0.5 rounded-full">
            {r}
          </span>
        ))}
      </div>

      {/* ── CD Presentation Slide ─────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">
            Council Presentation (PowerPoint)
          </span>
          {cd.presentationAttachment && canEdit && (
            <button
              onClick={() => slideInputRef.current?.click()}
              disabled={!!uploading}
              className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-blue-600 transition-colors"
            >
              <RefreshCw size={10} />
              Replace
            </button>
          )}
        </div>

        {cd.presentationAttachment ? (
          <div className="space-y-1">
            <a
              href={cd.presentationAttachment.url}
              target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-[12px] text-blue-700 font-semibold hover:bg-blue-100"
            >
              <FileText size={13} />
              {cd.presentationAttachment.name}
            </a>
            <p className="text-[10px] text-slate-400">
              Uploaded {new Date(cd.presentationAttachment.uploadedAt).toLocaleDateString()} by {cd.presentationAttachment.uploadedBy}
            </p>
          </div>
        ) : canEdit ? (
          <button
            onClick={() => slideInputRef.current?.click()}
            disabled={!!uploading}
            className="w-full rounded-lg border-2 border-dashed border-slate-200 bg-slate-50 px-3 py-3 flex flex-col items-center gap-1 hover:border-blue-300 hover:bg-blue-50 transition-colors"
          >
            {uploading === 'slide' ? (
              <span className="text-[11px] text-blue-600">Uploading…</span>
            ) : (
              <>
                <Upload size={14} className="text-slate-400" />
                <span className="text-[11px] text-slate-500">Upload CD slide (PPTX / PDF)</span>
              </>
            )}
          </button>
        ) : (
          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-center">
            <p className="text-[11px] text-slate-400">No presentation uploaded yet.</p>
          </div>
        )}

        {/* Hidden file input for slide */}
        <input
          ref={slideInputRef}
          type="file"
          accept=".ppt,.pptx,.pdf"
          className="hidden"
          onChange={e => {
            const f = e.target.files?.[0];
            if (f) handleSlideUpload(f);
            e.target.value = '';
          }}
        />
      </div>

      {/* ── Per-CD tracking ───────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Council Districts</span>
          <span className="text-[10px] text-slate-400 font-medium">{prog.done}/{prog.total} concurred</span>
        </div>

        {readOnlyStatus && (
          <div className="mb-2 rounded-lg bg-blue-50 border border-blue-100 px-2.5 py-1.5 text-[10px] text-blue-700">
            Status, dates &amp; concurrence letters are managed in <strong>Library → CD Concurrence</strong>.
          </div>
        )}

        <div className="space-y-2">
          {cd.cds.map(entry => {
            const sentDays    = daysSince(entry.sentDate);
            const waiting = entry.status === 'presentation_sent' || entry.status === 'meeting_scheduled' || entry.status === 'follow_up_sent';

            return (
              <div
                key={entry.cd}
                className={`rounded-lg border px-3 py-2.5 ${
                  entry.status === 'na'        ? 'border-slate-100 bg-slate-50 opacity-60' :
                  entry.status === 'concurred' ? 'border-emerald-200 bg-emerald-50' :
                  entry.status === 'declined'  ? 'border-red-200 bg-red-50' :
                  entry.status === 'follow_up_sent' ? 'border-amber-200 bg-amber-50' :
                                                 'border-slate-200 bg-white'
                }`}
              >
                {/* Row 1: label + badge + status selector */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[13px] font-bold text-slate-800 w-10 flex-shrink-0">{entry.cd}</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${CD_STATUS_COLORS[entry.status]}`}>
                    {CD_STATUS_LABELS[entry.status]}
                  </span>

                  {/* Aging badge */}
                  {waiting && sentDays !== null && (
                    <AgingBadge days={sentDays} label="in CD court" />
                  )}
                  {waiting && sentDays === null && entry.meetingDate && (
                    <AgingBadge days={daysSince(entry.meetingDate) ?? 0} label="since meeting" />
                  )}

                  {canEdit && !readOnlyStatus && entry.status !== 'na' && (
                    <select
                      value={entry.status}
                      onChange={e => updateCD(entry.cd, { status: e.target.value as CDStatus })}
                      className="text-[11px] border border-slate-200 rounded-md px-1.5 py-0.5 bg-white text-slate-600 outline-none focus:border-blue-400 ml-auto"
                    >
                      {CD_STATUS_OPTIONS.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  )}
                  {canEdit && !readOnlyStatus && entry.status === 'na' && (
                    <button
                      onClick={() => updateCD(entry.cd, { applicable: true, status: 'pending' })}
                      className="ml-auto text-[10px] text-slate-400 hover:text-blue-600"
                    >
                      Mark applicable
                    </button>
                  )}
                </div>

                {/* Row 2: date fields (shown when applicable + can edit + not read-only) */}
                {canEdit && !readOnlyStatus && entry.status !== 'na' && (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {/* Sent date */}
                    <div>
                      <label className="block text-[9px] font-semibold text-slate-400 uppercase mb-0.5">
                        Presentation Sent
                      </label>
                      <input
                        type="date"
                        value={entry.sentDate || ''}
                        onChange={e => updateCD(entry.cd, { sentDate: e.target.value || undefined })}
                        className="w-full text-[11px] border border-slate-200 rounded-md px-1.5 py-0.5 bg-white text-slate-600 outline-none focus:border-blue-400"
                      />
                    </div>

                    {/* Meeting / Follow-up date */}
                    <div>
                      <label className="block text-[9px] font-semibold text-slate-400 uppercase mb-0.5">
                        {entry.status === 'follow_up_sent' ? 'Follow-Up Sent' : 'Meeting Date'}
                      </label>
                      <input
                        type="date"
                        value={(entry.status === 'follow_up_sent' ? entry.followUpDate : entry.meetingDate) || ''}
                        onChange={e => {
                          const val = e.target.value || undefined;
                          if (entry.status === 'follow_up_sent') {
                            updateCD(entry.cd, { followUpDate: val });
                          } else {
                            updateCD(entry.cd, { meetingDate: val });
                          }
                        }}
                        className="w-full text-[11px] border border-slate-200 rounded-md px-1.5 py-0.5 bg-white text-slate-600 outline-none focus:border-blue-400"
                      />
                    </div>
                  </div>
                )}

                {/* Read-only date display — shown when readOnly mode OR viewer can't edit */}
                {(readOnlyStatus || !canEdit) && (entry.sentDate || entry.meetingDate || entry.followUpDate) && (
                  <div className="mt-1 flex flex-wrap gap-3">
                    {entry.sentDate && (
                      <span className="text-[10px] text-slate-400">
                        Sent: {new Date(entry.sentDate + 'T00:00:00').toLocaleDateString()}
                      </span>
                    )}
                    {entry.meetingDate && (
                      <span className="text-[10px] text-slate-400">
                        Meeting: {new Date(entry.meetingDate + 'T00:00:00').toLocaleDateString()}
                      </span>
                    )}
                    {entry.followUpDate && (
                      <span className="text-[10px] text-slate-400">
                        Follow-up: {new Date(entry.followUpDate + 'T00:00:00').toLocaleDateString()}
                      </span>
                    )}
                  </div>
                )}

                {/* Decline notes */}
                {canEdit && !readOnlyStatus && entry.status === 'declined' && (
                  <input
                    value={entry.notes || ''}
                    onChange={e => updateCD(entry.cd, { notes: e.target.value })}
                    placeholder="Note reason for decline…"
                    className="mt-1.5 w-full rounded border border-red-200 bg-red-50 px-2 py-1 text-[11px] outline-none focus:border-red-400"
                  />
                )}
                {!canEdit && entry.notes && (
                  <p className="text-[10px] text-slate-500 mt-1">{entry.notes}</p>
                )}

                {/* Concurrence letter — view always, upload only in Library */}
                {entry.status !== 'na' && (
                  <div className="mt-2">
                    {entry.concurrenceLetter ? (
                      <div className="flex items-center gap-2">
                        <a
                          href={entry.concurrenceLetter.url}
                          target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1.5 text-[11px] text-emerald-700 font-semibold hover:underline"
                        >
                          <CheckCircle size={11} />
                          Concurrence Letter
                        </a>
                        <span className="text-[10px] text-slate-400">
                          {new Date(entry.concurrenceLetter.uploadedAt).toLocaleDateString()}
                        </span>
                        {canEdit && !readOnlyStatus && (
                          <button
                            onClick={() => letterInputRefs.current[entry.cd]?.click()}
                            className="text-[10px] text-slate-400 hover:text-blue-600 ml-auto"
                          >
                            Replace
                          </button>
                        )}
                      </div>
                    ) : !readOnlyStatus && canEdit ? (
                      <button
                        onClick={() => letterInputRefs.current[entry.cd]?.click()}
                        disabled={!!uploading}
                        className="flex items-center gap-1.5 text-[11px] text-slate-400 hover:text-emerald-700 transition-colors"
                      >
                        {uploading === `letter-${entry.cd}` ? (
                          <span className="text-blue-600">Uploading…</span>
                        ) : (
                          <>
                            <Upload size={11} />
                            Upload Concurrence Letter
                          </>
                        )}
                      </button>
                    ) : readOnlyStatus ? (
                      <span className="text-[10px] text-slate-300 italic">No letter yet — upload in Library</span>
                    ) : null}

                    {/* Hidden file input per CD (only rendered when not read-only) */}
                    {!readOnlyStatus && (
                      <input
                        ref={el => { letterInputRefs.current[entry.cd] = el; }}
                        type="file"
                        accept=".pdf,.doc,.docx"
                        className="hidden"
                        onChange={e => {
                          const f = e.target.files?.[0];
                          if (f) handleLetterUpload(entry.cd, f);
                          e.target.value = '';
                        }}
                      />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Overall notes ─────────────────────────────────────────────────── */}
      {canEdit && (
        <div>
          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Notes</label>
          <textarea
            value={cd.notes || ''}
            onChange={e => onChange({ ...cd, notes: e.target.value })}
            rows={2}
            placeholder="General notes about CD concurrence process…"
            className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-[12px] outline-none focus:border-blue-400 resize-none"
          />
        </div>
      )}
      {!canEdit && cd.notes && (
        <p className="text-[11px] text-slate-500 italic">{cd.notes}</p>
      )}
    </div>
  );
}
