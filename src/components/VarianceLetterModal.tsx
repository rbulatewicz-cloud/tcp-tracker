import React, { useState } from 'react';
import { Plan, AppConfig, NoiseVariance, WorkHours } from '../types';
import {
  VarianceLetterFields,
  generateLetterContent,
  downloadLetterDocx,
} from '../services/varianceLetterService';

// ── helpers ───────────────────────────────────────────────────────────────────

function describeWorkHours(wh?: WorkHours): string {
  if (!wh) return 'nighttime hours';
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
  return `daytime hours${dayLabel ? ` ${dayLabel}` : ''}`;
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
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
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
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <textarea
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[12px] outline-none focus:border-violet-400 focus:bg-white transition-colors resize-y"
    />
  );
}

// ── main modal ────────────────────────────────────────────────────────────────

interface VarianceLetterModalProps {
  plan: Plan;
  appConfig: AppConfig;
  linkedVariance?: NoiseVariance | null;
  isRenewal?: boolean;
  onClose: () => void;
}

export function VarianceLetterModal({ plan, appConfig, linkedVariance, isRenewal, onClose }: VarianceLetterModalProps) {
  const [fields, setFields] = useState<VarianceLetterFields>(() => ({
    letterDate:           getToday(),
    projectName:          appConfig.phe_projectName || '',
    businessName:         appConfig.phe_businessName || appConfig.appName || '',
    contactName:          appConfig.phe_contactName || '',
    contactTitle:         appConfig.phe_contactTitle || '',
    contactPhone:         appConfig.phe_contactPhone || '',
    contactEmail:         appConfig.phe_contactEmail || '',
    street1:              plan.street1 || '',
    street2:              plan.street2 || '',
    segment:              plan.segment || '',
    workHoursDescription: describeWorkHours(plan.work_hours),
    validFrom:            getToday(),
    validThrough:         linkedVariance?.validThrough || '',
    checkNumber:          linkedVariance?.checkNumber || '',
    checkAmount:          linkedVariance?.checkAmount || '553.00',
    ccList:               '',
    subjectLine:          '',
    scopeParagraph:       '',
    equipmentList:        '',
  }));

  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState('');
  const [downloading, setDownloading] = useState(false);

  const set = (key: keyof VarianceLetterFields) => (val: string) =>
    setFields(f => ({ ...f, [key]: val }));

  const handleGenerate = async () => {
    setGenerating(true);
    setGenerateError('');
    try {
      const result = await generateLetterContent(fields, isRenewal);
      setFields(f => ({
        ...f,
        subjectLine:    result.subjectLine,
        scopeParagraph: result.scopeParagraph,
        equipmentList:  result.equipmentList,
      }));
    } catch (e: any) {
      setGenerateError(e.message || 'Generation failed');
    } finally {
      setGenerating(false);
    }
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const loc = plan.loc || plan.id;
      const safeLoc = loc.replace(/[^a-zA-Z0-9-_.]/g, '_');
      await downloadLetterDocx(fields, `NoiseVariance_${isRenewal ? 'Renewal' : 'Letter'}_${safeLoc}.docx`, isRenewal);
    } catch (e: any) {
      setGenerateError(e.message || 'Download failed');
    } finally {
      setDownloading(false);
    }
  };

  const canDownload = fields.subjectLine && fields.scopeParagraph && fields.equipmentList;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-[15px] font-bold text-slate-900">
              {isRenewal ? 'Draft Renewal Letter' : 'Draft Noise Variance Letter'}
            </h2>
            <p className="text-[11px] text-slate-400 mt-0.5">{plan.loc || plan.id} — {plan.street1}{plan.street2 ? ` / ${plan.street2}` : ''}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 transition-colors text-xl leading-none">✕</button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

          {/* Section: Project / Contact */}
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3">Project & Contact</div>
            <div className="grid grid-cols-2 gap-3">
              <FieldRow label="Letter Date">
                <Input type="date" value={fields.letterDate} onChange={set('letterDate')} />
              </FieldRow>
              <FieldRow label="Business / Contractor Name">
                <Input value={fields.businessName} onChange={set('businessName')} placeholder="e.g. San Fernando Transit Constructors" />
              </FieldRow>
              <div className="col-span-2">
                <FieldRow label="Project Name">
                  <Input value={fields.projectName} onChange={set('projectName')} placeholder="e.g. ESFV LRT Extension" />
                </FieldRow>
              </div>
              <FieldRow label="Contact Name">
                <Input value={fields.contactName} onChange={set('contactName')} placeholder="Signatory name" />
              </FieldRow>
              <FieldRow label="Contact Title">
                <Input value={fields.contactTitle} onChange={set('contactTitle')} placeholder="e.g. Project Manager" />
              </FieldRow>
              <FieldRow label="Contact Phone">
                <Input value={fields.contactPhone} onChange={set('contactPhone')} placeholder="(xxx) xxx-xxxx" />
              </FieldRow>
              <FieldRow label="Contact Email">
                <Input value={fields.contactEmail} onChange={set('contactEmail')} placeholder="email@company.com" />
              </FieldRow>
            </div>
          </div>

          {/* Section: Work Location */}
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3">Work Location & Hours</div>
            <div className="grid grid-cols-2 gap-3">
              <FieldRow label="Primary Street">
                <Input value={fields.street1} onChange={set('street1')} />
              </FieldRow>
              <FieldRow label="Cross Street">
                <Input value={fields.street2} onChange={set('street2')} />
              </FieldRow>
              <FieldRow label="Segment">
                <Input value={fields.segment} onChange={set('segment')} placeholder="e.g. A2" />
              </FieldRow>
              <div />
              <div className="col-span-2">
                <FieldRow label="Work Hours Description (for letter body)">
                  <Input value={fields.workHoursDescription} onChange={set('workHoursDescription')} placeholder="e.g. nighttime hours (9:00 PM to 6:00 AM) Monday through Friday" />
                </FieldRow>
              </div>
            </div>
          </div>

          {/* Section: Variance Dates */}
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3">Variance Period</div>
            <div className="grid grid-cols-2 gap-3">
              <FieldRow label="Valid From">
                <Input type="date" value={fields.validFrom} onChange={set('validFrom')} />
              </FieldRow>
              <FieldRow label="Valid Through">
                <Input type="date" value={fields.validThrough} onChange={set('validThrough')} />
              </FieldRow>
            </div>
          </div>

          {/* Section: Payment */}
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3">Payment</div>
            <div className="grid grid-cols-2 gap-3">
              <FieldRow label="Check Number">
                <Input value={fields.checkNumber} onChange={set('checkNumber')} placeholder="Optional" />
              </FieldRow>
              <FieldRow label="Check Amount ($)">
                <Input value={fields.checkAmount} onChange={set('checkAmount')} placeholder="553.00" />
              </FieldRow>
            </div>
          </div>

          {/* Section: CC */}
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3">CC Recipients</div>
            <FieldRow label="One name per line">
              <Textarea value={fields.ccList} onChange={set('ccList')} placeholder={"John Smith, LADOT\nJane Doe, Metro"} rows={3} />
            </FieldRow>
          </div>

          {/* Section: AI-Generated Content */}
          <div className="rounded-xl border border-violet-200 bg-violet-50 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[12px] font-bold text-violet-800">AI-Generated Content</div>
                <p className="text-[10px] text-violet-600 mt-0.5">Generate subject line, scope paragraph, and equipment list using Gemini AI.</p>
              </div>
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-[11px] font-bold transition-colors"
              >
                {generating ? (
                  <>
                    <span className="inline-block w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    Rafi is writing…
                  </>
                ) : (
                  <>✨ Ask Rafi</>
                )}
              </button>
            </div>

            {generateError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700 break-all">
                {generateError}
              </div>
            )}

            <FieldRow label="Subject Line">
              <Input value={fields.subjectLine} onChange={set('subjectLine')} placeholder="Click Generate to auto-fill, or type manually" />
            </FieldRow>

            <FieldRow label="Scope Paragraph">
              <Textarea value={fields.scopeParagraph} onChange={set('scopeParagraph')} placeholder="Click Generate to auto-fill, or type manually" rows={5} />
            </FieldRow>

            <FieldRow label="Equipment List (one per line or comma-separated)">
              <Textarea value={fields.equipmentList} onChange={set('equipmentList')} placeholder="Click Generate to auto-fill, or type manually" rows={4} />
            </FieldRow>
          </div>

        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-slate-100 gap-3">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 text-[12px] font-semibold hover:bg-slate-50 transition-colors">
            Cancel
          </button>
          <div className="flex items-center gap-2">
            {!canDownload && (
              <span className="text-[11px] text-slate-400">Generate content first to enable download</span>
            )}
            <button
              onClick={handleDownload}
              disabled={!canDownload || downloading}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-[12px] font-bold transition-colors"
            >
              {downloading ? (
                <>
                  <span className="inline-block w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Building…
                </>
              ) : (
                <>📄 Download .docx</>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
