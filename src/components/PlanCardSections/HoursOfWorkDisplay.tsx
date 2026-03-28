import React, { useState } from 'react';
import { WorkHours, WorkDay } from '../../types';
import { usePlanData, usePlanActions, usePlanPermissions } from '../PlanCardContext';
import { HoursOfWorkForm } from '../HoursOfWorkForm';

// ── helpers ──────────────────────────────────────────────────────────────────
function formatTime(t: string): string {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour  = h % 12 || 12;
  return `${hour}:${m.toString().padStart(2, '0')} ${ampm}`;
}

function spansOvernight(start?: string, end?: string): boolean {
  if (!start || !end) return false;
  return end < start;
}

const SHIFT_STYLES: Record<string, string> = {
  daytime:    'bg-green-50 border border-green-300 text-green-800',
  nighttime:  'bg-slate-800 text-slate-100',
  both:       'bg-blue-50 border border-blue-300 text-blue-800',
  continuous: 'bg-violet-600 text-white',
};

const SHIFT_LABELS: Record<string, string> = {
  daytime:    '☀️ Daytime',
  nighttime:  '🌙 Nighttime',
  both:       '⛅ Both',
  continuous: '⚡ 24/7 Continuous',
};

const DAY_LABELS: Record<WorkDay, string> = {
  weekday:  'Mon–Fri',
  saturday: 'Saturday',
  sunday:   'Sunday',
};

const DAY_ORDER: WorkDay[] = ['weekday', 'saturday', 'sunday'];

// ── component ─────────────────────────────────────────────────────────────────
export const HoursOfWorkDisplay: React.FC = React.memo(() => {
  const { selectedPlan } = usePlanData();
  const { updatePlanField } = usePlanActions();
  const { canEditFields } = usePlanPermissions();

  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState<WorkHours | undefined>(undefined);

  const wh: WorkHours | undefined = selectedPlan.work_hours;

  const startEdit = () => {
    setDraft(wh ? { ...wh } : undefined);
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setDraft(undefined);
  };

  const saveEdit = () => {
    if (draft) updatePlanField(selectedPlan.id, 'work_hours', draft);
    setEditing(false);
    setDraft(undefined);
  };

  // ── Edit mode ──────────────────────────────────────────────────────────────
  if (editing) {
    return (
      <div className="mt-4 space-y-4">
        <HoursOfWorkForm
          value={draft}
          onChange={setDraft}
        />
        <div className="flex gap-2">
          <button
            onClick={saveEdit}
            className="px-4 py-1.5 rounded-lg bg-slate-900 text-white text-[12px] font-bold hover:bg-slate-700 transition-colors"
          >
            Save
          </button>
          <button
            onClick={cancelEdit}
            className="px-4 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-[12px] font-semibold hover:bg-slate-200 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // ── Empty state ────────────────────────────────────────────────────────────
  if (!wh) {
    return (
      <div className="mt-4 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-center">
        <p className="text-[11px] text-slate-400">No hours of work specified.</p>
        {canEditFields && (
          <button
            onClick={startEdit}
            className="mt-1 text-[11px] font-semibold text-blue-600 hover:underline"
          >
            + Add hours
          </button>
        )}
      </div>
    );
  }

  const isContinuous = wh.shift === 'continuous';

  // ── Read-only display ──────────────────────────────────────────────────────
  return (
    <div className="mt-4 space-y-3">
      {/* Shift + day badges */}
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`px-2.5 py-1 rounded-md text-[11px] font-bold ${SHIFT_STYLES[wh.shift] ?? SHIFT_STYLES.daytime}`}
        >
          {SHIFT_LABELS[wh.shift] ?? wh.shift}
        </span>

        {!isContinuous && DAY_ORDER.filter(d => wh.days.includes(d)).map(d => (
          <span
            key={d}
            className="px-2 py-1 rounded-md text-[11px] font-semibold bg-slate-100 text-slate-600"
          >
            {DAY_LABELS[d]}
          </span>
        ))}

        {canEditFields && (
          <button
            onClick={startEdit}
            className="ml-auto text-[11px] font-semibold text-slate-400 hover:text-slate-700 transition-colors"
          >
            Edit
          </button>
        )}
      </div>

      {/* Time table */}
      {isContinuous ? (
        <div className="rounded-lg border border-violet-100 bg-violet-50 px-3 py-2">
          <p className="text-[11px] text-violet-700 font-medium">
            No time restriction — continuous operations apply.
          </p>
        </div>
      ) : wh.days.length > 0 ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 overflow-hidden">
          {DAY_ORDER.filter(d => wh.days.includes(d)).map((day, idx) => {
            const start = wh[`${day}_start` as keyof WorkHours] as string | undefined;
            const end   = wh[`${day}_end`   as keyof WorkHours] as string | undefined;
            const overnight = spansOvernight(start, end);
            return (
              <div
                key={day}
                className={`flex items-center gap-3 px-3 py-2 flex-wrap ${idx > 0 ? 'border-t border-slate-200' : ''}`}
              >
                <div className="w-20 text-[10px] font-bold text-slate-500 uppercase tracking-wide flex-shrink-0">
                  {DAY_LABELS[day]}
                </div>
                <div className="text-[12px] font-medium text-slate-800 flex items-center gap-2">
                  {start && end ? (
                    <>
                      {formatTime(start)} → {formatTime(end)}
                      {overnight && (
                        <span className="rounded bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                          Spans overnight
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-slate-400 italic text-[11px]">Times not set</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
});
