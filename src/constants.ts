import { ReportTemplate, WorkDay } from './types';

export const DEFAULT_REPORT_TEMPLATE: ReportTemplate = {
  logo: null,
  companyName: "Company Name",
  address: "123 Main St",
  cityStateZip: "City, ST 12345",
  projectInfo: [],
  needByThresholds: {
    WATCH: 7,
    Standard: 14,
    Engineered: 21,
  },
};

export const STAGES = [
  { key: "requested", label: "Requested", color: "#6B7280" },
  { key: "drafting", label: "Drafting", color: "#3B82F6" },
  { key: "submitted", label: "Submitted to DOT", color: "#F59E0B" },
  { key: "approved", label: "Approved", color: "#10B981" },
];

// Full expanded status set for the new approval flow
export const ALL_STAGES = [
  { key: "requested",         label: "Requested",              color: "#6B7280" },
  { key: "drafting",          label: "Drafting",               color: "#3B82F6" },
  { key: "submitted_to_dot",  label: "Submitted to DOT",       color: "#F59E0B" },
  { key: "dot_review",        label: "DOT Review Cycle",       color: "#EF4444" },
  { key: "tcp_approved",      label: "TCP Approved",           color: "#8B5CF6" },
  { key: "loc_submitted",     label: "LOC Submitted",          color: "#06B6D4" },
  { key: "loc_review",        label: "LOC Review Cycle",       color: "#EF4444" },
  { key: "plan_approved",     label: "Plan Approved",          color: "#10B981" },
  { key: "expired",           label: "Expired",                color: "#DC2626" },
  { key: "resubmitted",       label: "Resubmitted",            color: "#F59E0B" },
  { key: "resubmit_review",   label: "Resubmit Review Cycle",  color: "#EF4444" },
  { key: "tcp_approved_final",label: "TCP Approved (Final)",   color: "#10B981" },
  { key: "closed",            label: "Closed Out",             color: "#64748B" },
  { key: "cancelled",         label: "Cancelled",              color: "#94A3B8" },
  // Legacy aliases — existing plans use these keys
  { key: "submitted",         label: "Submitted to DOT",       color: "#F59E0B" },
  { key: "approved",          label: "Plan Approved",          color: "#10B981" },
];

// Filter-only groupings — collapse "submitted" + "review cycle" pairs in the
// plans filter dropdown. Does NOT change the stage stored on a plan; only
// the plans-table filter predicate consumes these group keys.
export const STAGE_FILTER_GROUPS: Array<{ key: string; label: string; members: string[] }> = [
  { key: "group_at_dot",          label: "At DOT",          members: ["submitted_to_dot", "dot_review", "in_review"] },
  { key: "group_loc_at_dot",      label: "LOC at DOT",      members: ["loc_submitted", "loc_review"] },
  { key: "group_resubmit_at_dot", label: "Resubmit at DOT", members: ["resubmitted", "resubmit_review"] },
];

// Ordered list of options for the plans filter dropdown: collapses grouped
// stages into a single option at the position of the first member.
export const STAGE_FILTER_OPTIONS: Array<{ key: string; label: string }> = (() => {
  const memberToGroup = new Map<string, typeof STAGE_FILTER_GROUPS[number]>();
  STAGE_FILTER_GROUPS.forEach(g => g.members.forEach(m => memberToGroup.set(m, g)));
  const emitted = new Set<string>();
  const out: Array<{ key: string; label: string }> = [];
  for (const s of ALL_STAGES) {
    if (["submitted", "approved"].includes(s.key)) continue;  // legacy aliases
    const g = memberToGroup.get(s.key);
    if (g) {
      if (!emitted.has(g.key)) { emitted.add(g.key); out.push({ key: g.key, label: g.label }); }
      continue;
    }
    out.push({ key: s.key, label: s.label });
  }
  return out;
})();

// Lookup for the filter predicate: group key → member stage set
export const STAGE_GROUP_MEMBERS: Map<string, Set<string>> = new Map(
  STAGE_FILTER_GROUPS.map(g => [g.key, new Set(g.members)])
);

// Progress bar milestone stages (excludes review-cycle sub-states)
export const ENGINEERED_PROGRESS_STAGES = [
  { key: "requested",         label: "Requested",        color: "#6B7280" },
  { key: "drafting",          label: "Drafting",          color: "#3B82F6" },
  { key: "submitted_to_dot",  label: "Submitted to DOT", color: "#F59E0B" },
  { key: "tcp_approved",      label: "TCP Approved",      color: "#8B5CF6" },
  { key: "loc_submitted",     label: "LOC Submitted",     color: "#06B6D4" },
  { key: "plan_approved",     label: "Plan Approved",     color: "#10B981" },
];

