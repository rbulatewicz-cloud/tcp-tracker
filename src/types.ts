// ── Noise Variance Library ────────────────────────────────────────────────────
export interface NoiseVariance {
  id: string;
  // AI-extracted metadata
  title: string;
  permitNumber: string;
  coveredSegments: string[];          // e.g. ["A1", "A2"]
  validFrom: string;                  // ISO date YYYY-MM-DD
  validThrough: string;               // ISO date YYYY-MM-DD
  applicableHours: 'nighttime' | '24_7' | 'both';
  isGeneric: boolean;                 // true = no scope restrictions
  coveredScopes: string[];            // empty when isGeneric
  scopeLanguage: string;              // verbatim text from document
  coveredStreets: string[];           // ALL streets in the work area — AI-expanded from corridor descriptions
  corridors?: { mainStreet: string; from: string; to: string }[]; // structured corridor ranges, e.g. { mainStreet: "Van Nuys Blvd", from: "Oxnard St", to: "Sherman Way" }
  verifiedStreets?: string[];         // streets manually confirmed from PDF (violet/amber chips that a user verified)
  // Submission tracking (managed on the library card, shared across all linked plans)
  submittedDate?: string;      // ISO date — when submitted to Police Commission
  approvalDate?: string;       // ISO date — when approved
  checkNumber?: string;        // check number used for permit fee payment
  checkAmount?: string;        // check amount (e.g. "553.00")
  // File
  fileUrl: string;
  fileName: string;
  uploadedAt: string;
  uploadedBy: string;
  // Scan state
  scanStatus: 'scanning' | 'pending_review' | 'complete' | 'error';
  scanError?: string;
  // Review flags — set when pending_review, cleared on approval
  reviewFlags?: {
    possibleRevision?: { varianceId: string; title: string; reason: string };
    missingFields?: string[];     // e.g. ['Expiration date', 'Covered segments']
    lowConfidence?: boolean;      // AI couldn't confidently identify this as a variance
  };
  // Revision tracking — all revisions of the same variance share a root ID
  parentVarianceId?: string;          // root variance ID; undefined on originals
  revisionNumber: number;             // 0 = original, 1 = first renewal, etc.
  isArchived: boolean;                // true = superseded by a newer revision
}

export type VarianceExpiryStatus = 'valid' | 'warning' | 'critical' | 'expired' | 'unknown';

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
  phe_contactTitle?: string;
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
  // Tab visibility per role — controls which nav tabs each role can see
  // Keys are UserRole strings; values are arrays of view keys (e.g. 'table', 'variances')
  // When absent, falls back to built-in defaults per role
  tabVisibility?: Record<string, string[]>;
  // Driveway letter workflow settings
  driveway_metroSLADays?: number;    // flag overdue in Metro's court (default 5)
  driveway_metroWarnDays?: number;   // amber warning before SLA breached (default 3)
  driveway_leadTimeDays?: number;    // required lead time before work start (default 10)
  driveway_reissueDays?: number;     // date-shift threshold for reissue decision (default 5)

  // ── Driveway Letter Pre-fill ──────────────────────────────────────────────
  // Auto-populates the Draft Letter modal in the CR Queue.
  // The contact here is typically the Metro CR rep, not the contractor.
  driveway_projectName?: string;       // e.g. "East San Fernando Light Rail Transit"
  driveway_businessName?: string;      // e.g. "Metro" or contractor company name
  driveway_contactName?: string;       // CR contact residents should reach (e.g. "Alex Rodriguez")
  driveway_contactTitle?: string;      // e.g. "Community Relations Manager"
  driveway_contactPhone?: string;      // Direct phone for CR contact
  driveway_contactEmail?: string;      // Email for CR contact
  driveway_defaultWorkHours?: string;  // e.g. "nighttime hours (9:00 PM to 6:00 AM), Mon–Fri"

  // ── TANSAT (Temporary Authorization for No Standing / Tow-Away) ──────────
  // Admin-tunable settings driving the TANSAT request workflow. See
  // docs/specs/tansat.md §5.7 (settings) and §6 (email integration).
  tansatSettings?: TansatSettings;
}

// ── TANSAT settings ──────────────────────────────────────────────────────────
// Lives on AppConfig. Drives email recipients + SLA notification thresholds.
// Per-recipient default-include toggles let MOT skip manually CC'ing the same
// 8+ people every time.
export interface TansatContact {
  name: string;
  email: string;
  defaultIncluded: boolean;
}

