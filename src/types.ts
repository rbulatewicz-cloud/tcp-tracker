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

export interface LoadingState {
  submit?: boolean;
  export?: boolean;
  bulk?: boolean;
  upload?: boolean;
  appRequest?: boolean;
  [key: string]: boolean | undefined;
}

export enum UserRole {
  GUEST = "GUEST",      // Tier 3: Plans only, can interact
  SFTC = "SFTC",        // Tier 2: All views, new requests
  MOT = "MOT",          // Tier 1: Full access
  CR = "CR",            // Tier 1.5: Community Relations
  ADMIN = "ADMIN"       // Tier 0: System Admin
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

export interface Plan {
  id: string;
  rev: number;
  loc: string;
  type: string;
  scope: string;
  segment: string;
  street1: string;
  street2: string;
  lead: string;
  priority: string;
  needByDate: string;
  notes: string;
  dir_nb: boolean;
  dir_sb: boolean;
  dir_directional: boolean;
  mot_peakHour: boolean | null;
  mot_extDuration: boolean | null;
  mot_noiseVariance: boolean | null;
  impact_driveway: boolean;
  impact_fullClosure: boolean;
  impact_busStop: boolean;
  impact_transit: boolean;
  attachments: { name: string; data: string }[];
  approvedTCPs: PlanDocument[];
  approvedLOCs: PlanDocument[];
  isCriticalPath: boolean;
  stage: string;
  requestDate: string;
  dateRequested: string;
  log: LogEntry[];
  submitDate?: string | null;
  approvedDate?: string | null;
  currentTCP?: string;
  tcpRev?: number;
  currentLOC?: string;
  locRev?: number;
  outreach?: { status: string; notes?: string };
  side_street: boolean;
  statusHistory?: { uniqueId: string; date: string; action: string; user: string; start?: string; end?: string; duration?: number }[];
}
