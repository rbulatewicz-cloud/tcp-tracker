import React, { useRef, useState } from 'react';
import { Upload, FileText, X } from 'lucide-react';
import { PlanForm, DrivewayProperty, Plan } from '../types';
import { detectComplianceTriggers } from '../utils/compliance';

interface ComplianceBannerProps {
  form: PlanForm;
  onJustificationChange: (val: string) => void;
  properties?: DrivewayProperty[];
  plans?: Plan[];
  drivewayAddresses?: Array<{ address: string; propertyId?: string }>;
  onDrivewayAddressesChange?: (addrs: Array<{ address: string; propertyId?: string }>) => void;
  cdSlideFile?: File | null;
  onCdSlideChange?: (file: File | null) => void;
}

const TRACK_META = {
  phe: {
    icon: '🏛️',
    label: 'Peak Hour Exemption',
    agency: 'Bureau of Engineering (BOE)',
    color: 'amber',
  },
  noiseVariance: {
    icon: '🔊',
    label: 'Noise Variance',
    agency: 'Police Commission',
    color: 'violet',
  },
  cdConcurrence: {
    icon: '🏙️',
    label: 'CD Concurrence',
    agency: 'City Council Districts',
    color: 'blue',
  },
  drivewayNotices: {
    icon: '🚗',
    label: 'Driveway Impact Letters',
    agency: 'Community Relations',
    color: 'green',
  },
} as const;

const COLOR_CLASSES = {
  amber:  { pill: 'bg-amber-50 border-amber-200 text-amber-800',   dot: 'bg-amber-400' },
  violet: { pill: 'bg-violet-50 border-violet-200 text-violet-800', dot: 'bg-violet-400' },
  blue:   { pill: 'bg-blue-50 border-blue-200 text-blue-800',      dot: 'bg-blue-400' },
  green:  { pill: 'bg-green-50 border-green-200 text-green-800',   dot: 'bg-green-400' },
};

// ── Driveway address entry sub-component ──────────────────────────────────────

