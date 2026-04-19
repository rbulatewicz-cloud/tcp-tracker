import { describe, it, expect } from 'vitest';
import {
  suggestCDsFromStreets,
  detectComplianceTriggers,
  buildPHEChecklist,
  initializeComplianceTracks,
  pheProgress,
  cdProgress,
} from './compliance';
import type {
  WorkHours,
  PHETrack,
  CDConcurrenceTrack,
  PlanCompliance,
  ComplianceStatus,
} from '../types';

// ── suggestCDsFromStreets ─────────────────────────────────────────────────────

describe('suggestCDsFromStreets', () => {
  it('flags CD7 for Pacoima / northern corridor streets', () => {
    expect(suggestCDsFromStreets('Van Nuys Blvd', 'San Fernando Rd')).toContain('CD7');
  });

  it('flags CD6 for central corridor streets (Sherman Way)', () => {
    expect(suggestCDsFromStreets('Van Nuys Blvd', 'Sherman Way')).toContain('CD6');
  });

  it('flags CD2 for southern corridor streets (Oxnard)', () => {
    expect(suggestCDsFromStreets('Van Nuys Blvd', 'Oxnard St')).toContain('CD2');
  });

  it('defaults to all three when no keywords match', () => {
    expect(suggestCDsFromStreets('Unknown St', 'Mystery Ave')).toEqual(['CD2', 'CD6', 'CD7']);
  });
});

// ── detectComplianceTriggers — PHE (peak hour) ────────────────────────────────

function wh(overrides: Partial<WorkHours>): WorkHours {
  return {
    shift: 'daytime',
    days: ['weekday'],
    ...overrides,
  } as WorkHours;
}

describe('detectComplianceTriggers — PHE', () => {
  it('does NOT trigger PHE for weekday work that skips peak windows', () => {
    // 9 AM – 3 PM fits in the gap between peak AM (6-9) and peak PM (15:30-19)
    const t = detectComplianceTriggers({
      work_hours: wh({ weekday_start: '09:00', weekday_end: '15:00' }),
    });
    expect(t.phe).toBe(false);
  });

  it('triggers PHE for weekday work overlapping peak AM', () => {
    const t = detectComplianceTriggers({
      work_hours: wh({ weekday_start: '06:00', weekday_end: '08:00' }),
    });
    expect(t.phe).toBe(true);
  });

  it('triggers PHE for weekday work overlapping peak PM', () => {
    const t = detectComplianceTriggers({
      work_hours: wh({ weekday_start: '15:00', weekday_end: '17:00' }),
    });
    expect(t.phe).toBe(true);
  });

  it('does NOT trigger PHE for weekend-only work (peak rules are Mon–Fri)', () => {
    const t = detectComplianceTriggers({
      work_hours: wh({
        days: ['saturday'],
        saturday_start: '06:00',
        saturday_end: '10:00',
      }),
    });
    expect(t.phe).toBe(false);
  });
});

// ── detectComplianceTriggers — NV (noise variance) ────────────────────────────

describe('detectComplianceTriggers — noise variance', () => {
  it('triggers NV for weekday work starting after 9 PM', () => {
    const t = detectComplianceTriggers({
      work_hours: wh({ shift: 'nighttime', weekday_start: '22:00', weekday_end: '03:00' }),
    });
    expect(t.noiseVariance).toBe(true);
  });

  it('always triggers NV for Sunday work', () => {
    const t = detectComplianceTriggers({
      work_hours: wh({
        days: ['sunday'],
        sunday_start: '10:00',
        sunday_end: '14:00',
      }),
    });
    expect(t.noiseVariance).toBe(true);
  });

  it('triggers NV for Saturday work before 8 AM', () => {
    const t = detectComplianceTriggers({
      work_hours: wh({
        days: ['saturday'],
        saturday_start: '06:00',
        saturday_end: '10:00',
      }),
    });
    expect(t.noiseVariance).toBe(true);
  });

  it('does NOT trigger NV for midday weekday work', () => {
    const t = detectComplianceTriggers({
      work_hours: wh({ weekday_start: '10:00', weekday_end: '15:00' }),
    });
    expect(t.noiseVariance).toBe(false);
  });
});

// ── detectComplianceTriggers — CD + driveway ──────────────────────────────────

