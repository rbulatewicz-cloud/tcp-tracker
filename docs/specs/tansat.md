# TANSAT Feature — Spec & Ticket Breakdown

**Status:** Design locked, awaiting implementation
**Owner (build):** TBD
**Owner (workflow):** Garrett (MOT lead)
**Stakeholders:** Justin Dunleavy (current TANSAT process), Paula (CR), SFTC engineers

---

## 1. Overview

TANSAT (Temporary Authorization for No Standing / Tow-Away) is the LADOT process for posting no-parking signs in advance of construction work that requires parking removal. Today, the workflow is manual:

1. SFTC engineer creates a plan, flags TANSAT need
2. MOT screenshots Google Maps, packages email manually, sends to Reggie at LADOT
3. Reggie returns invoice (PDF) with a Log #
4. MOT pays via Paymentus, prints confirmation
5. Justin tracks everything in a standalone xlsx (`TANSAT Tracking Log`)

This feature folds the entire workflow into the TCP Tracker — structured request packets, AI-extracted invoice data, audit-trailed emails, spend rollups, and a one-time import of Justin's existing log so nothing is lost.

---

## 2. Cardinality & glossary

```
Plan
 ├── PlanTansatPhase[]           (defined by SFTC engineer; fluid)
 │    ├── phaseNumber: 1, 2, 3
 │    ├── anticipatedStart/End
 │    └── needsTansat: boolean
 │
 └── TansatRequest[]              (one or more per plan; each covers 1+ phases)
      ├── phaseNumbers: number[] (e.g. [1] or [3,4,5])
      ├── activity: enum
      ├── workArea, schedule, mapScreenshot, NV refs
      ├── logNumber, invoiceAmount, paymentDueDate
      ├── paidAt, paidAmount, paymentConfirmation
      └── extensions: TansatExtension[]
```

**Glossary**

- **Phase** — engineer-defined work segment on a plan. Has anticipated dates.
- **TANSAT request** — a submission to LADOT for a parking-removal posting. Covers 1+ phases.
- **Log #** — DOT-issued canonical reference (e.g. `454469`). Same as "work order #".
- **Activity** — work type (Potholing, Paving, Conduit Work, etc.).
- **Reggie** — primary contact at LADOT Special Traffic Controls Office.
- **Paymentus** — third-party payment processor (`ipn4.paymentus.com`).
- **Approval code** — Paymentus transaction confirmation. Lives in the receipt PDF; we don't store it as a structured field.

---

## 3. Data model

### 3.1 New: `PlanTansatPhase` (embedded on Plan)

```ts
interface PlanTansatPhase {
  phaseNumber: number;
  label?: string;
  anticipatedStart?: string;     // ISO date
  anticipatedEnd?: string;
  needsTansat: boolean;
}
```

Stored on `Plan.tansatPhases: PlanTansatPhase[]`. Empty array = no phases defined yet (allowed, fluid).

### 3.2 New: `tansatRequests/*` Firestore collection

```ts
interface TansatRequest {
  id: string;
  planId?: string;                // optional — unset for unlinked legacy imports
  importedPlanText?: string;      // raw text from xlsx (e.g. "UA 4 WATCH") — preserved for unlinked rows
  phaseNumbers: number[];         // covers 1+ phases on the plan

  activity: TansatActivity;
  activityOther?: string;         // free text when activity = 'other'

  workArea: {
    side: 'N' | 'S' | 'E' | 'W' | 'NB' | 'SB' | 'EB' | 'WB' | 'BOTH';
    street: string;
    fromLimit: string;            // e.g. "300' West of Vesper Ave"
    toLimit: string;              // e.g. "Van Nuys Blvd"
  };
  schedule: {
    dayPattern: 'daily' | 'weekdays' | 'weekends' | 'custom';
    startDate: string;            // ISO
    startTime: string;            // "HH:mm"
    endDate: string;
    endTime: string;
  };
  mapScreenshot?: AttachmentRef;
  attachedVarianceIds?: string[];  // refs into noiseVariances library

  // Email audit (one of these three populated depending on send path)
  emailSentAt?: string;
  emailMessageId?: string;          // Phase 2: automated send via mailLog
  emailDocument?: AttachmentRef;    // Bypass: uploaded email memo (PDF/.eml/.msg)
  ccGroupsUsed?: { dot: boolean; internal: boolean; client: boolean };

  // DOT response
  logNumber?: string;
  invoiceAmount?: number;
  paymentDueDate?: string;
  customerName?: string;
  invoiceAttachment?: AttachmentRef;

  // Payment
  paidAt?: string;
  paidAmount?: number;
  paymentConfirmation?: AttachmentRef;
  paidBy?: string;                 // user id

  // Extensions (sub-array, not sub-collection) — FREE email replies, same log #
  extensions?: TansatExtension[];

  // Renewal lineage — when a log # expires, a new TansatRequest is created
  // referencing the prior. Full workflow + new payment required.
  renewalOfRequestId?: string;     // points to the prior expired request
  renewedByRequestId?: string;     // points to the renewal that succeeded this

  status: TansatStatus;
  notes?: string;

  // Audit
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// Extensions are FREE — a simple email reply to Reggie's original thread
// with the log # and new dates. Same log # stays in effect; no new payment.
// Per LADOT: must be requested 10 days before expiration (in practice they're
// flexible). Once expired, the log # CANNOT be extended and must be renewed
// (= new TansatRequest, full workflow, new payment).
interface TansatExtension {
  id: string;
  requestedAt: string;             // when MOT sent the reply
  newEndDate: string;               // requested new end
  emailReplyMessageId?: string;     // ties to existing email thread (Phase 2)
  emailReplyAttachment?: AttachmentRef;  // Phase 1: upload the sent reply as proof
  notes?: string;
  status: 'pending' | 'sent' | 'confirmed';  // confirmed = Reggie acknowledged
}

type TansatActivity =
  | 'potholing' | 'paving' | 'paving_restoration' | 'restoration'
  | 'conduit_work' | 'asbestos_pipe' | 'sawcutting' | 'vault_conduit'
  | 'krail_delivery' | 'krail_implementation' | 'pile_installation'
  | 'demo' | 'building_demo' | 'implementation'
  | 'utility_support' | 'median_removal' | 'tree_planting' | 'tree_removal'
  | 'temp_street_light' | 'inside_out' | 'other';

type TansatStatus =
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
```

