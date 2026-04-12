import { ComplianceStatus } from '../../../types';
import { COMPLIANCE_STATUS_LABELS } from '../../../utils/compliance';

// ── Progress ring ─────────────────────────────────────────────────────────────

export function ProgressRing({ pct, size = 36 }: { pct: number; size?: number }) {
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

// ── Status color maps ─────────────────────────────────────────────────────────

export const STATUS_COLORS: Record<string, string> = {
  not_started:     'bg-slate-100 text-slate-500',
  in_progress:     'bg-blue-100 text-blue-700',
  linked_existing: 'bg-teal-100 text-teal-700',
  submitted:       'bg-amber-100 text-amber-700',
  approved:        'bg-emerald-100 text-emerald-700',
  expired:         'bg-red-100 text-red-700',
};

export const CD_STATUS_COLORS: Record<string, string> = {
  pending:           'bg-slate-100 text-slate-500',
  presentation_sent: 'bg-blue-100 text-blue-700',
  meeting_scheduled: 'bg-violet-100 text-violet-700',
  follow_up_sent:    'bg-amber-100 text-amber-700',
  concurred:         'bg-emerald-100 text-emerald-700',
  declined:          'bg-red-100 text-red-700',
  na:                'bg-slate-50 text-slate-400',
};

// ── Status badge ──────────────────────────────────────────────────────────────

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_COLORS[status] ?? STATUS_COLORS.not_started}`}>
      {COMPLIANCE_STATUS_LABELS[status] ?? status}
    </span>
  );
}

// ── Collapsible section header ────────────────────────────────────────────────

export function SectionHeader({
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
      <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
        <span className="text-[12px] font-bold text-slate-800">{title}</span>
        <StatusBadge status={status} />
        {progress && <ProgressRing pct={progress.pct} size={28} />}
      </div>
      {canEdit && (
        <select
          value={status}
          onChange={e => { e.stopPropagation(); onEditStatus(e.target.value as ComplianceStatus); }}
          onClick={e => e.stopPropagation()}
          className="text-[11px] border border-slate-200 rounded-md px-1.5 py-0.5 bg-white text-slate-600 outline-none focus:border-slate-400"
        >
          {(Object.keys(COMPLIANCE_STATUS_LABELS) as ComplianceStatus[]).map(s => (
            <option key={s} value={s}>{COMPLIANCE_STATUS_LABELS[s]}</option>
          ))}
        </select>
      )}
      <span className={`text-slate-400 text-xs transition-transform ${expanded ? 'rotate-180' : ''}`}>▾</span>
    </div>
  );
}
