import React, { useState, useRef } from 'react';
import { Plan, AppConfig, DrivewayAddress, WorkHours, DrivewayLetter } from '../types';
import {
  DrivewayNoticeFields,
  generateNoticeContent,
  buildNoticeDocx,
  downloadNoticeDocx,
} from '../services/drivewayNoticeService';
import {
  saveDrivewayLetterDraft,
  updateDrivewayLetter,
  uploadExhibitImage,
  uploadFinalLetter,
  pickCorpusExamples,
} from '../services/drivewayLetterService';

// ── helpers ───────────────────────────────────────────────────────────────────

function describeWorkHours(wh?: WorkHours): string {
  if (!wh) return 'as scheduled';
  const shift = wh.shift;
  const days = wh.days ?? [];

  const dayLabel = (() => {
    if (days.length === 0) return '';
    const has = (d: string) => days.includes(d as any);
    if (has('weekday') && has('saturday') && has('sunday')) return 'seven days a week';
    if (has('weekday') && has('saturday')) return 'Monday through Saturday';
    if (has('weekday') && has('sunday')) return 'Monday through Sunday';
    if (has('weekday')) return 'Monday through Friday';
    if (has('saturday') && has('sunday')) return 'weekends';
    if (has('saturday')) return 'Saturdays';
    if (has('sunday')) return 'Sundays';
    return '';
  })();

  if (shift === 'nighttime') {
    const start = wh.weekday_start || '9:00 PM';
    const end = wh.weekday_end || '6:00 AM';
    return `nighttime hours (${start} to ${end})${dayLabel ? ` ${dayLabel}` : ''}`;
  }
  if (shift === 'continuous' || shift === 'both') {
    return `continuous 24-hour operations${dayLabel ? ` ${dayLabel}` : ''}`;
  }
  const start = wh.weekday_start || '';
  const end = wh.weekday_end || '';
  return `daytime hours${start && end ? ` (${start} to ${end})` : ''}${dayLabel ? ` ${dayLabel}` : ''}`;
}

function getToday(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── sub-components ────────────────────────────────────────────────────────────

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1">{label}</label>
      {children}
    </div>
  );
}

function Input({ value, onChange, placeholder, type = 'text' }: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[12px] outline-none focus:border-violet-400 focus:bg-white transition-colors"
    />
  );
}

