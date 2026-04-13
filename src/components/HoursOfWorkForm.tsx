import React from 'react';
import { WorkHours, WorkDay, WorkShift } from '../types';
import { DAY_LABELS, DAY_ORDER } from '../constants';

type DayShift = 'daytime' | 'nighttime' | 'both';

interface HoursOfWorkFormProps {
  value: WorkHours | undefined;
  onChange: (wh: WorkHours) => void;
}

const DAYS: { key: WorkDay; label: string }[] = [
  { key: 'weekday',  label: 'Mon–Fri' },
  { key: 'saturday', label: 'Saturday' },
  { key: 'sunday',   label: 'Sunday' },
];

// ── Default times ──────────────────────────────────────────────────────────────
const DAYTIME_DEFAULTS: Record<WorkDay, { start: string; end: string }> = {
  weekday:  { start: '09:30', end: '15:00' },
  saturday: { start: '09:30', end: '15:00' },
  sunday:   { start: '09:30', end: '15:00' },
};
const NIGHTTIME_DEFAULTS: Record<WorkDay, { start: string; end: string }> = {
  weekday:  { start: '20:00', end: '06:00' },
  saturday: { start: '20:00', end: '06:00' },
  sunday:   { start: '20:00', end: '06:00' },
};
const BOTH_DAY_DEFAULT   = { start: '07:00', end: '16:00' };
const BOTH_NIGHT_DEFAULT = { start: '21:00', end: '06:00' };

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Get the effective per-day shift, falling back to global shift for backward compat */
function getEffectiveDayShift(wh: WorkHours, day: WorkDay): DayShift {
  const val = (wh as any)[`${day}_shift`];
  if (val === 'daytime' || val === 'nighttime' || val === 'both') return val;
  if (wh.shift === 'daytime' || wh.shift === 'nighttime' || wh.shift === 'both') return wh.shift;
  return 'daytime';
}

/** Compute the appropriate global shift from per-day configuration */
function computeGlobalShift(days: WorkDay[], getShift: (d: WorkDay) => DayShift): WorkShift {
  if (days.length === 0) return 'daytime';
  const shifts = days.map(getShift);
  if (shifts.every(s => s === 'daytime'))   return 'daytime';
  if (shifts.every(s => s === 'nighttime')) return 'nighttime';
  if (shifts.every(s => s === 'both'))      return 'both';
  return 'mixed';
}

/** Build default time fields for a day + shift (always uses defaults, clears old) */
function defaultFields(day: WorkDay, shift: DayShift): Partial<WorkHours> {
  if (shift === 'both') {
    if (day === 'weekday') {
      return {
        day_start:   BOTH_DAY_DEFAULT.start,
        day_end:     BOTH_DAY_DEFAULT.end,
        night_start: BOTH_NIGHT_DEFAULT.start,
        night_end:   BOTH_NIGHT_DEFAULT.end,
      };
    }
    return {
      [`${day}_day_start`]:   BOTH_DAY_DEFAULT.start,
      [`${day}_day_end`]:     BOTH_DAY_DEFAULT.end,
      [`${day}_night_start`]: BOTH_NIGHT_DEFAULT.start,
      [`${day}_night_end`]:   BOTH_NIGHT_DEFAULT.end,
    };
  }
  const src = shift === 'daytime' ? DAYTIME_DEFAULTS : NIGHTTIME_DEFAULTS;
  return {
    [`${day}_start`]: src[day].start,
    [`${day}_end`]:   src[day].end,
  };
}

