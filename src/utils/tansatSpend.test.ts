import { describe, it, expect } from 'vitest';
import {
  getActualPostingDate,
  getBusinessDaysUntil,
  getMonthlySpend,
  getMonthlySpendTrend,
  getRequestsByStatus,
  getRequestsNeedingAttention,
  getTotalPaid,
  getCurrentMonthKey,
} from './tansatSpend';
import type { TansatRequest, Plan, PlanTansatPhase, TansatSettings } from '../types';
import { DEFAULT_TANSAT_SETTINGS } from '../constants';

// Fixed reference date for deterministic tests: Wed Apr 29, 2026
const NOW = new Date('2026-04-29T12:00:00').getTime();

// ── helpers ──────────────────────────────────────────────────────────────────

function mkRequest(partial: Partial<TansatRequest>): TansatRequest {
  return {
    id: partial.id ?? `req_${Math.random()}`,
    phaseNumbers: [],
    activity: 'potholing',
    workArea: { side: 'BOTH', street: '', fromLimit: '', toLimit: '' },
    schedule: { dayPattern: 'daily', startDate: '', startTime: '', endDate: '', endTime: '' },
    status: 'draft',
    createdBy: 'test',
    createdAt: '2026-04-01T00:00:00Z',
    updatedAt: '2026-04-01T00:00:00Z',
    ...partial,
  } as TansatRequest;
}

function mkPlan(id: string, phases: Partial<PlanTansatPhase>[] = []): Plan {
  return {
    id,
    loc: id,
    tansatPhases: phases.map((p, i) => ({
      phaseNumber: p.phaseNumber ?? i + 1,
      label: p.label,
      anticipatedStart: p.anticipatedStart,
      anticipatedEnd: p.anticipatedEnd,
      needsTansat: p.needsTansat ?? true,
    })),
  } as unknown as Plan;
}

const settings: TansatSettings = DEFAULT_TANSAT_SETTINGS as TansatSettings;

// ── getActualPostingDate ─────────────────────────────────────────────────────

describe('getActualPostingDate', () => {
  it('rolls Sunday start back to previous Friday (-2 days)', () => {
    // 2026-05-03 is a Sunday → posted 2026-05-01 (Friday)
    expect(getActualPostingDate('2026-05-03')).toBe('2026-05-01');
  });

  it('rolls Monday start back to previous Friday (-3 days)', () => {
    // 2026-05-04 is a Monday → posted 2026-05-01 (Friday)
    expect(getActualPostingDate('2026-05-04')).toBe('2026-05-01');
  });

  it('rolls Tuesday start back to previous Friday (-4 days)', () => {
    // 2026-05-05 is a Tuesday → posted 2026-05-01 (Friday)
    expect(getActualPostingDate('2026-05-05')).toBe('2026-05-01');
  });

  it('Wednesday start posts 2 days prior (Monday)', () => {
    // 2026-05-06 is Wednesday → posted 2026-05-04 (Monday)
    expect(getActualPostingDate('2026-05-06')).toBe('2026-05-04');
  });

  it('Saturday start posts 2 days prior (Thursday)', () => {
    // 2026-05-09 is Saturday → posted 2026-05-07 (Thursday)
    expect(getActualPostingDate('2026-05-09')).toBe('2026-05-07');
  });

  it('returns empty string for invalid input', () => {
    expect(getActualPostingDate('')).toBe('');
    expect(getActualPostingDate('not-a-date')).toBe('');
  });
});

// ── getBusinessDaysUntil ─────────────────────────────────────────────────────

describe('getBusinessDaysUntil', () => {
  it('returns 0 when target is today or in the past', () => {
    expect(getBusinessDaysUntil('2026-04-29', NOW)).toBe(0);
    expect(getBusinessDaysUntil('2026-04-01', NOW)).toBe(0);
  });

  it('counts only weekdays', () => {
    // Wed 4/29 → Mon 5/4 = 4 weekdays (Thu, Fri, Mon — sat/sun skipped — and Mon itself)
    // Days after start: Thu, Fri, Sat, Sun, Mon → Thu, Fri, Mon are business = 3
    expect(getBusinessDaysUntil('2026-05-04', NOW)).toBe(3);
  });

  it('handles 10 business days exactly (extension window default)', () => {
    // Wed 4/29 → 10 business days → Wed 5/13
    expect(getBusinessDaysUntil('2026-05-13', NOW)).toBe(10);
  });
});

// ── getCurrentMonthKey ───────────────────────────────────────────────────────

describe('getCurrentMonthKey', () => {
  it('returns YYYY-MM for the given timestamp', () => {
    expect(getCurrentMonthKey(NOW)).toBe('2026-04');
  });

  it('zero-pads single-digit months', () => {
    const jan = new Date('2026-01-15T00:00:00').getTime();
    expect(getCurrentMonthKey(jan)).toBe('2026-01');
  });
});

