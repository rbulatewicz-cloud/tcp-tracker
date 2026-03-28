import React, { useState, useRef } from 'react';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../../firebase';
import {
  PlanCompliance, PHETrack, NoiseVarianceTrack, CDConcurrenceTrack,
  PHEChecklistItem, ComplianceAttachment, CDEntry, ComplianceStatus, CDStatus,
} from '../../types';
import { usePlanData, usePlanActions, usePlanPermissions } from '../PlanCardContext';
import {
  detectComplianceTriggers, initializeComplianceTracks,
  pheProgress, cdProgress, overallComplianceProgress,
  COMPLIANCE_STATUS_LABELS, CD_STATUS_LABELS,
} from '../../utils/compliance';
import { UserRole } from '../../types';
import { generatePHEPacket } from '../../services/phePacketService';

// ── helpers ───────────────────────────────────────────────────────────────────

function ProgressRing({ pct, size = 36 }: { pct: number; size?: number }) {
  const r = (size - 6) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;
  const color = pct === 100 ? '#10b981' : pct > 50 ? '#3b82f6' : '#f59e0b';
  return (
    <svg width={size} height={size} className="flex-shrink-0 -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={3} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={color} strokeWidth={3}
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round" style={{ transition: 'stroke-dashoffset .3s' }}
      />
    </svg>
  );
}

const STATUS_COLORS: Record<string, string> = {
  not_started:     'bg-slate-100 text-slate-500',
  in_progress:     'bg-blue-100 text-blue-700',
  linked_existing: 'bg-teal-100 text-teal-700',
  submitted:       'bg-amber-100 text-amber-700',
  approved:        'bg-emerald-100 text-emerald-700',
  expired:         'bg-red-100 text-red-700',
};

