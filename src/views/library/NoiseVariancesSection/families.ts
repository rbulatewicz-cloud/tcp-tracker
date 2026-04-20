/**
 * Pure grouping + link-status logic for the Noise Variances section.
 * No React, no Firebase — tested in `families.test.ts`.
 *
 * Variances live in a parent-child tree: a root has `parentVarianceId = null`,
 * revisions point their `parentVarianceId` at the root's id. A "family" is
 * a root plus all its revisions, split into the active one and the archived
 * history.
 */
import type { NoiseVariance, Plan } from '../../../types';
import { COMPLETED_STAGES } from '../../../constants';

export const TERMINAL_STAGES = new Set<string>(COMPLETED_STAGES);

export interface VarianceFamily {
  rootId: string;
  active: NoiseVariance;
  history: NoiseVariance[];
}

/**
 * Group a flat list of variances into root-keyed families. Within a family,
 * revisions are sorted high-to-low, the non-archived one is "active", the
 * rest go to history (already sorted).
 *
 * Top-level sort order (most-urgent first):
 *   1. Scanning variances first (they need attention)
 *   2. Then by `validThrough` ascending (expiring soonest first)
 *   3. Variances with no validThrough sink to the bottom
 */
export function buildFamilies(variances: NoiseVariance[]): VarianceFamily[] {
  const roots = variances.filter(v => !v.parentVarianceId);
  const byRoot: Record<string, NoiseVariance[]> = {};
  for (const v of variances) {
    const rootId = v.parentVarianceId ?? v.id;
    if (!byRoot[rootId]) byRoot[rootId] = [];
    byRoot[rootId].push(v);
  }
  const families: VarianceFamily[] = roots.map(root => {
    const members = byRoot[root.id] ?? [root];
    const sorted = [...members].sort((a, b) => b.revisionNumber - a.revisionNumber);
    const active = sorted.find(v => !v.isArchived) ?? sorted[0];
    const history = sorted.filter(v => v.isArchived);
    return { rootId: root.id, active, history };
  });
  families.sort((a, b) => {
    if (a.active.scanStatus === 'scanning' && b.active.scanStatus !== 'scanning') return -1;
    if (b.active.scanStatus === 'scanning' && a.active.scanStatus !== 'scanning') return 1;
    if (!a.active.validThrough && !b.active.validThrough) return 0;
    if (!a.active.validThrough) return 1;
    if (!b.active.validThrough) return -1;
    return a.active.validThrough.localeCompare(b.active.validThrough);
  });
  return families;
}

/**
 * True if any active (non-completed) plan is linked to the given variance root.
 * Reads both the legacy single-link field and the new multi-link array.
 */
export function hasActiveLinkedPlans(rootId: string, plans: Plan[]): boolean {
  return plans.some(p => {
    const track = p.compliance?.noiseVariance;
    if (!track) return false;
    const ids = track.linkedVarianceIds?.length
      ? track.linkedVarianceIds
      : track.linkedVarianceId ? [track.linkedVarianceId] : [];
    return ids.includes(rootId) && !TERMINAL_STAGES.has(p.stage);
  });
}
