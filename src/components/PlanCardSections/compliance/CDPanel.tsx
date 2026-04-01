import { CDConcurrenceTrack, CDEntry, CDStatus } from '../../../types';
import { cdProgress, CD_STATUS_LABELS } from '../../../utils/compliance';
import { CD_STATUS_COLORS } from './complianceShared';

const CD_STATUS_OPTIONS: { value: CDStatus; label: string }[] = [
  { value: 'pending',            label: 'Pending' },
  { value: 'presentation_sent',  label: 'Presentation Sent' },
  { value: 'meeting_scheduled',  label: 'Meeting Scheduled' },
  { value: 'concurred',          label: 'Concurred ✓' },
  { value: 'declined',           label: 'Declined ✗' },
  { value: 'na',                 label: 'N/A — Not in section' },
];

export function CDPanel({
  cd, canEdit, onChange,
}: { cd: CDConcurrenceTrack; canEdit: boolean; onChange: (c: CDConcurrenceTrack) => void }) {
  const prog = cdProgress(cd.cds);

  const updateCD = (cdName: string, patch: Partial<CDEntry>) => {
    onChange({
      ...cd,
      cds: cd.cds.map(c => c.cd === cdName ? { ...c, ...patch } : c),
    });
  };

  return (
    <div className="space-y-3 px-3 pb-3">
      <div className="flex flex-wrap gap-1">
        {cd.triggeredBy.map(r => (
          <span key={r} className="bg-blue-50 border border-blue-200 text-blue-700 text-[10px] font-semibold px-2 py-0.5 rounded-full">
            {r}
          </span>
        ))}
      </div>

      {/* Presentation upload placeholder */}
      <div>
        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Council Presentation (PowerPoint)</div>
        {cd.presentationAttachment ? (
          <a
            href={cd.presentationAttachment.url}
            target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-[12px] text-blue-700 font-semibold hover:bg-blue-100"
          >
            📎 {cd.presentationAttachment.name}
          </a>
        ) : (
          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-center">
            <p className="text-[11px] text-slate-400">
              {canEdit ? 'SFTC to upload the closure PowerPoint presentation.' : 'No presentation uploaded yet.'}
            </p>
          </div>
        )}
      </div>

      {/* Per-CD tracking */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Council Districts</span>
          <span className="text-[10px] text-slate-400 font-medium">{prog.done}/{prog.total} concurred</span>
        </div>
        <div className="space-y-2">
          {cd.cds.map(entry => (
            <div
              key={entry.cd}
              className={`rounded-lg border px-3 py-2.5 ${
                entry.status === 'na'        ? 'border-slate-100 bg-slate-50 opacity-60' :
                entry.status === 'concurred' ? 'border-emerald-200 bg-emerald-50' :
                entry.status === 'declined'  ? 'border-red-200 bg-red-50' :
                                               'border-slate-200 bg-white'
              }`}
            >
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-[13px] font-bold text-slate-800 w-10 flex-shrink-0">{entry.cd}</span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${CD_STATUS_COLORS[entry.status]}`}>
                  {CD_STATUS_LABELS[entry.status]}
                </span>
                {canEdit && (
                  <>
                    <select
                      value={entry.status}
                      onChange={e => updateCD(entry.cd, { status: e.target.value as CDStatus })}
                      className="text-[11px] border border-slate-200 rounded-md px-1.5 py-0.5 bg-white text-slate-600 outline-none focus:border-blue-400 ml-auto"
                    >
                      {CD_STATUS_OPTIONS.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                    {entry.status !== 'na' && (
                      <input
                        type="date"
                        value={entry.meetingDate || ''}
                        onChange={e => updateCD(entry.cd, { meetingDate: e.target.value })}
                        title="Meeting date"
                        className="text-[11px] border border-slate-200 rounded-md px-1.5 py-0.5 bg-white text-slate-600 outline-none focus:border-blue-400"
                      />
                    )}
                  </>
                )}
                {!canEdit && entry.meetingDate && (
                  <span className="text-[10px] text-slate-400 ml-auto">Meeting: {entry.meetingDate}</span>
                )}
              </div>
              {entry.notes && (
                <p className="text-[10px] text-slate-500 mt-1 pl-13">{entry.notes}</p>
              )}
              {canEdit && entry.status === 'declined' && (
                <input
                  value={entry.notes || ''}
                  onChange={e => updateCD(entry.cd, { notes: e.target.value })}
                  placeholder="Note reason for decline (BOE discretion context)…"
                  className="mt-1.5 w-full rounded border border-red-200 bg-red-50 px-2 py-1 text-[11px] outline-none focus:border-red-400"
                />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
