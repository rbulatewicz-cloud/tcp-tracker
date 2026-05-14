// Minimal Plan shape the assistant tools read from. Mirrors the subset of
// fields used by aggregate/exception logic; the actual Firestore docs have more.

export interface AssistantPlan {
  id: string;
  loc?: string;
  type?: string;                    // "WATCH" | "Standard" | "Engineered"
  stage: string;
  lead?: string;
  requestedBy?: string;
  needByDate?: string;              // ISO date string
  submitDate?: string | null;
  approvedDate?: string | null;
  requestDate?: string;
  dateRequested?: string;
  street1?: string;
  street2?: string;
  isHistorical?: boolean;
  log?: Array<{ date: string; action: string; user: string }>;
  statusHistory?: Array<{ date: string; action: string }>;
  implementationWindow?: { startDate: string; endDate: string; isExpired: boolean } | null;
  compliance?: {
    phe?: { status: string; approvalDate?: string };
    cdConcurrence?: {
      status: string;
      cds: Array<{ cd: string; applicable: boolean; status: string; sentDate?: string }>;
    };
  };
}

export interface AttentionItem {
  id: string;
  name: string;       // street1 → street2 or LOC id
  lead: string;
  stage: string;      // human label
  reason: string;     // short human explanation
  severity: number;   // numeric score for ranking
  days?: number;      // days in stage / days overdue / days until expiry
}

export interface AttentionSummary {
  totalFlagged: number;
  topConcern: AttentionItem | null;
  buckets: {
    overdue:       { count: number; items: AttentionItem[] };
    stuck:         { count: number; items: AttentionItem[] };
    cdOverdue:     { count: number; items: AttentionItem[] };
    pheUpcoming:   { count: number; items: AttentionItem[] };
    stalled:       { count: number; items: AttentionItem[] };
  };
  asOf: string;
}