### 3.3 New: `AppConfig.tansatSettings`

```ts
tansatSettings?: {
  reggieEmail: string;             // primary recipient (default + editable)
  ccGroups: {
    dot: { name: string; emails: { name: string; email: string }[] };
    internal: { name: string; emails: { name: string; email: string }[] };
    client: { name: string; emails: { name: string; email: string }[] };
  };
  defaultCustomerName: string;     // e.g. "SFT CONSTRUCTORS / DALE GATICA Jr"
  fromAddress: string;             // sending email address (company domain)
  thresholds: {
    needsPacketDays: number;       // default 14
    awaitingInvoiceDays: number;   // default 7
    paymentDueDays: number;        // default 3
    extensionWindowBusinessDays: number; // default 10
    metersAffectedMaxDays: number; // default 30 (Bureau of Parking warning)
  };
  activityOptions?: TansatActivity[];  // future: admin-curated subset
};
```

### 3.4 Modified: `Plan`

- Add `tansatPhases?: PlanTansatPhase[]`
- Add `impact_tansat?: boolean` (already exists from PR #10 — flag stays as informational signal)

---

## 4. Workflow & state machine

```
draft → packet_ready → emailed → invoice_received → paid → posted → active → closed
                                                  ↘ revised → invoice_received (loop)
                ↘ cancelled (any pre-active state)
```

### Transitions & guards

| From | To | Action | Guards |
|---|---|---|---|
| `draft` | `packet_ready` | All required fields filled | workArea, schedule, mapScreenshot present; NV attached if plan has active noiseVariance compliance |
| `packet_ready` | `emailed` | "Send to Reggie" button | Captures `emailSentAt`, `emailMessageId` |
| `emailed` | `invoice_received` | logNumber + invoiceAmount entered (manual or AI) | — |
| `emailed` | `revised` | "Request changes" → re-sends with new dates | — |
| `invoice_received` | `paid` | paymentConfirmation uploaded **AND** paidAt + paidAmount set | Hard block: no PDF, no `paid` |
| `paid` | `posted` | postedDate field populated | — |
| `posted` | `active` | Auto-transition when `schedule.startDate` passes | — |
| `active` | `closed` | "Mark closed" button | Captures closeoutDate |
| `*` (pre-`active`) | `cancelled` | Confirmation dialog | If `paid`, dialog warns no refund post-installation |

### Auto-transitions (cron)

- `posted` → `active` when `schedule.startDate` <= today
- `active` → `expired` when `schedule.endDate` < today AND no extensions active AND status not already `closed`
- `active` → `closed` is **manual only** (MOT confirms work complete)

### Extensions vs renewals (clarified per team feedback)

| | **Extension** | **Renewal** |
|---|---|---|
| When | Phase still active, need more time | Log # already expired |
| LADOT process | Email reply to original thread, log # + new dates | Brand new request, full packet, new payment |
| Cost | **FREE** | Costs the standard posting fee again |
| Notice required | 10 days before expiration (flexible in practice) | N/A — original is dead, must restart |
| Data model | `TansatExtension` appended to existing `TansatRequest.extensions` | New `TansatRequest` with `renewalOfRequestId` linking back to expired one |
| UI | "Request Extension" button on `paid`/`posted`/`active` requests | "Renew" button on `expired` requests; opens packet builder pre-filled from prior request |
| Status path | original stays `active` | original → `expired`; new request → `draft` → ... |

---

## 5. Surfaces (every UI place TANSAT appears)

### 5.1 New Request modal (SFTC engineer)

- `impact_tansat` checkbox already exists (PR #10) — keep as informational
- When checked, expand a fluid sub-section: *"Phase plan (optional, can fill in later)"* with:
  - Phase count stepper (0–10)
  - Per-phase row: label, anticipated start, anticipated end, "needs TANSAT" toggle
  - Yellow "needs phase plan" banner if `impact_tansat=true` AND `tansatPhases` empty when MOT later opens it
- Saves to `Plan.tansatPhases` on submit

**Workflow timing note:** per Adam, SFTC engineer typically fills the phase plan *during TCP drafting*, around the same time the LOC is being prepped/submitted, so dates align. The form supports either path (request-time entry OR fill-later via the plan card phase editor).

### 5.2 Plan card → Compliance section → new TANSAT track

- Header: `🅿️ TANSAT — N requests · $X.XX paid`
- Sub-section per phase: phase number + status pill (red if past anticipated end with no request, amber if approaching, green if covered by `paid` request)
- Sub-section: `TANSAT Requests` accordion, one row per `TansatRequest`
  - Inline display: `Log # · activity · phaseNumbers chips · status pill · paid amount`
  - Click row → opens detail modal (full form, attachments, email history, extensions)
- Buttons:
  - `+ New TANSAT Request` (MOT/Admin only) — opens packet builder modal
  - `+ Add Phase` — opens phase editor (MOT/Admin only)

### 5.3 Library → new "TANSAT Log" sub-section

- Card-grid header summary: total requests, total spend, this-month spend, count overdue
- Filterable table (columns: Log #, Plan, Activity, Phases, Schedule, Amount, Status, Notes)
- Filters: status, plan, activity, paid/unpaid, date range, requester
- CSV export — same shape as Justin's xlsx for accounting compatibility
- Click row → opens detail modal (same as plan card)

### 5.4 Dashboard KPI tile

- New tile in MetricsView KPI grid: `TANSAT Spend (this month) · $X.XX`
- Click → filters table view to plans with `paidAt` in current month
- Companion red-count tile: `TANSAT Needs Attention · N` (sum of: needs-packet + payment-due + extension-window)

### 5.5 Status Report → new section

- Above "Overdue with DOT": `🅿️ TANSAT — needs attention this week`
- Lists rows where any threshold is hit
- DOT-leadership audience reads this; MOT acts on it

### 5.6 Reports → new "TANSAT Spend Trend" template

- 6-month bar chart of monthly spend (mirrors DOT Turnaround Trend pattern)
- Per-activity breakdown table
- Export to print preview / PDF

### 5.7 MOT Hub → new top-level view (MOT/Admin only)

Mirrors the CR Hub pattern Paula already uses — a dedicated workspace where MOT (Justin, Dale, Garrett) lands when they sit down to work. Action-oriented, scoped broader than TANSAT alone since MOT owns multiple workflows.

**Where it lives:** new top-level nav item `/mot-hub`, visible only to roles with `canEditMOT` permission (MOT + Admin).

**Triage cards** — each prioritized, color-coded by urgency, scannable in seconds:

| Card | Trigger | Severity |
|---|---|---|
| 🔴 TANSAT — needs packet | Phase start ≤ 14 days, no request created | Red |
| 🟡 TANSAT — awaiting invoice | Status `emailed` > 7 days, no log # received | Amber |
| 🔴 TANSAT — payment due | Invoice received, due date ≤ 3 days, not paid | Red |
| 🟡 TANSAT — extension window | Phase end ≤ 10 business days (business-day calc) | Amber |
| ⚪ TANSAT — close-out pending | Schedule end passed, status not `closed` | Gray |
| 🔴 DOT pipeline — overdue | Reuses existing `getDotOverdueStatus` from `dotOverdue.ts` | Red |
| 🟢 Today's spend | Running monthly total + last 5 paid requests | Info |

**Card layout:**
- Header: emoji + count badge + name
- Body: top 3-5 most urgent rows (LOC, plan name, key date)
- Footer: "View all N →" link → opens filtered Library view (or filtered table for DOT)

**Future-proofing:** same Hub will host new triage cards when sidewalk/crosswalk closures and I-5/UPRR encroachment workflows ship.

### 5.8 Settings → new "TANSAT" tab (Admin only)

- Reggie email + CC group editor (3 groups), each contact entry has:
  - Name + email
  - "Default include" toggle
  - **Remove** button (✕) for when contacts change roles or leave
  - "+ Add" button per group for new contacts
- Default customer name field
- From-address field (company domain, Phase 2 only)
- Threshold fields (5 numbers, all numeric inputs with defaults)
- AI extraction enable/disable toggle

---

## 6. Email integration

### 6.1 Send mechanism — two-phase delivery + bypass option

**Ships in two phases** because IT hasn't yet provisioned a company-domain email for app-automated sends. Both phases use the same template, recipient list, and form UX — only the send mechanism differs. **Plus a bypass option** so MOT staff who already have a working email template (e.g. Dale's existing process) can keep their flow and just upload the email memo.

#### Option C — Bypass: "I'll send it externally" (always available)

For MOT staff who prefer to use their existing email template / Outlook template:
- Skip the structured packet builder entirely (or use it just for the work-area fields)
- Click "I sent this externally" → upload the email memo (PDF/.eml/.msg) as `emailDocument: AttachmentRef`
- Status advances to `emailed`, audit trail = the uploaded memo
- All downstream steps (invoice intake, payment, close-out) work the same

This means we have **three email paths**, all valid:

| Path | Who uses it | Audit trail |
|---|---|---|
| Phase 1 — `mailto:` | New MOT staff using app-generated template | User's Sent folder |
| Phase 2 — automated | Post-IT, all MOT staff | In-app `mailLog` |
| Bypass | Dale (and anyone with their own template) | Uploaded memo file |

The data model accommodates all three — only the field that's populated differs (`emailMessageId` vs `emailDocument` vs both).

#### Phase 1 — `mailto:` hand-off (ships now, T-2.3a)

- "Send to Reggie" button builds a fully-rendered email (subject, body, recipients) and opens the user's default mail client via `mailto:` URL
- MOT reviews and clicks Send themselves in Outlook (or whatever client)
- From: address = whatever the user is logged into = their corporate inbox (no IT dependency)
- **Audit trail**: lives in the user's Sent folder (not in-app)
- **Attachments**: cannot be auto-attached via `mailto:` standard. UX shows a list of files (map screenshot, NV PDFs) with copy-to-clipboard download links so MOT drags them into the open compose window. Or app downloads them into a single zip the user opens before composing.
- On click, status auto-advances to `emailed` with `emailSentAt` set to click-time (best-effort timestamp; user could abandon the send, so add a "Mark as not sent" undo button on the request)

#### Phase 2 — `emailService` automated send (post-IT, T-2.3b)

- Once IT provisions the company-domain email + verifies it in the existing Firebase Trigger Email / SendGrid pipeline, swap to programmatic send
- Same UX, but on click the email actually leaves from the app (no mail client opens)
- Captures `emailMessageId`, full in-app audit trail
- Attachments auto-included from Firebase Storage
- All Phase 1 records remain valid — only the send path changes; data shape is identical

The data model (`emailSentAt`, `emailMessageId`, `ccGroupsUsed`) supports both paths. Phase 1 leaves `emailMessageId` blank.

### 6.2 Mailto vs automated diff (cheatsheet)

| Capability | Phase 1 (mailto) | Phase 2 (emailService) |
|---|---|---|
| From: address | User's corporate inbox | App-configured (post-IT) |
| Auto-send | No (MOT clicks Send) | Yes |
| Attachments | Manual drag from links | Auto-attached |
| `emailMessageId` capture | No | Yes |
| Audit trail location | User's Sent folder | Firestore `mailLog` |
| Reply routing | Goes to user's inbox | Configurable Reply-To |
| Ships when | T-2.3a (now) | T-2.3b (after IT provisions) |

### 6.2 Email template

Stored in `EmailTemplate` collection, key `tansat_packet_request`. Body:

```
Reggie,

Please {{action}} the below TANSAT request, as a part of the continued METRO SFTC project:

{{workArea.side}}side
of
{{workArea.street}}.
{{workArea.fromLimit}}
to
{{workArea.toLimit}}

{{schedule.dayPattern}}
{{schedule.startDayName}}
{{schedule.startDate}}
{{schedule.startTime}}
through
{{schedule.dayPattern}}
{{schedule.endDayName}}
{{schedule.endDate}}
{{schedule.endTime}}

[Map attached]
[Noise Variance(s) attached if applicable]

Standard email list:
{{recipientList}}
```

Variables:
- `{{action}}` = "find" for new, "find updated" for revisions
- `{{schedule.startDayName}}` = "Monday", "Tuesday", etc. (computed from date)
- `{{recipientList}}` = formatted list of addresses, grouped

#### 6.2.1 Form layout — fill-in-the-blank tables (per Dale's preference)

The Work Area and Schedule sections of the packet builder are rendered as stacked one-column tables that visually mirror the email body. Each editable token gets its own cell; static connector words ("of", "to", "through") are rendered as muted labels between cells. This keeps the form 1:1 with the email format Dale already uses.

**Work Area table**

| | |
|---|---|
| Side | `[ Southside ▾ ]` |
| | of |
| Street | `[ Oxnard St. ____ ]` |
| | |
| From Limit | `[ 300' West of Vesper Ave. ____ ]` |
| | to |
| To Limit | `[ Van Nuys Blvd ____ ]` |

**Schedule table**

| | |
|---|---|
| Day Pattern | `[ Daily ▾ ]` |
| Day | (auto: Monday) |
| Date | `[ 3/30/2026 ]` |
| Time | `[ 6:00 PM ]` |
| | through |
| Day Pattern | `[ Daily ▾ ]` |
| Day | (auto: Friday) |
| Date | `[ 4/30/2026 ]` |
| Time | `[ 6:00 AM ]` |

The "Day" row auto-computes from the date input — MOT doesn't type it, but it's visible so they can sanity-check the day-of-week before sending. Right-side preview pane shows the rendered email body updating live as MOT types, so what they see in the form ≈ what Reggie sees in their inbox.

### 6.3 Compose flow

1. MOT clicks "Send to Reggie" on a `packet_ready` request
2. Modal opens with:
   - To: Reggie's email (editable)
   - CC: 3 group toggles + per-recipient checkboxes
   - Subject: auto-filled (`TANSAT Request — Plan {{plan.loc}} — {{activity}} — Phases {{phaseNumbers}}`)
   - Body: rendered template with variables filled
   - Attachments: map screenshot + selected NV PDF(s) (read-only list)
3. MOT can edit subject/body/recipients before send
4. On send: status → `emailed`, audit fields populated, email sent via `emailService`

---

## 7. AI invoice extraction

### 7.1 Trigger

Manual button: `✨ Auto-fill from invoice PDF`. Appears on `invoice_received` modal when `invoiceAttachment` is uploaded.

### 7.2 Provider

Use Claude API (Anthropic SDK) with file upload + structured tool use. Reuse if there's an existing AI service in the app; otherwise this is the first AI integration and we add `src/services/aiService.ts` with prompt-cached system message.

**Cost guard:** cache by `invoiceAttachment.contentHash` so re-uploads don't re-extract.

### 7.3 Prompt structure (sketch)

```
System: You are extracting structured data from LADOT TANSAT invoice PDFs. Always return JSON matching the schema. If a field isn't present, return null.

User: [invoice PDF]

Required output schema:
{
  logNumber: string | null,
  invoiceAmount: number | null,
  paymentDueDate: string | null,    // ISO date; "DUE TODAY" → today's date
  customerName: string | null,
  workArea: {
    street: string | null,
    fromLimit: string | null,
    toLimit: string | null,
    side: 'N'|'S'|'E'|'W' | null    // S/S → 'S', N/S → 'N', etc.
  } | null,
  schedule: { startDate, endDate } | null,
  description: string | null
}
```

### 7.4 UX

- Each extracted field shows `✨ AI suggested: <value>` next to the form input
- Click ✨ to accept, or type over manually
- Confidence not shown numerically (LLM confidence is unreliable); failure = blank fields, MOT enters manually
- Extraction failures logged to `aiExtractionLog` collection for monitoring accuracy

### 7.5 Settings

Admin toggle: `Enable AI invoice extraction`. Default on. Can disable globally if cost spikes.

---

## 8. Notifications

All triggers in-app bell + email per project rule. Audience: MOT lead (`Garrett`) primary; plan lead CC'd where relevant. Thresholds in `tansatSettings.thresholds`.

| Trigger | Condition | Audience | Severity |
|---|---|---|---|
| Phase needs packet | Anticipated start ≤ `needsPacketDays`, no TANSAT request created | MOT | Yellow |
| Awaiting invoice | Status `emailed` > `awaitingInvoiceDays` | MOT | Amber |
| Payment due | Invoice received, `paymentDueDate` ≤ `paymentDueDays`, not paid | MOT | Red |
| Extension window | Phase end ≤ `extensionWindowBusinessDays` (business days), no extension filed | MOT + plan lead | Amber |
| Post-completion close-out | `schedule.endDate` passed, status not `closed` | MOT | Yellow |
| Meter-affected duration | Phase duration > `metersAffectedMaxDays` AND `metersAffected=true` | MOT | Pink (informational) |

---

## 9. Permissions

| Action | Roles |
|---|---|
| View TANSAT data | All authenticated users |
| Define plan phases | SFTC engineer (own plans), MOT, Admin |
| Create TANSAT request | MOT, Admin |
| Edit TANSAT request | MOT, Admin (always, even after `paid`) |
| Send email to Reggie | MOT, Admin |
| Mark paid + upload receipt | MOT, Admin |
| Cancel request | MOT, Admin (with confirmation) |
| Edit Settings (Reggie email, CC groups) | Admin only |
| Run xlsx import | Admin only |

---

## 10. Migration (one-time xlsx import)

### 10.1 Source

`TANSAT Tracking Log - Most up to date (1).xlsx`
- Sheet "Potholing": 93 rows
- Sheet "Conduit Installation": 0 rows (empty placeholder)
- Total spend in source: $29,513.84

### 10.2 Column mapping

| Excel column | Maps to | Transform |
|---|---|---|
| Log # | `logNumber` | trim, string |
| Traffic Plan/Location | `importedPlanText` (always); `planId` (only if exact match) | **No fuzzy matching, no reconciliation UI on import**. Preserve raw text in `importedPlanText` so it's visible in Library. MOT can later open any unlinked row and link to the appropriate plan via a dropdown. |
| Activity | `activity` | normalize via vocab map (e.g. `Ultility Support` → `utility_support`); unknown → `other` + `activityOther` |
| Phases | `phaseNumbers[]` | parse `"3,4,5"` / `"1-9"` / `"1 & 2"` / `"All"` (= every phase on the plan) |
| Dates | `schedule.startDate`, `schedule.endDate` | parse `"12/9/23-12/23/23"` → ISO |
| Money | `paidAmount` | strip `$` and commas → number |
| Notes | `notes` | direct |

Sheet name as activity hint when Activity column blank.

### 10.2.1 Library row display for unlinked imports

- **Linked**: shows linked plan as clickable chip (LOC + corridor name)
- **Unlinked**: shows `importedPlanText` in muted gray + small `🔗 Link` button → opens plan picker
- Filter: "Unlinked imports" toggle in the Library so MOT can batch-link when ready

### 10.3 Default values for imported rows

- `status` = `closed` (historical, paid)
- `paidAt` = end of date range
- `createdBy` = `import:legacy`
- `phaseNumbers` = `[]` if `Phases = "All"` and plan unresolved (with `notes` carrying original notation)

### 10.4 Admin tool UX

Settings → TANSAT tab → "Import from xlsx" button:
1. File upload (xlsx)
2. Preview screen: row count, sample rows, parse warnings
3. Confirm → import runs in batches with progress bar (no per-row reconciliation step)
4. Each row imported as `TansatRequest` with `importedPlanText` always set, `planId` only if exact match
5. Audit entry per imported request (`importedFrom: "TANSAT Tracking Log xlsx"`)
6. After import, MOT can browse the Library and link rows to plans at their own pace via the `🔗 Link` button — never blocks import

---

## 11. Edge cases

### Cancellation
- Pre-`paid`: just status → `cancelled`, no money tracked
- Post-`paid`, pre-`posted`: confirm dialog allows refund-tracking note (rare, LADOT may issue $0 invoice on date change)
- Post-`posted`: hard warning *"Signs already installed. No refund possible."* — proceed only with explicit confirm

### Cancelled phases counted in spend
- Yes — money was actually spent. Mark visually (`cancelled` pill) so reports tell the truth.

### Refund / re-issue
- Justin's data has cases like "*Paid invoice, changed dates and were sent a new invoice of $0*". Workflow:
  1. New request status `revised` (not new `TansatRequest` — same row)
  2. Reggie issues new invoice with new Log # — `logNumber` updated, `invoiceAmount` updated (often $0)
  3. Notes captures the change
  4. `paidAmount` history preserved via audit log entries

### Posting calendar quirk
- *"Target date Sun/Mon/Tue → posted previous Friday"*
- Helper: `computeActualPostingDate(startDate)` — exposed on detail modal as "Actual posting: {{date}}"

### Bureau of Parking referral
- When `metersAffected=true` AND duration > 30 days, show pink banner on form with link to LADOT Bureau of Parking Management

---

## 12. Out of scope (explicitly NOT building)

- Embedded map drawing tool (manual upload only)
- Auto-payment via Paymentus API (manual MOT action)
- Direct integration with LADOT systems (email-based only)
- SMS notifications (in-app + email only)
- Mobile-specific UI (responsive desktop only)
- Public-facing TANSAT request portal for SFTC engineers (internal tool only)

---

## 13. Ticket breakdown

Six PRs, ~15 tickets total. Order matches dependency.

### PR 1 — Foundations (4 tickets)

**T-1.1 Settings: TANSAT tab**
- New `Settings → TANSAT` tab (Admin only)
- Reggie email field, CC group editor (3 groups), default customer name, from-address, 5 thresholds
- Persists to `AppConfig.tansatSettings`
- Adds to existing Settings nav

**T-1.2 Plan-level phase definition**
- Add `tansatPhases` to `Plan` type + Firestore schema
- New Request modal: when `impact_tansat=true`, expand phase editor
- Plan card: editable phase list (MOT/Admin)
- Yellow banner if `impact_tansat=true` and phases empty

**T-1.3 TansatRequest data model + service**
- New collection `tansatRequests/*` with security rules
- New `src/services/tansatService.ts` with CRUD, real-time subscription, audit logging
- TypeScript types: `TansatRequest`, `TansatExtension`, `TansatStatus`, `TansatActivity`
- Activity vocab constant in `constants.ts`

**T-1.4 Core util: `tansatSpend.ts`**
- Same shape as `dotOverdue.ts`
- Functions: `getMonthlySpend(plans, requests, month)`, `getRequestsNeedingAttention(plans, requests, settings, now)`, `getRequestsByStatus`, `getActualPostingDate(startDate)`, `getBusinessDaysUntil(date, now)`
- Unit tests for date parsing, business-day counting, posting calendar

### PR 2 — Request creation + email send (3 tickets)

**T-2.1 Plan card: TANSAT track section**
- New section in compliance area (matches PHE/NV/CD pattern)
- Phase status pills + accordion of TANSAT requests
- `+ New TANSAT Request` button → opens packet builder

**T-2.2 Packet builder modal**
- Tabbed form: Activity & Phases → Work Area → Schedule → Map & NVs → Review
- **Work Area + Schedule rendered as "fill-in-the-blank" stacked tables** that visually match Dale's existing email format (each token in its own cell, static connector words like "of" / "to" / "through" rendered as muted labels). What you type IS what Reggie sees — no translation step. See section 6.2 for layout.
- Multi-select for `phaseNumbers` (chips with phase labels)
- Multi-select for NVs (auto-pre-selected by time-window overlap)
- Live preview pane shows the rendered email body updating as MOT types
- Validation: hard block on advance-to-`emailed` if NV missing when plan has active noise compliance
- Save as draft any time

**T-2.3a Email composer + `mailto:` hand-off (ships now)**
- Compose modal with To/CC/Subject/Body, pre-fills from `tansatSettings`
- "Send to Reggie" → builds `mailto:` URL with recipients + subject + URL-encoded body, opens default mail client
- Attachment panel: list of files (map + NVs) with download buttons + "copy all to zip" helper so MOT drags them into the compose window
- On click: status → `emailed`, `emailSentAt` = click time, `emailMessageId` blank
- "Mark as not sent" undo button on the request detail (reverts status)
- New `EmailTemplate` row: `tansat_packet_request`

**T-2.3b Swap to `emailService` automated send (ships after IT provisions company-domain email)**
- Replace `mailto:` URL with `sendEmail()` call to existing `emailService`
- Auto-attach files from Firebase Storage
- Capture `emailMessageId`, write `mailLog` entry
- Same UX, same template, same data shape — only the send path changes
- All Phase 1 records remain valid

### PR 3 — Invoice + payment + AI extraction (3 tickets)

**T-3.1 Invoice intake**
- "Log invoice" action on `emailed` request → form for Log #, Amount, Due Date, Customer Name
- Upload invoice PDF (`invoiceAttachment`)
- Warn (no block) on duplicate Log # across all requests
- Status → `invoice_received`

**T-3.2 AI invoice extraction**
- Reuses existing **Gemini 2.5 Flash** integration pattern (mirrors `scanDrivewayLetterWithGemini` in `src/services/drivewayLetterService.ts`)
- Same `geminiApiKey` in `settings/aiConfig` — no new SDK or credentials
- New function `scanTansatInvoiceWithGemini(requestId, file)` in `src/services/tansatService.ts`
- Button on invoice form: `✨ Auto-fill from invoice PDF`
- Hash-based cache to skip re-extraction of same file
- Settings toggle in TANSAT tab to disable globally (still respects global key in System tab)
- Failures logged with `scanError` field on the request (same pattern as driveway letter scan)

**T-3.3 Payment recording**
- "Mark paid" action on `invoice_received` request
- Required: paidAt date, paidAmount, paymentConfirmation PDF
- Hard block: no PDF → no `paid` status
- Capture `paidBy` from current user
- Status → `paid`

### PR 4 — Extensions (1 ticket)

**T-4.1 Extension workflow**
- "Request extension" button on `paid`/`posted`/`active` request
- Form: new end date, reason, additional cost (optional)
- Sends new email via `tansat_extension_request` template
- Tracks `extensions[]` array on parent request
- Each extension has own status workflow (requested → approved → paid)
- Surfaces in plan card and library views

### PR 5 — Library + dashboard + reports (4 tickets)

**T-5.1 Library: TANSAT Log section**
- New sub-section in Library view
- Card-grid header (summary stats)
- Filterable table with all the columns
- Click row → detail modal
- CSV export matching Justin's xlsx column order

**T-5.2 Dashboard KPI tile**
- New "TANSAT Spend (this month)" tile in MetricsView KPI grid
- Companion "TANSAT Needs Attention" tile (red count)
- Click → filters table or jumps to library

**T-5.3 Status Report section**
- New "🅿️ TANSAT — needs attention this week" section above "Overdue with DOT"
- Same table style; uses `getRequestsNeedingAttention` util

**T-5.4 Reports: TANSAT Spend Trend**
- New report template registered in `REPORT_TEMPLATES`
- 6-month bar chart + per-activity breakdown
- Mirrors DotTurnaroundReport pattern

**T-5.5 MOT Hub view (NEW)**
- New top-level view at `/mot-hub`, mirrors `CRHubView.tsx` structure
- Permission-gated to MOT + Admin (new `canEditMOT` permission)
- 7 triage cards (per Section 5.7): needs packet, awaiting invoice, payment due, extension window, close-out, DOT overdue, today's spend
- Each card pulls from existing utils (`tansatSpend.ts`, `dotOverdue.ts`) — no new data fetches
- "View all" links route to filtered Library / Table views with the right filter pre-applied
- Becomes Justin/Dale's daily landing page once shipped

### PR 6 — Notifications + xlsx import (2 tickets)

**T-6.1 Notification triggers**
- 6 triggers wired to existing notification service
- In-app bell entries + email
- Threshold lookups from `tansatSettings.thresholds`
- Settings UI for muting individual triggers per user

**T-6.2 xlsx import tool**
- New "Import legacy log" Admin action in Settings → TANSAT tab
- Upload + preview + reconciliation UI
- Activity vocab map (typo cleanup)
- Phase notation parser (`"3,4,5"`, `"1-9"`, `"All"`)
- Batch import with progress bar
- Each row gets `importedFrom: "TANSAT Tracking Log xlsx"` flag
- Idempotent: re-running matches by Log # and skips dupes

---

## 14. Acceptance criteria (top-level)

- [ ] SFTC engineer can flag `impact_tansat` and define fluid phases on new request
- [ ] MOT can create N TANSAT requests per plan, each covering 1+ phases
- [ ] Email to Reggie sends through `emailService` with map + NV attachments, fully audited
- [ ] Invoice PDF upload triggers AI extraction; MOT confirms or overrides
- [ ] Payment confirmation upload required to mark paid
- [ ] Extensions trackable per request with separate spend rollup
- [ ] Dashboard KPI shows current-month TANSAT spend
- [ ] Status report surfaces all needs-attention items
- [ ] Library section provides full searchable log + CSV export
- [ ] All 6 notification triggers fire as configured
- [ ] Justin's xlsx imports cleanly with manual reconciliation for unmatched plans
- [ ] All new fields/UI match existing design conventions

---

## 15. Open items (ship-blocking, non-design)

- [x] ~~Confirm AI provider~~ — **Gemini 2.5 Flash** (already used in driveway letter / driveway notice / variance letter / CR issue services). T-3.2 reuses pattern from `drivewayLetterService.ts`.
- [x] ~~Confirm email from-address~~ — **Two-phase delivery confirmed.** Phase 1 (`mailto:` hand-off, T-2.3a) ships immediately and uses MOT's corporate inbox. Phase 2 (`emailService` automated, T-2.3b) ships when IT provisions company-domain email.
- [x] ~~Cancelled-request accounting~~ — **confirmed**: include in Spend KPI with visual marker (cancelled pill in tables, separate count callout on dashboard). Money was actually spent; reports tell the truth.
- [x] ~~Lifecycle: extension vs renewal~~ — **resolved per team:** extension = free email reply (same log #), renewal = full new request (new payment) when log # already expired. Data model + state machine updated.
- [x] ~~SFTC phase timing~~ — **resolved per Adam:** filled during TCP drafting alongside LOC prep. Form supports request-time AND fill-later.
- [x] ~~Settings: remove contact~~ — **resolved per Adam:** explicit remove button per contact entry, plus add button per group.
- [ ] **IT request (parallel track):** company-domain email address for app-automated sends. Unblocks T-2.3b.
- [x] ~~Dale's email workflow preference~~ — **resolved per user:** Dale uses the structured packet builder. Form layout for Work Area + Schedule mirrors his existing email format (stacked one-column tables) so what he types is 1:1 with what gets sent. See 6.2.1. Bypass option remains available for edge cases but is not the recommended path.

### 15.1 Team feedback log (this revision)

| Person | Topic | Resolution |
|---|---|---|
| Adam | Lifecycle: extension vs renewal | Distinguished in data model + state machine (Section 4) |
| Adam | SFTC engineer fill timing | Documented in 5.1 — fill during TCP drafting, request-time or later both supported |
| Adam | Email — defer to Dale on workflow choice | Section 6.1 now offers three paths (Phase 1 mailto, Phase 2 automated, Bypass for own email template) |
| Adam | Settings — Remove button for contacts | 5.7 explicit |
| Dale | Email workflow preference | **Pending** — not a blocker, all three paths supported |
| Dale | Anything missed on extensions | **Pending Dale's review** of the extension/renewal split |