/** Same as defaultFields but preserves existing values when present */
function defaultFieldsPreserving(day: WorkDay, shift: DayShift, wh: WorkHours): Partial<WorkHours> {
  const ex = wh as any;
  if (shift === 'both') {
    if (day === 'weekday') {
      return {
        day_start:   ex.day_start   ?? BOTH_DAY_DEFAULT.start,
        day_end:     ex.day_end     ?? BOTH_DAY_DEFAULT.end,
        night_start: ex.night_start ?? BOTH_NIGHT_DEFAULT.start,
        night_end:   ex.night_end   ?? BOTH_NIGHT_DEFAULT.end,
      };
    }
    return {
      [`${day}_day_start`]:   ex[`${day}_day_start`]   ?? BOTH_DAY_DEFAULT.start,
      [`${day}_day_end`]:     ex[`${day}_day_end`]     ?? BOTH_DAY_DEFAULT.end,
      [`${day}_night_start`]: ex[`${day}_night_start`] ?? BOTH_NIGHT_DEFAULT.start,
      [`${day}_night_end`]:   ex[`${day}_night_end`]   ?? BOTH_NIGHT_DEFAULT.end,
    };
  }
  const src = shift === 'daytime' ? DAYTIME_DEFAULTS : NIGHTTIME_DEFAULTS;
  return {
    [`${day}_start`]: ex[`${day}_start`] ?? src[day].start,
    [`${day}_end`]:   ex[`${day}_end`]   ?? src[day].end,
  };
}

// ── PHE indicator ──────────────────────────────────────────────────────────────
const PEAK_WINDOWS = [
  { start: '06:00', end: '09:00' },
  { start: '15:30', end: '19:00' },
];