export interface TansatCcGroup {
  name: string;       // Display label, e.g. "DOT Contacts"
  contacts: TansatContact[];
}

export interface TansatSettings {
  reggieEmail: string;             // primary recipient (To: field)
  defaultCustomerName: string;     // shown on invoice, e.g. "SFT CONSTRUCTORS / DALE GATICA Jr"
  fromAddress?: string;            // Phase 2 only — populated after IT provisions company-domain email
  ccGroups: {
    dot: TansatCcGroup;
    internal: TansatCcGroup;
    client: TansatCcGroup;
  };
  thresholds: {
    needsPacketDays: number;            // default 14 — notify when phase start within N days, no packet
    awaitingInvoiceDays: number;        // default 7  — notify when emailed N days ago, no log #
    paymentDueDays: number;             // default 3  — notify when payment due within N days
    extensionWindowBusinessDays: number;// default 10 — notify within N business days of phase end
    metersAffectedMaxDays: number;      // default 30 — Bureau of Parking referral threshold
  };
  aiExtractionEnabled: boolean;    // toggle to globally disable Gemini invoice extraction
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
  | 'follow_up_sent'
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
  /** @deprecated First linked variance ID — kept for read compat with legacy data. Use linkedVarianceIds. */
  linkedVarianceId?: string;
  /** All linked variance root IDs — a plan can span multiple noise variances */
  linkedVarianceIds?: string[];
}

export interface CDEntry {
  cd: 'CD2' | 'CD6' | 'CD7';
  applicable: boolean;        // false = N/A for this TCP's section
  status: CDStatus;
  meetingDate?: string;       // date presentation was given / meeting held
  sentDate?: string;          // ISO date presentation was sent to this CD
  followUpDate?: string;      // ISO date Metro last sent a follow-up
  concurrenceLetter?: ComplianceAttachment;  // signed concurrence letter from CD
  notes?: string;
}

export interface CDConcurrenceTrack {
  status: ComplianceStatus;
  triggeredBy: string[];
  presentationAttachment?: ComplianceAttachment;  // the CD PowerPoint slide
  cds: CDEntry[];
  notes?: string;
}

/** A batch of plans presented together at a biweekly CD meeting */
export interface CDMeeting {
  id: string;
  name: string;                          // e.g. "CD 6 Biweekly – April 14, 2026"
  meetingDate: string;                   // ISO date
  councilDistricts: ('CD2' | 'CD6' | 'CD7')[];
  planIds: string[];                     // plan doc IDs included in this meeting
  status: 'draft' | 'presented' | 'awaiting_response' | 'closed';
  combinedDeckUrl?: string;              // optional uploaded combined presentation
  combinedDeckName?: string;
  notes?: string;
  createdBy: string;                     // user email
  createdAt: string;                     // ISO timestamp
}

export type DrivewayLetterStatus =
  | 'not_drafted'
  | 'draft'
  | 'submitted_to_metro'
  | 'metro_revision_requested'
  | 'approved'
  | 'sent';

export type StakeholderType = 'resident' | 'business' | 'landlord' | 'tenant' | 'hoa' | 'other';
export type LanguagePreference = 'english' | 'spanish' | 'armenian' | 'korean' | 'chinese' | 'tagalog' | 'other';
export type DeliveryPreference = 'email' | 'mail' | 'phone' | 'in_person' | 'none';

export interface DrivewayProperty {
  id: string;
  address: string;
  ownerName?: string;
  ownerPhone?: string;
  ownerEmail?: string;
  segment?: string;
  notes?: string;
  // ── Property 360 (CRM) ────────────────────────────────────────────────────
  stakeholderType?: StakeholderType;
  languagePreference?: LanguagePreference;
  deliveryPreference?: DeliveryPreference;
  contactNotes?: string;       // CR-specific notes separate from general notes
  doNotContact?: boolean;      // suppress outreach for this property
  tags?: string[];             // freeform tags e.g. ['vocal', 'priority', 'hoa-rep']
  createdAt: string;
  createdBy: string;
  updatedAt?: string;
}

// ── CR Issue Tracker ──────────────────────────────────────────────────────────
export type CRIssueStatus   = 'open' | 'in_progress' | 'resolved' | 'closed';
export type CRIssuePriority = 'low' | 'medium' | 'high' | 'urgent';
export type CRIssueCategory =
  | 'noise_complaint'
  | 'access_blocked'
  | 'safety_concern'
  | 'property_damage'
  | 'communication'
  | 'schedule_conflict'
  | 'other';