const CD_STATUS_COLORS: Record<string, string> = {
  pending:           'bg-slate-100 text-slate-500',
  presentation_sent: 'bg-blue-100 text-blue-700',
  meeting_scheduled: 'bg-violet-100 text-violet-700',
  concurred:         'bg-emerald-100 text-emerald-700',
  declined:          'bg-red-100 text-red-700',
  na:                'bg-slate-50 text-slate-400',
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_COLORS[status] ?? STATUS_COLORS.not_started}`}>
      {COMPLIANCE_STATUS_LABELS[status] ?? status}
    </span>
  );
}

function SectionHeader({
  icon, title, status, progress, canEdit, onEditStatus, expanded, onToggle,
}: {
  icon: string; title: string; status: ComplianceStatus;
  progress?: { done: number; total: number; pct: number };
  canEdit: boolean;
  onEditStatus: (s: ComplianceStatus) => void;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className="flex items-center gap-3 cursor-pointer select-none py-2 px-3 rounded-lg hover:bg-slate-50 transition-colors"
      onClick={onToggle}
    >
      <span className="text-base">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[12px] font-bold text-slate-800">{title}</span>
          <StatusBadge status={status} />
          {progress && (
            <span className="text-[10px] text-slate-400 font-medium">
              {progress.done}/{progress.total} items
            </span>
          )}
        </div>
      </div>
      {progress && <ProgressRing pct={progress.pct} />}
      {canEdit && (
        <select
          value={status}
          onChange={e => { e.stopPropagation(); onEditStatus(e.target.value as ComplianceStatus); }}
          onClick={e => e.stopPropagation()}
          className="text-[11px] border border-slate-200 rounded-md px-1.5 py-0.5 bg-white text-slate-600 outline-none focus:border-blue-400"
        >
          {Object.entries(COMPLIANCE_STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      )}
      <span className={`text-slate-400 text-xs transition-transform ${expanded ? 'rotate-180' : ''}`}>▾</span>
    </div>
  );
}

// ── PHE Track ─────────────────────────────────────────────────────────────────
function PHEPanel({
  phe, canEdit, onChange, planId, approvedTCPs, cdConcurrence,
}: {
  phe: PHETrack; canEdit: boolean; onChange: (p: PHETrack) => void; planId: string;
  approvedTCPs: import('../../types').PlanDocument[];
  cdConcurrence: import('../../types').CDConcurrenceTrack | undefined;
}) {
  const { currentUser } = usePlanPermissions();

  // Derive auto-satisfaction for linked items without mutating checklist data
  const isTCPSatisfied = approvedTCPs.length > 0;
  const isCDSatisfied = !!(cdConcurrence?.cds?.some(c => c.status !== 'pending' && c.status !== 'na'));
  const effectiveCompleted = (item: import('../../types').PHEChecklistItem): boolean => {
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

// ── Noise Variance Track ──────────────────────────────────────────────────────
function NVPanel({
  nv, canEdit, onChange,
}: { nv: NoiseVarianceTrack; canEdit: boolean; onChange: (n: NoiseVarianceTrack) => void }) {
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

      {canEdit && (
        <div className="grid grid-cols-2 gap-3">
          {[
            { key: 'existingPermitNumber', label: 'Existing Permit # (if obtained)' },
            { key: 'submittedDate',         label: 'Submitted Date' },
            { key: 'approvalDate',          label: 'Approval Date' },
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
        <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-center">
          <p className="text-[11px] text-slate-400">Attach the approved Noise Variance letter when obtained.</p>
          <p className="text-[10px] text-slate-300 mt-0.5">Auto-generation coming in a future update.</p>
        </div>
      </div>
    </div>
  );
}

// ── CD Concurrence Track ──────────────────────────────────────────────────────
const CD_STATUS_OPTIONS: { value: CDStatus; label: string }[] = [
  { value: 'pending',            label: 'Pending' },
  { value: 'presentation_sent',  label: 'Presentation Sent' },
  { value: 'meeting_scheduled',  label: 'Meeting Scheduled' },
  { value: 'concurred',          label: 'Concurred ✓' },
  { value: 'declined',           label: 'Declined ✗' },
  { value: 'na',                 label: 'N/A — Not in section' },
];

function CDPanel({
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
                entry.status === 'na'       ? 'border-slate-100 bg-slate-50 opacity-60' :
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

// ── Main ComplianceSection ────────────────────────────────────────────────────
export const ComplianceSection: React.FC = React.memo(() => {
  const { selectedPlan } = usePlanData();
  const { updatePlanField } = usePlanActions();
  const { canEditFields } = usePlanPermissions();

  const [expandedTrack, setExpandedTrack] = useState<string | null>(null);
  const [localCompliance, setLocalCompliance] = useState<PlanCompliance | null>(null);
  const [dirty, setDirty] = useState(false);
  const [generatingPacket, setGeneratingPacket] = useState(false);
  const [removeConfirm, setRemoveConfirm] = useState<string | null>(null);

  const triggers = detectComplianceTriggers(selectedPlan);
  const hasAnyTrigger = triggers.phe || triggers.noiseVariance || triggers.cdConcurrence;

  // Derive compliance — use local draft if editing, else plan data
  const compliance: PlanCompliance = localCompliance
    ?? initializeComplianceTracks(triggers, selectedPlan.compliance);

  const overall = overallComplianceProgress(compliance);

  const updateCompliance = (patch: Partial<PlanCompliance>) => {
    const next = { ...compliance, ...patch };
    setLocalCompliance(next);
    setDirty(true);
  };

  const saveCompliance = () => {
    updatePlanField(selectedPlan.id, 'compliance', compliance);
    setDirty(false);
  };

  const removeTrack = (track: 'phe' | 'noiseVariance' | 'cdConcurrence') => {
    const updated = { ...compliance, [track]: undefined };
    setLocalCompliance(updated);
    updatePlanField(selectedPlan.id, 'compliance', updated);
    setDirty(false);
    setRemoveConfirm(null);
    if (expandedTrack === track) setExpandedTrack(null);
  };

  const toggle = (key: string) =>
    setExpandedTrack(prev => (prev === key ? null : key));

  if (!hasAnyTrigger) {
    return (
      <div className="mt-4 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-center">
        <p className="text-[11px] text-slate-400">No compliance tracks triggered for this plan.</p>
        <p className="text-[10px] text-slate-300 mt-0.5">Tracks auto-generate when PHE, night work, or closure conditions are met.</p>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-2">
      {/* Overall progress bar */}
      {overall.total > 0 && (
        <div className="flex items-center gap-3 mb-3">
          <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${overall.pct === 100 ? 'bg-emerald-500' : 'bg-blue-500'}`}
              style={{ width: `${overall.pct}%` }}
            />
          </div>
          <span className="text-[11px] font-bold text-slate-500 flex-shrink-0">
            {overall.pct}% complete
          </span>
        </div>
      )}

      {/* PHE Track */}
      {compliance.phe && (
        <div className="rounded-xl border border-amber-200 bg-white overflow-hidden">
          <SectionHeader
            icon="🏛️" title="Peak Hour Exemption (BOE)"
            status={compliance.phe.status}
            progress={pheProgress(compliance.phe)}
            canEdit={canEditFields}
            onEditStatus={s => updateCompliance({ phe: { ...compliance.phe!, status: s } })}
            expanded={expandedTrack === 'phe'}
            onToggle={() => toggle('phe')}
          />
          {expandedTrack === 'phe' && (
            <div className="border-t border-amber-100">
              <PHEPanel
                phe={compliance.phe}
                canEdit={canEditFields}
                onChange={p => updateCompliance({ phe: p })}
                planId={selectedPlan.id}
                approvedTCPs={selectedPlan.approvedTCPs ?? []}
                cdConcurrence={compliance.cdConcurrence}
              />
              {canEditFields && (
                <div className="px-3 pb-3">
                  <button
                    onClick={async () => {
                      setGeneratingPacket(true);
                      try { await generatePHEPacket(selectedPlan); }
                      finally { setGeneratingPacket(false); }
                    }}
                    disabled={generatingPacket}
                    className="w-full py-2 rounded-lg border border-amber-300 bg-amber-50 text-amber-800 text-[11px] font-bold hover:bg-amber-100 transition-colors disabled:opacity-50"
                  >
                    {generatingPacket ? '⏳ Assembling packet…' : '📄 Generate PHE Application Packet'}
                  </button>
                </div>
              )}
            </div>
          )}
          {canEditFields && (
            <div className="border-t border-amber-100 px-3 py-1.5 flex justify-end">
              {removeConfirm === 'phe' ? (
                <span className="flex items-center gap-2 text-[10px]">
                  <span className="text-red-600 font-semibold">Remove PHE track?</span>
                  <button onClick={() => removeTrack('phe')} className="text-red-600 font-bold hover:underline">Yes, remove</button>
                  <button onClick={() => setRemoveConfirm(null)} className="text-slate-400 hover:underline">Cancel</button>
                </span>
              ) : (
                <button onClick={() => setRemoveConfirm('phe')} className="text-[10px] text-slate-300 hover:text-red-400 transition-colors">✕ Remove track</button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Noise Variance Track */}
      {compliance.noiseVariance && (
        <div className="rounded-xl border border-violet-200 bg-white overflow-hidden">
          <SectionHeader
            icon="🔊" title="Noise Variance (Police Commission)"
            status={compliance.noiseVariance.status}
            canEdit={canEditFields}
            onEditStatus={s => updateCompliance({ noiseVariance: { ...compliance.noiseVariance!, status: s } })}
            expanded={expandedTrack === 'nv'}
            onToggle={() => toggle('nv')}
          />
          {expandedTrack === 'nv' && (
            <div className="border-t border-violet-100">
              <NVPanel
                nv={compliance.noiseVariance}
                canEdit={canEditFields}
                onChange={n => updateCompliance({ noiseVariance: n })}
              />
            </div>
          )}
          {canEditFields && (
            <div className="border-t border-violet-100 px-3 py-1.5 flex justify-end">
              {removeConfirm === 'nv' ? (
                <span className="flex items-center gap-2 text-[10px]">
                  <span className="text-red-600 font-semibold">Remove NV track?</span>
                  <button onClick={() => removeTrack('noiseVariance')} className="text-red-600 font-bold hover:underline">Yes, remove</button>
                  <button onClick={() => setRemoveConfirm(null)} className="text-slate-400 hover:underline">Cancel</button>
                </span>
              ) : (
                <button onClick={() => setRemoveConfirm('nv')} className="text-[10px] text-slate-300 hover:text-red-400 transition-colors">✕ Remove track</button>
              )}
            </div>
          )}
        </div>
      )}

      {/* CD Concurrence Track */}
      {compliance.cdConcurrence && (
        <div className="rounded-xl border border-blue-200 bg-white overflow-hidden">
          <SectionHeader
            icon="🏙️" title="CD Concurrence (CD2 · CD6 · CD7)"
            status={compliance.cdConcurrence.status}
            progress={cdProgress(compliance.cdConcurrence.cds)}
            canEdit={canEditFields}
            onEditStatus={s => updateCompliance({ cdConcurrence: { ...compliance.cdConcurrence!, status: s } })}
            expanded={expandedTrack === 'cd'}
            onToggle={() => toggle('cd')}
          />
          {expandedTrack === 'cd' && (
            <div className="border-t border-blue-100">
              <CDPanel
                cd={compliance.cdConcurrence}
                canEdit={canEditFields}
                onChange={c => updateCompliance({ cdConcurrence: c })}
              />
            </div>
          )}
          {canEditFields && (
            <div className="border-t border-blue-100 px-3 py-1.5 flex justify-end">
              {removeConfirm === 'cd' ? (
                <span className="flex items-center gap-2 text-[10px]">
                  <span className="text-red-600 font-semibold">Remove CD track?</span>
                  <button onClick={() => removeTrack('cdConcurrence')} className="text-red-600 font-bold hover:underline">Yes, remove</button>
                  <button onClick={() => setRemoveConfirm(null)} className="text-slate-400 hover:underline">Cancel</button>
                </span>
              ) : (
                <button onClick={() => setRemoveConfirm('cd')} className="text-[10px] text-slate-300 hover:text-red-400 transition-colors">✕ Remove track</button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Save button */}
      {dirty && canEditFields && (
        <div className="flex justify-end pt-1">
          <button
            onClick={saveCompliance}
            className="px-4 py-1.5 rounded-lg bg-slate-900 text-white text-[12px] font-bold hover:bg-slate-700 transition-colors"
          >
            Save Compliance
          </button>
        </div>
      )}
    </div>
  );
});
