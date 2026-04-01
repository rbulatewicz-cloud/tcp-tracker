import { useState, useRef } from 'react';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../../../firebase';
import {
  PHETrack, ComplianceAttachment, CDConcurrenceTrack, PlanDocument, PHEChecklistItem,
} from '../../../types';
import { usePlanPermissions } from '../../PlanCardContext';
import { pheProgress, CD_STATUS_LABELS } from '../../../utils/compliance';

export function PHEPanel({
  phe, canEdit, onChange, planId, approvedTCPs, cdConcurrence,
}: {
  phe: PHETrack;
  canEdit: boolean;
  onChange: (p: PHETrack) => void;
  planId: string;
  approvedTCPs: PlanDocument[];
  cdConcurrence: CDConcurrenceTrack | undefined;
}) {
  const { currentUser } = usePlanPermissions();

  // Derive auto-satisfaction for linked items without mutating checklist data
  const isTCPSatisfied = approvedTCPs.length > 0;
  const isCDSatisfied = !!(cdConcurrence?.cds?.some(c => c.status !== 'pending' && c.status !== 'na'));
  const effectiveCompleted = (item: PHEChecklistItem): boolean => {
    if (item.id === 'tcp_wtcp') return isTCPSatisfied || item.completed;
    if (item.id === 'council_comms') return isCDSatisfied || item.completed;
    return item.completed;
  };
  const prog = pheProgress({ ...phe, checklist: phe.checklist.map(i => ({ ...i, completed: effectiveCompleted(i) })) });
  const [uploadingItem, setUploadingItem] = useState<string | null>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const toggleItem = (id: string, field: 'completed' | 'notApplicable', val: boolean) => {
    onChange({
      ...phe,
      checklist: phe.checklist.map(i => i.id === id ? { ...i, [field]: val } : i),
    });
  };

  const updateField = (patch: Partial<PHETrack>) => onChange({ ...phe, ...patch });

  const attachItem = async (itemId: string, file: File) => {
    setUploadingItem(itemId);
    try {
      const ts = Date.now();
      const storageRef = ref(storage, `plans/${planId}/phe-checklist/${itemId}/${ts}_${file.name}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      const attachment: ComplianceAttachment = {
        name: file.name,
        url,
        uploadedAt: new Date().toISOString(),
        uploadedBy: currentUser?.name ?? '',
      };
      onChange({
        ...phe,
        checklist: phe.checklist.map(i =>
          i.id === itemId
            ? { ...i, attachments: [...(i.attachments ?? []), attachment] }
            : i
        ),
      });
    } finally {
      setUploadingItem(null);
      // reset input so same file can be re-selected
      if (fileInputRefs.current[itemId]) fileInputRefs.current[itemId]!.value = '';
    }
  };

  const removeAttachment = (itemId: string, attachmentUrl: string) => {
    onChange({
      ...phe,
      checklist: phe.checklist.map(i =>
        i.id === itemId
          ? { ...i, attachments: (i.attachments ?? []).filter(a => a.url !== attachmentUrl) }
          : i
      ),
    });
  };

  return (
    <div className="space-y-4 px-3 pb-3">
      {/* Triggered-by reasons */}
      <div className="flex flex-wrap gap-1">
        {phe.triggeredBy.map(r => (
          <span key={r} className="bg-amber-50 border border-amber-200 text-amber-700 text-[10px] font-semibold px-2 py-0.5 rounded-full">
            {r}
          </span>
        ))}
      </div>

      {/* Linked existing */}
      {canEdit && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block mb-1">BOE Permit #</label>
            <input
              value={phe.boePermitNumber || ''}
              onChange={e => updateField({ boePermitNumber: e.target.value })}
              placeholder="If already obtained…"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[12px] outline-none focus:border-amber-400"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block mb-1">Permit Type</label>
            <div className="flex gap-1">
              {(['A', 'B', 'E', 'U', 'S'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => updateField({ permitType: t })}
                  className={`flex-1 py-1.5 rounded-md text-[11px] font-bold border transition-all ${
                    phe.permitType === t
                      ? 'border-amber-500 bg-amber-500 text-white'
                      : 'border-slate-200 bg-white text-slate-500 hover:border-slate-400'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* PHE Justification (read-only display if set at request time) */}
      {phe.peakHourJustification && (
        <div className="rounded-lg bg-amber-50 border border-amber-100 px-3 py-2">
          <div className="text-[10px] font-bold text-amber-700 mb-1">Peak Hour Justification (from request)</div>
          <p className="text-[11px] text-amber-800">{phe.peakHourJustification}</p>
        </div>
      )}
      {canEdit && !phe.peakHourJustification && (
        <div>
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block mb-1">Peak Hour Justification</label>
          <textarea
            rows={2}
            value={phe.peakHourJustification || ''}
            onChange={e => updateField({ peakHourJustification: e.target.value })}
            placeholder="Why is peak hour work operationally necessary?"
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[12px] outline-none focus:border-amber-400 resize-none"
          />
        </div>
      )}

      {/* Impacted Lanes */}
      {canEdit && (
        <div>
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block mb-1">
            Impacted Lanes{' '}
            <span className="font-normal text-slate-400 normal-case">"See attached" not acceptable — list specific lanes & directions</span>
          </label>
          <textarea
            rows={2}
            value={phe.impactedLanes || ''}
            onChange={e => updateField({ impactedLanes: e.target.value })}
            placeholder="e.g. Parking lane & 1st lane NB on Van Nuys Blvd"
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[12px] outline-none focus:border-amber-400 resize-none"
          />
        </div>
      )}

      {/* Submission dates */}
      {canEdit && (
        <div className="grid grid-cols-2 gap-3">
          {[
            { key: 'submittedDate', label: 'Submitted to BOE' },
            { key: 'approvalDate',  label: 'BOE Approval Date' },
          ].map(f => (
            <div key={f.key}>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block mb-1">{f.label}</label>
              <input
                type="date"
                value={(phe as any)[f.key] || ''}
                onChange={e => updateField({ [f.key]: e.target.value })}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[12px] outline-none focus:border-amber-400"
              />
            </div>
          ))}
        </div>
      )}

      {/* Checklist */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Application Checklist</span>
          <span className="text-[10px] font-semibold text-slate-400">{prog.done}/{prog.total} complete</span>
        </div>
        <div className="space-y-1.5">
          {phe.checklist.map(item => (
            <div
              key={item.id}
              className={`rounded-lg border px-3 py-2.5 ${
                item.notApplicable        ? 'border-slate-100 bg-slate-50 opacity-50' :
                effectiveCompleted(item)  ? 'border-emerald-200 bg-emerald-50' :
                                            'border-slate-200 bg-white'
              }`}
            >
              <div className="flex items-start gap-2.5">
                {canEdit ? (
                  <input
                    type="checkbox"
                    checked={effectiveCompleted(item)}
                    disabled={item.notApplicable || (item.id === 'tcp_wtcp' && isTCPSatisfied) || (item.id === 'council_comms' && isCDSatisfied)}
                    onChange={e => toggleItem(item.id, 'completed', e.target.checked)}
                    className="mt-0.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 flex-shrink-0"
                  />
                ) : (
                  <span className={`mt-0.5 flex-shrink-0 text-sm ${effectiveCompleted(item) ? 'text-emerald-500' : 'text-slate-300'}`}>
                    {effectiveCompleted(item) ? '✓' : '○'}
                  </span>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[12px] font-semibold ${item.notApplicable ? 'line-through text-slate-400' : effectiveCompleted(item) ? 'text-emerald-800' : 'text-slate-800'}`}>
                      {item.label}
                    </span>
                    {(item.id === 'tcp_wtcp' && isTCPSatisfied) || (item.id === 'council_comms' && isCDSatisfied) ? (
                      <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-semibold">🔗 Auto-linked</span>
                    ) : null}
                    {!item.required && canEdit && (
                      <button
                        onClick={() => toggleItem(item.id, 'notApplicable', !item.notApplicable)}
                        className="text-[10px] text-slate-400 hover:text-slate-600 underline"
                      >
                        {item.notApplicable ? 'Mark applicable' : 'N/A'}
                      </button>
                    )}
                    {!item.required && !item.notApplicable && (
                      <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-medium">Conditional</span>
                    )}
                  </div>
                  {/* Override description for auto-linked items */}
                  {item.id === 'tcp_wtcp' ? (
                    <p className="text-[10px] text-slate-400 mt-0.5 leading-relaxed">
                      {isTCPSatisfied
                        ? 'Linked from Approved Documents — satisfied by the TCP on file.'
                        : 'Upload your approved TCP in the Documents section below, or attach separately here.'}
                    </p>
                  ) : item.id === 'council_comms' ? (
                    <p className="text-[10px] text-slate-400 mt-0.5 leading-relaxed">
                      {isCDSatisfied
                        ? 'Linked from CD Concurrence — communication on record for this plan.'
                        : 'Complete the CD Concurrence section to satisfy this requirement, or attach separately here.'}
                    </p>
                  ) : (
                    <p className="text-[10px] text-slate-400 mt-0.5 leading-relaxed">{item.description}</p>
                  )}
                  {/* Auto-linked: approved TCPs */}
                  {item.id === 'tcp_wtcp' && isTCPSatisfied && (
                    <div className="mt-1.5 flex gap-1 flex-wrap">
                      {approvedTCPs.map((doc, i) => (
                        <a key={i} href={doc.url} target="_blank" rel="noopener noreferrer"
                          className="text-[10px] bg-emerald-50 border border-emerald-200 text-emerald-700 rounded px-1.5 py-0.5 hover:bg-emerald-100">
                          📋 {doc.name}
                        </a>
                      ))}
                    </div>
                  )}

                  {/* Auto-linked: CD concurrence statuses */}
                  {item.id === 'council_comms' && isCDSatisfied && cdConcurrence?.cds && (
                    <div className="mt-1.5 flex gap-1 flex-wrap">
                      {cdConcurrence.cds.filter(c => c.status !== 'na').map(c => (
                        <span key={c.cd} className={`text-[10px] rounded px-1.5 py-0.5 font-semibold ${
                          c.status === 'concurred' ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' :
                          c.status === 'declined'  ? 'bg-red-50 border border-red-200 text-red-700' :
                                                     'bg-blue-50 border border-blue-200 text-blue-700'
                        }`}>
                          {c.cd} — {CD_STATUS_LABELS[c.status] ?? c.status}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Attachments */}
                  {(item.attachments && item.attachments.length > 0) && (
                    <div className="mt-1.5 flex gap-1 flex-wrap">
                      {item.attachments.map((a, i) => (
                        <span key={i} className="flex items-center gap-1 bg-blue-50 border border-blue-200 rounded px-1.5 py-0.5">
                          <a href={a.url} target="_blank" rel="noopener noreferrer"
                            className="text-[10px] text-blue-700 hover:underline">
                            📎 {a.name}
                          </a>
                          {canEdit && (
                            <button
                              onClick={() => removeAttachment(item.id, a.url)}
                              className="text-[10px] text-blue-400 hover:text-red-500 leading-none ml-0.5"
                              title="Remove attachment"
                            >
                              ✕
                            </button>
                          )}
                        </span>
                      ))}
                    </div>
                  )}
                  {/* Attach button — hidden when auto-satisfied by linked data */}
                  {canEdit && !item.notApplicable && !(item.id === 'tcp_wtcp' && isTCPSatisfied) && !(item.id === 'council_comms' && isCDSatisfied) && (
                    <div className="mt-1.5">
                      <input
                        type="file"
                        ref={el => { fileInputRefs.current[item.id] = el; }}
                        className="hidden"
                        onChange={e => {
                          const file = e.target.files?.[0];
                          if (file) attachItem(item.id, file);
                        }}
                      />
                      <button
                        onClick={() => fileInputRefs.current[item.id]?.click()}
                        disabled={uploadingItem === item.id}
                        className="text-[10px] text-slate-400 hover:text-amber-600 disabled:opacity-50 flex items-center gap-1 transition-colors"
                      >
                        {uploadingItem === item.id ? '⏳ Uploading…' : '📎 Attach'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