// ── getMonthlySpend ──────────────────────────────────────────────────────────

describe('getMonthlySpend', () => {
  it('sums paidAmount for the given month', () => {
    const r = [
      mkRequest({ paidAt: '2026-04-10', paidAmount: 100 }),
      mkRequest({ paidAt: '2026-04-22', paidAmount: 250 }),
      mkRequest({ paidAt: '2026-03-30', paidAmount: 9999 }), // outside
      mkRequest({ paidAt: '2026-04-01', paidAmount: 50 }),
    ];
    const result = getMonthlySpend(r, '2026-04');
    expect(result.total).toBe(400);
    expect(result.count).toBe(3);
  });

  it('ignores requests without paidAt or paidAmount', () => {
    const r = [
      mkRequest({ paidAt: '2026-04-10' }),                      // no paidAmount
      mkRequest({ paidAmount: 100 }),                            // no paidAt
      mkRequest({ paidAt: '2026-04-15', paidAmount: 200 }),
    ];
    const result = getMonthlySpend(r, '2026-04');
    expect(result.total).toBe(200);
    expect(result.count).toBe(1);
  });
});

// ── getMonthlySpendTrend ─────────────────────────────────────────────────────

describe('getMonthlySpendTrend', () => {
  it('seeds 6 empty months ending at the current month', () => {
    const buckets = getMonthlySpendTrend([], 6, NOW);
    expect(buckets.length).toBe(6);
    expect(buckets[5].monthKey).toBe('2026-04');
    expect(buckets[0].monthKey).toBe('2025-11');
    expect(buckets.every(b => b.total === 0)).toBe(true);
  });

  it('aggregates totals by month and activity', () => {
    const r = [
      mkRequest({ paidAt: '2026-04-10', paidAmount: 100, activity: 'potholing' }),
      mkRequest({ paidAt: '2026-04-22', paidAmount: 250, activity: 'paving' }),
      mkRequest({ paidAt: '2026-03-30', paidAmount: 50, activity: 'potholing' }),
    ];
    const buckets = getMonthlySpendTrend(r, 6, NOW);
    const apr = buckets.find(b => b.monthKey === '2026-04')!;
    expect(apr.total).toBe(350);
    expect(apr.count).toBe(2);
    expect(apr.byActivity.potholing).toBe(100);
    expect(apr.byActivity.paving).toBe(250);
    const mar = buckets.find(b => b.monthKey === '2026-03')!;
    expect(mar.total).toBe(50);
  });
});

// ── getRequestsNeedingAttention ──────────────────────────────────────────────

describe('getRequestsNeedingAttention — needs_packet', () => {
  it('flags phases starting within threshold with no covering request', () => {
    const plan = mkPlan('LOC-100', [
      { phaseNumber: 1, anticipatedStart: '2026-05-08', needsTansat: true }, // 9 days → flag
      { phaseNumber: 2, anticipatedStart: '2026-06-01', needsTansat: true }, // 33 days → no flag (threshold 14)
    ]);
    const items = getRequestsNeedingAttention([plan], [], settings, NOW);
    expect(items.length).toBe(1);
    expect(items[0].reason).toBe('needs_packet');
    expect(items[0].plan?.id).toBe('LOC-100');
    expect(items[0].phase?.phaseNumber).toBe(1);
  });

  it('does not flag phase already covered by an active request', () => {
    const plan = mkPlan('LOC-100', [
      { phaseNumber: 1, anticipatedStart: '2026-05-05', needsTansat: true },
    ]);
    const requests = [mkRequest({ planId: 'LOC-100', phaseNumbers: [1], status: 'paid' })];
    const items = getRequestsNeedingAttention([plan], requests, settings, NOW);
    expect(items.filter(i => i.reason === 'needs_packet')).toHaveLength(0);
  });

  it('cancelled or expired requests do NOT count as covering', () => {
    const plan = mkPlan('LOC-100', [
      { phaseNumber: 1, anticipatedStart: '2026-05-05', needsTansat: true },
    ]);
    const requests = [mkRequest({ planId: 'LOC-100', phaseNumbers: [1], status: 'cancelled' })];
    const items = getRequestsNeedingAttention([plan], requests, settings, NOW);
    expect(items.filter(i => i.reason === 'needs_packet')).toHaveLength(1);
  });

  it('skips phases marked needsTansat=false', () => {
    const plan = mkPlan('LOC-100', [
      { phaseNumber: 1, anticipatedStart: '2026-05-05', needsTansat: false },
    ]);
    const items = getRequestsNeedingAttention([plan], [], settings, NOW);
    expect(items.length).toBe(0);
  });
});

