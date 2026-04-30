import { describe, it, expect } from 'vitest';
import { parsePhaseNotation, parseDateRange } from './tansatImport';

// ── parsePhaseNotation ───────────────────────────────────────────────────────
describe('parsePhaseNotation — handles every notation style in Justin\'s xlsx', () => {
  it('returns empty for empty/null', () => {
    expect(parsePhaseNotation('')).toEqual([]);
    expect(parsePhaseNotation(null)).toEqual([]);
    expect(parsePhaseNotation(undefined)).toEqual([]);
  });

  it('returns empty for "All" (means every phase)', () => {
    expect(parsePhaseNotation('All')).toEqual([]);
    expect(parsePhaseNotation('all')).toEqual([]);
    expect(parsePhaseNotation('ALL')).toEqual([]);
  });

  it('parses single number', () => {
    expect(parsePhaseNotation('1')).toEqual([1]);
    expect(parsePhaseNotation('  3  ')).toEqual([3]);
    expect(parsePhaseNotation('24')).toEqual([24]);
  });

  it('parses comma-separated lists', () => {
    expect(parsePhaseNotation('3,4,5')).toEqual([3, 4, 5]);
    expect(parsePhaseNotation('1,2,4,8,9')).toEqual([1, 2, 4, 8, 9]);
    expect(parsePhaseNotation('1, 10')).toEqual([1, 10]);
  });

  it('parses ranges', () => {
    expect(parsePhaseNotation('1-9')).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(parsePhaseNotation('7-9')).toEqual([7, 8, 9]);
    expect(parsePhaseNotation('1-3')).toEqual([1, 2, 3]);
    expect(parsePhaseNotation('1-7')).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('parses ranges in parens', () => {
    expect(parsePhaseNotation('(1-4)')).toEqual([1, 2, 3, 4]);
    expect(parsePhaseNotation('(5-8)')).toEqual([5, 6, 7, 8]);
  });

  it('parses & / and as comma', () => {
    expect(parsePhaseNotation('1 & 2')).toEqual([1, 2]);
    expect(parsePhaseNotation('1,2 & 3')).toEqual([1, 2, 3]);
    expect(parsePhaseNotation('1 and 2')).toEqual([1, 2]);
  });

  it('mixes ranges and lists', () => {
    expect(parsePhaseNotation('1-3, 5')).toEqual([1, 2, 3, 5]);
    expect(parsePhaseNotation('1, 4-6, 9')).toEqual([1, 4, 5, 6, 9]);
  });

  it('dedupes and sorts', () => {
    expect(parsePhaseNotation('3, 1, 2, 1')).toEqual([1, 2, 3]);
    expect(parsePhaseNotation('5-7, 6, 8')).toEqual([5, 6, 7, 8]);
  });
});

// ── parseDateRange ──────────────────────────────────────────────────────────
describe('parseDateRange — handles every date format in Justin\'s xlsx', () => {
  it('parses M/D/YY 2-digit year (assumes 2000s for <50)', () => {
    expect(parseDateRange('12/9/23-12/23/23')).toEqual({
      startDate: '2023-12-09',
      endDate:   '2023-12-23',
    });
  });

  it('parses M/D/YYYY 4-digit year', () => {
    expect(parseDateRange('4/27/2026-5/15/2026')).toEqual({
      startDate: '2026-04-27',
      endDate:   '2026-05-15',
    });
  });

  it('handles single-day events (single date for both start and end)', () => {
    expect(parseDateRange('1/15/24')).toEqual({
      startDate: '2024-01-15',
      endDate:   '2024-01-15',
    });
  });

  it('handles en-dash and em-dash separators', () => {
    expect(parseDateRange('12/9/23 – 12/23/23')).toEqual({
      startDate: '2023-12-09',
      endDate:   '2023-12-23',
    });
    expect(parseDateRange('12/9/23—12/23/23')).toEqual({
      startDate: '2023-12-09',
      endDate:   '2023-12-23',
    });
  });

  it('returns empty strings for unparseable input', () => {
    expect(parseDateRange('')).toEqual({ startDate: '', endDate: '' });
    expect(parseDateRange('not a date')).toEqual({ startDate: '', endDate: '' });
    expect(parseDateRange(null)).toEqual({ startDate: '', endDate: '' });
  });

  it('zero-pads single-digit months and days', () => {
    expect(parseDateRange('1/2/24')).toEqual({
      startDate: '2024-01-02',
      endDate:   '2024-01-02',
    });
  });
});