export type CRIssueLogMethod =
  | 'phone_call'
  | 'email'
  | 'in_person'
  | 'walk_in'
  | 'online_form'
  | 'social_media'
  | 'other';

export interface CRIssueAttachment {
  id: string;
  name: string;
  url: string;
  storagePath: string;
  uploadedAt: string;
  uploadedBy: string;
}

export interface CRIssueNote {
  id: string;
  text: string;
  addedAt: string;
  addedBy: string;   // display name or email
}

export interface CRIssue {
  id: string;
  title: string;
  description: string;
  category: CRIssueCategory;
  status: CRIssueStatus;
  priority: CRIssuePriority;
  // Linked records
  propertyId?: string;         // linked DrivewayProperty
  propertyAddress?: string;    // denormalized for display
  planId?: string;             // linked Plan doc ID
  planLoc?: string;            // denormalized LOC number
  // Reporter info
  reportedByName: string;      // name of constituent who reported
  reportedByPhone?: string;
  reportedByEmail?: string;
  // How the issue was logged
  loggedVia?: CRIssueLogMethod;
  // Assignment
  assignedTo?: string;         // user email
  // Attachments (photos, documents)
  attachments?: CRIssueAttachment[];
  // Timeline
  createdAt: string;
  createdBy: string;           // user email who logged it
  updatedAt?: string;
  resolvedAt?: string;
  // Notes thread
  notes?: CRIssueNote[];
}

export interface DrivewayAddress {
  id: string;
  address: string;
  ownerName?: string;
  noticeSent?: boolean;
  sentDate?: string;
  // Letter lifecycle
  letterStatus?: DrivewayLetterStatus;
  letterId?: string;           // ID of the corresponding DrivewayLetter in the library
  propertyId?: string;         // ID of the corresponding DrivewayProperty in the properties collection
  // Date-shift tracking — snapshotted when notice is marked sent
  sentWindowStart?: string;    // plan's implementation window start at time of sending
  sentWindowEnd?: string;      // plan's implementation window end at time of sending
  dateShiftDismissed?: boolean; // true = CR dismissed the reissue warning
}

// ── Driveway Letter Library ───────────────────────────────────────────────────
export interface DrivewayLetter {
  id: string;
  planId?: string;             // Firestore doc ID of primary linked plan (performance hint)
  planLoc?: string;            // e.g. "LOC-042" — primary plan LOC (backwards compat)
  linkedPlanLocs?: string[];   // All linked plan LOCs — canonical multi-link field
  addressId: string;           // links back to DrivewayAddress on the plan
  address: string;             // denormalized for Library display
  ownerName?: string;
  propertyId?: string;         // ID of the corresponding DrivewayProperty
  segment: string;
  status: DrivewayLetterStatus;
  source?: 'drafted' | 'uploaded';  // how it entered the library
  // Letter content (all editable fields saved here)
  fields: import('./services/drivewayNoticeService').DrivewayNoticeFields;
  exhibitImageUrl?: string;    // Exhibit 1 map image (uploaded by SFTC)
  letterUrl?: string;          // Final approved PDF/docx — permanent record
  // AI scan state (only for uploaded letters)
  // scanning → needs_review (AI done, user hasn't confirmed) → complete (confirmed) | error
  scanStatus?: 'scanning' | 'needs_review' | 'complete' | 'error';
  scanError?: string;
  // Metro review tracking
  metroSubmittedAt?: string;       // ISO — when submitted to Metro for review
  metroApprovedAt?: string;        // ISO — when Metro approved the letter
  metroRevisionCount?: number;     // how many times Metro has requested revisions
  metroComments?: MetroComment[];  // Metro feedback thread

  // Re-notice chain — set when this letter is a renewal of a prior plan's notice
  parentLetterId?: string;     // ID of the prior sent/approved letter this is based on

  // Version history — every prior PDF that was replaced on this letter
  previousVersions?: LetterVersion[];

  // Audit
  createdAt: string;
  createdBy: string;
  updatedAt?: string;
  approvedAt?: string;
  sentAt?: string;
}

