import { describe, it, expect } from 'vitest';
import { normalizeStreet, isPlanExpired, findSimilarPlans } from './similarity';
import type { Plan } from '../../types';

function mkPlan(overrides: Partial<Plan>): Plan {
  return {
    id: overrides.loc ?? overrides.id ?? 'LOC-000',
    loc: overrides.loc,
    street1: '',
    street2: '',
    log: [],
    ...overrides,
  } as unknown as Plan;
}

// ── normalizeStreet ───────────────────────────────────────────────────────────

describe('normalizeStreet', () => {
  it('collapses "Street" to "st"', () => {
    expect(normalizeStreet('Oxnard Street')).toBe('oxnard st');
  });

  it('collapses "Boulevard" to "blvd"', () => {
    expect(normalizeStreet('Van Nuys Boulevard')).toBe('van nuys blvd');
  });

  it('lowercases and trims whitespace', () => {
    expect(normalizeStreet('  OXNARD   ST  ')).toBe('oxnard st');
  });

  it('returns empty string for empty input', () => {
    expect(normalizeStreet('')).toBe('');
  });
});

// ── isPlanExpired ─────────────────────────────────────────────────────────────

describe('isPlanExpired', () => {
  it('returns true when implementation window end has passed', () => {
    const p = mkPlan({ implementationWindow: { startDate: '2020-01-01', endDate: '2020-12-31' } } as Partial<Plan>);
    expect(isPlanExpired(p)).toBe(true);
  });

  it('returns false when end is in the future', () => {
    const farFuture = new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10);
    const p = mkPlan({ implementationWindow: { startDate: '2020-01-01', endDate: farFuture } } as Partial<Plan>);
    expect(isPlanExpired(p)).toBe(false);
  });

  it('falls back to softImplementationWindow if hard window is absent', () => {
    const p = mkPlan({ softImplementationWindow: { startDate: '2020-01-01', endDate: '2020-12-31' } } as Partial<Plan>);
    expect(isPlanExpired(p)).toBe(true);
  });

  it('returns false when neither window is set', () => {
    const p = mkPlan({});
    expect(isPlanExpired(p)).toBe(false);
  });
});

// ── findSimilarPlans ──────────────────────────────────────────────────────────

describe('findSimilarPlans', () => {
  const basePlans: Plan[] = [
    mkPlan({ id: '1', loc: 'LOC-100', street1: 'Oxnard St',   street2: 'Van Nuys Blvd' }),
    mkPlan({ id: '2', loc: 'LOC-101', street1: 'Van Nuys Blvd', street2: 'Oxnard St' }), // reversed
    mkPlan({ id: '3', loc: 'LOC-102', street1: 'Oxnard St',   street2: 'Sepulveda Blvd' }), // partial
    mkPlan({ id: '4', loc: 'LOC-103', street1: 'Chase St',    street2: 'Tobias Ave' }), // unrelated
  ];

  it('returns empty result when street1 is empty', () => {
    expect(findSimilarPlans('', '', undefined, basePlans)).toEqual({ exact: [], near: [] });
  });

  it('flags a plan with both streets matching as exact', () => {
    const r = findSimilarPlans('Oxnard St', 'Van Nuys Blvd', undefined, basePlans);
    expect(r.exact.map(p => p.loc)).toContain('LOC-100');
  });

  it('treats reversed street order as an exact match', () => {
    const r = findSimilarPlans('Oxnard St', 'Van Nuys Blvd', undefined, basePlans);
    expect(r.exact.map(p => p.loc)).toContain('LOC-101');
  });

  it('normalizes suffixes before comparing (Street vs St)', () => {
    const r = findSimilarPlans('Oxnard Street', 'Van Nuys Boulevard', undefined, basePlans);
    expect(r.exact.length).toBe(2);
  });

  it('flags single-street matches as near (not exact)', () => {
    const r = findSimilarPlans('Oxnard St', 'Different Ave', undefined, basePlans);
    // LOC-100 / LOC-101 / LOC-102 all have Oxnard St — but none match "Different Ave"
    expect(r.exact).toEqual([]);
    expect(r.near.map(p => p.loc).sort()).toEqual(['LOC-100', 'LOC-101', 'LOC-102']);
  });

  it('does NOT flag unrelated plans', () => {
    const r = findSimilarPlans('Oxnard St', 'Van Nuys Blvd', undefined, basePlans);
    expect(r.exact.map(p => p.loc)).not.toContain('LOC-103');
    expect(r.near.map(p => p.loc)).not.toContain('LOC-103');
  });

  // Regression guard — this is the exact bug we just fixed in the renewal flow.
  it('excludes the renewal family when parentLocId is set', () => {
    const plans: Plan[] = [
      mkPlan({ id: 'a', loc: 'LOC-345',   street1: 'Foo St', street2: 'Bar Ave' }),
      mkPlan({ id: 'b', loc: 'LOC-345.1', street1: 'Foo St', street2: 'Bar Ave' }),
      mkPlan({ id: 'c', loc: 'LOC-345.2', street1: 'Foo St', street2: 'Bar Ave' }),
      mkPlan({ id: 'd', loc: 'LOC-999',   street1: 'Foo St', street2: 'Bar Ave' }), // unrelated, real duplicate
    ];
    const r = findSimilarPlans('Foo St', 'Bar Ave', 'LOC-345', plans);
    // All three family members must be filtered out
    const locs = [...r.exact, ...r.near].map(p => p.loc);
    expect(locs).not.toContain('LOC-345');
    expect(locs).not.toContain('LOC-345.1');
    expect(locs).not.toContain('LOC-345.2');
    // The unrelated real duplicate must still surface
    expect(locs).toContain('LOC-999');
  });

  it('accepts parentLocId already containing a revision suffix', () => {
    // User opens renewal from a .2 — should still strip to base and filter the family
    const plans: Plan[] = [
      mkPlan({ id: 'a', loc: 'LOC-345',   street1: 'Foo St', street2: 'Bar Ave' }),
      mkPlan({ id: 'b', loc: 'LOC-345.2', street1: 'Foo St', street2: 'Bar Ave' }),
    ];
    const r = findSimilarPlans('Foo St', 'Bar Ave', 'LOC-345.2', plans);
    expect([...r.exact, ...r.near]).toEqual([]);
  });
});
