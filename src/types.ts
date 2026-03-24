export interface Stage {
  key: string;
  label: string;
  color: string;
}

export interface LogEntry {
  uniqueId?: string;
  date: string;
  action: string;
  user: string;
  attachments?: { name: string; data: string }[];
  dateRequested?: string;
  field?: string;
  previousValue?: unknown;
  newValue?: unknown;
}

export interface PlanDocument {
  id: string;
  name: string;
  url: string;
  version: number;
  uploadedAt: string;
  uploadedBy: string;
}

// Attachment linked to a specific stage transition or review cycle
export interface StageAttachment {
  id: string;
  name: string;
  url: string;
  uploadedAt: string;
  uploadedBy: string;
  stage: string;
  documentType:
    | 'tcp_drawings'
    | 'loc_draft'
    | 'loc_signed'
    | 'dot_comments'
    | 'revision_package'
    | 'other';
  isPrimary: boolean; // signed LOC = true
}

export interface LoadingState {
  submit?: boolean;
  export?: boolean;
  bulk?: boolean;
  upload?: boolean;
  appRequest?: boolean;
  [key: string]: boolean | undefined;
}

export enum UserRole {
  GUEST = "GUEST",    // Tier 3: Plans only, can interact
  SFTC = "SFTC",      // Tier 2: All views, new requests
  MOT = "MOT",        // Tier 1: Full access
  CR = "CR",          // Tier 1.5: Community Relations
  ADMIN = "ADMIN"     // Tier 0: System Admin
}

export interface UserPublic {
  id?: string;
  uid: string;
  name: string;
  email: string;
}

export interface UserPrivate {
  uid: string;
  role: UserRole;
}

export type User = UserPublic & UserPrivate;

export interface ReportTemplate {
  logo: string | null;
  companyName: string;
  address: string;
  cityStateZip: string;
  projectInfo: string[];
  showMetricCharts: boolean;
  needByThresholds: {
    WATCH: number;
    Standard: number;
    Engineered: number;
  };
}

export interface FilterState {
  stage: string;
  type: string;
  lead: string;
  priority: string;
}

export interface SortConfig {
  key: string;
  direction: 'asc' | 'desc';
}

export interface ColumnDef {
  id: string;
  label: string;
}

export interface PlanForm {
  id: string;
  rev: number;
  loc: string;
  type: string;
  scope: string;
  segment: string;
  street1: string;
  street2: string;
  lead: string;
  requestedBy: string;      // name of person making the request
  priority: string;
  needByDate: string;
  notes: string;
  dir_nb: boolean;
  dir_sb: boolean;
  dir_directional: boolean;
  side_street?: boolean;
  mot_peakHour: boolean | null;
  mot_extDuration: boolean | null;
  mot_noiseVariance: boolean | null;
  impact_driveway: boolean;
  impact_fullClosure: boolean;
  impact_busStop: boolean;
  impact_transit: boolean;
  attachments: File[];
  approvedTCPs: PlanDocument[];
  approvedLOCs: PlanDocument[];
  isCriticalPath: boolean;
  [key: string]: unknown;
}

export type PlanWorkflowType = 'engineered' | 'watch_standard';

export interface ReviewCycle {
  cycleId: string;
  cycleType: 'dot_review' | 'loc_review' | 'resubmit_review';
  cycleNumber: number;
  // Full four-date clock tracking
  submittedDate?: string;             // team submitted to DOT (optional — may not be known at cycle creation)
  commentsReceivedDate: string;       // DOT responded (DOT clock ends)
  commentsDescription: string;
  revisionSubmittedDate: string | null;  // team resubmitted (team clock ends)
  revisionNumber: string | null;
  dotReviewDays: number | null;       // DOT accountability clock
  teamResponseDays: number | null;    // Team accountability clock
  attachments?: StageAttachment[];    // docs attached to this cycle
}

export interface ImplementationWindow {
  startDate: string;
  endDate: string;
  isExpired: boolean;
  locRevision?: string;
}

export interface Plan {
  // LOC # is the primary identifier — no more SFTC auto-numbering
  id: string;           // LOC number (e.g. "LOC-366", "LOC-366.1")
  rev: number;
  loc: string;          // same as id — kept for display/import compatibility
  revisionSuffix?: string;   // ".1", ".2" for renewals after expiry
  parentLocId?: string;      // for renewals, points to original LOC record

  // Who requested this plan
  requestedBy: string;

  // Plan details
  type: string;         // "WATCH" | "Standard" | "Engineered"
  scope: string;
  segment: string;
  street1: string;
  street2: string;
  lead: string;
  priority: string;
  needByDate: string;
  notes: string;

  // Directions
  dir_nb: boolean;
  dir_sb: boolean;
  dir_directional: boolean;
  side_street: boolean;

  // MOT requirements
  mot_peakHour: boolean | null;
  mot_extDuration: boolean | null;
  mot_noiseVariance: boolean | null;

  // Impacts
  impact_driveway: boolean;
  impact_fullClosure: boolean;
  impact_busStop: boolean;
  impact_transit: boolean;

  // Documents
  attachments: { name: string; data: string }[];   // draft attachments from initial request
  approvedTCPs: PlanDocument[];
  approvedLOCs: PlanDocument[];
  stageAttachments?: StageAttachment[];             // attachments per stage transition

  // Status & workflow
  stage: string;
  isCriticalPath: boolean;
  isHistorical: boolean;       // true = imported pre-system record (excluded from perf metrics)
  pendingDocuments: boolean;   // true = imported record missing key documents

  // Dates
  requestDate: string;
  dateRequested: string;
  submitDate?: string | null;
  approvedDate?: string | null;

  // Activity & history
  log: LogEntry[];
  statusHistory?: {
    uniqueId: string;
    date: string;
    action: string;
    user: string;
    start?: string;
    end?: string;
    duration?: number;
  }[];
  reviewCycles?: ReviewCycle[];
  implementationWindow?: ImplementationWindow | null;

  // Legacy fields — kept for backward compat with existing data
  outreach?: { status: string; notes?: string };
  currentTCP?: string;
  tcpRev?: number;
  currentLOC?: string;
  locRev?: number;
}