/** Archived prior PDF for a DrivewayLetter. Stored in DrivewayLetter.previousVersions. */
export interface LetterVersion {
  url: string;
  name: string;                 // filename (or inferred if none)
  archivedAt: string;           // ISO timestamp when it was replaced
  archivedBy?: string;          // email of person replacing it
  note?: string;                // optional — e.g. "Metro revision 2"
  revisionCount?: number;       // metroRevisionCount at time of archive
  status?: DrivewayLetterStatus;// the letter's status when this file was archived
}

export interface MetroCommentAttachment {
  id: string;
  name: string;               // original filename
  url: string;                // download URL
  storagePath: string;        // full storage path for deletion
  size?: number;              // bytes
  contentType?: string;       // MIME type
}

export interface MetroComment {
  id: string;
  text: string;
  addedAt: string;
  addedBy: string;
  isRevisionRequest?: boolean;  // true = added as part of a "revision needed" action
  attachments?: MetroCommentAttachment[];  // Metro response docs, markups, etc.
}

export type DrivewayNoticeStatus = 'not_started' | 'in_progress' | 'sent' | 'completed' | 'na' | 'waived';

/** Reason code for an actively-waived driveway notice track.
 *  `scope_changed` — plan scope changed so driveways are no longer impacted
 *  `metro_waived`  — Metro explicitly said notification wasn't required
 *  `work_done`     — work was completed without needing to notify
 *  `other`         — free-form (requires waivedNote) */
export type DrivewayWaiveReason = 'scope_changed' | 'metro_waived' | 'work_done' | 'other';

export interface DrivewayNoticeTrack {
  status: DrivewayNoticeStatus;
  triggeredBy: string[];
  addresses: DrivewayAddress[];
  notes?: string;
  // Waive metadata — populated when status === 'waived'
  waivedReason?: DrivewayWaiveReason;
  waivedNote?: string;
  waivedAt?: string;     // ISO timestamp
  waivedBy?: string;     // email
}

export interface PlanCompliance {
  phe?: PHETrack;
  noiseVariance?: NoiseVarianceTrack;
  cdConcurrence?: CDConcurrenceTrack;
  drivewayNotices?: DrivewayNoticeTrack;
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
  DOT = "DOT",        // External: Dept. of Transportation oversight
  METRO = "METRO",    // External: Metro client/owner team
  ADMIN = "ADMIN"     // Tier 0: System Admin
}

// ── Notification / profile types ─────────────────────────────────────────────
export type NotifyEvent =
  // Plan lifecycle
  | 'status_change' | 'plan_assigned' | 'plan_approved' | 'plan_expired'
  | 'dot_comments' | 'missing_slide'
  // Compliance
  | 'nv_expiring' | 'window_expiring' | 'phe_deadline' | 'cd_overdue' | 'cd_warning'
  // Activity
  | 'comment' | 'doc_uploaded' | 'mention'
  // CR Hub
  | 'cr_issue_assigned' | 'cr_issue_updated' | 'cr_issue_escalation' | 'queue_item'
  // Feedback
  | 'feedback_updated' | 'feedback_comment' | 'request_comment';

/** Per-category email delivery preference */
export type EmailDelivery = 'none' | 'in_app' | 'email' | 'both';

/** Maps each NotifyEvent to a delivery preference. Missing keys default to 'in_app'. */
export type EmailDeliveryPrefs = Partial<Record<NotifyEvent, EmailDelivery>>;

// ── Email template ────────────────────────────────────────────────────────────

export type EmailBarColor = 'red' | 'amber' | 'blue' | 'green' | 'neutral';
export type EmailTier = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G';

export interface EmailTemplate {
  id: string;
  name: string;               // Human label shown in admin UI
  event: NotifyEvent | string;// Which event uses this template
  tier: EmailTier;            // A=alert, B=update, C=constituent, D=digest, E=doc, F=cd, G=broadcast
  subject: string;            // e.g. "{{loc}} — Noise Variance Expiring in {{days_until}} Days"
  body: string;               // 1-2 lines with tokens
  barColor: EmailBarColor;    // top accent bar color
  ctaLabel: string;           // e.g. "View LOC →"
  ctaPath: string;            // deep link path, e.g. "/plans/{{planId}}"
  active: boolean;            // false = disabled, no emails sent
  updatedAt: string;
  updatedBy: string;
}

// ── Mail audit log ────────────────────────────────────────────────────────────

export type MailStatus = 'sent' | 'failed' | 'bounced' | 'opened';