export const WATCH_PROGRESS_STAGES = [
  { key: "requested",         label: "Requested",        color: "#6B7280" },
  { key: "drafting",          label: "Drafting",          color: "#3B82F6" },
  { key: "submitted_to_dot",  label: "Submitted to DOT", color: "#F59E0B" },
  { key: "plan_approved",     label: "Plan Approved",     color: "#10B981" },
];

// Resubmission stages appended to progress bar after expiry
export const RESUBMISSION_STAGES = [
  { key: "resubmitted",        label: "Resubmitted",       color: "#F59E0B" },
];

// Map a legacy stage key to the equivalent new key for display
export const LEGACY_STAGE_MAP: Record<string, string> = {
  submitted: "submitted_to_dot",
  approved:  "plan_approved",
};

export const COMPLETED_STAGES = ["approved", "implemented", "plan_approved", "tcp_approved_final", "expired", "closed", "cancelled"]; // terminal stages — stop the active/wait counter
// Stages where the plan was genuinely approved (show ✓ in wait column)
export const APPROVED_STAGES = ["approved", "implemented", "plan_approved", "tcp_approved_final"];
export const AT_DOT_STAGES = ["submitted", "in_review", "submitted_to_dot", "dot_review"];

// Clock targets (in calendar days) per plan type per phase
// Used to color-code day counts in progression history (green/yellow/red)
export const CLOCK_TARGETS: Record<string, Record<string, { target: number; warning: number }>> = {
  WATCH: {
    drafting:           { target: 3,  warning: 2 },
    dot_review:         { target: 10, warning: 8 },
    team_response:      { target: 2,  warning: 1 },
    dot_review_final:   { target: 5,  warning: 4 },
  },
  Standard: {
    drafting:           { target: 3,  warning: 2 },
    dot_review:         { target: 10, warning: 8 },
    team_response:      { target: 2,  warning: 1 },
    dot_review_final:   { target: 5,  warning: 4 },
  },
  Engineered: {
    drafting:           { target: 7,  warning: 5 },
    dot_review:         { target: 20, warning: 15 },
    team_response:      { target: 5,  warning: 3 },
    dot_review_final:   { target: 20, warning: 15 },
    loc_review:         { target: 20, warning: 15 },
  },
};

export const DEFAULT_APP_CONFIG = {
  logoUrl: null as string | null,
  appName: 'ESFV LRT — TCP Tracker',
  appSubtitle: 'San Fernando Transit Constructors',
  pageTitle: 'ESFV LRT — TCP Tracker',
  primaryColor: '#F59E0B',
  atRiskDays: 14,
  overdueDays: 7,
  clockTargets: CLOCK_TARGETS,
  driveway_metroSLADays:  5,
  driveway_metroWarnDays: 3,
  driveway_leadTimeDays:  10,
  driveway_reissueDays:   5,
};

export const PLAN_TYPES = ["WATCH", "Standard", "Engineered"];

// ── Work Hours shared constants ───────────────────────────────────────────────
export const DAY_LABELS: Record<WorkDay, string> = {
  weekday:  'Mon–Fri',
  saturday: 'Saturday',
  sunday:   'Sunday',
};
export const DAY_ORDER: WorkDay[] = ['weekday', 'saturday', 'sunday'];

export const SHIFT_LABELS: Record<string, string> = {
  day:       'Day shift',
  night:     'Night shift',
  overnight: 'Overnight shift',
  weekend:   'Weekend',
  custom:    'Custom hours',
};
export const SCOPES = ["Water", "Sewer", "Storm", "Telecom", "Systems", "UA2/3", "Tree Planting", "Other"];
export const SEGMENTS = ["A1", "A2", "A3", "B1", "B2", "B3", "C1", "C2", "C3"];
export const PRIORITIES = ["Critical", "High", "Medium", "Low"];
export const LEADS = ["Justin", "Carlos", "Travis", "Dale", "Garrett", "Ryan"];
export const STREET_NAMES = [
  "Oxnard St", "Aetna St", "Bessemer St", "Calvert St", "Delano St", "Erwin St", "Sylvan St", "Friar St",
  "Victory Blvd", "Gilmore St", "Hamlin St", "Haynes St", "Kittridge St", "Archwood St", "Vanowen St",
  "Hartland St", "Hart St", "Vose St", "Gault St", "Sherman Way", "Wyandotte St", "Valerio St", "Pacoima Wash",
  "Covello St", "Saticoy St", "Keswick St", "Raymer St", "Arminta St", "Michaels St", "Blythe St", "Lorne St",
  "Lanark St", "Titus St", "Roscoe Blvd", "Chase St", "Tobias St", "Parthenia St", "Rayen St", "Osborne St",
  "Nordhoff St", "Tupper St", "Vincennes St", "Gledhill", "Plummer St", "Novice St", "Vesper Ave", "Woodman Ave",
  "Canterbury Ave", "Beachy Ave", "Pacoima Diversion Channel", "Arleta Ave", "Lev Ave", "Bartee Ave", "Vena Ave",
  "Remick Ave", "Laurel Canyon Blvd", "Rincon Ave", "Amboy Ave", "O'Melveny Ave", "Haddon Ave", "Oneida Ave",
  "Kewen Ave", "Cayuga Ave", "Telfair Ave", "Tamarack Ave", "El Dorado Ave", "Ilex", "San Fernando Rd"
];

