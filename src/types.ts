export interface AppConfig {
  logoUrl: string | null;
  appName: string;
  appSubtitle: string;
  pageTitle: string;
  primaryColor: string;
  atRiskDays: number;
  overdueDays: number;
  clockTargets: Record<string, Record<string, { target: number; warning: number }>>;
  // PHE / Compliance pre-fill fields (admin-configured)
  phe_projectName?: string;
  phe_businessName?: string;
  phe_address?: string;
  phe_contactName?: string;
  phe_contactPhone?: string;
  phe_contactEmail?: string;
  phe_isSubcontractor?: boolean;
  phe_primeContractorName?: string;
  phe_primeContactName?: string;
  phe_primePhone?: string;
  phe_primeEmail?: string;
  phe_defaultPermitType?: 'A' | 'B' | 'E' | 'U' | 'S';
  lists?: {
    scopes?: string[];
    leads?: string[];
    planTypes?: string[];
  };
}

// ── Compliance Track types ────────────────────────────────────────────────────
export type ComplianceStatus =
  | 'not_started'
  | 'in_progress'
  | 'linked_existing'
  | 'submitted'
  | 'approved'
  | 'expired';

export type CDStatus =
  | 'pending'
  | 'presentation_sent'
  | 'meeting_scheduled'
  | 'concurred'
  | 'declined'
  | 'na';

export interface ComplianceAttachment {
  name: string;
  url: string;
  uploadedAt: string;
  uploadedBy: string;
}

export interface PHEChecklistItem {
  id: string;
  label: string;
  description: string;
  required: boolean;          // false = conditional (e.g. closure schedule for 24mo+)
  notApplicable?: boolean;
  completed: boolean;
  attachments?: ComplianceAttachment[];
  completedAt?: string;
  completedBy?: string;
  notes?: string;
}

export interface PHETrack {
  status: ComplianceStatus;
  triggeredBy: string[];
  // Linked-existing path
  existingPermitNumber?: string;
  existingPermitDate?: string;
  // Timeline
  submittedDate?: string;
  approvalDate?: string;
  // Plan-specific form fields
  permitType?: 'A' | 'B' | 'E' | 'U' | 'S';
  boePermitNumber?: string;
  impactedLanes?: string;
  peakHourJustification?: string;   // captured at request time by SFTC
  projectDurationMonths?: number;
  // Checklist
  checklist: PHEChecklistItem[];
}

export interface NoiseVarianceTrack {
  status: ComplianceStatus;
  triggeredBy: string[];
  existingPermitNumber?: string;
  submittedDate?: string;
  approvalDate?: string;
  attachments?: ComplianceAttachment[];
  notes?: string;
}

export interface CDEntry {
  cd: 'CD2' | 'CD6' | 'CD7';
  applicable: boolean;        // false = N/A for this TCP's section
  status: CDStatus;
  meetingDate?: string;
  notes?: string;
}

export interface CDConcurrenceTrack {
  status: ComplianceStatus;
  triggeredBy: string[];
  presentationAttachment?: ComplianceAttachment;
  cds: CDEntry[];
  notes?: string;
}

export interface PlanCompliance {
  phe?: PHETrack;
  noiseVariance?: NoiseVarianceTrack;
  cdConcurrence?: CDConcurrenceTrack;
}

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
    | 'approval_letter'
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

// ── Notification / profile types ─────────────────────────────────────────────
export type NotifyEvent = 'status_change' | 'comment' | 'doc_uploaded' | 'window_expiring' | 'dot_comments' | 'plan_approved' | 'plan_expired';

export interface AppNotification {
  id: string;
  userId: string;          // email of recipient
  type: NotifyEvent;
  planId: string;
  planLoc: string;         // e.g. "LOC-366"
  location: string;        // street1 + street2
  title: string;           // short headline
  body: string;            // detail line
  read: boolean;
  createdAt: string;       // ISO timestamp
}
export type NotifyFrequency = 'immediate' | 'daily_digest' | 'off';

export interface AutoFollowPrefs {
  myRequests: boolean;
  myLeads: boolean;
  onComment: boolean;
  segments: string[];
}

export interface NotificationPrefs {
  displayName: string;
  title: string;
  notificationEmail: string;
  notifyOn: NotifyEvent[];
  notificationFrequency: NotifyFrequency;
  autoFollow: AutoFollowPrefs;
}

export interface UserPublic {
  id?: string;
  uid: string;
  name: string;
  email: string;
  // Profile fields (set after welcome screen)
  displayName?: string;
  title?: string;
  notificationEmail?: string;
}

export interface UserPrivate {
  uid: string;
  role: UserRole;
  // Notification preferences
  notifyOn?: NotifyEvent[];
  notificationFrequency?: NotifyFrequency;
  autoFollow?: AutoFollowPrefs;
  profileComplete?: boolean;
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
  importStatus: string;
}

export interface SortConfig {
  key: string;
  direction: 'asc' | 'desc';
}

export interface ColumnDef {
  id: string;
  label: string;
}

// ── Hours of Work ─────────────────────────────────────────────────────────────
export type WorkShift = 'daytime' | 'nighttime' | 'both' | 'continuous';
export type WorkDay = 'weekday' | 'saturday' | 'sunday';

export interface WorkHours {
  shift: WorkShift;
  days: WorkDay[];
  weekday_start?: string;   // "HH:MM" 24-hour format
  weekday_end?: string;
  saturday_start?: string;
  saturday_end?: string;
  sunday_start?: string;
  sunday_end?: string;
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
  impact_krail: boolean;
  impact_driveway: boolean;
  impact_fullClosure: boolean;
  impact_busStop: boolean;
  impact_transit: boolean;
  work_hours?: WorkHours;
  phe_justification?: string;   // "Why is peak hour work required?" — captured at request time
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

  // Impacts
  impact_krail: boolean;
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
  importStatus?: 'needs_review' | 'active';  // set on imported plans
  importBatchId?: string;                      // identifies the import batch
  locStatus?: 'unassigned' | 'assigned';       // 'unassigned' for TBD plans

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

  // Hours of work
  work_hours?: WorkHours;

  // Compliance tracks (PHE, Noise Variance, CD Concurrence)
  compliance?: PlanCompliance;

  // Subscribers — list of user emails who follow this plan
  subscribers?: string[];

  // Legacy fields — kept for backward compat with existing data
  outreach?: { status: string; notes?: string };
  currentTCP?: string;
  tcpRev?: number;
  currentLOC?: string;
  locRev?: number;
}
