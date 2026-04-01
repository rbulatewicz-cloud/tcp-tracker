// ── ESFV Corridor data ────────────────────────────────────────────────────────
// Ordered west-to-east (south to north geographically) along Van Nuys Blvd

export interface CorridorStreet {
  name: string;        // display name  e.g. "Oxnard St"
  normalized: string;  // for plan-field matching
  aliases: string[];   // alternate normalizations
  segment: string;     // "A1" | "A2" | "B1" etc.
  station?: string;    // station name if present
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b(street|avenue|boulevard|road|drive|place)\b/g, '')
    .replace(/\b(st|ave|blvd|rd|dr|pl)\b\.?/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Build an entry — aliases auto-populated from common abbreviation patterns
function s(
  name: string,
  segment: string,
  extra: string[] = [],
  station?: string
): CorridorStreet {
  const n = norm(name);
  // also generate alias without any suffix word
  const short = name.toLowerCase().replace(/\s+(st|ave|blvd|rd|dr|pl|street|avenue|boulevard|road)\.?\s*$/i, '').trim();
  const aliases = Array.from(new Set([n, short, ...extra.map(e => norm(e)), ...extra]));
  return { name, normalized: n, aliases, segment, station };
}

export const CORRIDOR_STREETS: CorridorStreet[] = [
  // ── Segment A1 ──────────────────────────────────────────────────────────────
  s('Oxnard St',      'A1'),
  s('Aetna St',       'A1'),
  s('Bessemer St',    'A1'),
  s('Calvert St',     'A1'),
  s('Delano St',      'A1'),
  s('Erwin St',       'A1'),
  s('Sylvan St',      'A1'),
  s('Friar St',       'A1'),
  s('Victory Blvd',   'A1', ['victory blvd', 'victory'], 'Victory Station'),
  s('Gilmore St',     'A1'),
  s('Hamlin St',      'A1'),
  s('Haynes St',      'A1'),
  s('Kittridge St',   'A1'),
  s('Archwood St',    'A1'),

  // ── Segment A2 ──────────────────────────────────────────────────────────────
  s('Vanowen St',     'A2', ['vanowen'], 'Vanowen Station'),
  s('Hartland St',    'A2'),
  s('Hart St',        'A2'),
  s('Vose St',        'A2'),
  s('Gault St',       'A2'),
  s('Sherman Way',    'A2', ['sherman way', 'sherman'], 'Sherman Way Station'),
  s('Wyandotte St',   'A2'),
  s('Valerio St',     'A2'),
  s('Pacoima Wash',   'A2', ['pacoima wash', 'pacoima wash culvert']),

  // ── Segment B1 ──────────────────────────────────────────────────────────────
  s('Covello St',     'B1'),
  s('Saticoy St',     'B1', [], 'Van Nuys / Metrolink Station'),
  s('Keswick St',     'B1'),
  s('Raymer St',      'B1'),
  s('Arminta St',     'B1'),
  s('Michaels St',    'B1', ['michael st', 'michaels']),
  s('Blythe St',      'B1'),
  s('Lorne St',       'B1'),

  // ── Segment B2 ──────────────────────────────────────────────────────────────
  s('Lanark St',      'B2'),
  s('Titus St',       'B2'),
  s('Roscoe Blvd',    'B2', ['roscoe'], 'Roscoe Station'),
  s('Chase St',       'B2'),
  s('Tobias St',      'B2'),
  s('Parthenia St',   'B2'),

  // ── Segment B3 ──────────────────────────────────────────────────────────────
  s('Rayen St',       'B3'),
  s('Osborne St',     'B3'),
  s('Nordhoff St',    'B3', ['nordhoff'], 'Nordhoff Station'),
  s('Tupper St',      'B3'),
  s('Vincennes St',   'B3'),
  s('Gledhill St',    'B3'),
  s('Plummer St',     'B3'),
  s('Novice St',      'B3'),

  // ── Segment C1 ──────────────────────────────────────────────────────────────
  s('Vesper Ave',     'C1'),
  s('Woodman Ave',    'C1', [], 'Woodman Station'),
  s('Canterbury Ave', 'C1'),
  s('Beachy Ave',     'C1'),

  // ── Segment C2 ──────────────────────────────────────────────────────────────
  s('Arleta Ave',     'C2', [], 'Arleta Station'),
  s('Lev Ave',        'C2'),
  s('Bartee Ave',     'C2'),
  s('Vena Ave',       'C2'),
  s('Remick Ave',     'C2'),

  // ── Segment C3 ──────────────────────────────────────────────────────────────
  s('Laurel Canyon Blvd', 'C3', ['laurel canyon'], 'Laurel Canyon Station'),
  s('Rincon Ave',     'C3'),
  s('Amboy Ave',      'C3'),
  s("O'Melveny Ave",  'C3', ['omelveny', 'o melveny']),
  s('Haddon Ave',     'C3'),
  s('Oneida Ave',     'C3'),
  s('Kewen Ave',      'C3'),
  s('Cayuga Ave',     'C3'),
  s('Telfair Ave',    'C3'),
  s('Tamarack Ave',   'C3'),
  s('El Dorado Ave',  'C3', ['el dorado']),
  s('Ilex Ave',       'C3'),
  s('San Fernando Rd','C3', ['san fernando'], 'Van Nuys / San Fernando Station'),
];

export const SEGMENT_META: Record<string, { label: string; color: string; accent: string }> = {
  A1: { label: 'Segment A1', color: '#EFF6FF', accent: '#3B82F6' },
  A2: { label: 'Segment A2', color: '#EDE9FE', accent: '#7C3AED' },
  B1: { label: 'Segment B1', color: '#FFFBEB', accent: '#D97706' },
  B2: { label: 'Segment B2', color: '#FFF1F2', accent: '#E11D48' },
  B3: { label: 'Segment B3', color: '#F0FDF4', accent: '#15803D' },
  C1: { label: 'Segment C1', color: '#E0F2FE', accent: '#0284C7' },
  C2: { label: 'Segment C2', color: '#FFF7ED', accent: '#EA580C' },
  C3: { label: 'Segment C3', color: '#F8FAFC', accent: '#475569' },
};

/** Normalize a plan street field for matching against the corridor */
export function normalizeStreet(raw: string): string {
  return norm(raw || '');
}

/** Return the 0-based index of a street in CORRIDOR_STREETS, or -1 if not found */
export function getStreetIndex(raw: string): number {
  if (!raw?.trim()) return -1;
  const n = normalizeStreet(raw);
  return CORRIDOR_STREETS.findIndex(
    cs => cs.normalized === n || cs.aliases.includes(n) || cs.aliases.includes(raw.toLowerCase().trim())
  );
}

/** Stage display colours for corridor pills */
export const STAGE_PILL: Record<string, { bg: string; text: string; border: string }> = {
  requested:          { bg: '#F1F5F9', text: '#475569', border: '#CBD5E1' },
  drafting:           { bg: '#DBEAFE', text: '#1D4ED8', border: '#93C5FD' },
  submitted_to_dot:   { bg: '#FEF3C7', text: '#B45309', border: '#FCD34D' },
  submitted:          { bg: '#FEF3C7', text: '#B45309', border: '#FCD34D' },
  dot_review:         { bg: '#FEE2E2', text: '#B91C1C', border: '#FCA5A5' },
  tcp_approved:       { bg: '#EDE9FE', text: '#6D28D9', border: '#C4B5FD' },
  loc_submitted:      { bg: '#CFFAFE', text: '#0E7490', border: '#67E8F9' },
  loc_review:         { bg: '#FEE2E2', text: '#B91C1C', border: '#FCA5A5' },
  plan_approved:      { bg: '#DCFCE7', text: '#15803D', border: '#86EFAC' },
  approved:           { bg: '#DCFCE7', text: '#15803D', border: '#86EFAC' },
  expired:            { bg: '#FEE2E2', text: '#991B1B', border: '#FECACA' },
  resubmitted:        { bg: '#FEF3C7', text: '#B45309', border: '#FCD34D' },
  resubmit_review:    { bg: '#FEE2E2', text: '#B91C1C', border: '#FCA5A5' },
  tcp_approved_final: { bg: '#DCFCE7', text: '#15803D', border: '#86EFAC' },
  closed:             { bg: '#F8FAFC', text: '#94A3B8', border: '#E2E8F0' },
};

export function getStagePill(stage: string) {
  return STAGE_PILL[stage] ?? { bg: '#F8FAFC', text: '#64748B', border: '#E2E8F0' };
}