describe('getRequestsNeedingAttention — awaiting_invoice', () => {
  it('flags emailed requests waiting longer than threshold', () => {
    const r = [
      mkRequest({ status: 'emailed', emailSentAt: '2026-04-10T00:00:00Z' }), // 19 days
      mkRequest({ status: 'emailed', emailSentAt: '2026-04-25T00:00:00Z' }), // 4 days — not yet
    ];
    const items = getRequestsNeedingAttention([], r, settings, NOW);
    expect(items.filter(i => i.reason === 'awaiting_invoice')).toHaveLength(1);
  });
});

describe('getRequestsNeedingAttention — payment_due', () => {
  it('flags overdue and soon-due payments', () => {
    const r = [
      mkRequest({ status: 'invoice_received', paymentDueDate: '2026-05-01' }), // 2 days
      mkRequest({ status: 'invoice_received', paymentDueDate: '2026-04-25' }), // overdue
      mkRequest({ status: 'invoice_received', paymentDueDate: '2026-05-15' }), // 16 days — not yet
    ];
    const items = getRequestsNeedingAttention([], r, settings, NOW);
    const due = items.filter(i => i.reason === 'payment_due');
    expect(due).toHaveLength(2);
    expect(due.every(i => i.severity === 'red')).toBe(true);
  });
});

describe('getRequestsNeedingAttention — extension_window', () => {
  it('flags phases ending in <= 10 business days with no extension', () => {
    const r = [
      mkRequest({
        status: 'paid',
        schedule: { dayPattern: 'daily', startDate: '2026-04-15', startTime: '06:00', endDate: '2026-05-13', endTime: '18:00' },
      }),
    ];
    const items = getRequestsNeedingAttention([], r, settings, NOW);
    expect(items.filter(i => i.reason === 'extension_window')).toHaveLength(1);
  });

  it('does not flag if an active extension exists', () => {
    const r = [
      mkRequest({
        status: 'paid',
        schedule: { dayPattern: 'daily', startDate: '2026-04-15', startTime: '06:00', endDate: '2026-05-08', endTime: '18:00' },
        extensions: [{ id: 'e1', requestedAt: '2026-04-20', newEndDate: '2026-05-15', status: 'sent' }],
      }),
    ];
    const items = getRequestsNeedingAttention([], r, settings, NOW);
    expect(items.filter(i => i.reason === 'extension_window')).toHaveLength(0);
  });
});

describe('getRequestsNeedingAttention — closeout_pending', () => {
  it('flags requests where end date passed and not closed', () => {
    const r = [
      mkRequest({
        status: 'active',
        schedule: { dayPattern: 'daily', startDate: '2026-03-01', startTime: '06:00', endDate: '2026-04-15', endTime: '18:00' },
      }),
    ];
    const items = getRequestsNeedingAttention([], r, settings, NOW);
    expect(items.filter(i => i.reason === 'closeout_pending')).toHaveLength(1);
  });

  it('skips requests already closed or cancelled', () => {
    const r = [
      mkRequest({
        status: 'closed',
        schedule: { dayPattern: 'daily', startDate: '2026-03-01', startTime: '06:00', endDate: '2026-04-15', endTime: '18:00' },
      }),
    ];
    const items = getRequestsNeedingAttention([], r, settings, NOW);
    expect(items.filter(i => i.reason === 'closeout_pending')).toHaveLength(0);
  });
});

describe('getRequestsNeedingAttention — sorting', () => {
  it('sorts red before amber before gray', () => {
    const plan = mkPlan('LOC-100', [
      { phaseNumber: 1, anticipatedStart: '2026-05-05', needsTansat: true }, // amber needs_packet (6 days)
    ]);
    const r = [
      mkRequest({ status: 'invoice_received', paymentDueDate: '2026-05-01', logNumber: '999' }), // red payment_due
      mkRequest({
        status: 'active',
        schedule: { dayPattern: 'daily', startDate: '2026-03-01', startTime: '06:00', endDate: '2026-04-15', endTime: '18:00' },
      }), // gray closeout
    ];
    const items = getRequestsNeedingAttention([plan], r, settings, NOW);
    expect(items[0].severity).toBe('red');
    expect(items[items.length - 1].severity).toBe('gray');
  });
});

// ── getRequestsByStatus / getTotalPaid ──────────────────────────────────────

describe('getRequestsByStatus', () => {
  it('filters to the matching statuses', () => {
    const r = [
      mkRequest({ status: 'paid' }),
      mkRequest({ status: 'paid' }),
      mkRequest({ status: 'draft' }),
    ];
    expect(getRequestsByStatus(r, 'paid').length).toBe(2);
    expect(getRequestsByStatus(r, 'paid', 'draft').length).toBe(3);
  });
});

describe('getTotalPaid', () => {
  it('sums paidAmount across requests, ignoring null/undefined', () => {
    const r = [
      mkRequest({ paidAmount: 100 }),
      mkRequest({ paidAmount: 250 }),
      mkRequest({}),
    ];
    expect(getTotalPaid(r)).toBe(350);
  });
});
