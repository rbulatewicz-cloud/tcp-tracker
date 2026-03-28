import React from 'react';
import { WorkHours, WorkShift, WorkDay } from '../types';

interface HoursOfWorkFormProps {
  value: WorkHours | undefined;
  onChange: (wh: WorkHours) => void;
}

const SHIFTS: { key: WorkShift; label: string }[] = [
  { key: 'daytime',    label: '☀️ Daytime' },
  { key: 'nighttime',  label: '🌙 Nighttime' },
  { key: 'both',       label: 'Both' },
  { key: 'continuous', label: '⚡ 24/7 Continuous' },
];

const DAYS: { key: WorkDay; label: string }[] = [
  { key: 'weekday',  label: 'Mon–Fri' },
  { key: 'saturday', label: 'Saturday' },
  { key: 'sunday',   label: 'Sunday' },
];

const DAY_LABELS: Record<WorkDay, string> = {
  weekday:  'Mon–Fri',
  saturday: 'Saturday',
  sunday:   'Sunday',
};

// Ordered for consistent display
const DAY_ORDER: WorkDay[] = ['weekday', 'saturday', 'sunday'];

function spansOvernight(start?: string, end?: string): boolean {
  if (!start || !end) return false;
  return end < start; // HH:MM string comparison works correctly
}

const DEFAULT_WH: WorkHours = { shift: 'daytime', days: ['weekday'] };

export const HoursOfWorkForm: React.FC<HoursOfWorkFormProps> = ({ value, onChange }) => {
  const wh = value ?? DEFAULT_WH;

  const update = (patch: Partial<WorkHours>) => onChange({ ...wh, ...patch });

  const toggleDay = (day: WorkDay) => {
    const next = wh.days.includes(day)
      ? wh.days.filter(d => d !== day)
      : [...wh.days, day];
    update({ days: next });
  };

  const setTime = (day: WorkDay, which: 'start' | 'end', time: string) => {
    update({ [`${day}_${which}`]: time });
  };

  const isContinuous = wh.shift === 'continuous';

  return (
    <div className="space-y-4">

      {/* Shift toggles */}
      <div>
        <div className="text-[11px] font-semibold text-slate-500 mb-2">Shift</div>
        <div className="flex flex-wrap gap-1.5">
          {SHIFTS.map(s => (
            <button
              key={s.key}
              type="button"
              onClick={() => update({ shift: s.key, ...(s.key === 'continuous' ? { days: [] } : {}) })}
              className={`px-3 py-1.5 rounded-md text-[12px] font-semibold border transition-all ${
                wh.shift === s.key
                  ? s.key === 'continuous'
                    ? 'border-violet-500 bg-violet-600 text-white'
                    : 'border-blue-500 bg-blue-600 text-white'
                  : 'border-slate-200 bg-white text-slate-500 hover:border-slate-400'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Continuous: no days/times needed */}
      {isContinuous ? (
        <div className="rounded-lg border border-violet-100 bg-violet-50 px-3 py-2.5">
          <p className="text-[11px] text-violet-700 font-medium">
            No time restriction — continuous operations apply.
          </p>
        </div>
      ) : (
        <>
          {/* Day toggles */}
          <div>
            <div className="text-[11px] font-semibold text-slate-500 mb-1">
              Days{' '}
              <span className="font-normal text-slate-400">— select all that apply</span>
            </div>
            <div className="flex gap-1.5">
              {DAYS.map(d => (
                <button
                  key={d.key}
                  type="button"
                  onClick={() => toggleDay(d.key)}
                  className={`px-3 py-1.5 rounded-md text-[12px] font-semibold border transition-all ${
                    wh.days.includes(d.key)
                      ? 'border-blue-500 bg-blue-600 text-white'
                      : 'border-slate-200 bg-white text-slate-500 hover:border-slate-400'
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          {/* Time rows — one per selected day, in a consistent order */}
          {wh.days.length > 0 && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 overflow-hidden">
              {DAY_ORDER.filter(d => wh.days.includes(d)).map((day, idx) => {
                const startKey = `${day}_start` as keyof WorkHours;
                const endKey   = `${day}_end`   as keyof WorkHours;
                const start = wh[startKey] as string | undefined;
                const end   = wh[endKey]   as string | undefined;
                const overnight = spansOvernight(start, end);
                return (
                  <div
                    key={day}
                    className={`flex items-center gap-3 px-3 py-2 flex-wrap ${idx > 0 ? 'border-t border-slate-200' : ''}`}
                  >
                    <div className="w-20 text-[10px] font-bold text-slate-500 uppercase tracking-wide flex-shrink-0">
                      {DAY_LABELS[day]}
                    </div>
                    <input
                      type="time"
                      value={start || ''}
                      onChange={e => setTime(day, 'start', e.target.value)}
                      className="rounded border border-slate-200 bg-white px-2 py-1 text-[12px] font-medium text-slate-900 focus:border-blue-400 outline-none"
                    />
                    <span className="text-[11px] text-slate-400">to</span>
                    <input
                      type="time"
                      value={end || ''}
                      onChange={e => setTime(day, 'end', e.target.value)}
                      className="rounded border border-slate-200 bg-white px-2 py-1 text-[12px] font-medium text-slate-900 focus:border-blue-400 outline-none"
                    />
                    {overnight && (
                      <span className="rounded bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                        Spans overnight
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
};
