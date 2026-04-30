import React from 'react';
import type { TansatStatus, TansatActivity } from '../../../types';

// ── Status colors ────────────────────────────────────────────────────────────
// Mirrors the conventions in complianceShared.tsx but adds the wider TANSAT
// state machine. See docs/specs/tansat.md §4 for the full lifecycle.
export const TANSAT_STATUS_COLORS: Record<TansatStatus, string> = {
  draft:            'bg-slate-100 text-slate-600',
  packet_ready:     'bg-blue-100 text-blue-700',
  emailed:          'bg-amber-100 text-amber-700',
  invoice_received: 'bg-violet-100 text-violet-700',
  paid:             'bg-emerald-100 text-emerald-700',
  posted:           'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  active:           'bg-emerald-100 text-emerald-800',
  closed:           'bg-slate-100 text-slate-500',
  cancelled:        'bg-red-50 text-red-600 line-through',
  revised:          'bg-blue-50 text-blue-700',
  expired:          'bg-red-100 text-red-700',
};

export const TANSAT_STATUS_LABELS: Record<TansatStatus, string> = {
  draft:            'Draft',
  packet_ready:     'Packet ready',
  emailed:          'Emailed',
  invoice_received: 'Invoice received',
  paid:             'Paid',
  posted:           'Posted',
  active:           'Active',
  closed:           'Closed',
  cancelled:        'Cancelled',
  revised:          'Revised',
  expired:          'Expired',
};

export function TansatStatusPill({ status }: { status: TansatStatus }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap ${TANSAT_STATUS_COLORS[status]}`}>
      {TANSAT_STATUS_LABELS[status]}
    </span>
  );
}

// ── Activity labels (display) ────────────────────────────────────────────────
export const ACTIVITY_LABELS: Record<TansatActivity, string> = {
  potholing:           'Potholing',
  paving:              'Paving',
  paving_restoration:  'Paving / Restoration',
  restoration:         'Restoration',
  conduit_work:        'Conduit Work',
  asbestos_pipe:       'Asbestos Pipe',
  sawcutting:          'Sawcutting',
  vault_conduit:       'Vault / Conduit',
  krail_delivery:      'Krail Delivery',
  krail_implementation:'Krail Implementation',
  pile_installation:   'Pile Installation',
  demo:                'Demo',
  building_demo:       'Building Demo',
  implementation:      'Implementation',
  utility_support:     'Utility Support',
  median_removal:      'Median Removal',
  tree_planting:       'Tree Planting',
  tree_removal:        'Tree Removal',
  temp_street_light:   'Temp Street Light',
  inside_out:          'Inside Out',
  other:               'Other',
};

// ── Currency formatter (lightweight; matches existing $ formatting) ─────────
export function fmtMoney(n: number | null | undefined): string {
  if (n == null) return '—';
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

// ── Phase chip ──────────────────────────────────────────────────────────────
// Compact pill used to render `phaseNumbers: [1, 3, 4]` on a request row.
export function PhaseChips({ numbers }: { numbers: number[] }) {
  if (!numbers?.length) return <span className="text-slate-400 italic text-[10px]">no phases</span>;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {numbers.map(n => (
        <span key={n} className="bg-blue-100 text-blue-700 text-[10px] font-bold px-1.5 py-0.5 rounded">
          P{n}
        </span>
      ))}
    </span>
  );
}
