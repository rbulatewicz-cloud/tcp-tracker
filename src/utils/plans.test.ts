import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  formatPlanLoc,
  getNextRevisionLoc,
  fmtDate,
  fmtDateLong,
  fmt12,
  daysBetween,
  daysUntil,
  formatFileSize,
  getCycleTime,
} from './plans';
import type { Plan } from '../types';

// ── formatPlanLoc ─────────────────────────────────────────────────────────────

describe('formatPlanLoc', () => {
  it('returns the value unchanged when already prefixed', () => {
    expect(formatPlanLoc({ loc: 'LOC-371', id: 'abc' })).toBe('LOC-371');
  });

  it('adds the prefix when missing (historical data)', () => {
    expect(formatPlanLoc({ loc: '371.3', id: 'abc' })).toBe('LOC-371.3');
  });

  it('falls back to id when loc is missing', () => {
    expect(formatPlanLoc({ id: 'LOC-999' })).toBe('LOC-999');
  });

  it('prefixes an unprefixed id fallback', () => {
    expect(formatPlanLoc({ id: '999' })).toBe('LOC-999');
  });

  it('returns em-dash when both loc and id are empty', () => {
    expect(formatPlanLoc({ loc: '', id: '' })).toBe('—');
    expect(formatPlanLoc({ loc: null })).toBe('—');
    expect(formatPlanLoc({})).toBe('—');
  });
});

// ── getNextRevisionLoc ────────────────────────────────────────────────────────

function mkPlan(loc: string): Plan {
  return { id: loc, loc, log: [] } as unknown as Plan;
}

describe('getNextRevisionLoc', () => {
  it('returns .1 when no revisions exist', () => {
    expect(getNextRevisionLoc('LOC-345', [mkPlan('LOC-345')])).toBe('LOC-345.1');
  });

  it('returns .2 after a .1 exists', () => {
    expect(
      getNextRevisionLoc('LOC-345', [mkPlan('LOC-345'), mkPlan('LOC-345.1')])
    ).toBe('LOC-345.2');
  });

  it('takes max+1, not count+1, so gaps do not collide', () => {
    expect(
      getNextRevisionLoc('LOC-345', [
        mkPlan('LOC-345'),
        mkPlan('LOC-345.1'),
        mkPlan('LOC-345.3'),
      ])
    ).toBe('LOC-345.4');
  });

  it('strips an existing revision suffix from the base', () => {
    // If user passes LOC-345.2 as base, it should compute from LOC-345 root
    expect(
      getNextRevisionLoc('LOC-345.2', [mkPlan('LOC-345'), mkPlan('LOC-345.2')])
    ).toBe('LOC-345.3');
  });

  it('ignores unrelated plans', () => {
    expect(
      getNextRevisionLoc('LOC-345', [
        mkPlan('LOC-999'),
        mkPlan('LOC-999.5'),
        mkPlan('LOC-34.1'), // prefix-overlap trap
      ])
    ).toBe('LOC-345.1');
  });
});

// ── fmtDate / fmtDateLong ─────────────────────────────────────────────────────

describe('fmtDate', () => {
  it('formats a YYYY-MM-DD string at local midnight', () => {
    expect(fmtDate('2024-01-15')).toBe('Jan 15, 2024');
  });

  it('formats a full ISO timestamp', () => {
    // Use a time that is noon UTC to avoid timezone-boundary flakiness
    expect(fmtDate('2024-07-04T12:00:00.000Z')).toBe('Jul 4, 2024');
  });

  it('returns em-dash for null/undefined/empty', () => {
    expect(fmtDate(null)).toBe('—');
    expect(fmtDate(undefined)).toBe('—');
    expect(fmtDate('')).toBe('—');
  });

  it('returns the raw string for an unparseable value', () => {
    expect(fmtDate('not-a-date')).toBe('not-a-date');
  });
});

describe('fmtDateLong', () => {
  it('uses the long month name', () => {
    expect(fmtDateLong('2024-01-15')).toBe('January 15, 2024');
  });

  it('returns empty string (not em-dash) when missing — used in letters', () => {
    expect(fmtDateLong(null)).toBe('');
    expect(fmtDateLong('')).toBe('');
  });
});

// ── fmt12 ─────────────────────────────────────────────────────────────────────

describe('fmt12', () => {
  it('converts 24h noon to 12 PM', () => {
    expect(fmt12('12:00')).toBe('12 PM');
  });

  it('converts 24h midnight to 12 AM', () => {
    expect(fmt12('00:00')).toBe('12 AM');
  });

  it('converts afternoon hours with minutes', () => {
    expect(fmt12('15:30')).toBe('3:30 PM');
  });

  it('omits minutes when on the hour', () => {
    expect(fmt12('09:00')).toBe('9 AM');
    expect(fmt12('21:00')).toBe('9 PM');
  });
});

// ── daysBetween / daysUntil ───────────────────────────────────────────────────

describe('daysBetween', () => {
  it('returns the signed difference in whole days', () => {
    expect(daysBetween('2024-01-01', '2024-01-10')).toBe(9);
  });

  it('returns a negative value when d2 precedes d1', () => {
    expect(daysBetween('2024-01-10', '2024-01-01')).toBe(-9);
  });

  it('returns 0 for an invalid input (does not throw)', () => {
    expect(daysBetween('garbage', '2024-01-01')).toBe(0);
  });
});

describe('daysUntil', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-06-15T10:00:00'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns a positive number for a future date', () => {
    expect(daysUntil('2024-06-20')).toBe(5);
  });

  it('returns a negative number for a past date', () => {
    expect(daysUntil('2024-06-10')).toBe(-5);
  });

  it('returns 0 when the date is today', () => {
    expect(daysUntil('2024-06-15')).toBe(0);
  });
});

// ── formatFileSize ────────────────────────────────────────────────────────────

describe('formatFileSize', () => {
  it('shows em-dash for zero/falsy', () => {
    expect(formatFileSize(0)).toBe('—');
  });

  it('formats bytes', () => {
    expect(formatFileSize(512)).toBe('512 B');
  });

  it('formats kilobytes', () => {
    expect(formatFileSize(2048)).toBe('2 KB');
  });

  it('formats megabytes with one decimal', () => {
    expect(formatFileSize(1024 * 1024 * 3.5)).toBe('3.5 MB');
  });

  it('formats gigabytes', () => {
    expect(formatFileSize(1024 ** 3 * 2)).toBe('2 GB');
  });
});

// ── getCycleTime ──────────────────────────────────────────────────────────────

describe('getCycleTime', () => {
  it('computes DOT court time and overall duration when all dates present', () => {
    const plan = {
      dateRequested: '2024-01-01',
      dateSubmittedToDOT: '2024-01-05',
      dateApproved: '2024-01-20',
      log: [],
    };
    expect(getCycleTime(plan)).toEqual({ dotCourtTime: 15, overallDuration: 19 });
  });

  it('returns nulls when key dates are missing', () => {
    const plan = { log: [] };
    expect(getCycleTime(plan)).toEqual({ dotCourtTime: null, overallDuration: null });
  });
});