// Street → Segment lookup (ESFV Phase 2 Segment Delineation drawing, Rev 4.0)
export const SEGMENT_STREETS: Record<string, string[]> = {
  A1: ['Oxnard St', 'Aetna St', 'Bessemer St', 'Calvert St', 'Delano St', 'Erwin St', 'Sylvan St',
       'Friar St', 'Victory Blvd', 'Gilmore St', 'Hamlin St', 'Haynes St', 'Kittridge St', 'Archwood St'],
  A2: ['Vanowen St', 'Hartland St', 'Hart St', 'Vose St', 'Gault St', 'Sherman Way',
       'Wyandotte St', 'Valerio St', 'Pacoima Wash'],
  B1: ['Covello St', 'Saticoy St', 'Keswick St', 'Raymer St', 'Arminta St', 'Michaels St',
       'Blythe St', 'Lorne St'],
  B2: ['Lanark St', 'Titus St', 'Roscoe Blvd', 'Chase St', 'Parthenia St'],
  B3: ['Rayen St', 'Osborne St', 'Nordhoff St', 'Tupper St', 'Vincennes St', 'Gledhill St',
       'Plummer St', 'Novice St'],
  C1: ['Vesper Ave', 'Woodman Ave', 'Canterbury Ave', 'Beachy Ave', 'Pacoima Diversion Channel'],
  C2: ['Arleta Ave', 'Lev Ave', 'Bartee Ave', 'Vena Ave', 'I-5 Freeway', 'Remick Ave'],
  C3: ['Laurel Canyon Blvd', 'Rincon Ave', 'Amboy Ave', "O'Melveny Ave", 'Haddon Ave',
       'Oneida Ave', 'Kewen Ave', 'Cayuga Ave', 'Telfair Ave', 'Tamarack Ave',
       'El Dorado Ave', 'Ilex Ave', 'San Fernando Rd'],
};

export const FONT = `'Outfit', sans-serif`;
export const MONO_FONT = `'IBM Plex Mono', monospace`;

export const IMPORT_TARGET_FIELDS = [
  { key: 'loc',          label: 'LOC #',             required: true  },
  { key: 'type',         label: 'Plan Type',          required: true  },
  { key: 'street1',      label: 'Street 1',           required: true  },
  { key: 'street2',      label: 'Street 2',           required: false },
  { key: 'lead',         label: 'SFTC Lead',          required: false },
  { key: 'requestedBy',  label: 'Requested By',       required: false },
  { key: 'scope',        label: 'Scope',              required: false },
  { key: 'segment',      label: 'Segment',            required: false },
  { key: 'stage',        label: 'Current Stage',      required: false },
  { key: 'priority',     label: 'Priority',           required: false },
  { key: 'needByDate',   label: 'Need By Date',       required: false },
  { key: 'dateRequested',label: 'Date Requested',     required: false },
  { key: 'submitDate',   label: 'Submitted to DOT Date', required: false },
  { key: 'approvedDate', label: 'Approved Date',      required: false },
  { key: 'notes',        label: 'Notes',              required: false },
];

export const DEFAULT_MAIN_COLUMNS = [
  { id: "loc",        label: "LOC #" },       // Primary identifier
  { id: "type",       label: "Type" },
  { id: "location",   label: "Location" },    // Enriched: scope + segment folded in
  { id: "hours",      label: "Hours" },
  { id: "impacts",    label: "Impacts" },
  { id: "lead",       label: "Lead" },
  { id: "priority",   label: "Priority" },
  { id: "compliance", label: "Compliance" },
  { id: "status",     label: "Status" },
  { id: "needBy",     label: "Need By" },
  { id: "wait",       label: "Wait" },
];