function timeToMins(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function overlapsAnyPeak(start: string, end: string): boolean {
  const s = timeToMins(start);
  let e = timeToMins(end);
  if (e <= s) e += 24 * 60;
  for (const w of PEAK_WINDOWS) {
    const ws = timeToMins(w.start);
    const we = timeToMins(w.end);
    if (s < we && e > ws) return true;
  }
  return false;
}

function spansOvernight(start?: string, end?: string): boolean {
  if (!start || !end) return false;
  return end < start;
}

const DEFAULT_WH: WorkHours = {
  shift: 'daytime',
  days: ['weekday'],
  weekday_shift: 'daytime',
  weekday_start: '09:30',
  weekday_end: '15:00',
};

// ── Component ──────────────────────────────────────────────────────────────────
export const HoursOfWorkForm: React.FC<HoursOfWorkFormProps> = ({ value, onChange }) => {
  const wh = value ?? DEFAULT_WH;

  // Strip undefined values before emitting — Firestore rejects undefined fields
  const emit = (next: WorkHours | Partial<WorkHours>) => {
    const clean: Partial<WorkHours> = {};
    for (const [k, v] of Object.entries(next)) {
      if (v !== undefined) (clean as any)[k] = v;
    }
    onChange(clean as WorkHours);
  };

  const update = (patch: Partial<WorkHours>) => emit({ ...wh, ...patch });

  const isContinuous = wh.shift === 'continuous';

  // Toggle continuous — exclusive
  const toggleContinuous = () => {
    if (isContinuous) {
      emit(DEFAULT_WH);
    } else {
      emit({ shift: 'continuous', days: [] });
    }
  };

  // Toggle a day on/off
  const toggleDay = (day: WorkDay) => {
    if (isContinuous) return;
    const isActive = wh.days.includes(day);
    if (isActive) {
      const next = wh.days.filter(d => d !== day);
      // Clear all fields for this day
      const clear: Record<string, undefined> = {
        [`${day}_shift`]: undefined,
        [`${day}_start`]: undefined,
        [`${day}_end`]:   undefined,
      };
      if (day === 'weekday') {
        Object.assign(clear, { day_start: undefined, day_end: undefined, night_start: undefined, night_end: undefined });
      } else {
        Object.assign(clear, {
          [`${day}_day_start`]: undefined, [`${day}_day_end`]: undefined,
          [`${day}_night_start`]: undefined, [`${day}_night_end`]: undefined,
        });
      }
      const newWh = { ...wh, ...clear, days: next } as WorkHours;
      const newShift = computeGlobalShift(next, d => getEffectiveDayShift(newWh, d));
      emit({ ...newWh, shift: newShift });
    } else {
      const next = [...wh.days, day];
      // Default new day to the current global shift (or 'daytime' for mixed/continuous)
      const defaultShift: DayShift =
        wh.shift === 'daytime' || wh.shift === 'nighttime' || wh.shift === 'both'
          ? wh.shift
          : 'daytime';
      const timeFields = defaultFieldsPreserving(day, defaultShift, wh);
      const newWh = { ...wh, days: next, [`${day}_shift`]: defaultShift, ...timeFields } as WorkHours;
      const newShift = computeGlobalShift(next, d => getEffectiveDayShift(newWh, d));
      emit({ ...newWh, shift: newShift });
    }
  };

  // Change the shift type for a single day
  const setDayShift = (day: WorkDay, shift: DayShift) => {
    const timeFields = defaultFields(day, shift);
    const newWh = { ...wh, [`${day}_shift`]: shift, ...timeFields } as WorkHours;
    const newShift = computeGlobalShift(wh.days, d => getEffectiveDayShift(newWh, d));
    emit({ ...newWh, shift: newShift });
  };

  // "Apply to all selected days" shortcuts
  const applyAllDays = (shift: DayShift) => {
    let patch: Partial<WorkHours> = {};
    for (const day of wh.days) {
      patch = { ...patch, [`${day}_shift`]: shift, ...defaultFieldsPreserving(day, shift, wh) };
    }
    const newShift: WorkShift = shift; // all same → normalized
    emit({ ...wh, ...patch, shift: newShift } as WorkHours);
  };

  // ── Styles ──────────────────────────────────────────────────────────────────
  const btnBase = 'px-3 py-1.5 rounded-md text-[12px] font-semibold border transition-all';
  const btnActive = 'border-blue-500 bg-blue-600 text-white';
  const btnActiveViolet = 'border-violet-500 bg-violet-600 text-white';
  const btnInactive = 'border-slate-200 bg-white text-slate-500 hover:border-slate-400';

  const miniBtn = 'px-2 py-0.5 rounded text-[10px] font-bold border transition-all';
  const miniActiveDay   = 'border-green-500 bg-green-600 text-white';
  const miniActiveNight = 'border-slate-600 bg-slate-700 text-white';
  const miniActiveBoth  = 'border-blue-500 bg-blue-600 text-white';
  const miniInactive    = 'border-slate-200 bg-white text-slate-500 hover:border-slate-400';

  return (
    <div className="space-y-4">

      {/* ── Days + Continuous ─────────────────────────────────────────────── */}
      <div>
        <div className="text-[11px] font-semibold text-slate-500 mb-1">
          Days <span className="font-normal text-slate-400">— select all that apply</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {DAYS.map(d => (
            <button
              key={d.key}
              type="button"
              onClick={() => toggleDay(d.key)}
              disabled={isContinuous}
              className={`${btnBase} ${wh.days.includes(d.key) && !isContinuous ? btnActive : btnInactive} ${isContinuous ? 'opacity-40 cursor-not-allowed' : ''}`}
            >
              {d.label}
            </button>
          ))}
          <button
            type="button"
            onClick={toggleContinuous}
            className={`${btnBase} ${isContinuous ? btnActiveViolet : btnInactive} ml-2`}
          >
            ⚡ 24/7 Continuous
          </button>
        </div>
      </div>

      {/* ── Continuous notice ─────────────────────────────────────────────── */}
      {isContinuous ? (
        <div className="rounded-lg border border-violet-100 bg-violet-50 px-3 py-2.5">
          <p className="text-[11px] text-violet-700 font-medium">
            No time restriction — continuous operations apply.
          </p>
        </div>
      ) : wh.days.length === 0 ? (
        <div className="text-[11px] text-slate-400 italic">Select at least one day above.</div>
      ) : (
        <>
          {/* ── Apply-to-all shortcuts ──────────────────────────────────── */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Set all:</span>
            <button
              type="button"
              onClick={() => applyAllDays('daytime')}
              className="px-2.5 py-1 rounded-md text-[11px] font-semibold border border-green-200 text-green-700 bg-green-50 hover:bg-green-100 transition-colors"
            >
              ☀️ Daytime
            </button>
            <button
              type="button"
              onClick={() => applyAllDays('nighttime')}
              className="px-2.5 py-1 rounded-md text-[11px] font-semibold border border-slate-300 text-slate-600 bg-slate-50 hover:bg-slate-100 transition-colors"
            >
              🌙 Nighttime
            </button>
            <button
              type="button"
              onClick={() => applyAllDays('both')}
              className="px-2.5 py-1 rounded-md text-[11px] font-semibold border border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100 transition-colors"
            >
              ☀️+🌙 Both
            </button>
          </div>

          {/* ── Per-day sections ────────────────────────────────────────── */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 overflow-hidden">
            {DAY_ORDER.filter(d => wh.days.includes(d)).map((day, dayIdx) => {
              const dayShift = getEffectiveDayShift(wh, day);
              const isWeekday = day === 'weekday';

              // Time field values
              const singleStart = (wh as any)[`${day}_start`] as string | undefined;
              const singleEnd   = (wh as any)[`${day}_end`]   as string | undefined;
              const dayStart    = isWeekday ? wh.day_start   : (wh as any)[`${day}_day_start`];
              const dayEnd      = isWeekday ? wh.day_end     : (wh as any)[`${day}_day_end`];
              const nightStart  = isWeekday ? wh.night_start : (wh as any)[`${day}_night_start`];
              const nightEnd    = isWeekday ? wh.night_end   : (wh as any)[`${day}_night_end`];

              // Peak conflict indicators (weekday only — PHE is Mon–Fri)
              const singlePeak = isWeekday && singleStart && singleEnd && overlapsAnyPeak(singleStart, singleEnd);
              const dayPeak    = isWeekday && dayStart    && dayEnd    && overlapsAnyPeak(dayStart, dayEnd);
              const nightPeak  = isWeekday && nightStart  && nightEnd  && overlapsAnyPeak(nightStart, nightEnd);

              return (
                <div key={day} className={dayIdx > 0 ? 'border-t-2 border-slate-300' : ''}>

                  {/* Day header with per-day shift toggles */}
                  <div className="px-3 py-1.5 bg-slate-100 flex items-center justify-between gap-2">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide flex-shrink-0">
                      {DAY_LABELS[day]}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setDayShift(day, 'daytime')}
                        className={`${miniBtn} ${dayShift === 'daytime' ? miniActiveDay : miniInactive}`}
                        title="Daytime only"
                      >
                        ☀️ Day
                      </button>
                      <button
                        type="button"
                        onClick={() => setDayShift(day, 'nighttime')}
                        className={`${miniBtn} ${dayShift === 'nighttime' ? miniActiveNight : miniInactive}`}
                        title="Nighttime only"
                      >
                        🌙 Night
                      </button>
                      <button
                        type="button"
                        onClick={() => setDayShift(day, 'both')}
                        className={`${miniBtn} ${dayShift === 'both' ? miniActiveBoth : miniInactive}`}
                        title="Day & Night"
                      >
                        ☀️+🌙
                      </button>
                    </div>
                  </div>

                  {/* Time inputs */}
                  {dayShift === 'both' ? (
                    <>
                      {/* Daytime row */}
                      <div className="flex items-center gap-3 px-3 py-2 flex-wrap border-t border-slate-200">
                        <div className="w-20 text-[10px] font-bold text-green-600 uppercase tracking-wide flex-shrink-0">
                          Daytime
                        </div>
                        <input
                          type="time"
                          value={dayStart || ''}
                          onChange={e => update(isWeekday ? { day_start: e.target.value } : { [`${day}_day_start`]: e.target.value } as any)}
                          className="rounded border border-slate-200 bg-white px-2 py-1 text-[12px] font-medium text-slate-900 focus:border-blue-400 outline-none"
                        />
                        <span className="text-[11px] text-slate-400">to</span>
                        <input
                          type="time"
                          value={dayEnd || ''}
                          onChange={e => update(isWeekday ? { day_end: e.target.value } : { [`${day}_day_end`]: e.target.value } as any)}
                          className="rounded border border-slate-200 bg-white px-2 py-1 text-[12px] font-medium text-slate-900 focus:border-blue-400 outline-none"
                        />
                        {dayPeak && (
                          <span className="rounded bg-orange-100 px-2 py-0.5 text-[10px] font-bold text-orange-700">
                            ⚡ Overlaps peak — PHE required
                          </span>
                        )}
                      </div>
                      {/* Nighttime row */}
                      <div className="flex items-center gap-3 px-3 py-2 flex-wrap border-t border-slate-200">
                        <div className="w-20 text-[10px] font-bold text-slate-500 uppercase tracking-wide flex-shrink-0">
                          Nighttime
                        </div>
                        <input
                          type="time"
                          value={nightStart || ''}
                          onChange={e => update(isWeekday ? { night_start: e.target.value } : { [`${day}_night_start`]: e.target.value } as any)}
                          className="rounded border border-slate-200 bg-white px-2 py-1 text-[12px] font-medium text-slate-900 focus:border-blue-400 outline-none"
                        />
                        <span className="text-[11px] text-slate-400">to</span>
                        <input
                          type="time"
                          value={nightEnd || ''}
                          onChange={e => update(isWeekday ? { night_end: e.target.value } : { [`${day}_night_end`]: e.target.value } as any)}
                          className="rounded border border-slate-200 bg-white px-2 py-1 text-[12px] font-medium text-slate-900 focus:border-blue-400 outline-none"
                        />
                        <div className="flex items-center gap-1.5">
                          {spansOvernight(nightStart, nightEnd) && (
                            <span className="rounded bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                              Spans overnight
                            </span>
                          )}
                          {nightPeak && (
                            <span className="rounded bg-orange-100 px-2 py-0.5 text-[10px] font-bold text-orange-700">
                              ⚡ Overlaps peak — PHE required
                            </span>
                          )}
                        </div>
                      </div>
                    </>
                  ) : (
                    /* Single shift (daytime or nighttime) */
                    <div className="flex items-center gap-3 px-3 py-2 flex-wrap border-t border-slate-200">
                      <div className={`w-20 text-[10px] font-bold uppercase tracking-wide flex-shrink-0 ${dayShift === 'daytime' ? 'text-green-600' : 'text-slate-500'}`}>
                        {dayShift === 'daytime' ? 'Daytime' : 'Nighttime'}
                      </div>
                      <input
                        type="time"
                        value={singleStart || ''}
                        onChange={e => update({ [`${day}_start`]: e.target.value } as any)}
                        className="rounded border border-slate-200 bg-white px-2 py-1 text-[12px] font-medium text-slate-900 focus:border-blue-400 outline-none"
                      />
                      <span className="text-[11px] text-slate-400">to</span>
                      <input
                        type="time"
                        value={singleEnd || ''}
                        onChange={e => update({ [`${day}_end`]: e.target.value } as any)}
                        className="rounded border border-slate-200 bg-white px-2 py-1 text-[12px] font-medium text-slate-900 focus:border-blue-400 outline-none"
                      />
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {spansOvernight(singleStart, singleEnd) && (
                          <span className="rounded bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                            Spans overnight
                          </span>
                        )}
                        {singlePeak && (
                          <span className="rounded bg-orange-100 px-2 py-0.5 text-[10px] font-bold text-orange-700">
                            ⚡ Overlaps peak — PHE required
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};
