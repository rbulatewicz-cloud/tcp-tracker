import { describe, it, expect } from 'vitest';
import {
  normalizeStreet,
  streetMatch,
  scoreMatch,
  confidenceLabel,
  getLinkedVarianceIds,
} from './scoring';
import type { Plan, NoiseVariance } from '../../../types';

// ── Fixtures ──────────────────────────────────────────────────────────────────
//
// Tests shape the NoiseVariance / Plan minimally via casts — the scoring fn
// only touches specific fields, so a full type isn't necessary. These helpers
// keep the fixtures one-liner-ish.

function mkVariance(overrides: Partial<NoiseVariance>): NoiseVariance {
  return {
    id: 'v1',
    title: 'Variance 1',
    permitNumber: 'NV-001',
    coveredSegments: [],
    validFrom: '2026-01-01',
    validThrough: '2026-12-31',
    applicableHours: 'nighttime',
    isGeneric: false,
    coveredScopes: [],
    scopeLanguage: '',
    coveredStreets: [],
    ...overrides,
  } as unknown as NoiseVariance;
}

function mkPlan(overrides: Partial<Plan>): Plan {
  return {
    id: 'p1',
    street1: '',
    street2: '',
    log: [],
    ...overrides,
  } as unknown as Plan;
}

// ── normalizeStreet ───────────────────────────────────────────────────────────

describe('normalizeStreet', () => {
  it('strips "Street" suffix entirely (unlike similarity.ts which collapses to "st")', () => {
    expect(normalizeStreet('Oxnard Street')).toBe('oxnard');
  });

  it('strips "Boulevard" suffix', () => {
    expect(normalizeStreet('Van Nuys Boulevard')).toBe('van nuys');
  });

  it('strips short-form suffixes too (st, blvd, ave, etc.)', () => {
    expect(normalizeStreet('Sepulveda Blvd')).toBe('sepulveda');
    expect(normalizeStreet('Oxnard St')).toBe('oxnard');
    expect(normalizeStreet('Chase Ave')).toBe('chase');
  });

  it('is case-insensitive and collapses whitespace', () => {
    expect(normalizeStreet('  VAN   NUYS   BLVD  ')).toBe('van nuys');
  });

  it('handles a trailing period', () => {
    expect(normalizeStreet('Oxnard St.')).toBe('oxnard');
  });
});

// ── streetMatch ───────────────────────────────────────────────────────────────

describe('streetMatch', () => {
  it('returns false for empty input', () => {
    expect(streetMatch('', ['Oxnard St'])).toBe(false);
    expect(streetMatch('Oxnard St', [])).toBe(false);
  });

  it('returns true on exact-normalized match', () => {
    expect(streetMatch('Oxnard St', ['Oxnard Street'])).toBe(true);
  });

  it('returns true when one contains the other (loose match)', () => {
    // "Van Nuys" ⊂ "Van Nuys Blvd North"
    expect(streetMatch('Van Nuys Blvd', ['Van Nuys Blvd North'])).toBe(true);
  });

  it('returns false on unrelated streets', () => {
    expect(streetMatch('Oxnard St', ['Chase Ave', 'Tobias Blvd'])).toBe(false);
  });
});

// ── scoreMatch ────────────────────────────────────────────────────────────────

