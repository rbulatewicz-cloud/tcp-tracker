import { ReportTemplate } from './types';

export const DEFAULT_REPORT_TEMPLATE: ReportTemplate = {
  logo: null,
  companyName: "Company Name",
  address: "123 Main St",
  cityStateZip: "City, ST 12345",
  projectInfo: [],
  showMetricCharts: true,
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
  // Legacy aliases — existing plans use these keys
  { key: "submitted",         label: "Submitted to DOT",       color: "#F59E0B" },
  { key: "approved",          label: "Plan Approved",          color: "#10B981" },
];

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
  { key: "tcp_approved_final", label: "TCP Approved",      color: "#10B981" },
];

// Map a legacy stage key to the equivalent new key for display
export const LEGACY_STAGE_MAP: Record<string, string> = {
  submitted: "submitted_to_dot",
  approved:  "plan_approved",
};

export const COMPLETED_STAGES = ["approved", "implemented", "plan_approved", "tcp_approved_final"];
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

export const PLAN_TYPES = ["WATCH", "Standard", "Engineered"];
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
  { id: "loc", label: "LOC #" },          // Primary identifier — LOC number
  { id: "rev", label: "Rev" },
  { id: "type", label: "Type" },
  { id: "scope", label: "Scope" },
  { id: "segment", label: "Seg" },
  { id: "location", label: "Location" },
  { id: "lead", label: "Lead" },
  { id: "priority", label: "Priority" },
  { id: "status", label: "Status" },
  { id: "submittedToDOT", label: "Submitted to DOT" },
  { id: "requested", label: "Requested" },
  { id: "requestedBy", label: "Requested By" },
  { id: "needBy", label: "Need By" },
  { id: "wait", label: "Wait" }
];

export const DEFAULT_TEAM_COLUMNS = [
  { id: "name", label: "Name" },
  { id: "email", label: "Email" },
  { id: "role", label: "Role" },
  { id: "actions", label: "Actions" }
];

export const DEFAULT_COMMUNITY_COLUMNS = [
  { id: "id", label: "Plan ID" },
  { id: "street", label: "Street" },
  { id: "impacts", label: "Impacts" },
  { id: "status", label: "Outreach Status" }
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

export const MOT_FIELDS = [
  { key: "mot_peakHour", label: "Peak Hour Variance Needed?", desc: "Will this plan require a redline for peak hour variance upon approval?" },
  { key: "mot_extDuration", label: "Extended Implementation Duration?", desc: "Does this scope require continuous closure beyond 72 hours? (e.g. curb & gutter)" },
  { key: "mot_noiseVariance", label: "Night Work / Noise Variance?", desc: "Will this work require night operations under a Police Commission noise variance?" },
];

export const IMPACT_FIELDS = [
  { key: "impact_driveway", label: "Driveway Closures" },
  { key: "impact_fullClosure", label: "Full Street Closure" },
  { key: "impact_busStop", label: "Bus Stop Impacts" },
  { key: "impact_transit", label: "TANSAT Needed" },
];

export const IMPACT_SECTION_KEYS = [
  "dir_nb", "dir_sb", "dir_directional",
  "mot_peakHour", "mot_extDuration", "mot_noiseVariance",
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
  id: { label: "Plan ID", type: "text", inForm: false, inGrid: false, group: 'Identification' },   // retired — LOC # is now primary
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
  mot_peakHour: { label: "Peak Hour Variance Needed?", type: "checkbox", inForm: false, inGrid: false },
  mot_extDuration: { label: "Extended Implementation Duration?", type: "checkbox", inForm: false, inGrid: false },
  mot_noiseVariance: { label: "Night Work / Noise Variance?", type: "checkbox", inForm: false, inGrid: false },
  impact_driveway: { label: "Driveway Closures", type: "checkbox", inForm: false, inGrid: false },
  impact_fullClosure: { label: "Full Street Closure", type: "checkbox", inForm: false, inGrid: false },
  impact_busStop: { label: "Bus Stop Impacts", type: "checkbox", inForm: false, inGrid: false },
  impact_transit: { label: "TANSAT Needed", type: "checkbox", inForm: false, inGrid: false },
};
