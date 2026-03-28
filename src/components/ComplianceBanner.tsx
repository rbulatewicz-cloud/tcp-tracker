import React from 'react';
import { PlanForm } from '../types';
import { detectComplianceTriggers } from '../utils/compliance';

interface ComplianceBannerProps {
  form: PlanForm;
  /** Show the PHE justification textarea (only when PHE is triggered) */
  onJustificationChange: (val: string) => void;
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
} as const;

const COLOR_CLASSES = {
  amber:  { pill: 'bg-amber-50 border-amber-200 text-amber-800',  dot: 'bg-amber-400' },
  violet: { pill: 'bg-violet-50 border-violet-200 text-violet-800', dot: 'bg-violet-400' },
  blue:   { pill: 'bg-blue-50 border-blue-200 text-blue-800',    dot: 'bg-blue-400' },
};

export const ComplianceBanner: React.FC<ComplianceBannerProps> = ({
  form,
  onJustificationChange,
}) => {
  const triggers = detectComplianceTriggers(form);

  const active = [
    triggers.phe           && 'phe',
    triggers.noiseVariance && 'noiseVariance',
    triggers.cdConcurrence && 'cdConcurrence',
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
          These will be set up automatically in the plan card. Follow up with the MOT team after submission.
        </p>
      </div>

      {/* PHE justification — only shown when PHE is triggered */}
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
    </div>
  );
};