function Textarea({ value, onChange, placeholder, rows = 3 }: {
  value: string; onChange: (v: string) => void; placeholder?: string; rows?: number;
}) {
  return (
    <textarea
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[12px] outline-none focus:border-violet-400 focus:bg-white transition-colors resize-none"
    />
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface DrivewayNoticeModalProps {
  plan: Plan;
  appConfig: AppConfig;
  address: DrivewayAddress;
  existingLetter?: DrivewayLetter | null;    // set when reopening a saved draft
  libraryLetters?: DrivewayLetter[];          // all library letters for corpus
  currentUser?: { name: string; email: string } | null;
  onClose: () => void;
  onMarkSent?: (addressId: string) => void;
  onLetterSaved?: (letterId: string) => void; // called after save to Library
}

type PreviewTab = 'en' | 'es';

// ── Modal ─────────────────────────────────────────────────────────────────────

export const DrivewayNoticeModal: React.FC<DrivewayNoticeModalProps> = ({
  plan, appConfig, address, existingLetter, libraryLetters = [],
  currentUser, onClose, onMarkSent, onLetterSaved,
}) => {
  const [fields, setFields] = useState<DrivewayNoticeFields>(
    existingLetter?.fields ?? {
      letterDate:           getToday(),
      projectName:          appConfig.phe_projectName ?? '',
      businessName:         appConfig.phe_businessName ?? '',
      contactName:          appConfig.phe_contactName ?? '',
      contactTitle:         appConfig.phe_contactTitle ?? '',
      contactPhone:         appConfig.phe_contactPhone ?? '',
      contactEmail:         appConfig.phe_contactEmail ?? '',
      street1:              plan.street1 ?? '',
      street2:              plan.street2 ?? '',
      segment:              plan.segment ?? '',
      workDates:            '',
      workHoursDescription: describeWorkHours(plan.work_hours),
      recipientAddress:     address.address,
      recipientName:        address.ownerName || 'Resident/Business Owner',
      remainingDrivewayOpen: false,
      bodyParagraph:        '',
      bodyParagraphEs:      '',
    }
  );

  const [exhibitImageUrl, setExhibitImageUrl] = useState<string | undefined>(
    existingLetter?.exhibitImageUrl
  );
  const [letterId, setLetterId] = useState<string | undefined>(
    existingLetter?.id
  );

  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingExhibit, setUploadingExhibit] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewTab, setPreviewTab] = useState<PreviewTab>('en');

  const exhibitInputRef = useRef<HTMLInputElement>(null);
  const set = (key: keyof DrivewayNoticeFields, val: string | boolean) =>
    setFields(f => ({ ...f, [key]: val }));

  // ── AI generate ─────────────────────────────────────────────────────────────

  const handleGenerate = async () => {
    setError(null);
    setGenerating(true);
    try {
      const corpus = pickCorpusExamples(libraryLetters, plan.segment ?? '');
      const result = await generateNoticeContent(fields, corpus);
      setFields(f => ({
        ...f,
        bodyParagraph: result.bodyParagraph,
        bodyParagraphEs: result.bodyParagraphEs,
      }));
    } catch (e: any) {
      setError(e.message ?? 'Generation failed');
    } finally {
      setGenerating(false);
    }
  };

  // ── Exhibit upload ───────────────────────────────────────────────────────────

  const handleExhibitUpload = async (file: File) => {
    setUploadingExhibit(true);
    setError(null);
    try {
      // Need a letterId first — save draft if we don't have one yet
      let id = letterId;
      if (!id) {
        id = await saveDraft(false);
      }
      const url = await uploadExhibitImage(id!, file);
      setExhibitImageUrl(url);
    } catch (e: any) {
      setError('Exhibit upload failed: ' + (e.message ?? ''));
    } finally {
      setUploadingExhibit(false);
      if (exhibitInputRef.current) exhibitInputRef.current.value = '';
    }
  };

  // ── Save draft to Library ────────────────────────────────────────────────────

  const saveDraft = async (notify = true): Promise<string> => {
    setSaving(true);
    try {
      const payload: Omit<DrivewayLetter, 'id'> = {
        planId:    plan.id,
        planLoc:   plan.loc ?? plan.id,
        addressId: address.id,
        address:   address.address,
        ownerName: address.ownerName,
        segment:   plan.segment ?? '',
        status:    'draft',
        fields,
        exhibitImageUrl,
        createdAt: new Date().toISOString(),
        createdBy: currentUser?.name ?? '',
      };

      let id = letterId;
      if (id) {
        await updateDrivewayLetter(id, { fields, exhibitImageUrl });
      } else {
        id = await saveDrivewayLetterDraft(payload);
        setLetterId(id);
      }

      if (notify) onLetterSaved?.(id!);
      return id!;
    } finally {
      setSaving(false);
    }
  };

  // ── Download docx ────────────────────────────────────────────────────────────

  const handleDownload = async () => {
    const safe = (s: string) => s.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const filename = `driveway_notice_${safe(plan.loc || plan.id)}_${safe(address.address)}.docx`;
    await downloadNoticeDocx(fields, filename, exhibitImageUrl);
  };

  // ── Save + upload final ──────────────────────────────────────────────────────

  const handleSaveToLibrary = async () => {
    setError(null);
    setSaving(true);
    try {
      const id = await saveDraft(false);
      // Build and upload the docx as the final file
      const blob = await buildNoticeDocx(fields, exhibitImageUrl);
      const safe = (s: string) => s.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      const filename = `driveway_notice_${safe(plan.loc || plan.id)}_${safe(address.address)}.docx`;
      await uploadFinalLetter(id, blob, filename);
      onLetterSaved?.(id);
      onClose();
    } catch (e: any) {
      setError('Failed to save: ' + (e.message ?? ''));
    } finally {
      setSaving(false);
    }
  };

  const canGenerate = !!fields.workDates;
  const canSave = !!fields.bodyParagraph && !!fields.bodyParagraphEs;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl flex flex-col max-h-[92vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-[15px] font-bold text-slate-900">Draft Driveway Impact Notice</h2>
            <p className="text-[11px] text-slate-500 mt-0.5">{address.address}</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors text-lg"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">

          {/* Date + Recipient */}
          <div className="grid grid-cols-2 gap-3">
            <FieldRow label="Letter Date">
              <Input type="date" value={fields.letterDate} onChange={v => set('letterDate', v)} />
            </FieldRow>
            <FieldRow label="Recipient Name (optional)">
              <Input value={fields.recipientName} onChange={v => set('recipientName', v)} placeholder="Resident/Business Owner" />
            </FieldRow>
          </div>

          <FieldRow label="Recipient Address">
            <Input value={fields.recipientAddress} onChange={v => set('recipientAddress', v)} />
          </FieldRow>

          {/* Remaining driveway toggle */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={!!fields.remainingDrivewayOpen}
              onChange={e => set('remainingDrivewayOpen', e.target.checked)}
              className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
            />
            <span className="text-[12px] font-semibold text-slate-700">One alternate driveway remains open (show green in Exhibit 1)</span>
          </label>

          {/* Project details */}
          <div className="border-t border-slate-100 pt-3">
            <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-2">Project Details</div>
            <div className="grid grid-cols-2 gap-3">
              <FieldRow label="Project Name">
                <Input value={fields.projectName} onChange={v => set('projectName', v)} />
              </FieldRow>
              <FieldRow label="Contractor">
                <Input value={fields.businessName} onChange={v => set('businessName', v)} />
              </FieldRow>
              <FieldRow label="Work Dates">
                <Input value={fields.workDates} onChange={v => set('workDates', v)} placeholder="e.g. January 21, 2026 – August 12, 2027" />
              </FieldRow>
              <FieldRow label="Work Hours Description">
                <Input value={fields.workHoursDescription} onChange={v => set('workHoursDescription', v)} placeholder="nighttime hours (8 PM – 6 AM) Mon–Fri" />
              </FieldRow>
            </div>
          </div>

          {/* Contact */}
          <div className="border-t border-slate-100 pt-3">
            <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-2">Contact Information</div>
            <div className="grid grid-cols-2 gap-3">
              <FieldRow label="Contact Name">
                <Input value={fields.contactName} onChange={v => set('contactName', v)} />
              </FieldRow>
              <FieldRow label="Contact Title">
                <Input value={fields.contactTitle} onChange={v => set('contactTitle', v)} />
              </FieldRow>
              <FieldRow label="Phone">
                <Input value={fields.contactPhone} onChange={v => set('contactPhone', v)} />
              </FieldRow>
              <FieldRow label="Email">
                <Input value={fields.contactEmail} onChange={v => set('contactEmail', v)} />
              </FieldRow>
            </div>
          </div>

          {/* Exhibit 1 upload */}
          <div className="border-t border-slate-100 pt-3">
            <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-2">Exhibit 1 — Map Image</div>
            {exhibitImageUrl ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <img src={exhibitImageUrl} alt="Exhibit 1" className="w-12 h-12 object-cover rounded border border-emerald-200 flex-shrink-0" />
                  <span className="text-[11px] font-semibold text-emerald-700 truncate">Exhibit 1 uploaded</span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <a href={exhibitImageUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] text-emerald-600 hover:underline">View</a>
                  <button
                    onClick={() => exhibitInputRef.current?.click()}
                    className="text-[10px] text-slate-400 hover:text-slate-600 underline"
                  >
                    Replace
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => exhibitInputRef.current?.click()}
                disabled={uploadingExhibit}
                className="flex items-center gap-2 w-full rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-[11px] text-slate-500 hover:border-violet-400 hover:text-violet-600 transition-colors disabled:opacity-50"
              >
                {uploadingExhibit ? '⏳ Uploading…' : '🗺 Upload map screenshot (Exhibit 1)'}
              </button>
            )}
            <input
              ref={exhibitInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleExhibitUpload(f); }}
            />
            <p className="text-[10px] text-slate-400 mt-1">
              Screenshot from Google Maps or TCP drawing with affected driveway highlighted in red.
              {fields.remainingDrivewayOpen && ' Open driveways highlighted in green.'}
            </p>
          </div>

          {/* AI Body — with English/Spanish tabs */}
          <div className="border-t border-slate-100 pt-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Notice Body</div>
                {(fields.bodyParagraph || fields.bodyParagraphEs) && (
                  <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5">
                    {(['en', 'es'] as PreviewTab[]).map(t => (
                      <button
                        key={t}
                        onClick={() => setPreviewTab(t)}
                        className={`px-2.5 py-0.5 rounded-md text-[10px] font-bold transition-all ${
                          previewTab === t
                            ? 'bg-white text-slate-800 shadow-sm'
                            : 'text-slate-500 hover:text-slate-700'
                        }`}
                      >
                        {t === 'en' ? 'English' : 'Español'}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button
                onClick={handleGenerate}
                disabled={generating || !canGenerate}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-[11px] font-bold transition-colors disabled:opacity-50"
                title={!canGenerate ? 'Fill in Work Dates first' : undefined}
              >
                {generating ? '⏳ Rafi is writing…' : '✨ Ask Rafi'}
              </button>
            </div>
            {error && (
              <div className="mb-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-[11px] text-red-700">
                {error}
              </div>
            )}
            {previewTab === 'en' ? (
              <Textarea
                value={fields.bodyParagraph}
                onChange={v => set('bodyParagraph', v)}
                placeholder="Click 'Generate with AI' to draft this paragraph, or type it manually…"
                rows={5}
              />
            ) : (
              <Textarea
                value={fields.bodyParagraphEs}
                onChange={v => set('bodyParagraphEs', v)}
                placeholder="La traducción al español aparecerá aquí después de generar…"
                rows={5}
              />
            )}
            {libraryLetters.filter(l => (l.status === 'approved' || l.status === 'sent') && l.segment === plan.segment).length > 0 && (
              <p className="text-[10px] text-violet-600 mt-1">
                ✨ {libraryLetters.filter(l => (l.status === 'approved' || l.status === 'sent') && l.segment === plan.segment).length} approved letter(s) from this segment will guide the AI draft.
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-slate-100 px-5 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {onMarkSent && address.noticeSent && (
              <span className="text-[11px] font-semibold text-emerald-600">✓ Marked as sent</span>
            )}
            {onMarkSent && !address.noticeSent && canSave && (
              <button
                onClick={() => { onMarkSent(address.id); onClose(); }}
                className="text-[11px] font-semibold text-emerald-600 hover:text-emerald-800 transition-colors"
              >
                ✓ Mark notice as sent
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 text-[12px] font-semibold hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleDownload}
              disabled={!canSave}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 text-[12px] font-semibold hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              📄 Download .docx
            </button>
            <button
              onClick={handleSaveToLibrary}
              disabled={!canSave || saving}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-700 text-white text-[12px] font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? '⏳ Saving…' : '📚 Save to Library'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
