import { describe, it, expect } from 'vitest';
import { buildFamilies, hasActiveLinkedPlans } from './families';
import type { NoiseVariance, Plan } from '../../../types';

// ── Fixtures ──────────────────────────────────────────────────────────────────
// Cast shortcuts — buildFamilies only touches a small set of fields.

function mkVariance(overrides: Partial<NoiseVariance> & { id: string }): NoiseVariance {
  return {
    id: overrides.id,
    permitNumber: overrides.id,
    title: overrides.id,
    revisionNumber: 0,
    isArchived: false,
    parentVarianceId: null,
    scanStatus: 'complete',
    validFrom: '2026-01-01',
    validThrough: '2026-12-31',
    uploadedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as unknown as NoiseVariance;
}

function mkPlan(overrides: Partial<Plan> & { id: string }): Plan {
  return {
    id: overrides.id,
    stage: 'in_progress',
    ...overrides,
  } as unknown as Plan;
}

// ── buildFamilies ─────────────────────────────────────────────────────────────

describe('buildFamilies', () => {
  it('returns [] for an empty list', () => {
    expect(buildFamilies([])).toEqual([]);
  });

  it('treats a lone root as a family with no history', () => {
    const v = mkVariance({ id: 'v1' });
    const fams = buildFamilies([v]);
    expect(fams).toHaveLength(1);
    expect(fams[0].rootId).toBe('v1');
    expect(fams[0].active).toBe(v);
    expect(fams[0].history).toEqual([]);
  });

  it('groups revisions under their parent root', () => {
    const root = mkVariance({ id: 'v1', revisionNumber: 0, isArchived: true });
    const rev1 = mkVariance({ id: 'v1_r1', parentVarianceId: 'v1', revisionNumber: 1, isArchived: true });
    const rev2 = mkVariance({ id: 'v1_r2', parentVarianceId: 'v1', revisionNumber: 2, isArchived: false });
    const fams = buildFamilies([root, rev1, rev2]);
    expect(fams).toHaveLength(1);
    expect(fams[0].rootId).toBe('v1');
    expect(fams[0].active.id).toBe('v1_r2'); // non-archived wins
    expect(fams[0].history.map(v => v.id)).toEqual(['v1_r1', 'v1']); // high-to-low rev, archived only
  });

  it('falls back to highest-revision when all members are archived', () => {
    // Edge case: should never happen in practice but shouldn't crash.
    const v0 = mkVariance({ id: 'v0', revisionNumber: 0, isArchived: true });
    const v1 = mkVariance({ id: 'v0_r1', parentVarianceId: 'v0', revisionNumber: 1, isArchived: true });
    const [fam] = buildFamilies([v0, v1]);
    expect(fam.active.id).toBe('v0_r1');
  });

  it('sorts scanning variances to the top', () => {
    const a = mkVariance({ id: 'a', validThrough: '2026-06-01', scanStatus: 'complete' });
    const b = mkVariance({ id: 'b', validThrough: '2026-03-01', scanStatus: 'scanning' });
    const fams = buildFamilies([a, b]);
    expect(fams[0].rootId).toBe('b'); // scanning first even though expires later
    expect(fams[1].rootId).toBe('a');
  });

  it('sorts by validThrough ascending (soonest-expiring first)', () => {
    const later  = mkVariance({ id: 'later',  validThrough: '2026-12-01' });
    const sooner = mkVariance({ id: 'sooner', validThrough: '2026-03-01' });
    const fams = buildFamilies([later, sooner]);
    expect(fams.map(f => f.rootId)).toEqual(['sooner', 'later']);
  });

  it('pushes variances with no validThrough to the bottom', () => {
    const dated   = mkVariance({ id: 'dated', validThrough: '2026-03-01' });
    const undated = mkVariance({ id: 'undated', validThrough: undefined });
    const fams = buildFamilies([undated, dated]);
    expect(fams.map(f => f.rootId)).toEqual(['dated', 'undated']);
  });
});

// ── hasActiveLinkedPlans ──────────────────────────────────────────────────────

describe('hasActiveLinkedPlans', () => {
  it('returns false when no plans have compliance.noiseVariance', () => {
    const plans = [mkPlan({ id: 'p1' })];
    expect(hasActiveLinkedPlans('v1', plans)).toBe(false);
  });

  it('returns true when an active plan links to the root via multi-link field', () => {
    const plans = [mkPlan({
      id: 'p1',
      stage: 'in_progress',
      compliance: { noiseVariance: { linkedVarianceIds: ['v1', 'v2'] } },
    } as unknown as Plan)];
    expect(hasActiveLinkedPlans('v1', plans)).toBe(true);
  });

  it('returns true when an active plan links via legacy single-link field', () => {
    const plans = [mkPlan({
      id: 'p1',
      stage: 'in_progress',
      compliance: { noiseVariance: { linkedVarianceId: 'v1' } },
    } as unknown as Plan)];
    expect(hasActiveLinkedPlans('v1', plans)).toBe(true);
  });

  it('prefers multi-link field over legacy single-link', () => {
    const plans = [mkPlan({
      id: 'p1',
      stage: 'in_progress',
      compliance: { noiseVariance: { linkedVarianceIds: ['v2'], linkedVarianceId: 'v1' } },
    } as unknown as Plan)];
    // v2 is the only valid link — v1 legacy is overridden
    expect(hasActiveLinkedPlans('v1', plans)).toBe(false);
    expect(hasActiveLinkedPlans('v2', plans)).toBe(true);
  });

  it('returns false when the linking plan is in a terminal stage', () => {
    const plans = [mkPlan({
      id: 'p1',
      stage: 'approved', // terminal
      compliance: { noiseVariance: { linkedVarianceIds: ['v1'] } },
    } as unknown as Plan)];
    expect(hasActiveLinkedPlans('v1', plans)).toBe(false);
  });

  it('returns false when no plan links to this specific root', () => {
    const plans = [mkPlan({
      id: 'p1',
      stage: 'in_progress',
      compliance: { noiseVariance: { linkedVarianceIds: ['v2', 'v3'] } },
    } as unknown as Plan)];
    expect(hasActiveLinkedPlans('v1', plans)).toBe(false);
  });
});
