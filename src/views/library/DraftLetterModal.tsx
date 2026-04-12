import { useState, useRef } from 'react';
import { Wand2, X, Loader2, FileText, MapPin, Upload, ImageIcon } from 'lucide-react';
import { Plan, AppConfig, DrivewayAddress, DrivewayLetter, User, WorkHours } from '../../types';
import { DrivewayNoticeFields, generateNoticeContent } from '../../services/drivewayNoticeService';
import { saveDrivewayLetterDraft, pickCorpusExamples } from '../../services/drivewayLetterService';
import { showToast } from '../../lib/toast';
import { storage } from '../../firebase';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatWindowDates(startDate: string, endDate: string): string {
  const opts: Intl.DateTimeFormatOptions = { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' };
  const s = new Date(startDate + 'T00:00:00Z').toLocaleDateString('en-US', opts);
  const e = new Date(endDate   + 'T00:00:00Z').toLocaleDateString('en-US', opts);
  return `${s} – ${e}`;
}

/**
 * Derives a human-readable work hours description from a plan's structured WorkHours data.
 * Used as a fallback when appConfig.driveway_defaultWorkHours is not configured.
 *
 * Uses the same field-reading logic as HoursOfWorkDisplay.tsx so the output matches
 * what is actually stored in the plan.
 *
 * Examples:
 *   "nighttime hours (9:00 PM to 6:00 AM), Monday through Friday"
 *   "daytime (7:00 AM to 3:30 PM) and nighttime (9:00 PM to 6:00 AM), Monday through Saturday"
 *   "weekdays: daytime (7:00 AM to 3:30 PM) and nighttime (9:00 PM to 6:00 AM); Saturdays: daytime (8:00 AM to 5:00 PM)"
 */
function formatWorkHoursFromPlan(wh: WorkHours): string {
  const fmt12 = (t?: string): string => {
    if (!t) return '';
    const [h, m] = t.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${h12}:${String(m).padStart(2, '0')} ${period}`;
  };

  const fmtDays = (): string => {
    const s = new Set(wh.days ?? []);
    if (s.has('weekday') && s.has('saturday') && s.has('sunday')) return 'Monday through Sunday';
    if (s.has('weekday') && s.has('saturday')) return 'Monday through Saturday';
    if (s.has('weekday')) return 'Monday through Friday';
    if (s.has('saturday') && s.has('sunday')) return 'Saturdays and Sundays';
    if (s.has('saturday')) return 'Saturdays';
    if (s.has('sunday')) return 'Sundays';
    return '';
  };

  const days = fmtDays();
  // Combine a shift label with the day range, avoiding leading/trailing commas
  const join = (label: string) => label && days ? `${label}, ${days}` : label || days;

  if (wh.shift === 'continuous') return join('24-hour continuous operations');

  if (wh.shift === 'nighttime') {
    const s = fmt12(wh.weekday_start || wh.night_start);
    const e = fmt12(wh.weekday_end   || wh.night_end);
    return join(`nighttime hours${s && e ? ` (${s} to ${e})` : ''}`);
  }

  if (wh.shift === 'daytime') {
    const s = fmt12(wh.weekday_start || wh.day_start);
    const e = fmt12(wh.weekday_end   || wh.day_end);
    return join(`daytime hours${s && e ? ` (${s} to ${e})` : ''}`);
  }

  if (wh.shift === 'both' || wh.shift === 'mixed') {
    // Mirrors HoursOfWorkDisplay per-day rendering logic:
    // each active day may have its own shift type and independent time fields.
    const DAY_ORDER_LOCAL = ['weekday', 'saturday', 'sunday'] as const;
    const DAY_LABELS_LOCAL: Record<string, string> = {
      weekday: 'weekdays',
      saturday: 'Saturdays',
      sunday: 'Sundays',
    };

    const activeDays = DAY_ORDER_LOCAL.filter(d => (wh.days ?? []).includes(d));

    const perDayParts = activeDays.map(day => {
      const isWeekday = day === 'weekday';
      const wha = wh as any;

      // Per-day shift type (falls back to 'both' for uniform mixed configs)
      const rawDayShift = wha[`${day}_shift`];
      const dayShift: 'daytime' | 'nighttime' | 'both' =
        rawDayShift === 'daytime' || rawDayShift === 'nighttime' || rawDayShift === 'both'
          ? rawDayShift
          : 'both';

      // Time fields — mirrors HoursOfWorkDisplay field mapping exactly
      const dayStart   = isWeekday ? (wh.day_start   ?? wh.weekday_start) : wha[`${day}_day_start`];
      const dayEnd     = isWeekday ? (wh.day_end     ?? wh.weekday_end)   : wha[`${day}_day_end`];
      const nightStart = isWeekday ? wh.night_start  : wha[`${day}_night_start`];
      const nightEnd   = isWeekday ? wh.night_end    : wha[`${day}_night_end`];
      const singleStart = wha[`${day}_start`] as string | undefined;
      const singleEnd   = wha[`${day}_end`]   as string | undefined;

      let label: string;
      if (dayShift === 'both') {
        const timeParts: string[] = [];
        const ds = fmt12(dayStart),   de = fmt12(dayEnd);
        const ns = fmt12(nightStart), ne = fmt12(nightEnd);
        if (ds && de) timeParts.push(`daytime (${ds} to ${de})`);
        if (ns && ne) timeParts.push(`nighttime (${ns} to ${ne})`);
        label = timeParts.length ? timeParts.join(' and ') : 'daytime and nighttime hours';
      } else if (dayShift === 'daytime') {
        const ss = fmt12(singleStart), se = fmt12(singleEnd);
        label = `daytime hours${ss && se ? ` (${ss} to ${se})` : ''}`;
      } else {
        const ss = fmt12(singleStart), se = fmt12(singleEnd);
        label = `nighttime hours${ss && se ? ` (${ss} to ${se})` : ''}`;
      }

      // When only one day group is active, use the normal join (appends ", Mon–Sat" etc.)
      // When multiple day groups have different configs, prefix each with its day label
      return activeDays.length > 1 ? `${DAY_LABELS_LOCAL[day]}: ${label}` : label;
    });

    if (activeDays.length <= 1) {
      return join(perDayParts[0] ?? 'daytime and nighttime hours');
    }
    // Multiple day groups — separate with '; '  (day range already embedded per-group)
    return perDayParts.join('; ');
  }

  return days;
}

/**
 * Builds the initial pre-fill values for the draft letter modal.
 *
 * Priority chains (first truthy value wins):
 *
 *  workDates
 *    1. Confirmed implementationWindow
 *    2. Soft (estimated) implementationWindow
 *    3. Derived from needByDate + planDurationDays
 *    4. Prior letter's workDates (re-notice flow)
 *    5. '' (user fills in manually)
 *
 *  workHoursDescription
 *    1. appConfig.driveway_defaultWorkHours (admin-configured global default)
 *    2. Derived from plan.work_hours (structured data → readable string)
 *    3. Prior letter's workHoursDescription (re-notice flow)
 *    4. '' (user fills in manually)
 *
 *  bodyParagraph / bodyParagraphEs
 *    1. Prior letter's body (re-notice flow — user reviews/edits before saving)
 *    2. '' (generate with AI or type manually)
 *
 *  projectName
 *    1. appConfig.driveway_projectName
 *    2. plan.loc (LOC number)
 *    3. plan.id (Firestore document key — last resort)
 *
 *  Contractor fields (businessName, contactName, etc.)
 *    1. appConfig.driveway_* (driveway-specific config)
 *    2. appConfig.phe_* (legacy PHE config — backward compatibility)
 *    3. ''
 */
function buildInitialFields(
  plan: Plan,
  addr: DrivewayAddress,
  appConfig: AppConfig,
  parentLetter?: DrivewayLetter,
): DrivewayNoticeFields {
  // Resolve implementation window date range from the best available source
  const win: { startDate: string; endDate: string } | null =
    plan.implementationWindow ??
    plan.softImplementationWindow ??
    (plan.needByDate && plan.planDurationDays
      ? (() => {
          const end = new Date(plan.needByDate + 'T00:00:00');
          end.setDate(end.getDate() + plan.planDurationDays!);
          return { startDate: plan.needByDate, endDate: end.toISOString().split('T')[0] };
        })()
      : null);

  return {
    letterDate:            new Date().toISOString().split('T')[0],
    drivewayImpactAddress: addr.address,
    recipientAddress:      addr.address,
    recipientName:         addr.ownerName || '',
    street1:               plan.street1   || '',
    street2:               plan.street2   || '',
    segment:               plan.segment   || '',

    workDates: win
      ? formatWindowDates(win.startDate, win.endDate)
      : (parentLetter?.fields?.workDates ?? ''),

    workHoursDescription:
      appConfig.driveway_defaultWorkHours ||
      (plan.work_hours ? formatWorkHoursFromPlan(plan.work_hours) : '') ||
      (parentLetter?.fields?.workHoursDescription ?? ''),

    projectName:  appConfig.driveway_projectName  || plan.loc || plan.id,
    businessName: appConfig.driveway_businessName || appConfig.phe_businessName || '',
    contactName:  appConfig.driveway_contactName  || appConfig.phe_contactName  || '',
    contactTitle: appConfig.driveway_contactTitle || appConfig.phe_contactTitle || '',
    contactPhone: appConfig.driveway_contactPhone || appConfig.phe_contactPhone || '',
    contactEmail: appConfig.driveway_contactEmail || appConfig.phe_contactEmail || '',

    // Body is pre-filled from prior letter in re-notice flow; otherwise blank → use AI
    bodyParagraph:         parentLetter?.fields?.bodyParagraph   ?? '',
    bodyParagraphEs:       parentLetter?.fields?.bodyParagraphEs ?? '',
    remainingDrivewayOpen: false,
  };
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
  parentLetter?: DrivewayLetter;  // Prior sent/approved letter to pre-fill body from (renewal flow)
  onClose: () => void;
  onCreated: () => void;
}

export function DraftLetterModal({
  plan, addr, appConfig, allLetters, currentUser, parentLetter, onClose, onCreated,
}: DraftLetterModalProps) {
  // All pre-fill priority logic lives in buildInitialFields above
  const [fields, setFields] = useState<DrivewayNoticeFields>(
    () => buildInitialFields(plan, addr, appConfig, parentLetter),
  );

  const [generating,      setGenerating]      = useState(false);
  const [saving,          setSaving]          = useState(false);
  const [exhibitFile,     setExhibitFile]     = useState<File | null>(null);
  const [exhibitPreview,  setExhibitPreview]  = useState<string | null>(
    // Pre-fill from prior letter if re-notice
    parentLetter?.exhibitImageUrl ?? null,
  );
  const [dragOver,        setDragOver]        = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const set = (k: keyof DrivewayNoticeFields, v: string | boolean) =>
    setFields(prev => ({ ...prev, [k]: v }));

  const handleExhibitFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      showToast('Please upload an image file (PNG, JPG, etc.).', 'error');
      return;
    }
    setExhibitFile(file);
    setExhibitPreview(URL.createObjectURL(file));
  };

  // Build a Google Maps link that opens satellite view zoomed tight on the address.
  // t=k → satellite layer, z=20 → maximum useful zoom for property-level detail
  const mapsUrl = fields.drivewayImpactAddress
    ? `https://maps.google.com/maps?q=${encodeURIComponent(fields.drivewayImpactAddress)}&t=k&z=20`
    : 'https://maps.google.com';

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
      // Upload exhibit photo to Storage if a new file was selected
      let exhibitImageUrl: string | undefined = parentLetter?.exhibitImageUrl;
      if (exhibitFile) {
        const path = `driveway-letters/${plan.id}/${addr.id}_exhibit_${Date.now()}.${exhibitFile.name.split('.').pop()}`;
        const snap = await uploadBytes(storageRef(storage, path), exhibitFile);
        exhibitImageUrl = await getDownloadURL(snap.ref);
      }

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
        ...(parentLetter    ? { parentLetterId:  parentLetter.id } : {}),
        ...(exhibitImageUrl ? { exhibitImageUrl }                  : {}),
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
              {plan.loc || plan.id} · <span className="font-semibold text-slate-700">{addr.address}</span>
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

          {/* Re-notice banner — shown when building on a prior letter */}
          {parentLetter && (
            <div className="flex items-start gap-2.5 rounded-lg bg-teal-50 border border-teal-100 px-3 py-2.5">
              <span className="text-teal-500 text-[12px] mt-0.5 flex-shrink-0">↻</span>
              <p className="text-[11px] text-teal-700 leading-relaxed">
                Body text pre-filled from the prior notice for <strong>{parentLetter.planLoc}</strong>
                {parentLetter.address ? ` · ${parentLetter.address}` : ''}.
                Update the work dates and review all fields, then save or re-generate with AI.
              </p>
            </div>
          )}

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

          {/* ── Exhibit 1 Photo ── */}
          <div className="border-t border-slate-100 pt-4">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-[12px] font-bold text-slate-700">Exhibit 1 — Property Photo</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Aerial/satellite image showing the impacted driveway(s). Appears in the letter alongside the body text.
                </p>
              </div>
              <a
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 text-[11px] font-semibold hover:bg-blue-100 transition-colors flex-shrink-0"
              >
                <MapPin size={11} />
                Open in Google Maps
              </a>
            </div>

            {exhibitPreview ? (
              /* Preview with replace/remove controls */
              <div className="relative rounded-lg overflow-hidden border border-slate-200 bg-slate-50">
                <img
                  src={exhibitPreview}
                  alt="Exhibit 1 preview"
                  className="w-full max-h-56 object-cover"
                />
                <div className="absolute top-2 right-2 flex gap-1.5">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="px-2.5 py-1 rounded bg-white/90 text-[10px] font-bold text-slate-700 shadow hover:bg-white transition-colors"
                  >
                    Replace
                  </button>
                  <button
                    onClick={() => { setExhibitFile(null); setExhibitPreview(null); }}
                    className="px-2.5 py-1 rounded bg-white/90 text-[10px] font-bold text-red-600 shadow hover:bg-white transition-colors"
                  >
                    Remove
                  </button>
                </div>
                {exhibitFile && (
                  <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-emerald-600/90 text-white text-[9px] font-bold">
                    New — will upload on save
                  </div>
                )}
              </div>
            ) : (
              /* Drop zone */
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => {
                  e.preventDefault();
                  setDragOver(false);
                  const file = e.dataTransfer.files[0];
                  if (file) handleExhibitFile(file);
                }}
                onClick={() => fileInputRef.current?.click()}
                className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed py-6 cursor-pointer transition-colors ${
                  dragOver
                    ? 'border-blue-400 bg-blue-50'
                    : 'border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-slate-100'
                }`}
              >
                {dragOver
                  ? <Upload size={20} className="text-blue-500" />
                  : <ImageIcon size={20} className="text-slate-300" />
                }
                <p className="text-[11px] text-slate-500 text-center">
                  <span className="font-semibold text-slate-700">Click to upload</span> or drag &amp; drop<br />
                  <span className="text-slate-400">Screenshot from Google Maps, Google Earth, etc.</span>
                </p>
              </div>
            )}

            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={e => {
                const file = e.target.files?.[0];
                if (file) handleExhibitFile(file);
                e.target.value = '';
              }}
            />
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