function DrivewayAddressEntry({
  addresses, properties, plans, form, onChange,
}: {
  addresses: Array<{ address: string; propertyId?: string }>;
  properties: DrivewayProperty[];
  plans: Plan[];
  form: PlanForm;
  onChange: (addrs: Array<{ address: string; propertyId?: string }>) => void;
}) {
  const [search, setSearch] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);

  const suggestions = properties.filter(p =>
    !addresses.some(a => a.propertyId === p.id) &&
    (search === '' || p.address.toLowerCase().includes(search.toLowerCase()))
  ).slice(0, 8);

  const addFromLibrary = (prop: DrivewayProperty) => {
    onChange([...addresses, { address: prop.address, propertyId: prop.id }]);
    setSearch('');
    setShowSuggestions(false);
  };

  const addManual = () => {
    const trimmed = search.trim();
    if (!trimmed) return;
    if (addresses.some(a => a.address.toLowerCase() === trimmed.toLowerCase())) return;
    onChange([...addresses, { address: trimmed }]);
    setSearch('');
    setShowSuggestions(false);
  };

  const remove = (idx: number) => onChange(addresses.filter((_, i) => i !== idx));

  // Conflict detection: check if an address appears on another plan with overlapping dates
  const getConflict = (addr: { address: string; propertyId?: string }) => {
    const startDate = form.needByDate ? new Date(form.needByDate + 'T00:00:00') : null;
    if (!startDate) return null;
    const endDate = form.planDurationDays
      ? new Date(startDate.getTime() + form.planDurationDays * 86400000)
      : startDate;

    for (const plan of plans) {
      const planAddrs = plan.compliance?.drivewayNotices?.addresses ?? [];
      if (!planAddrs.length) continue;

      const matches = planAddrs.some(pa =>
        (addr.propertyId && pa.propertyId === addr.propertyId) ||
        pa.address.toLowerCase() === addr.address.toLowerCase()
      );
      if (!matches) continue;

      const planStart = plan.needByDate ? new Date(plan.needByDate + 'T00:00:00') : null;
      if (!planStart) continue;
      const planEnd = plan.planDurationDays
        ? new Date(planStart.getTime() + plan.planDurationDays * 86400000)
        : planStart;

      // Date range overlap check
      if (startDate <= planEnd && planStart <= endDate) {
        const matchedAddr = planAddrs.find(pa =>
          (addr.propertyId && pa.propertyId === addr.propertyId) ||
          pa.address.toLowerCase() === addr.address.toLowerCase()
        );
        return { plan, letterStatus: matchedAddr?.letterStatus };
      }
    }
    return null;
  };

  return (
    <div className="rounded-lg border border-green-200 bg-white px-3 py-3 mt-2">
      <div className="text-[11px] font-bold text-slate-700 mb-2">
        Impacted Driveways
        <span className="ml-1 font-normal text-slate-400">— enter addresses that will be blocked</span>
      </div>

      {/* Search / type input */}
      <div className="relative">
        <input
          value={search}
          onChange={e => { setSearch(e.target.value); setShowSuggestions(true); }}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 160)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addManual(); } }}
          placeholder="Search property library or type address…"
          className="w-full rounded border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] outline-none focus:border-green-400 focus:bg-white pr-16"
        />
        {search.trim() && (
          <button
            onMouseDown={e => { e.preventDefault(); addManual(); }}
            className="absolute right-1.5 top-1 px-2 py-0.5 rounded text-[10px] font-bold bg-green-600 text-white hover:bg-green-700 transition-colors"
          >
            + Add
          </button>
        )}

        {/* Suggestions dropdown */}
        {showSuggestions && (suggestions.length > 0 || search.trim()) && (
          <div className="absolute z-50 top-full left-0 right-0 mt-1 rounded-lg border border-slate-200 bg-white shadow-lg max-h-48 overflow-y-auto">
            {suggestions.length > 0 && (
              <>
                <div className="px-2.5 py-1 text-[9px] font-bold uppercase tracking-wide text-slate-400 border-b border-slate-100">
                  Property Library
                </div>
                {suggestions.map(p => (
                  <button
                    key={p.id}
                    onMouseDown={() => addFromLibrary(p)}
                    className="w-full text-left px-2.5 py-1.5 hover:bg-green-50 transition-colors border-b border-slate-50 last:border-0"
                  >
                    <div className="text-[11px] font-semibold text-slate-700">{p.address}</div>
                    <div className="text-[10px] text-slate-400">
                      {p.ownerName || 'No owner on file'}
                      {p.segment ? ` · Seg ${p.segment}` : ''}
                    </div>
                  </button>
                ))}
              </>
            )}
            {search.trim() && !suggestions.some(p => p.address.toLowerCase() === search.trim().toLowerCase()) && (
              <button
                onMouseDown={e => { e.preventDefault(); addManual(); }}
                className="w-full text-left px-2.5 py-1.5 hover:bg-slate-50 transition-colors text-[11px] text-slate-500"
              >
                Add "<span className="font-semibold text-slate-700">{search.trim()}</span>" as new address
              </button>
            )}
          </div>
        )}
      </div>

      {/* Added addresses */}
      {addresses.length > 0 && (
        <div className="mt-2 space-y-1.5">
          {addresses.map((addr, idx) => {
            const conflict = getConflict(addr);
            return (
              <div key={idx}>
                <div className="flex items-center gap-2 rounded border border-slate-200 bg-slate-50 px-2.5 py-1.5">
                  {addr.propertyId && (
                    <span className="text-[9px] font-bold bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-full flex-shrink-0">
                      Library
                    </span>
                  )}
                  <span className="text-[11px] text-slate-700 flex-1 font-medium truncate">{addr.address}</span>
                  <button
                    onClick={() => remove(idx)}
                    className="text-slate-300 hover:text-red-400 transition-colors flex-shrink-0 text-[12px] leading-none"
                  >
                    ✕
                  </button>
                </div>
                {conflict && (
                  <div className="mt-0.5 ml-1 text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 leading-relaxed">
                    ⚠ Also impacted by{' '}
                    <span className="font-bold">{conflict.plan.loc}</span>
                    {conflict.plan.needByDate && (
                      <span>
                        {' '}· starts{' '}
                        {new Date(conflict.plan.needByDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                    )}
                    {conflict.letterStatus === 'sent' && ' · letter already sent'}
                    {conflict.letterStatus && conflict.letterStatus !== 'sent' && ` · letter ${conflict.letterStatus.replace(/_/g, ' ')}`}
                    . CR team will be notified.
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {addresses.length === 0 && (
        <p className="mt-2 text-[10px] text-slate-400 italic">
          No driveways added yet. CR team will be notified once submitted — adding addresses now helps them start immediately.
        </p>
      )}
    </div>
  );
}

// ── Main banner ───────────────────────────────────────────────────────────────

export const ComplianceBanner: React.FC<ComplianceBannerProps> = ({
  form,
  onJustificationChange,
  properties = [],
  plans = [],
  drivewayAddresses = [],
  onDrivewayAddressesChange,
  cdSlideFile,
  onCdSlideChange,
}) => {
  const cdSlideInputRef = useRef<HTMLInputElement>(null);
  const triggers = detectComplianceTriggers(form);

  const active = [
    triggers.phe              && 'phe',
    triggers.noiseVariance    && 'noiseVariance',
    triggers.cdConcurrence    && 'cdConcurrence',
    triggers.drivewayNotices  && 'drivewayNotices',
  ].filter(Boolean) as (keyof typeof TRACK_META)[];

  if (active.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5">
        <span className="text-emerald-500 text-base">✓</span>
        <span className="text-[11px] font-semibold text-emerald-700">
          No compliance tracks triggered by current selections.
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header banner */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
        <div className="text-[11px] font-bold text-amber-800 mb-2">
          ⚠️ This request will auto-generate {active.length} compliance track{active.length > 1 ? 's' : ''}:
        </div>
        <div className="flex flex-wrap gap-2">
          {active.map(key => {
            const meta = TRACK_META[key];
            const colors = COLOR_CLASSES[meta.color];
            return (
              <span
                key={key}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${colors.pill}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${colors.dot}`} />
                {meta.icon} {meta.label}
                <span className="font-normal opacity-70">→ {meta.agency}</span>
              </span>
            );
          })}
        </div>
        <p className="text-[10px] text-amber-600 mt-2">
          These tracks will be set up automatically in the plan card.
        </p>
      </div>

      {/* PHE justification */}
      {triggers.phe && (
        <div className="rounded-lg border border-amber-200 bg-white px-3 py-3">
          <label className="block text-[11px] font-bold text-slate-700 mb-1">
            Why is peak hour work required?{' '}
            <span className="text-amber-600 font-semibold">Required for BOE application</span>
          </label>
          <p className="text-[10px] text-slate-400 mb-2">
            Brief explanation of construction methodology — e.g. "Continuous concrete pour cannot be interrupted" or "Signal timing requires access during peak adjacent window."
          </p>
          <textarea
            value={form.phe_justification || ''}
            onChange={e => onJustificationChange(e.target.value)}
            rows={3}
            placeholder="Explain why peak hour work is operationally necessary..."
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] text-slate-800 outline-none focus:border-amber-400 resize-none"
          />
        </div>
      )}

      {/* CD slide upload */}
      {triggers.cdConcurrence && onCdSlideChange && (
        <div className="rounded-lg border border-blue-200 bg-white px-3 py-3">
          <div className="text-[11px] font-bold text-slate-700 mb-0.5">
            Council District Presentation Slide
            <span className="ml-1.5 font-normal text-slate-400">— optional, can upload from plan card later</span>
          </div>
          <p className="text-[10px] text-slate-400 mb-2">
            If you already have the CD PowerPoint ready, attach it now. Otherwise, skip and upload from the plan card.
          </p>
          {cdSlideFile ? (
            <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2">
              <FileText size={13} className="text-blue-600 flex-shrink-0" />
              <span className="text-[12px] font-semibold text-blue-700 flex-1 truncate">{cdSlideFile.name}</span>
              <button
                onClick={() => onCdSlideChange(null)}
                className="text-slate-400 hover:text-red-500 flex-shrink-0"
              >
                <X size={13} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => cdSlideInputRef.current?.click()}
              className="flex items-center gap-2 w-full rounded-lg border-2 border-dashed border-blue-200 bg-blue-50 px-3 py-2.5 text-[11px] font-semibold text-blue-600 hover:border-blue-400 hover:bg-blue-100 transition-colors"
            >
              <Upload size={13} />
              Attach CD slide (PPTX / PDF)
            </button>
          )}
          <input
            ref={cdSlideInputRef}
            type="file"
            accept=".ppt,.pptx,.pdf"
            className="hidden"
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) onCdSlideChange(f);
              e.target.value = '';
            }}
          />
        </div>
      )}

      {/* Driveway address entry */}
      {triggers.drivewayNotices && onDrivewayAddressesChange && (
        <DrivewayAddressEntry
          addresses={drivewayAddresses}
          properties={properties}
          plans={plans}
          form={form}
          onChange={onDrivewayAddressesChange}
        />
      )}
    </div>
  );
};