export interface MailLogEntry {
  id: string;
  to: string;                 // recipient email
  toName?: string;            // recipient display name
  subject: string;            // resolved subject line
  templateId: string;         // which template was used
  templateName: string;       // human label for the audit table
  tokens: Record<string, string>; // token values resolved at send time
  sentAt: string;             // ISO timestamp
  status: MailStatus;
  openedAt?: string;          // future: populated by SendGrid webhook
  triggerEvent?: string;      // what triggered this email (NotifyEvent or manual)
  relatedId?: string;         // planId, issueId, etc.
  sentBy: string;             // user email who triggered, or 'system'
}

export interface FeedbackComment {
  id: string;
  authorEmail: string;
  authorName: string;
  text: string;
  createdAt: string;
}

export interface RequestComment {
  id: string;
  authorEmail: string;
  authorName: string;
  authorRole: string;      // UserRole string value
  text: string;
  attachments: string[];   // storage download URLs
  createdAt: string;
}

export type RequestStatus = 'under_review' | 'needs_clarification' | 'clarification_provided';

export interface AppNotification {
  id: string;
  userId: string;          // email of recipient
  type: NotifyEvent;
  planId?: string;
  planLoc?: string;        // e.g. "LOC-366" (absent for non-plan notifications)
  location?: string;       // street1 + street2 (absent for non-plan notifications)
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
  /** Per-category delivery overrides. Missing keys fall back to 'in_app'. */
  emailDelivery?: EmailDeliveryPrefs;
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
  emailDelivery?: EmailDeliveryPrefs;
  profileComplete?: boolean;
}

export type User = UserPublic & UserPrivate;

export interface ReportTemplate {
  logo: string | null;
  companyName: string;
  address: string;
  cityStateZip: string;
  projectInfo: string[];
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
  requestedBy: string;
  scope: string;
  quickFilter: 'all' | 'my_plans' | 'at_risk' | 'needs_compliance' | 'overdue_dot' | 'at_dot' | 'past_due';
}

export interface SortConfig {
  key: string;
  direction: 'asc' | 'desc';
}

export interface PDFExportOptions {
  includeMetadata: boolean;
  includeScopeNotes: boolean;
  includeWorkHours: boolean;
  includeImpacts: boolean;
  includeCompliance: boolean;
  includeActivityLog: boolean;
  includedTCPUrls: string[];
  includedLOCUrls: string[];
  includeNoiseVariance: boolean;
  includedStageAttachmentUrls: string[];
}

export interface ColumnDef {
  id: string;
  label: string;
}

// ── Hours of Work ─────────────────────────────────────────────────────────────
export type WorkShift = 'daytime' | 'nighttime' | 'both' | 'continuous' | 'mixed';
export type WorkDay = 'weekday' | 'saturday' | 'sunday';

export interface WorkHours {
  shift: WorkShift;
  days: WorkDay[];
  // Per-day shift overrides — used when days have different shift types (shift === 'mixed')
  // Also populated for uniform shifts to support easy per-day editing
  weekday_shift?: 'daytime' | 'nighttime' | 'both';
  saturday_shift?: 'daytime' | 'nighttime' | 'both';
  sunday_shift?: 'daytime' | 'nighttime' | 'both';
  // Single-shift mode: per-day-type windows (daytime or nighttime only)
  weekday_start?: string;   // "HH:MM" 24-hour format
  weekday_end?: string;
  saturday_start?: string;
  saturday_end?: string;
  sunday_start?: string;
  sunday_end?: string;
  // Dual-shift mode (shift === 'both' or per-day 'both'): per-day-type windows
  // Weekday windows
  day_start?: string;              // weekday daytime window start
  day_end?: string;                // weekday daytime window end
  night_start?: string;            // weekday nighttime window start
  night_end?: string;              // weekday nighttime window end
  // Saturday windows (dual-shift only)
  saturday_day_start?: string;
  saturday_day_end?: string;
  saturday_night_start?: string;
  saturday_night_end?: string;
  // Sunday windows (dual-shift only)
  sunday_day_start?: string;
  sunday_day_end?: string;
  sunday_night_start?: string;
  sunday_night_end?: string;
}

// ── Reference Library ─────────────────────────────────────────────────────────
export type ReferenceDocCategory = 'BOE' | 'LADOT' | 'LAMC' | 'Police Commission' | 'Internal' | 'Other';

