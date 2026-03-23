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

export const COMPLETED_STAGES = ["approved", "implemented"];
export const AT_DOT_STAGES = ["submitted", "in_review"];

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
  { key: 'id', label: 'Plan ID / TCP ID', required: true },
  { key: 'type', label: 'Plan Type' },
  { key: 'scope', label: 'Scope' },
  { key: 'stage', label: 'Stage' },
  { key: 'loc', label: 'LOC #' },
  { key: 'segment', label: 'Segment' },
  { key: 'street1', label: 'Street 1' },
  { key: 'street2', label: 'Street 2' },
  { key: 'lead', label: 'Lead' },
  { key: 'priority', label: 'Priority' },
  { key: 'needByDate', label: 'Need By Date' },
  { key: 'submitDate', label: 'Submitted Date' },
  { key: 'approvedDate', label: 'Approved Date' },
  { key: 'notes', label: 'Notes' },
];

export const DEFAULT_MAIN_COLUMNS = [
  { id: "id", label: "Plan #" },
  { id: "rev", label: "Rev" },
  { id: "loc", label: "LOC #" },
  { id: "type", label: "Type" },
  { id: "scope", label: "Scope" },
  { id: "segment", label: "Seg" },
  { id: "location", label: "Location" },
  { id: "lead", label: "Lead" },
  { id: "priority", label: "Priority" },
  { id: "status", label: "Status" },
  { id: "submittedToDOT", label: "Submitted to DOT" },
  { id: "requested", label: "Requested" },
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
  id: { label: "Plan ID", type: "text", inForm: true, inGrid: true, group: 'Identification' },
  loc: { label: "LOC #", type: "text", inForm: true, inGrid: true, group: 'Identification' },
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