export const DEFAULT_TEAM_COLUMNS = [
  { id: "name", label: "Name" },
  { id: "email", label: "Email" },
  { id: "role", label: "Role" },
  { id: "actions", label: "Actions" }
];

export const DEFAULT_LOC_COLUMNS = [
  { id: "loc", label: "LOC Number" },
  { id: "rev", label: "Rev" },
  { id: "validity", label: "Validity Period" },
  { id: "plans", label: "Associated Plans" },
  { id: "file", label: "File" },
  { id: "actions", label: "Actions" }
];

export const DEFAULT_LOG_COLUMNS = [
  { id: "timestamp", label: "Timestamp" },
  { id: "reference", label: "Reference" },
  { id: "activity", label: "Activity & Action" },
  { id: "operator", label: "Operator" }
];

export const MOT_FIELDS: { key: string; label: string; desc: string }[] = [];

export const IMPACT_FIELDS = [
  { key: "impact_driveway", label: "Driveway Closures" },
  { key: "impact_fullClosure", label: "Full Street Closure" },
  { key: "impact_busStop", label: "Bus Stop Impacts" },
  { key: "impact_transit", label: "TANSAT Needed" },
];

export const IMPACT_SECTION_KEYS = [
  "dir_nb", "dir_sb", "dir_directional",
  "impact_driveway", "impact_fullClosure", "impact_busStop", "impact_transit"
];

export const FIELD_REGISTRY: Record<string, { 
  label: string; 
  type: 'text' | 'select' | 'date' | 'checkbox'; 
  options?: string[]; 
  inForm: boolean; 
  inGrid: boolean;
  group?: 'Identification' | 'Location' | 'Schedule' | 'Team & Priority';
}> = {
  id: { label: "Plan ID", type: "text", inForm: false, inGrid: false },   // retired — LOC # is now primary
  loc: { label: "LOC # (Primary Identifier)", type: "text", inForm: true, inGrid: true, group: 'Identification' },
  requestedBy: { label: "Requested By", type: "text", inForm: true, inGrid: true, group: 'Identification' },
  type: { label: "Plan Type", type: "select", options: PLAN_TYPES, inForm: true, inGrid: true, group: 'Identification' },
  scope: { label: "Scope", type: "select", options: SCOPES, inForm: true, inGrid: true, group: 'Identification' },
  segment: { label: "Segment", type: "select", options: SEGMENTS, inForm: true, inGrid: true, group: 'Location' },
  streetFrom: { label: "Street From", type: "text", inForm: true, inGrid: true, group: 'Location' },
  streetTo: { label: "Street To", type: "text", inForm: true, inGrid: true, group: 'Location' },
  lead: { label: "SFTC Lead", type: "select", options: LEADS, inForm: true, inGrid: true, group: 'Team & Priority' },
  priority: { label: "Priority", type: "select", options: PRIORITIES, inForm: true, inGrid: true, group: 'Team & Priority' },
  needByDate: { label: "Need By Date", type: "date", inForm: true, inGrid: true, group: 'Schedule' },
  submitDate: { label: "Submitted Date", type: "date", inForm: false, inGrid: true, group: 'Schedule' },
  approvedDate: { label: "Approved Date", type: "date", inForm: false, inGrid: true, group: 'Schedule' },
  dateRequested: { label: "Requested Date", type: "date", inForm: false, inGrid: true, group: 'Schedule' },
  dir_nb: { label: "NB", type: "checkbox", inForm: true, inGrid: true },
  dir_sb: { label: "SB", type: "checkbox", inForm: true, inGrid: true },
  dir_directional: { label: "DIR", type: "checkbox", inForm: true, inGrid: true },
  side_street: { label: "SIDE ST", type: "checkbox", inForm: true, inGrid: true },
  impact_krail: { label: "Krail Required", type: "checkbox", inForm: false, inGrid: false },
  impact_driveway: { label: "Driveway Closures", type: "checkbox", inForm: false, inGrid: false },
  impact_fullClosure: { label: "Full Street Closure", type: "checkbox", inForm: false, inGrid: false },
  impact_busStop: { label: "Bus Stop Impacts", type: "checkbox", inForm: false, inGrid: false },
  impact_transit: { label: "TANSAT Needed", type: "checkbox", inForm: false, inGrid: false },
  work_hours: { label: "Hours of Work", type: "text", inForm: false, inGrid: false },
};
