/**
 * Similar-plan detection for the New LOC Request modal.
 *
 * Pure module — no React, no Firebase. Tested in `similarity.test.ts`.
 *
 * Two-tier similarity:
 *   - "exact":  both streets match (either orientation)    → hard warning, acknowledgment required
 *   - "near":   at least one street matches                → informational banner
 *
 * Renewal handling: when the new request is a renewal (parentLocId set),
 * the parent plan and all of its dot-revisions (LOC-345, LOC-345.1, LOC-345.2…)
 * are excluded from the similarity scan. They share the address by design
 * and are not duplicates.
 */
import type { Plan } from '../../types';

export interface SimilarityResult {
  exact: Plan[];
  near: Plan[];
}

/** Lowercase, collapse whitespace, and normalize common street-suffix aliases. */
export function normalizeStreet(s: string): string {
  return s.toLowerCase().trim()
    .replace(/\bstreet\b/g, 'st')
    .replace(/\bavenue\b/g, 'ave')
    .replace(/\bboulevard\b/g, 'blvd')
    .replace(/\bdrive\b/g, 'dr')
    .replace(/\broad\b/g, 'rd')
    .replace(/\bplace\b/g, 'pl')
    .replace(/\s+/g, ' ');
}

/** Has the plan's implementation window ended? Falls back to soft window if hard is missing. */
export function isPlanExpired(plan: Plan): boolean {
  const end = plan.implementationWindow?.endDate || plan.softImplementationWindow?.endDate;
  if (!end) return false;
  return new Date(end) < new Date();
}

/**
 * Scan `plans` for matches against the given street pair.
 *
 * @param street1     Primary street (required to return anything — empty → empty result)
 * @param street2     Cross street (optional)
 * @param parentLocId When this is a renewal, LOC of the plan being renewed — the
 *                    entire renewal family (parent + all `.N` revisions) is excluded.
 * @param plans       Full plan list to scan
 */
export function findSimilarPlans(
  street1: string,
  street2: string,
  parentLocId: string | undefined,
  plans: Plan[]
): SimilarityResult {
  const s1 = normalizeStreet(street1 || '');
  if (!s1) return { exact: [], near: [] };
  const s2 = normalizeStreet(street2 || '');

  const renewalBase = parentLocId ? parentLocId.split('.')[0] : null;
  const isFamilyMember = (p: Plan): boolean => {
    if (!renewalBase) return false;
    const loc = p.loc || p.id;
    return loc === renewalBase || loc.startsWith(renewalBase + '.');
  };

  const exact: Plan[] = [];
  const near: Plan[] = [];

  for (const p of plans) {
    if (isFamilyMember(p)) continue;
    const p1 = normalizeStreet(p.street1 || '');
    const p2 = normalizeStreet(p.street2 || '');

    const isExact = (s1 === p1 && s2 === p2) || (s1 === p2 && s2 === p1);
    if (isExact) {
      exact.push(p);
      continue;
    }

    const oneMatches = s1 === p1 || s1 === p2 || (s2 && (s2 === p1 || s2 === p2));
    if (oneMatches) near.push(p);
  }

  return { exact, near };
}