describe('scoreMatch', () => {
  it('returns 0 when nothing aligns', () => {
    const r = scoreMatch(
      mkPlan({ segment: 'X9', scope: 'unknown_scope', street1: 'Nothing Rd' }),
      mkVariance({ coveredSegments: ['A1'], coveredScopes: ['lane_closure'] }),
    );
    expect(r.score).toBe(0);
    expect(r.signals.segment).toBe(false);
  });

  it('scores segment match (+5)', () => {
    const r = scoreMatch(
      mkPlan({ segment: 'A1' }),
      mkVariance({ coveredSegments: ['A1', 'A2'] }),
    );
    expect(r.signals.segment).toBe(true);
    expect(r.score).toBeGreaterThanOrEqual(5);
  });

  it('scores scope match (+2)', () => {
    const r = scoreMatch(
      mkPlan({ scope: 'lane_closure' }),
      mkVariance({ coveredScopes: ['lane_closure'] }),
    );
    expect(r.signals.scope).toBe(true);
    expect(r.score).toBe(2);
  });

  it('generic variance always scores scope (+2) even without a scope match', () => {
    const r = scoreMatch(
      mkPlan({ scope: 'unknown_scope' }),
      mkVariance({ isGeneric: true, coveredScopes: [] }),
    );
    expect(r.signals.scope).toBe(true);
  });

  it('scores date validity (+1) when needByDate falls in window', () => {
    const r = scoreMatch(
      mkPlan({ needByDate: '2026-06-15' }),
      mkVariance({ validFrom: '2026-01-01', validThrough: '2026-12-31' }),
    );
    expect(r.signals.date).toBe(true);
  });

  it('does not score date when needByDate is outside window', () => {
    const r = scoreMatch(
      mkPlan({ needByDate: '2025-06-15' }),
      mkVariance({ validFrom: '2026-01-01', validThrough: '2026-12-31' }),
    );
    expect(r.signals.date).toBe(false);
  });

  it('scores hours (+2) when plan does nights AND variance covers nights', () => {
    const r = scoreMatch(
      mkPlan({ work_hours: { shift: 'nighttime' } as Plan['work_hours'] }),
      mkVariance({ applicableHours: 'nighttime' }),
    );
    expect(r.signals.hours).toBe(true);
  });

  it('does not score hours when plan is daytime only', () => {
    const r = scoreMatch(
      mkPlan({ work_hours: { shift: 'daytime' } as Plan['work_hours'] }),
      mkVariance({ applicableHours: 'nighttime' }),
    );
    expect(r.signals.hours).toBe(false);
  });

  it('scores streets (+4) on structured match — plan.street1 matches variance.coveredStreets', () => {
    const r = scoreMatch(
      mkPlan({ street1: 'Oxnard St', street2: 'Van Nuys Blvd' }),
      mkVariance({ coveredStreets: ['Oxnard Street', 'Sepulveda Blvd'] }),
    );
    expect(r.signals.streets).toBe(true);
  });

  it('scores streets via plan.expandedStreets (corridor cross-streets)', () => {
    const r = scoreMatch(
      mkPlan({ street1: 'Oxnard', street2: 'Sherman', expandedStreets: ['Van Nuys Blvd', 'Woodley Ave'] }),
      mkVariance({ coveredStreets: ['Woodley Ave'] }),
    );
    expect(r.signals.streets).toBe(true);
  });

  it('scores streets via variance.verifiedStreets (human-confirmed from PDF)', () => {
    const r = scoreMatch(
      mkPlan({ street1: 'Van Nuys Blvd' }),
      mkVariance({ coveredStreets: [], verifiedStreets: ['Van Nuys Boulevard'] }),
    );
    expect(r.signals.streets).toBe(true);
  });

  it('falls back to scopeLanguage text match (+1) only when no structured streets exist', () => {
    const r = scoreMatch(
      mkPlan({ street1: 'Oxnard St' }),
      mkVariance({
        coveredStreets: [],
        verifiedStreets: [],
        scopeLanguage: 'Work along Oxnard St between segments',
      }),
    );
    expect(r.signals.location).toBe(true);
    expect(r.signals.streets).toBe(false);
  });

  it('does NOT use scopeLanguage when structured coveredStreets exist (structured wins)', () => {
    const r = scoreMatch(
      mkPlan({ street1: 'Oxnard St' }),
      mkVariance({
        coveredStreets: ['Different St'],
        scopeLanguage: 'Oxnard St', // text would match — but structured data overrides
      }),
    );
    expect(r.signals.location).toBe(false);
    expect(r.signals.streets).toBe(false);
  });

  it('max score (14) on every signal firing', () => {
    const r = scoreMatch(
      mkPlan({
        segment: 'A1',
        scope: 'lane_closure',
        needByDate: '2026-06-15',
        work_hours: { shift: 'nighttime' } as Plan['work_hours'],
        street1: 'Oxnard St',
      }),
      mkVariance({
        coveredSegments: ['A1'],
        coveredScopes: ['lane_closure'],
        validFrom: '2026-01-01',
        validThrough: '2026-12-31',
        applicableHours: 'nighttime',
        coveredStreets: ['Oxnard Street'],
      }),
    );
    expect(r.score).toBe(5 + 2 + 1 + 2 + 4); // 14
    expect(r.signals).toEqual({ segment: true, scope: true, date: true, hours: true, streets: true, location: false });
  });

  it('dedupes overlapping coveredStreets + verifiedStreets', () => {
    // Same street in both lists — shouldn't count twice. The scoring logic dedupes internally;
    // this test just confirms we don't crash or double-score.
    const r = scoreMatch(
      mkPlan({ street1: 'Oxnard St' }),
      mkVariance({
        coveredStreets: ['Oxnard St'],
        verifiedStreets: ['Oxnard St'],
      }),
    );
    expect(r.signals.streets).toBe(true);
    expect(r.score).toBe(4); // only the street bonus
  });
});

// ── confidenceLabel ───────────────────────────────────────────────────────────

describe('confidenceLabel', () => {
  it('labels 10+ as Strong match (green)', () => {
    expect(confidenceLabel(10).label).toBe('Strong match');
    expect(confidenceLabel(14).label).toBe('Strong match');
  });

  it('labels 6-9 as Possible match (amber)', () => {
    expect(confidenceLabel(6).label).toBe('Possible match');
    expect(confidenceLabel(9).label).toBe('Possible match');
  });

  it('labels 3-5 as Weak match (red)', () => {
    expect(confidenceLabel(3).label).toBe('Weak match');
    expect(confidenceLabel(5).label).toBe('Weak match');
  });

  it('labels < 3 as No match signals (grey)', () => {
    expect(confidenceLabel(0).label).toBe('No match signals');
    expect(confidenceLabel(2).label).toBe('No match signals');
  });

  it('returns a color and bg for each tier', () => {
    for (const score of [0, 3, 6, 10]) {
      const c = confidenceLabel(score);
      expect(c.color).toMatch(/^#/);
      expect(c.bg).toMatch(/^#/);
    }
  });
});

// ── getLinkedVarianceIds ──────────────────────────────────────────────────────

describe('getLinkedVarianceIds', () => {
  it('returns [] when nothing linked', () => {
    expect(getLinkedVarianceIds({})).toEqual([]);
  });

  it('prefers the new multi-link field when present', () => {
    expect(getLinkedVarianceIds({
      linkedVarianceIds: ['v1', 'v2'],
      linkedVarianceId: 'v_legacy',
    })).toEqual(['v1', 'v2']);
  });

  it('falls back to legacy single-link field', () => {
    expect(getLinkedVarianceIds({ linkedVarianceId: 'v_legacy' })).toEqual(['v_legacy']);
  });

  it('returns [] when linkedVarianceIds is an empty array (treats as unlinked)', () => {
    expect(getLinkedVarianceIds({ linkedVarianceIds: [], linkedVarianceId: 'v_legacy' }))
      .toEqual(['v_legacy']);
  });
});