describe('detectComplianceTriggers — CD and driveway', () => {
  it('triggers CD concurrence for full closures', () => {
    const t = detectComplianceTriggers({ impact_fullClosure: true });
    expect(t.cdConcurrence).toBe(true);
    expect(t.cdReasons.some(r => /full street closure/i.test(r))).toBe(true);
  });

  it('triggers CD concurrence for directional closures', () => {
    const t = detectComplianceTriggers({ dir_directional: true });
    expect(t.cdConcurrence).toBe(true);
  });

  it('auto-adds CD concurrence when PHE is triggered', () => {
    const t = detectComplianceTriggers({
      work_hours: wh({ weekday_start: '07:00', weekday_end: '08:00' }),
    });
    expect(t.phe).toBe(true);
    expect(t.cdConcurrence).toBe(true);
    expect(t.cdReasons.some(r => /PHE/i.test(r))).toBe(true);
  });

  it('triggers driveway notice track when impact_driveway is set', () => {
    const t = detectComplianceTriggers({ impact_driveway: true });
    expect(t.drivewayNotices).toBe(true);
  });

  it('returns all-false triggers for a bare plan with no signals', () => {
    const t = detectComplianceTriggers({});
    expect(t.phe).toBe(false);
    expect(t.noiseVariance).toBe(false);
    expect(t.cdConcurrence).toBe(false);
    expect(t.drivewayNotices).toBe(false);
  });
});

// ── buildPHEChecklist ─────────────────────────────────────────────────────────

describe('buildPHEChecklist', () => {
  it('returns a fresh (all-incomplete) checklist on every call', () => {
    const a = buildPHEChecklist();
    const b = buildPHEChecklist();
    expect(a.every(i => i.completed === false)).toBe(true);
    // Mutating one should not affect the other — important for per-plan isolation
    a[0].completed = true;
    expect(b[0].completed).toBe(false);
  });

  it('includes both required and conditional items', () => {
    const items = buildPHEChecklist();
    expect(items.some(i => i.required === true)).toBe(true);
    expect(items.some(i => i.required === false)).toBe(true);
  });
});

// ── initializeComplianceTracks ────────────────────────────────────────────────

describe('initializeComplianceTracks', () => {
  it('creates tracks for every active trigger', () => {
    const c = initializeComplianceTracks({
      phe: true,
      pheReasons: ['peak'],
      noiseVariance: true,
      nvReasons: ['night'],
      cdConcurrence: true,
      cdReasons: ['closure'],
      drivewayNotices: true,
      drivewayReasons: ['driveway'],
    });
    expect(c.phe).toBeDefined();
    expect(c.noiseVariance).toBeDefined();
    expect(c.cdConcurrence).toBeDefined();
    expect(c.drivewayNotices).toBeDefined();
  });

  it('preserves existing tracks (does not overwrite user progress)', () => {
    const existing: PlanCompliance = {
      phe: {
        status: 'in_progress' as ComplianceStatus,
        triggeredBy: ['old reason'],
        checklist: [],
      } as PHETrack,
    };
    const c = initializeComplianceTracks(
      {
        phe: true,
        pheReasons: ['new reason'],
        noiseVariance: false,
        nvReasons: [],
        cdConcurrence: false,
        cdReasons: [],
        drivewayNotices: false,
        drivewayReasons: [],
      },
      existing
    );
    // Existing in-progress track is kept — triggeredBy is NOT replaced
    expect(c.phe?.status).toBe('in_progress');
    expect(c.phe?.triggeredBy).toEqual(['old reason']);
  });

  it('does NOT recreate a track that was explicitly set to null (user removed)', () => {
    const existing: PlanCompliance = { phe: null as unknown as PHETrack };
    const c = initializeComplianceTracks(
      {
        phe: true,
        pheReasons: ['new reason'],
        noiseVariance: false,
        nvReasons: [],
        cdConcurrence: false,
        cdReasons: [],
        drivewayNotices: false,
        drivewayReasons: [],
      },
      existing
    );
    expect(c.phe).toBeNull();
  });
});

// ── Progress helpers ──────────────────────────────────────────────────────────

describe('pheProgress', () => {
  it('counts required + not-N/A items only', () => {
    const phe: PHETrack = {
      status: 'not_started' as ComplianceStatus,
      triggeredBy: [],
      checklist: [
        { id: '1', label: 'A', description: '', required: true,  completed: true  },
        { id: '2', label: 'B', description: '', required: true,  completed: false },
        { id: '3', label: 'C', description: '', required: false, completed: false, notApplicable: true },
      ],
    };
    expect(pheProgress(phe)).toEqual({ done: 1, total: 2, pct: 50 });
  });

  it('returns 0% when the checklist is empty', () => {
    const phe: PHETrack = {
      status: 'not_started' as ComplianceStatus,
      triggeredBy: [],
      checklist: [],
    };
    expect(pheProgress(phe)).toEqual({ done: 0, total: 0, pct: 0 });
  });
});

describe('cdProgress', () => {
  it('counts only applicable CDs', () => {
    const cds: CDConcurrenceTrack['cds'] = [
      { cd: 'CD2', applicable: true,  status: 'concurred' },
      { cd: 'CD6', applicable: true,  status: 'pending'   },
      { cd: 'CD7', applicable: false, status: 'na'        },
    ];
    expect(cdProgress(cds)).toEqual({ done: 1, total: 2, pct: 50 });
  });
});
