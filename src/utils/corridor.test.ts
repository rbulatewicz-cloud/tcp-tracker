import { describe, it, expect } from 'vitest';
import {
  normalizeStreet,
  getStreetIndex,
  getStreetsBetween,
  sortStreetsByCorridorOrder,
  findExtrasOutsideCorridors,
  findGapsInCoverage,
  getStagePill,
} from './corridor';

// ── normalizeStreet ───────────────────────────────────────────────────────────

describe('normalizeStreet', () => {
  it('strips the full suffix word', () => {
    expect(normalizeStreet('Oxnard Street')).toBe('oxnard');
  });

  it('strips the abbreviated suffix', () => {
    expect(normalizeStreet('Oxnard St')).toBe('oxnard');
  });

  it('handles mixed case and extra whitespace', () => {
    expect(normalizeStreet('  OXNARD  st  ')).toBe('oxnard');
  });

  it('returns empty for empty input', () => {
    expect(normalizeStreet('')).toBe('');
  });
});

// ── getStreetIndex ────────────────────────────────────────────────────────────

describe('getStreetIndex', () => {
  it('finds a street using its canonical name', () => {
    expect(getStreetIndex('Oxnard St')).toBeGreaterThanOrEqual(0);
  });

  it('finds a street via an alias', () => {
    // "laurel canyon" is registered as an alias for Laurel Canyon Blvd
    expect(getStreetIndex('Laurel Canyon')).toBeGreaterThanOrEqual(0);
  });

  it('returns -1 for an unknown street', () => {
    expect(getStreetIndex('Nonexistent Blvd')).toBe(-1);
  });

  it('returns -1 for empty or whitespace input', () => {
    expect(getStreetIndex('')).toBe(-1);
    expect(getStreetIndex('   ')).toBe(-1);
  });
});

// ── getStreetsBetween ─────────────────────────────────────────────────────────

describe('getStreetsBetween', () => {
  it('returns inclusive forward range', () => {
    // Bessemer → Sylvan are both on Segment A1, Bessemer before Sylvan
    const range = getStreetsBetween('Bessemer St', 'Sylvan St');
    expect(range[0]).toBe('Bessemer St');
    expect(range[range.length - 1]).toBe('Sylvan St');
    expect(range.length).toBeGreaterThanOrEqual(2);
  });

  it('returns forward order regardless of argument order', () => {
    const forward = getStreetsBetween('Bessemer St', 'Sylvan St');
    const reversed = getStreetsBetween('Sylvan St', 'Bessemer St');
    expect(reversed).toEqual(forward);
  });

  it('returns a single-item array when from === to', () => {
    expect(getStreetsBetween('Oxnard St', 'Oxnard St')).toEqual(['Oxnard St']);
  });

  it('returns [] when either street is unknown', () => {
    expect(getStreetsBetween('Unknown St', 'Oxnard St')).toEqual([]);
    expect(getStreetsBetween('Oxnard St', '')).toEqual([]);
  });
});

// ── sortStreetsByCorridorOrder ────────────────────────────────────────────────

describe('sortStreetsByCorridorOrder', () => {
  it('sorts known streets in south-to-north order', () => {
    // Victory is later in A1 than Oxnard; Vanowen starts A2
    const sorted = sortStreetsByCorridorOrder(['Vanowen St', 'Oxnard St', 'Victory Blvd']);
    expect(sorted).toEqual(['Oxnard St', 'Victory Blvd', 'Vanowen St']);
  });

  it('sinks unknown streets to the end', () => {
    const sorted = sortStreetsByCorridorOrder(['Mystery Ave', 'Oxnard St']);
    expect(sorted[0]).toBe('Oxnard St');
    expect(sorted[1]).toBe('Mystery Ave');
  });

  it('does not mutate the input', () => {
    const input = ['Vanowen St', 'Oxnard St'];
    const copy = [...input];
    sortStreetsByCorridorOrder(input);
    expect(input).toEqual(copy);
  });
});

// ── findExtrasOutsideCorridors ────────────────────────────────────────────────

describe('findExtrasOutsideCorridors', () => {
  it('flags streets outside the stated range', () => {
    const corridors = [{ mainStreet: 'Van Nuys Blvd', from: 'Gledhill St', to: 'Novice St' }];
    // Vincennes is BEFORE Gledhill in the corridor — should be flagged as an extra
    const extras = findExtrasOutsideCorridors(corridors, ['Gledhill St', 'Vincennes St']);
    expect(extras).toContain('Vincennes St');
  });

  it('returns [] when corridors list is empty (not enough info to judge)', () => {
    expect(findExtrasOutsideCorridors([], ['Oxnard St', 'Sylvan St'])).toEqual([]);
  });

  it('silently ignores streets not found in the corridor (e.g. arterials)', () => {
    const corridors = [{ mainStreet: 'Van Nuys Blvd', from: 'Oxnard St', to: 'Sylvan St' }];
    expect(findExtrasOutsideCorridors(corridors, ['Some Unknown St'])).toEqual([]);
  });
});

// ── findGapsInCoverage ────────────────────────────────────────────────────────

describe('findGapsInCoverage', () => {
  it('flags corridor streets missing from the coverage list', () => {
    const corridors = [{ mainStreet: 'Van Nuys Blvd', from: 'Oxnard St', to: 'Bessemer St' }];
    // Between Oxnard and Bessemer is Aetna — omitted from coveredStreets
    const gaps = findGapsInCoverage(corridors, ['Oxnard St', 'Bessemer St']);
    expect(gaps).toContain('Aetna St');
  });

  it('returns no gaps when every expected street is covered', () => {
    const corridors = [{ mainStreet: 'Van Nuys Blvd', from: 'Oxnard St', to: 'Oxnard St' }];
    expect(findGapsInCoverage(corridors, ['Oxnard St'])).toEqual([]);
  });
});

// ── getStagePill ──────────────────────────────────────────────────────────────

describe('getStagePill', () => {
  it('returns the mapped colours for a known stage', () => {
    const pill = getStagePill('approved');
    expect(pill.bg).toBe('#DCFCE7');
  });

  it('falls back to a neutral pill for an unknown stage', () => {
    const pill = getStagePill('does_not_exist');
    expect(pill).toEqual({ bg: '#F8FAFC', text: '#64748B', border: '#E2E8F0' });
  });
});