export interface ReferenceDoc {
  id: string;                      // ref_${timestamp}
  _fid?: string;                   // Firestore document ID (client-side only)
  title: string;
  category: ReferenceDocCategory;
  description?: string;
  fileUrl: string;
  fileName: string;
  storagePath: string;             // full storage path for deletion
  uploadedAt: string;              // ISO string
  uploadedBy: string;              // display name or email
}

// ── TANSAT request types ─────────────────────────────────────────────────────
// Top-level Firestore collection `tansatRequests/*`. Each document represents
// a single TANSAT submission to LADOT. One plan can have many requests; each
// request can cover one or more phase numbers from the plan's tansatPhases.
// See docs/specs/tansat.md §3.2.

export type TansatActivity =
  | 'potholing' | 'paving' | 'paving_restoration' | 'restoration'
  | 'conduit_work' | 'asbestos_pipe' | 'sawcutting' | 'vault_conduit'
  | 'krail_delivery' | 'krail_implementation' | 'pile_installation'
  | 'demo' | 'building_demo' | 'implementation'
  | 'utility_support' | 'median_removal' | 'tree_planting' | 'tree_removal'
  | 'temp_street_light' | 'inside_out' | 'other';

export type TansatStatus =
  | 'draft'              // packet being assembled
  | 'packet_ready'       // ready to email Reggie
  | 'emailed'            // sent, awaiting invoice
  | 'invoice_received'   // logNumber + amount populated
  | 'paid'               // paymentConfirmation uploaded
  | 'posted'             // signs installed
  | 'active'             // work window active
  | 'closed'             // work complete
  | 'cancelled'          // before signs installed
  | 'revised'            // dates changed, new invoice issued
  | 'expired';           // log # past expiration, must be renewed (new request)

export type TansatSide = 'N' | 'S' | 'E' | 'W' | 'NB' | 'SB' | 'EB' | 'WB' | 'BOTH';

export type TansatDayPattern = 'daily' | 'weekdays' | 'weekends' | 'custom';

export interface TansatAttachment {
  name: string;
  url: string;
  storagePath: string;
  uploadedAt: string;
  uploadedBy: string;
  size?: number;
}

// FREE email reply to Reggie's original thread with the log # and new dates.
// Same log # stays in effect; no new payment. Per LADOT: must be requested 10
// days before expiration (in practice they're flexible). Once expired, the
// log # CANNOT be extended and must be renewed (= new TansatRequest).
export interface TansatExtension {
  id: string;
  requestedAt: string;
  newEndDate: string;
  emailReplyMessageId?: string;        // Phase 2: ties to existing email thread
  emailReplyAttachment?: TansatAttachment;  // Phase 1: uploaded reply as proof
  notes?: string;
  status: 'pending' | 'sent' | 'confirmed';
}

export interface TansatRequest {
  id: string;
  planId?: string;                     // optional — unset for unlinked legacy imports
  importedPlanText?: string;           // raw text from xlsx ("UA 4 WATCH") — preserved for unlinked rows
  phaseNumbers: number[];              // covers 1+ phases on the plan

  activity: TansatActivity;
  activityOther?: string;              // free text when activity = 'other'

  workArea: {
    side: TansatSide;
    street: string;
    fromLimit: string;                 // e.g. "300' West of Vesper Ave"
    toLimit: string;                   // e.g. "Van Nuys Blvd"
  };
  schedule: {
    dayPattern: TansatDayPattern;
    startDate: string;                 // ISO
    startTime: string;                 // "HH:mm"
    endDate: string;
    endTime: string;
  };
  mapScreenshot?: TansatAttachment;
  attachedVarianceIds?: string[];      // refs into noiseVariances library

  // Email audit (one of these populated depending on send path)
  emailSentAt?: string;
  emailMessageId?: string;             // Phase 2: automated send via mailLog
  emailDocument?: TansatAttachment;    // Bypass: uploaded email memo
  ccGroupsUsed?: { dot: boolean; internal: boolean; client: boolean };

  // DOT response (manually entered OR AI-extracted from invoice PDF)
  logNumber?: string;
  invoiceAmount?: number;
  paymentDueDate?: string;
  customerName?: string;
  invoiceAttachment?: TansatAttachment;

  // Payment
  paidAt?: string;
  paidAmount?: number;
  paymentConfirmation?: TansatAttachment;
  paidBy?: string;

