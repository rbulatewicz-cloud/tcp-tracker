import React from 'react';
import { CheckCircle } from 'lucide-react';

/**
 * Small pill shown on VarianceCards and the Review/By-Variance tabs
 * indicating whether a single match signal fired for a (plan, variance) pair.
 *
 * Active = emerald pill with a check icon. Inactive = faded slate pill
 * with the signal's own icon (MapPin, Tag, Calendar, Clock, etc.) passed in
 * by the caller so each signal's identity is recognizable at a glance.
 */
export function SignalBadge({
  active,
  label,
  icon,
}: {
  active: boolean;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border ${
        active
          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
          : 'bg-slate-50 text-slate-400 border-slate-200 opacity-50'
      }`}
    >
      {active ? <CheckCircle size={9} /> : icon}
      {label}
    </span>
  );
}
