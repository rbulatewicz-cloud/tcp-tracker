import { AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import type { VarianceExpiryStatus } from '../../../types';
import { SEGMENT_STREETS } from '../../../constants';

/** Human-readable label for a variance's `applicableHours` field. */
export const HOURS_LABEL: Record<string, string> = {
  nighttime: 'Nighttime',
  '24_7':    '24/7 Continuous',
  both:      'Nighttime + 24/7',
};

/** Tailwind pill classes keyed by `applicableHours` — matching colors to label context. */
export const HOURS_COLOR: Record<string, string> = {
  nighttime: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  '24_7':    'bg-violet-50 text-violet-700 border-violet-200',
  both:      'bg-purple-50 text-purple-700 border-purple-200',
};

/**
 * Pill summarizing how soon a variance expires. Reads a bucketed status from
 * the service layer (`expired | critical | warning | valid | unknown`).
 */
export function ExpiryBadge({ status, days }: { status: VarianceExpiryStatus; days: number | null }) {
  if (status === 'unknown')  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-500">Unknown expiry</span>;
  if (status === 'expired')  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-100 text-red-700"><XCircle size={10} /> Expired</span>;
  if (status === 'critical') return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-50 text-red-600"><AlertTriangle size={10} /> {days}d left</span>;
  if (status === 'warning')  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-600"><AlertTriangle size={10} /> {days}d left</span>;
  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700"><CheckCircle size={10} /> Valid</span>;
}

/**
 * Color-coded pill for a segment code (A1/A2/B1…C3). Hovers show the streets
 * in that segment as a tooltip. Unknown segments get a neutral fallback style.
 */
export function SegmentPill({ seg }: { seg: string }) {
  const colors: Record<string, string> = {
    A1: 'bg-blue-50 text-blue-700', A2: 'bg-blue-100 text-blue-800',
    B1: 'bg-amber-50 text-amber-700', B2: 'bg-amber-100 text-amber-800', B3: 'bg-amber-200 text-amber-900',
    C1: 'bg-emerald-50 text-emerald-700', C2: 'bg-emerald-100 text-emerald-800', C3: 'bg-emerald-200 text-emerald-900',
  };
  const streets = SEGMENT_STREETS[seg];
  const tooltip = streets ? streets.join(', ') : undefined;
  return (
    <span
      className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold cursor-default ${colors[seg] ?? 'bg-slate-100 text-slate-600'}`}
      title={tooltip}
    >
      {seg}
    </span>
  );
}