  // Extensions (FREE email replies, same log #)
  extensions?: TansatExtension[];

  // Renewal lineage — when a log # expires, a new TansatRequest is created
  // with renewalOfRequestId pointing back. Full workflow + new payment required.
  renewalOfRequestId?: string;
  renewedByRequestId?: string;

  status: TansatStatus;
  notes?: string;

  // AI extraction failure capture (mirrors driveway letter scan pattern)
  scanError?: string;
  scanCompletedAt?: string;

  // Audit
  createdBy: string;
  createdAt: string;                   // ISO timestamp
  updatedAt: string;
  importedFrom?: string;               // e.g. "TANSAT Tracking Log xlsx" for legacy imports
}

// ── TANSAT phase plan (lives on a Plan) ──────────────────────────────────────
// Engineer-defined work segments. A plan can have 0..N phases. Each phase has
// anticipated dates and a flag indicating whether it needs a TANSAT posting.
// MOT later creates one or more TansatRequest records that reference these
// phase numbers. See docs/specs/tansat.md §3.1.
export interface PlanTansatPhase {
  phaseNumber: number;             // 1, 2, 3...
  label?: string;                  // optional, e.g. "Potholing", "Conduit Work"
  anticipatedStart?: string;       // ISO date — may be empty if not yet known
  anticipatedEnd?: string;
  needsTansat: boolean;            // engineer flags which phases need parking removal
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
  impact_sidewalkClosure?: boolean;
  impact_crosswalkClosure?: boolean;
  impact_busStop: boolean;
  impact_transit: boolean;
  impact_i5Freeway?: boolean;       // Caltrans encroachment — triggers future MOT workflow
  impact_uprrBridge?: boolean;      // UPRR encroachment — triggers future MOT workflow
  // TANSAT phase plan — populated when impact_transit ("TANSAT Needed") is true.
  // Fluid: SFTC engineer can leave empty and fill in later via plan card.
  tansatPhases?: PlanTansatPhase[];
  work_hours?: WorkHours;
  phe_justification?: string;   // "Why is peak hour work required?" — captured at request time
  revisionSuffix?: string;      // ".1", ".2" — set when submitting a renewal
  parentLocId?: string;         // original plan's LOC ID, set for renewals
  planDurationDays?: number;    // how many days the work window lasts; end = needByDate + planDurationDays
  driveway_addresses?: Array<{ address: string; propertyId?: string }>;
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

  // Sibling grouping — a set of LOCs that cover the same work at the same
  // time (e.g. phased permits). Plans in the same group share driveway
  // outreach: a single notice covers all members. All members carry the
  // same `planGroupId`. Distinct from parentLocId (renewals).
  planGroupId?: string;

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
  planDurationDays?: number;    // how many days the work window lasts; end = needByDate + planDurationDays
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
  impact_sidewalkClosure?: boolean;
  impact_crosswalkClosure?: boolean;
  impact_busStop: boolean;
  impact_transit: boolean;
  // Encroachments — future MOT workflows will key off these (see project_deferred_features.md).
  impact_i5Freeway?: boolean;
  impact_uprrBridge?: boolean;
  // TANSAT phase plan — populated when impact_transit ("TANSAT Needed") is true.
  // MOT creates TansatRequest records referencing these phase numbers.
  // See docs/specs/tansat.md §3.1.
  tansatPhases?: PlanTansatPhase[];

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
  softImplementationWindow?: { startDate: string; endDate: string; notes?: string } | null;

  // Hours of work
  work_hours?: WorkHours;

  /** Streets explicitly covered by this plan — auto-expanded from cross-street range, user-editable.
   *  Populated when plan.street1 and plan.street2 are both corridor cross streets (e.g. Bessemer → Sylvan)
   *  and the user clicks "Auto-expand" in the plan card. Used to improve NV match scoring. */
  expandedStreets?: string[];

  // Compliance tracks (PHE, Noise Variance, CD Concurrence)
  compliance?: PlanCompliance;

  // Subscribers — list of user emails who follow this plan
  subscribers?: string[];

  // Request Q&A thread
  requestComments?: RequestComment[];
  requestStatus?: RequestStatus;

  // Legacy fields — kept for backward compat with existing data
  outreach?: { status: string; notes?: string };
  currentTCP?: string;
  tcpRev?: number;
  currentLOC?: string;
  locRev?: number;
}
