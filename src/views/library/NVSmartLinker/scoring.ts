/**
 * Noise Variance → Plan match scoring.
 *
 * Pure module — no React, no Firebase. Tested in `scoring.test.ts`.
 *
 * Six weighted signals score how well a NoiseVariance covers a Plan's scope:
 *   - segment (+5): plan's segment is in variance.coveredSegments — primary anchor
 *   - scope   (+2): generic variance, OR plan.scope ∈ variance.coveredScopes
 *   - date    (+1): plan.needByDate falls within variance validity window
 *   - hours   (+2): plan does night work AND variance covers nights
 *   - streets (+4): structured street match (coveredStreets + verifiedStreets)
 *   - location(+1): soft text search fallback on scopeLanguage (pre-rescan data)
 *
 * Max score = 14. Confidence tiers: 10+ strong, 6+ possible, 3+ weak, else none.
 *
 * NOTE: this module's `normalizeStreet` differs from `similarity.ts` — this one
 * STRIPS street suffixes entirely (so "Oxnard St" → "oxnard"), similarity.ts
 * COLLAPSES them to short form ("Oxnard Street" → "oxnard st"). Different
 * comparison strategies for different domains; don't merge.
 */
import type { Plan, NoiseVariance, NoiseVarianceTrack } from '../../../types';

export interface MatchSignals {
  segment: boolean;
  scope: boolean;
  date: boolean;
  hours: boolean;
  streets: boolean;   // structured street match from coveredStreets
  location: boolean;  // soft text match from scopeLanguage (fallback)
}

export interface MatchResult {
  variance: NoiseVariance;
  score: number;
  signals: MatchSignals;
}

/** Strip street-type suffixes and normalize whitespace. */
export function normalizeStreet(s: string): string {
  return s.toLowerCase()
    .replace(/\b(street|st|boulevard|blvd|avenue|ave|road|rd|drive|dr|lane|ln|way|wy)\b\.?/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** True if planStreet matches any of varianceStreets (loose containment). */
export function streetMatch(planStreet: string | undefined, varianceStreets: string[]): boolean {
  if (!planStreet || varianceStreets.length === 0) return false;
  const planNorm = normalizeStreet(planStreet);
  return varianceStreets.some(vs => {
    const vsNorm = normalizeStreet(vs);
    return vsNorm === planNorm || vsNorm.includes(planNorm) || planNorm.includes(vsNorm);
  });
}

/**
 * Score how well a NoiseVariance covers a Plan. See module header for signal weights.
 * Score is monotonic: adding more matching signals never lowers it.
 */
export function scoreMatch(plan: Plan, variance: NoiseVariance): MatchResult {
  let score = 0;
  const signals: MatchSignals = { segment: false, scope: false, date: false, hours: false, streets: false, location: false };

  // 1. Segment match (+5) — primary location anchor
  if (plan.segment && variance.coveredSegments.includes(plan.segment)) {
    score += 5; signals.segment = true;
  }

  // 2. Scope match (+2) — generic variances cover everything; correctness check
  if (variance.isGeneric || (plan.scope && variance.coveredScopes.includes(plan.scope))) {
    score += 2; signals.scope = true;
  }

  // 3. Date validity (+1) — soft freshness hint; variances get renewed so weight is low
  if (plan.needByDate && variance.validFrom && variance.validThrough) {
    const needBy = new Date(plan.needByDate);
    const from   = new Date(variance.validFrom);
    const thru   = new Date(variance.validThrough);
    if (needBy >= from && needBy <= thru) { score += 1; signals.date = true; }
  }

  // 4. Hours compatibility (+2) — plan does night work, variance covers nights
  const shift = plan.work_hours?.shift;
  const planHasNight = shift === 'nighttime' || shift === 'both' || shift === 'continuous';
  const varCoversNight = variance.applicableHours === 'nighttime' || variance.applicableHours === '24_7' || variance.applicableHours === 'both';
  if (planHasNight && varCoversNight) { score += 2; signals.hours = true; }

  // 5a. Structured street match (+4) — AI-extracted + human-verified streets
  // plan.expandedStreets lists all corridor cross streets between street1→street2, improving range match accuracy
  // variance.verifiedStreets are human-confirmed from PDF — treated with same confidence as coveredStreets
  const varStreets = [
    ...(variance.coveredStreets ?? []),
    ...(variance.verifiedStreets ?? []),
  ].filter((s, i, arr) => arr.indexOf(s) === i); // dedupe
  const planStreets = [plan.street1, plan.street2, ...(plan.expandedStreets ?? [])].filter((s): s is string => !!s);
  if (varStreets.length > 0) {
    if (planStreets.some(ps => streetMatch(ps, varStreets))) {
      score += 4; signals.streets = true;
    }
  } else {
    // 5b. Soft text match fallback (+1) — scopeLanguage text search (pre-rescan data)
    const scopeLang = (variance.scopeLanguage || '').toLowerCase();
    if (planStreets.some(s => scopeLang.includes(s.toLowerCase()))) {
      score += 1; signals.location = true;
    }
  }

  return { variance, score, signals };
}

/** Human-readable confidence tier for a match score. Colors are inline-style values. */
export function confidenceLabel(score: number): { label: string; color: string; bg: string } {
  if (score >= 10) return { label: 'Strong match',    color: '#166534', bg: '#DCFCE7' };
  if (score >= 6)  return { label: 'Possible match',  color: '#92400E', bg: '#FEF3C7' };
  if (score >= 3)  return { label: 'Weak match',      color: '#991B1B', bg: '#FEE2E2' };
  return              { label: 'No match signals', color: '#64748B', bg: '#F1F5F9' };
}

/**
 * Reads both legacy single-link and new multi-link fields transparently.
 * Returns the root variance IDs currently linked to this NV track, or [] if none.
 */
export function getLinkedVarianceIds(track: Pick<NoiseVarianceTrack, 'linkedVarianceIds' | 'linkedVarianceId'>): string[] {
  if (track.linkedVarianceIds && track.linkedVarianceIds.length > 0) return track.linkedVarianceIds;
  if (track.linkedVarianceId) return [track.linkedVarianceId];
  return [];
}
