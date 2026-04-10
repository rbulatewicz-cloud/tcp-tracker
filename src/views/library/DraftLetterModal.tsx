import { useState } from 'react';
import { Wand2, X, Loader2, FileText } from 'lucide-react';
import { Plan, AppConfig, DrivewayAddress, DrivewayLetter, User } from '../../types';
import { DrivewayNoticeFields, generateNoticeContent } from '../../services/drivewayNoticeService';
import { saveDrivewayLetterDraft, pickCorpusExamples } from '../../services/drivewayLetterService';
import { showToast } from '../../lib/toast';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatWindowDates(startDate: string, endDate: string): string {
  const opts: Intl.DateTimeFormatOptions = { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' };
  const s = new Date(startDate + 'T00:00:00Z').toLocaleDateString('en-US', opts);
  const e = new Date(endDate   + 'T00:00:00Z').toLocaleDateString('en-US', opts);
  return `${s} – ${e}`;
}

// ── Sub-components ─────────────────────────────────────────────────────────────

interface FieldInputProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  className?: string;
  highlight?: boolean;
}

function FieldInput({ label, value, onChange, type = 'text', placeholder, className = '', highlight }: FieldInputProps) {
  return (
    <div className={className}>
      <label className={`block text-[10px] font-bold uppercase mb-1 tracking-wide ${highlight ? 'text-emerald-700' : 'text-slate-400'}`}>
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full rounded border px-2.5 py-1.5 text-[12px] outline-none focus:ring-1 transition-colors ${
          highlight
            ? 'border-emerald-200 bg-emerald-50 focus:ring-emerald-400'
            : 'border-slate-200 bg-white focus:ring-blue-300'
        }`}
      />
    </div>
  );
}

function BodyArea({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">{label}</label>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        rows={4}
        placeholder="Click 'Generate with AI' above, or type directly…"
        className="w-full rounded border border-slate-200 bg-white px-2.5 py-1.5 text-[12px] text-slate-700 resize-none outline-none focus:ring-1 focus:ring-blue-300 placeholder:text-slate-300"
      />
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

interface DraftLetterModalProps {
  plan: Plan;
  addr: DrivewayAddress;
  appConfig: AppConfig;
  allLetters: DrivewayLetter[];
  currentUser: User;
  onClose: () => void;
  onCreated: () => void;
}

export function DraftLetterModal({
  plan, addr, appConfig, allLetters, currentUser, onClose, onCreated,
}: DraftLetterModalProps) {
  const win = plan.implementationWindow;

  // Driveway letter pre-fill takes priority; fall back to PHE fields for legacy configs
  const [fields, setFields] = useState<DrivewayNoticeFields>({
    letterDate:            new Date().toISOString().split('T')[0],
    drivewayImpactAddress: addr.address,
    recipientAddress:      addr.address,
    recipientName:         addr.ownerName || '',
    street1:               plan.street1   || '',
    street2:               plan.street2   || '',
    segment:               plan.segment   || '',
    workDates:             win ? formatWindowDates(win.startDate, win.endDate) : '',
    workHoursDescription:  appConfig.driveway_defaultWorkHours || '',
    projectName:           appConfig.driveway_projectName  || plan.loc || plan.id,
    businessName:          appConfig.driveway_businessName || appConfig.phe_businessName || '',
    contactName:           appConfig.driveway_contactName  || appConfig.phe_contactName  || '',
    contactTitle:          appConfig.driveway_contactTitle || appConfig.phe_contactTitle || '',
    contactPhone:          appConfig.driveway_contactPhone || appConfig.phe_contactPhone || '',
    contactEmail:          appConfig.driveway_contactEmail || appConfig.phe_contactEmail || '',
    bodyParagraph:         '',
    bodyParagraphEs:       '',
    remainingDrivewayOpen: false,
  });

  const [generating, setGenerating] = useState(false);
  const [saving,     setSaving]     = useState(false);

  const set = (k: keyof DrivewayNoticeFields, v: string | boolean) =>
    setFields(prev => ({ ...prev, [k]: v }));

  // ── Generate body via AI ──────────────────────────────────────────────────

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const corpus = pickCorpusExamples(allLetters, fields.segment, 3);
      const result = await generateNoticeContent(fields, corpus);
      setFields(prev => ({
        ...prev,
        bodyParagraph:   result.bodyParagraph,
        bodyParagraphEs: result.bodyParagraphEs,
      }));
      showToast('Body text generated — review before saving.', 'success');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'AI generation failed.';
      showToast(msg, 'error');
    } finally {
      setGenerating(false);
    }
  };

  // ── Save draft ────────────────────────────────────────────────────────────

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveDrivewayLetterDraft({
        planId:    plan.id,
        planLoc:   plan.loc || plan.id,
        addressId: addr.id,
        address:   addr.address,
        ownerName: addr.ownerName,
        propertyId: addr.propertyId,
        segment:   fields.segment || plan.segment,
        status:    'draft',
        source:    'drafted',
        fields,
        createdAt: new Date().toISOString(),
        createdBy: currentUser.email || currentUser.name || 'Unknown',
      });
      showToast('Draft letter created — find it in Library → All Letters.', 'success');
      onCreated();
      onClose();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to save draft.';
      showToast(msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 p-5 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl flex flex-col max-h-[92vh]">

        {/* ── Header ── */}
        <div className="px-6 pt-5 pb-4 border-b border-slate-100 flex items-start justify-between flex-shrink-0">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Wand2 size={16} className="text-blue-500" />
              Draft Driveway Notice
            </h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {plan.id} · <span className="font-semibold text-slate-700">{addr.address}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 -mr-1 -mt-1 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* Info banner */}
          <div className="flex items-start gap-2.5 rounded-lg bg-blue-50 border border-blue-100 px-3 py-2.5">
            <span className="text-blue-500 text-[12px] mt-0.5 flex-shrink-0">ℹ</span>
            <p className="text-[11px] text-blue-700 leading-relaxed">
              Fields are pre-filled from the plan card and your configured contractor details.
              Review them, then click <strong>Generate with AI</strong> — it'll write the notice body
              using these details and past approved letters for this segment as style examples.
            </p>
          </div>

          {/* Letter & address fields */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            <FieldInput label="Letter Date" value={fields.letterDate} type="date" onChange={v => set('letterDate', v)} />
            <FieldInput label="Segment" value={fields.segment} onChange={v => set('segment', v)} placeholder="e.g. B2" />

            <FieldInput
              label="Impacted Driveway Address"
              value={fields.drivewayImpactAddress ?? ''}
              onChange={v => set('drivewayImpactAddress', v)}
              className="col-span-2"
              highlight
            />
            <FieldInput
              label="Mailing / Recipient Address"
              value={fields.recipientAddress}
              onChange={v => set('recipientAddress', v)}
              className="col-span-2"
            />
            <FieldInput
              label="Recipient Name"
              value={fields.recipientName}
              onChange={v => set('recipientName', v)}
              placeholder="Resident/Business Owner"
            />
            <FieldInput
              label="Work Dates"
              value={fields.workDates}
              onChange={v => set('workDates', v)}
              placeholder="e.g. April 1 – June 30, 2025"
            />
            <FieldInput
              label="Work Hours Description"
              value={fields.workHoursDescription}
              onChange={v => set('workHoursDescription', v)}
              placeholder="e.g. 9:00 PM to 6:00 AM, Mon–Fri"
              className="col-span-2"
            />
            <FieldInput label="Project Name / LOC #" value={fields.projectName} onChange={v => set('projectName', v)} />
            <FieldInput label="Work Location (Street 1)" value={fields.street1} onChange={v => set('street1', v)} />
            <FieldInput label="Cross Street (Street 2)" value={fields.street2} onChange={v => set('street2', v)} placeholder="optional" />
          </div>

          {/* Contractor & contact */}
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-2.5">Contractor &amp; Contact</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <FieldInput
                label="Business / Company Name"
                value={fields.businessName}
                onChange={v => set('businessName', v)}
                className="col-span-2"
              />
              <FieldInput label="Contact Name"  value={fields.contactName}  onChange={v => set('contactName', v)} />
              <FieldInput label="Contact Title" value={fields.contactTitle} onChange={v => set('contactTitle', v)} />
              <FieldInput label="Phone"         value={fields.contactPhone} onChange={v => set('contactPhone', v)} />
              <FieldInput label="Email"         value={fields.contactEmail} onChange={v => set('contactEmail', v)} />
            </div>
          </div>

          {/* Special condition */}
          <div className="flex items-center gap-2.5">
            <input
              type="checkbox"
              id="remainingOpen"
              checked={!!fields.remainingDrivewayOpen}
              onChange={e => set('remainingDrivewayOpen', e.target.checked)}
              className="w-3.5 h-3.5 rounded accent-emerald-600 cursor-pointer"
            />
            <label htmlFor="remainingOpen" className="text-[12px] text-slate-600 cursor-pointer select-none">
              One driveway remains open (shows green marker in Exhibit 1)
            </label>
          </div>

          {/* AI body generation */}
          <div className="border-t border-slate-100 pt-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[12px] font-bold text-slate-700">Notice Body Text</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  AI writes the English and Spanish paragraphs using the fields above
                  {fields.segment ? ` + past approved letters for segment ${fields.segment}` : ''}.
                  Edit freely after generation.
                </p>
              </div>
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 text-white text-[11px] font-bold hover:bg-blue-700 disabled:opacity-50 transition-colors flex-shrink-0"
              >
                {generating
                  ? <Loader2 size={12} className="animate-spin" />
                  : <Wand2 size={12} />}
                {generating ? 'Generating…' : 'Generate with AI'}
              </button>
            </div>
            <BodyArea label="English Body" value={fields.bodyParagraph} onChange={v => set('bodyParagraph', v)} />
            <BodyArea label="Spanish Body (Español)" value={fields.bodyParagraphEs} onChange={v => set('bodyParagraphEs', v)} />
          </div>

        </div>

        {/* ── Footer ── */}
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between flex-shrink-0">
          <p className="text-[10px] text-slate-400">Draft will appear in Library → Properties → All Letters</p>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-[12px] font-semibold text-slate-500 bg-slate-100 hover:bg-slate-200 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-[12px] font-bold hover:bg-emerald-700 disabled:opacity-50 transition-colors"
            >
              {saving ? <Loader2 size={12} className="animate-spin" /> : <FileText size={12} />}
              {saving ? 'Saving…' : 'Save as Draft'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
